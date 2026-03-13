import { ref } from 'vue'
import { api } from '@/api'

/**
 * useSearch — composable for search results display (singleton).
 *
 * Subscribes to search result events from the agent's search action.
 * Handles searching state (loading animation) and result display.
 */

export interface SearchData {
  query: string
  results: Array<{ title: string; url: string; snippet: string }>
  searching: boolean
}

// ── Singleton State ──

const searchData = ref<SearchData | null>(null)
const dismissing = ref(false)

// ── tRPC Subscription (initialized once) ──

let subscribed = false

function initSubscription() {
  if (subscribed) return
  subscribed = true

  api.agent.onSearchResults.subscribe(undefined, {
    onData(data: SearchData) {
      if (data.searching) {
        // Show searching animation
        searchData.value = { query: data.query, results: [], searching: true }
        dismissing.value = false
      } else if (data.results.length > 0) {
        // Show results
        searchData.value = { query: data.query, results: data.results, searching: false }
        dismissing.value = false
      } else {
        // No results — hide
        searchData.value = null
      }
    },
  })
  // Note: we do NOT clear on `processing` state change.
  // New search results naturally replace old ones, so the user
  // can still read previous results while a queued task starts.
}

export function useSearch() {
  initSubscription()

  function dismiss() {
    if (!searchData.value || dismissing.value) return
    dismissing.value = true
    setTimeout(() => {
      searchData.value = null
      dismissing.value = false
    }, 400)
  }

  function clear() {
    searchData.value = null
    dismissing.value = false
  }

  return { searchData, dismissing, dismiss, clear }
}
