import OpenAI from 'openai'
import { BaseLLMProvider, type LLMMessage, type GenerationConfig } from './BaseLLMProvider'
import type { StreamChunk } from './GeminiProvider'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('OpenAIProvider')

/**
 * OpenAIProvider — OpenAI-compatible API integration.
 *
 * Works with any server exposing the OpenAI chat completions API:
 * LMStudio, Ollama, vLLM, text-generation-webui, or OpenAI itself.
 *
 * Uses the official `openai` npm package. The `baseURL` can be
 * customized to point to any compatible endpoint.
 */
export class OpenAIProvider extends BaseLLMProvider {
  readonly name = 'openai'

  private client: OpenAI
  private model: string

  constructor(apiKey: string, model: string, baseURL?: string) {
    super()
    this.client = new OpenAI({
      apiKey: apiKey || 'lm-studio',
      baseURL: baseURL || 'http://localhost:1234/v1',
      // Local models don't use a real API key — skip the check
      dangerouslyAllowBrowser: false,
    })
    this.model = model
    log.info(`Initialized with model: ${model}, baseURL: ${baseURL || 'http://localhost:1234/v1'}`)
  }

  /** Convert our LLMMessage[] to OpenAI ChatCompletionMessageParam[], optionally prepending a system message */
  private toMessages(messages: LLMMessage[], systemInstruction?: string): OpenAI.Chat.ChatCompletionMessageParam[] {
    const result: OpenAI.Chat.ChatCompletionMessageParam[] = []

    // Use native system role for system prompt (proper OpenAI approach)
    if (systemInstruction) {
      result.push({ role: 'system', content: systemInstruction })
    }

    for (const m of messages) {
      result.push({
        role: m.role === 'model' ? ('assistant' as const) : ('user' as const),
        content: m.text,
      })
    }

    return result
  }

  /** Map GenerationConfig to OpenAI params (topK not supported) */
  private toOpenAIParams(config?: GenerationConfig) {
    if (!config) return {}
    return {
      temperature: config.temperature,
      top_p: config.topP,
      max_tokens: config.maxOutputTokens,
    }
  }

  async chat(messages: LLMMessage[], config?: GenerationConfig, systemInstruction?: string, _cachedContent?: string): Promise<string> {
    log.debug(`chat() with ${messages.length} message(s)`)

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: this.toMessages(messages, systemInstruction),
      ...this.toOpenAIParams(config),
    })

    const text = response.choices[0]?.message?.content ?? ''
    log.debug(`chat() response length: ${text.length}`)
    return text
  }

  async *stream(messages: LLMMessage[], config?: GenerationConfig, systemInstruction?: string, _cachedContent?: string): AsyncGenerator<string> {
    log.debug(`stream() with ${messages.length} message(s)`)

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: this.toMessages(messages, systemInstruction),
      stream: true,
      ...this.toOpenAIParams(config),
    })

    for await (const chunk of response) {
      const text = chunk.choices[0]?.delta?.content
      if (text) yield text
    }
  }

  /**
   * Streaming with typed chunks.
   *
   * OpenAI-compatible APIs don't have a separate "thinking" mode,
   * so all chunks are emitted as `{ type: 'text' }`.
   */
  async *streamWithThoughts(messages: LLMMessage[], config?: GenerationConfig, systemInstruction?: string): AsyncGenerator<StreamChunk> {
    for await (const text of this.stream(messages, config, systemInstruction)) {
      yield { type: 'text', content: text }
    }
  }

  /**
   * Vision: image (PNG buffer) + text prompt.
   *
   * Uses the standard OpenAI vision API format with base64 image_url.
   * Works with models that support vision (e.g. llava, bakllava on LMStudio).
   */
  async vision(image: Buffer, prompt: string, config?: GenerationConfig): Promise<string> {
    log.debug(`vision() image=${image.length} bytes, prompt="${prompt.slice(0, 60)}..."`)

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${image.toString('base64')}`,
            },
          },
          { type: 'text', text: prompt },
        ],
      }],
      ...this.toOpenAIParams(config),
    })

    const text = response.choices[0]?.message?.content ?? ''
    log.debug(`vision() response length: ${text.length}`)
    return text
  }

  /**
   * Chat with vision: full conversation + screenshot on the last user message.
   *
   * Attaches the image as a base64 image_url content part to the last user message.
   */
  async chatWithVision(messages: LLMMessage[], image: Buffer, config?: GenerationConfig, systemInstruction?: string, _cachedContent?: string): Promise<string> {
    log.debug(`chatWithVision() ${messages.length} message(s), image=${image.length} bytes`)

    const sysMessages: OpenAI.Chat.ChatCompletionMessageParam[] = systemInstruction
      ? [{ role: 'system', content: systemInstruction }]
      : []

    const converted: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map((m, index) => {
      const isLastUser = m.role === 'user' && index === messages.length - 1

      if (isLastUser) {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'image_url' as const,
              image_url: {
                url: `data:image/jpeg;base64,${image.toString('base64')}`,
              },
            },
            { type: 'text' as const, text: m.text },
          ],
        }
      }

      return {
        role: m.role === 'model' ? ('assistant' as const) : ('user' as const),
        content: m.text,
      }
    })

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [...sysMessages, ...converted],
      ...this.toOpenAIParams(config),
    })

    const text = response.choices[0]?.message?.content ?? ''
    log.debug(`chatWithVision() response length: ${text.length}`)
    return text
  }

  /**
   * Structured output via OpenAI-compatible `response_format`.
   *
   * Uses `response_format: { type: 'json_schema' }` to constrain
   * the LLM output to a specific JSON schema.
   *
   * @param messages — conversation history
   * @param jsonSchema — JSON Schema object (from `z.toJSONSchema()`)
   * @param config — optional generation parameters
   * @param systemInstruction — optional system prompt
   * @returns Raw JSON string
   */
  async chatStructured(messages: LLMMessage[], jsonSchema: Record<string, unknown>, config?: GenerationConfig, systemInstruction?: string, _cachedContent?: string): Promise<string> {
    log.debug(`chatStructured() with ${messages.length} message(s)`)

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: this.toMessages(messages, systemInstruction),
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'structured_output',
          strict: true,
          schema: jsonSchema,
        },
      } as OpenAI.Chat.ChatCompletionCreateParams['response_format'],
      ...this.toOpenAIParams(config),
    })

    const text = response.choices[0]?.message?.content ?? ''
    log.debug(`chatStructured() response length: ${text.length}`)
    return text
  }

  /**
   * Chat with vision + structured output.
   *
   * Attaches the image to the last user message and constrains
   * the response to the provided JSON schema.
   */
  async chatWithVisionStructured(messages: LLMMessage[], image: Buffer, jsonSchema: Record<string, unknown>, config?: GenerationConfig, systemInstruction?: string, _cachedContent?: string): Promise<string> {
    log.debug(`chatWithVisionStructured() ${messages.length} message(s), image=${image.length} bytes`)

    const sysMessages: OpenAI.Chat.ChatCompletionMessageParam[] = systemInstruction
      ? [{ role: 'system', content: systemInstruction }]
      : []

    const converted: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map((m, index) => {
      const isLastUser = m.role === 'user' && index === messages.length - 1

      if (isLastUser) {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'image_url' as const,
              image_url: {
                url: `data:image/jpeg;base64,${image.toString('base64')}`,
              },
            },
            { type: 'text' as const, text: m.text },
          ],
        }
      }

      return {
        role: m.role === 'model' ? ('assistant' as const) : ('user' as const),
        content: m.text,
      }
    })

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [...sysMessages, ...converted],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'structured_output',
          strict: true,
          schema: jsonSchema,
        },
      } as OpenAI.Chat.ChatCompletionCreateParams['response_format'],
      ...this.toOpenAIParams(config),
    })

    const text = response.choices[0]?.message?.content ?? ''
    log.debug(`chatWithVisionStructured() response length: ${text.length}`)
    return text
  }
}
