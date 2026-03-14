/**
 * ComputerUseLoop — Google Native Screen Control agent loop.
 *
 * Alternative to ActionLoop. When the user's model supports Gemini's `computer_use`
 * tool, this module runs instead of the structured-JSON action loop.
 *
 * Flow:
 * 1. Take screenshot → send to Gemini with `computer_use` tool enabled
 * 2. Gemini returns `function_call` parts (click_at, type_text_at, etc.)
 * 3. Map function_calls to AgentAction via computerUseMapper
 * 4. Execute via MotorService (reuses existing infrastructure)
 * 5. Take verification screenshot → send back as function_response
 * 6. Loop until Gemini returns no function_calls (= task done)
 *
 * Safety: `safety_decision: require_confirmation` triggers PermissionIsland.
 */

import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { screen as electronScreen } from 'electron'

import type { GeminiProvider } from '@electron/services/intelligence/providers/GeminiProvider'
import { IntelligenceService } from '@electron/services/intelligence/IntelligenceService'
import { planSteps, createStepTasks, activateStep, markStep, emitSteps } from './TaskPlanner'
import type { StepTask } from './TaskPlanner'
import { createPartFromFunctionResponse, createFunctionResponsePartFromBase64 } from '@google/genai'
import { PromptLoader } from '@electron/services/intelligence/PromptLoader'
import { VisionService } from '@electron/services/vision/VisionService'
import { MotorService } from '@electron/services/motor/MotorService'

import { mainEventBus } from '@electron/utils/eventBus'
import { formatLLMError } from '@electron/utils/llmErrors'
import { createLogger } from '@electron/utils/logger'
import { getConfig } from '@electron/utils/config'
import { blurForAction, restoreAfterAction } from '@electron/WindowManager'
import { sleep } from '@electron/utils/other'
import { AgentStateMachine } from './AgentState'
import { streamFinalResponse } from './ResponseStreamer'
import { mapFunctionCallToAction, extractSafetyDecision } from './computerUseMapper'
import type { LLMMessage } from '@electron/services/intelligence/providers/BaseLLMProvider'
import type { AgentProfile } from '@electron/services/persona/AgentProfile'
import type { FactExtractor } from './FactExtractor'
import type { SessionLogger } from '@electron/utils/sessionLogger'

const log = createLogger('ComputerUseLoop')

/** Max recent execution entries for logging */
const MAX_BRANCH_ENTRIES = 7

/** A single Gemini Content entry (using raw format for computer_use API) */
interface GeminiContent {
  role: string
  parts: Array<Record<string, unknown>>
}

/**
 * Run the computer-use agent loop using Gemini's native screen control.
 *
 * @param command — the user's text command
 * @param history — prior conversation messages (for context, not sent directly)
 * @param geminiProvider — GeminiProvider instance configured with computer_use model
 * @param promptLoader — prompt template loader
 * @param stateMachine — agent state machine for UI transitions
 * @param persona — active agent persona
 * @param visionService — screen capture service
 * @param motorService — OS interaction service
 * @param factExtractor — optional fact extraction
 * @returns Updated conversation history
 */
export async function runComputerUseLoop(
  command: string,
  history: LLMMessage[],
  geminiProvider: GeminiProvider,
  intelligence: IntelligenceService,
  promptLoader: PromptLoader,
  stateMachine: AgentStateMachine,
  persona: AgentProfile,
  visionService: VisionService,
  motorService: MotorService,
  factExtractor?: FactExtractor,
  sessionLogger?: SessionLogger,
): Promise<LLMMessage[]> {

  const userFacts = factExtractor
    ? factExtractor.getFactsText(persona.id)
    : 'No known facts about the user yet.'

  // ── Build system prompt ──
  const resolution = visionService.getResolutionString()
  const baseSystemPrompt = promptLoader.load('system', {
    os: `${os.platform()} ${os.release()}`,
    resolution,
    time: new Date().toLocaleString(),
    persona_name: persona.name,
    personality: persona.personality,
    user_facts: userFacts,
  }, persona.id)

  // Append Computer Use-specific instruction for concise step labels
  const cuAddon = promptLoader.load('computer_use', {}, persona.id)
  const systemPrompt = baseSystemPrompt + '\n\n' + cuAddon

  // ── Screen info for coordinate denormalization ──
  const screenInfo = visionService.getScreenInfo()

  // ── Multi-monitor info ──
  const displayInfo = buildDisplayInfo()

  // ── Tell MotorService about screen dimensions ──
  // Computer Use API returns 0-999 coords, we handle denormalization in the mapper
  // but MotorService still needs to know about screen vs screenshot for its own scaling
  motorService.setDimensions(
    { width: screenInfo.width, height: screenInfo.height },
    { width: screenInfo.width, height: screenInfo.height }, // 1:1 — mapper already denormalizes
  )

  // ── Take initial screenshot ──
  const initialScreenshot = await visionService.takeScreenshot()

  // ── Build Gemini-native contents ──
  const contents: GeminiContent[] = [
    {
      role: 'user',
      parts: [
        { text: `${command}\n\nCurrent OS: ${os.platform()} ${os.release()}\nScreen resolution: ${resolution}\nDisplays:\n${displayInfo}` },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: initialScreenshot.toString('base64'),
          },
        },
      ],
    },
  ]

  // ── Loop state ──
  const executionBranch: string[] = []

  // ── Pre-plan: break command into high-level steps for Task Queue ──
  const steps = await planSteps(command, history, intelligence)
  const stepTasks: StepTask[] = createStepTasks(steps)
  sessionLogger?.step(`Task plan: ${steps.length} step(s)`)

  stateMachine.transition('LLM_RESPONDING')

  const { maxIterations, maxConsecutiveFailures } = getConfig().agent
  let iteration = 0
  let consecutiveFailures = 0
  let fullResponse = ''

  // ── Main loop ──
  while (iteration < maxIterations && consecutiveFailures < maxConsecutiveFailures) {
    iteration++
    const progress = Math.min(iteration * 15, 95)

    log.info(`Iteration ${iteration} (failures: ${consecutiveFailures}/${maxConsecutiveFailures})`)

    try {
      // ── Call Gemini with computer_use tool ──
      // Exclude wait_5_seconds — Atlas has its own postActionDelay, browser-style waits are unnecessary
      const stopGemini = sessionLogger?.startTimer(`Iteration ${iteration} Gemini call`)
      const response = await geminiProvider.chatWithComputerUse(contents, systemPrompt, ['wait_5_seconds'])
      stopGemini?.()

      const candidate = response.candidates?.[0]
      if (!candidate?.content?.parts) {
        log.warn('Empty response from computer_use model — retaking screenshot')
        consecutiveFailures++
        // Take a fresh screenshot and update the first content entry so the next
        // attempt has new visual data instead of retrying the exact same request.
        await sleep(500)
        const freshScreenshot = await visionService.takeScreenshot()
        contents[0] = {
          role: 'user',
          parts: [
            { text: (contents[0].parts as Array<{ text?: string }>)[0]?.text ?? command },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: freshScreenshot.toString('base64'),
              },
            },
          ],
        }
        continue
      }

      // Append model response — filter to only text + functionCall parts
      // (exclude thought/internal parts that can't be echoed back)
      const filteredParts = (candidate.content.parts as Array<Record<string, unknown>>)
        .filter(p => p.text !== undefined || p.functionCall !== undefined)
      contents.push({
        role: 'model',
        parts: filteredParts,
      })

      // ── Extract function calls and text ──
      const functionCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }> = []
      const textParts: string[] = []

      for (const part of candidate.content.parts) {
        if (part.functionCall) {
          const fc = part.functionCall as { name?: string; args?: Record<string, unknown>; id?: string }
          if (fc.name) {
            functionCalls.push({
              name: fc.name,
              args: fc.args ?? {},
              id: fc.id,
            })
          }
        }
        if (part.text) {
          textParts.push(part.text as string)
        }
      }

      // Log model reasoning
      if (textParts.length > 0) {
        const thinking = textParts.join(' ')
        log.debug(`Model thinking: ${thinking.slice(0, 200)}`)
      }

      // ── No function calls → model is done ──
      if (functionCalls.length === 0) {
        fullResponse = textParts.join('\n')
        log.info('Computer Use model signaled done (no function calls)')
        sessionLogger?.step('Model signaled done (no function calls)')
        break
      }

      // ── Execute each function call ──
      const functionResponses: Array<Record<string, unknown>> = []
      log.debug(`Processing ${functionCalls.length} function call(s): ${functionCalls.map(fc => `${fc.name}(id=${fc.id})`).join(', ')}`)
      sessionLogger?.step(`Function calls: ${functionCalls.map(fc => fc.name).join(', ')}`)

      for (const fc of functionCalls) {
        // Use model's thinking as step label, cleaned of conversational filler
        const modelThinking = textParts.join(' ').trim()
        const stepLabel = modelThinking
          ? cleanStepLabel(modelThinking)
          : buildStepLabel(fc.name, fc.args)
        const currentStepId = activateStep(stepTasks, stepLabel)

        // ── Check safety_decision ──
        const safety = extractSafetyDecision(fc.args)
        if (safety && safety.decision === 'require_confirmation') {
          const permId = randomUUID()
          const allowed = await requestPermission(permId, fc.name, safety.explanation, stateMachine)

          if (!allowed) {
            log.info(`Action denied by user: ${fc.name}`)
            fullResponse = 'Action cancelled by user.'
            markStep(stepTasks, currentStepId, 'failed')
            stateMachine.transition('USER_CANCEL')

            // Send denial as function_response
            functionResponses.push(
              createPartFromFunctionResponse(
                fc.id ?? '',
                fc.name,
                { url: 'desktop://screen', error: 'Action denied by user' },
              ) as unknown as Record<string, unknown>,
            )
            continue
          }
          stateMachine.transition('USER_CONFIRM')
        }

        // ── Map to AgentAction ──
        const action = mapFunctionCallToAction(fc.name, fc.args, {
          width: screenInfo.width,
          height: screenInfo.height,
        })

        if (!action) {
          log.warn(`Unmapped function: ${fc.name}`)
          markStep(stepTasks, currentStepId, 'failed')
          functionResponses.push(
            createPartFromFunctionResponse(
              fc.id ?? '',
              fc.name,
              { url: 'desktop://screen', error: `Unsupported action: ${fc.name}` },
            ) as unknown as Record<string, unknown>,
          )
          continue
        }

        // Emit to ActionIsland — use model thinking (stepLabel), not raw mapper reason
        mainEventBus.emit('agent:action', {
          label: stepLabel,
          progress,
        })

        await sleep(getConfig().agent.preActionDelay)

        // ── Execute action ──
        blurForAction()
        // Give Windows time to transfer focus from Atlas to the target app.
        // Without this delay, keypresses may go to Atlas instead of the target window.
        await sleep(150)

        const stopAction = sessionLogger?.startTimer(`Action: ${fc.name}`)

        // Special handling for type_text_at: click first, then type
        if (fc.name === 'type_text_at') {
          // Click at position
          await motorService.executeAction({
            action: 'click',
            coords: action.coords,
            reason: 'Click before typing',
            risk: 'low',
          })
          await sleep(100)

          // Select all text in the field before typing, so existing content is replaced.
          motorService.keyboard.keyPress('end')
          await sleep(30)
          motorService.keyboard.hotkey('shift', 'home')
          await sleep(50)

          // Type the text using native key events (works with all UI elements)
          if (action.text) {
            await motorService.keyboard.typeNative(action.text)

            // Press enter if needed
            if (action.key === 'enter') {
              await sleep(50)
              await motorService.executeAction({
                action: 'keyPress',
                key: 'enter',
                reason: 'Press Enter after typing',
                risk: 'low',
              })
            }

            restoreAfterAction()
            consecutiveFailures = 0
            executionBranch.push(`[${iteration}] OK: type_text_at "${action.text.slice(0, 40)}"`)
            markStep(stepTasks, currentStepId, 'done')
            stopAction?.()
          }
        } else if (fc.name === 'hover_at') {
          // Move mouse without clicking
          await motorService.mouse.moveTo(action.coords![0], action.coords![1])
          restoreAfterAction()
          consecutiveFailures = 0
          executionBranch.push(`[${iteration}] OK: hover_at (${action.coords![0]}, ${action.coords![1]})`)
          markStep(stepTasks, currentStepId, 'done')
          stopAction?.()
        } else {
          // Standard action execution
          const result = await motorService.executeAction(action)
          restoreAfterAction()

          if (!result.success) {
            consecutiveFailures++
            executionBranch.push(`[${iteration}] FAILED: ${fc.name} — ${result.error}`)
            markStep(stepTasks, currentStepId, 'failed')
            stopAction?.()
          } else {
            consecutiveFailures = 0
            const output = result.output ? ` → ${result.output.slice(0, 200)}` : ''
            executionBranch.push(`[${iteration}] OK: ${fc.name}${output}`)
            markStep(stepTasks, currentStepId, 'done')
            stopAction?.()
          }
        }

        // Take screenshot after action for function_response
        // Computer Use API requires image/png in function responses
        await sleep(getConfig().agent.postActionDelay)
        const stopScreenshot = sessionLogger?.startTimer('Post-action screenshot')
        const postScreenshot = await visionService.takeScreenshot('png')
        stopScreenshot?.()

        functionResponses.push(
          createPartFromFunctionResponse(
            fc.id ?? '',
            fc.name,
            { url: 'desktop://screen', output: 'success' },
            [createFunctionResponsePartFromBase64(
              postScreenshot.toString('base64'),
              'image/png',
            )],
          ) as unknown as Record<string, unknown>,
        )
      }

      // ── Send function responses back to model ──
      if (functionResponses.length > 0) {
        log.debug(`Sending ${functionResponses.length} function response(s) for ${functionCalls.length} call(s)`)
        contents.push({
          role: 'user',
          parts: functionResponses,
        })
      }
    } catch (err) {
      const message = formatLLMError(err)
      log.error('Computer Use loop error:', err)
      mainEventBus.emit('agent:warning', {
        id: randomUUID(),
        message,
        dismissable: true,
      })
      break
    }
  }

  // ── Cleanup ──
  mainEventBus.emit('agent:action', null)
  emitSteps(stepTasks)

  // Emit action log for history
  if (executionBranch.length > 0) {
    mainEventBus.emit('agent:action-log', {
      personaId: persona.id,
      command,
      timestamp: new Date().toISOString(),
      entries: executionBranch,
    })
  }

  // Warn if loop ended due to limits
  if (iteration >= maxIterations) {
    log.warn('Max iterations reached')
    mainEventBus.emit('agent:warning', {
      id: randomUUID(),
      message: `Maximum action steps reached (${maxIterations}). The task may be incomplete.`,
    })
  }

  if (consecutiveFailures >= maxConsecutiveFailures) {
    log.warn(`Aborting: ${maxConsecutiveFailures} consecutive failures`)
    mainEventBus.emit('agent:warning', {
      id: randomUUID(),
      message: `Too many consecutive failures (${maxConsecutiveFailures}). The task may be incomplete.`,
    })
  }

  sessionLogger?.step(`Total iterations: ${iteration}`)

  // Stream final response to UI
  if (fullResponse.trim()) {
    const stopStream = sessionLogger?.startTimer('Response streaming')
    await streamFinalResponse(fullResponse, persona.id, factExtractor)
    stopStream?.()
  }

  stateMachine.transition('TASK_DONE')

  return [
    ...history,
    { role: 'user', text: command },
    { role: 'model', text: fullResponse || `Completed ${iteration} action(s) via Computer Use: ${executionBranch.join(', ')}` },
  ]
}

// ═══════════════════════════════════════════════════════════════════
//  Private Helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Extract a concise step label from the model's thinking text.
 *
 * Takes the first sentence (before ". " or newline), strips trailing
 * punctuation, and enforces a length limit. Language-agnostic — the model
 * is instructed via system prompt to write concise action descriptions.
 */
function cleanStepLabel(text: string): string {
  // Take only the first sentence
  let label = text.split(/\.\s|\n/)[0] ?? text

  // Remove trailing dots
  label = label.replace(/\.+$/, '').trim()

  // Enforce length limit
  if (label.length > 60) {
    label = label.slice(0, 57) + '…'
  }

  return label
}

/**
 * Build a human-readable step label for the Task Queue UI.
 *
 * Converts raw Computer Use function names + args into friendly descriptions:
 *   click_at       → "Click (500, 300)"
 *   type_text_at   → 'Type "search query"'
 *   key_combination→ "Keys Ctrl+A"
 *   scroll_document→ "Scroll down"
 */
function buildStepLabel(name: string, args: Record<string, unknown>): string {
  const x = args.x as number | undefined
  const y = args.y as number | undefined
  const coordStr = x !== undefined && y !== undefined ? ` (${x}, ${y})` : ''

  switch (name) {
    case 'click_at':
      return `Click${coordStr}`
    case 'hover_at':
      return `Hover${coordStr}`
    case 'type_text_at': {
      const text = String(args.text ?? '').slice(0, 30)
      return `Type "${text}"${text.length >= 30 ? '…' : ''}`
    }
    case 'key_combination':
      return `Keys ${args.keys ?? ''}`
    case 'scroll_document':
    case 'scroll_at':
      return `Scroll ${args.direction ?? 'down'}`
    case 'drag_and_drop':
      return `Drag${coordStr}`
    case 'open_web_browser':
      return 'Open browser'
    case 'navigate':
      return `Navigate to ${String(args.url ?? '').slice(0, 40)}`
    case 'go_back':
      return 'Go back'
    case 'go_forward':
      return 'Go forward'
    case 'search':
      return 'Search'
    default:
      return name.replace(/_/g, ' ')
  }
}

/**
 * Build multi-monitor display info string for LLM context.
 */
function buildDisplayInfo(): string {
  const allDisplays = electronScreen.getAllDisplays()
  const cursorPoint = electronScreen.getCursorScreenPoint()
  const activeDisplay = electronScreen.getDisplayNearestPoint(cursorPoint)

  return allDisplays.map((d, i) => {
    const isActive = d.id === activeDisplay.id
    return `Monitor ${i + 1}${isActive ? ' (ACTIVE)' : ''}: ${d.size.width}x${d.size.height}, bounds: (${d.bounds.x},${d.bounds.y})`
  }).join('\n')
}

/**
 * Request user permission for a risky action.
 * Reuses the same PermissionIsland pattern as ActionLoop.
 */
function requestPermission(
  id: string,
  actionName: string,
  explanation: string,
  stateMachine: AgentStateMachine,
): Promise<boolean> {
  return new Promise((resolve) => {
    const handler = (payload: { id: string; allowed: boolean }) => {
      if (payload.id === id) {
        mainEventBus.off('agent:permission-response', handler)
        resolve(payload.allowed)
      }
    }

    mainEventBus.on('agent:permission-response', handler)
    stateMachine.transition('HIGH_RISK')

    mainEventBus.emit('agent:permission', {
      id,
      message: `${actionName}: ${explanation}`,
      riskLevel: 'high' as const,
    })

    log.info(`Permission requested: ${id} — ${actionName}: ${explanation}`)
  })
}
