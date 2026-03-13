import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { BaseService } from '@electron/services/base/BaseService'
import type { LLMMessage } from '@electron/services/intelligence/providers/BaseLLMProvider'
import type { ConversationSession, SessionMeta } from './MemoryTypes'

/** Max messages sent to LLM (full history stays on disk) */
import { getConfig } from '@electron/utils/config'

/**
 * MemoryService — per-persona conversation persistence.
 *
 * Storage layout: `userData/memory/{personaId}/{sessionId}.json`
 *
 * Each persona has its own directory of session files.
 * The "active" session per persona is tracked in-memory.
 *
 * Auto-new-session triggers:
 * - App restart (activeSessions cache is empty → evaluates disk)
 * - 30 min inactivity timeout
 * - Manual "New Conversation" from UI
 */
export class MemoryService extends BaseService {
  private baseDir = ''
  private activeSessions = new Map<string, ConversationSession>()
  private maxContext = getConfig().agent.maxContextMessages

  async init(): Promise<void> {
    this.baseDir = path.join(app.getPath('userData'), 'memory')
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
    this.log.info('MemoryService initialized')
  }

  async dispose(): Promise<void> {
    // Flush all active sessions
    const sessions = Array.from(this.activeSessions.values())
    for (const session of sessions) {
      this.saveSession(session)
    }
    this.activeSessions.clear()
    this.log.info('MemoryService disposed')
  }

  // ── Persona directory ──

  private personaDir(personaId: string): string {
    return path.join(this.baseDir, personaId)
  }

  private ensurePersonaDir(personaId: string): void {
    const dir = this.personaDir(personaId)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  // ── Active Session ──

  /**
   * Get the active session for a persona.
   *
   * Creates a new session if:
   * - No sessions exist on disk
   * - The most recent session is older than 30 min (timeout)
   * - App just started (cache is empty, so disk session goes through timeout check)
   *
   * Empty sessions (0 messages) are reused instead of creating duplicates.
   */
  getActiveSession(personaId: string): ConversationSession {
    // Check in-memory cache first (within same app run)
    const cached = this.activeSessions.get(personaId)
    if (cached) return cached

    // Cold start (app just launched) — always start a new session.
    // Only reuse truly empty sessions (no messages yet).
    const files = this.listSessionFiles(personaId)
    if (files.length > 0) {
      const newest = this.loadSession(personaId, files[0].id)
      if (newest && newest.messages.length === 0) {
        // Reuse empty session
        this.activeSessions.set(personaId, newest)
        this.log.debug(`Reusing empty session "${newest.id}" for persona ${personaId}`)
        return newest
      }
    }

    // Create fresh session
    return this.newSession(personaId)
  }

  /**
   * Get messages from the active session, trimmed for LLM context window.
   */
  getContextMessages(personaId: string): LLMMessage[] {
    const session = this.getActiveSession(personaId)
    return this.trimContext(session.messages)
  }

  /**
   * Append a user+model exchange to the active session and auto-save.
   */
  appendMessages(personaId: string, userMsg: LLMMessage, modelMsg: LLMMessage): void {
    const session = this.getActiveSession(personaId)

    // Auto-generate title from first user message
    if (session.messages.length === 0 && userMsg.text) {
      session.title = userMsg.text.slice(0, 60).trim() || 'Untitled'
    }

    session.messages.push(userMsg, modelMsg)
    session.updatedAt = new Date().toISOString()
    this.saveSession(session)
  }

  /**
   * Start a new conversation session for a persona.
   * The previous active session is saved and detached.
   */
  newSession(personaId: string): ConversationSession {
    // Save previous active session if it has messages
    const prev = this.activeSessions.get(personaId)
    if (prev && prev.messages.length > 0) {
      this.saveSession(prev)
    }

    const session: ConversationSession = {
      id: randomUUID(),
      personaId,
      title: 'New Conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    this.ensurePersonaDir(personaId)
    this.activeSessions.set(personaId, session)
    this.saveSession(session)
    this.log.info(`New session created for persona ${personaId}: ${session.id}`)
    return session
  }

  // ── Session CRUD ──

  /** List all sessions for a persona (newest first) */
  listSessions(personaId: string): SessionMeta[] {
    return this.listSessionFiles(personaId).map((f) => {
      const session = this.loadSession(personaId, f.id)
      if (!session) return null
      return {
        id: session.id,
        personaId: session.personaId,
        title: session.title,
        messageCount: session.messages.length,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      } as SessionMeta
    }).filter(Boolean) as SessionMeta[]
  }

  /** Load a full session from disk */
  getSession(personaId: string, sessionId: string): ConversationSession | null {
    return this.loadSession(personaId, sessionId)
  }

  /** Delete a single session */
  deleteSession(personaId: string, sessionId: string): boolean {
    const filePath = path.join(this.personaDir(personaId), `${sessionId}.json`)
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        // If it was active, clear it
        const active = this.activeSessions.get(personaId)
        if (active?.id === sessionId) {
          this.activeSessions.delete(personaId)
        }
        this.log.info(`Deleted session ${sessionId}`)
        return true
      }
    } catch (err) {
      this.log.error(`Failed to delete session ${sessionId}:`, err)
    }
    return false
  }

  /** Delete all sessions for a persona */
  clearSessions(personaId: string): void {
    const dir = this.personaDir(personaId)
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true })
        fs.mkdirSync(dir, { recursive: true })
      }
    } catch (err) {
      this.log.error(`Failed to clear sessions for ${personaId}:`, err)
    }
    this.activeSessions.delete(personaId)
    this.log.info(`Cleared all sessions for persona ${personaId}`)
  }

  /** Delete all memory for a persona (called when persona is deleted) */
  deletePersonaMemory(personaId: string): void {
    const dir = this.personaDir(personaId)
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    } catch (err) {
      this.log.error(`Failed to delete persona memory: ${personaId}`, err)
    }
    this.activeSessions.delete(personaId)
    this.log.info(`Deleted all memory for persona ${personaId}`)
  }

  // ── Private helpers ──

  /** Trim messages to fit context window (keep newest, drop oldest) */
  private trimContext(messages: LLMMessage[]): LLMMessage[] {
    if (messages.length <= this.maxContext) return [...messages]
    return messages.slice(-this.maxContext)
  }

  /** List session files for a persona, sorted newest-first by mtime */
  private listSessionFiles(personaId: string): { id: string; mtime: number }[] {
    const dir = this.personaDir(personaId)
    if (!fs.existsSync(dir)) return []

    try {
      return fs.readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          const filePath = path.join(dir, f)
          const stats = fs.statSync(filePath)
          return { id: f.replace('.json', ''), mtime: stats.mtimeMs }
        })
        .sort((a, b) => b.mtime - a.mtime)
    } catch {
      return []
    }
  }

  /** Load a session from its JSON file */
  private loadSession(personaId: string, sessionId: string): ConversationSession | null {
    const filePath = path.join(this.personaDir(personaId), `${sessionId}.json`)
    try {
      if (!fs.existsSync(filePath)) return null
      const raw = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(raw) as ConversationSession
    } catch (err) {
      this.log.error(`Failed to load session ${sessionId}:`, err)
      return null
    }
  }

  /** Save a session to its JSON file */
  private saveSession(session: ConversationSession): void {
    this.ensurePersonaDir(session.personaId)
    const filePath = path.join(this.personaDir(session.personaId), `${session.id}.json`)
    try {
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8')
    } catch (err) {
      this.log.error(`Failed to save session ${session.id}:`, err)
    }
  }
}
