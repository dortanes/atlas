/**
 * TaskPlanner — shared step planning for agent loops.
 *
 * Breaks a user command into high-level steps using a structured LLM call.
 * Used by both ActionLoop and ComputerUseLoop to pre-populate the Task Queue
 * so users see the planned steps before execution begins.
 */

import { randomUUID } from 'node:crypto'
import * as z from 'zod'
import { IntelligenceService } from '@electron/services/intelligence/IntelligenceService'
import type { LLMMessage } from '@electron/services/intelligence/providers/BaseLLMProvider'
import { mainEventBus } from '@electron/utils/eventBus'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('TaskPlanner')

/** A single step in the task queue */
export interface StepTask {
  id: string
  text: string
  status: 'queued' | 'active' | 'done' | 'failed'
  createdAt: string
}

/** Zod schema for the plan response */
const PlanSchema = z.object({
  steps: z.array(z.string().describe('Short description of one step')),
})

const planJsonSchema = z.toJSONSchema(PlanSchema) as Record<string, unknown>

/**
 * Emit step tasks to the UI via event bus.
 */
export function emitSteps(stepTasks: StepTask[]): void {
  mainEventBus.emit('agent:action-steps', [...stepTasks])
}

/**
 * Activate the next queued step or create an ad-hoc one.
 */
export function activateStep(stepTasks: StepTask[], reason: string): string {
  const nextQueued = stepTasks.find(s => s.status === 'queued')
  if (nextQueued) {
    nextQueued.status = 'active'
    nextQueued.text = reason || nextQueued.text
    emitSteps(stepTasks)
    return nextQueued.id
  }
  // Ad-hoc step (not in plan)
  const id = randomUUID()
  stepTasks.push({ id, text: reason, status: 'active', createdAt: new Date().toISOString() })
  emitSteps(stepTasks)
  return id
}

/**
 * Mark a step as done or failed.
 */
export function markStep(stepTasks: StepTask[], id: string, status: 'done' | 'failed'): void {
  const step = stepTasks.find(s => s.id === id)
  if (step) {
    step.status = status
    emitSteps(stepTasks)
  }
}

/**
 * Pre-plan: break a user command into high-level steps for the Task Queue.
 *
 * Calls the LLM with a structured schema to decompose the command.
 * Returns the planned steps as step descriptions, or empty array on failure.
 *
 * @param command — the user's text command
 * @param history — recent conversation messages (for context resolution)
 * @param intelligence — LLM service for structured chat
 */
export async function planSteps(
  command: string,
  history: LLMMessage[],
  intelligence: IntelligenceService,
): Promise<string[]> {
  // Build recent context summary for the planner
  const recentHistory = history.slice(-4)
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text.substring(0, 120)}`)
    .join('\n')
  const contextBlock = recentHistory ? `\n\nRecent conversation context:\n${recentHistory}` : ''

  try {
    const planRaw = await intelligence.chatStructured(
      [{
        role: 'user',
        text: `Break this user command into high-level steps (2-5 steps). Each step should be a short action description in the SAME LANGUAGE as the user's command.${contextBlock}\n\nRules:\n- Step descriptions MUST be in the same language as the user's command\n- Search/lookup = single "Search for <query>" step\n- Opening a URL in a browser = ONE step\n- Use conversation context to resolve references like "this", "that", "it"\n\nCommand: "${command}"`,
      }],
      planJsonSchema,
      undefined,
      'You decompose user commands into high-level action steps. Return a JSON object with a "steps" array of short step descriptions. Keep descriptions concise (3-8 words). Do not split simple actions into sub-steps. IMPORTANT: step descriptions must be in the same language as the user command.',
    )
    const plan = PlanSchema.parse(JSON.parse(planRaw))
    log.info(`Plan: ${plan.steps.length} steps — ${plan.steps.join(', ')}`)
    return plan.steps
  } catch (err) {
    log.warn('Planning step failed, continuing without plan:', err)
    return []
  }
}

/**
 * Create and populate step tasks from planned step descriptions.
 * Only creates queued steps when there are multiple (single-step tasks don't need a queue).
 *
 * @returns The populated stepTasks array
 */
export function createStepTasks(steps: string[]): StepTask[] {
  const stepTasks: StepTask[] = []

  if (steps.length > 1) {
    const now = new Date().toISOString()
    for (const stepText of steps) {
      stepTasks.push({
        id: randomUUID(),
        text: stepText,
        status: 'queued',
        createdAt: now,
      })
    }
    emitSteps(stepTasks)
  }

  return stepTasks
}
