import { defineComponent, ref, onMounted } from 'vue'
import { useFacts, type Fact } from '@/composables/useFacts'

/**
 * FactsSubTab — manages per-persona facts.
 * Card-based layout with Material icons, inline editing, styled add/clear.
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
      <div style="max-width: 720px;">
        <p class="subtab-description">
          Knowledge that Atlas remembers about you. Facts are extracted from conversations and can be added manually.
        </p>

        {/* Add fact input */}
        <div class="subtab-add-row">
          <input class="settings-field__input" style="flex: 1;" value={this.newFactText}
            onInput={(e: Event) => { this.newFactText = (e.target as HTMLInputElement).value }}
            onKeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') this.onAdd() }}
            placeholder="Add a fact manually…" maxlength={500} />
          <button class="settings-field__button" onClick={() => this.onAdd()} disabled={!this.newFactText.trim()}>
            <span class="settings-field__button-icon">add</span>
            Add
          </button>
        </div>

        {this.loading ? (
          <div class="settings-loading">Loading facts…</div>
        ) : this.facts.length === 0 ? (
          <div class="subtab-empty">
            <span class="subtab-empty__icon">lightbulb</span>
            <span>No facts yet. Start chatting and Atlas will learn about you!</span>
          </div>
        ) : (
          <>
            <div class="subtab-cards">
              {this.facts.map((f: Fact) => {
                const isEditing = this.editingId === f.id
                return (
                  <div key={f.id} class={['subtab-card', isEditing && 'subtab-card--editing']}>
                    {isEditing ? (
                      <div class="subtab-card__edit-row">
                        <input class="settings-field__input" style="flex: 1;" value={this.editingText}
                          onInput={(e: Event) => { this.editingText = (e.target as HTMLInputElement).value }}
                          onKeydown={(e: KeyboardEvent) => {
                            if (e.key === 'Enter') this.saveEdit()
                            if (e.key === 'Escape') this.cancelEdit()
                          }} maxlength={500} />
                        <button class="subtab-card__action subtab-card__action--save" onClick={() => this.saveEdit()}>check</button>
                        <button class="subtab-card__action subtab-card__action--cancel" onClick={() => this.cancelEdit()}>close</button>
                      </div>
                    ) : (
                      <>
                        <span class="subtab-card__icon">{f.source === 'extracted' ? 'smart_toy' : 'edit'}</span>
                        <span class="subtab-card__text">{f.text}</span>
                        <div class="subtab-card__actions">
                          <button class="subtab-card__action" onClick={() => this.startEdit(f)} title="Edit">edit</button>
                          <button class="subtab-card__action subtab-card__action--delete" onClick={() => this.onDelete(f.id)} title="Delete">delete</button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            <button class="subtab-danger-btn" onClick={() => this.onClearAll()}>
              <span class="subtab-danger-btn__icon">delete_sweep</span>
              Clear All Facts
            </button>
          </>
        )}
      </div>
    )
  },
})
