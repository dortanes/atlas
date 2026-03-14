/**
 * ActionLoop — the act → observe → decide cycle.
 *
 * When a user command requires screen interaction, this module
 * runs an iterative loop:
 *
 * 1. Send command + screenshot to LLM
 * 2. LLM responds with a JSON action (`click`, `type`, `runCommand`, etc.)
 * 3. Execute the action via MotorService
 * 4. Take a verification screenshot and loop back to step 2
 * 5. LLM sends `{ "action": "done", "text": "..." }` when finished
 *
 * Safety: risky actions are self-assessed by the LLM via the `risk` field
 * and require user permission via PermissionIsland.
 *
 * All inline LLM prompts are loaded from `.md` templates via PromptLoader
 * to keep this module free of hardcoded prompt text.
 */

import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { screen as electronScreen } from 'electron'
import { IntelligenceService } from '@electron/services/intelligence/IntelligenceService'
import { PromptLoader } from '@electron/services/intelligence/PromptLoader'
import type { LLMMessage } from '@electron/services/intelligence/providers/BaseLLMProvider'
import { VisionService } from '@electron/services/vision/VisionService'
import { MotorService } from '@electron/services/motor/MotorService'
import { SearchService } from '@electron/services/search/SearchService'

import { mainEventBus } from '@electron/utils/eventBus'
import { formatLLMError } from '@electron/utils/llmErrors'
import { createLogger } from '@electron/utils/logger'
import { getConfig } from '@electron/utils/config'
import { blurForAction, restoreAfterAction } from '@electron/WindowManager'
import { sleep } from '@electron/utils/other'
import { parseAction } from './parseAction'
import { streamFinalResponse } from './ResponseStreamer'
import { AgentStateMachine } from './AgentState'
import { AgentActionSchema } from './schemas'
import { planSteps, createStepTasks, activateStep, markStep, emitSteps } from './TaskPlanner'
import type { StepTask } from './TaskPlanner'
import * as z from 'zod'
import type { AgentProfile } from '@electron/services/persona/AgentProfile'
import type { AgentAction } from './types'
import type { FactExtractor } from './FactExtractor'
import type { SessionLogger } from '@electron/utils/sessionLogger'

const log = createLogger('ActionLoop')

/** Max number of recent execution branch entries to include in LLM context */
const MAX_BRANCH_ENTRIES = 7

/**
 * Run the full action loop for a command that needs screen interaction.
 *
 * @param command — the user's text command
 * @param history — prior conversation messages
 * @param intelligence — LLM service
 * @param promptLoader — prompt template loader
 * @param stateMachine — agent state machine for UI transitions
 * @param persona — active agent persona
 * @param classifierService — for action risk assessment
 * @param visionService — screen capture service
 * @param motorService — OS interaction service
 * @param factExtractor — optional fact extraction
 * @returns Updated conversation history
 */
export async function runActionLoop(
  command: string,
  history: LLMMessage[],
  intelligence: IntelligenceService,
  promptLoader: PromptLoader,
  stateMachine: AgentStateMachine,
  persona: AgentProfile,
  visionService: VisionService,
  motorService: MotorService,
  factExtractor?: FactExtractor,
  searchService?: SearchService,
  sessionLogger?: SessionLogger,
): Promise<LLMMessage[]> {
  const userFacts = factExtractor
    ? factExtractor.getFactsText(persona.id)
    : 'No known facts about the user yet.'

  const resolution = visionService.getResolutionString()

  // ── Build system prompt for native systemInstruction ──
  const systemPrompt = promptLoader.load('system', {
    os: `${os.platform()} ${os.release()}`,
    resolution,
    time: new Date().toLocaleString(),
    persona_name: persona.name,
    personality: persona.personality,
    user_facts: userFacts,
  }, persona.id)

  // ── Compute screenshot dimensions for coordinate rescaling ──
  const screenInfo = visionService.getScreenInfo()
  const screenshotWidth = Math.min(screenInfo.width, getConfig().agent.screenshotMaxWidth)
  const screenshotHeight = Math.round(screenInfo.height * (screenshotWidth / screenInfo.width))
  const screenshotResolution = `${screenshotWidth}x${screenshotHeight}`

  // ── Multi-monitor info for LLM context ──
  const displayInfo = buildDisplayInfo()

  // Tell MotorService about dimensions for coordinate rescaling
  motorService.setDimensions(
    { width: screenInfo.width, height: screenInfo.height },
    { width: screenshotWidth, height: screenshotHeight },
  )

  // ── Action instructions (loaded from template) ──
  const actionPrompt = promptLoader.load('action', {
    resolution: screenshotResolution,
    displays: displayInfo,
  }, persona.id)

  // Take initial screenshot so the FIRST iteration has visual context
  // Without this, LLM guesses coordinates in full-screen space instead
  // of screenshot space, causing out-of-bounds clicks after MotorService scaling.
  let screenshot: Buffer | null = await visionService.takeScreenshot()
  const executionBranch: string[] = []

  // NO fake user/model system prompt pair — use native systemInstruction instead
  // Build the initial user message with action prompt, plan, and execution context
  let userPrompt = `${actionPrompt}\n\nUser command: ${command}`

  // Include previous actions from conversation history so LLM knows what's already open
  const prevActions = history.filter(m => m.role === 'model' && m.text.includes('"action"')).slice(-3)
  if (prevActions.length > 0) {
    userPrompt += `\n\n## Previous actions (apps/windows already open):\n${prevActions.map(m => m.text).join('\n')}`
  }

  let iteration = 0
  let consecutiveFailures = 0
  let fullResponse = ''

  // ── Plan decomposition: break command into steps upfront ──
  const steps = await planSteps(command, history, intelligence)
  const stepTasks: StepTask[] = createStepTasks(steps)
  sessionLogger?.step(`Task plan: ${steps.length} step(s)`)

  // Inject plan into the action prompt so LLM follows it
  if (steps.length > 1) {
    userPrompt += `\n\n## Execution Plan (follow these steps in order, one per response):\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
  }

  // Build messages array after plan is ready
  const messages: LLMMessage[] = [
    ...history,
    { role: 'user', text: userPrompt },
  ]

  stateMachine.transition('LLM_RESPONDING')

  const { maxIterations, maxConsecutiveFailures } = getConfig().agent

  // Generate JSON schema once (reused every iteration) for structured output
  const actionJsonSchema = z.toJSONSchema(AgentActionSchema) as Record<string, unknown>

  // ── Main loop ──
  while (iteration < maxIterations && consecutiveFailures < maxConsecutiveFailures) {
    iteration++
    const progress = Math.min(iteration * 15, 95)
    let currentStepId: string | null = null

    log.info(`Iteration ${iteration} (failures: ${consecutiveFailures}/${maxConsecutiveFailures})`)

    try {
      // Ask LLM for next action — structured output forces valid JSON
      const stopLLM = sessionLogger?.startTimer(`Iteration ${iteration} LLM call`)
      const llmResponse = screenshot
        ? await intelligence.chatWithVisionStructured(messages, screenshot, actionJsonSchema, undefined, systemPrompt)
        : await intelligence.chatStructured(messages, actionJsonSchema, undefined, systemPrompt)
      stopLLM?.()
      screenshot = null
      log.debug(`LLM: ${llmResponse.slice(0, 200)}`)

      // Parse + validate via Zod schema (guaranteed JSON from structured output)
      let action: AgentAction | null = null
      try {
        action = AgentActionSchema.parse(JSON.parse(llmResponse)) as AgentAction
      } catch {
        // Fallback: try legacy parseAction for non-conforming responses
        action = parseAction(llmResponse)
      }

      if (!action) {
        consecutiveFailures++
        if (!llmResponse.trim()) {
          log.warn(`Empty response (${consecutiveFailures}/${maxConsecutiveFailures})`)
        } else {
          fullResponse = llmResponse
        }
        continue
      }

      // ── Done ──
      if (action.action === 'done') {
        fullResponse = action.text ?? llmResponse
        log.info('Agent signaled done')
        sessionLogger?.step('Agent signaled done')
        // Mark any remaining queued steps as done (skipped)
        for (const s of stepTasks) {
          if (s.status === 'queued') s.status = 'done'
        }
        emitSteps(stepTasks)
        break
      }

      // Emit to ActionIsland
      mainEventBus.emit('agent:action', {
        label: action.reason || `${action.action}...`,
        progress,
      })

      await sleep(getConfig().agent.preActionDelay)

      // ── Screenshot request (observation, not a task step) ──
      if (action.action === 'screenshot') {
        screenshot = await handleScreenshot(action, visionService, executionBranch, iteration)
        const branchText = formatBranch(executionBranch)
        const screenshotPrompt = promptLoader.load('screenshot_attached', { branch: branchText })
        messages.push(
          { role: 'model', text: llmResponse },
          { role: 'user', text: screenshotPrompt },
        )
        continue
      }

      // ── Web search (standalone, not in task queue) ──
      if (action.action === 'search') {
        if (searchService && action.query) {
          // Emit "searching" state for frontend animation
          mainEventBus.emit('agent:search-results', { type: 'web', query: action.query, results: [], fileResults: [], searching: true })

          const stopSearch = sessionLogger?.startTimer(`Iteration ${iteration} search`)
          const results = await searchService.searchWeb(action.query)
          const formatted = searchService.formatForLLM(results)
          stopSearch?.()
          sessionLogger?.step(`Search results: ${results.length}`)

          // Emit actual results
          mainEventBus.emit('agent:search-results', { type: 'web', query: action.query, results, fileResults: [], searching: false })

          messages.push(
            { role: 'model', text: llmResponse },
            { role: 'user', text: `Search results for "${action.query}":\n\n${formatted}\n\nUse these results to continue the task.` },
          )
        } else {
          executionBranch.push(`[${iteration}] SEARCH: failed — no search service or query`)
          messages.push(
            { role: 'model', text: llmResponse },
            { role: 'user', text: 'Search is not available. Answer based on your existing knowledge.' },
          )
        }
        continue
      }

      // ── File search (standalone, not in task queue) ──
      if (action.action === 'searchFiles') {
        if (searchService && action.query) {
          mainEventBus.emit('agent:search-results', { type: 'files', query: action.query, results: [], fileResults: [], searching: true })

          const stopSearch = sessionLogger?.startTimer(`Iteration ${iteration} file search`)
          const fileResults = await searchService.searchFiles(action.query, 10, (progressResults) => {
            // Stream progressive results to UI
            mainEventBus.emit('agent:search-results', {
              type: 'files', query: action.query!, results: [], fileResults: progressResults, searching: true,
            })
          })
          const formatted = searchService.formatFilesForLLM(fileResults)
          stopSearch?.()
          sessionLogger?.step(`File search results: ${fileResults.length}`)

          mainEventBus.emit('agent:search-results', { type: 'files', query: action.query, results: [], fileResults, searching: false })

          messages.push(
            { role: 'model', text: llmResponse },
            { role: 'user', text: `File search results for "${action.query}":\n\n${formatted}\n\nUse these results to continue the task.` },
          )
        } else {
          executionBranch.push(`[${iteration}] SEARCH_FILES: failed — no search service or query`)
          messages.push(
            { role: 'model', text: llmResponse },
            { role: 'user', text: 'File search is not available. Answer based on your existing knowledge.' },
          )
        }
        continue
      }

      // Activate next planned step in MicrotaskIsland (or create ad-hoc)
      currentStepId = activateStep(stepTasks, action.reason || `${action.action}`)

      // ── Risk check (self-assessed by LLM in action response) ──
      const risk = action.risk || 'medium'

      if (risk === 'high' || risk === 'critical') {
        const permId = randomUUID()
        const allowed = await requestPermission(permId, action, risk, stateMachine)

        if (!allowed) {
          log.info(`Action denied: ${action.action} — ${action.reason}`)
          fullResponse = 'Action cancelled by user.'
          stateMachine.transition('USER_CANCEL')
          break
        }

        stateMachine.transition('USER_CONFIRM')
      }

      // ── Execute action ──
      blurForAction()
      const stopExec = sessionLogger?.startTimer(`Iteration ${iteration} action`)
      const result = await motorService.executeAction(action)
      stopExec?.()
      restoreAfterAction()

      const actionDesc = describeAction(action)

      if (!result.success) {
        consecutiveFailures++
        executionBranch.push(`[${iteration}] FAILED: ${actionDesc} — ${result.error}`)
        log.error(`Failed (${consecutiveFailures}/${maxConsecutiveFailures}): ${result.error}`)
        // Mark step as failed in MicrotaskIsland
        if (currentStepId) markStep(stepTasks, currentStepId, 'failed')
        const branchText = formatBranch(executionBranch)
        const failedPrompt = promptLoader.load('action_failed', {
          error: result.error ?? 'Unknown error',
          branch: branchText,
        })
        messages.push(
          { role: 'model', text: llmResponse },
          { role: 'user', text: failedPrompt },
        )
        continue
      }

      // Success
      consecutiveFailures = 0
      const output = result.output ? ` → output: ${result.output.slice(0, 500)}` : ''
      executionBranch.push(`[${iteration}] OK: ${actionDesc}${output}`)
      sessionLogger?.step(`OK: ${actionDesc}${output.slice(0, 100)}`)
      // Mark step as done in MicrotaskIsland
      if (currentStepId) markStep(stepTasks, currentStepId, 'done')

      // Auto-screenshot after mouse actions for verification
      const isMouseAction = ['click', 'doubleClick', 'rightClick'].includes(action.action)
      if (isMouseAction) {
        await sleep(getConfig().agent.postActionDelay)
        screenshot = await visionService.takeScreenshot()
        executionBranch.push(`[${iteration}] auto-screenshot — verifying click result`)
        const branchText = formatBranch(executionBranch)
        const verifyPrompt = promptLoader.load('verify_action', { branch: branchText })
        messages.push(
          { role: 'model', text: llmResponse },
          { role: 'user', text: verifyPrompt },
        )
      } else {
        const branchText = formatBranch(executionBranch)
        const successPrompt = promptLoader.load('action_success', { branch: branchText })
        messages.push(
          { role: 'model', text: llmResponse },
          { role: 'user', text: successPrompt },
        )
      }
    } catch (err) {
      const message = formatLLMError(err)
      log.error('Action loop error:', err)
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
  // Final emit — steps remain visible in MicrotaskIsland (user dismisses manually)
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
    { role: 'model', text: fullResponse || `Completed ${iteration} action(s): ${executionBranch.join(', ')}` },
  ]
}

// ═══════════════════════════════════════════════════════════════════
//  Private Helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Build multi-monitor display info string for LLM context.
 * Identifies which monitor the user's cursor is on (ACTIVE).
 */
function buildDisplayInfo(): string {
  const allDisplays = electronScreen.getAllDisplays()
  const cursorPoint = electronScreen.getCursorScreenPoint()
  const activeDisplay = electronScreen.getDisplayNearestPoint(cursorPoint)

  return allDisplays.map((d, i) => {
    const isActive = d.id === activeDisplay.id
    return `Monitor ${i + 1}${isActive ? ' (ACTIVE — user is working here)' : ''}: ${d.size.width}x${d.size.height}, bounds: (${d.bounds.x},${d.bounds.y})`
  }).join('\n')
}

/**
 * Format the execution branch for LLM context.
 * Limits to the most recent entries to avoid quadratic token growth.
 */
function formatBranch(branch: string[]): string {
  const recent = branch.slice(-MAX_BRANCH_ENTRIES)
  const prefix = branch.length > MAX_BRANCH_ENTRIES
    ? `[...${branch.length - MAX_BRANCH_ENTRIES} earlier entries omitted]\n`
    : ''
  return `Execution branch:\n${prefix}${recent.join('\n')}`
}

/**
 * Build a human-readable description of an action for logging.
 */
function describeAction(action: AgentAction): string {
  if (action.action === 'runCommand') return `runCommand: ${action.command}`

  let desc: string = action.action
  if (action.coords) desc += ` at (${action.coords.join(',')})`
  if (action.text) desc += `: "${action.text}"`
  if (action.keys) desc += `: ${action.keys.join('+')}`
  if (action.key) desc += `: ${action.key}`
  return desc
}

/**
 * Handle an LLM response that isn't valid JSON.
 * Retries once with an explicit JSON-only instruction loaded from prompt template.
 */
async function handleInvalidResponse(
  llmResponse: string,
  messages: LLMMessage[],
  screenshot: Buffer | null,
  intelligence: IntelligenceService,
  retryPrompt: string,
  systemPrompt: string,
): Promise<{ action: AgentAction | null; rawResponse: string }> {
  if (!llmResponse.trim()) {
    return { action: null, rawResponse: '' }
  }

  log.warn('LLM returned text instead of JSON, retrying...')
  messages.push(
    { role: 'model', text: llmResponse },
    { role: 'user', text: retryPrompt },
  )

  const retry = screenshot
    ? await intelligence.chatWithVision(messages, screenshot, undefined, systemPrompt)
    : await intelligence.chat(messages, undefined, systemPrompt)

  const action = parseAction(retry)
  if (!action) {
    log.info('LLM failed to produce JSON on retry')
  }

  return { action, rawResponse: retry }
}

/**
 * Handle a screenshot action — capture the requested display.
 */
async function handleScreenshot(
  action: AgentAction,
  visionService: VisionService,
  executionBranch: string[],
  iteration: number,
): Promise<Buffer> {
  if (action.display && action.display >= 1) {
    const targetIndex = action.display - 1
    try {
      const displays = await visionService.listDisplays()
      if (targetIndex < displays.length) {
        const targetId = displays[targetIndex].id
        log.info(`Capturing display ${action.display} (id: ${targetId})`)
        const shot = await visionService.takeScreenshotOfDisplay(targetId)
        executionBranch.push(`[${iteration}] screenshot — captured monitor ${action.display}`)
        return shot
      }
      log.warn(`Display ${action.display} not found (available: ${displays.length})`)
    } catch (err) {
      log.warn(`Failed to capture display ${action.display}:`, err)
    }
  }

  const shot = await visionService.takeScreenshot()
  executionBranch.push(`[${iteration}] screenshot — captured active monitor`)
  return shot
}

/**
 * Request user permission for a risky action.
 *
 * Emits `agent:permission` to show PermissionIsland and waits
 * for the user's `agent:permission-response` event.
 */
function requestPermission(
  id: string,
  action: AgentAction,
  risk: string,
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
      message: action.reason,
      riskLevel: risk as 'medium' | 'high' | 'critical',
    })

    log.info(`Permission requested: ${id} — ${action.reason}`)
  })
}
