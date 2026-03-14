import * as z from 'zod'
import { BaseClassifier } from './BaseClassifier'
import { IntelligenceService } from '@electron/services/intelligence/IntelligenceService'
import { PromptLoader } from '@electron/services/intelligence/PromptLoader'
import { IntentClassificationSchema } from '@electron/services/agent/schemas'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('IntentClassifier')

/** Pre-computed JSON schema for structured output */
const intentJsonSchema = z.toJSONSchema(IntentClassificationSchema) as Record<string, unknown>

export interface IntentInput {
  command: string
  /** Recent conversation history for context-aware classification */
  recentHistory?: Array<{ role: string; text: string }>
}

/** Intent classification result */
export type IntentResult = 'chat' | 'direct' | 'action'

/**
 * IntentClassifier — determines how to handle a user command.
 *
 * Three categories:
 * - `chat`   — conversational, no OS interaction needed
 * - `direct` — simple OS action via shell command or hotkey (no screenshot needed)
 * - `action` — needs screen interaction (clicking, reading, navigating GUI)
 *
 * Uses structured output with `IntentClassificationSchema` for reliable 3-way
 * classification in a single LLM call.
 */
export class IntentClassifier extends BaseClassifier<IntentInput, IntentResult> {
  readonly name = 'intent'

  private intelligence: IntelligenceService
  private promptLoader: PromptLoader

  constructor(intelligence: IntelligenceService, promptLoader: PromptLoader) {
    super()
    this.intelligence = intelligence
    this.promptLoader = promptLoader
  }

  /**
   * Classify the user command into one of three categories.
   *
   * Falls back to `'chat'` on any error.
   */
  async classify(input: IntentInput): Promise<IntentResult> {
    try {
      // Build context from recent history (last 4 messages)
      let contextBlock = ''
      if (input.recentHistory && input.recentHistory.length > 0) {
        const recent = input.recentHistory.slice(-4)
        const lines = recent.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text.slice(0, 200)}`)
        contextBlock = `\n\nRecent conversation:\n${lines.join('\n')}\n`
      }

      const prompt = this.promptLoader.load('intent_classifier', {
        context: contextBlock,
        command: input.command,
      })

      const response = await this.intelligence.classifyStructured(
        prompt,
        intentJsonSchema,
      )

      const parsed = IntentClassificationSchema.parse(JSON.parse(response))
      const result = parsed.intent
      log.info(`"${input.command}" → ${result.toUpperCase()}`)
      return result
    } catch (err) {
      log.warn('Classification failed, falling back to chat mode:', err)
      return 'chat'
    }
  }
}
