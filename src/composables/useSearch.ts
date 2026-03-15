import { ref } from 'vue'
import { api } from '@/api'

/**
 * useSearch — composable for search results display (singleton).
 *
 * Subscribes to search result events from the agent's search action.
 * Handles searching state (loading animation) and result display.
 * Supports both web search and local file search results.
 */

export interface FileSearchResultItem {
  name: string
  path: string
  isDirectory: boolean
  size?: number
  modified?: string
}

export interface SearchData {
  type: 'web' | 'files'
  query: string
  results: Array<{ title: string; url: string; snippet: string }>
  fileResults: FileSearchResultItem[]
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
        searchData.value = {
          type: data.type ?? 'web',
          query: data.query,
          results: [],
          fileResults: [],
          searching: true,
        }
        dismissing.value = false
      } else if (data.type === 'files' && data.fileResults.length > 0) {
        // Show file results
        searchData.value = {
          type: 'files',
          query: data.query,
          results: [],
          fileResults: data.fileResults,
          searching: false,
        }
        dismissing.value = false
      } else if (data.type === 'web' && data.results.length > 0) {
        // Show web results
        searchData.value = {
          type: 'web',
          query: data.query,
          results: data.results,
          fileResults: [],
          searching: false,
        }
        dismissing.value = false
      } else {
        // No results — hide
        searchData.value = null
      }
    },
  })

  // Clear search results when a new command starts processing
  api.agent.onStateChange.subscribe(undefined, {
    onData(data: { state: string }) {
      if (data.state === 'processing') {
        searchData.value = null
        dismissing.value = false
      }
    },
  })
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

  function openFile(path: string) {
    api.agent.openFileResult.mutate({ path }).catch(() => {})
  }

  function revealFile(path: string) {
    api.agent.openFileResult.mutate({ path, reveal: true }).catch(() => {})
  }

  return { searchData, dismissing, dismiss, clear, openFile, revealFile }
}
