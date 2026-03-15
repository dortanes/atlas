import { ref } from 'vue'
import type { AgentResponse, ResponseKind } from '@/types/agent'
import { api } from '@/api'
import { stopPlayback } from '@/composables/useTTS'

/** Stop TTS playback — pauses frontend audio + stops backend stream */
function stopTTS() {
  stopPlayback()
  api.audio.stopSpeaking.mutate().catch(() => {})
}

/**
 * useResponse — agent response/thoughts composable (singleton).
 *
 * Manages the agent's output: either a permanent response
 * or temporary "thoughts" (AI thinking transcription).
 *
 * Subscribes to `agent.onResponse` for streaming chunks.
 * Chunk protocol:
 *   - First chunk (streaming=true): creates the response
 *   - Middle chunks (streaming=true): appends text
 *   - Final chunk (done=true): marks streaming as finished
 */

// ── Singleton State ──

const response = ref<AgentResponse | null>(null)
const dismissing = ref(false)

// ── tRPC Subscription (initialized once) ──

let subscribed = false

function initSubscription() {
  if (subscribed) return
  subscribed = true

  api.agent.onResponse.subscribe(undefined, {
    onData(data: {
      id: string
      kind: ResponseKind
      text: string
      streaming: boolean
      done: boolean
    }) {
      if (data.done) {
        // Final chunk — mark as done streaming
        if (response.value) {
          response.value = { ...response.value, streaming: false }
        }
        return
      }

      if (!response.value || response.value.id !== data.id) {
        // New response — create it
        response.value = {
          id: data.id,
          kind: data.kind,
          text: data.text,
          streaming: data.streaming,
        }
      } else {
        // Existing response — append text
        response.value = {
          ...response.value,
          text: response.value.text + data.text,
        }
      }
    },
  })

  // Stop TTS when a new command starts (but keep response visible
  // until the new one arrives — seamless UX for queued tasks)
  api.agent.onStateChange.subscribe(undefined, {
    onData(data: { state: string }) {
      if (data.state === 'processing') {
        stopTTS()
        // Clear old response when a new command starts processing
        response.value = null
        dismissing.value = false
      }
    },
  })
}

initSubscription()

// ── Composable ──

export function useResponse() {
  /**
   * Set or update the current response.
   * Can be called locally if needed.
   */
  function setResponse(next: AgentResponse | null) {
    response.value = next
    dismissing.value = false
  }

  /**
   * Append text to the current response (streaming).
   */
  function appendText(text: string) {
    if (response.value) {
      response.value = { ...response.value, text: response.value.text + text }
    }
  }

  /**
   * Mark current response as done streaming.
   */
  function finishStreaming() {
    if (response.value) {
      response.value = { ...response.value, streaming: false }
    }
  }

  /**
   * Clear the response immediately (no animation).
   */
  function clear() {
    response.value = null
    dismissing.value = false
  }

  /**
   * Dismiss with exit animation.
   * Sets `dismissing` flag → component plays CSS animation →
   * after 400ms clears the response.
   */
  function dismiss() {
    stopTTS()
    dismissing.value = true
    setTimeout(() => {
      response.value = null
      dismissing.value = false
    }, 400)
  }

  return {
    response,
    dismissing,
    setResponse,
    appendText,
    finishStreaming,
    clear,
    dismiss,
  }
}
