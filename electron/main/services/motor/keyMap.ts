/**
 * keyMap — maps human-readable key names to nut.js Key enum values.
 *
 * LLM output uses strings like "ctrl", "enter", "f5" — this map
 * converts them to the correct nut.js Key enum for keyboard simulation.
 *
 * Supports multiple aliases (e.g. "ctrl" / "control", "esc" / "escape").
 */

import { Key } from '@nut-tree-fork/nut-js'

/** LLM key name → nut.js Key enum mapping */
export const KEY_MAP: Record<string, Key> = {
  // ── Modifiers ──
  ctrl: Key.LeftControl,
  control: Key.LeftControl,
  alt: Key.LeftAlt,
  shift: Key.LeftShift,
  meta: Key.LeftSuper,
  win: Key.LeftSuper,
  super: Key.LeftSuper,
  cmd: Key.LeftSuper,

  // ── Navigation ──
  enter: Key.Enter,
  return: Key.Enter,
  tab: Key.Tab,
  escape: Key.Escape,
  esc: Key.Escape,
  backspace: Key.Backspace,
  delete: Key.Delete,
  space: Key.Space,

  // ── Arrow keys ──
  up: Key.Up,
  down: Key.Down,
  left: Key.Left,
  right: Key.Right,

  // ── Function keys ──
  f1: Key.F1,
  f2: Key.F2,
  f3: Key.F3,
  f4: Key.F4,
  f5: Key.F5,
  f6: Key.F6,
  f7: Key.F7,
  f8: Key.F8,
  f9: Key.F9,
  f10: Key.F10,
  f11: Key.F11,
  f12: Key.F12,

  // ── Other ──
  home: Key.Home,
  end: Key.End,
  pageup: Key.PageUp,
  pagedown: Key.PageDown,
  insert: Key.Insert,
  printscreen: Key.Print,
}
