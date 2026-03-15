import { defineComponent, type PropType } from 'vue'
import type { AppConfig } from '@/composables/useSettings'

/**
 * TTSTab — text-to-speech provider, API key, voice, model, enable toggle.
 */
export default defineComponent({
  name: 'TTSTab',

  props: {
    config: {
      type: Object as PropType<AppConfig>,
      required: true,
    },
  },

  emits: ['update'],

  render() {
    const tts = this.config.tts
    const isAlice = tts.provider === 'yandex-alice'
    return (
      <div class="settings-tab">
        <h3 class="settings-tab__title">Text-to-Speech</h3>

        <label class="settings-field settings-field--row">
          <span class="settings-field__label">Enable TTS</span>
          <input
            type="checkbox"
            class="settings-field__toggle"
            checked={tts.enabled}
            onChange={(e: Event) => { tts.enabled = (e.target as HTMLInputElement).checked }}
          />
        </label>

        <label class="settings-field">
          <span class="settings-field__label">Provider</span>
          <select
            class="settings-field__select"
            value={tts.provider}
            onChange={(e: Event) => { tts.provider = (e.target as HTMLSelectElement).value }}
          >
            <option value="elevenlabs">ElevenLabs</option>
            <option value="yandex-alice">Yandex Alice</option>
          </select>
        </label>

        {!isAlice && (
          <>
            <label class="settings-field">
              <span class="settings-field__label">API Key</span>
              <input
                type="password"
                class="settings-field__input"
                value={tts.apiKey}
                placeholder="Enter TTS API key..."
                onInput={(e: Event) => { tts.apiKey = (e.target as HTMLInputElement).value }}
              />
            </label>

            <label class="settings-field">
              <span class="settings-field__label">Voice ID</span>
              <input
                type="text"
                class="settings-field__input"
                value={tts.voiceId}
                placeholder="ElevenLabs voice ID"
                onInput={(e: Event) => { tts.voiceId = (e.target as HTMLInputElement).value }}
              />
            </label>

            <label class="settings-field">
              <span class="settings-field__label">Model</span>
              <input
                type="text"
                class="settings-field__input"
                value={tts.model}
                placeholder="e.g. eleven_flash_v2_5"
                onInput={(e: Event) => { tts.model = (e.target as HTMLInputElement).value }}
              />
            </label>
          </>
        )}
      </div>
    )
  },
})
