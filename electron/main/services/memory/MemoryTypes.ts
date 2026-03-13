import type { LLMMessage } from '@electron/services/intelligence/providers/BaseLLMProvider'

/**
 * A single conversation session.
 *
 * Sessions are stored as `userData/memory/{personaId}/{sessionId}.json`.
 */
export interface ConversationSession {
  id: string
  personaId: string
  title: string
  messages: LLMMessage[]
  createdAt: string
  updatedAt: string
}

/** Lightweight metadata for listing sessions without loading messages */
export interface SessionMeta {
  id: string
  personaId: string
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string
}
