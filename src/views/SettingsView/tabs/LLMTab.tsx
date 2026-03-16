import { defineComponent, ref, type PropType } from 'vue'
import type { AppConfig } from '@/composables/useSettings'
import { api } from '@/api'
import CustomSelect from '../components/CustomSelect'

/**
 * LLMTab — Intelligence settings.
 *
 * Basic: Provider, API Key, Models (compact grid).
 * Advanced (collapsible): Generation Parameters.
 */
export default defineComponent({
  name: 'LLMTab',

  props: {
    config: { type: Object as PropType<AppConfig>, required: true },
  },

  emits: ['update'],

  setup() {
    const showAdvanced = ref(false)
    const resetting = ref(false)
    return { showAdvanced, resetting }
  },

  render() {
    const llm = this.config.llm
    const gen = this.config.generation

    return (
      <div class="settings-tab">
        <h2 class="settings-tab__title">Intelligence</h2>
        <p class="settings-tab__subtitle">AI provider and model configuration</p>

        {/* ── Provider ── */}
        <div class="settings-section">
          <div class="settings-section__title">Provider</div>
          <div class="settings-section__card">
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Provider</span>
              </div>
              <div class="settings-row__control">
                <CustomSelect
                  modelValue={llm.provider}
                  onUpdate:modelValue={(v: string) => { llm.provider = v }}
                  options={[
                    { value: 'gemini', label: 'Google Gemini' },
                    { value: 'openai', label: 'OpenAI / Compatible' },
                  ]}
                />
              </div>
            </div>
          </div>

          <div style="margin-top: 12px;">
            {llm.provider === 'openai' && (
              <label class="settings-field">
                <span class="settings-field__label">Base URL</span>
                <span class="settings-field__hint">API endpoint · Default: http://localhost:1234/v1</span>
                <input type="text" class="settings-field__input" value={llm.baseURL}
                  placeholder="http://localhost:1234/v1"
                  onInput={(e: Event) => { llm.baseURL = (e.target as HTMLInputElement).value }} />
              </label>
            )}
            <label class="settings-field">
              <span class="settings-field__label">API Key</span>
              <input type="password" class="settings-field__input" value={llm.apiKey}
                placeholder={llm.provider === 'openai' ? 'Optional for local models...' : 'Enter your API key...'}
                onInput={(e: Event) => { llm.apiKey = (e.target as HTMLInputElement).value }} />
            </label>
          </div>
        </div>

        {/* ── Models (compact grid) ── */}
        <div class="settings-section">
          <div class="settings-section__title">Models</div>
          <div class="settings-models-grid">
            <label class="settings-field">
              <span class="settings-field__label">Text</span>
              <input type="text" class="settings-field__input" value={llm.textModel}
                placeholder="e.g. gemini-2.5-flash"
                onInput={(e: Event) => { llm.textModel = (e.target as HTMLInputElement).value }} />
            </label>
            <label class="settings-field">
              <span class="settings-field__label">Vision</span>
              <input type="text" class="settings-field__input" value={llm.visionModel}
                placeholder="Same as Text"
                onInput={(e: Event) => { llm.visionModel = (e.target as HTMLInputElement).value }} />
            </label>
            <label class="settings-field">
              <span class="settings-field__label">Classifier</span>
              <input type="text" class="settings-field__input" value={llm.classifierModel}
                placeholder="Same as Text"
                onInput={(e: Event) => { llm.classifierModel = (e.target as HTMLInputElement).value }} />
            </label>
          </div>
        </div>

        {/* ── Advanced: Generation ── */}
        <div class="settings-advanced">
          <button class="settings-advanced__toggle"
            onClick={() => { this.showAdvanced = !this.showAdvanced }}>
            <span class={['settings-advanced__chevron', this.showAdvanced && 'settings-advanced__chevron--open']}>expand_more</span>
            Generation Parameters
          </button>

          {this.showAdvanced && (
            <div class="settings-advanced__content">
              <label class="settings-field">
                <span class="settings-field__label">Chat Temperature</span>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <input type="range" class="settings-field__range" min="0" max="2" step="0.1"
                    value={gen.chatTemperature}
                    onInput={(e: Event) => { gen.chatTemperature = parseFloat((e.target as HTMLInputElement).value) }} />
                  <span class="settings-field__value">{gen.chatTemperature}</span>
                </div>
              </label>
              <label class="settings-field">
                <span class="settings-field__label">Chat Top P</span>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <input type="range" class="settings-field__range" min="0" max="1" step="0.05"
                    value={gen.chatTopP}
                    onInput={(e: Event) => { gen.chatTopP = parseFloat((e.target as HTMLInputElement).value) }} />
                  <span class="settings-field__value">{gen.chatTopP}</span>
                </div>
              </label>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <label class="settings-field">
                  <span class="settings-field__label">Top K</span>
                  <input type="number" class="settings-field__input" value={gen.chatTopK} min="1"
                    onInput={(e: Event) => { gen.chatTopK = parseInt((e.target as HTMLInputElement).value) || 1 }} />
                </label>
                <label class="settings-field">
                  <span class="settings-field__label">Max Tokens</span>
                  <input type="number" class="settings-field__input" value={gen.chatMaxTokens} min="1"
                    onInput={(e: Event) => { gen.chatMaxTokens = parseInt((e.target as HTMLInputElement).value) || 1 }} />
                </label>
              </div>
              <label class="settings-field">
                <span class="settings-field__label">Vision Temperature</span>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <input type="range" class="settings-field__range" min="0" max="2" step="0.1"
                    value={gen.visionTemperature}
                    onInput={(e: Event) => { gen.visionTemperature = parseFloat((e.target as HTMLInputElement).value) }} />
                  <span class="settings-field__value">{gen.visionTemperature}</span>
                </div>
              </label>
              <label class="settings-field">
                <span class="settings-field__label">Vision Max Tokens</span>
                <input type="number" class="settings-field__input settings-field__input--short" value={gen.visionMaxTokens} min="1"
                  onInput={(e: Event) => { gen.visionMaxTokens = parseInt((e.target as HTMLInputElement).value) || 1 }} />
              </label>
            </div>
          )}
        </div>
        <button class="settings-reset-btn" onClick={async () => {
          this.resetting = true
          try {
            const u1 = await api.settings.resetSection.mutate({ section: 'llm' })
            this.$emit('update', 'llm', u1.llm)
            const u2 = await api.settings.resetSection.mutate({ section: 'generation' })
            this.$emit('update', 'generation', u2.generation)
          } finally { this.resetting = false }
        }} disabled={this.resetting}>
          <span class="settings-reset-btn__icon">restart_alt</span>
          {this.resetting ? 'Resetting…' : 'Reset Intelligence to Defaults'}
        </button>
      </div>
    )
  },
})
