/**
 * DirectActionLoop — fast execution path for simple OS actions.
 *
 * When the IntentClassifier determines a command is `direct` (can be done
 * via shell command or hotkey without looking at the screen), this module
 * runs instead of ActionLoop/ComputerUseLoop.
 *
 * Flow:
 * 1. Send command to LLM with direct_action.md prompt (no screenshot)
 * 2. LLM returns a JSON action (runCommand, hotkey, keyPress, search, or done)
 * 3. Execute via MotorService
 * 4. Stream result to ResponseIsland
 *
 * If LLM returns `{ "action": "needsVision" }`, falls back to the full
 * ActionLoop/ComputerUseLoop path (returned via the `needsVision` flag).
 *
 * Benefits over the full action loop:
 * - Zero screenshots (no VisionService calls)
 * - Single LLM call (no observe → decide cycle)
 * - ~100ms execution vs ~3-5s for vision-based loop
 */

import { randomUUID } from 'node:crypto'
import os from 'node:os'
import * as z from 'zod'

import { IntelligenceService } from '@electron/services/intelligence/IntelligenceService'
import { PromptLoader } from '@electron/services/intelligence/PromptLoader'
import type { LLMMessage } from '@electron/services/intelligence/providers/BaseLLMProvider'
import { MotorService } from '@electron/services/motor/MotorService'
import { SearchService } from '@electron/services/search/SearchService'

import { mainEventBus } from '@electron/utils/eventBus'
import { formatLLMError } from '@electron/utils/llmErrors'
import { createLogger } from '@electron/utils/logger'
import { blurForAction, restoreAfterAction } from '@electron/WindowManager'
import { streamFinalResponse } from './ResponseStreamer'
import { AgentStateMachine } from './AgentState'
import type { AgentProfile } from '@electron/services/persona/AgentProfile'
import type { FactExtractor } from './FactExtractor'
import type { SessionLogger } from '@electron/utils/sessionLogger'
import { buildDynamicContext } from './agentUtils'

const log = createLogger('DirectActionLoop')

// ── Zod schema for direct action response ──
const DirectActionSchema = z.object({
  action: z.enum(['runCommand', 'hotkey', 'keyPress', 'search', 'searchFiles', 'done', 'needsVision']),
  command: z.string().optional(),
  keys: z.array(z.string()).optional(),
  key: z.string().optional(),
  query: z.string().optional(),
  text: z.string().optional(),
  reason: z.string().describe('Technical reason for logging'),
  response: z.string().describe('Natural human reply to the user in the SAME LANGUAGE as their command'),
  risk: z.enum(['low', 'medium', 'high', 'critical']).optional(),
})

type DirectAction = z.infer<typeof DirectActionSchema>

const directActionJsonSchema = z.toJSONSchema(DirectActionSchema) as Record<string, unknown>

/** Result of the direct action loop */
export interface DirectActionResult {
  /** Updated conversation history */
  history: LLMMessage[]
  /** If true, the LLM requested vision — caller should route to ActionLoop */
  needsVision: boolean
}

/**
 * Run a direct action for a simple OS command (no screenshots needed).
 *
 * @returns DirectActionResult with updated history and needsVision flag
 */
export async function runDirectAction(
  command: string,
  history: LLMMessage[],
  intelligence: IntelligenceService,
  promptLoader: PromptLoader,
  stateMachine: AgentStateMachine,
  persona: AgentProfile,
  motorService: MotorService,
  factExtractor?: FactExtractor,
  searchService?: SearchService,
  sessionLogger?: SessionLogger,
): Promise<DirectActionResult> {
  const userFacts = factExtractor
    ? factExtractor.getFactsText(persona.id)
    : 'No known facts about the user yet.'

  // ── Stable system prompt (no time/facts — for caching) ──
  const systemPrompt = promptLoader.load('system', {
    os: `${os.platform()} ${os.release()}`,
    resolution: 'N/A (direct mode — no screen interaction)',
    persona_name: persona.name,
    personality: persona.personality,
  }, persona.id)

  // ── Direct action prompt (stable — cacheable) ──
  const directPrompt = promptLoader.load('direct_action', {}, persona.id)

  // Dynamic context — changes every call, NOT cached
  const dynamicContext = buildDynamicContext(userFacts)

  const messages: LLMMessage[] = [
    ...history,
    { role: 'user', text: `${dynamicContext}\n\n${directPrompt}\n\nUser command: ${command}` },
  ]

  stateMachine.transition('LLM_RESPONDING')

  let fullResponse = ''

  try {
    // Cache system prompt + direct_action prompt for token savings
    const cachedContent = await intelligence.getCache(systemPrompt, persona.id, directPrompt, 'direct').catch(() => null)

    // Single LLM call — structured output for guaranteed JSON
    const stopLLM = sessionLogger?.startTimer('LLM call')
    const llmResponse = await intelligence.chatStructured(
      messages,
      directActionJsonSchema,
      undefined,
      systemPrompt,
      cachedContent ?? undefined,
    )
    stopLLM?.()

    log.debug(`LLM: ${llmResponse.slice(0, 300)}`)

    const action: DirectAction = DirectActionSchema.parse(JSON.parse(llmResponse))
    sessionLogger?.step(`Action: ${action.action} (reason: ${action.reason})`)

    // ── needsVision fallback ──
    if (action.action === 'needsVision') {
      log.info(`Direct mode fallback to vision: ${action.reason}`)
      // Don't transition to TASK_DONE — the vision loop will manage state
      return {
        history,
        needsVision: true,
      }
    }

    // ── Done (pure text response) ──
    if (action.action === 'done') {
      fullResponse = action.text ?? action.reason
      log.info(`Direct done: ${fullResponse.slice(0, 100)}`)
      sessionLogger?.step(`Response: "${fullResponse.slice(0, 120)}"`)
    }

    // ── Search ──
    else if (action.action === 'search') {
      if (searchService && action.query) {
        // Emit "searching" state
        mainEventBus.emit('agent:search-results', {
          type: 'web',
          query: action.query,
          results: [],
          fileResults: [],
          searching: true,
        })

        mainEventBus.emit('agent:action', {
          label: `Searching: ${action.query}`,
          progress: 50,
        })

        const stopSearch = sessionLogger?.startTimer('Web search')
        const results = await searchService.searchWeb(action.query)
        const formatted = searchService.formatForLLM(results)
        stopSearch?.()
        sessionLogger?.step(`Search results: ${results.length}`)

        // Emit actual results
        mainEventBus.emit('agent:search-results', {
          type: 'web',
          query: action.query,
          results,
          fileResults: [],
          searching: false,
        })

        // Ask LLM to summarize search results
        const summaryMessages: LLMMessage[] = [
          ...history,
          { role: 'user', text: command },
          {
            role: 'model',
            text: `I searched for "${action.query}" and found these results:\n\n${formatted}`,
          },
          {
            role: 'user',
            text: 'Based on these search results, provide a helpful response to the user.',
          },
        ]

        const stopSummary = sessionLogger?.startTimer('LLM summary call')
        fullResponse = await intelligence.chat(summaryMessages, undefined, systemPrompt)
        stopSummary?.()
        log.info(`Search complete: ${action.query} — ${results.length} results`)
        sessionLogger?.step(`Response: "${fullResponse.slice(0, 120)}${fullResponse.length > 120 ? '…' : ''}" (${fullResponse.length} chars)`)
      } else {
        fullResponse = 'Search is not available right now.'
      }
    }

    // ── File search (explicit or intercepted from runCommand) ──
    else if (action.action === 'searchFiles' || isFileSearchCommand(action)) {
      const fileQuery = action.query || extractFileSearchQuery(action)
      if (searchService && fileQuery) {
        // Emit "searching files" state
        mainEventBus.emit('agent:search-results', {
          type: 'files',
          query: fileQuery,
          results: [],
          fileResults: [],
          searching: true,
        })

        mainEventBus.emit('agent:action', {
          label: `Searching files: ${fileQuery}`,
          progress: 30,
        })

        const stopSearch = sessionLogger?.startTimer('File search')
        const fileResults = await searchService.searchFiles(fileQuery, 10, (progressResults) => {
          // Stream progressive results to UI in real-time
          mainEventBus.emit('agent:search-results', {
            type: 'files',
            query: fileQuery,
            results: [],
            fileResults: progressResults,
            searching: true, // still searching other directories
          })
          mainEventBus.emit('agent:action', {
            label: `Found ${progressResults.length} file(s)...`,
            progress: Math.min(30 + progressResults.length * 7, 90),
          })
        })
        const formatted = searchService.formatFilesForLLM(fileResults)
        stopSearch?.()
        sessionLogger?.step(`File search results: ${fileResults.length}`)

        // Emit final results (searching: false)
        mainEventBus.emit('agent:search-results', {
          type: 'files',
          query: fileQuery,
          results: [],
          fileResults,
          searching: false,
        })

        // Ask LLM for a brief acknowledgment (files are already shown in SearchIsland UI)
        const summaryMessages: LLMMessage[] = [
          ...history,
          { role: 'user', text: command },
          {
            role: 'model',
            text: `I searched for files matching "${fileQuery}" on the computer and found ${fileResults.length} result(s). The results are already displayed to the user in a visual panel.`,
          },
          {
            role: 'user',
            text: 'Give a VERY brief 1-sentence response. Do NOT list or repeat the file names — the user already sees them in the search panel. Just acknowledge the search briefly.',
          },
        ]

        const stopSummary = sessionLogger?.startTimer('LLM summary call')
        fullResponse = await intelligence.chat(summaryMessages, undefined, systemPrompt)
        stopSummary?.()
        log.info(`File search complete: ${fileQuery} — ${fileResults.length} results`)
        sessionLogger?.step(`Response: "${fullResponse.slice(0, 120)}${fullResponse.length > 120 ? '…' : ''}" (${fullResponse.length} chars)`)
      } else {
        fullResponse = 'File search is not available right now.'
      }
    }

    // ── Intercept SendKeys text input → redirect to vision ──
    else if (isSendKeysTextCommand(action)) {
      log.warn(`Blocked SendKeys text input in runCommand: ${action.command?.slice(0, 100)}`)
      sessionLogger?.step('Blocked SendKeys text input → redirecting to needsVision')
      // Don't transition to TASK_DONE — the vision loop will manage state
      return {
        history,
        needsVision: true,
      }
    }

    // ── Execute action (runCommand / hotkey / keyPress) ──
    else {
      mainEventBus.emit('agent:action', {
        label: action.reason || `${action.action}...`,
        progress: 50,
      })

      // Risk check
      const risk = action.risk || 'medium'
      if (risk === 'high' || risk === 'critical') {
        const permId = randomUUID()
        const allowed = await requestPermission(permId, action, risk, stateMachine)

        if (!allowed) {
          log.info(`Direct action denied: ${action.action} — ${action.reason}`)
          fullResponse = 'Action cancelled by user.'
          mainEventBus.emit('agent:action', null)
          stateMachine.transition('USER_CANCEL')

          if (fullResponse.trim()) {
            await streamFinalResponse(fullResponse, persona.id, factExtractor)
          }
          stateMachine.transition('TASK_DONE')

          return {
            history: [
              ...history,
              { role: 'user', text: command },
              { role: 'model', text: fullResponse },
            ],
            needsVision: false,
          }
        }
        stateMachine.transition('USER_CONFIRM')
      }

      blurForAction()
      const stopExec = sessionLogger?.startTimer('Action execution')
      const result = await motorService.executeAction({
        action: action.action as 'runCommand' | 'hotkey' | 'keyPress',
        command: action.command,
        keys: action.keys,
        key: action.key,
        reason: action.reason,
        risk: action.risk,
      })
      stopExec?.()
      restoreAfterAction()

      if (!result.success) {
        log.error(`Direct action failed: ${result.error}`)
        // Ask LLM to explain the failure to the user in natural language.
        // The pre-generated `action.response` assumed success, so we can't use it.
        try {
          const errorMessages: LLMMessage[] = [
            ...history,
            { role: 'user', text: command },
            {
              role: 'model',
              text: `I tried to execute: ${action.command || action.keys?.join('+') || action.key || action.action}\nBut it failed with this error:\n${result.error}`,
            },
            {
              role: 'user',
              text: 'Explain what went wrong in 1-2 sentences. Be concise and helpful. Suggest a fix if obvious.',
            },
          ]
          const stopSummary = sessionLogger?.startTimer('Error explanation LLM call')
          fullResponse = await intelligence.chat(errorMessages, undefined, systemPrompt)
          stopSummary?.()
          sessionLogger?.step(`Error response: "${fullResponse.slice(0, 120)}"`)
        } catch {
          fullResponse = `Failed to execute: ${result.error?.split('\n')[0] ?? 'Unknown error'}`
        }
      } else {
        fullResponse = action.response || action.text || 'Done.'
        log.info(`Direct action OK: ${action.reason}`)
        sessionLogger?.step(`Execution OK`)
      }
    }
  } catch (err) {
    const message = formatLLMError(err)
    log.error('Direct action error:', err)
    mainEventBus.emit('agent:warning', {
      id: randomUUID(),
      message,
      dismissable: true,
    })
    fullResponse = message
  }

  // ── Cleanup ──
  mainEventBus.emit('agent:action', null)
  motorService.hideCursor()

  if (fullResponse.trim()) {
    const stopStream = sessionLogger?.startTimer('Response streaming')
    await streamFinalResponse(fullResponse, persona.id, factExtractor)
    stopStream?.()
  }

  stateMachine.transition('TASK_DONE')

  return {
    history: [
      ...history,
      { role: 'user', text: command },
      { role: 'model', text: fullResponse || 'Done.' },
    ],
    needsVision: false,
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Private Helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Request user permission for a risky direct action.
 */
function requestPermission(
  id: string,
  action: DirectAction,
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

/**
 * Detect if a `runCommand` action is actually a file search.
 *
 * LLMs often use `Get-ChildItem -Recurse -Filter` for file search even
 * when instructed to use `searchFiles`. This interceptor catches those
 * and redirects them through the proper SearchService flow with UI.
 */
function isFileSearchCommand(action: DirectAction): boolean {
  if (action.action !== 'runCommand' || !action.command) return false
  const cmd = action.command.toLowerCase()

  // Detect PowerShell file search patterns
  return (
    (cmd.includes('get-childitem') || cmd.includes('gci ') || cmd.includes('dir ') || cmd.includes('ls ')) &&
    (cmd.includes('-recurse') || cmd.includes('-filter') || cmd.includes('-include'))
  )
}

/**
 * Detect if a `runCommand` action uses SendKeys to type/insert text.
 *
 * The LLM sometimes ignores prompt rules and uses WScript.Shell.SendKeys
 * to type text into applications. This causes garbled output because
 * SendKeys doesn't handle Cyrillic and special characters properly.
 * Intercept and redirect to needsVision so robotjs handles the typing.
 *
 * Allows single-char media keys like SendKeys([char]173) for volume control.
 */
function isSendKeysTextCommand(action: DirectAction): boolean {
  if (action.action !== 'runCommand' || !action.command) return false
  const cmd = action.command.toLowerCase()

  // Must contain sendkeys
  if (!cmd.includes('sendkeys')) return false

  // Allow volume/media keys: SendKeys([char]NNN) — single character codes
  if (/sendkeys\(\[char\]\d+\)/.test(cmd)) return false

  // Everything else using SendKeys is blocked (text strings, etc.)
  return true
}

/**
 * Extract the search query from a PowerShell file search command.
 *
 * Handles patterns like:
 * - Get-ChildItem -Filter "*.py" → "*.py"
 * - Get-ChildItem -Filter ai_agent.py → "ai_agent.py"
 * - Get-ChildItem ... -Filter "*resume*" → "resume"
 */
function extractFileSearchQuery(action: DirectAction): string {
  if (!action.command) return action.query ?? ''

  // Try to extract from -Filter parameter
  const filterMatch = action.command.match(/-Filter\s+["']?\*?([^"'\s]+?)\*?["']?(?:\s|$)/i)
  if (filterMatch?.[1]) {
    return filterMatch[1]
  }

  // Fall back to query field or reason
  return action.query ?? ''
}
