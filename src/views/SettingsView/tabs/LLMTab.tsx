import { defineComponent, type PropType } from 'vue'
import type { AppConfig } from '@/composables/useSettings'

/**
 * LLMTab — LLM provider, API key, models, and generation parameters.
 */
export default defineComponent({
  name: 'LLMTab',

  props: {
    config: {
      type: Object as PropType<AppConfig>,
      required: true,
    },
  },

  emits: ['update'],

  render() {
    const llm = this.config.llm
    const gen = this.config.generation

    return (
      <div class="settings-tab">
        <h3 class="settings-tab__title">LLM Provider</h3>

        <label class="settings-field">
          <span class="settings-field__label">Provider</span>
          <select
            class="settings-field__select"
            value={llm.provider}
            onChange={(e: Event) => { llm.provider = (e.target as HTMLSelectElement).value }}
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI / OpenAI-Compatible</option>
          </select>
        </label>

        {llm.provider === 'openai' && (
          <label class="settings-field">
            <span class="settings-field__label">Base URL</span>
            <span class="settings-field__hint">API endpoint · Default: http://localhost:1234/v1 (LMStudio)</span>
            <input
              type="text"
              class="settings-field__input"
              value={llm.baseURL}
              placeholder="http://localhost:1234/v1"
              onInput={(e: Event) => { llm.baseURL = (e.target as HTMLInputElement).value }}
            />
          </label>
        )}

        <label class="settings-field">
          <span class="settings-field__label">API Key</span>
          {llm.provider === 'openai' && (
            <span class="settings-field__hint">Optional for local models (LMStudio, Ollama)</span>
          )}
          <input
            type="password"
            class="settings-field__input"
            value={llm.apiKey}
            placeholder={llm.provider === 'openai' ? 'Optional for local models...' : 'Enter your API key...'}
            onInput={(e: Event) => { llm.apiKey = (e.target as HTMLInputElement).value }}
          />
        </label>

        <h3 class="settings-tab__title" style="margin-top: 24px">Models</h3>

        <label class="settings-field">
          <span class="settings-field__label">Text Model</span>
          <span class="settings-field__hint">Main chat, streaming, thoughts</span>
          <input
            type="text"
            class="settings-field__input"
            value={llm.textModel}
            placeholder="e.g. gemini-2.5-flash"
            onInput={(e: Event) => { llm.textModel = (e.target as HTMLInputElement).value }}
          />
        </label>

        <label class="settings-field">
          <span class="settings-field__label">Vision Model</span>
          <span class="settings-field__hint">Screenshot analysis · Falls back to Text Model if empty</span>
          <input
            type="text"
            class="settings-field__input"
            value={llm.visionModel}
            placeholder="Same as Text Model"
            onInput={(e: Event) => { llm.visionModel = (e.target as HTMLInputElement).value }}
          />
        </label>

        <label class="settings-field">
          <span class="settings-field__label">Classifier Model</span>
          <span class="settings-field__hint">Intent detection · Use a cheap model · Falls back to Text Model</span>
          <input
            type="text"
            class="settings-field__input"
            value={llm.classifierModel}
            placeholder="Same as Text Model"
            onInput={(e: Event) => { llm.classifierModel = (e.target as HTMLInputElement).value }}
          />
        </label>

        <h3 class="settings-tab__title" style="margin-top: 24px">Generation Parameters</h3>

        <label class="settings-field">
          <span class="settings-field__label">Chat Temperature</span>
          <span class="settings-field__hint">Creativity (0 = deterministic, 2 = max creative) · Default: 0.7</span>
          <input
            type="range"
            class="settings-field__range"
            min="0" max="2" step="0.1"
            value={gen.chatTemperature}
            onInput={(e: Event) => { gen.chatTemperature = parseFloat((e.target as HTMLInputElement).value) }}
          />
          <span class="settings-field__value">{gen.chatTemperature}</span>
        </label>

        <label class="settings-field">
          <span class="settings-field__label">Chat Top P</span>
          <span class="settings-field__hint">Nucleus sampling probability · Default: 0.95</span>
          <input
            type="range"
            class="settings-field__range"
            min="0" max="1" step="0.05"
            value={gen.chatTopP}
            onInput={(e: Event) => { gen.chatTopP = parseFloat((e.target as HTMLInputElement).value) }}
          />
          <span class="settings-field__value">{gen.chatTopP}</span>
        </label>

        <label class="settings-field">
          <span class="settings-field__label">Chat Top K</span>
          <span class="settings-field__hint">Top tokens to consider (Gemini only) · Default: 40</span>
          <input
            type="number"
            class="settings-field__input settings-field__input--short"
            value={gen.chatTopK}
            min="1"
            onInput={(e: Event) => { gen.chatTopK = parseInt((e.target as HTMLInputElement).value) || 1 }}
          />
        </label>

        <label class="settings-field">
          <span class="settings-field__label">Chat Max Tokens</span>
          <span class="settings-field__hint">Maximum output tokens for chat · Default: 2048</span>
          <input
            type="number"
            class="settings-field__input settings-field__input--short"
            value={gen.chatMaxTokens}
            min="1"
            onInput={(e: Event) => { gen.chatMaxTokens = parseInt((e.target as HTMLInputElement).value) || 1 }}
          />
        </label>

        <label class="settings-field">
          <span class="settings-field__label">Vision Temperature</span>
          <span class="settings-field__hint">For screenshot analysis (lower = more precise) · Default: 0.2</span>
          <input
            type="range"
            class="settings-field__range"
            min="0" max="2" step="0.1"
            value={gen.visionTemperature}
            onInput={(e: Event) => { gen.visionTemperature = parseFloat((e.target as HTMLInputElement).value) }}
          />
          <span class="settings-field__value">{gen.visionTemperature}</span>
        </label>

        <label class="settings-field">
          <span class="settings-field__label">Vision Max Tokens</span>
          <span class="settings-field__hint">Maximum output tokens for vision/actions · Default: 1024</span>
          <input
            type="number"
            class="settings-field__input settings-field__input--short"
            value={gen.visionMaxTokens}
            min="1"
            onInput={(e: Event) => { gen.visionMaxTokens = parseInt((e.target as HTMLInputElement).value) || 1 }}
          />
        </label>
      </div>
    )
  },
})
