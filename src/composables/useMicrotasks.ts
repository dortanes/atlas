import { ref } from 'vue'
import type { Microtask, MicrotaskStatus } from '@/types/agent'
import { api } from '@/api'

/**
 * useMicrotasks — microtask queue composable (singleton).
 *
 * Manages the queue of planned tasks that the agent will
 * execute sequentially. Users can add tasks via InputBar
 * while the agent is busy.
 *
 * Subscribes to `agent.onMicrotasks` for full list updates.
 */

// ── Singleton State ──

const tasks = ref<Microtask[]>([])

// ── tRPC Subscription (initialized once) ──

let subscribed = false

function initSubscription() {
  if (subscribed) return
  subscribed = true

  api.agent.onMicrotasks.subscribe(undefined, {
    onData(data: {
      tasks: Array<{
        id: string
        text: string
        status: MicrotaskStatus
        createdAt: string
      }>
    }) {
      tasks.value = data.tasks.map((t) => ({
        ...t,
        createdAt: new Date(t.createdAt),
      }))
    },
  })
}

initSubscription()

// ── Composable ──

export function useMicrotasks() {
  /**
   * Add a new task to the queue via tRPC.
   * Tasks are queued commands — sent to the agent.
   */
  function addTask(text: string) {
    console.info('[useMicrotasks] addTask:', text)
    api.agent.sendCommand.mutate({ text })
  }

  /**
   * Replace the entire task list locally.
   */
  function setTasks(next: Microtask[]) {
    tasks.value = next
  }

  return {
    tasks,
    addTask,
    setTasks,
  }
}
