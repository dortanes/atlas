import { onMounted, onUnmounted } from 'vue'
import { api } from '@/api'

/**
 * useAccentColor — composable that subscribes to OS accent color
 * changes via tRPC and smoothly animates the CSS custom properties
 * `--glass-accent-h`, `--glass-accent-s`, `--glass-accent-l` on `:root`.
 *
 * Hue interpolation takes the shortest path around the 360° wheel
 * to avoid "disco" when jumping between distant hues (e.g. yellow → pink).
 */
export function useAccentColor() {
  let unsub: (() => void) | null = null
  let current = { h: 240, s: 60, l: 35 }
  let animId = 0
  let debounceId = 0

  /** Write HSL values to CSS custom properties */
  function setVars(h: number, s: number, l: number) {
    const root = document.documentElement
    root.style.setProperty('--glass-accent-h', String(Math.round(((h % 360) + 360) % 360)))
    root.style.setProperty('--glass-accent-s', `${Math.round(Math.max(0, Math.min(100, s)))}%`)
    root.style.setProperty('--glass-accent-l', `${Math.round(Math.max(0, Math.min(100, l)))}%`)
  }

  /**
   * Compute shortest hue delta (handles wrap-around at 360°).
   * e.g. from 350 → 10 = +20 (not -340)
   */
  function shortestHueDelta(from: number, to: number): number {
    let delta = ((to - from) % 360 + 540) % 360 - 180
    return delta
  }

  /** Animate from current position to target over 600ms */
  function animate(target: { h: number; s: number; l: number }) {
    const from = { ...current }
    const hueDelta = shortestHueDelta(from.h, target.h)
    const duration = 600
    const start = performance.now()

    cancelAnimationFrame(animId)

    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1)
      // ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3)

      const h = from.h + hueDelta * ease
      const s = from.s + (target.s - from.s) * ease
      const l = from.l + (target.l - from.l) * ease

      current = { h, s, l }
      setVars(h, s, l)

      if (t < 1) {
        animId = requestAnimationFrame(tick)
      }
    }

    animId = requestAnimationFrame(tick)
  }

  /** Debounced handler — Windows fires multiple events per change */
  function onAccentData(accent: { h: number; s: number; l: number }) {
    clearTimeout(debounceId)
    debounceId = window.setTimeout(() => animate(accent), 100)
  }

  onMounted(() => {
    unsub = api.system.onAccentColorChange.subscribe(undefined, {
      onData: onAccentData,
    }).unsubscribe
  })

  onUnmounted(() => {
    unsub?.()
    cancelAnimationFrame(animId)
    clearTimeout(debounceId)
  })
}
