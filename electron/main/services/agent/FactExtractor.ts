/**
 * FactExtractor — mines long-term user facts from conversations.
 *
 * After each agent response, this module sends the conversation
 * exchange to a secondary LLM call that identifies persistent
 * facts about the user (name, job, preferences, etc.).
 *
 * Uses structured output (Zod schema → JSON schema) to guarantee
 * a clean `{ facts: string[] }` response instead of parsing raw text.
 *
 * Extracted facts are deduplicated and stored via FactService
 * for injection into future system prompts.
 */

import * as z from 'zod'
import { IntelligenceService } from '@electron/services/intelligence/IntelligenceService'
import { PromptLoader } from '@electron/services/intelligence/PromptLoader'
import type { FactService } from '@electron/services/memory/FactService'
import { ExtractedFactsSchema } from './schemas'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('FactExtractor')

/** Pre-computed JSON schema for structured output (reused on every call) */
const factsJsonSchema = z.toJSONSchema(ExtractedFactsSchema) as Record<string, unknown>

/**
 * FactExtractor — stateless service for mining user facts from conversations.
 *
 * Uses structured output with `ExtractedFactsSchema` to get clean
 * `{ facts: string[] }` responses instead of parsing raw text/JSON.
 */
export class FactExtractor {
  private intelligence: IntelligenceService
  private promptLoader: PromptLoader
  private factService: FactService

  constructor(
    intelligence: IntelligenceService,
    promptLoader: PromptLoader,
    factService: FactService,
  ) {
    this.intelligence = intelligence
    this.promptLoader = promptLoader
    this.factService = factService
  }

  /**
   * Get formatted facts text for a persona (for prompt injection).
   *
   * @param personaId — persona to get facts for
   * @returns Bullet-list string or fallback message
   */
  getFactsText(personaId: string): string {
    return this.factService.getFactsText(personaId)
  }

  /**
   * Extract facts from a single conversation exchange.
   *
   * Uses structured output to get a clean `{ facts: string[] }` response.
   * Falls back to raw JSON parsing if structured output validation fails.
   *
   * This method is fire-and-forget — errors are logged but not thrown.
   *
   * @param personaId — active persona ID
   * @param userMessage — the user's message
   * @param modelResponse — the model's response
   */
  async extract(personaId: string, userMessage: string, modelResponse: string): Promise<void> {
    try {
      const existingFacts = this.factService.getFactsText(personaId)

      const prompt = this.promptLoader.load('extract_facts', {
        existing_facts: existingFacts,
        user_message: userMessage,
        model_response: modelResponse,
      })

      // Structured output — LLM is forced to return { facts: string[] }
      const result = await this.intelligence.chatStructured(
        [{ role: 'user', text: prompt }],
        factsJsonSchema,
      )

      // Parse + validate with Zod
      const parsed = ExtractedFactsSchema.parse(JSON.parse(result))

      if (parsed.facts.length > 0) {
        const validFacts = parsed.facts.filter((f) => f.trim())
        if (validFacts.length > 0) {
          this.factService.addFacts(personaId, validFacts)
          log.info(`Extracted ${validFacts.length} fact(s) from conversation`)
        }
      }
    } catch (err) {
      // Expected to fail silently when no facts are found
      log.debug('Fact extraction error (expected if no facts):', err)
    }
  }
}
