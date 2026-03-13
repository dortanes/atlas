import { z } from 'zod'
import { trpcRouter, publicProcedure } from '@electron/api/context'
import { createLogger } from '@electron/utils/logger'
import type { FactService, Fact } from '@electron/services/memory/FactService'
import { getConfig } from '@electron/utils/config'

const log = createLogger('facts.router')

let factService: FactService | null = null

export function setFactService(service: FactService): void {
  factService = service
}

function fs(): FactService {
  if (!factService) throw new Error('FactService not initialized')
  return factService
}

function activePersonaId(): string {
  return getConfig().activePersonaId
}

/**
 * facts.router — per-persona fact CRUD.
 */
export const factsRouter = trpcRouter({

  /** List all facts for the active persona */
  list: publicProcedure
    .input(z.object({ personaId: z.string().optional() }).optional())
    .query(({ input }): Fact[] => {
      const pid = input?.personaId ?? activePersonaId()
      return fs().getFacts(pid)
    }),

  /** Manually add a fact */
  add: publicProcedure
    .input(z.object({ text: z.string().min(1).max(500), personaId: z.string().optional() }))
    .mutation(({ input }): Fact => {
      const pid = input.personaId ?? activePersonaId()
      log.info(`Adding fact for ${pid}: "${input.text.slice(0, 50)}"`)
      return fs().addFact(pid, input.text, 'manual')
    }),

  /** Update a fact */
  update: publicProcedure
    .input(z.object({ id: z.string(), text: z.string().min(1).max(500), personaId: z.string().optional() }))
    .mutation(({ input }): Fact | null => {
      const pid = input.personaId ?? activePersonaId()
      log.info(`Updating fact ${input.id}`)
      return fs().updateFact(pid, input.id, input.text)
    }),

  /** Delete a fact */
  delete: publicProcedure
    .input(z.object({ id: z.string(), personaId: z.string().optional() }))
    .mutation(({ input }): boolean => {
      const pid = input.personaId ?? activePersonaId()
      log.info(`Deleting fact ${input.id}`)
      return fs().deleteFact(pid, input.id)
    }),

  /** Clear all facts for the active persona */
  clear: publicProcedure
    .input(z.object({ personaId: z.string().optional() }).optional())
    .mutation(({ input }): boolean => {
      const pid = input?.personaId ?? activePersonaId()
      log.info(`Clearing all facts for ${pid}`)
      fs().clearFacts(pid)
      return true
    }),
})
