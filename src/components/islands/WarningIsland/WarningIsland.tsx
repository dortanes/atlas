import { defineComponent } from 'vue'
import GlassPanel from '@/components/core/GlassPanel'
import './WarningIsland.css'

/**
 * WarningIsland — displays critical warnings and alerts.
 *
 * Appears separately from other islands with an amber/red glow.
 * System errors (dismissable=true) show a ✕ close button.
 * Agent warnings (dismissable=false) have no close button.
 */
export default defineComponent({
  name: 'WarningIsland',

  props: {
    message: {
      type: String,
      required: true,
    },
    dismissable: {
      type: Boolean,
      default: false,
    },
  },

  emits: ['dismiss'],

  render() {
    return (
      <GlassPanel class="island island--warning animate-float-in">
        <div class="island__header island__header--warning">
          <span class="island__icon">warning</span>
          <span class="island__title">Warning</span>
          {this.dismissable && (
            <button
              class="island__dismiss"
              onClick={() => this.$emit('dismiss')}
              title="Dismiss"
            >
              close
            </button>
          )}
        </div>

        <div class="island__body">
          <p class="island__label">{this.message}</p>
        </div>
      </GlassPanel>
    )
  },
})
