/**
 * BaseTTSProvider — abstract base for all TTS integrations.
 *
 * Every provider (ElevenLabs, Azure, Google, …) must implement
 * this contract so TTSService can swap them transparently.
 */

export abstract class BaseTTSProvider {
  abstract readonly name: string

  /** Full synthesis: send text, get complete audio buffer (mp3). */
  abstract synthesize(text: string): Promise<Buffer>

  /**
   * Streaming synthesis: yields audio chunks as they arrive.
   * Consumers iterate with `for await (const chunk of streamSpeech(...))`.
   */
  abstract streamSpeech(text: string): AsyncGenerator<Buffer>
}
