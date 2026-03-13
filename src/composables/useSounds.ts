import activateSound from '@/assets/sounds/activate.ogg'
import deactivateSound from '@/assets/sounds/deactivate.ogg'
import processingSound from '@/assets/sounds/processing.ogg'
import responseReadySound from '@/assets/sounds/response_ready.ogg'
import warningSound from '@/assets/sounds/warning.ogg'
import permissionSound from '@/assets/sounds/permission.ogg'
import taskCompleteSound from '@/assets/sounds/task_complete.ogg'
import errorSound from '@/assets/sounds/error.ogg'

/**
 * useSounds — UI sound effects composable (singleton).
 *
 * Provides named methods for each SFX event.
 * Uses the Web Audio API via HTMLAudioElement for low-latency playback.
 * All sounds are preloaded on first call for instant response.
 *
 * Volume is global and adjustable (0–1).
 */

// ── Sound Registry ──

const SOUNDS = {
  activate: activateSound,
  deactivate: deactivateSound,
  processing: processingSound,
  responseReady: responseReadySound,
  warning: warningSound,
  permission: permissionSound,
  taskComplete: taskCompleteSound,
  error: errorSound,
} as const

type SoundName = keyof typeof SOUNDS

// ── Singleton State ──

let volume = 0.5
const audioCache = new Map<SoundName, HTMLAudioElement>()

/**
 * Preload a sound into cache for instant playback.
 */
function preload(name: SoundName): HTMLAudioElement {
  let audio = audioCache.get(name)
  if (!audio) {
    audio = new Audio(SOUNDS[name])
    audio.preload = 'auto'
    audioCache.set(name, audio)
  }
  return audio
}

/**
 * Play a sound by name.
 * Creates a fresh clone each time so overlapping plays work.
 */
function play(name: SoundName) {
  const source = preload(name)
  const clone = source.cloneNode() as HTMLAudioElement
  clone.volume = volume
  clone.play().catch(() => {
    // Autoplay blocked — silently ignore
  })
}

/**
 * Preload all sounds on first composable call.
 */
let preloaded = false
function preloadAll() {
  if (preloaded) return
  for (const name of Object.keys(SOUNDS) as SoundName[]) {
    preload(name)
  }
  preloaded = true
}

// ── Composable ──

export function useSounds() {
  preloadAll()

  return {
    /** Set global volume (0–1) */
    setVolume(v: number) {
      volume = Math.max(0, Math.min(1, v))
    },

    /** Get current volume */
    getVolume() {
      return volume
    },

    // ── Agent State Transitions ──
    /** Assistant activated (wake word / orb click) */
    activate: () => play('activate'),
    /** Assistant deactivated / cancelled */
    deactivate: () => play('deactivate'),
    /** Command received, processing started */
    processing: () => play('processing'),

    // ── Island Events ──
    /** Response/result ready */
    responseReady: () => play('responseReady'),
    /** Warning appeared */
    warning: () => play('warning'),
    /** Permission request (high-risk action) */
    permission: () => play('permission'),
    /** Microtask completed */
    taskComplete: () => play('taskComplete'),
    /** Error occurred */
    error: () => play('error'),

    /** Play any sound by name */
    play,
  }
}
