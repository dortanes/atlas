import { EventEmitter } from 'node:events'

/**
 * Main-process event bus for cross-module communication.
 *
 * Bridges events between services, tRPC routers, and Electron
 * lifecycle code without tight coupling.
 *
 * Naming convention: `domain:event` (e.g. `agent:state`)
 */
export const mainEventBus = new EventEmitter()

// ── Event Types ──

export interface MainEvents {
  /** Agent UI visibility toggled from tray */
  'agent-visibility': [visible: boolean]

  // ── Agent Events (emitted by future AgentService, consumed by agent.router) ──

  /** Agent state transition */
  'agent:state': [state: string]
  /** Current action update (label + progress) */
  'agent:action': [action: { label: string; progress: number } | null]
  /** Streaming response chunk */
  'agent:response': [payload: {
    id: string
    kind: 'response' | 'thoughts'
    text: string
    streaming: boolean
    done: boolean
  }]
  /** Full microtask list update */
  'agent:microtasks': [tasks: Array<{
    id: string
    text: string
    status: 'queued' | 'active' | 'done' | 'failed'
    createdAt: string
  }>]
  /** New permission request */
  'agent:permission': [permission: {
    id: string
    message: string
    riskLevel: 'medium' | 'high' | 'critical'
  }]
  /** Permission response from user */
  'agent:permission-response': [payload: { id: string; allowed: boolean }]
  /** New warning */
  'agent:warning': [warning: { id: string; message: string; dismissable?: boolean }]
  /** Dismiss warning from user */
  'agent:dismiss-warning': [payload: { id: string }]
  /** Action log entry from completed action loop */
  'agent:action-log': [entry: {
    personaId: string
    command: string
    timestamp: string
    entries: string[]
  }]
  /** User command from InputBar */
  'agent:command': [payload: { text: string }]
  /** Start a new conversation session */
  'agent:newSession': []
  /** Ephemeral action loop steps (displayed in MicrotaskIsland alongside queued tasks) */
  'agent:action-steps': [steps: Array<{
    id: string
    text: string
    status: 'queued' | 'active' | 'done' | 'failed'
    createdAt: string
  }>]
  /** Search results from web search action */
  'agent:search-results': [payload: {
    query: string
    results: Array<{ title: string; url: string; snippet: string }>
    searching: boolean
  }]

  // ── Hotkey Events ──

  /** Global hotkey: toggle Atlas visibility + InputBar */
  'hotkey:toggle-atlas': []

  // ── Audio Events (Phase 5 placeholder) ──

  /** Transcript chunk from STT */
  'audio:transcript': [payload: { text: string; isFinal: boolean }]
  /** Listening state change */
  'audio:listening': [listening: boolean]

  // ── Persona Events ──

  /** Active persona switched */
  'persona:switched': [payload: { id: string; persona: import('@electron/services/persona/AgentProfile').AgentProfile }]

  // ── TTS Events (Phase 3.5) ──

  /** TTS speaking status changed */
  'tts:status': [payload: { speaking: boolean }]
  /** TTS audio chunk (streaming) */
  'tts:audio': [payload: { chunk: Buffer; done: boolean }]
  /** Request TTS to speak text */
  'tts:speak': [payload: { text: string }]
  /** Request TTS to stop */
  'tts:stop': []
}
