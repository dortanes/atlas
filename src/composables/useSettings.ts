import { ref, reactive, toRaw } from 'vue'
import { api } from '@/api'

/**
 * useSettings — composable for settings UI.
 *
 * Loads/saves AppConfig via tRPC, manages prompt editing,
 * and provides loading/saving reactive states.
 */

export interface UIConfig {
  alwaysOnTop: boolean
  positionSide: 'left' | 'right' | 'center'
  openDevTools: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
}

export interface LLMConfig {
  provider: string
  baseURL: string
  apiKey: string
  textModel: string
  visionModel: string
  classifierModel: string
}

export interface GenerationConfig {
  chatTemperature: number
  chatTopP: number
  chatTopK: number
  chatMaxTokens: number
  visionTemperature: number
  visionMaxTokens: number
}

export interface TTSConfig {
  provider: string
  apiKey: string
  voiceId: string
  model: string
  enabled: boolean
}

export interface AgentConfig {
  maxIterations: number
  maxConsecutiveFailures: number
  preActionDelay: number
  postActionDelay: number
  maxContextMessages: number
  commandTimeout: number
  screenshotMaxWidth: number
  screenshotQuality: number
}

export interface AppConfig {
  ui: UIConfig
  llm: LLMConfig
  generation: GenerationConfig
  tts: TTSConfig
  agent: AgentConfig
  hotkey: string
  activePersonaId: string
}

export function useSettings() {
  const config = reactive<AppConfig>({
    ui: {
      alwaysOnTop: true,
      positionSide: 'right',
      openDevTools: false,
      logLevel: 'debug',
    },
    llm: {
      provider: 'gemini',
      baseURL: 'http://localhost:1234/v1',
      apiKey: '',
      textModel: '',
      visionModel: '',
      classifierModel: '',
    },
    generation: {
      chatTemperature: 0.7,
      chatTopP: 0.95,
      chatTopK: 40,
      chatMaxTokens: 2048,
      visionTemperature: 0.2,
      visionMaxTokens: 1024,
    },
    tts: {
      provider: 'elevenlabs',
      apiKey: '',
      voiceId: '',
      model: '',
      enabled: true,
    },
    agent: {
      maxIterations: 15,
      maxConsecutiveFailures: 3,
      preActionDelay: 200,
      postActionDelay: 800,
      maxContextMessages: 40,
      commandTimeout: 30000,
      screenshotMaxWidth: 1280,
      screenshotQuality: 80,
    },
    hotkey: 'Ctrl+Space',
    activePersonaId: 'atlas-default',
  })

  const loading = ref(false)
  const saving = ref(false)
  const saved = ref(false)

  /** Load config from backend */
  async function loadConfig() {
    loading.value = true
    try {
      const result = await api.settings.getConfig.query()
      Object.assign(config, result)
    } catch (err) {
      console.error('Failed to load config:', err)
    } finally {
      loading.value = false
    }
  }

  /** Save current config to backend */
  async function saveConfig() {
    saving.value = true
    saved.value = false
    try {
      const raw = JSON.parse(JSON.stringify(config))
      const result = await api.settings.saveConfig.mutate(raw)
      Object.assign(config, result)
      saved.value = true
      setTimeout(() => { saved.value = false }, 2000)
    } catch (err) {
      console.error('Failed to save config:', err)
    } finally {
      saving.value = false
    }
  }

  // ── Prompts ──

  const prompts = ref<string[]>([])
  const activePrompt = ref('')
  const promptContent = ref('')
  const promptLoading = ref(false)
  const promptSaving = ref(false)

  async function listPrompts(personaId?: string) {
    try {
      prompts.value = await api.settings.listPrompts.query(personaId ? { personaId } : undefined)
    } catch (err) {
      console.error('Failed to list prompts:', err)
    }
  }

  async function loadPrompt(name: string, personaId?: string) {
    activePrompt.value = name
    promptLoading.value = true
    try {
      promptContent.value = await api.settings.getPrompt.query({ name, personaId })
    } catch (err) {
      console.error('Failed to load prompt:', err)
    } finally {
      promptLoading.value = false
    }
  }

  async function savePrompt(personaId?: string) {
    if (!activePrompt.value) return
    promptSaving.value = true
    try {
      await api.settings.savePrompt.mutate({
        name: activePrompt.value,
        content: promptContent.value,
        personaId,
      })
    } catch (err) {
      console.error('Failed to save prompt:', err)
    } finally {
      promptSaving.value = false
    }
  }

  async function resetPrompt(personaId?: string) {
    if (!activePrompt.value) return
    promptLoading.value = true
    try {
      const content = await api.settings.resetPrompt.mutate({ name: activePrompt.value, personaId })
      promptContent.value = content as string
    } catch (err) {
      console.error('Failed to reset prompt:', err)
    } finally {
      promptLoading.value = false
    }
  }

  return {
    config,
    loading,
    saving,
    saved,
    loadConfig,
    saveConfig,

    prompts,
    activePrompt,
    promptContent,
    promptLoading,
    promptSaving,
    listPrompts,
    loadPrompt,
    savePrompt,
    resetPrompt,
  }
}
