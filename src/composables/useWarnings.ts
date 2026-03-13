import { ref } from 'vue'
import type { Warning } from '@/types/agent'
import { api } from '@/api'

/**
 * useWarnings — warning queue composable (singleton).
 *
 * Manages a list of active warnings shown via WarningIsland.
 * Warnings can be dismissed by the user or auto-dismissed
 * by the backend.
 *
 * Subscribes to `agent.onWarning` for new warnings.
 * Calls `agent.dismissWarning` mutation on user dismiss.
 */

// ── Singleton State ──

const warnings = ref<Warning[]>([])

// ── tRPC Subscription (initialized once) ──

let subscribed = false

function initSubscription() {
  if (subscribed) return
  subscribed = true

  api.agent.onWarning.subscribe(undefined, {
    onData(data: { warning: { id: string; message: string; dismissable: boolean } }) {
      // Deduplicate: if a warning with same ID exists, update it
      const existing = warnings.value.findIndex((w) => w.id === data.warning.id)
      if (existing >= 0) {
        warnings.value[existing] = data.warning
      } else {
        warnings.value.push(data.warning)
      }
    },
  })

  // Auto-dismiss from backend (e.g. config fixed → dismiss missing-api-key warning)
  api.agent.onWarningDismiss.subscribe(undefined, {
    onData(data: { id: string }) {
      warnings.value = warnings.value.filter((w) => w.id !== data.id)
    },
  })
}

initSubscription()

// ── Composable ──

export function useWarnings() {
  /**
   * Dismiss a warning by id via tRPC mutation.
   * Removes it from the local list.
   */
  function dismiss(id: string) {
    console.info(`[useWarnings] dismiss: id=${id}`)
    warnings.value = warnings.value.filter((w) => w.id !== id)
    api.agent.dismissWarning.mutate({ id })
  }

  /**
   * Push a new warning locally.
   */
  function push(warning: Warning) {
    warnings.value.push(warning)
  }

  return {
    warnings,
    dismiss,
    push,
  }
}
