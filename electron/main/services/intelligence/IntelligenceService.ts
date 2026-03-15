import { BaseService } from '@electron/services/base/BaseService'
import { BaseLLMProvider, type LLMMessage, type GenerationConfig } from './providers/BaseLLMProvider'
import { GeminiProvider, type StreamChunk } from './providers/GeminiProvider'
import { OpenAIProvider } from './providers/OpenAIProvider'
import { ContextCacheService } from './ContextCacheService'
import { getConfig, type AppConfig } from '@electron/utils/config'
import { mainEventBus } from '@electron/utils/eventBus'

/**
 * IntelligenceService — manages LLM providers for 3 roles.
 *
 * - **text**:       main chat, streaming, thoughts (textModel)
 * - **vision**:     screenshot analysis (visionModel, falls back to textModel)
 * - **classifier**: cheap intent detection (classifierModel, falls back to textModel)
 */
export class IntelligenceService extends BaseService {
  private textProvider: BaseLLMProvider | null = null
  private visionProvider: BaseLLMProvider | null = null
  private classifierProvider: BaseLLMProvider | null = null
  private cuProvider: GeminiProvider | null = null
  private configHandler: ((cfg: AppConfig) => void) | null = null
  private promptHandler: ((payload: { name: string; personaId?: string }) => void) | null = null
  private personaHandler: ((payload: { id: string }) => void) | null = null
  private cacheService = new ContextCacheService()

  async init(): Promise<void> {
    // Always register config change listener — even before providers are created.
    // This ensures settings saved in the UI trigger reinit even on first-time setup.
    this.configHandler = () => {
      this.log.info('LLM config changed — reinitializing providers...')
      this.reinit()
    }
    mainEventBus.on('config:changed', this.configHandler)

    const config = getConfig()

    if (!config.llm.apiKey && config.llm.provider === 'gemini') {
      this.log.warn('No API key configured — LLM calls will fail')
      mainEventBus.emit('agent:warning', {
        id: 'missing-api-key',
        message: 'API key not configured. Set your Gemini API key in settings to enable the AI.',
        dismissable: true,
      })
      return
    }

    if (!config.llm.textModel) {
      this.log.warn('No text model configured — set it in settings')
      mainEventBus.emit('agent:warning', {
        id: 'missing-text-model',
        message: 'No text model configured. Set your model in LLM settings.',
        dismissable: true,
      })
      return
    }

    // Create providers (vision & classifier fall back to textModel if not set)
    this.textProvider = this.createProvider(config.llm.provider, config.llm.apiKey, config.llm.textModel, config.llm.baseURL)
    this.visionProvider = this.createProvider(
      config.llm.provider, config.llm.apiKey,
      config.llm.visionModel || config.llm.textModel,
      config.llm.baseURL,
    )
    this.classifierProvider = this.createProvider(
      config.llm.provider, config.llm.apiKey,
      config.llm.classifierModel || config.llm.textModel,
      config.llm.baseURL,
    )

    this.log.info(
      `IntelligenceService initialized — text: ${config.llm.textModel}, ` +
      `vision: ${config.llm.visionModel || config.llm.textModel}, ` +
      `classifier: ${config.llm.classifierModel || config.llm.textModel}`,
    )

    // Auto-detect Computer Use support from the vision model
    this.detectComputerUse(config)

    // Initialize context caching (Gemini only)
    if (config.llm.provider === 'gemini') {
      this.cacheService.configure(config.llm.apiKey)
    }

    // Cache invalidation: on prompt save/reset
    this.promptHandler = (payload) => {
      this.log.info(`Prompt changed (${payload.name}) — invalidating cache`)
      this.cacheService.invalidate(payload.personaId)
    }
    mainEventBus.on('prompt:saved', this.promptHandler)

    // Cache invalidation: on persona switch
    this.personaHandler = (payload) => {
      this.log.debug(`Persona switched to ${payload.id} — cache will be refreshed on next call`)
    }
    mainEventBus.on('persona:switched', this.personaHandler)
  }



  async dispose(): Promise<void> {
    if (this.configHandler) {
      mainEventBus.removeListener('config:changed', this.configHandler)
      this.configHandler = null
    }
    if (this.promptHandler) {
      mainEventBus.removeListener('prompt:saved', this.promptHandler)
      this.promptHandler = null
    }
    if (this.personaHandler) {
      mainEventBus.removeListener('persona:switched', this.personaHandler)
      this.personaHandler = null
    }
    await this.cacheService.dispose()
    this.textProvider = null
    this.visionProvider = null
    this.classifierProvider = null
    this.cuProvider = null
    this.log.info('IntelligenceService disposed')
  }

  /** Reinitialize providers from current config (hot-reload). */
  private reinit(): void {
    const config = getConfig()

    if (!config.llm.apiKey && config.llm.provider === 'gemini') {
      this.log.warn('No API key configured — providers cleared')
      this.textProvider = null
      this.visionProvider = null
      this.classifierProvider = null
      mainEventBus.emit('agent:warning', {
        id: 'missing-api-key',
        message: 'API key not configured. Set your Gemini API key in settings to enable the AI.',
        dismissable: true,
      })
      return
    }

    if (!config.llm.textModel) {
      this.log.warn('No text model configured — providers cleared')
      this.textProvider = null
      this.visionProvider = null
      this.classifierProvider = null
      mainEventBus.emit('agent:warning', {
        id: 'missing-text-model',
        message: 'No text model configured. Set your model in LLM settings.',
        dismissable: true,
      })
      return
    }

    // Config is valid — dismiss any lingering system warnings
    mainEventBus.emit('agent:dismiss-warning', { id: 'missing-api-key' })
    mainEventBus.emit('agent:dismiss-warning', { id: 'missing-text-model' })

    this.textProvider = this.createProvider(config.llm.provider, config.llm.apiKey, config.llm.textModel, config.llm.baseURL)
    this.visionProvider = this.createProvider(
      config.llm.provider, config.llm.apiKey,
      config.llm.visionModel || config.llm.textModel,
      config.llm.baseURL,
    )
    this.classifierProvider = this.createProvider(
      config.llm.provider, config.llm.apiKey,
      config.llm.classifierModel || config.llm.textModel,
      config.llm.baseURL,
    )

    this.log.info(
      `Providers reloaded — text: ${config.llm.textModel}, ` +
      `vision: ${config.llm.visionModel || config.llm.textModel}, ` +
      `classifier: ${config.llm.classifierModel || config.llm.textModel}`,
    )

    // Re-detect Computer Use support
    this.cuProvider = null
    this.detectComputerUse(config)

    // Reinitialize context caching (model/key may have changed → invalidate all)
    this.cacheService.configure(config.llm.provider === 'gemini' ? config.llm.apiKey : '')
  }

  /** Create a provider instance by name */
  private createProvider(name: string, apiKey: string, model: string, baseURL?: string): BaseLLMProvider {
    switch (name) {
      case 'gemini':
        return new GeminiProvider(apiKey, model)
      case 'openai':
        return new OpenAIProvider(apiKey, model, baseURL)
      default:
        this.log.error(`Unknown provider: ${name}, falling back to gemini`)
        return new GeminiProvider(apiKey, model)
    }
  }

  /** Known models that support the computer_use tool */
  private static readonly CU_MODELS = [
    'computer-use',
    'gemini-3-flash',
    'gemini-3-pro',
    'gemini-3.1-flash',
    'gemini-3.1-pro',
  ]

  /** Check if the vision model supports computer_use based on known model names */
  private detectComputerUse(config: AppConfig): void {
    const visionModel = config.llm.visionModel || config.llm.textModel
    if (!visionModel || config.llm.provider !== 'gemini') return

    const name = visionModel.toLowerCase()
    // Lite models don't support computer_use even though their names contain supported model names
    if (name.includes('lite')) return

    if (IntelligenceService.CU_MODELS.some(m => name.includes(m))) {
      this.cuProvider = new GeminiProvider(config.llm.apiKey, visionModel)
      this.log.info(`Computer Use enabled for model: ${visionModel}`)
    }
  }

  /** Whether the service has a usable text provider */
  get isReady(): boolean {
    return this.textProvider !== null
  }

  /** Whether the computer_use model is available */
  get supportsComputerUse(): boolean {
    return this.cuProvider !== null
  }

  /** Get the GeminiProvider configured for computer_use (or null) */
  get computerUseGemini(): GeminiProvider | null {
    return this.cuProvider
  }

  /**
   * Get or create a cached context for the given system prompt.
   * Returns a cache name string to pass as `cachedContent`, or null if unavailable.
   *
   * @param systemInstruction — stable system prompt (no time/facts)
   * @param personaId — active persona ID
   * @param stableContent — stable action prompt to include in cache
   * @param promptType — cache partition key ('chat', 'direct', 'action', 'cu')
   */
  async getCache(systemInstruction: string, personaId: string, stableContent?: string, promptType?: string): Promise<string | null> {
    const config = getConfig()
    if (config.llm.provider !== 'gemini') return null
    return this.cacheService.getOrCreate(config.llm.textModel, systemInstruction, personaId, stableContent, promptType)
  }

  /** Invalidate cached context for a persona (or all) */
  async invalidateCache(personaId?: string): Promise<void> {
    return this.cacheService.invalidate(personaId)
  }

  // ── Generation configs (built from AppConfig, no duplication) ──

  private get chatConfig(): GenerationConfig {
    const g = getConfig().generation
    return { temperature: g.chatTemperature, topP: g.chatTopP, topK: g.chatTopK, maxOutputTokens: g.chatMaxTokens }
  }

  private get visionConfig(): GenerationConfig {
    const g = getConfig().generation
    return { temperature: g.visionTemperature, topP: g.chatTopP, maxOutputTokens: g.visionMaxTokens }
  }

  // ── Text role ──

  /** One-shot completion (text model) */
  async chat(messages: LLMMessage[], config?: import('./providers/BaseLLMProvider').GenerationConfig, systemInstruction?: string, cachedContent?: string): Promise<string> {
    if (!this.textProvider) throw new Error('No text model configured')
    return this.textProvider.chat(messages, config ?? this.chatConfig, systemInstruction, cachedContent)
  }

  /** Streaming completion (text model) */
  stream(messages: LLMMessage[], systemInstruction?: string, cachedContent?: string): AsyncGenerator<string> {
    if (!this.textProvider) throw new Error('No text model configured')
    return this.textProvider.stream(messages, this.chatConfig, systemInstruction, cachedContent)
  }

  /** Streaming with thinking (text model) */
  streamWithThoughts(messages: LLMMessage[], systemInstruction?: string, cachedContent?: string): AsyncGenerator<StreamChunk> {
    if (!this.textProvider) throw new Error('No text model configured')
    const config = this.chatConfig
    if (this.textProvider instanceof GeminiProvider) {
      return this.textProvider.streamWithThoughts(messages, config, systemInstruction, cachedContent)
    }
    if (this.textProvider instanceof OpenAIProvider) {
      return this.textProvider.streamWithThoughts(messages, config, systemInstruction)
    }
    return this.wrapAsTextChunks(messages, config, systemInstruction)
  }

  private async *wrapAsTextChunks(messages: LLMMessage[], config: GenerationConfig, systemInstruction?: string): AsyncGenerator<StreamChunk> {
    for await (const text of this.textProvider!.stream(messages, config, systemInstruction)) {
      yield { type: 'text', content: text }
    }
  }

  // ── Vision role ──

  /** Vision: image + text prompt (vision model) */
  async vision(image: Buffer, prompt: string): Promise<string> {
    if (!this.visionProvider) throw new Error('No vision model configured')
    return this.visionProvider.vision(image, prompt, this.visionConfig)
  }

  /** Chat with vision: conversation + screenshot (vision model) */
  async chatWithVision(messages: LLMMessage[], image: Buffer, config?: import('./providers/BaseLLMProvider').GenerationConfig, systemInstruction?: string, cachedContent?: string): Promise<string> {
    if (!this.visionProvider) throw new Error('No vision model configured')
    return this.visionProvider.chatWithVision(messages, image, config ?? this.visionConfig, systemInstruction, cachedContent)
  }

  // ── Structured output role ──

  /** Structured chat: text model + JSON schema constraint */
  async chatStructured(messages: LLMMessage[], jsonSchema: Record<string, unknown>, config?: import('./providers/BaseLLMProvider').GenerationConfig, systemInstruction?: string, cachedContent?: string): Promise<string> {
    if (!this.textProvider) throw new Error('No text model configured')
    return this.textProvider.chatStructured(messages, jsonSchema, config ?? this.chatConfig, systemInstruction, cachedContent)
  }

  /** Structured chat + vision: vision model + screenshot + JSON schema constraint */
  async chatWithVisionStructured(messages: LLMMessage[], image: Buffer, jsonSchema: Record<string, unknown>, config?: import('./providers/BaseLLMProvider').GenerationConfig, systemInstruction?: string, cachedContent?: string): Promise<string> {
    if (!this.visionProvider) throw new Error('No vision model configured')
    return this.visionProvider.chatWithVisionStructured(messages, image, jsonSchema, config ?? this.visionConfig, systemInstruction, cachedContent)
  }

  // ── Classifier role ──

  /** Quick classification call (classifier model, cheapest) */
  async classify(prompt: string): Promise<string> {
    if (!this.classifierProvider) throw new Error('No classifier model configured')
    return this.classifierProvider.chat([{ role: 'user', text: prompt }])
  }

  /** Structured classification: classifier model + JSON schema */
  async classifyStructured(prompt: string, jsonSchema: Record<string, unknown>): Promise<string> {
    if (!this.classifierProvider) throw new Error('No classifier model configured')
    return this.classifierProvider.chatStructured([{ role: 'user', text: prompt }], jsonSchema)
  }
}
