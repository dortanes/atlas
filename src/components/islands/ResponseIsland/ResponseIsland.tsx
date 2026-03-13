import { defineComponent, ref, watch, type PropType, nextTick } from 'vue'
import GlassPanel from '@/components/core/GlassPanel'
import type { AgentResponse } from '@/types/agent'
import './ResponseIsland.css'

/**
 * ResponseIsland — displays agent response or thoughts.
 *
 * Two visual modes:
 * - `response`: permanent answer (accent-colored header, solid feel)
 * - `thoughts`: temporary AI thinking (dimmed, italic, with pulse when streaming)
 *
 * Uses chunk-based text animation: each time text is appended,
 * the new portion is captured as a "chunk" and animated with
 * a Gemini-style word-by-word blur → sharp reveal.
 */
export default defineComponent({
  name: 'ResponseIsland',

  props: {
    response: {
      type: Object as PropType<AgentResponse>,
      required: true,
    },
  },

  emits: ['dismiss'],

  setup(props) {
    /**
     * Track text deltas as "chunks" — each chunk is a portion of text
     * added by one appendText() call. The latest chunk gets the reveal
     * animation; older chunks are static.
     */
    const chunks = ref<string[]>([])
    const scrollRef = ref<HTMLElement | null>(null)

    let prevText = ''
    let prevId = ''

    watch(
      () => [props.response.id, props.response.text] as const,
      ([id, text]) => {
        if (id !== prevId) {
          // New response — reset everything
          chunks.value = text ? [text] : []
          prevText = text
          prevId = id
        } else if (text !== prevText) {
          // Same response, text grew — capture the delta
          if (text.startsWith(prevText)) {
            const delta = text.slice(prevText.length)
            if (delta) chunks.value.push(delta)
          } else {
            // Full replacement
            chunks.value = [text]
          }
          prevText = text
        }

        // Auto-scroll to bottom on new text
        nextTick(() => {
          if (scrollRef.value) {
            scrollRef.value.scrollTop = scrollRef.value.scrollHeight
          }
        })
      },
      { immediate: true },
    )

    return { chunks, scrollRef }
  },

  computed: {
    isThoughts(): boolean {
      return this.response.kind === 'thoughts'
    },

    headerIcon(): string {
      return this.isThoughts ? 'psychology' : 'chat_bubble'
    },

    headerTitle(): string {
      return this.isThoughts ? 'Thinking...' : 'Response'
    },

    showDismiss(): boolean {
      // Both thoughts and response can be dismissed
      // (but not while streaming)
      return !this.response.streaming
    },
  },

  render() {
    const classes = [
      'island',
      'island--response',
      this.isThoughts && 'island--thoughts',
      this.response.streaming && 'island--streaming',
    ].filter(Boolean)

    return (
      <GlassPanel class={classes.join(' ')}>
        <div class={['island__header', this.isThoughts && 'island__header--thoughts'].filter(Boolean).join(' ')}>
          <span class="island__icon">{this.headerIcon}</span>
          <span class="island__title">{this.headerTitle}</span>

          {this.showDismiss && (
            <button
              class="response__dismiss"
              onClick={() => this.$emit('dismiss')}
              title="Dismiss"
            >
              <span class="island__icon">close</span>
            </button>
          )}
        </div>

        <div
          class="response__scroll"
          ref="scrollRef"
        >
          <div class={['island__label', 'response__text', this.isThoughts && 'response__text--thoughts'].filter(Boolean).join(' ')}>
            {this.chunks.map((chunk, chunkIdx) => {
              const isLatest = chunkIdx === this.chunks.length - 1

              if (!isLatest) {
                // Old chunk — render static
                return <span key={`c-${chunkIdx}`} class="response__chunk">{chunk}</span>
              }

              // Latest chunk — split into words, animate each
              const words = chunk.split(/(\s+)/)
              return (
                <span key={`c-${chunkIdx}`} class="response__chunk">
                  {words.map((word, wordIdx) => (
                    <span
                      key={`${chunkIdx}-${wordIdx}`}
                      class="response__word response__word--reveal"
                      style={`--word-delay: ${Math.min(wordIdx * 35, 250)}ms`}
                    >
                      {word}
                    </span>
                  ))}
                </span>
              )
            })}
          </div>
        </div>
      </GlassPanel>
    )
  },
})
