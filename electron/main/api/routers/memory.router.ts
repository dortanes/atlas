import { z } from 'zod'
import { trpcRouter, publicProcedure } from '@electron/api/context'
import { createLogger } from '@electron/utils/logger'
import type { MemoryService } from '@electron/services/memory/MemoryService'
import type { SessionMeta, ConversationSession } from '@electron/services/memory/MemoryTypes'
import { getConfig } from '@electron/utils/config'
import { mainEventBus } from '@electron/utils/eventBus'

const log = createLogger('memory.router')

/** Module-level service reference (set after init) */
let memoryService: MemoryService | null = null

export function setMemoryService(service: MemoryService): void {
  memoryService = service
}

function ms(): MemoryService {
  if (!memoryService) throw new Error('MemoryService not initialized')
  return memoryService
}

function activePersonaId(): string {
  return getConfig().activePersonaId
}

/**
 * memory.router — conversation session management.
 */
export const memoryRouter = trpcRouter({

  /** List sessions for the active persona */
  listSessions: publicProcedure
    .input(z.object({ personaId: z.string().optional() }).optional())
    .query(({ input }): SessionMeta[] => {
      const pid = input?.personaId ?? activePersonaId()
      return ms().listSessions(pid)
    }),

  /** Get a full session with messages */
  getSession: publicProcedure
    .input(z.object({ sessionId: z.string(), personaId: z.string().optional() }))
    .query(({ input }): ConversationSession | null => {
      const pid = input.personaId ?? activePersonaId()
      return ms().getSession(pid, input.sessionId)
    }),

  /** Delete a single session */
  deleteSession: publicProcedure
    .input(z.object({ sessionId: z.string(), personaId: z.string().optional() }))
    .mutation(({ input }): boolean => {
      const pid = input.personaId ?? activePersonaId()
      log.info(`Deleting session ${input.sessionId}`)
      return ms().deleteSession(pid, input.sessionId)
    }),

  /** Delete all sessions for the active persona */
  clearSessions: publicProcedure
    .input(z.object({ personaId: z.string().optional() }).optional())
    .mutation(({ input }): boolean => {
      const pid = input?.personaId ?? activePersonaId()
      log.info(`Clearing all sessions for persona ${pid}`)
      ms().clearSessions(pid)
      // Reset AgentService in-memory history
      mainEventBus.emit('agent:newSession')
      return true
    }),

  /** Start a new conversation */
  newSession: publicProcedure
    .input(z.object({ personaId: z.string().optional() }).optional())
    .mutation(({ input }): SessionMeta => {
      const pid = input?.personaId ?? activePersonaId()
      log.info(`Starting new session for persona ${pid}`)
      const session = ms().newSession(pid)
      // Reset AgentService in-memory history
      mainEventBus.emit('agent:newSession')
      return {
        id: session.id,
        personaId: session.personaId,
        title: session.title,
        messageCount: 0,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }
    }),
})
