/**
 * GeminiProvider — Gemini API integration via @google/genai SDK.
 *
 * Supports:
 * - Single-shot `chat()` and streaming `stream()`
 * - `streamWithThoughts()` for models with thinking support (gemini-2.5-flash)
 * - `vision()` and `chatWithVision()` for multimodal (screenshot) analysis
 * - Native `systemInstruction` parameter (avoids wasting tokens on fake user/model pairs)
 *
 * Error handling is centralized via {@link handleError} — all API calls
 * are wrapped uniformly to avoid code duplication.
 */

import { GoogleGenAI } from '@google/genai'
import { BaseLLMProvider, type LLMMessage, type GenerationConfig } from './BaseLLMProvider'
import { formatLLMError } from '@electron/utils/llmErrors'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('GeminiProvider')

/** A typed chunk from the LLM stream — either a thought or text */
export interface StreamChunk {
  type: 'thought' | 'text'
  content: string
}

/**
 * Centralized error handler for all Gemini API calls.
 *
 * Converts raw SDK errors into clean, user-facing messages
 * via {@link formatLLMError} and logs them with context.
 *
 * @param method — name of the calling method (for log context)
 * @param err — raw error from the SDK
 * @throws Always — re-throws with a clean message
 */
function handleError(method: string, err: unknown): never {
  const msg = formatLLMError(err)
  log.error(`${method} error: ${msg}`)
  throw new Error(msg)
}

export class GeminiProvider extends BaseLLMProvider {
  readonly name = 'gemini'

  private client: GoogleGenAI
  private model: string

  constructor(apiKey: string, model: string = '') {
    super()
    this.client = new GoogleGenAI({ apiKey })
    this.model = model
    log.info(`Initialized with model: ${model}`)
  }

  // ═══════════════════════════════════════════════════════════════
  //  Internal helpers
  // ═══════════════════════════════════════════════════════════════

  /** Convert LLMMessage[] → Gemini Content format */
  private toContents(messages: LLMMessage[]) {
    return messages.map((m) => ({
      role: m.role === 'model' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.text }],
    }))
  }

  /** Map provider-agnostic GenerationConfig → Gemini config shape */
  private toGeminiConfig(config?: GenerationConfig) {
    if (!config) return undefined
    return {
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
      maxOutputTokens: config.maxOutputTokens,
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Public API
  // ═══════════════════════════════════════════════════════════════

  /**
   * One-shot completion: send messages, get full reply string.
   *
   * @param messages — conversation history
   * @param config — optional generation parameters
   * @param systemInstruction — optional system prompt (native API, saves tokens)
   */
  async chat(messages: LLMMessage[], config?: GenerationConfig, systemInstruction?: string): Promise<string> {
    log.debug(`chat() with ${messages.length} message(s)`)

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: this.toContents(messages),
        config: {
          ...this.toGeminiConfig(config),
          systemInstruction,
        },
      })

      const text = response.text ?? ''
      log.debug(`chat() response length: ${text.length}`)
      return text
    } catch (err) {
      handleError('chat()', err)
    }
  }

  /**
   * Streaming completion: yields text chunks as they arrive.
   *
   * @param messages — conversation history
   * @param config — optional generation parameters
   * @param systemInstruction — optional system prompt (native API, saves tokens)
   */
  async *stream(messages: LLMMessage[], config?: GenerationConfig, systemInstruction?: string): AsyncGenerator<string> {
    log.debug(`stream() with ${messages.length} message(s)`)

    const response = await this.client.models.generateContentStream({
      model: this.model,
      contents: this.toContents(messages),
      config: {
        ...this.toGeminiConfig(config),
        systemInstruction,
      },
    }).catch((err) => handleError('stream()', err))

    try {
      for await (const chunk of response) {
        const text = chunk.text
        if (text) yield text
      }
    } catch (err) {
      handleError('stream() chunk', err)
    }
  }

  /**
   * Streaming with real thinking support.
   *
   * Yields typed chunks: `thought` for the model's reasoning,
   * `text` for the final response. Enables the UI to show
   * real-time AI thoughts before the answer appears.
   *
   * Requires a thinking-capable model (e.g. gemini-2.5-flash).
   *
   * @param messages — conversation history
   * @param config — optional generation parameters
   * @param systemInstruction — optional system prompt (native API, saves tokens)
   */
  async *streamWithThoughts(messages: LLMMessage[], config?: GenerationConfig, systemInstruction?: string): AsyncGenerator<StreamChunk> {
    log.debug(`streamWithThoughts() with ${messages.length} message(s)`)

    const geminiConfig = this.toGeminiConfig(config) ?? {}

    const response = await this.client.models.generateContentStream({
      model: this.model,
      contents: this.toContents(messages),
      config: {
        ...geminiConfig,
        thinkingConfig: { includeThoughts: true },
        systemInstruction,
      },
    }).catch((err) => handleError('streamWithThoughts()', err))

    try {
      for await (const chunk of response) {
        const candidates = chunk.candidates
        if (!candidates || candidates.length === 0) continue

        const parts = candidates[0].content?.parts
        if (!parts) continue

        for (const part of parts) {
          if (!part.text) continue
          yield part.thought
            ? { type: 'thought', content: part.text }
            : { type: 'text', content: part.text }
        }
      }
    } catch (err) {
      handleError('streamWithThoughts() chunk', err)
    }
  }

  /**
   * Vision: send a single image + text prompt, get a text response.
   *
   * Uses Gemini's multimodal capabilities to analyze screenshots.
   *
   * @param image — screenshot as JPEG buffer
   * @param prompt — text prompt to accompany the image
   * @param config — optional generation parameters
   */
  async vision(image: Buffer, prompt: string, config?: GenerationConfig): Promise<string> {
    log.debug(`vision() image=${image.length} bytes, prompt="${prompt.slice(0, 60)}..."`)

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: image.toString('base64') } },
            { text: prompt },
          ],
        }],
        config: this.toGeminiConfig(config),
      })

      const text = response.text ?? ''
      log.debug(`vision() response length: ${text.length}`)
      return text
    } catch (err) {
      handleError('vision()', err)
    }
  }

  /**
   * Chat with vision: full conversation + screenshot on the last user message.
   *
   * Attaches the screenshot as `inlineData` (proper multimodal API) to the
   * last user message. This avoids embedding base64 in text which would
   * explode token count.
   *
   * @param messages — conversation history (text only)
   * @param image — screenshot JPEG buffer to attach to the LAST user message
   * @param config — optional generation parameters
   * @param systemInstruction — optional system prompt (native API, saves tokens)
   */
  async chatWithVision(messages: LLMMessage[], image: Buffer, config?: GenerationConfig, systemInstruction?: string): Promise<string> {
    log.debug(`chatWithVision() ${messages.length} message(s), image=${image.length} bytes`)

    // Convert messages to Gemini Content, adding image to the last user message
    const contents = messages.map((m, index) => {
      const isLastUser = m.role === 'user' && index === messages.length - 1
      const role = m.role === 'model' ? ('model' as const) : ('user' as const)

      if (isLastUser) {
        return {
          role,
          parts: [
            { inlineData: { mimeType: 'image/jpeg' as const, data: image.toString('base64') } },
            { text: m.text },
          ],
        }
      }

      return { role, parts: [{ text: m.text }] }
    })

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          ...this.toGeminiConfig(config),
          systemInstruction,
        },
      })

      const text = response.text ?? ''
      log.debug(`chatWithVision() response length: ${text.length}`)
      return text
    } catch (err) {
      handleError('chatWithVision()', err)
    }
  }

  /**
   * Structured output: get LLM response constrained to a JSON schema.
   *
   * Uses Gemini's native `responseMimeType: 'application/json'` +
   * `responseJsonSchema` to force valid JSON output.
   *
   * @param messages — conversation history
   * @param jsonSchema — JSON Schema object (from `z.toJSONSchema()`)
   * @param config — optional generation parameters
   * @param systemInstruction — optional system prompt
   * @returns Raw JSON string — caller should parse with Zod `.parse()`
   */
  async chatStructured(messages: LLMMessage[], jsonSchema: Record<string, unknown>, config?: GenerationConfig, systemInstruction?: string): Promise<string> {
    log.debug(`chatStructured() with ${messages.length} message(s)`)

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: this.toContents(messages),
        config: {
          ...this.toGeminiConfig(config),
          responseMimeType: 'application/json',
          responseJsonSchema: jsonSchema,
          systemInstruction,
        },
      })

      const text = response.text ?? ''
      log.debug(`chatStructured() response length: ${text.length}`)
      return text
    } catch (err) {
      handleError('chatStructured()', err)
    }
  }

  /**
   * Chat with vision + structured output.
   *
   * Combines multimodal (screenshot) input with JSON schema constraint.
   * Used by ActionLoop to get typed action JSON from screen analysis.
   *
   * @param messages — conversation history
   * @param image — screenshot JPEG buffer
   * @param jsonSchema — JSON Schema object (from `z.toJSONSchema()`)
   * @param config — optional generation parameters
   * @param systemInstruction — optional system prompt
   * @returns Raw JSON string — caller should parse with Zod `.parse()`
   */
  async chatWithVisionStructured(messages: LLMMessage[], image: Buffer, jsonSchema: Record<string, unknown>, config?: GenerationConfig, systemInstruction?: string): Promise<string> {
    log.debug(`chatWithVisionStructured() ${messages.length} message(s), image=${image.length} bytes`)

    // Build contents with image on last user message
    const contents = messages.map((m, index) => {
      const isLastUser = m.role === 'user' && index === messages.length - 1
      const role = m.role === 'model' ? ('model' as const) : ('user' as const)

      if (isLastUser) {
        return {
          role,
          parts: [
            { inlineData: { mimeType: 'image/jpeg' as const, data: image.toString('base64') } },
            { text: m.text },
          ],
        }
      }

      return { role, parts: [{ text: m.text }] }
    })

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          ...this.toGeminiConfig(config),
          responseMimeType: 'application/json',
          responseJsonSchema: jsonSchema,
          systemInstruction,
        },
      })

      const text = response.text ?? ''
      log.debug(`chatWithVisionStructured() response length: ${text.length}`)
      return text
    } catch (err) {
      handleError('chatWithVisionStructured()', err)
    }
  }
}
