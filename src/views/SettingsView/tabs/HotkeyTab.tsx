import { defineComponent, type PropType } from 'vue'
import type { AppConfig } from '@/composables/useSettings'

/**
 * HotkeyTab — displays and configures the global hotkey.
 */
export default defineComponent({
  name: 'HotkeyTab',

  props: {
    config: {
      type: Object as PropType<AppConfig>,
      required: true,
    },
  },

  emits: ['update'],

  data() {
    return {
      recording: false,
      recordingHandler: null as any,
    }
  },

  beforeUnmount() {
    this.stopRecording()
  },

  methods: {
    onChange(key: keyof AppConfig, value: any) {
      this.$emit('update', key, value)
    },

    stopRecording() {
      if (this.recordingHandler) {
        window.removeEventListener('keydown', this.recordingHandler, true)
        this.recordingHandler = null
      }
      this.recording = false
    },

    startRecording() {
      // Clean up any existing handler
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

        // Ignore modifier-only keypresses
        const key = e.key
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return

        parts.push(key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key)

        this.onChange('hotkey', parts.join('+'))
        this.stopRecording()
      }

      this.recordingHandler = handler
      window.addEventListener('keydown', handler, true)
    },
  },

  render() {
    return (
      <div class="settings-tab">
        <h3 class="settings-tab__title">Hotkey</h3>

        <div class="settings-field">
          <span class="settings-field__label">Toggle Atlas</span>
          <div class="settings-hotkey">
            <kbd class="settings-hotkey__key">{this.config.hotkey}</kbd>
            <button
              class="settings-hotkey__record"
              onClick={this.startRecording}
            >
              {this.recording ? 'Press a key combo…' : 'Change'}
            </button>
          </div>
        </div>

        <p class="settings-tab__hint">
          Hotkey changes take effect immediately after saving.
        </p>
      </div>
    )
  },
})
