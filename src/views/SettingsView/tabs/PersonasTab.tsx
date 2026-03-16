import { defineComponent, ref, onMounted, type Ref } from 'vue'
import { usePersonas, type AgentProfile } from '@/composables/usePersonas'
import EmojiSelect from '../components/EmojiPicker'
import PromptsSubTab from './personas/PromptsSubTab'
import FactsSubTab from './personas/FactsSubTab'
import MemorySubTab from './personas/MemorySubTab'
import ActionsSubTab from './personas/ActionsSubTab'

type PersonaSubTab = 'profile' | 'prompts' | 'facts' | 'memory' | 'actions'

const SUB_TABS: { id: PersonaSubTab; label: string; icon: string }[] = [
  { id: 'profile', label: 'Profile', icon: 'person' },
  { id: 'prompts', label: 'Prompts', icon: 'code' },
  { id: 'facts', label: 'Facts', icon: 'lightbulb' },
  { id: 'memory', label: 'Memory', icon: 'history' },
  { id: 'actions', label: 'Actions', icon: 'bolt' },
]

/**
 * PersonasTab — full-width layout.
 *
 * Card-based persona selector → fit-content sub-tabs → content.
 * Profile: read-only card by default, "Edit" button to enable editing.
 * Emoji picker for avatar selection. Required fields marked with *.
 */
export default defineComponent({
  name: 'PersonasTab',

  setup() {
    const {
      personas, activePersona, loadPersonas,
      createPersona, updatePersona, deletePersona, switchPersona,
    } = usePersonas()

    const selectedId: Ref<string | null> = ref(null)
    const subTab: Ref<PersonaSubTab> = ref('profile')
    const editing = ref(false)
    const isCreating = ref(false)

    // Form fields
    const editName = ref('')
    const editAvatar = ref('🤖')
    const editPersonality = ref('')
    const editVoiceId = ref('')
    const saving = ref(false)

    onMounted(async () => {
      await loadPersonas()
      if (activePersona.value) selectedId.value = activePersona.value.id
      else if (personas.value.length > 0) selectedId.value = personas.value[0].id
    })

    function getSelected(): AgentProfile | undefined {
      return personas.value.find((p) => p.id === selectedId.value)
    }

    function selectPersona(id: string) {
      selectedId.value = id
      editing.value = false
      isCreating.value = false
      subTab.value = 'profile'
    }

    function startEdit() {
      const p = getSelected()
      if (!p) return
      editName.value = p.name
      editAvatar.value = p.avatar
      editPersonality.value = p.personality
      editVoiceId.value = p.ttsVoiceId || ''
      editing.value = true
    }

    function startCreate() {
      isCreating.value = true
      editing.value = true
      selectedId.value = null
      editName.value = ''
      editAvatar.value = '🤖'
      editPersonality.value = ''
      editVoiceId.value = ''
      subTab.value = 'profile'
    }

    function cancelEdit() {
      editing.value = false
      if (isCreating.value) {
        isCreating.value = false
        if (personas.value.length > 0) selectedId.value = personas.value[0].id
      }
    }

    async function saveProfile() {
      if (!editName.value.trim()) return
      saving.value = true
      try {
        const data = {
          name: editName.value.trim(),
          avatar: editAvatar.value.trim() || '🤖',
          personality: editPersonality.value.trim(),
          ttsVoiceId: editVoiceId.value.trim() || undefined,
        }
        if (isCreating.value) {
          const created = await createPersona(data)
          if (created) { selectedId.value = created.id; isCreating.value = false }
        } else if (selectedId.value) {
          await updatePersona(selectedId.value, data)
        }
        editing.value = false
      } finally {
        saving.value = false
      }
    }

    async function onDelete(id: string, e: Event) {
      e.stopPropagation()
      await deletePersona(id)
      if (selectedId.value === id) {
        selectedId.value = personas.value.length > 0 ? personas.value[0].id : null
        editing.value = false
      }
    }

    async function onSwitch(id: string, e: Event) {
      e.stopPropagation()
      await switchPersona(id)
    }

    return {
      personas, activePersona, selectedId, subTab, editing, isCreating,
      editName, editAvatar, editPersonality, editVoiceId, saving,
      getSelected, selectPersona, startEdit, startCreate, cancelEdit, saveProfile,
      onDelete, onSwitch,
    }
  },

  render() {
    const selected = this.getSelected()
    const showProfile = this.subTab === 'profile'

    return (
      <div class="settings-tab" style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
        <h2 class="settings-tab__title" style="flex-shrink: 0; align-self: flex-start;">Personas</h2>
        <p class="settings-tab__subtitle" style="align-self: flex-start;">Agent profiles, prompts, and memory</p>

        {/* Card-based Persona Selector */}
        <div class="persona-selector" style="align-self: flex-start;">
          <div class="persona-selector__list">
            {this.personas.map((p: AgentProfile) => {
              const isActive = this.activePersona?.id === p.id
              const isSelected = this.selectedId === p.id
              return (
                <button key={p.id}
                  class={['persona-card', isSelected && 'persona-card--selected', isActive && 'persona-card--active']}
                  onClick={() => this.selectPersona(p.id)}>
                  <span class="persona-card__avatar">{p.avatar}</span>
                  <span class="persona-card__name">{p.name}</span>
                  {isActive && (
                    <span class="persona-card__active-badge">
                      <span class="persona-card__active-icon">radio_button_checked</span>
                      Active
                    </span>
                  )}
                  <span class="persona-card__actions">
                    {!isActive && (
                      <span class="persona-card__action persona-card__action--activate"
                        onClick={(e: Event) => this.onSwitch(p.id, e)} title="Activate">check_circle</span>
                    )}
                    {!p.isDefault && (
                      <span class="persona-card__action persona-card__action--delete"
                        onClick={(e: Event) => this.onDelete(p.id, e)} title="Delete">close</span>
                    )}
                  </span>
                </button>
              )
            })}
            <button class="persona-card persona-card--add" onClick={() => this.startCreate()}>
              <span class="persona-card__add-icon">add</span>
              New Persona
            </button>
          </div>
        </div>

        {/* Sub-tabs (compact, fit-content) */}
        {(selected || this.isCreating) && (
          <div class="personas-subtabs" style="flex-shrink: 0; align-self: flex-start;">
            {SUB_TABS.map((tab) => (
              <button key={tab.id}
                class={['personas-subtab', this.subTab === tab.id && 'personas-subtab--active']}
                onClick={() => { this.subTab = tab.id }}
                disabled={this.isCreating && tab.id !== 'profile'}>
                <span class="personas-subtab__icon">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div style="flex: 1; overflow-y: auto; min-height: 0; width: 100%;">
          {(selected || this.isCreating) ? (
            <>
              {/* ── PROFILE READ-ONLY ── */}
              {showProfile && !this.editing && selected && (
                <div class="persona-profile">
                  <div class="persona-profile__header">
                    <div class="persona-profile__avatar">{selected.avatar}</div>
                    <div class="persona-profile__meta">
                      <div class="persona-profile__name">
                        {selected.name}
                        {this.activePersona?.id === selected.id && (
                          <span class="persona-card__active-badge" style="margin-left: 8px;">
                            <span class="persona-card__active-icon">radio_button_checked</span>
                            Active
                          </span>
                        )}
                        {selected.isDefault && <span class="persona-profile__default-badge">default</span>}
                      </div>
                      {selected.ttsVoiceId && (
                        <div class="persona-profile__voice">
                          <span class="persona-profile__voice-icon">record_voice_over</span>
                          {selected.ttsVoiceId}
                        </div>
                      )}
                    </div>
                    <button class="settings-field__button" onClick={() => this.startEdit()}>
                      <span class="settings-field__button-icon">edit</span>
                      Edit
                    </button>
                  </div>
                  {selected.personality ? (
                    <div class="persona-profile__personality">
                      <div class="settings-section__title">Personality</div>
                      <div class="persona-profile__personality-text">{selected.personality}</div>
                    </div>
                  ) : (
                    <div class="persona-profile__empty">
                      No personality defined. Click Edit to add one.
                    </div>
                  )}
                </div>
              )}

              {/* ── EDIT / CREATE ── */}
              {showProfile && this.editing && (
                <div class="persona-edit-card" style="max-width: 640px;">
                  <div class="settings-section">
                    <div class="settings-section__title">Identity</div>
                    <div class="settings-section__card">
                      <div class="settings-row">
                        <div class="settings-row__info">
                          <span class="settings-row__label">Avatar</span>
                        </div>
                        <div class="settings-row__control">
                          <EmojiSelect
                            modelValue={this.editAvatar}
                            onUpdate:modelValue={(v: string) => { this.editAvatar = v }}
                          />
                        </div>
                      </div>
                      <div class="settings-row">
                        <div class="settings-row__info">
                          <span class="settings-row__label">Name <span style="color: oklch(0.7 0.2 25);">*</span></span>
                        </div>
                        <div class="settings-row__control" style="flex: 1; min-width: 0;">
                          <input class="settings-field__input" style="width: 100%;"
                            value={this.editName}
                            onInput={(e: Event) => { this.editName = (e.target as HTMLInputElement).value }}
                            maxlength={50} placeholder="Enter persona name…" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="settings-section">
                    <div class="settings-section__title">Personality <span style="color: oklch(0.7 0.2 25);">*</span></div>
                    <textarea class="settings-field__input"
                      style="width: 100%; min-height: 120px; resize: vertical; font-family: inherit; line-height: 1.6;"
                      value={this.editPersonality}
                      onInput={(e: Event) => { this.editPersonality = (e.target as HTMLTextAreaElement).value }}
                      maxlength={2000} placeholder="Describe personality, tone, and behavior…" rows={5} />
                  </div>

                  <div class="settings-section">
                    <div class="settings-section__title">Voice Override</div>
                    <label class="settings-field">
                      <span class="settings-field__hint">Per-persona TTS voice. Leave empty for global.</span>
                      <input class="settings-field__input" value={this.editVoiceId}
                        onInput={(e: Event) => { this.editVoiceId = (e.target as HTMLInputElement).value }}
                        maxlength={100} placeholder="Leave empty to use global voice" />
                    </label>
                  </div>

                  <div style="display: flex; gap: 8px;">
                    <button class="settings-field__button" style="flex: 1;"
                      onClick={() => this.saveProfile()}
                      disabled={this.saving || !this.editName.trim() || !this.editPersonality.trim()}>
                      <span class="settings-field__button-icon">{this.isCreating ? 'add' : 'save'}</span>
                      {this.saving ? 'Saving…' : (this.isCreating ? 'Create Persona' : 'Save Changes')}
                    </button>
                    <button class="settings-field__button" onClick={() => this.cancelEdit()}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {this.subTab === 'prompts' && selected && (
                <PromptsSubTab key={`prompts-${selected.id}`} personaId={selected.id} />
              )}
              {this.subTab === 'facts' && selected && (
                <FactsSubTab key={`facts-${selected.id}`} personaId={selected.id} />
              )}
              {this.subTab === 'memory' && selected && (
                <MemorySubTab key={`memory-${selected.id}`} personaId={selected.id} />
              )}
              {this.subTab === 'actions' && selected && (
                <ActionsSubTab key={`actions-${selected.id}`} personaId={selected.id} />
              )}
            </>
          ) : (
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: oklch(0.4 0 0); font-size: 13px;">
              Select a persona or create a new one
            </div>
          )}
        </div>
      </div>
    )
  },
})
