import { defineComponent, type PropType } from 'vue'
import GlassPanel from '@/components/core/GlassPanel'
import './SearchIsland.css'

export interface SearchResultItem {
  title: string
  url: string
  snippet: string
}

/**
 * SearchIsland — displays web search results or a searching animation.
 *
 * Two states:
 * - `searching`: pulsing animation with query text
 * - `results`: list of clickable search results
 */
export default defineComponent({
  name: 'SearchIsland',

  props: {
    query: { type: String, required: true },
    results: {
      type: Array as PropType<SearchResultItem[]>,
      required: true,
    },
    searching: { type: Boolean, default: false },
  },

  emits: ['dismiss'],

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
  },

  render() {
    const classes = [
      'island',
      'island--search',
      this.searching && 'island--searching',
    ].filter(Boolean)

    return (
      <GlassPanel class={classes.join(' ')}>
        <div class="island__header">
          <span class="island__icon">search</span>
          <span class="island__title">
            {this.searching ? `Searching: ${this.query}` : `Search: ${this.query}`}
          </span>
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
        ) : (
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
