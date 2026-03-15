import { ref } from 'vue'
import { api } from '@/api'

/**
 * useTTS — TTS audio playback with dual-format support.
 *
 * Supports two playback modes based on the provider's audio format:
 * - **mpeg**: streaming via MediaSource Extensions (MSE)
 * - **opus**: complete buffer via blob URL + Audio element
 *
 * Subscribes to `audio.onTTSFormat`, `audio.onTTSAudio`, `audio.onTTSStatus`.
 *
 * Usage: call `useTTS()` once in MainView setup — it auto-subscribes.
 */

const speaking = ref(false)

let currentFormat: 'mpeg' | 'opus' = 'mpeg'
let mediaSource: MediaSource | null = null
let sourceBuffer: SourceBuffer | null = null
let audioElement: HTMLAudioElement | null = null
let pendingChunks: Uint8Array[] = []
let sourceBufferReady = false
let subscribed = false

// ── Helpers ──

/** Convert base64 string to Uint8Array */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// ── MSE pipeline (for mpeg streaming) ──

/** Flush any queued chunks to the SourceBuffer */
function flushPendingChunks() {
  if (!sourceBuffer || sourceBuffer.updating || pendingChunks.length === 0) return
  const chunk = pendingChunks.shift()!
  sourceBuffer.appendBuffer(chunk.buffer as ArrayBuffer)
}

/** Reset MSE state for a new speech session */
function resetMSE() {
  // Clean up previous session
  if (audioElement) {
    audioElement.pause()
    audioElement.removeAttribute('src')
    audioElement.load()
  }

  if (sourceBuffer && mediaSource && mediaSource.readyState === 'open') {
    try {
      mediaSource.removeSourceBuffer(sourceBuffer)
    } catch {
      // ignore
    }
  }

  pendingChunks = []
  sourceBuffer = null
  sourceBufferReady = false

  // Create fresh MediaSource
  mediaSource = new MediaSource()
  audioElement = audioElement || new Audio()
  audioElement.src = URL.createObjectURL(mediaSource)

  mediaSource.addEventListener('sourceopen', () => {
    if (!mediaSource) return
    try {
      sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg')
      sourceBufferReady = true

      sourceBuffer.addEventListener('updateend', () => {
        flushPendingChunks()
      })

      // Flush any chunks that arrived before sourceopen
      flushPendingChunks()

      // Start playback
      audioElement?.play().catch((err) => {
        console.warn('[useTTS] Playback failed:', err)
      })
    } catch (err) {
      console.error('[useTTS] Failed to create SourceBuffer:', err)
    }
  })
}

/** Add an audio chunk to the MSE pipeline */
function addChunkMSE(base64Data: string) {
  const chunk = base64ToUint8Array(base64Data)
  if (chunk.length === 0) return

  pendingChunks.push(chunk)

  if (sourceBufferReady) {
    flushPendingChunks()
  }
}

/** Signal that all audio has been received (MSE) */
function endStreamMSE() {
  const waitForFlush = () => {
    if (!sourceBuffer || !mediaSource) return
    if (sourceBuffer.updating || pendingChunks.length > 0) {
      setTimeout(waitForFlush, 50)
      return
    }
    if (mediaSource.readyState === 'open') {
      try {
        mediaSource.endOfStream()
      } catch {
        // ignore
      }
    }
  }
  waitForFlush()
}

// ── Blob URL pipeline (for opus / non-streaming) ──

/** Collected chunks for non-streaming playback */
let blobChunks: Uint8Array[] = []

/** Reset blob state for a new session */
function resetBlob() {
  blobChunks = []

  // Clean up previous audio element
  if (audioElement) {
    audioElement.pause()
    audioElement.removeAttribute('src')
    audioElement.load()
  }

  audioElement = audioElement || new Audio()
}

/** Add a chunk to the blob buffer */
function addChunkBlob(base64Data: string) {
  const chunk = base64ToUint8Array(base64Data)
  if (chunk.length === 0) return
  blobChunks.push(chunk)
}

/** All chunks received — create blob URL and play */
function endStreamBlob() {
  if (blobChunks.length === 0) return

  // Merge all chunks into a single Uint8Array for Blob constructor
  const totalLength = blobChunks.reduce((acc, c) => acc + c.length, 0)
  const merged = new Uint8Array(totalLength)
  let offset = 0
  for (const c of blobChunks) {
    merged.set(c, offset)
    offset += c.length
  }

  const blob = new Blob([merged.buffer], { type: 'audio/ogg; codecs=opus' })
  const url = URL.createObjectURL(blob)

  if (!audioElement) audioElement = new Audio()
  audioElement.src = url
  audioElement.play().catch((err) => {
    console.warn('[useTTS] Blob playback failed:', err)
  })

  // Clean up blob URL when done
  audioElement.addEventListener('ended', () => {
    URL.revokeObjectURL(url)
  }, { once: true })

  blobChunks = []
}

// ── Subscriptions ──

function initSubscriptions() {
  if (subscribed) return
  subscribed = true

  // TTS format (tells us which playback pipeline to use)
  api.audio.onTTSFormat.subscribe(undefined, {
    onData(data: { format: 'mpeg' | 'opus' }) {
      currentFormat = data.format
    },
  })

  // TTS status
  api.audio.onTTSStatus.subscribe(undefined, {
    onData(data: { speaking: boolean }) {
      speaking.value = data.speaking

      if (data.speaking) {
        // New speech session — prepare playback pipeline
        if (currentFormat === 'opus') {
          resetBlob()
        } else {
          resetMSE()
        }
      }
    },
  })

  // TTS audio chunks
  api.audio.onTTSAudio.subscribe(undefined, {
    onData(data: { data: string; done: boolean }) {
      if (currentFormat === 'opus') {
        if (data.done) {
          endStreamBlob()
        } else {
          addChunkBlob(data.data)
        }
      } else {
        if (data.done) {
          endStreamMSE()
        } else {
          addChunkMSE(data.data)
        }
      }
    },
  })
}

/** Stop frontend audio playback immediately (call from outside useTTS, e.g. useResponse) */
export function stopPlayback() {
  if (audioElement) {
    audioElement.pause()
  }
}

export function useTTS() {
  initSubscriptions()

  /** Stop playback immediately */
  function stop() {
    stopPlayback()
    api.audio.stopSpeaking.mutate()
  }

  return {
    speaking,
    stop,
  }
}
