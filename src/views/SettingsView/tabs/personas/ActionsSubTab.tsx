import { defineComponent, ref, onMounted } from 'vue'
import { api } from '@/api'

interface ActionLogEntry {
  personaId: string
  command: string
  timestamp: string
  entries: string[]
}

/**
 * ActionsSubTab — displays action history (execution branch) for a persona.
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
      if (entry.includes('] OK:')) return '✅'
      if (entry.includes('] FAILED:')) return '❌'
      if (entry.includes('] screenshot')) return '📸'
      return '▶️'
    }

    onMounted(() => loadLogs())

    return { logs, loading, expandedIndex, loadLogs, clearLogs, toggleExpand, formatDate, getStatusIcon }
  },

  render() {
    return (
      <div>
        <div class="memory-actions">
          <button class="memory-actions__btn memory-actions__btn--new" onClick={() => this.loadLogs()}>
            <span class="memory-actions__icon">refresh</span>
            Refresh
          </button>
          {this.logs.length > 0 && (
            <button class="memory-actions__btn memory-actions__btn--clear" onClick={() => this.clearLogs()}>
              <span class="memory-actions__icon">delete_sweep</span>
              Clear All
            </button>
          )}
        </div>
        {this.loading ? (
          <div class="settings-loading">Loading action logs…</div>
        ) : this.logs.length === 0 ? (
          <div class="memory-empty">
            <span class="memory-empty__icon">terminal</span>
            <span>No actions yet. Give the agent a task to see its execution history.</span>
          </div>
        ) : (
          <div class="memory-sessions">
            {this.logs.map((log, i) => {
              const isExpanded = this.expandedIndex === i
              const hasErrors = log.entries.some(e => e.includes('] FAILED:'))
              return (
                <div key={i} class={['memory-session', isExpanded && 'memory-session--expanded']}>
                  <div class="memory-session__header" onClick={() => this.toggleExpand(i)}>
                    <div class="memory-session__info">
                      <span class="memory-session__title">
                        {hasErrors ? '⚠️' : '✅'} {log.command}
                      </span>
                      <span class="memory-session__meta">
                        {log.entries.length} steps · {this.formatDate(log.timestamp)}
                      </span>
                    </div>
                    <div class="memory-session__actions">
                      <span class={['memory-session__chevron', isExpanded && 'memory-session__chevron--open']}>
                        expand_more
                      </span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div class="memory-session__messages">
                      {log.entries.map((entry, j) => (
                        <div key={j} class="memory-msg memory-msg--model" style="font-family: monospace; font-size: 0.85em;">
                          <span class="memory-msg__role">{this.getStatusIcon(entry)}</span>
                          <span class="memory-msg__text">{entry}</span>
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
