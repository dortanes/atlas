import { BrowserWindow, shell, screen } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createIPCHandler } from 'electron-trpc/main'
import { router } from './api'
import { getConfig } from './utils/config'
import { createLogger } from './utils/logger'
import { mainEventBus } from './utils/eventBus'
import { preload, indexHtml, VITE_DEV_SERVER_URL } from './utils/paths'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * WindowManager — Electron window creation and visibility management.
 *
 * Handles:
 * - BrowserWindow creation (transparent overlay)
 * - Active-monitor positioning (cursor-based)
 * - Show/hide toggle with animation coordination
 * - Ensures window is visible when settings are opened from tray
 */

const log = createLogger('WindowManager')

let win: BrowserWindow | null = null
let isAgentVisible = true

// ── Multi-Monitor Positioning ──

/** Returns work-area bounds (excludes taskbar) for the display under the cursor. */
function getActiveDisplayBounds() {
  const cursor = screen.getCursorScreenPoint()
  return screen.getDisplayNearestPoint(cursor).workArea
}

// ── Window Creation ──

export async function createWindow(): Promise<BrowserWindow> {
  const { x, y, width, height } = getActiveDisplayBounds()

  win = new BrowserWindow({
    title: 'Atlas',
    icon: `${process.env.VITE_PUBLIC}/favicon.ico`,
    width,
    height,
    x,
    y,

    // Transparent frameless overlay
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    alwaysOnTop: getConfig().ui.alwaysOnTop,
    skipTaskbar: true,

    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
    },

    // macOS: native vibrancy blur
    ...(process.platform === 'darwin' && {
      vibrancy: 'fullscreen-ui' as const,
      visualEffectState: 'active' as const,
    }),
  })

  // Load content
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    if (getConfig().ui.openDevTools) {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    win.loadFile(indexHtml)
  }

  // Enable click-through by default with forward mode
  // Clicks pass through to the desktop; hover detection still works
  win.setIgnoreMouseEvents(true, { forward: true })

  // External links → system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // tRPC IPC bridge
  createIPCHandler({ router, windows: [win] })

  // When settings is requested from tray, ensure window is visible first
  mainEventBus.on('system:open-settings', () => {
    showWindow()
  })

  log.info('Window created')
  return win
}

// ── Show Window (ensure visible) ──

/** Make the window visible, reposition to active monitor, disable click-through. */
export function showWindow(): void {
  if (!win) return

  if (!isAgentVisible) {
    const { x, y, width, height } = getActiveDisplayBounds()
    win.setBounds({ x, y, width, height })
    win.setOpacity(1)
    win.focus()
    isAgentVisible = true
  }

  // Disable click-through so the settings overlay can receive clicks
  win.setIgnoreMouseEvents(false)
  log.info('Window shown for settings')
}

// ── Visibility Toggle ──

export function toggleWindow(): void {
  if (!win) return

  if (isAgentVisible) {
    // Notify renderer so it can animate out
    mainEventBus.emit('agent-visibility', false)
    // Give renderer time to animate, then hide
    setTimeout(() => {
      win?.setIgnoreMouseEvents(true)
      win?.setOpacity(0)
      isAgentVisible = false
    }, 350)
  } else {
    // Reposition to the monitor where the cursor currently is
    const { x, y, width, height } = getActiveDisplayBounds()
    win.setBounds({ x, y, width, height })

    win.setOpacity(1)
    win.setIgnoreMouseEvents(true, { forward: true })
    win.focus()
    mainEventBus.emit('agent-visibility', true)
    isAgentVisible = true
  }

  log.info(`Agent ${isAgentVisible ? 'shown' : 'hidden'}`)
}



// ── Action Focus Management ──

/**
 * Blur the Atlas window before executing a motor action.
 *
 * This ensures that hotkeys (Win+E, Alt+F4) and clicks target
 * the real foreground application, not the Atlas overlay.
 */
export function blurForAction(): void {
  if (!win) return
  win.blur()
  // Temporarily make fully transparent to input so we don't intercept anything
  win.setIgnoreMouseEvents(true)
  log.debug('Window blurred for action')
}

/**
 * Restore the Atlas window state after a motor action completes.
 */
export function restoreAfterAction(): void {
  if (!win) return
  win.setIgnoreMouseEvents(true, { forward: true })
  log.debug('Window restored after action')
}

// ── Accessors ──

export function getWindow(): BrowserWindow | null {
  return win
}

export function clearWindow(): void {
  win = null
}

// ── Multi-Monitor Display Targeting ──

/**
 * Move the Atlas overlay to a specific display (0-indexed).
 * Used to show the rainbow border on the monitor the agent is looking at.
 */
export function moveToDisplay(displayIndex: number): void {
  if (!win) return
  const allDisplays = screen.getAllDisplays()
  if (displayIndex < 0 || displayIndex >= allDisplays.length) {
    log.warn(`Invalid display index: ${displayIndex}, total: ${allDisplays.length}`)
    return
  }
  const target = allDisplays[displayIndex]
  const { x, y, width, height } = target.workArea
  win.setBounds({ x, y, width, height })
  log.debug(`Window moved to display ${displayIndex + 1} (${width}x${height} at ${x},${y})`)
}

/**
 * Move the Atlas overlay back to the display where the cursor is.
 */
export function moveToActiveDisplay(): void {
  if (!win) return
  const { x, y, width, height } = getActiveDisplayBounds()
  win.setBounds({ x, y, width, height })
  log.debug('Window moved back to active display')
}
