/**
 * Action types — shared definitions for the action execution pipeline.
 *
 * These types are used by AgentLoop, MotorService, and event bus emissions.
 */

/** All possible action types the LLM can request */
export type ActionType =
  | 'click'
  | 'doubleClick'
  | 'rightClick'
  | 'type'
  | 'hotkey'
  | 'keyPress'
  | 'scroll'
  | 'runCommand'
  | 'navigate'
  | 'screenshot'
  | 'search'
  | 'searchFiles'
  | 'wait'
  | 'done'

/** Risk level for action gating via PermissionIsland */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

/**
 * AgentAction — a single action the LLM wants to perform.
 *
 * The LLM returns this as JSON. The AgentLoop parses it,
 * classifies risk, and either executes directly or requests permission.
 */
export interface AgentAction {
  action: ActionType
  coords?: [number, number]       // for click, doubleClick, rightClick
  text?: string                    // for type (text to type) or done (final response)
  keys?: string[]                  // for hotkey (e.g. ["ctrl", "c"])
  key?: string                     // for keyPress (e.g. "enter")
  command?: string                 // for runCommand (PowerShell command)
  url?: string                     // for navigate (URL to open in current window)
  direction?: 'up' | 'down'       // for scroll
  amount?: number                  // for scroll (lines) or wait (ms)
  display?: number                 // for screenshot — monitor number (1-indexed from Display Setup)
  query?: string                    // for search (web search query)
  reason: string                   // human-readable, shown in ActionIsland
  risk?: RiskLevel                  // self-assessed risk level (from LLM)
}

/**
 * ActionResult — outcome of executing an action.
 */
export interface ActionResult {
  success: boolean
  screenshot?: Buffer              // post-action screenshot for observe step
  error?: string
  output?: string                  // stdout/stderr from runCommand
}

