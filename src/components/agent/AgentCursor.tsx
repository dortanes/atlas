import { defineComponent, ref, watch } from 'vue'
import './AgentCursor.css'
import { useAgentCursor } from '@/composables/useAgentCursor'

/**
 * AgentCursor — animated overlay cursor component.
 *
 * Renders a glowing ring/target indicator (NOT an arrow — the OS cursor
 * is always rendered above all windows at the hardware level, so we use
 * a distinctive ring that surrounds the click target instead of competing
 * with the system cursor).
 *
 * Effects:
 * - Move: smooth CSS transition to target position
 * - Click: ring contracts + ripple pulse
 * - Type: glass bubble shows text being typed
 * - Scroll: directional arrow pulse
 * - Hide: ring fades out + shrinks
 *
 * Completely click-through (pointer-events: none).
 */
export default defineComponent({
  name: 'AgentCursor',

  setup() {
    const {
      visible,
      animationType,
      typingText,
      scrollDirection,
      clicking,
      doubleClicking,
      cursorStyle,
    } = useAgentCursor()

    // Track enter/leave for CSS animation classes
    const showing = ref(false)
    const hiding = ref(false)

    watch(visible, (isVisible) => {
      if (isVisible) {
        hiding.value = false
        showing.value = true
        setTimeout(() => { showing.value = false }, 350)
      } else {
        hiding.value = true
        setTimeout(() => { hiding.value = false }, 400)
      }
    })

    const shouldRender = ref(false)
    watch([visible, hiding], ([vis, hid]) => {
      shouldRender.value = vis || hid
    })

    return {
      visible,
      shouldRender,
      showing,
      hiding,
      animationType,
      typingText,
      scrollDirection,
      clicking,
      doubleClicking,
      cursorStyle,
    }
  },

  render() {
    if (!this.shouldRender) return null

    const pointerClasses = [
      'agent-cursor__pointer',
      this.showing && 'agent-cursor__pointer--entering',
      this.hiding && 'agent-cursor__pointer--leaving',
    ].filter(Boolean)

    return (
      <div class="agent-cursor">
        <div
          class={pointerClasses}
          style={this.cursorStyle}
        >
          {/* Outer glow ring */}
          <div class="agent-cursor__ring-outer" />

          {/* Main ring */}
          <div class={[
            'agent-cursor__ring',
            this.clicking && 'agent-cursor__ring--clicking',
          ]} />

          {/* Center dot */}
          <div class="agent-cursor__dot" />

          {/* Click ripple */}
          {this.clicking && (
            <div class="agent-cursor__ripple" />
          )}

          {/* Double-click second ripple */}
          {this.doubleClicking && (
            <div class="agent-cursor__ripple" />
          )}

          {/* Typing bubble */}
          {this.animationType === 'type' && this.typingText && (
            <div class="agent-cursor__type-bubble">
              <span class="agent-cursor__type-icon">⌨</span>
              {this.typingText}
            </div>
          )}

          {/* Scroll indicator */}
          {this.animationType === 'scroll' && (
            <div class={[
              'agent-cursor__scroll-indicator',
              this.scrollDirection === 'up' && 'agent-cursor__scroll-indicator--up',
            ]}>
              {this.scrollDirection === 'down' ? '▼' : '▲'}
            </div>
          )}
        </div>
      </div>
    )
  },
})
