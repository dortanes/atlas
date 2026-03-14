/**
 * AgentLoop — entry point for processing user commands.
 *
 * This is a thin facade that:
 * 1. Checks if the intelligence service is ready
 * 2. Classifies the command intent (chat / direct / action)
 * 3. Delegates to the appropriate handler module
 *
 * The actual logic lives in:
 * - {@link DirectActionLoop} — fast path for simple OS actions (no vision)
 * - {@link ActionLoop} — screen interaction loop (act → observe → decide)
 * - {@link ComputerUseLoop} — native Gemini computer_use loop
 * - {@link ChatMode} — conversational streaming response
 * - {@link FactExtractor} — async fact mining from conversations
 * - {@link ResponseStreamer} — word-by-word response animation
 */

import { IntelligenceService } from '@electron/services/intelligence/IntelligenceService'
import { PromptLoader } from '@electron/services/intelligence/PromptLoader'
import type { LLMMessage } from '@electron/services/intelligence/providers/BaseLLMProvider'
import { VisionService } from '@electron/services/vision/VisionService'
import { MotorService } from '@electron/services/motor/MotorService'
import { ClassifierService } from '@electron/services/classifiers/ClassifierService'
import type { IntentClassifier } from '@electron/services/classifiers/IntentClassifier'
import { mainEventBus } from '@electron/utils/eventBus'
import { createLogger } from '@electron/utils/logger'
import { AgentStateMachine } from './AgentState'
import type { AgentProfile } from '@electron/services/persona/AgentProfile'
import type { FactService } from '@electron/services/memory/FactService'
import { FactExtractor } from './FactExtractor'
import { runActionLoop } from './ActionLoop'
import { runComputerUseLoop } from './ComputerUseLoop'
import { runDirectAction } from './DirectActionLoop'
import { runChatOnly } from './ChatMode'
import { SearchService } from '@electron/services/search/SearchService'
import type { SessionLogger } from '@electron/utils/sessionLogger'

const log = createLogger('AgentLoop')

/**
 * AgentLoop — processes a single user command.
 *
 * Three modes of operation:
 * 1. **Chat mode** (no vision/motor): LLM → stream response → done
 * 2. **Direct mode** (no vision): single LLM call → shell/hotkey → done
 * 3. **Action mode** (vision + motor): act → observe → decide cycle
 *
 * The loop emits events for all UI islands:
 * - `agent:action`     → ActionIsland (current step + progress)
 * - `agent:permission`  → PermissionIsland (risky action gating)
 * - `agent:warning`     → WarningIsland (errors, max iterations)
 * - `agent:response`    → ResponseIsland (final text answer)
 * - `agent:state`       → AgentOrb (via stateMachine transitions)
 */
export class AgentLoop {
  private intelligence: IntelligenceService
  private promptLoader: PromptLoader
  private stateMachine: AgentStateMachine
  private getPersona: () => AgentProfile
  private classifierService: ClassifierService
  private factExtractor: FactExtractor | null
  private visionService: VisionService | null
  private motorService: MotorService | null
  private searchService: SearchService | null

  constructor(
    intelligence: IntelligenceService,
    promptLoader: PromptLoader,
    stateMachine: AgentStateMachine,
    getPersona: () => AgentProfile,
    classifierService: ClassifierService,
    factService?: FactService,
    visionService?: VisionService,
    motorService?: MotorService,
    searchService?: SearchService,
  ) {
    this.intelligence = intelligence
    this.promptLoader = promptLoader
    this.stateMachine = stateMachine
    this.getPersona = getPersona
    this.classifierService = classifierService
    this.visionService = visionService ?? null
    this.motorService = motorService ?? null
    this.searchService = searchService ?? null

    // Create fact extractor if FactService is available
    this.factExtractor = factService
      ? new FactExtractor(intelligence, promptLoader, factService)
      : null
  }

  /**
   * Run the agent loop for a given command.
   *
   * Classifies intent into three categories:
   * - `chat`   → ChatMode (streaming response, no OS interaction)
   * - `direct` → DirectActionLoop (shell/hotkey, no screenshots)
   * - `action` → ActionLoop/ComputerUseLoop (full vision + motor)
   *
   * @param command — the user's text command
   * @param history — prior conversation messages
   * @returns Updated conversation history including this exchange
   */
  async run(command: string, history: LLMMessage[], sessionLogger?: SessionLogger): Promise<LLMMessage[]> {
    // Guard: intelligence service must be initialized
    if (!this.intelligence.isReady) {
      log.error('Intelligence service not ready — aborting')
      sessionLogger?.step('ABORT: Intelligence service not ready')
      mainEventBus.emit('agent:warning', {
        id: 'missing-api-key',
        message: 'No API key configured. Set your Gemini API key in the config.',
      })
      this.stateMachine.transition('TASK_DONE')
      return history
    }

    const persona = this.getPersona()

    // Classify intent: chat / direct / action
    sessionLogger?.section('Intent Classification')
    const stopClassify = sessionLogger?.startTimer('Duration')
    const intentClassifier = this.classifierService.get<IntentClassifier>('intent')
    const intent = await intentClassifier.classify({ command, recentHistory: history })
    stopClassify?.()
    sessionLogger?.step(`Result: ${intent}`)

    // ── Direct mode (no vision needed) ──
    if (intent === 'direct' && this.motorService) {
      log.info('Routing to Direct Action (shell/hotkey, no vision)')
      sessionLogger?.section('Direct Action')
      const result = await runDirectAction(
        command,
        history,
        this.intelligence,
        this.promptLoader,
        this.stateMachine,
        persona,
        this.motorService,
        this.factExtractor ?? undefined,
        this.searchService ?? undefined,
        sessionLogger,
      )

      // If LLM said it needs vision, fall through to action mode
      if (result.needsVision) {
        log.info('Direct mode requested vision fallback — routing to action loop')
        sessionLogger?.step('Fallback: needs vision → action mode')
        return this.runActionMode(command, history, persona, sessionLogger)
      }

      return result.history
    }

    // ── Action mode (vision + motor) ──
    if (intent === 'action' && this.visionService && this.motorService) {
      return this.runActionMode(command, history, persona, sessionLogger)
    }

    // ── Chat mode (conversational) ──
    sessionLogger?.section('Chat Mode')
    const result = await runChatOnly(
      command,
      history,
      this.intelligence,
      this.promptLoader,
      persona,
      this.visionService,
      this.factExtractor ?? undefined,
      sessionLogger,
    )
    this.stateMachine.transition('TASK_DONE')
    return result
  }

  /**
   * Run the full action mode — prefers Computer Use if available,
   * falls back to the structured-JSON ActionLoop.
   */
  private async runActionMode(
    command: string,
    history: LLMMessage[],
    persona: AgentProfile,
    sessionLogger?: SessionLogger,
  ): Promise<LLMMessage[]> {
    if (!this.visionService || !this.motorService) {
      log.warn('Vision/Motor not available — falling back to chat')
      sessionLogger?.step('Fallback: Vision/Motor unavailable → chat mode')
      const result = await runChatOnly(
        command,
        history,
        this.intelligence,
        this.promptLoader,
        persona,
        this.visionService,
        this.factExtractor ?? undefined,
        sessionLogger,
      )
      this.stateMachine.transition('TASK_DONE')
      return result
    }

    // Prefer native Computer Use if model supports it
    if (this.intelligence.supportsComputerUse && this.intelligence.computerUseGemini) {
      log.info('Routing to Computer Use loop (native screen control)')
      sessionLogger?.section('Computer Use Loop')
      return runComputerUseLoop(
        command,
        history,
        this.intelligence.computerUseGemini,
        this.intelligence,
        this.promptLoader,
        this.stateMachine,
        persona,
        this.visionService,
        this.motorService,
        this.factExtractor ?? undefined,
        sessionLogger,
      )
    }

    // Fallback: existing structured-JSON action loop
    sessionLogger?.section('Action Loop')
    return runActionLoop(
      command,
      history,
      this.intelligence,
      this.promptLoader,
      this.stateMachine,
      persona,
      this.visionService,
      this.motorService,
      this.factExtractor ?? undefined,
      this.searchService ?? undefined,
      sessionLogger,
    )
  }
}
