import { defineComponent, type PropType } from 'vue'
import { api } from '@/api'
import type { AppConfig } from '@/composables/useSettings'

/**
 * GeneralTab — UI settings: position, log level, alwaysOnTop, devTools, debugLog.
 */
export default defineComponent({
  name: 'GeneralTab',

  props: {
    config: {
      type: Object as PropType<AppConfig>,
      required: true,
    },
  },

  emits: ['update'],

  render() {
    const ui = this.config.ui
    return (
      <div class="settings-tab">
        <h3 class="settings-tab__title">General</h3>

        <label class="settings-field">
          <span class="settings-field__label">UI Position</span>
          <select
            class="settings-field__select"
            value={ui.positionSide}
            onChange={(e: Event) => { ui.positionSide = (e.target as HTMLSelectElement).value as 'left' | 'right' | 'center' }}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>

        <label class="settings-field">
          <span class="settings-field__label">Log Level</span>
          <select
            class="settings-field__select"
            value={ui.logLevel}
            onChange={(e: Event) => { ui.logLevel = (e.target as HTMLSelectElement).value as 'debug' | 'info' | 'warn' | 'error' }}
          >
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </label>

        <label class="settings-field settings-field--row">
          <span class="settings-field__label">Always on Top</span>
          <input
            type="checkbox"
            class="settings-field__toggle"
            checked={ui.alwaysOnTop}
            onChange={(e: Event) => { ui.alwaysOnTop = (e.target as HTMLInputElement).checked }}
          />
        </label>

        <label class="settings-field settings-field--row">
          <span class="settings-field__label">Open DevTools</span>
          <span class="settings-field__hint">Auto-open developer tools on launch</span>
          <input
            type="checkbox"
            class="settings-field__toggle"
            checked={ui.openDevTools}
            onChange={(e: Event) => { ui.openDevTools = (e.target as HTMLInputElement).checked }}
          />
        </label>

        <label class="settings-field settings-field--row">
          <span class="settings-field__label">Debug Log</span>
          <span class="settings-field__hint">Write detailed session logs for each request</span>
          <input
            type="checkbox"
            class="settings-field__toggle"
            checked={ui.debugLog}
            onChange={(e: Event) => { ui.debugLog = (e.target as HTMLInputElement).checked }}
          />
        </label>

        <div class="settings-field">
          <button
            class="settings-field__button"
            onClick={() => { api.settings.openSessionLogs.mutate() }}
          >
            📂 Open Logs Folder
          </button>
        </div>
      </div>
    )
  },
})

