import { ref } from 'vue'
import { api } from '@/api'

/**
 * Session metadata (no messages, for listing).
 */
export interface SessionMeta {
  id: string
  personaId: string
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface LLMMessage {
  role: 'user' | 'model'
  text: string
}

export interface ConversationSession {
  id: string
  personaId: string
  title: string
  messages: LLMMessage[]
  createdAt: string
  updatedAt: string
}

// ── Singleton State ──

const sessions = ref<SessionMeta[]>([])
const loading = ref(false)

// ── Composable ──

export function useMemory() {
  /** Load session list for a specific persona (falls back to active persona on backend) */
  async function loadSessions(personaId?: string) {
    loading.value = true
    try {
      sessions.value = await api.memory.listSessions.query(personaId ? { personaId } : undefined)
    } catch (err) {
      console.error('[useMemory] Failed to load sessions:', err)
    } finally {
      loading.value = false
    }
  }

  /** Get full session with messages */
  async function getSession(sessionId: string, personaId?: string): Promise<ConversationSession | null> {
    try {
      return await api.memory.getSession.query({ sessionId, personaId })
    } catch (err) {
      console.error('[useMemory] Failed to get session:', err)
      return null
    }
  }

  /** Delete a single session */
  async function deleteSession(sessionId: string, personaId?: string) {
    try {
      const ok = await api.memory.deleteSession.mutate({ sessionId, personaId })
      if (ok) {
        sessions.value = sessions.value.filter((s) => s.id !== sessionId)
      }
      return ok
    } catch (err) {
      console.error('[useMemory] Failed to delete session:', err)
      return false
    }
  }

  /** Clear all sessions for a persona */
  async function clearSessions(personaId?: string) {
    try {
      await api.memory.clearSessions.mutate(personaId ? { personaId } : undefined)
      sessions.value = []
      return true
    } catch (err) {
      console.error('[useMemory] Failed to clear sessions:', err)
      return false
    }
  }

  /** Start a new conversation */
  async function newSession(personaId?: string) {
    try {
      const meta = await api.memory.newSession.mutate(personaId ? { personaId } : undefined)
      sessions.value.unshift(meta)
      return meta
    } catch (err) {
      console.error('[useMemory] Failed to create new session:', err)
      return null
    }
  }

  return {
    sessions,
    loading,
    loadSessions,
    getSession,
    deleteSession,
    clearSessions,
    newSession,
  }
}
