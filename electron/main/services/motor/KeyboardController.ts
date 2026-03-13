/**
 * KeyboardController — wraps nut.js keyboard API for the action loop.
 *
 * Responsibilities:
 * - Text input via clipboard paste (avoids Windows Alt-key bugs)
 * - Hotkey combinations (e.g. Ctrl+C, Alt+Tab)
 * - Single key presses (e.g. Enter, Escape)
 *
 * Key name resolution uses {@link KEY_MAP} from `keyMap.ts` to convert
 * human-readable strings (from LLM output) to nut.js Key enums.
 */

import { keyboard, Key } from '@nut-tree-fork/nut-js'
import { clipboard } from 'electron'
import { createLogger } from '@electron/utils/logger'
import { sleep } from '@electron/utils/other'
import { KEY_MAP } from './keyMap'

const log = createLogger('KeyboardController')

export class KeyboardController {
  /**
   * Type text by pasting from clipboard (reliable on Windows).
   *
   * nut.js `keyboard.type()` triggers Alt-key menu accelerators on Windows,
   * so we use clipboard + Ctrl+V workaround. The original clipboard content
   * is preserved and restored after pasting.
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
    await keyboard.pressKey(Key.LeftControl, Key.V)
    await keyboard.releaseKey(Key.LeftControl, Key.V)
    await sleep(100)

    // Restore original clipboard
    clipboard.writeText(original)
  }

  /**
   * Press a hotkey combination (e.g. Ctrl+C, Alt+Tab).
   *
   * @param keys — key names: ["ctrl", "c"]
   */
  async hotkey(...keys: string[]): Promise<void> {
    log.info(`hotkey(${keys.join('+')})`)

    const nutKeys = keys.map((k) => this.resolveKey(k))
    await keyboard.pressKey(...nutKeys)
    await keyboard.releaseKey(...nutKeys)
  }

  /**
   * Press and release a single key.
   *
   * @param key — key name (e.g. "enter", "escape", "f5")
   */
  async keyPress(key: string): Promise<void> {
    log.info(`keyPress(${key})`)
    const nutKey = this.resolveKey(key)
    await keyboard.pressKey(nutKey)
    await keyboard.releaseKey(nutKey)
  }

  /**
   * Resolve a human-readable key string to nut.js Key enum.
   *
   * Resolution order:
   * 1. Check {@link KEY_MAP} for known aliases
   * 2. Try single-character mapping (e.g. "a" → Key.A)
   * 3. Throw an error if no mapping found
   *
   * @param key — key name from LLM output
   * @throws Error if the key cannot be mapped
   */
  private resolveKey(key: string): Key {
    const normalized = key.toLowerCase().trim()

    // Check direct mapping first
    const mapped = KEY_MAP[normalized]
    if (mapped !== undefined) return mapped

    // Single character → try to map to Key.A, Key.B, etc.
    if (normalized.length === 1) {
      const upper = normalized.toUpperCase()
      const keyEnum = Key[upper as keyof typeof Key]
      if (keyEnum !== undefined) return keyEnum
    }

    log.error(`Unknown key: "${key}" — no mapping found`)
    throw new Error(`Unknown key: "${key}". Cannot map to a keyboard key.`)
  }
}
