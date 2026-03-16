import { defineComponent, type PropType } from 'vue'
import { api } from '@/api'
import type { AppConfig } from '@/composables/useSettings'
import CustomSelect from '../components/CustomSelect'

/**
 * GeneralTab — UI, sounds, hotkey, diagnostics.
 * Closes settings on external actions.
 */
export default defineComponent({
  name: 'GeneralTab',

  props: {
    config: { type: Object as PropType<AppConfig>, required: true },
  },

  emits: ['update', 'close'],

  data() {
    return {
      recording: false,
      recordingHandler: null as ((e: KeyboardEvent) => void) | null,
      resetting: false,
    }
  },

  beforeUnmount() { this.stopRecording() },

  methods: {
    stopRecording() {
      if (this.recordingHandler) {
        window.removeEventListener('keydown', this.recordingHandler, true)
        this.recordingHandler = null
      }
      this.recording = false
    },
    startRecording() {
      this.stopRecording()
      this.recording = true
      const handler = (e: KeyboardEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const parts: string[] = []
        if (e.ctrlKey) parts.push('Ctrl')
        if (e.altKey) parts.push('Alt')
        if (e.shiftKey) parts.push('Shift')
        if (e.metaKey) parts.push('Meta')
        const key = e.key
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return
        parts.push(key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key)
        this.config.hotkey = parts.join('+')
        this.stopRecording()
      }
      this.recordingHandler = handler
      window.addEventListener('keydown', handler, true)
    },
    openLogFile() {
      api.settings.openLogFile.mutate()
      this.$emit('close')
    },
    openLogsFolder() {
      api.settings.openSessionLogs.mutate()
      this.$emit('close')
    },
    async resetDefaults() {
      this.resetting = true
      try {
        const updated = await api.settings.resetSection.mutate({ section: 'ui' })
        Object.assign(this.config.ui, updated.ui)
      } finally {
        this.resetting = false
      }
    },
  },

  render() {
    const ui = this.config.ui
    return (
      <div class="settings-tab">
        <h2 class="settings-tab__title">General</h2>
        <p class="settings-tab__subtitle">Interface, sounds, and diagnostics</p>

        {/* Interface */}
        <div class="settings-section">
          <div class="settings-section__title">Interface</div>
          <div class="settings-section__card">
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Position</span>
                <span class="settings-row__hint">Where Atlas appears on screen</span>
              </div>
              <div class="settings-row__control">
                <CustomSelect
                  modelValue={ui.positionSide}
                  onUpdate:modelValue={(v: string) => { ui.positionSide = v as 'left' | 'right' | 'center' }}
                  options={[
                    { value: 'left', label: 'Left' },
                    { value: 'center', label: 'Center' },
                    { value: 'right', label: 'Right' },
                  ]}
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Global Hotkey</span>
                <span class="settings-row__hint">Toggle Atlas visibility</span>
              </div>
              <div class="settings-row__control">
                <div class="settings-hotkey">
                  <kbd class="settings-hotkey__key">{this.config.hotkey}</kbd>
                  <button class="settings-hotkey__record" onClick={() => this.startRecording()}>
                    {this.recording ? 'Press keys…' : 'Change'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sounds */}
        <div class="settings-section">
          <div class="settings-section__title">Sounds</div>
          <div class="settings-section__card">
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Sound Effects</span>
                <span class="settings-row__hint">UI feedback sounds</span>
              </div>
              <div class="settings-row__control">
                <input type="checkbox" class="settings-field__toggle" checked={ui.soundEnabled}
                  onChange={(e: Event) => { ui.soundEnabled = (e.target as HTMLInputElement).checked }} />
              </div>
            </div>
            {ui.soundEnabled && (
              <div class="settings-row">
                <div class="settings-row__info">
                  <span class="settings-row__label">Volume</span>
                  <span class="settings-row__hint">{Math.round(ui.soundVolume * 100)}%</span>
                </div>
                <div class="settings-row__control" style="flex: 1; max-width: 200px;">
                  <input type="range" class="settings-field__range" min="0" max="1" step="0.05"
                    value={ui.soundVolume}
                    onInput={(e: Event) => { ui.soundVolume = parseFloat((e.target as HTMLInputElement).value) }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Diagnostics */}
        <div class="settings-section">
          <div class="settings-section__title">Diagnostics</div>
          <div class="settings-section__card">
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Log Level</span>
              </div>
              <div class="settings-row__control">
                <CustomSelect
                  modelValue={ui.logLevel}
                  onUpdate:modelValue={(v: string) => { ui.logLevel = v as 'debug' | 'info' | 'warn' | 'error' }}
                  options={[
                    { value: 'debug', label: 'Debug' },
                    { value: 'info', label: 'Info' },
                    { value: 'warn', label: 'Warn' },
                    { value: 'error', label: 'Error' },
                  ]}
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Debug Logging</span>
                <span class="settings-row__hint">Write detailed session logs</span>
              </div>
              <div class="settings-row__control">
                <input type="checkbox" class="settings-field__toggle" checked={ui.debugLog}
                  onChange={(e: Event) => { ui.debugLog = (e.target as HTMLInputElement).checked }} />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Open DevTools</span>
                <span class="settings-row__hint">Auto-open on launch</span>
              </div>
              <div class="settings-row__control">
                <input type="checkbox" class="settings-field__toggle" checked={ui.openDevTools}
                  onChange={(e: Event) => { ui.openDevTools = (e.target as HTMLInputElement).checked }} />
              </div>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 4px;">
          <button class="settings-field__button" style="flex: 1;" onClick={() => this.openLogFile()}>
            <span class="settings-field__button-icon">description</span>
            Open Log File
          </button>
          <button class="settings-field__button" style="flex: 1;" onClick={() => this.openLogsFolder()}>
            <span class="settings-field__button-icon">folder_open</span>
            Open Logs Folder
          </button>
        </div>

        {/* Reset */}
        <button class="settings-reset-btn" onClick={() => this.resetDefaults()} disabled={this.resetting}>
          <span class="settings-reset-btn__icon">restart_alt</span>
          {this.resetting ? 'Resetting…' : 'Reset General to Defaults'}
        </button>
      </div>
    )
  },
})
