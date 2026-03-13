import path from 'node:path'
import { Tray, Menu, nativeImage, app } from 'electron'
import { getConfig } from './utils/config'
import { createLogger } from './utils/logger'
import { mainEventBus } from './utils/eventBus'
import { toggleWindow, getWindow } from './WindowManager'
import type { PersonaService } from './services/persona/PersonaService'

/**
 * TrayManager — system tray icon and context menu.
 *
 * Provides:
 * - Show/Hide Atlas (left-click or menu)
 * - Personas submenu (switch active persona)
 * - Settings (opens settings overlay)
 * - Toggle AlwaysOnTop
 * - Toggle DevTools
 * - Reset Position
 * - Quit
 */

const log = createLogger('TrayManager')

let tray: Tray | null = null
let personaServiceRef: PersonaService | null = null

function getTrayIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tray.png')
  }
  return path.join(app.getAppPath(), 'build', 'tray.png')
}

export function createTray(personaService?: PersonaService): void {
  personaServiceRef = personaService ?? null
  const icon = nativeImage.createFromPath(getTrayIconPath()).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('Atlas')

  buildContextMenu()

  // Left-click on tray icon toggles window
  tray.on('click', () => toggleWindow())

  // Rebuild menu when persona list or active persona changes
  mainEventBus.on('persona:switched', () => buildContextMenu())

  log.info('System tray created')
}

/** Rebuild the context menu (call after persona changes) */
export function rebuildTray(): void {
  buildContextMenu()
}

function buildContextMenu(): void {
  if (!tray) return

  const activePersonaId = getConfig().activePersonaId
  const personas = personaServiceRef?.list() ?? []

  const personaSubmenu = personas.map((p) => ({
    label: `${p.avatar} ${p.name}`,
    type: 'radio' as const,
    checked: p.id === activePersonaId,
    click: () => {
      if (p.id !== activePersonaId) {
        personaServiceRef?.switch(p.id)
      }
    },
  }))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide Atlas',
      click: () => toggleWindow(),
    },
    { type: 'separator' },
    {
      label: 'Personas',
      submenu: personaSubmenu.length > 0
        ? personaSubmenu
        : [{ label: 'No personas', enabled: false }],
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        mainEventBus.emit('system:open-settings')
      },
    },
    { type: 'separator' },
    {
      label: 'Toggle AlwaysOnTop',
      type: 'checkbox',
      checked: getConfig().ui.alwaysOnTop,
      click: (item) => {
        getWindow()?.setAlwaysOnTop(item.checked)
      },
    },
    {
      label: 'Toggle DevTools',
      click: () => {
        getWindow()?.webContents.toggleDevTools()
      },
    },
    { type: 'separator' },
    {
      label: 'Reset Position',
      click: () => {
        getWindow()?.center()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Atlas',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
}
