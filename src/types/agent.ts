/**
 * Agent Types — shared type definitions for the renderer layer.
 *
 * Single source of truth for all agent-related types used by
 * composables and components. In the future, these will be
 * inferred from tRPC router output types.
 */

// ── Agent State Machine ──
// (ARCHITECTURE.md § The Orb → State Machine)

/** All possible states of the agent */
export type AgentState = 'idle' | 'listening' | 'processing' | 'acting' | 'warning'

// ── Current Action ──

/** Represents the current action being performed by the agent */
export interface ActionData {
  label: string
  progress: number // 0–100
}

// ── Microtasks ──
// (ARCHITECTURE.md § Microtasks)

/** Status of an individual microtask */
export type MicrotaskStatus = 'queued' | 'active' | 'done' | 'failed'

/** Single microtask data */
export interface Microtask {
  id: string
  text: string
  status: MicrotaskStatus
  createdAt: Date
}

// ── Permissions ──

/** Permission request for dangerous operations */
export interface PermissionRequest {
  id: string
  message: string
  riskLevel: 'medium' | 'high' | 'critical'
}

// ── Warnings ──

/** Critical warning / alert */
export interface Warning {
  id: string
  message: string
  /** User can dismiss (system errors = true, agent warnings = false) */
  dismissable: boolean
}

// ── Cursor Animation ──

/** Agent action animation payload — drives the overlay cursor */
export interface CursorAnimation {
  type: 'move-click' | 'move-doubleClick' | 'move-rightClick' | 'type' | 'scroll' | 'hide'
  x?: number
  y?: number
  text?: string
  direction?: 'up' | 'down'
}

// ── Agent Response / Thoughts ──

/** Type of agent output */
export type ResponseKind = 'response' | 'thoughts'

/** Agent response or thoughts transcription */
export interface AgentResponse {
  id: string
  kind: ResponseKind
  text: string
  /** Whether the response is still being streamed */
  streaming: boolean
}
