import { app, BrowserWindow } from 'electron'
import { ServiceRegistry } from './services/ServiceRegistry'
import { IntelligenceService } from './services/intelligence/IntelligenceService'
import { TTSService } from './services/tts/TTSService'
import { AgentService } from './services/agent/AgentService'
import { HotkeyService } from './services/hotkey/HotkeyService'
import { PersonaService } from './services/persona/PersonaService'
import { MemoryService } from './services/memory/MemoryService'
import { FactService } from './services/memory/FactService'
import { VisionService } from './services/vision/VisionService'
import { MotorService } from './services/motor/MotorService'
import { SearchService } from './services/search/SearchService'
import { setPersonaService } from './api/routers/personas.router'
import { setMemoryService } from './api/routers/memory.router'
import { setFactService } from './api/routers/facts.router'
import { setAgentService } from './api/routers/agent.router'
import { createLogger } from './utils/logger'
import { loadConfig } from './utils/config'
import { mainEventBus } from './utils/eventBus'
import { createWindow, toggleWindow, clearWindow } from './WindowManager'
import { createTray } from './TrayManager'

// Side-effect: sets process.env paths on import
import './utils/paths'

const log = createLogger('Main')

// ── Platform Setup ──

if (process.platform === 'win32') app.setAppUserModelId('com.dortanes.atlas')

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// ── Service Registry ──

const services = new ServiceRegistry()

// ── App Lifecycle ──

app.whenReady().then(async () => {
  log.info('Atlas starting...')

  loadConfig()

  // Register services (order matters: dependencies first)
  const intelligence = new IntelligenceService()
  const persona = new PersonaService()
  const memory = new MemoryService()
  const facts = new FactService()
  const tts = new TTSService()
  const vision = new VisionService(intelligence)
  const motor = new MotorService()
  const searchService = new SearchService()

  // Wire cross-service dependencies
  persona.setMemoryService(memory)
  persona.setFactService(facts)
  tts.setPersonaService(persona)

  services.register('intelligence', intelligence)
  services.register('tts', tts)
  services.register('persona', persona)
  services.register('memory', memory)
  services.register('facts', facts)
  services.register('vision', vision)
  services.register('motor', motor)
  services.register('search', searchService)
  const agent = new AgentService(intelligence, persona, memory, facts, vision, motor, searchService)
  services.register('agent', agent)
  services.register('hotkey', new HotkeyService())

  // Wire services into tRPC routers
  setPersonaService(persona)
  setMemoryService(memory)
  setFactService(facts)
  setAgentService(agent)

  await services.initAll()
  await createWindow()
  createTray(persona)

  // Global hotkey → toggle window visibility
  mainEventBus.on('hotkey:toggle-atlas', () => toggleWindow())

  log.info('Atlas ready')
})

app.on('window-all-closed', () => {
  clearWindow()
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    const main = allWindows[0]
    if (main.isMinimized()) main.restore()
    main.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

app.on('before-quit', async () => {
  log.info('Shutting down services...')
  await services.disposeAll()
})


