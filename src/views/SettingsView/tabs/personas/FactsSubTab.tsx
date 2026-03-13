import { defineComponent, ref, onMounted } from 'vue'
import { useFacts, type Fact } from '@/composables/useFacts'

/**
 * FactsSubTab — manages per-persona facts.
 */
export default defineComponent({
  name: 'FactsSubTab',

  props: {
    personaId: { type: String, required: true },
  },

  setup(props) {
    const { facts, loading, loadFacts, addFact, updateFact, deleteFact, clearFacts } = useFacts()

    const newFactText = ref('')
    const editingId = ref<string | null>(null)
    const editingText = ref('')

    onMounted(() => loadFacts(props.personaId))

    async function onAdd() {
      const text = newFactText.value.trim()
      if (!text) return
      await addFact(text, props.personaId)
      newFactText.value = ''
    }

    function startEdit(fact: Fact) {
      editingId.value = fact.id
      editingText.value = fact.text
    }

    async function saveEdit() {
      if (!editingId.value || !editingText.value.trim()) return
      await updateFact(editingId.value, editingText.value.trim(), props.personaId)
      editingId.value = null
      editingText.value = ''
    }

    function cancelEdit() {
      editingId.value = null
      editingText.value = ''
    }

    async function onDelete(id: string) {
      if (editingId.value === id) cancelEdit()
      await deleteFact(id, props.personaId)
    }

    async function onClearAll() {
      editingId.value = null
      await clearFacts(props.personaId)
    }

    return {
      facts, loading, newFactText, editingId, editingText,
      onAdd, startEdit, saveEdit, cancelEdit, onDelete, onClearAll,
    }
  },

  render() {
    return (
      <div>
        <p class="facts-description">
          Knowledge that Atlas remembers about you. Facts are extracted automatically from conversations and can be edited manually.
        </p>
        <div class="facts-add">
          <input class="settings-field__input facts-add__input" value={this.newFactText}
            onInput={(e: Event) => { this.newFactText = (e.target as HTMLInputElement).value }}
            onKeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') this.onAdd() }}
            placeholder="Add a fact manually…" maxlength={500} />
          <button class="facts-add__btn" onClick={() => this.onAdd()} disabled={!this.newFactText.trim()}>
            <span class="facts-add__icon">add</span>
          </button>
        </div>
        {this.loading ? (
          <div class="settings-loading">Loading facts…</div>
        ) : this.facts.length === 0 ? (
          <div class="facts-empty">
            <span class="facts-empty__icon">lightbulb</span>
            <span>No facts yet. Start chatting and Atlas will learn about you!</span>
          </div>
        ) : (
          <>
            <div class="facts-list">
              {this.facts.map((f: Fact) => {
                const isEditing = this.editingId === f.id
                return (
                  <div key={f.id} class="facts-item">
                    {isEditing ? (
                      <div class="facts-item__edit">
                        <input class="settings-field__input facts-item__edit-input" value={this.editingText}
                          onInput={(e: Event) => { this.editingText = (e.target as HTMLInputElement).value }}
                          onKeydown={(e: KeyboardEvent) => {
                            if (e.key === 'Enter') this.saveEdit()
                            if (e.key === 'Escape') this.cancelEdit()
                          }} maxlength={500} />
                        <button class="facts-item__btn facts-item__btn--save" onClick={() => this.saveEdit()}>check</button>
                        <button class="facts-item__btn facts-item__btn--cancel" onClick={() => this.cancelEdit()}>close</button>
                      </div>
                    ) : (
                      <>
                        <span class="facts-item__source">{f.source === 'extracted' ? '🤖' : '✏️'}</span>
                        <span class="facts-item__text">{f.text}</span>
                        <div class="facts-item__actions">
                          <button class="facts-item__btn facts-item__btn--edit" onClick={() => this.startEdit(f)}>edit</button>
                          <button class="facts-item__btn facts-item__btn--delete" onClick={() => this.onDelete(f.id)}>delete</button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            <button class="facts-clear" onClick={() => this.onClearAll()}>
              <span class="facts-clear__icon">delete_sweep</span>
              Clear All Facts
            </button>
          </>
        )}
      </div>
    )
  },
})
