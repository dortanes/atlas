import { BaseService } from '@electron/services/base/BaseService'
import { IntelligenceService } from '@electron/services/intelligence/IntelligenceService'
import { PromptLoader } from '@electron/services/intelligence/PromptLoader'
import type { LLMMessage } from '@electron/services/intelligence/providers/BaseLLMProvider'
import { PersonaService } from '@electron/services/persona/PersonaService'
import { MemoryService } from '@electron/services/memory/MemoryService'
import { FactService } from '@electron/services/memory/FactService'
import { VisionService } from '@electron/services/vision/VisionService'
import { MotorService } from '@electron/services/motor/MotorService'
import { ClassifierService } from '@electron/services/classifiers/ClassifierService'
import { IntentClassifier } from '@electron/services/classifiers/IntentClassifier'
import { SearchService } from '@electron/services/search/SearchService'
import { AgentStateMachine } from './AgentState'
import { AgentLoop } from './AgentLoop'
import { MicrotaskQueue } from './MicrotaskQueue'
import { mainEventBus } from '@electron/utils/eventBus'
import { getConfig } from '@electron/utils/config'
import { SessionLogger } from '@electron/utils/sessionLogger'

/**
 * AgentService — top-level orchestrator for the agent brain.
 *
 * Responsibilities:
 * - Listens to `agent:command` events (from tRPC router)
 * - Manages conversation history (persisted via MemoryService)
 * - Drives the AgentStateMachine through transitions
 * - Invokes AgentLoop for LLM processing (chat or action loop)
 * - Manages MicrotaskQueue for sequential task execution
 * - Handles persona switching (saves/loads per-persona history)
 * - Handles permission responses and warning dismissals
 */
export interface ActionLogEntry {
  personaId: string
  command: string
  timestamp: string
  entries: string[]
}

const MAX_ACTION_LOGS = 50

export class AgentService extends BaseService {
  private intelligence: IntelligenceService
  private personaService: PersonaService
  private memoryService: MemoryService
  private factService: FactService
  private visionService: VisionService | null
  private motorService: MotorService | null
  private classifierService: ClassifierService
  private promptLoader = new PromptLoader()
  private stateMachine = new AgentStateMachine()
  private loop: AgentLoop
  private queue = new MicrotaskQueue()
  private history: LLMMessage[] = []
  private busy = false
  private actionLogs = new Map<string, ActionLogEntry[]>()
  private actionSteps: Array<{ id: string; text: string; status: 'queued' | 'active' | 'done' | 'failed'; createdAt: string }> = []

  // ── Bound event handlers (must be the same reference for on/off) ──
  private readonly boundOnCommand = this.onCommand.bind(this)
  private readonly boundOnPermissionResponse = this.onPermissionResponse.bind(this)
  private readonly boundOnDismissWarning = this.onDismissWarning.bind(this)
  private readonly boundOnPersonaSwitched = this.onPersonaSwitched.bind(this)
  private readonly boundOnNewSession = this.onNewSession.bind(this)
  private readonly boundOnActionLog = this.onActionLog.bind(this)
  private readonly boundOnActionSteps = this.onActionSteps.bind(this)

  constructor(
    intelligence: IntelligenceService,
    personaService: PersonaService,
    memoryService: MemoryService,
    factService: FactService,
    visionService?: VisionService,
    motorService?: MotorService,
    searchService?: SearchService,
  ) {
    super()
    this.intelligence = intelligence
    this.personaService = personaService
    this.memoryService = memoryService
    this.factService = factService
    this.visionService = visionService ?? null
    this.motorService = motorService ?? null

    // Bootstrap classifier subsystem
    this.classifierService = new ClassifierService()
    this.classifierService.register(new IntentClassifier(intelligence, this.promptLoader))

    this.loop = new AgentLoop(
      intelligence,
      this.promptLoader,
      this.stateMachine,
      () => this.personaService.getActive(),
      this.classifierService,
      factService,
      this.visionService ?? undefined,
      this.motorService ?? undefined,
      searchService,
    )
  }

  async init(): Promise<void> {
    // Ensure default prompts exist in userData
    this.promptLoader.ensureDefaults()

    // Load conversation history for active persona
    const persona = this.personaService.getActive()
    this.history = this.memoryService.getContextMessages(persona.id)
    this.log.info(`Loaded ${this.history.length} messages for persona "${persona.name}"`)

    // Register event listeners (using pre-bound references for correct cleanup)
    mainEventBus.on('agent:command', this.boundOnCommand)
    mainEventBus.on('agent:permission-response', this.boundOnPermissionResponse)
    mainEventBus.on('agent:dismiss-warning', this.boundOnDismissWarning)
    mainEventBus.on('persona:switched', this.boundOnPersonaSwitched)
    mainEventBus.on('agent:newSession', this.boundOnNewSession)
    mainEventBus.on('agent:action-log', this.boundOnActionLog)
    mainEventBus.on('agent:action-steps', this.boundOnActionSteps)

    this.log.info(`AgentService initialized (vision: ${!!this.visionService}, motor: ${!!this.motorService})`)
  }

  async dispose(): Promise<void> {
    // Remove listeners using the SAME bound references from init()
    mainEventBus.off('agent:command', this.boundOnCommand)
    mainEventBus.off('agent:permission-response', this.boundOnPermissionResponse)
    mainEventBus.off('agent:dismiss-warning', this.boundOnDismissWarning)
    mainEventBus.off('persona:switched', this.boundOnPersonaSwitched)
    mainEventBus.off('agent:newSession', this.boundOnNewSession)
    mainEventBus.off('agent:action-log', this.boundOnActionLog)
    mainEventBus.off('agent:action-steps', this.boundOnActionSteps)
    this.history = []
    this.queue.clear()
    this.log.info('AgentService disposed')
  }

  /**
   * Handle an incoming user command.
   * If the agent is busy, the command is queued as a microtask.
   */
  private async onCommand(payload: { text: string }): Promise<void> {
    const { text } = payload
    this.log.info(`Command: "${text}"`)

    if (this.busy) {
      this.queue.enqueue(text)
      this.log.info('Agent busy, queued as microtask')
      return
    }

    await this.executeCommand(text)
  }

  /**
   * Execute a command: transition state → run loop → persist → check queue.
   */
  private async executeCommand(text: string): Promise<void> {
    this.busy = true
    // Clear previous action steps (reset MicrotaskIsland)
    this.actionSteps = []
    mainEventBus.emit('agent:microtasks', [...this.queue.getAll()])
    this.stateMachine.transition('COMMAND_RECEIVED')

    const prevLen = this.history.length

    // Create session logger if debug log mode is enabled
    const persona = this.personaService.getActive()
    const sessionLogger = getConfig().ui.debugLog
      ? new SessionLogger(text, persona.name)
      : undefined

    try {
      this.history = await this.loop.run(text, this.history, sessionLogger)

      // Auto-save new exchange to MemoryService
      if (this.history.length > prevLen) {
        const newMessages = this.history.slice(prevLen)
        const personaId = persona.id
        // Messages come in pairs: user + model
        for (let i = 0; i < newMessages.length - 1; i += 2) {
          this.memoryService.appendMessages(personaId, newMessages[i], newMessages[i + 1])
        }
      }
    } catch (err) {
      this.log.error('Agent loop error:', err)
      sessionLogger?.step(`ERROR: ${err}`)
      this.stateMachine.reset()
    }

    // Flush session log to disk
    sessionLogger?.flush()

    this.busy = false
    await this.processQueue()
  }

  /** Process the next microtask in the queue, if any. */
  private async processQueue(): Promise<void> {
    const next = this.queue.activateNext()
    if (!next) return

    this.log.info(`Processing microtask: "${next.text}" (${next.id})`)

    try {
      await this.executeCommand(next.text)
      this.queue.complete(next.id)
    } catch {
      this.queue.fail(next.id)
    }
  }

  /** Handle persona switch — save current, load new persona's history */
  private onPersonaSwitched(payload: { id: string }): void {
    this.log.info(`Persona switched to: ${payload.id}`)
    this.queue.clear()

    // Load new persona's history
    this.history = this.memoryService.getContextMessages(payload.id)
    this.log.info(`Loaded ${this.history.length} messages for persona ${payload.id}`)

    // Re-create loop with current services
    this.loop = new AgentLoop(
      this.intelligence,
      this.promptLoader,
      this.stateMachine,
      () => this.personaService.getActive(),
      this.classifierService,
      this.factService,
      this.visionService ?? undefined,
      this.motorService ?? undefined,
    )

    this.stateMachine.reset()
  }

  /** Handle new session — start fresh conversation */
  private onNewSession(): void {
    const personaId = this.personaService.getActive().id
    this.memoryService.newSession(personaId)
    this.history = []
    this.queue.clear()
    this.stateMachine.reset()
    this.log.info('New conversation session started')
  }

  /** Handle permission response from the UI */
  private onPermissionResponse(payload: { id: string; allowed: boolean }): void {
    this.log.info(`Permission response: ${payload.id} → ${payload.allowed ? 'allowed' : 'denied'}`)
    if (payload.allowed) {
      this.stateMachine.transition('USER_CONFIRM')
    } else {
      this.stateMachine.transition('USER_CANCEL')
    }
  }

  /** Handle warning dismissal from the UI */
  private onDismissWarning(payload: { id: string }): void {
    this.log.info(`Warning dismissed: ${payload.id}`)
  }

  /** Store action log entry */
  private onActionLog(entry: ActionLogEntry): void {
    const logs = this.actionLogs.get(entry.personaId) ?? []
    logs.unshift(entry) // newest first
    if (logs.length > MAX_ACTION_LOGS) logs.pop()
    this.actionLogs.set(entry.personaId, logs)
    this.log.debug(`Action log stored for persona ${entry.personaId}: ${entry.entries.length} steps`)
  }

  /** Handle action steps from ActionLoop — merge with queued tasks and re-emit */
  private onActionSteps(steps: Array<{ id: string; text: string; status: 'queued' | 'active' | 'done' | 'failed'; createdAt: string }>): void {
    this.actionSteps = steps
    // Merge: action steps first (current progress), then user-queued tasks
    const merged = [...steps, ...this.queue.getAll()]
    mainEventBus.emit('agent:microtasks', merged)
  }

  /** Get action logs for a persona */
  getActionLogs(personaId: string): ActionLogEntry[] {
    return this.actionLogs.get(personaId) ?? []
  }

  /** Clear action logs for a persona */
  clearActionLogs(personaId: string): void {
    this.actionLogs.delete(personaId)
  }
}
