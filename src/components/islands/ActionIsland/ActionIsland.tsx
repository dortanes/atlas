import { defineComponent, type PropType } from 'vue'
import GlassPanel from '@/components/core/GlassPanel'
import type { ActionData } from '@/types/agent'
import './ActionIsland.css'

/**
 * ActionIsland — displays the agent's current task with progress.
 *
 * Shows the action label, a step counter, and an animated progress bar.
 * The progress bar fills smoothly as steps complete.
 */
export default defineComponent({
  name: 'ActionIsland',

  props: {
    action: {
      type: Object as PropType<ActionData>,
      required: true,
    },
  },

  render() {
    const step = Math.max(1, Math.round((this.action.progress / 100) * 15))

    return (
      <GlassPanel class="island island--action animate-float-in">
        <div class="island__header">
          <span class="island__icon">bolt</span>
          <span class="island__title">Performing Action</span>
          <span class="island__step-counter">Step {step}</span>
        </div>

        <div class="island__body">
          <p class="island__label">{this.action.label}</p>

          <div class="island__progress-track">
            <div
              class="island__progress-fill"
              style={{ width: `${Math.max(this.action.progress, 5)}%` }}
            />
          </div>
        </div>
      </GlassPanel>
    )
  },
})
