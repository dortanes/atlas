// @ts-expect-error — package exports don't include types field
import YandexAliceClient from 'yandex-alice-client'
import { BaseTTSProvider } from './BaseTTSProvider'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('YandexAliceProvider')

/**
 * YandexAliceProvider — Yandex Alice TTS integration.
 *
 * Uses yandex-alice-client to synthesize speech via Yandex Alice.
 * No API key required — connects to Alice's public endpoint.
 * Returns audio as opus buffer (no streaming, single complete response).
 */
export class YandexAliceProvider extends BaseTTSProvider {
  readonly name = 'yandex-alice'

  private client: YandexAliceClient
  private connected = false

  constructor() {
    super()
    this.client = new YandexAliceClient()
    log.info('Initialized')
  }

  /** Ensure client is connected (lazy connection) */
  private async ensureConnected(): Promise<void> {
    if (this.connected) return

    log.debug('Connecting to Yandex Alice...')
    await this.client.connect()
    this.connected = true
    log.info('Connected to API')
  }

  async synthesize(text: string): Promise<Buffer> {
    log.debug(`synthesize() ${text.length} chars`)

    await this.ensureConnected()

    const audio = await this.client.tts(text)

    log.debug(`synthesize() done: ${audio.length} bytes (opus)`)
    return audio
  }

  async *streamSpeech(text: string): AsyncGenerator<Buffer> {
    // Alice doesn't support streaming — synthesize full buffer and yield as single chunk
    const buffer = await this.synthesize(text)
    yield buffer
    log.debug('streamSpeech() yielded complete buffer')
  }

  /** Close the client connection */
  close(): void {
    if (this.connected) {
      try {
        this.client.close()
      } catch {
        // ignore
      }
      this.connected = false
      log.info('Connection closed')
    }
  }
}
