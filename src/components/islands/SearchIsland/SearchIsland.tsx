import { defineComponent, type PropType } from 'vue'
import GlassPanel from '@/components/core/GlassPanel'
import './SearchIsland.css'

export interface SearchResultItem {
  title: string
  url: string
  snippet: string
}

export interface FileSearchResultItem {
  name: string
  path: string
  isDirectory: boolean
  size?: number
  modified?: string
}

/**
 * SearchIsland — displays web or file search results with a searching animation.
 *
 * Three modes:
 * - `searching`: pulsing animation with query text
 * - `web results`: list of clickable web links (blue accent)
 * - `file results`: list of files/folders with open actions (amber accent)
 */
export default defineComponent({
  name: 'SearchIsland',

  props: {
    type: { type: String as PropType<'web' | 'files'>, default: 'web' },
    query: { type: String, required: true },
    results: {
      type: Array as PropType<SearchResultItem[]>,
      default: () => [],
    },
    fileResults: {
      type: Array as PropType<FileSearchResultItem[]>,
      default: () => [],
    },
    searching: { type: Boolean, default: false },
  },

  emits: ['dismiss', 'openFile', 'revealFile'],

  methods: {
    openUrl(url: string) {
      window.open(url, '_blank')
    },

    displayUrl(url: string): string {
      try {
        const u = new URL(url)
        return u.hostname + (u.pathname !== '/' ? u.pathname.slice(0, 30) : '')
      } catch {
        return url.slice(0, 40)
      }
    },

    displayPath(path: string): string {
      // Show last 2 segments of the path for readability
      const parts = path.replace(/\\/g, '/').split('/')
      if (parts.length <= 3) return path
      return '…/' + parts.slice(-3).join('/')
    },

    formatSize(bytes?: number): string {
      if (bytes == null) return ''
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    },
  },

  render() {
    const isFiles = this.type === 'files'

    const classes = [
      'island',
      'island--search',
      isFiles && 'island--search-files',
      this.searching && 'island--searching',
    ].filter(Boolean)

    const iconName = isFiles ? 'folder_open' : 'search'
    const headerText = this.searching
      ? (isFiles ? `Searching files: ${this.query}` : `Searching: ${this.query}`)
      : (isFiles ? `Files: ${this.query}` : `Search: ${this.query}`)

    return (
      <GlassPanel class={classes.join(' ')}>
        <div class="island__header">
          <span class="island__icon">{iconName}</span>
          <span class="island__title">{headerText}</span>
          {!this.searching && (
            <button
              class="search__dismiss"
              onClick={() => this.$emit('dismiss')}
              title="Dismiss"
            >
              <span class="island__icon">close</span>
            </button>
          )}
        </div>

        {this.searching ? (
          <div class="search__loading">
            <div class="search__dots">
              <span class="search__dot" />
              <span class="search__dot" />
              <span class="search__dot" />
            </div>
          </div>
        ) : isFiles ? (
          /* ── File Results ── */
          <div class="search__results">
            {this.fileResults.length === 0 ? (
              <div class="search__empty">No files found</div>
            ) : (
              this.fileResults.map((f, i) => (
                <div
                  key={i}
                  class="search__result search__result--file"
                  style={`--result-delay: ${i * 60}ms`}
                >
                  <div class="search__file-row">
                    <span class="search__file-icon island__icon">
                      {f.isDirectory ? 'folder' : 'description'}
                    </span>
                    <div class="search__file-info">
                      <div class="search__file-name">{f.name}</div>
                      <div class="search__file-path">{this.displayPath(f.path)}</div>
                    </div>
                    {f.size != null && (
                      <span class="search__file-size">{this.formatSize(f.size)}</span>
                    )}
                  </div>
                  <div class="search__file-actions">
                    <button
                      class="search__file-btn"
                      onClick={() => this.$emit('openFile', f.path)}
                      title={f.isDirectory ? 'Open folder' : 'Open file'}
                    >
                      <span class="island__icon">{f.isDirectory ? 'folder_open' : 'open_in_new'}</span>
                      <span>{f.isDirectory ? 'Open' : 'Open'}</span>
                    </button>
                    <button
                      class="search__file-btn search__file-btn--secondary"
                      onClick={() => this.$emit('revealFile', f.path)}
                      title="Show in Explorer"
                    >
                      <span class="island__icon">drive_file_move</span>
                      <span>Show in Explorer</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* ── Web Results ── */
          <div class="search__results">
            {this.results.map((r, i) => (
              <div
                key={i}
                class="search__result"
                onClick={() => this.openUrl(r.url)}
                style={`--result-delay: ${i * 60}ms`}
              >
                <div class="search__result-title">{r.title}</div>
                <div class="search__result-url">{this.displayUrl(r.url)}</div>
                {r.snippet && (
                  <div class="search__result-snippet">{r.snippet}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    )
  },
})
