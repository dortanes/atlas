import { observable } from '@trpc/server/observable'
import { z } from 'zod'
import { trpcRouter, publicProcedure } from '@electron/api/context'
import { mainEventBus } from '@electron/utils/eventBus'
import { createLogger } from '@electron/utils/logger'
import type { STTService } from '@electron/services/stt/STTService'
import { getModelStatus as getModelStatusForLanguage } from '@electron/services/stt/ModelManager'

const log = createLogger('audio.router')

let sttService: STTService | null = null

/** Wire STTService into the router (called from index.ts) */
export function setSTTService(stt: STTService): void {
  sttService = stt
}

/**
 * audio.router — audio/voice + TTS + STT endpoints.
 */
export const audioRouter = trpcRouter({

  // ── STT ──

  /** Start listening for voice input */
  startListening: publicProcedure.mutation(() => {
    sttService?.setListening(true)
    return { ok: true }
  }),

  /** Stop listening for voice input */
  stopListening: publicProcedure.mutation(() => {
    sttService?.setListening(false)
    return { ok: true }
  }),

  /** Subscribe to speech-to-text transcript chunks */
  onTranscript: publicProcedure.subscription(() => {
    return observable<{ text: string; isFinal: boolean }>((emit) => {
      function onTranscript(payload: { text: string; isFinal: boolean }) {
        emit.next(payload)
      }

      mainEventBus.on('audio:transcript', onTranscript)

      return () => {
        mainEventBus.off('audio:transcript', onTranscript)
      }
    })
  }),

  /** Get STT model status (downloaded, path) for a given or configured language */
  getSTTModelStatus: publicProcedure
    .input(z.object({ language: z.string().optional() }).optional())
    .query(({ input }) => {
      if (!sttService) return { downloaded: false, path: '' }
      if (input?.language) {
        // Check status for a specific language (used when user changes language in UI)
        return getModelStatusForLanguage(input.language)
      }
      return sttService.getModelStatus()
    }),

  /** Get model path for renderer to load */
  getSTTModelPath: publicProcedure.query(() => {
    if (!sttService) return ''
    return sttService.getModelPath()
  }),

  /** Get available STT languages */
  getSTTLanguages: publicProcedure.query(() => {
    if (!sttService) return []
    return sttService.getAvailableLanguages()
  }),

  /** Download STT model for a language */
  downloadSTTModel: publicProcedure
    .input(z.object({ language: z.string() }))
    .mutation(async ({ input }) => {
      if (!sttService) throw new Error('STTService not available')
      await sttService.downloadModel(input.language)
      return { ok: true }
    }),

  /** Subscribe to STT model download progress */
  onSTTModelStatus: publicProcedure.subscription(() => {
    return observable<{ downloaded: boolean; progress?: number; error?: string }>((emit) => {
      function onStatus(payload: { downloaded: boolean; progress?: number; error?: string }) {
        emit.next(payload)
      }

      mainEventBus.on('stt:model-status', onStatus)

      return () => {
        mainEventBus.off('stt:model-status', onStatus)
      }
    })
  }),

  // ── TTS (Phase 3.5) ──

  /** Trigger TTS to speak text */
  speak: publicProcedure
    .input(z.object({ text: z.string() }))
    .mutation(({ input }) => {
      log.info(`TTS speak: ${input.text.length} chars`)
      mainEventBus.emit('tts:speak', { text: input.text })
      return { ok: true }
    }),

  /** Stop current TTS playback */
  stopSpeaking: publicProcedure.mutation(() => {
    log.info('TTS stop')
    mainEventBus.emit('tts:stop')
    return { ok: true }
  }),

  /** Subscribe to TTS speaking status */
  onTTSStatus: publicProcedure.subscription(() => {
    return observable<{ speaking: boolean }>((emit) => {
      function onStatus(payload: { speaking: boolean }) {
        emit.next(payload)
      }

      mainEventBus.on('tts:status', onStatus)

      return () => {
        mainEventBus.off('tts:status', onStatus)
      }
    })
  }),

  /** Subscribe to TTS audio format (mpeg or opus) — emitted when speech starts */
  onTTSFormat: publicProcedure.subscription(() => {
    return observable<{ format: 'mpeg' | 'opus' }>((emit) => {
      function onFormat(payload: { format: 'mpeg' | 'opus' }) {
        emit.next(payload)
      }

      mainEventBus.on('tts:format', onFormat)

      return () => {
        mainEventBus.off('tts:format', onFormat)
      }
    })
  }),

  /** Subscribe to TTS audio chunks (base64-encoded) */
  onTTSAudio: publicProcedure.subscription(() => {
    return observable<{ data: string; done: boolean }>((emit) => {
      function onAudio(payload: { chunk: Buffer; done: boolean }) {
        emit.next({
          data: payload.chunk.toString('base64'),
          done: payload.done,
        })
      }

      mainEventBus.on('tts:audio', onAudio)

      return () => {
        mainEventBus.off('tts:audio', onAudio)
      }
    })
  }),
})
