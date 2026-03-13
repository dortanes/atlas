/**
 * ResponseStreamer — word-by-word response animation for the UI.
 *
 * After an action loop completes, the agent sends its final text
 * response to the ResponseIsland via chunked events. This creates
 * a smooth typing-like animation in the overlay.
 *
 * Also triggers TTS playback and async fact extraction.
 *
 * Animation speed is controlled by `agent.streamWordsPerChunk`
 * and `agent.streamChunkDelay` in config.
 */

import { randomUUID } from 'node:crypto'
import { mainEventBus } from '@electron/utils/eventBus'
import { getConfig } from '@electron/utils/config'
import { sleep } from '@electron/utils/other'

/** Minimal interface for fact extraction — avoids tight coupling to FactExtractor class */
export interface IFactExtractor {
  extract(personaId: string, userMessage: string, modelResponse: string): Promise<void>
}

/**
 * Stream a text response to the ResponseIsland with typing animation.
 *
 * Splits text into word groups and emits them as sequential chunks,
 * producing a smooth word-by-word reveal effect in the frontend.
 *
 * @param text — the full response text to stream
 * @param personaId — active persona ID (for fact extraction)
 * @param factExtractor — optional fact extractor to mine facts from the response
 */
export async function streamFinalResponse(
  text: string,
  personaId: string,
  factExtractor?: IFactExtractor,
): Promise<void> {
  if (!text.trim()) return

  const { streamWordsPerChunk, streamChunkDelay } = getConfig().agent
  const responseId = randomUUID()

  // Split by whitespace boundaries, preserving whitespace in output
  const words = text.split(/(\s+)/)

  for (let i = 0; i < words.length; i += streamWordsPerChunk) {
    const chunk = words.slice(i, i + streamWordsPerChunk).join('')
    mainEventBus.emit('agent:response', {
      id: responseId,
      kind: 'response' as const,
      text: chunk,
      streaming: true,
      done: false,
    })
    await sleep(streamChunkDelay)
  }

  // Signal stream complete
  mainEventBus.emit('agent:response', {
    id: responseId,
    kind: 'response' as const,
    text: '',
    streaming: false,
    done: true,
  })

  // Trigger TTS
  mainEventBus.emit('tts:speak', { text })

  // Async fact extraction (fire-and-forget)
  factExtractor?.extract(personaId, '[action loop result]', text)
}
