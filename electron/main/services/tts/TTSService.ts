import { BaseService } from '@electron/services/base/BaseService'
import { BaseTTSProvider } from './providers/BaseTTSProvider'
import { ElevenLabsProvider } from './providers/ElevenLabsProvider'
import { getConfig, saveConfig, type AppConfig } from '@electron/utils/config'
import { mainEventBus } from '@electron/utils/eventBus'
import { formatTTSError, isTTSQuotaError } from '@electron/utils/ttsErrors'
import type { PersonaService } from '@electron/services/persona/PersonaService'

/**
 * TTSService — manages TTS provider lifecycle and speech synthesis.
 *
 * Reads provider name, API key, voice ID, and model from config.
 * Supports per-persona voice overrides via PersonaService.
 *
 * Listens for `tts:speak` events from the AgentLoop and
 * emits `tts:audio` chunks + `tts:status` updates.
 */
export class TTSService extends BaseService {
  private provider: BaseTTSProvider | null = null
  private speaking = false
  private abortController: AbortController | null = null
  private personaService: PersonaService | null = null
  private activeVoiceId = ''

  // Bound handlers for proper add/remove
  private readonly boundOnSpeak = this.onSpeak.bind(this)
  private readonly boundOnStop = this.onStop.bind(this)
  private readonly boundOnPersonaSwitched = this.onPersonaSwitched.bind(this)
  private readonly boundOnConfigChanged = this.onConfigChanged.bind(this)

  /** Set after both services are registered (avoids circular dep) */
  setPersonaService(ps: PersonaService): void {
    this.personaService = ps
  }

  async init(): Promise<void> {
    // Always register event listeners so runtime enable/disable works
    mainEventBus.on('tts:speak', this.boundOnSpeak)
    mainEventBus.on('tts:stop', this.boundOnStop)
    mainEventBus.on('persona:switched', this.boundOnPersonaSwitched)
    mainEventBus.on('config:changed', this.boundOnConfigChanged)

    const config = getConfig()

    if (!config.tts.enabled) {
      this.log.info('TTS is disabled in config — listeners registered, provider skipped')
      return
    }

    if (!config.tts.apiKey) {
      this.log.warn('No TTS API key configured — TTS calls will fail')
      mainEventBus.emit('agent:warning', {
        id: 'missing-tts-key',
        message: 'TTS API key not configured. Set your ElevenLabs API key in settings to enable voice output.',
        dismissable: true,
      })
      return
    }

    this.createProvider(config.tts.provider, config.tts.apiKey, this.getActiveVoiceId())
    this.log.info(`TTSService initialized (provider: ${config.tts.provider})`)
  }

  async dispose(): Promise<void> {
    this.stop()
    mainEventBus.off('tts:speak', this.boundOnSpeak)
    mainEventBus.off('tts:stop', this.boundOnStop)
    mainEventBus.off('persona:switched', this.boundOnPersonaSwitched)
    mainEventBus.off('config:changed', this.boundOnConfigChanged)
    this.provider = null
    this.log.info('TTSService disposed')
  }

  /**
   * Get the voice ID to use — persona override > global config.
   */
  private getActiveVoiceId(): string {
    const persona = this.personaService?.getActive()
    if (persona?.ttsVoiceId) {
      return persona.ttsVoiceId
    }
    return getConfig().tts.voiceId
  }

  /** Create a provider by name */
  private createProvider(name: string, apiKey: string, voiceId: string): void {
    const config = getConfig()

    switch (name) {
      case 'elevenlabs':
        this.provider = new ElevenLabsProvider(apiKey, voiceId, config.tts.model)
        break
      default:
        this.log.error(`Unknown TTS provider: ${name}, falling back to elevenlabs`)
        this.provider = new ElevenLabsProvider(apiKey, voiceId, config.tts.model)
    }
  }

  /** Switch provider at runtime */
  setProvider(name: string): void {
    const config = getConfig()
    if (!config.tts.apiKey) {
      this.log.error('Cannot switch TTS provider: no API key')
      return
    }
    this.createProvider(name, config.tts.apiKey, this.getActiveVoiceId())
    this.log.info(`Switched TTS to provider: ${name}`)
  }

  /** Toggle TTS on/off */
  setEnabled(enabled: boolean): void {
    saveConfig({ tts: { enabled } })
    this.log.info(`TTS ${enabled ? 'enabled' : 'disabled'}`)

    if (enabled && !this.provider) {
      const config = getConfig()
      if (config.tts.apiKey) {
        this.createProvider(config.tts.provider, config.tts.apiKey, this.getActiveVoiceId())
      }
    }

    if (!enabled) {
      this.stop()
    }
  }

  /** Whether the service has a usable provider */
  get isReady(): boolean {
    return this.provider !== null && getConfig().tts.enabled
  }

  /** Speak text — streams audio chunks via event bus */
  async speak(text: string): Promise<void> {
    if (!this.provider) {
      this.log.warn('No TTS provider configured, skipping speech')
      return
    }

    if (!getConfig().tts.enabled) {
      this.log.debug('TTS disabled, skipping speech')
      return
    }

    // Only recreate provider if the voice changed (avoid unnecessary client creation)
    const config = getConfig()
    const targetVoice = this.getActiveVoiceId()
    if (config.tts.apiKey && this.activeVoiceId !== targetVoice) {
      this.createProvider(config.tts.provider, config.tts.apiKey, targetVoice)
      this.activeVoiceId = targetVoice
    }

    // Stop any ongoing speech
    this.stop()

    this.speaking = true
    this.abortController = new AbortController()
    mainEventBus.emit('tts:status', { speaking: true })

    try {
      const stream = this.provider.streamSpeech(text)

      for await (const chunk of stream) {
        if (this.abortController?.signal.aborted) {
          this.log.debug('Speech aborted')
          break
        }

        mainEventBus.emit('tts:audio', { chunk, done: false })
      }

      if (!this.abortController?.signal.aborted) {
        mainEventBus.emit('tts:audio', { chunk: Buffer.alloc(0), done: true })
      }
    } catch (err) {
      const message = formatTTSError(err)
      this.log.error('TTS stream error:', err)

      // Surface error as a dismissable warning in WarningIsland
      mainEventBus.emit('agent:warning', {
        id: 'tts-runtime-error',
        message,
        dismissable: true,
      })

      // Auto-disable TTS on quota exhaustion to avoid spamming failed requests
      if (isTTSQuotaError(err)) {
        this.log.warn('TTS quota exhausted — auto-disabling TTS')
        this.provider = null
        saveConfig({ tts: { enabled: false } })

        // Override warning with explicit "disabled" message
        mainEventBus.emit('agent:warning', {
          id: 'tts-runtime-error',
          message: 'ElevenLabs quota exhausted. TTS has been automatically disabled. Re-enable in Settings → TTS when credits reset.',
          dismissable: true,
        })
      }
    } finally {
      this.speaking = false
      this.abortController = null
      mainEventBus.emit('tts:status', { speaking: false })
    }
  }

  /** Stop current speech */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.speaking = false
  }

  /** Event handler: tts:speak */
  private async onSpeak(payload: { text: string }): Promise<void> {
    await this.speak(payload.text)
  }

  /** Event handler: tts:stop */
  private onStop(): void {
    this.stop()
  }

  /** Event handler: persona:switched — rebuild provider with new voice */
  private onPersonaSwitched(): void {
    const config = getConfig()
    if (config.tts.apiKey && config.tts.enabled) {
      const voiceId = this.getActiveVoiceId()
      this.createProvider(config.tts.provider, config.tts.apiKey, voiceId)
      this.log.info(`TTS voice updated for persona: ${voiceId}`)
    }
  }

  /** Event handler: config:changed — apply TTS settings in realtime */
  private onConfigChanged(config: AppConfig): void {
    if (!config.tts.enabled) {
      this.stop()
      this.provider = null
      this.log.info('TTS disabled at runtime')
      return
    }

    // TTS enabled — create or rebuild provider if API key present
    if (config.tts.apiKey) {
      mainEventBus.emit('agent:dismiss-warning', { id: 'missing-tts-key' })
      this.createProvider(config.tts.provider, config.tts.apiKey, this.getActiveVoiceId())
      this.log.info('TTS provider (re)built from config change')
    }
  }
}
