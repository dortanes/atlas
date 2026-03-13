import { ref } from 'vue'
import type { PermissionRequest } from '@/types/agent'
import { api } from '@/api'

/**
 * usePermissions — permission request queue composable (singleton).
 *
 * Manages the queue of permission requests that require user
 * confirmation (Allow / Deny). Only the first item is shown
 * in the UI at a time.
 *
 * Subscribes to `agent.onPermission` for new requests.
 * Calls `agent.respondPermission` mutation on user response.
 */

// ── Singleton State ──

const permissions = ref<PermissionRequest[]>([])

// ── tRPC Subscription (initialized once) ──

let subscribed = false

function initSubscription() {
  if (subscribed) return
  subscribed = true

  api.agent.onPermission.subscribe(undefined, {
    onData(data: {
      permission: { id: string; message: string; riskLevel: 'medium' | 'high' | 'critical' }
    }) {
      permissions.value.push(data.permission)
    },
  })
}

initSubscription()

// ── Composable ──

export function usePermissions() {
  /**
   * Respond to a permission request via tRPC mutation.
   * Removes it from the local queue.
   */
  function respond(id: string, allowed: boolean) {
    console.info(`[usePermissions] respond: id=${id}, allowed=${allowed}`)
    permissions.value = permissions.value.filter((p) => p.id !== id)
    api.agent.respondPermission.mutate({ id, allowed })
  }

  /**
   * Push a new permission request into the queue locally.
   */
  function push(request: PermissionRequest) {
    permissions.value.push(request)
  }

  return {
    permissions,
    respond,
    push,
  }
}
