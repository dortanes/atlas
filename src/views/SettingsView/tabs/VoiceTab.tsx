import { defineComponent, ref, computed, type PropType, onMounted } from 'vue'
import type { AppConfig } from '@/composables/useSettings'
import { api } from '@/api'
import CustomSelect from '../components/CustomSelect'

/**
 * VoiceTab — combined TTS + STT settings.
 * Languages sorted alphabetically. CustomSelect dropdowns.
 */
export default defineComponent({
  name: 'VoiceTab',

  props: {
    config: { type: Object as PropType<AppConfig>, required: true },
  },

  emits: ['update'],

  setup(props) {
    const modelStatus = ref<{ downloaded: boolean; path: string }>({ downloaded: false, path: '' })
    const downloading = ref(false)
    const downloadProgress = ref(0)
    const downloadError = ref('')
    const languages = ref<{ code: string; label: string }[]>([])
    const resetting = ref(false)

    const sortedLanguages = computed(() =>
      [...languages.value].sort((a, b) => a.label.localeCompare(b.label)),
    )

    const languageOptions = computed(() =>
      sortedLanguages.value.map((l) => ({ value: l.code, label: l.label })),
    )

    onMounted(async () => {
      try {
        const [status, langs] = await Promise.all([
          api.audio.getSTTModelStatus.query(),
          api.audio.getSTTLanguages.query(),
        ])
        modelStatus.value = status as { downloaded: boolean; path: string }
        languages.value = langs as { code: string; label: string }[]
      } catch (err) {
        console.error('Failed to load STT status:', err)
      }

      api.audio.onSTTModelStatus.subscribe(undefined, {
        onData(data: { downloaded: boolean; progress?: number; error?: string }) {
          if (data.downloaded) {
            modelStatus.value.downloaded = true
            downloading.value = false
            downloadProgress.value = 100
          }
          if (data.progress !== undefined) downloadProgress.value = data.progress
          if (data.error) { downloadError.value = data.error; downloading.value = false }
        },
      })
    })

    async function downloadModel() {
      downloading.value = true
      downloadError.value = ''
      downloadProgress.value = 0
      try {
        await api.audio.downloadSTTModel.mutate({ language: props.config.stt.language })
        modelStatus.value.downloaded = true
      } catch (err: unknown) {
        downloadError.value = (err as Error).message || 'Download failed'
      } finally {
        downloading.value = false
      }
    }

    async function refreshModelStatus() {
      try {
        const status = await api.audio.getSTTModelStatus.query({ language: props.config.stt.language })
        modelStatus.value = status as { downloaded: boolean; path: string }
      } catch (err) {
        console.error('Failed to refresh STT model status:', err)
      }
    }

    return { modelStatus, downloading, downloadProgress, downloadError, languageOptions, downloadModel, resetting, refreshModelStatus }
  },

  render() {
    const tts = this.config.tts
    const stt = this.config.stt
    const isAlice = tts.provider === 'yandex-alice'

    return (
      <div class="settings-tab">
        <h2 class="settings-tab__title">Voice</h2>
        <p class="settings-tab__subtitle">Text-to-Speech and Speech-to-Text</p>

        {/* TTS */}
        <div class="settings-section">
          <div class="settings-section__title">Text-to-Speech</div>
          <div class="settings-section__card">
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Enable TTS</span>
                <span class="settings-row__hint">Voice output for agent responses</span>
              </div>
              <div class="settings-row__control">
                <input type="checkbox" class="settings-field__toggle" checked={tts.enabled}
                  onChange={(e: Event) => { tts.enabled = (e.target as HTMLInputElement).checked }} />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Provider</span>
              </div>
              <div class="settings-row__control">
                <CustomSelect
                  modelValue={tts.provider}
                  onUpdate:modelValue={(v: string) => { tts.provider = v }}
                  options={[
                    { value: 'elevenlabs', label: 'ElevenLabs' },
                    { value: 'yandex-alice', label: 'Yandex Alice' },
                  ]}
                />
              </div>
            </div>
          </div>

          {!isAlice && (
            <div style="margin-top: 12px;">
              <label class="settings-field">
                <span class="settings-field__label">API Key</span>
                <input type="password" class="settings-field__input" value={tts.apiKey}
                  placeholder="Enter TTS API key..."
                  onInput={(e: Event) => { tts.apiKey = (e.target as HTMLInputElement).value }} />
              </label>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <label class="settings-field">
                  <span class="settings-field__label">Voice ID</span>
                  <input type="text" class="settings-field__input" value={tts.voiceId}
                    placeholder="Voice ID"
                    onInput={(e: Event) => { tts.voiceId = (e.target as HTMLInputElement).value }} />
                </label>
                <label class="settings-field">
                  <span class="settings-field__label">Model</span>
                  <input type="text" class="settings-field__input" value={tts.model}
                    placeholder="e.g. eleven_flash_v2_5"
                    onInput={(e: Event) => { tts.model = (e.target as HTMLInputElement).value }} />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* STT */}
        <div class="settings-section">
          <div class="settings-section__title">Speech-to-Text</div>
          <div class="settings-section__card">
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Enable STT</span>
                <span class="settings-row__hint">Voice input with wake word</span>
              </div>
              <div class="settings-row__control">
                <input type="checkbox" class="settings-field__toggle" checked={stt.enabled}
                  onChange={(e: Event) => { stt.enabled = (e.target as HTMLInputElement).checked }} />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Language</span>
              </div>
              <div class="settings-row__control">
                <CustomSelect
                  modelValue={stt.language}
                  onUpdate:modelValue={(v: string) => { stt.language = v; this.refreshModelStatus() }}
                  options={this.languageOptions}
                />
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__info">
                <span class="settings-row__label">Model</span>
                <span class="settings-row__hint">
                  {this.modelStatus.downloaded ? '✓ Downloaded' : 'Not downloaded'}
                </span>
              </div>
              <div class="settings-row__control">
                {!this.modelStatus.downloaded && (
                  this.downloading ? (
                    <div class="stt-download-progress" style="width: 160px;">
                      <div class="stt-download-progress__bar" style={{ width: `${this.downloadProgress}%` }} />
                      <span class="stt-download-progress__text">{this.downloadProgress}%</span>
                    </div>
                  ) : (
                    <button class="settings-field__button" onClick={this.downloadModel}>
                      <span class="settings-field__button-icon">download</span>
                      Download
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
          {this.downloadError && (
            <div style="margin-top: 8px; color: oklch(0.72 0.17 25); font-size: 12px;">{this.downloadError}</div>
          )}
        </div>

        {/* Reset */}
        <button class="settings-reset-btn" onClick={async () => {
          this.resetting = true
          try {
            const u1 = await api.settings.resetSection.mutate({ section: 'tts' })
            this.$emit('update', 'tts', u1.tts)
            const u2 = await api.settings.resetSection.mutate({ section: 'stt' })
            this.$emit('update', 'stt', u2.stt)
          } finally { this.resetting = false }
        }} disabled={this.resetting}>
          <span class="settings-reset-btn__icon">restart_alt</span>
          {this.resetting ? 'Resetting…' : 'Reset Voice to Defaults'}
        </button>
      </div>
    )
  },
})
