/**
 * AgentLoop — entry point for processing user commands.
 *
 * This is a thin facade that:
 * 1. Checks if the intelligence service is ready
 * 2. Classifies the command intent (action vs chat)
 * 3. Delegates to the appropriate handler module
 *
 * The actual logic lives in:
 * - {@link ActionLoop} — screen interaction loop (act → observe → decide)
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
import { runChatOnly } from './ChatMode'
import { SearchService } from '@electron/services/search/SearchService'

const log = createLogger('AgentLoop')

/**
 * AgentLoop — processes a single user command.
 *
 * Two modes of operation:
 * 1. **Chat mode** (no vision/motor): LLM → stream response → done
 * 2. **Action mode** (vision + motor): act → observe → decide cycle
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
   * Decides between action mode (vision + motor) and chat-only mode
   * using the LLM classifier for language-agnostic intent detection.
   *
   * @param command — the user's text command
   * @param history — prior conversation messages
   * @returns Updated conversation history including this exchange
   */
  async run(command: string, history: LLMMessage[]): Promise<LLMMessage[]> {
    // Guard: intelligence service must be initialized
    if (!this.intelligence.isReady) {
      log.error('Intelligence service not ready — aborting')
      mainEventBus.emit('agent:warning', {
        id: 'missing-api-key',
        message: 'No API key configured. Set your Gemini API key in the config.',
      })
      this.stateMachine.transition('TASK_DONE')
      return history
    }

    const persona = this.getPersona()

    // Use action loop if vision + motor are available AND intent classifier says yes
    if (this.visionService && this.motorService) {
      const intentClassifier = this.classifierService.get<IntentClassifier>('intent')
      const needsAction = await intentClassifier.classify({ command, recentHistory: history })

      if (needsAction) {
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
        )
      }
    }

    // Chat-only mode for conversational messages
    // Agent stays in `processing` (no screen interaction — `acting` is reserved for action loop)
    const result = await runChatOnly(
      command,
      history,
      this.intelligence,
      this.promptLoader,
      persona,
      this.visionService,
      this.factExtractor ?? undefined,
    )
    this.stateMachine.transition('TASK_DONE')
    return result
  }
}
