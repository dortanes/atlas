import { defineComponent, ref, onMounted } from 'vue'
import { useMemory, type SessionMeta, type ConversationSession } from '@/composables/useMemory'

/**
 * MemoryTab — browse and manage conversation sessions.
 */
export default defineComponent({
  name: 'MemoryTab',

  setup() {
    const {
      sessions,
      loading,
      loadSessions,
      getSession,
      deleteSession,
      clearSessions,
      newSession,
    } = useMemory()

    const expandedSession = ref<ConversationSession | null>(null)
    const expanding = ref(false)

    onMounted(() => {
      loadSessions()
    })

    async function toggleSession(meta: SessionMeta) {
      if (expandedSession.value?.id === meta.id) {
        expandedSession.value = null
        return
      }

      expanding.value = true
      const full = await getSession(meta.id)
      expandedSession.value = full
      expanding.value = false
    }

    async function onDelete(id: string) {
      if (expandedSession.value?.id === id) {
        expandedSession.value = null
      }
      await deleteSession(id)
    }

    async function onClearAll() {
      expandedSession.value = null
      await clearSessions()
    }

    async function onNewSession() {
      expandedSession.value = null
      await newSession()
    }

    function formatDate(iso: string): string {
      const d = new Date(iso)
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    }

    return {
      sessions,
      loading,
      expandedSession,
      expanding,
      toggleSession,
      onDelete,
      onClearAll,
      onNewSession,
      formatDate,
    }
  },

  render() {
    return (
      <div class="settings-tab">
        <h3 class="settings-tab__title">Memory</h3>

        {/* Actions bar */}
        <div class="memory-actions">
          <button class="memory-actions__btn memory-actions__btn--new" onClick={() => this.onNewSession()}>
            <span class="memory-actions__icon">add</span>
            New Conversation
          </button>
          {this.sessions.length > 0 && (
            <button class="memory-actions__btn memory-actions__btn--clear" onClick={() => this.onClearAll()}>
              <span class="memory-actions__icon">delete_sweep</span>
              Clear All
            </button>
          )}
        </div>

        {/* Sessions list */}
        {this.loading ? (
          <div class="settings-loading">Loading sessions…</div>
        ) : this.sessions.length === 0 ? (
          <div class="memory-empty">
            <span class="memory-empty__icon">chat_bubble_outline</span>
            <span>No conversations yet. Start chatting with Atlas!</span>
          </div>
        ) : (
          <div class="memory-sessions">
            {this.sessions.map((s: SessionMeta) => {
              const isExpanded = this.expandedSession?.id === s.id
              return (
                <div key={s.id} class={['memory-session', isExpanded && 'memory-session--expanded']}>
                  <div class="memory-session__header" onClick={() => this.toggleSession(s)}>
                    <div class="memory-session__info">
                      <span class="memory-session__title">{s.title}</span>
                      <span class="memory-session__meta">
                        {s.messageCount} messages · {this.formatDate(s.updatedAt)}
                      </span>
                    </div>
                    <div class="memory-session__actions">
                      <button
                        class="memory-session__btn memory-session__btn--delete"
                        onClick={(e: Event) => { e.stopPropagation(); this.onDelete(s.id) }}
                        title="Delete session"
                      >delete</button>
                      <span class={['memory-session__chevron', isExpanded && 'memory-session__chevron--open']}>
                        expand_more
                      </span>
                    </div>
                  </div>

                  {/* Expanded messages */}
                  {isExpanded && this.expandedSession && (
                    <div class="memory-session__messages">
                      {this.expandedSession.messages.map((msg, i) => (
                        <div key={i} class={['memory-msg', `memory-msg--${msg.role}`]}>
                          <span class="memory-msg__role">{msg.role === 'user' ? '👤' : '🤖'}</span>
                          <span class="memory-msg__text">{msg.text}</span>
                        </div>
                      ))}
                      {this.expandedSession.messages.length === 0 && (
                        <div class="memory-msg memory-msg--empty">No messages in this session</div>
                      )}
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
