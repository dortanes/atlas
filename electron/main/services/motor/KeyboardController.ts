/**
 * KeyboardController — wraps robotjs keyboard API for the action loop.
 *
 * Responsibilities:
 * - Native typing via robotjs (for Computer Use loop — works with all UI elements)
 * - Hotkey combinations (e.g. Ctrl+C, Alt+Tab)
 * - Single key presses (e.g. Enter, Escape)
 *
 * Key name resolution uses {@link KEY_ALIASES} to normalize LLM output
 * strings to robotjs key names.
 */

import robot from '@hurdlegroup/robotjs'
import { clipboard } from 'electron'
import { createLogger } from '@electron/utils/logger'
import { sleep } from '@electron/utils/other'

const log = createLogger('KeyboardController')

/**
 * Aliases for LLM key names → robotjs key names.
 * robotjs already accepts most standard names ('enter', 'shift', 'f1', etc.)
 * so we only need aliases for common variations.
 */
const KEY_ALIASES: Record<string, string> = {
  ctrl: 'control',
  win: 'command',
  super: 'command',
  meta: 'command',
  cmd: 'command',
  esc: 'escape',
  return: 'enter',
  del: 'delete',
  pgup: 'pageup',
  pgdn: 'pagedown',
  pgdown: 'pagedown',
}

/** Modifier keys that robotjs accepts as the modifier parameter */
const MODIFIERS = new Set(['control', 'alt', 'shift', 'command'])

export class KeyboardController {
  /**
   * Type text by pasting from clipboard (reliable for app text fields).
   *
   * Used by ActionLoop. For native UI elements,
   * use {@link typeNative} instead.
   *
   * @param text — text string to type into the focused window
   */
  async type(text: string): Promise<void> {
    log.info(`type("${text.slice(0, 50)}${text.length > 50 ? '...' : ''}")`)

    // Save current clipboard content
    const original = clipboard.readText()

    // Write target text to clipboard
    clipboard.writeText(text)
    await sleep(50)

    // Paste via Ctrl+V
    robot.keyTap('v', 'control')
    await sleep(100)

    // Restore original clipboard
    clipboard.writeText(original)
  }

  /**
   * Type text character-by-character using native key events.
   *
   * Works with ALL UI elements including Windows Start menu search,
   * native dialogs, and other controls that don't support Ctrl+V.
   * Used by Computer Use loop.
   *
   * @param text — text to type character-by-character
   */
  typeNative(text: string): void {
    log.info(`typeNative("${text.slice(0, 50)}${text.length > 50 ? '...' : ''}")`)
    // Use delayed typing to prevent characters from being garbled
    // 6000 CPM ≈ 100 chars/sec ≈ 15ms per character
    robot.setKeyboardDelay(15)
    robot.typeStringDelayed(text, 6000)
  }

  /**
   * Press a hotkey combination (e.g. Ctrl+C, Alt+Tab).
   *
   * @param keys — key names: ["ctrl", "c"]
   */
  hotkey(...keys: string[]): void {
    log.info(`hotkey(${keys.join('+')})`)

    const resolved = keys.map((k) => this.resolveKey(k))

    // Separate modifiers from the main key
    // robotjs API: keyTap(key, modifier | modifier[])
    const modifiers = resolved.filter((k) => MODIFIERS.has(k))
    const mainKeys = resolved.filter((k) => !MODIFIERS.has(k))

    if (mainKeys.length > 0) {
      // Tap each main key with all modifiers held
      for (const key of mainKeys) {
        robot.keyTap(key, modifiers.length > 0 ? modifiers : [])
      }
    } else if (modifiers.length > 0) {
      // All keys are modifiers (e.g. just "Alt") — tap the last one
      const last = modifiers.pop()!
      robot.keyTap(last, modifiers.length > 0 ? modifiers : [])
    }
  }

  /**
   * Press and release a single key.
   *
   * @param key — key name (e.g. "enter", "escape", "f5")
   */
  keyPress(key: string): void {
    log.info(`keyPress(${key})`)
    const resolved = this.resolveKey(key)
    robot.keyTap(resolved)
  }

  /**
   * Resolve a human-readable key string to a robotjs key name.
   *
   * Resolution order:
   * 1. Normalize to lowercase
   * 2. Check {@link KEY_ALIASES} for known aliases
   * 3. Return as-is (robotjs accepts most standard key names)
   *
   * @param key — key name from LLM output
   */
  private resolveKey(key: string): string {
    const normalized = key.toLowerCase().trim()
    return KEY_ALIASES[normalized] ?? normalized
  }
}
