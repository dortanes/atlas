import { ref } from 'vue'
import { api } from '@/api'

export interface Fact {
  id: string
  text: string
  createdAt: string
  source: 'extracted' | 'manual'
}

// ── Singleton State ──

const facts = ref<Fact[]>([])
const loading = ref(false)

// ── Composable ──

export function useFacts() {
  async function loadFacts(personaId?: string) {
    loading.value = true
    try {
      facts.value = await api.facts.list.query(personaId ? { personaId } : undefined)
    } catch (err) {
      console.error('[useFacts] Failed to load:', err)
    } finally {
      loading.value = false
    }
  }

  async function addFact(text: string, personaId?: string) {
    try {
      const fact = await api.facts.add.mutate({ text, personaId })
      facts.value.push(fact)
      return fact
    } catch (err) {
      console.error('[useFacts] Failed to add:', err)
      return null
    }
  }

  async function updateFact(id: string, text: string, personaId?: string) {
    try {
      const updated = await api.facts.update.mutate({ id, text, personaId })
      if (updated) {
        const idx = facts.value.findIndex((f) => f.id === id)
        if (idx >= 0) facts.value[idx] = updated
      }
      return updated
    } catch (err) {
      console.error('[useFacts] Failed to update:', err)
      return null
    }
  }

  async function deleteFact(id: string, personaId?: string) {
    try {
      const ok = await api.facts.delete.mutate({ id, personaId })
      if (ok) {
        facts.value = facts.value.filter((f) => f.id !== id)
      }
      return ok
    } catch (err) {
      console.error('[useFacts] Failed to delete:', err)
      return false
    }
  }

  async function clearFacts(personaId?: string) {
    try {
      await api.facts.clear.mutate(personaId ? { personaId } : undefined)
      facts.value = []
      return true
    } catch (err) {
      console.error('[useFacts] Failed to clear:', err)
      return false
    }
  }

  return {
    facts,
    loading,
    loadFacts,
    addFact,
    updateFact,
    deleteFact,
    clearFacts,
  }
}
