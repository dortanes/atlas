import { systemPreferences } from 'electron'

/**
 * Convert hex color string to HSL values.
 * @param hex - Hex color without '#', e.g. "aabbcc" or "aabbccdd"
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

/**
 * Get the current OS accent color as HSL.
 * Falls back to a neutral blue if unavailable.
 */
export function getAccentHsl(): { h: number; s: number; l: number } {
  try {
    const hex = systemPreferences.getAccentColor() // "aabbccdd"
    return hexToHsl(hex)
  } catch {
    return { h: 240, s: 60, l: 35 }
  }
}
