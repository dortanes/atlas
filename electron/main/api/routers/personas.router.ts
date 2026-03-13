import { observable } from '@trpc/server/observable'
import { z } from 'zod'
import { trpcRouter, publicProcedure } from '@electron/api/context'
import { createLogger } from '@electron/utils/logger'
import { mainEventBus } from '@electron/utils/eventBus'
import type { AgentProfile } from '@electron/services/persona/AgentProfile'
import type { PersonaService } from '@electron/services/persona/PersonaService'

const log = createLogger('personas.router')

/**
 * Module-level PersonaService reference.
 * Set by `setPersonaService()` after ServiceRegistry initializes.
 */
let personaService: PersonaService | null = null

/** Called from index.ts after PersonaService is registered */
export function setPersonaService(service: PersonaService): void {
  personaService = service
}

function ps(): PersonaService {
  if (!personaService) throw new Error('PersonaService not initialized')
  return personaService
}

/**
 * personas.router — CRUD + switching for agent personas.
 */
export const personasRouter = trpcRouter({

  /** List all personas */
  list: publicProcedure.query((): AgentProfile[] => {
    return ps().list()
  }),

  /** Get a single persona by ID */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }): AgentProfile | null => {
      return ps().get(input.id) ?? null
    }),

  /** Get the currently active persona */
  getActive: publicProcedure.query((): AgentProfile => {
    return ps().getActive()
  }),

  /** Create a new persona */
  create: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(50),
      avatar: z.string().min(1).max(10),
      personality: z.string().min(1).max(2000),
      ttsVoiceId: z.string().max(100).optional(),
    }))
    .mutation(({ input }): AgentProfile => {
      log.info(`Creating persona: "${input.name}"`)
      return ps().create(input)
    }),

  /** Update an existing persona */
  update: publicProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(50).optional(),
      avatar: z.string().min(1).max(10).optional(),
      personality: z.string().min(1).max(2000).optional(),
      ttsVoiceId: z.string().max(100).optional(),
    }))
    .mutation(({ input }): AgentProfile | null => {
      const { id, ...partial } = input
      log.info(`Updating persona: ${id}`)
      return ps().update(id, partial)
    }),

  /** Delete a persona (cannot delete default) */
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }): boolean => {
      log.info(`Deleting persona: ${input.id}`)
      return ps().delete(input.id)
    }),

  /** Switch the active persona */
  switch: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }): boolean => {
      log.info(`Switching to persona: ${input.id}`)
      return ps().switch(input.id)
    }),

  /** Subscribe to persona switch events */
  onSwitch: publicProcedure.subscription(() => {
    return observable<{ id: string; persona: AgentProfile }>((emit) => {
      function onSwitch(payload: { id: string; persona: AgentProfile }) {
        emit.next(payload)
      }

      mainEventBus.on('persona:switched', onSwitch)

      // Emit current active persona immediately
      try {
        const active = ps().getActive()
        emit.next({ id: active.id, persona: active })
      } catch {
        // Service not ready yet — will get first event on switch
      }

      return () => {
        mainEventBus.off('persona:switched', onSwitch)
      }
    })
  }),
})
