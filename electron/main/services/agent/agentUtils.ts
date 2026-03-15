/**
 * Agent utility helpers — shared functions for agent loops.
 */

/**
 * Build a dynamic context prefix for conversation messages.
 *
 * Contains data that changes every call (time, user facts) and MUST NOT
 * be included in cached content. Prepended to the first user message.
 */
export function buildDynamicContext(userFacts: string): string {
  return `[Context: Time: ${new Date().toLocaleString()} | Known facts: ${userFacts}]`
}
