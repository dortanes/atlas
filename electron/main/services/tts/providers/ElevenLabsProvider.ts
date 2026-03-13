import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import { BaseTTSProvider } from './BaseTTSProvider'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('ElevenLabsProvider')

/**
 * ElevenLabsProvider — ElevenLabs TTS integration via official SDK.
 *
 * Supports both full `synthesize()` and streaming `streamSpeech()`.
 * Audio is returned as mp3 buffers.
 *
 * SDK methods return `HttpResponsePromise<ReadableStream<Uint8Array>>`,
 * which resolves directly to the ReadableStream when awaited.
 */
export class ElevenLabsProvider extends BaseTTSProvider {
  readonly name = 'elevenlabs'

  private client: ElevenLabsClient
  private voiceId: string
  private model: string

  constructor(apiKey: string, voiceId: string = 'JBFqnCBsd6RMkjVDRZzb', model: string = 'eleven_flash_v2_5') {
    super()
    this.client = new ElevenLabsClient({ apiKey })
    this.voiceId = voiceId
    this.model = model
    log.info(`Initialized (voice: ${voiceId}, model: ${model})`)
  }

  /** Helper: drain a Web ReadableStream into a Node Buffer */
  private async streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }

    return Buffer.concat(chunks)
  }

  async synthesize(text: string): Promise<Buffer> {
    log.debug(`synthesize() ${text.length} chars`)

    // convert() returns HttpResponsePromise<ReadableStream<Uint8Array>>
    // Awaiting gives us the ReadableStream directly
    const stream = await this.client.textToSpeech.convert(this.voiceId, {
      text,
      modelId: this.model,
      outputFormat: 'mp3_44100_128',
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.75,
        speed: 1.15,
      },
    })

    const buffer = await this.streamToBuffer(stream)
    log.debug(`synthesize() done: ${buffer.length} bytes`)
    return buffer
  }

  async *streamSpeech(text: string): AsyncGenerator<Buffer> {
    log.debug(`streamSpeech() ${text.length} chars`)

    // stream() returns HttpResponsePromise<ReadableStream<Uint8Array>>
    const readableStream = await this.client.textToSpeech.stream(this.voiceId, {
      text,
      modelId: this.model,
      outputFormat: 'mp3_44100_128',
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.75,
        speed: 1.15,
      },
    })

    const reader = readableStream.getReader()
    let totalBytes = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        const buf = Buffer.from(value)
        totalBytes += buf.length
        yield buf
      }
    }

    log.debug(`streamSpeech() done: ${totalBytes} bytes total`)
  }
}
