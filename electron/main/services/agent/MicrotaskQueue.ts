import { randomUUID } from 'node:crypto'
import { mainEventBus } from '@electron/utils/eventBus'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('MicrotaskQueue')

/** A queued task waiting for agent execution. */
export interface Microtask {
  /** Unique task identifier */
  id: string
  /** User's command text */
  text: string
  /** Current lifecycle state */
  status: 'queued' | 'active' | 'done' | 'failed'
  /** ISO 8601 timestamp of when the task was enqueued */
  createdAt: string
}

/**
 * MicrotaskQueue — sequential task queue for the agent.
 *
 * While the agent is busy, users can queue additional tasks.
 * The agent picks them up one-by-one after completing the current task.
 *
 * Emits `agent:microtasks` on every change so the UI stays in sync.
 */
export class MicrotaskQueue {
  private tasks: Microtask[] = []

  /** Get all tasks */
  getAll(): Microtask[] {
    return [...this.tasks]
  }

  /** Enqueue a new task */
  enqueue(text: string): Microtask {
    const task: Microtask = {
      id: randomUUID(),
      text,
      status: 'queued',
      createdAt: new Date().toISOString(),
    }

    this.tasks.push(task)
    log.info(`Enqueued: "${text}" (${task.id})`)
    this.emit()
    return task
  }

  /** Get the next queued task, or null if none */
  peekNext(): Microtask | null {
    return this.tasks.find((t) => t.status === 'queued') ?? null
  }

  /** Mark the next queued task as active and return it */
  activateNext(): Microtask | null {
    const next = this.peekNext()
    if (!next) return null

    next.status = 'active'
    log.info(`Activated: "${next.text}" (${next.id})`)
    this.emit()
    return next
  }

  /** Mark a task as done */
  complete(id: string): void {
    const task = this.tasks.find((t) => t.id === id)
    if (task) {
      task.status = 'done'
      log.info(`Completed: "${task.text}" (${id})`)
      this.emit()
    }
  }

  /** Mark a task as failed */
  fail(id: string): void {
    const task = this.tasks.find((t) => t.id === id)
    if (task) {
      task.status = 'failed'
      log.warn(`Failed: "${task.text}" (${id})`)
      this.emit()
    }
  }

  /** Clear completed/failed tasks */
  prune(): void {
    this.tasks = this.tasks.filter((t) => t.status === 'queued' || t.status === 'active')
    this.emit()
  }

  /** Clear all tasks */
  clear(): void {
    this.tasks = []
    this.emit()
  }

  /** Emit current task list to eventBus */
  private emit(): void {
    mainEventBus.emit('agent:microtasks', [...this.tasks])
  }
}
