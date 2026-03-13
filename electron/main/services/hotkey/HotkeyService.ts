import { BaseService } from '@electron/services/base/BaseService'
import { mainEventBus } from '@electron/utils/eventBus'
import { getConfig, type AppConfig } from '@electron/utils/config'

/**
 * HotkeyService — global keyboard shortcuts via uiohook-napi.
 *
 * Reads the hotkey combo from config (e.g. "Ctrl+Space").
 * Listens for `config:changed` to rebind at runtime.
 */
export class HotkeyService extends BaseService {
  private uiohook: typeof import('uiohook-napi').uIOhook | null = null
  private UiohookKey: typeof import('uiohook-napi').UiohookKey | null = null

  /** Parsed hotkey target */
  private hotkey = { ctrl: false, alt: false, shift: false, meta: false, keycode: 0 }

  /** Live modifier state */
  private modifiers = { ctrl: false, alt: false, shift: false, meta: false }

  private keydownHandler: ((e: import('uiohook-napi').UiohookKeyboardEvent) => void) | null = null
  private keyupHandler: ((e: import('uiohook-napi').UiohookKeyboardEvent) => void) | null = null
  private configHandler: ((config: AppConfig) => void) | null = null

  async init(): Promise<void> {
    try {
      const mod = await import('uiohook-napi')
      this.UiohookKey = mod.UiohookKey
      this.uiohook = mod.uIOhook

      this.parseHotkey(getConfig().hotkey)
      this.bindListeners()

      this.uiohook.start()

      // React to config changes at runtime
      this.configHandler = (config: AppConfig) => {
        this.parseHotkey(config.hotkey)
        this.log.info(`Hotkey rebound to: ${config.hotkey}`)
      }
      mainEventBus.on('config:changed', this.configHandler)

      this.log.info(`HotkeyService started (${getConfig().hotkey} → toggle Atlas)`)
    } catch (err) {
      this.log.error('Failed to initialize uiohook-napi:', err)
    }
  }

  async dispose(): Promise<void> {
    if (this.configHandler) {
      mainEventBus.removeListener('config:changed', this.configHandler)
    }
    if (this.uiohook) {
      this.uiohook.stop()
      this.log.info('HotkeyService stopped')
    }
  }

  /**
   * Parse a hotkey string like "Ctrl+Space" into modifier flags + keycode.
   */
  private parseHotkey(combo: string): void {
    const parts = combo.split('+').map((s) => s.trim())
    this.hotkey.ctrl = parts.includes('Ctrl')
    this.hotkey.alt = parts.includes('Alt')
    this.hotkey.shift = parts.includes('Shift')
    this.hotkey.meta = parts.includes('Meta')

    // The last non-modifier part is the key
    const key = parts.filter((p) => !['Ctrl', 'Alt', 'Shift', 'Meta'].includes(p)).pop() || ''
    this.hotkey.keycode = this.keyNameToCode(key)
  }

  /**
   * Map a key name (e.g. "Space", "A") to a uiohook keycode.
   */
  private keyNameToCode(name: string): number {
    const K = this.UiohookKey
    if (!K) return 0

    const map: Record<string, number> = {
      Space: K.Space, Enter: K.Enter, Escape: K.Escape,
      Tab: K.Tab, Backspace: K.Backspace, Delete: K.Delete,
      ArrowUp: K.ArrowUp, ArrowDown: K.ArrowDown,
      ArrowLeft: K.ArrowLeft, ArrowRight: K.ArrowRight,
      // Letters
      A: K.A, B: K.B, C: K.C, D: K.D, E: K.E, F: K.F,
      G: K.G, H: K.H, I: K.I, J: K.J, K: K.K, L: K.L,
      M: K.M, N: K.N, O: K.O, P: K.P, Q: K.Q, R: K.R,
      S: K.S, T: K.T, U: K.U, V: K.V, W: K.W, X: K.X,
      Y: K.Y, Z: K.Z,
      // Numbers
      '0': K['0'], '1': K['1'], '2': K['2'], '3': K['3'], '4': K['4'],
      '5': K['5'], '6': K['6'], '7': K['7'], '8': K['8'], '9': K['9'],
      // Function keys
      F1: K.F1, F2: K.F2, F3: K.F3, F4: K.F4, F5: K.F5, F6: K.F6,
      F7: K.F7, F8: K.F8, F9: K.F9, F10: K.F10, F11: K.F11, F12: K.F12,
    }

    return map[name] ?? 0
  }

  private bindListeners(): void {
    const K = this.UiohookKey!

    this.keydownHandler = (e: import('uiohook-napi').UiohookKeyboardEvent) => {
      // Track modifiers
      if (e.keycode === K.Ctrl || e.keycode === K.CtrlRight) this.modifiers.ctrl = true
      if (e.keycode === K.Alt || e.keycode === K.AltRight) this.modifiers.alt = true
      if (e.keycode === K.Shift || e.keycode === K.ShiftRight) this.modifiers.shift = true
      if (e.keycode === K.Meta || e.keycode === K.MetaRight) this.modifiers.meta = true

      // Check combo match
      if (
        this.modifiers.ctrl === this.hotkey.ctrl &&
        this.modifiers.alt === this.hotkey.alt &&
        this.modifiers.shift === this.hotkey.shift &&
        this.modifiers.meta === this.hotkey.meta &&
        e.keycode === this.hotkey.keycode
      ) {
        this.log.debug(`Global hotkey: ${getConfig().hotkey} → toggle Atlas`)
        mainEventBus.emit('hotkey:toggle-atlas')
      }
    }

    this.keyupHandler = (e: import('uiohook-napi').UiohookKeyboardEvent) => {
      if (e.keycode === K.Ctrl || e.keycode === K.CtrlRight) this.modifiers.ctrl = false
      if (e.keycode === K.Alt || e.keycode === K.AltRight) this.modifiers.alt = false
      if (e.keycode === K.Shift || e.keycode === K.ShiftRight) this.modifiers.shift = false
      if (e.keycode === K.Meta || e.keycode === K.MetaRight) this.modifiers.meta = false
    }

    this.uiohook!.on('keydown', this.keydownHandler)
    this.uiohook!.on('keyup', this.keyupHandler)
  }
}
