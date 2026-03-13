import { ref } from 'vue'
import { api } from '@/api'

/**
 * useTTS — TTS audio playback via MediaSource Extensions.
 *
 * Subscribes to `audio.onTTSAudio` (base64-encoded mp3 chunks)
 * and plays them in real-time using MSE SourceBuffer.
 *
 * Usage: call `useTTS()` once in MainView setup — it auto-subscribes.
 */

const speaking = ref(false)

let mediaSource: MediaSource | null = null
let sourceBuffer: SourceBuffer | null = null
let audioElement: HTMLAudioElement | null = null
let pendingChunks: Uint8Array[] = []
let sourceBufferReady = false
let subscribed = false

/** Convert base64 string to Uint8Array */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

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
function addChunk(base64Data: string) {
  const chunk = base64ToUint8Array(base64Data)
  if (chunk.length === 0) return

  pendingChunks.push(chunk)

  if (sourceBufferReady) {
    flushPendingChunks()
  }
}

/** Signal that all audio has been received */
function endStream() {
  // Flush remaining chunks, then close when done
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

function initSubscriptions() {
  if (subscribed) return
  subscribed = true

  // TTS status
  api.audio.onTTSStatus.subscribe(undefined, {
    onData(data: { speaking: boolean }) {
      speaking.value = data.speaking

      if (data.speaking) {
        // New speech session — prepare MSE
        resetMSE()
      }
    },
  })

  // TTS audio chunks
  api.audio.onTTSAudio.subscribe(undefined, {
    onData(data: { data: string; done: boolean }) {
      if (data.done) {
        endStream()
      } else {
        addChunk(data.data)
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
