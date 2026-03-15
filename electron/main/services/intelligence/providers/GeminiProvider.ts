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

import { GoogleGenAI, Environment } from '@google/genai'
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
  async chat(messages: LLMMessage[], config?: GenerationConfig, systemInstruction?: string, cachedContent?: string): Promise<string> {
    log.debug(`chat() with ${messages.length} message(s)${cachedContent ? ' (cached)' : ''}`)

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: this.toContents(messages),
        config: {
          ...this.toGeminiConfig(config),
          ...(cachedContent ? { cachedContent } : { systemInstruction }),
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
  async *stream(messages: LLMMessage[], config?: GenerationConfig, systemInstruction?: string, cachedContent?: string): AsyncGenerator<string> {
    log.debug(`stream() with ${messages.length} message(s)${cachedContent ? ' (cached)' : ''}`)

    const response = await this.client.models.generateContentStream({
      model: this.model,
      contents: this.toContents(messages),
      config: {
        ...this.toGeminiConfig(config),
        ...(cachedContent ? { cachedContent } : { systemInstruction }),
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
  async *streamWithThoughts(messages: LLMMessage[], config?: GenerationConfig, systemInstruction?: string, cachedContent?: string): AsyncGenerator<StreamChunk> {
    log.debug(`streamWithThoughts() with ${messages.length} message(s)${cachedContent ? ' (cached)' : ''}`)

    const geminiConfig = this.toGeminiConfig(config) ?? {}

    const response = await this.client.models.generateContentStream({
      model: this.model,
      contents: this.toContents(messages),
      config: {
        ...geminiConfig,
        thinkingConfig: { includeThoughts: true },
        ...(cachedContent ? { cachedContent } : { systemInstruction }),
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
  async chatWithVision(messages: LLMMessage[], image: Buffer, config?: GenerationConfig, systemInstruction?: string, cachedContent?: string): Promise<string> {
    log.debug(`chatWithVision() ${messages.length} message(s), image=${image.length} bytes${cachedContent ? ' (cached)' : ''}`)

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
          ...(cachedContent ? { cachedContent } : { systemInstruction }),
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
  async chatStructured(messages: LLMMessage[], jsonSchema: Record<string, unknown>, config?: GenerationConfig, systemInstruction?: string, cachedContent?: string): Promise<string> {
    log.debug(`chatStructured() with ${messages.length} message(s)${cachedContent ? ' (cached)' : ''}`)

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: this.toContents(messages),
        config: {
          ...this.toGeminiConfig(config),
          responseMimeType: 'application/json',
          responseJsonSchema: jsonSchema,
          ...(cachedContent ? { cachedContent } : { systemInstruction }),
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
  async chatWithVisionStructured(messages: LLMMessage[], image: Buffer, jsonSchema: Record<string, unknown>, config?: GenerationConfig, systemInstruction?: string, cachedContent?: string): Promise<string> {
    log.debug(`chatWithVisionStructured() ${messages.length} message(s), image=${image.length} bytes${cachedContent ? ' (cached)' : ''}`)

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
          ...(cachedContent ? { cachedContent } : { systemInstruction }),
        },
      })

      const text = response.text ?? ''
      log.debug(`chatWithVisionStructured() response length: ${text.length}`)
      return text
    } catch (err) {
      handleError('chatWithVisionStructured()', err)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Computer Use (Google Native Screen Control)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Computer Use: send conversation with screenshot, using Gemini's native
   * `computer_use` tool for screen interaction.
   *
   * Unlike other methods, this returns the full `GenerateContentResponse`
   * so the caller can inspect `functionCall` parts (click_at, type_text_at, etc.)
   * and `safety_decision` data for permission gating.
   *
   * @param contents — Gemini-native Content[] (not LLMMessage[])
   * @param systemInstruction — optional system prompt
   * @param excludedFunctions — optional list of predefined funcs to exclude
   * @returns Full API response with function_call parts
   */
  async chatWithComputerUse(
    contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>,
    systemInstruction?: string,
    excludedFunctions?: string[],
    cachedContent?: string,
  ) {
    log.debug(`chatWithComputerUse() ${contents.length} content(s)${cachedContent ? ' (cached)' : ''}`)

    // Log contents structure for debugging
    for (let i = 0; i < contents.length; i++) {
      const c = contents[i] as { role: string; parts: Array<Record<string, unknown>> }
      const partSummary = c.parts.map(p => {
        if (p.text) return `text(${(p.text as string).length}ch)`
        if (p.functionCall) return `functionCall(${(p.functionCall as Record<string,unknown>).name})`
        if (p.functionResponse) return `functionResponse(${(p.functionResponse as Record<string,unknown>).name})`
        if (p.inlineData) return 'inlineData'
        return Object.keys(p).join(',')
      }).join(', ')
      log.debug(`  content[${i}] role=${c.role} parts=[${partSummary}]`)
    }

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          ...(cachedContent ? { cachedContent } : { systemInstruction }),
          tools: [{
            computerUse: {
              environment: Environment.ENVIRONMENT_BROWSER,
              ...(excludedFunctions?.length ? { excludedPredefinedFunctions: excludedFunctions } : {}),
            },
          }],
        },
      })

      log.debug(`chatWithComputerUse() candidates: ${response.candidates?.length ?? 0}`)
      return response
    } catch (err: unknown) {
      // Log raw API error details before wrapping
      const raw = err as Record<string, unknown>
      log.error(`chatWithComputerUse() RAW error:`, JSON.stringify({
        message: raw.message,
        status: raw.status,
        statusText: raw.statusText,
        errorDetails: raw.errorDetails,
      }, null, 2))
      handleError('chatWithComputerUse()', err)
    }
  }
}
