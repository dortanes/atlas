/**
 * parseAction — extracts an AgentAction from raw LLM text.
 *
 * This is a **legacy fallback** parser used when the LLM provider
 * does not support structured outputs. It attempts to find a JSON
 * object in free-form text (including markdown code fences).
 *
 * With structured outputs enabled, the LLM returns guaranteed-valid
 * JSON and this parser is not needed.
 */

import type { AgentAction } from './types'

/**
 * Try to parse an LLM response string as a JSON AgentAction.
 *
 * Handles common LLM quirks:
 * - Response wrapped in markdown code fences (```json ... ```)
 * - JSON embedded in surrounding text
 * - Missing `reason` field (falls back to action name)
 *
 * @param response — raw LLM response text
 * @returns Parsed AgentAction or `null` if the response is not valid action JSON
 */
export function parseAction(response: string): AgentAction | null {
  try {
    let jsonStr = response.trim()

    // Strip markdown code fences if present
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim()
    }

    // Find the JSON object boundaries
    const braceStart = jsonStr.indexOf('{')
    const braceEnd = jsonStr.lastIndexOf('}')
    if (braceStart === -1 || braceEnd === -1) return null

    jsonStr = jsonStr.slice(braceStart, braceEnd + 1)
    const parsed = JSON.parse(jsonStr)

    // Must have an 'action' field to be valid
    if (typeof parsed.action !== 'string') return null

    return {
      action: parsed.action,
      coords: parsed.coords,
      text: parsed.text,
      keys: parsed.keys,
      key: parsed.key,
      command: parsed.command,
      direction: parsed.direction,
      amount: parsed.amount,
      display: parsed.display,
      reason: parsed.reason ?? parsed.action,
    }
  } catch {
    return null
  }
}
