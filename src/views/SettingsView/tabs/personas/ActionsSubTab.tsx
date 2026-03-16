import { defineComponent, ref, onMounted } from 'vue'
import { api } from '@/api'

interface ActionLogEntry {
  personaId: string
  command: string
  timestamp: string
  entries: string[]
}

/**
 * ActionsSubTab — action history with Material status icons, styled log cards.
 */
export default defineComponent({
  name: 'ActionsSubTab',

  props: {
    personaId: { type: String, required: true },
  },

  setup(props) {
    const logs = ref<ActionLogEntry[]>([])
    const loading = ref(false)
    const expandedIndex = ref<number | null>(null)

    async function loadLogs() {
      loading.value = true
      try {
        logs.value = await api.agent.getActionLogs.query({ personaId: props.personaId })
      } catch (err) {
        console.error('[ActionsSubTab] Failed to load action logs:', err)
      } finally {
        loading.value = false
      }
    }

    async function clearLogs() {
      try {
        await api.agent.clearActionLogs.mutate({ personaId: props.personaId })
        logs.value = []
        expandedIndex.value = null
      } catch (err) {
        console.error('[ActionsSubTab] Failed to clear action logs:', err)
      }
    }

    function toggleExpand(index: number) {
      expandedIndex.value = expandedIndex.value === index ? null : index
    }

    function formatDate(iso: string): string {
      const d = new Date(iso)
      return d.toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    }

    function getStatusIcon(entry: string): string {
      if (entry.includes('] OK:')) return 'check_circle'
      if (entry.includes('] FAILED:')) return 'error'
      if (entry.includes('] screenshot')) return 'photo_camera'
      return 'play_arrow'
    }

    onMounted(() => loadLogs())

    return { logs, loading, expandedIndex, loadLogs, clearLogs, toggleExpand, formatDate, getStatusIcon }
  },

  render() {
    return (
      <div style="max-width: 720px;">
        {/* Actions */}
        <div class="subtab-actions-row">
          <button class="settings-field__button" onClick={() => this.loadLogs()}>
            <span class="settings-field__button-icon">refresh</span>
            Refresh
          </button>
          {this.logs.length > 0 && (
            <button class="subtab-danger-btn" style="margin-top: 0;" onClick={() => this.clearLogs()}>
              <span class="subtab-danger-btn__icon">delete_sweep</span>
              Clear All
            </button>
          )}
        </div>

        {this.loading ? (
          <div class="settings-loading">Loading action logs…</div>
        ) : this.logs.length === 0 ? (
          <div class="subtab-empty">
            <span class="subtab-empty__icon">terminal</span>
            <span>No actions yet. Give the agent a task to see its execution history.</span>
          </div>
        ) : (
          <div class="subtab-cards">
            {this.logs.map((log, i) => {
              const isExpanded = this.expandedIndex === i
              const hasErrors = log.entries.some(e => e.includes('] FAILED:'))
              return (
                <div key={i} class={['subtab-card subtab-card--session', isExpanded && 'subtab-card--expanded']}>
                  <div class="subtab-card__header" onClick={() => this.toggleExpand(i)}>
                    <div class="subtab-card__header-info">
                      <span class={['subtab-card__icon', hasErrors ? 'subtab-card__icon--error' : 'subtab-card__icon--success']}>
                        {hasErrors ? 'warning' : 'check_circle'}
                      </span>
                      <div>
                        <div class="subtab-card__title">{log.command}</div>
                        <div class="subtab-card__meta">{log.entries.length} steps · {this.formatDate(log.timestamp)}</div>
                      </div>
                    </div>
                    <div class="subtab-card__header-actions">
                      <span class={['subtab-card__chevron', isExpanded && 'subtab-card__chevron--open']}>expand_more</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div class="subtab-card__messages">
                      {log.entries.map((entry, j) => (
                        <div key={j} class="subtab-msg subtab-msg--log">
                          <span class={['subtab-msg__icon', entry.includes('] FAILED:') && 'subtab-msg__icon--error']}>
                            {this.getStatusIcon(entry)}
                          </span>
                          <span class="subtab-msg__text" style="font-family: monospace; font-size: 0.85em;">{entry}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  },
})
