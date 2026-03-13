import { ref } from 'vue'
import { api } from '@/api'

/**
 * AgentProfile — corresponds to the backend AgentProfile type.
 */
export interface AgentProfile {
  id: string
  name: string
  avatar: string
  personality: string
  ttsVoiceId?: string
  createdAt: string
  isDefault: boolean
}

/**
 * usePersonas — composable for managing agent personas.
 *
 * Provides CRUD operations, switching, and real-time sync
 * via tRPC subscription.
 */

// ── Singleton State ──

const personas = ref<AgentProfile[]>([])
const activePersona = ref<AgentProfile | null>(null)
const loading = ref(false)

// ── tRPC Subscription ──

let subscribed = false

function initSubscription() {
  if (subscribed) return
  subscribed = true

  api.personas.onSwitch.subscribe(undefined, {
    onData(data: { id: string; persona: AgentProfile }) {
      activePersona.value = data.persona
    },
  })
}

initSubscription()

// ── Composable ──

export function usePersonas() {
  /** Load all personas from the backend */
  async function loadPersonas() {
    loading.value = true
    try {
      personas.value = await api.personas.list.query()
      const active = await api.personas.getActive.query()
      activePersona.value = active
    } catch (err) {
      console.error('[usePersonas] Failed to load:', err)
    } finally {
      loading.value = false
    }
  }

  /** Create a new persona */
  async function createPersona(data: { name: string; avatar: string; personality: string; ttsVoiceId?: string }) {
    try {
      const created = await api.personas.create.mutate(data)
      personas.value.push(created)
      return created
    } catch (err) {
      console.error('[usePersonas] Failed to create:', err)
      return null
    }
  }

  /** Update an existing persona */
  async function updatePersona(id: string, partial: { name?: string; avatar?: string; personality?: string; ttsVoiceId?: string }) {
    try {
      const updated = await api.personas.update.mutate({ id, ...partial })
      if (updated) {
        const idx = personas.value.findIndex((p) => p.id === id)
        if (idx >= 0) personas.value[idx] = updated
        if (activePersona.value?.id === id) activePersona.value = updated
      }
      return updated
    } catch (err) {
      console.error('[usePersonas] Failed to update:', err)
      return null
    }
  }

  /** Delete a persona */
  async function deletePersona(id: string) {
    try {
      const ok = await api.personas.delete.mutate({ id })
      if (ok) {
        personas.value = personas.value.filter((p) => p.id !== id)
      }
      return ok
    } catch (err) {
      console.error('[usePersonas] Failed to delete:', err)
      return false
    }
  }

  /** Switch active persona */
  async function switchPersona(id: string) {
    try {
      const ok = await api.personas.switch.mutate({ id })
      if (ok) {
        // Active persona will be updated via subscription
        const p = personas.value.find((p) => p.id === id)
        if (p) activePersona.value = p
      }
      return ok
    } catch (err) {
      console.error('[usePersonas] Failed to switch:', err)
      return false
    }
  }

  return {
    personas,
    activePersona,
    loading,
    loadPersonas,
    createPersona,
    updatePersona,
    deletePersona,
    switchPersona,
  }
}
