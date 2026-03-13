import * as z from 'zod'
import { BaseClassifier } from './BaseClassifier'
import { IntelligenceService } from '@electron/services/intelligence/IntelligenceService'
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

/**
 * IntentClassifier — determines whether a user command requires
 * screen interaction (action loop) or is a simple chat message.
 *
 * Uses structured output with `IntentClassificationSchema` to get
 * a clean `{ needs_action: boolean }` instead of parsing YES/NO text.
 *
 * Accepts recent conversation history to avoid misclassifying
 * follow-up questions about screen content as simple chat.
 */
export class IntentClassifier extends BaseClassifier<IntentInput, boolean> {
  readonly name = 'intent'

  private intelligence: IntelligenceService

  constructor(intelligence: IntelligenceService) {
    super()
    this.intelligence = intelligence
  }

  /**
   * Returns `true` if the command needs the action loop (vision + motor),
   * `false` for chat-only mode.
   *
   * Uses structured output for reliable boolean classification.
   * Falls back to `false` (chat mode) on any error.
   */
  async classify(input: IntentInput): Promise<boolean> {
    try {
      // Build context from recent history (last 4 messages)
      let contextBlock = ''
      if (input.recentHistory && input.recentHistory.length > 0) {
        const recent = input.recentHistory.slice(-4)
        const lines = recent.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text.slice(0, 200)}`)
        contextBlock = `\n\nRecent conversation:\n${lines.join('\n')}\n`
      }

      const response = await this.intelligence.classifyStructured(
        `Does this user message require either:
1. Interacting with the computer screen (clicking, typing, opening apps, scrolling, looking at screen content, taking a screenshot)
2. Searching the web for information (finding specific people, current events, recommendations, prices, reviews, accounts, links, or any factual question that benefits from up-to-date web data)

Answer YES (needs_action=true) if EITHER condition applies.
Answer NO (needs_action=false) only for casual conversation, greetings, opinions, or questions the AI can answer from general knowledge without needing current/specific data.

Consider the conversation context — if previous messages involved screen actions or web searches, follow-up questions likely need action too.${contextBlock}
Current message: "${input.command}"`,
        intentJsonSchema,
      )

      const parsed = IntentClassificationSchema.parse(JSON.parse(response))
      const result = parsed.needs_action
      log.info(`"${input.command}" → ${result ? 'ACTION' : 'CHAT'}`)
      return result
    } catch (err) {
      log.warn('Classification failed, falling back to chat mode:', err)
      return false
    }
  }
}
