import { defineComponent, ref, type PropType } from 'vue'
import type { AppConfig } from '@/composables/useSettings'
import { api } from '@/api'

/**
 * AgentTab — agent loop parameters.
 *
 * Basic: Max Iterations.
 * Advanced (collapsible): Delays, Context, Screenshots.
 */
export default defineComponent({
  name: 'AgentTab',

  props: {
    config: {
      type: Object as PropType<AppConfig>,
      required: true,
    },
  },

  emits: ['update'],

  setup() {
    const showAdvanced = ref(false)
    const resetting = ref(false)
    return { showAdvanced, resetting }
  },

  render() {
    const agent = this.config.agent
    return (
      <div class="settings-tab">
        <h2 class="settings-tab__title">Agent</h2>
        <p class="settings-tab__subtitle">Action loop and automation parameters</p>

        {/* ── Basic ── */}
        <div class="settings-section">
          <div class="settings-section__title">Execution</div>
          <div class="settings-section__card">
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Max Iterations</span>
                <span class="settings-row__hint">Maximum actions per command · Default: 15</span>
              </div>
              <div class="settings-row__control">
                <input
                  type="number"
                  class="settings-field__input"
                  style="width: 80px; text-align: center;"
                  value={agent.maxIterations}
                  min="1" max="100"
                  onInput={(e: Event) => { agent.maxIterations = parseInt((e.target as HTMLInputElement).value) || 1 }}
                />
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Max Consecutive Failures</span>
                <span class="settings-row__hint">Failures in a row before aborting · Default: 3</span>
              </div>
              <div class="settings-row__control">
                <input
                  type="number"
                  class="settings-field__input"
                  style="width: 80px; text-align: center;"
                  value={agent.maxConsecutiveFailures}
                  min="1" max="20"
                  onInput={(e: Event) => { agent.maxConsecutiveFailures = parseInt((e.target as HTMLInputElement).value) || 1 }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Advanced ── */}
        <div class="settings-advanced">
          <button
            class="settings-advanced__toggle"
            onClick={() => { this.showAdvanced = !this.showAdvanced }}
          >
            <span
              class={['settings-advanced__chevron', this.showAdvanced && 'settings-advanced__chevron--open']}
            >expand_more</span>
            Advanced Settings
          </button>

          {this.showAdvanced && (
            <div class="settings-advanced__content">
              {/* Timing */}
              <div class="settings-section">
                <div class="settings-section__title">Timing</div>

                <label class="settings-field">
                  <span class="settings-field__label">Pre-Action Delay (ms)</span>
                  <span class="settings-field__hint">Cooldown before each action · Default: 200</span>
                  <input
                    type="number"
                    class="settings-field__input settings-field__input--short"
                    value={agent.preActionDelay}
                    min="0" max="5000" step="50"
                    onInput={(e: Event) => { agent.preActionDelay = parseInt((e.target as HTMLInputElement).value) || 0 }}
                  />
                </label>

                <label class="settings-field">
                  <span class="settings-field__label">Post-Action Delay (ms)</span>
                  <span class="settings-field__hint">Wait after click before verification · Default: 800</span>
                  <input
                    type="number"
                    class="settings-field__input settings-field__input--short"
                    value={agent.postActionDelay}
                    min="0" max="5000" step="50"
                    onInput={(e: Event) => { agent.postActionDelay = parseInt((e.target as HTMLInputElement).value) || 0 }}
                  />
                </label>
              </div>

              {/* Context */}
              <div class="settings-section">
                <div class="settings-section__title">Context & Limits</div>

                <label class="settings-field">
                  <span class="settings-field__label">Max Context Messages</span>
                  <span class="settings-field__hint">Messages sent to LLM from history · Default: 40</span>
                  <input
                    type="number"
                    class="settings-field__input settings-field__input--short"
                    value={agent.maxContextMessages}
                    min="1" max="200"
                    onInput={(e: Event) => { agent.maxContextMessages = parseInt((e.target as HTMLInputElement).value) || 1 }}
                  />
                </label>

                <label class="settings-field">
                  <span class="settings-field__label">Command Timeout (ms)</span>
                  <span class="settings-field__hint">Max time for shell commands · Default: 30000</span>
                  <input
                    type="number"
                    class="settings-field__input settings-field__input--short"
                    value={agent.commandTimeout}
                    min="1000" max="300000" step="1000"
                    onInput={(e: Event) => { agent.commandTimeout = parseInt((e.target as HTMLInputElement).value) || 1000 }}
                  />
                </label>
              </div>

              {/* Screenshots */}
              <div class="settings-section">
                <div class="settings-section__title">Screenshots</div>

                <label class="settings-field">
                  <span class="settings-field__label">Max Width (px)</span>
                  <span class="settings-field__hint">Resize for LLM (1280 = optimal) · Default: 1280</span>
                  <input
                    type="number"
                    class="settings-field__input settings-field__input--short"
                    value={agent.screenshotMaxWidth}
                    min="640" max="3840" step="64"
                    onInput={(e: Event) => { agent.screenshotMaxWidth = parseInt((e.target as HTMLInputElement).value) || 640 }}
                  />
                </label>

                <label class="settings-field">
                  <span class="settings-field__label">Quality</span>
                  <span class="settings-field__hint">JPEG quality (1–100) · Default: 80</span>
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <input
                      type="range"
                      class="settings-field__range"
                      min="1" max="100" step="1"
                      value={agent.screenshotQuality}
                      onInput={(e: Event) => { agent.screenshotQuality = parseInt((e.target as HTMLInputElement).value) || 80 }}
                    />
                    <span class="settings-field__value">{agent.screenshotQuality}</span>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>
        <button class="settings-reset-btn" onClick={async () => {
          this.resetting = true
          try {
            const u = await api.settings.resetSection.mutate({ section: 'agent' })
            this.$emit('update', 'agent', u.agent)
          } finally { this.resetting = false }
        }} disabled={this.resetting}>
          <span class="settings-reset-btn__icon">restart_alt</span>
          {this.resetting ? 'Resetting…' : 'Reset Agent to Defaults'}
        </button>
      </div>
    )
  },
})
