import { defineComponent, type PropType, computed } from 'vue'
import GlassPanel from '@/components/core/GlassPanel'
import type { Microtask, MicrotaskStatus } from '@/types/agent'
import './MicrotaskIsland.css'

/** Map of status → visual indicator */
const STATUS_ICON: Record<MicrotaskStatus, string> = {
  done: 'check_circle',
  active: 'arrow_right',
  queued: 'radio_button_unchecked',
  failed: 'cancel',
}

/**
 * MicrotaskIsland — displays the queue of planned microtasks.
 *
 * Shows all tasks with their current status:
 * - ✓ done, → active (highlighted), ○ queued, ✗ failed
 *
 * When all tasks are complete, a dismiss (X) button appears.
 */
export default defineComponent({
  name: 'MicrotaskIsland',

  props: {
    tasks: {
      type: Array as PropType<Microtask[]>,
      required: true,
    },
  },

  emits: ['dismiss'],

  setup(props) {
    /** True when all tasks are in terminal state (done/failed) */
    const allDone = computed(() =>
      props.tasks.length > 0 && props.tasks.every(t => t.status === 'done' || t.status === 'failed'),
    )

    return { allDone }
  },

  methods: {
    statusClass(status: MicrotaskStatus): string {
      return `microtask--${status}`
    },
  },

  render() {
    if (this.tasks.length === 0) return null

    return (
      <GlassPanel class="island island--microtask animate-float-in">
        <div class="island__header">
          <span class="island__icon">list_alt</span>
          <span class="island__title">Task Queue</span>
          {this.allDone && (
            <button
              class="island__dismiss"
              onClick={() => this.$emit('dismiss')}
            >
              close
            </button>
          )}
        </div>

        <ul class="microtask__list">
          {this.tasks.map((task) => (
            <li
              key={task.id}
              class={['microtask__item', this.statusClass(task.status)].join(' ')}
            >
              <span class="microtask__indicator">
                {STATUS_ICON[task.status]}
              </span>
              <span class="microtask__text">{task.text}</span>
            </li>
          ))}
        </ul>
      </GlassPanel>
    )
  },
})
