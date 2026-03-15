/**
 * BaseLLMProvider — abstract base for all LLM integrations.
 *
 * Every provider (Gemini, OpenAI, Anthropic, …) must implement
 * this contract so IntelligenceService can swap them transparently.
 */

/** A single message in a conversation history. */
export interface LLMMessage {
  /** Sender role: 'user' for human input, 'model' for AI responses */
  role: 'user' | 'model'
  /** Message text content */
  text: string
}

/** Provider-agnostic generation parameters for LLM calls. */
export interface GenerationConfig {
  /** Randomness (0 = deterministic, 2 = very creative) */
  temperature: number
  /** Nucleus sampling threshold (0–1) */
  topP: number
  /** Top-K sampling (Gemini only — OpenAI ignores this field) */
  topK?: number
  /** Maximum tokens in the generated response */
  maxOutputTokens: number
}

export abstract class BaseLLMProvider {
  abstract readonly name: string

  /**
   * One-shot completion: send messages, get full reply string.
   *
   * @param systemInstruction — native system prompt (saves tokens vs fake user/model pairs)
   */
  abstract chat(messages: LLMMessage[], config?: GenerationConfig, systemInstruction?: string, cachedContent?: string): Promise<string>

  /**
   * Streaming completion: yields text chunks as they arrive.
   * Consumers iterate with `for await (const chunk of stream(...))`
   *
   * @param systemInstruction — native system prompt
   */
  abstract stream(messages: LLMMessage[], config?: GenerationConfig, systemInstruction?: string, cachedContent?: string): AsyncGenerator<string>

  /**
   * Vision: send an image + text prompt, get a text response.
   * Used by VisionService to analyze screenshots.
   */
  abstract vision(image: Buffer, prompt: string, config?: GenerationConfig): Promise<string>

  /**
   * Chat with vision: send a conversation + screenshot image.
   * Used by ActionLoop to analyze screen state in context.
   *
   * @param messages — conversation history (text only)
   * @param image — screenshot PNG buffer to attach to the LAST user message
   * @param systemInstruction — native system prompt
   */
  abstract chatWithVision(messages: LLMMessage[], image: Buffer, config?: GenerationConfig, systemInstruction?: string, cachedContent?: string): Promise<string>

  /**
   * Structured output: send messages, get response constrained to a JSON schema.
   *
   * The LLM is forced to output valid JSON matching the provided schema.
   * Returns the raw JSON string — caller is responsible for Zod `.parse()`.
   *
   * @param messages — conversation history
   * @param jsonSchema — JSON Schema object (from `z.toJSONSchema(zodSchema)`)
   * @param config — optional generation parameters
   * @param systemInstruction — optional system prompt
   */
  abstract chatStructured(messages: LLMMessage[], jsonSchema: Record<string, unknown>, config?: GenerationConfig, systemInstruction?: string, cachedContent?: string): Promise<string>

  /**
   * Chat with vision + structured output: conversation + screenshot + JSON schema constraint.
   *
   * Used by ActionLoop to get typed action responses from the LLM
   * when analyzing screenshots.
   *
   * @param messages — conversation history (text only)
   * @param image — screenshot JPEG buffer
   * @param jsonSchema — JSON Schema object
   * @param config — optional generation parameters
   * @param systemInstruction — optional system prompt
   */
  abstract chatWithVisionStructured(messages: LLMMessage[], image: Buffer, jsonSchema: Record<string, unknown>, config?: GenerationConfig, systemInstruction?: string, cachedContent?: string): Promise<string>
}
