import { defineComponent, type PropType } from 'vue'
import type { AppConfig } from '@/composables/useSettings'

/**
 * AgentTab — agent loop parameters: iterations, delays, context, screenshot settings.
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

  render() {
    const agent = this.config.agent
    return (
      <div class="settings-tab">
        <h3 class="settings-tab__title">Agent Loop</h3>

        <label class="settings-field">
          <span class="settings-field__label">Max Iterations</span>
          <span class="settings-field__hint">Maximum actions per command before force-stopping · Default: 15</span>
          <input
            type="number"
            class="settings-field__input settings-field__input--short"
            value={agent.maxIterations}
            min="1" max="100"
            onInput={(e: Event) => { agent.maxIterations = parseInt((e.target as HTMLInputElement).value) || 1 }}
          />
        </label>

        <label class="settings-field">
          <span class="settings-field__label">Max Consecutive Failures</span>
          <span class="settings-field__hint">Failures in a row before aborting · Default: 3</span>
          <input
            type="number"
            class="settings-field__input settings-field__input--short"
            value={agent.maxConsecutiveFailures}
            min="1" max="20"
            onInput={(e: Event) => { agent.maxConsecutiveFailures = parseInt((e.target as HTMLInputElement).value) || 1 }}
          />
        </label>

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
          <span class="settings-field__hint">Wait after click before verification screenshot · Default: 800</span>
          <input
            type="number"
            class="settings-field__input settings-field__input--short"
            value={agent.postActionDelay}
            min="0" max="5000" step="50"
            onInput={(e: Event) => { agent.postActionDelay = parseInt((e.target as HTMLInputElement).value) || 0 }}
          />
        </label>

        <h3 class="settings-tab__title" style="margin-top: 24px">Context & Limits</h3>

        <label class="settings-field">
          <span class="settings-field__label">Max Context Messages</span>
          <span class="settings-field__hint">Messages sent to LLM from conversation history · Default: 40</span>
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

        <h3 class="settings-tab__title" style="margin-top: 24px">Screenshots</h3>

        <label class="settings-field">
          <span class="settings-field__label">Screenshot Max Width (px)</span>
          <span class="settings-field__hint">Resize for LLM (1280 = optimal for VLM accuracy) · Default: 1280</span>
          <input
            type="number"
            class="settings-field__input settings-field__input--short"
            value={agent.screenshotMaxWidth}
            min="640" max="3840" step="64"
            onInput={(e: Event) => { agent.screenshotMaxWidth = parseInt((e.target as HTMLInputElement).value) || 640 }}
          />
        </label>

        <label class="settings-field">
          <span class="settings-field__label">Screenshot Quality</span>
          <span class="settings-field__hint">JPEG quality (1–100) · Default: 80</span>
          <input
            type="range"
            class="settings-field__range"
            min="1" max="100" step="1"
            value={agent.screenshotQuality}
            onInput={(e: Event) => { agent.screenshotQuality = parseInt((e.target as HTMLInputElement).value) || 80 }}
          />
          <span class="settings-field__value">{agent.screenshotQuality}</span>
        </label>
      </div>
    )
  },
})
