import { trpcRouter } from './context'
import { systemRouter } from './routers/system.router'
import { agentRouter } from './routers/agent.router'
import { audioRouter } from './routers/audio.router'
import { settingsRouter } from './routers/settings.router'
import { personasRouter } from './routers/personas.router'
import { memoryRouter } from './routers/memory.router'
import { factsRouter } from './routers/facts.router'

/**
 * Root tRPC router — merges all sub-routers.
 *
 * Each sub-router is namespaced by key:
 *   api.system.getSystemInfo()
 *   api.agent.sendCommand()
 *   api.audio.startListening()
 *   api.settings.getConfig()
 *   api.personas.list()
 *   api.memory.listSessions()
 *   api.facts.list()
 */
export const router = trpcRouter({
  system: systemRouter,
  agent: agentRouter,
  audio: audioRouter,
  settings: settingsRouter,
  personas: personasRouter,
  memory: memoryRouter,
  facts: factsRouter,
})

export type AppRouter = typeof router