import { defineComponent, ref, watch, onMounted, onBeforeUnmount, type PropType } from 'vue'
import type { AgentState } from '@/types/agent'
import './AgentOrb.css'

/** Target playback rate per state (1 = normal, >1 = faster) */
const STATE_SPEED: Record<AgentState, number> = {
  idle: 1,
  listening: 1.4,
  processing: 2.2,
  acting: 1.2,
  warning: 2.8,
}

/** Duration of the speed interpolation in ms */
const SPEED_LERP_DURATION = 1200

/**
 * AgentOrb — the central visual avatar of Atlas.
 *
 * An animated SVG blob cluster that reflects the agent's current state
 * through color palettes and animation speed. Blobs continuously morph
 * between organic shapes. When state changes:
 * - Colors transition smoothly via CSS `transition: fill`
 * - Animation speed transitions smoothly via JS `playbackRate` interpolation
 */
export default defineComponent({
  name: 'AgentOrb',

  props: {
    state: {
      type: String as PropType<AgentState>,
      default: 'idle',
    },
  },

  setup(props) {
    const orbRef = ref<HTMLElement | null>(null)
    let currentRate = STATE_SPEED.idle
    let lerpRafId: number | null = null

    /**
     * Smoothly interpolate playbackRate of all CSS animations
     * inside the orb from the current value to the target.
     */
    function lerpSpeed(targetRate: number) {
      if (lerpRafId !== null) cancelAnimationFrame(lerpRafId)

      const startRate = currentRate
      const startTime = performance.now()

      function tick(now: number) {
        const elapsed = now - startTime
        const t = Math.min(elapsed / SPEED_LERP_DURATION, 1)
        // Ease-out cubic for natural deceleration feel
        const eased = 1 - Math.pow(1 - t, 3)
        const rate = startRate + (targetRate - startRate) * eased

        currentRate = rate
        applyRate(rate)

        if (t < 1) {
          lerpRafId = requestAnimationFrame(tick)
        } else {
          lerpRafId = null
        }
      }

      lerpRafId = requestAnimationFrame(tick)
    }

    /** Apply playbackRate to every running CSS animation inside the orb */
    function applyRate(rate: number) {
      if (!orbRef.value) return
      const animations = orbRef.value.getAnimations({ subtree: true })
      for (const anim of animations) {
        anim.playbackRate = rate
      }
    }

    watch(
      () => props.state,
      (newState) => {
        lerpSpeed(STATE_SPEED[newState as AgentState])
      },
    )

    onMounted(() => {
      applyRate(STATE_SPEED[props.state as AgentState])
    })

    onBeforeUnmount(() => {
      if (lerpRafId !== null) cancelAnimationFrame(lerpRafId)
    })

    return { orbRef }
  },

  computed: {
    stateClass(): string {
      return `orb--${this.state}`
    },
  },

  render() {
    return (
      <div class={['orb', this.stateClass].join(' ')} ref="orbRef">
        {/* Background glow */}
        <div class="orb__glow" />

        {/* SVG blob cluster */}
        <svg class="orb__svg" viewBox="0 0 1200 1200">
          {/* Primary blobs */}
          <g class="orb__blob orb__blob-1"><path /></g>
          <g class="orb__blob orb__blob-2"><path /></g>
          <g class="orb__blob orb__blob-3"><path /></g>
          <g class="orb__blob orb__blob-4"><path /></g>

          {/* Alt blobs — reverse rotation, lower opacity for depth */}
          <g class="orb__blob orb__blob-1 orb__blob--alt"><path /></g>
          <g class="orb__blob orb__blob-2 orb__blob--alt"><path /></g>
          <g class="orb__blob orb__blob-3 orb__blob--alt"><path /></g>
          <g class="orb__blob orb__blob-4 orb__blob--alt"><path /></g>
        </svg>
      </div>
    )
  },
})
