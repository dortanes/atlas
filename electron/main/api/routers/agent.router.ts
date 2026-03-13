import { observable } from '@trpc/server/observable'
import { z } from 'zod'
import { trpcRouter, publicProcedure } from '@electron/api/context'
import { mainEventBus } from '@electron/utils/eventBus'
import { createLogger } from '@electron/utils/logger'
import type { AgentService, ActionLogEntry } from '@electron/services/agent/AgentService'

const log = createLogger('agent.router')

/** Module-level service reference (set after init) */
let agentService: AgentService | null = null

export function setAgentService(service: AgentService): void {
  agentService = service
}

/**
 * Agent states matching the renderer OrbState type.
 */
export type AgentState = 'idle' | 'listening' | 'processing' | 'acting' | 'warning'

/**
 * agent.router — agent state, control, and event endpoints.
 *
 * Mutations emit events on `mainEventBus` for consumption by
 * the future AgentService (Phase 3).
 *
 * Subscriptions listen to `mainEventBus` events emitted by services
 * and forward them to the renderer via tRPC.
 */
export const agentRouter = trpcRouter({

  // ── Mutations ──

  /** Send a text command to the agent */
  sendCommand: publicProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(({ input }) => {
      log.info('Command received:', input.text)
      mainEventBus.emit('agent:command', { text: input.text })
      return { ok: true }
    }),

  /** Respond to a permission request */
  respondPermission: publicProcedure
    .input(z.object({ id: z.string(), allowed: z.boolean() }))
    .mutation(({ input }) => {
      log.info(`Permission response: id=${input.id}, allowed=${input.allowed}`)
      mainEventBus.emit('agent:permission-response', { id: input.id, allowed: input.allowed })
      return { ok: true }
    }),

  /** Dismiss a warning */
  dismissWarning: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      log.info(`Warning dismissed: id=${input.id}`)
      mainEventBus.emit('agent:dismiss-warning', { id: input.id })
      return { ok: true }
    }),

  // ── Subscriptions ──

  /** Subscribe to agent state changes */
  onStateChange: publicProcedure.subscription(() => {
    return observable<{ state: AgentState }>((emit) => {
      function onState(state: AgentState) {
        emit.next({ state })
      }

      mainEventBus.on('agent:state', onState)

      // Emit initial state
      emit.next({ state: 'idle' })

      return () => {
        mainEventBus.off('agent:state', onState)
      }
    })
  }),

  /** Subscribe to current action updates */
  onAction: publicProcedure.subscription(() => {
    return observable<{ action: { label: string; progress: number } | null }>((emit) => {
      function onAction(action: { label: string; progress: number } | null) {
        emit.next({ action })
      }

      mainEventBus.on('agent:action', onAction)

      // No action initially
      emit.next({ action: null })

      return () => {
        mainEventBus.off('agent:action', onAction)
      }
    })
  }),

  /** Subscribe to streaming response chunks */
  onResponse: publicProcedure.subscription(() => {
    return observable<{
      id: string
      kind: 'response' | 'thoughts'
      text: string
      streaming: boolean
      done: boolean
    }>((emit) => {
      function onResponse(payload: {
        id: string
        kind: 'response' | 'thoughts'
        text: string
        streaming: boolean
        done: boolean
      }) {
        emit.next(payload)
      }

      mainEventBus.on('agent:response', onResponse)

      return () => {
        mainEventBus.off('agent:response', onResponse)
      }
    })
  }),

  /** Subscribe to microtask list updates */
  onMicrotasks: publicProcedure.subscription(() => {
    return observable<{
      tasks: Array<{
        id: string
        text: string
        status: 'queued' | 'active' | 'done' | 'failed'
        createdAt: string
      }>
    }>((emit) => {
      function onMicrotasks(tasks: Array<{
        id: string
        text: string
        status: 'queued' | 'active' | 'done' | 'failed'
        createdAt: string
      }>) {
        emit.next({ tasks })
      }

      mainEventBus.on('agent:microtasks', onMicrotasks)

      // Empty list initially
      emit.next({ tasks: [] })

      return () => {
        mainEventBus.off('agent:microtasks', onMicrotasks)
      }
    })
  }),

  /** Subscribe to search result events */
  onSearchResults: publicProcedure.subscription(() => {
    return observable<{
      query: string
      results: Array<{ title: string; url: string; snippet: string }>
      searching: boolean
    }>((emit) => {
      function onSearchResults(payload: {
        query: string
        results: Array<{ title: string; url: string; snippet: string }>
        searching: boolean
      }) {
        emit.next(payload)
      }

      mainEventBus.on('agent:search-results', onSearchResults)

      return () => {
        mainEventBus.off('agent:search-results', onSearchResults)
      }
    })
  }),

  /** Subscribe to permission requests */
  onPermission: publicProcedure.subscription(() => {
    return observable<{
      permission: { id: string; message: string; riskLevel: 'medium' | 'high' | 'critical' }
    }>((emit) => {
      function onPermission(permission: {
        id: string
        message: string
        riskLevel: 'medium' | 'high' | 'critical'
      }) {
        emit.next({ permission })
      }

      mainEventBus.on('agent:permission', onPermission)

      return () => {
        mainEventBus.off('agent:permission', onPermission)
      }
    })
  }),

  /** Subscribe to warnings */
  onWarning: publicProcedure.subscription(() => {
    return observable<{
      warning: { id: string; message: string; dismissable: boolean }
    }>((emit) => {
      function onWarning(warning: { id: string; message: string; dismissable?: boolean }) {
        emit.next({ warning: { ...warning, dismissable: warning.dismissable ?? false } })
      }

      mainEventBus.on('agent:warning', onWarning)

      return () => {
        mainEventBus.off('agent:warning', onWarning)
      }
    })
  }),

  /** Subscribe to auto-dismiss events (backend tells frontend to remove a warning) */
  onWarningDismiss: publicProcedure.subscription(() => {
    return observable<{ id: string }>((emit) => {
      function onDismiss(payload: { id: string }) {
        emit.next({ id: payload.id })
      }

      mainEventBus.on('agent:dismiss-warning', onDismiss)

      return () => {
        mainEventBus.off('agent:dismiss-warning', onDismiss)
      }
    })
  }),

  // ── Action Logs ──

  /** Get action logs for a persona */
  getActionLogs: publicProcedure
    .input(z.object({ personaId: z.string() }))
    .query(({ input }): ActionLogEntry[] => {
      if (!agentService) return []
      return agentService.getActionLogs(input.personaId)
    }),

  /** Clear action logs for a persona */
  clearActionLogs: publicProcedure
    .input(z.object({ personaId: z.string() }))
    .mutation(({ input }): boolean => {
      if (!agentService) return false
      agentService.clearActionLogs(input.personaId)
      return true
    }),
})
