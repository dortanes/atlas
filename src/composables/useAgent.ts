import { ref } from 'vue'
import type { AgentState, ActionData } from '@/types/agent'
import { api } from '@/api'

/**
 * useAgent — core agent state composable (singleton).
 *
 * Owns the agent state machine and current action tracking.
 * Provides `sendCommand()` to send user commands via tRPC.
 *
 * Subscribes to:
 *   - `agent.onStateChange` → updates `state`
 *   - `agent.onAction` → updates `currentAction`
 */

// ── Singleton State ──

const state = ref<AgentState>('idle')
const currentAction = ref<ActionData | null>(null)

// ── tRPC Subscriptions (initialized once) ──

let subscribed = false

function initSubscriptions() {
  if (subscribed) return
  subscribed = true

  // Agent state changes
  api.agent.onStateChange.subscribe(undefined, {
    onData(data: { state: AgentState }) {
      state.value = data.state
    },
  })

  // Current action updates
  api.agent.onAction.subscribe(undefined, {
    onData(data: { action: ActionData | null }) {
      currentAction.value = data.action
    },
  })
}

initSubscriptions()

// ── Composable ──

export function useAgent() {
  /**
   * Send a text command to the agent via tRPC mutation.
   */
  function sendCommand(text: string) {
    console.info('[useAgent] sendCommand:', text)
    api.agent.sendCommand.mutate({ text })
  }

  /**
   * Update the agent state.
   * Can be called locally (e.g. for UI-driven transitions).
   */
  function setState(next: AgentState) {
    state.value = next
  }

  /**
   * Update the current action.
   * Can be called locally if needed.
   */
  function setAction(action: ActionData | null) {
    currentAction.value = action
  }

  return {
    state,
    currentAction,
    sendCommand,
    setState,
    setAction,
  }
}
