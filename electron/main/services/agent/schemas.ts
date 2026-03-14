/**
 * Zod schemas — source-of-truth for structured LLM outputs.
 *
 * These schemas serve three purposes:
 * 1. Define the shape of JSON the LLM must output (via `z.toJSONSchema()`)
 * 2. Validate + parse LLM responses at runtime (via `.parse()`)
 * 3. Generate TypeScript types for the rest of the codebase
 *
 * When adding a new structured output, define the Zod schema here
 * and export both the schema and the inferred type.
 */

import * as z from 'zod'

// ═══════════════════════════════════════════════════════════════
//  Agent Actions — the core schema for the action loop
// ═══════════════════════════════════════════════════════════════

/**
 * Schema for a single agent action.
 *
 * The LLM returns this JSON to tell the agent what to do next.
 * Each action type uses different optional fields:
 *
 * - `click/doubleClick/rightClick` → coords required
 * - `type` → text required
 * - `hotkey` → keys required
 * - `keyPress` → key required
 * - `scroll` → direction, amount
 * - `runCommand` → command required
 * - `screenshot` → display optional
 * - `wait` → amount optional (ms)
 * - `done` → text = final response to user
 */
export const AgentActionSchema = z.object({
  /** The type of action to perform */
  action: z.enum([
    'click',
    'doubleClick',
    'rightClick',
    'type',
    'hotkey',
    'keyPress',
    'scroll',
    'runCommand',
    'screenshot',
    'search',
    'searchFiles',
    'wait',
    'done',
  ]).describe('The type of action to perform on the screen'),

  /** Screen coordinates [x, y] for click actions */
  coords: z.array(z.number()).length(2).optional()
    .describe('Screen coordinates [x, y] for click/doubleClick/rightClick'),

  /** Text content for type action or final response for done */
  text: z.string().optional()
    .describe('Text to type (for "type") or final response (for "done")'),

  /** Key names for hotkey combo, e.g. ["ctrl", "c"] */
  keys: z.array(z.string()).optional()
    .describe('Array of key names for hotkey combos, e.g. ["ctrl", "c"]'),

  /** Single key name for keyPress, e.g. "enter" */
  key: z.string().optional()
    .describe('Single key to press, e.g. "enter", "escape", "f5"'),

  /** Shell command to run */
  command: z.string().optional()
    .describe('PowerShell command to execute (for "runCommand")'),

  /** Scroll direction */
  direction: z.enum(['up', 'down']).optional()
    .describe('Scroll direction'),

  /** Amount: scroll lines or wait duration in ms */
  amount: z.number().optional()
    .describe('Number of lines to scroll or milliseconds to wait'),

  /** Monitor number (1-indexed) for screenshot */
  display: z.number().optional()
    .describe('Monitor number to capture (1-indexed, for "screenshot")'),

  /** Search query (web search or file search) */
  query: z.string().optional()
    .describe('Search query text (for "search" web lookup or "searchFiles" local file search)'),

  /** Human-readable explanation of why this action is needed */
  reason: z.string()
    .describe('Short explanation of why this action is being performed'),

  /** Self-assessed risk level of this action */
  risk: z.enum(['low', 'medium', 'high', 'critical']).optional()
    .describe('Risk: low (read-only/safe), medium (normal interaction), high (potentially destructive: delete, kill process), critical (irreversible: format disk, rm -rf)'),
})

/** Inferred TypeScript type from the Zod schema */
export type AgentActionParsed = z.infer<typeof AgentActionSchema>

// ═══════════════════════════════════════════════════════════════
//  Fact Extraction — structured output for mining user facts
// ═══════════════════════════════════════════════════════════════

/**
 * Schema for fact extraction response.
 *
 * The LLM extracts persistent facts about the user from conversation
 * and returns them as a structured array.
 */
export const ExtractedFactsSchema = z.object({
  /** Array of new facts discovered (empty if none found) */
  facts: z.array(z.string())
    .describe('List of new factual statements about the user discovered in this conversation exchange. Empty array if no new facts.'),
})

/** Inferred TypeScript type */
export type ExtractedFacts = z.infer<typeof ExtractedFactsSchema>

// ═══════════════════════════════════════════════════════════════
//  Intent Classification — 3-way routing
// ═══════════════════════════════════════════════════════════════

/**
 * Schema for intent classification.
 *
 * Three categories:
 * - `chat`   — conversational, no OS interaction needed
 * - `direct` — simple OS action executable via shell command or hotkey
 *              (open/close/minimize/maximize apps, volume, system info, etc.)
 * - `action` — needs screen interaction (click buttons, read screen, fill forms)
 */
export const IntentClassificationSchema = z.object({
  /** The classified intent category */
  intent: z.enum(['chat', 'direct', 'action'])
    .describe('chat = conversation only, direct = simple OS action via shell/hotkey (no screen needed), action = needs screen interaction (clicking, reading, GUI)'),
})

/** Inferred TypeScript type */
export type IntentClassification = z.infer<typeof IntentClassificationSchema>

