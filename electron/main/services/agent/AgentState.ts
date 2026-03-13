import { mainEventBus } from '@electron/utils/eventBus'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('AgentState')

/**
 * Valid agent states — must match the renderer's OrbState type.
 */
export type State = 'idle' | 'listening' | 'processing' | 'acting' | 'warning'

/**
 * Events that trigger state transitions.
 */
export type StateEvent =
  | 'COMMAND_RECEIVED'
  | 'SPEECH_RECOGNIZED'
  | 'LLM_RESPONDING'
  | 'TASK_DONE'
  | 'HIGH_RISK'
  | 'USER_CONFIRM'
  | 'USER_CANCEL'
  | 'NEXT_STEP'
  | 'START_LISTENING'

/**
 * Transition table: [currentState, event] → nextState
 */
const TRANSITIONS: Record<string, State | undefined> = {
  'idle:COMMAND_RECEIVED': 'processing',
  'idle:START_LISTENING': 'listening',
  'listening:SPEECH_RECOGNIZED': 'processing',
  'processing:LLM_RESPONDING': 'acting',
  'processing:TASK_DONE': 'idle',       // early abort (e.g. no API key)
  'acting:TASK_DONE': 'idle',
  'acting:HIGH_RISK': 'warning',
  'acting:NEXT_STEP': 'processing',
  'warning:USER_CONFIRM': 'acting',
  'warning:USER_CANCEL': 'idle',
}

/**
 * AgentStateMachine — finite state machine for agent lifecycle.
 *
 * Validates transitions and emits `agent:state` events via the eventBus
 * so the tRPC agent.router can forward state changes to the UI.
 */
export class AgentStateMachine {
  private current: State = 'idle'

  /** Get current state */
  get state(): State {
    return this.current
  }

  /**
   * Attempt a state transition.
   * Returns true if transition was valid and applied.
   */
  transition(event: StateEvent): boolean {
    const key = `${this.current}:${event}`
    const next = TRANSITIONS[key]

    if (!next) {
      log.warn(`Invalid transition: ${key}`)
      return false
    }

    log.debug(`${this.current} → ${next} (event: ${event})`)
    this.current = next
    mainEventBus.emit('agent:state', next)
    return true
  }

  /** Force-set state (for error recovery) */
  reset(): void {
    this.current = 'idle'
    mainEventBus.emit('agent:state', 'idle')
    log.info('State reset to idle')
  }
}
