import { z } from 'zod'
import { app } from 'electron'
import { observable } from '@trpc/server/observable'
import { trpcRouter, publicProcedure } from '@electron/api/context'
import { getConfig, saveConfig, defaultConfig, type AppConfig } from '@electron/utils/config'
import { mainEventBus } from '@electron/utils/eventBus'
import { PromptLoader } from '@electron/services/intelligence/PromptLoader'
import { openLogsFolder } from '@electron/utils/sessionLogger'

const promptLoader = new PromptLoader()

/**
 * settings.router — config & prompt management.
 *
 * Config: read / write AppConfig (persisted to Config).
 * Prompts: list / read / save / reset .md prompt templates.
 */

const uiSchema = z.object({
  positionSide: z.enum(['left', 'right', 'center']).optional(),
  openDevTools: z.boolean().optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  debugLog: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  soundVolume: z.number().min(0).max(1).optional(),
}).optional()

const llmSchema = z.object({
  provider: z.string().optional(),
  baseURL: z.string().optional(),
  apiKey: z.string().optional(),
  textModel: z.string().optional(),
  visionModel: z.string().optional(),
  classifierModel: z.string().optional(),
}).optional()

const generationSchema = z.object({
  chatTemperature: z.number().min(0).max(2).optional(),
  chatTopP: z.number().min(0).max(1).optional(),
  chatTopK: z.number().int().min(1).optional(),
  chatMaxTokens: z.number().int().min(1).optional(),
  visionTemperature: z.number().min(0).max(2).optional(),
  visionMaxTokens: z.number().int().min(1).optional(),
}).optional()

const ttsSchema = z.object({
  provider: z.string().optional(),
  apiKey: z.string().optional(),
  voiceId: z.string().optional(),
  model: z.string().optional(),
  enabled: z.boolean().optional(),
}).optional()

const agentSchema = z.object({
  maxIterations: z.number().int().min(1).optional(),
  maxConsecutiveFailures: z.number().int().min(1).optional(),
  preActionDelay: z.number().int().min(0).optional(),
  postActionDelay: z.number().int().min(0).optional(),
  maxContextMessages: z.number().int().min(1).optional(),
  commandTimeout: z.number().int().min(1000).optional(),
  screenshotMaxWidth: z.number().int().min(640).optional(),
  screenshotQuality: z.number().int().min(1).max(100).optional(),
}).optional()

const sttSchema = z.object({
  enabled: z.boolean().optional(),
  language: z.string().optional(),
}).optional()

export const settingsRouter = trpcRouter({
  /** Get full current config */
  getConfig: publicProcedure.query((): AppConfig => {
    return getConfig()
  }),

  /** Save partial config updates → disk + notify subscribers */
  saveConfig: publicProcedure
    .input(z.object({
      ui: uiSchema,
      llm: llmSchema,
      generation: generationSchema,
      tts: ttsSchema,
      stt: sttSchema,
      agent: agentSchema,
      hotkey: z.string().optional(),
      activePersonaId: z.string().optional(),
    }))
    .mutation(({ input }) => {
      // Prevent stale activePersonaId from the frontend overwriting the
      // value set by PersonaService.switch() — persona switching has its
      // own dedicated API, settings save should never change it.
      const { activePersonaId: _ignored, ...safeInput } = input
      saveConfig(safeInput)
      const updated = getConfig()
      mainEventBus.emit('config:changed', updated)
      return updated
    }),

  /** Subscribe to config changes */
  onConfigChange: publicProcedure.subscription(() => {
    return observable<AppConfig>((emit) => {
      const handler = (config: AppConfig) => emit.next(config)
      mainEventBus.on('config:changed', handler)
      return () => {
        mainEventBus.removeListener('config:changed', handler)
      }
    })
  }),

  /** List available prompt names */
  listPrompts: publicProcedure
    .input(z.object({ personaId: z.string().optional() }).optional())
    .query(({ input }): string[] => {
      return promptLoader.list(input?.personaId)
    }),

  /** Get prompt content by name */
  getPrompt: publicProcedure
    .input(z.object({ name: z.string(), personaId: z.string().optional() }))
    .query(({ input }): string => {
      return promptLoader.load(input.name, undefined, input.personaId)
    }),

  /** Save prompt content */
  savePrompt: publicProcedure
    .input(z.object({ name: z.string(), content: z.string(), personaId: z.string().optional() }))
    .mutation(({ input }) => {
      promptLoader.save(input.name, input.content, input.personaId)
      mainEventBus.emit('prompt:saved', { name: input.name, personaId: input.personaId })
      return true
    }),

  /** Reset prompt to bundled default */
  resetPrompt: publicProcedure
    .input(z.object({ name: z.string(), personaId: z.string().optional() }))
    .mutation(({ input }) => {
      promptLoader.reset(input.name, input.personaId)
      mainEventBus.emit('prompt:saved', { name: input.name, personaId: input.personaId })
      return promptLoader.load(input.name, undefined, input.personaId)
    }),

  /** Open session logs folder in OS file manager */
  openSessionLogs: publicProcedure.mutation(async () => {
    await openLogsFolder()
    return true
  }),

  /** Open full log file in OS default application */
  openLogFile: publicProcedure.mutation(async () => {
    const { openLogFile } = await import('@electron/utils/logger')
    await openLogFile()
    return true
  }),

  /** Reset a config section to factory defaults */
  resetSection: publicProcedure
    .input(z.object({ section: z.enum(['ui', 'llm', 'generation', 'tts', 'stt', 'agent']) }))
    .mutation(({ input }) => {
      const defaults = defaultConfig[input.section]
      saveConfig({ [input.section]: defaults } as Partial<AppConfig>)
      const updated = getConfig()
      mainEventBus.emit('config:changed', updated)
      return updated
    }),

  /** Get app version from package.json */
  getAppVersion: publicProcedure.query(() => {
    return {
      version: app.getVersion(),
      name: app.getName(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    }
  }),
})
