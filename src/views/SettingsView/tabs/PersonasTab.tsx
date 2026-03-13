import { defineComponent, ref, onMounted, type Ref } from 'vue'
import { usePersonas, type AgentProfile } from '@/composables/usePersonas'
import ProfileSubTab from './personas/ProfileSubTab'
import PromptsSubTab from './personas/PromptsSubTab'
import FactsSubTab from './personas/FactsSubTab'
import MemorySubTab from './personas/MemorySubTab'
import ActionsSubTab from './personas/ActionsSubTab'

type PersonaSubTab = 'profile' | 'prompts' | 'facts' | 'memory' | 'actions'

/**
 * PersonasTab — Master-detail orchestrator.
 *
 * Left: persona list. Right: sub-tab content (Profile, Prompts, Facts, Memory).
 * Sub-tabs are separate components in ./personas/ and handle their own data loading.
 */
export default defineComponent({
  name: 'PersonasTab',

  setup() {
    const {
      personas, activePersona, loading, loadPersonas,
      createPersona, updatePersona, deletePersona, switchPersona,
    } = usePersonas()

    const selectedId: Ref<string | null> = ref(null)
    const subTab: Ref<PersonaSubTab> = ref('profile')

    // ── Form state ──
    const showForm = ref(false)
    const editingId = ref<string | null>(null)
    const formName = ref('')
    const formAvatar = ref('🤖')
    const formPersonality = ref('')
    const formVoiceId = ref('')
    const formSaving = ref(false)

    onMounted(async () => {
      await loadPersonas()
      if (activePersona.value) selectedId.value = activePersona.value.id
      else if (personas.value.length > 0) selectedId.value = personas.value[0].id
    })

    function selectedPersona(): AgentProfile | undefined {
      return personas.value.find((p) => p.id === selectedId.value)
    }

    function resetForm() {
      showForm.value = false
      editingId.value = null
      formName.value = ''
      formAvatar.value = '🤖'
      formPersonality.value = ''
      formVoiceId.value = ''
    }

    function selectPersona(id: string) {
      selectedId.value = id
      showForm.value = false
      const p = personas.value.find((p) => p.id === id)
      if (p) {
        formName.value = p.name
        formAvatar.value = p.avatar
        formPersonality.value = p.personality
        formVoiceId.value = p.ttsVoiceId || ''
      }
    }

    function startCreate() {
      resetForm()
      showForm.value = true
      selectedId.value = null
      subTab.value = 'profile'
    }

    function startEdit(p: AgentProfile) {
      showForm.value = true
      editingId.value = p.id
      formName.value = p.name
      formAvatar.value = p.avatar
      formPersonality.value = p.personality
      formVoiceId.value = p.ttsVoiceId || ''
      subTab.value = 'profile'
    }

    async function submitForm() {
      if (!formName.value.trim()) return
      formSaving.value = true
      if (editingId.value) {
        await updatePersona(editingId.value, {
          name: formName.value.trim(), avatar: formAvatar.value.trim(),
          personality: formPersonality.value.trim(), ttsVoiceId: formVoiceId.value.trim() || undefined,
        })
      } else {
        const created = await createPersona({
          name: formName.value.trim(), avatar: formAvatar.value.trim(),
          personality: formPersonality.value.trim(), ttsVoiceId: formVoiceId.value.trim() || undefined,
        })
        if (created) selectedId.value = created.id
      }
      formSaving.value = false
      showForm.value = false
    }

    async function onDelete(id: string) {
      await deletePersona(id)
      if (selectedId.value === id) {
        selectedId.value = personas.value.length > 0 ? personas.value[0].id : null
      }
    }

    async function onSwitch(id: string) {
      await switchPersona(id)
    }

    return {
      personas, activePersona, loading, selectedId, subTab,
      showForm, editingId, formName, formAvatar, formPersonality, formVoiceId, formSaving,
      selectPersona, selectedPersona, startCreate, startEdit, submitForm, resetForm, onDelete, onSwitch,
    }
  },

  methods: {
    renderNewForm() {
      return (
        <ProfileSubTab
          persona={{ id: '__new__', name: '', avatar: '🤖', personality: '', createdAt: '', isDefault: false } as any}
          activePersonaId={this.activePersona?.id ?? undefined}
          showForm={true}
          editingId="__new__"
          formName={this.formName}
          formAvatar={this.formAvatar}
          formPersonality={this.formPersonality}
          formVoiceId={this.formVoiceId}
          formSaving={this.formSaving}
          onSubmit={() => this.submitForm()}
          onCancel={() => this.resetForm()}
          onUpdate:formName={(v: string) => { this.formName = v }}
          onUpdate:formAvatar={(v: string) => { this.formAvatar = v }}
          onUpdate:formPersonality={(v: string) => { this.formPersonality = v }}
          onUpdate:formVoiceId={(v: string) => { this.formVoiceId = v }}
        />
      )
    },
  },

  render() {
    const selected = this.selectedPersona()

    return (
      <div class="settings-tab" style="height: 100%; display: flex; flex-direction: column; overflow: hidden;">
        <h3 class="settings-tab__title" style="flex-shrink: 0;">Personas</h3>

        <div class="personas-layout">
          {/* Left: Persona list */}
          <div class="personas-master">
            <div class="personas-master__list">
              {this.personas.map((p: AgentProfile) => {
                const isActive = this.activePersona?.id === p.id
                const isSelected = this.selectedId === p.id
                return (
                  <div key={p.id}
                    class={['personas-card', isSelected && 'personas-card--selected', isActive && 'personas-card--active']}
                    onClick={() => this.selectPersona(p.id)}>
                    <div class="personas-card__avatar">{p.avatar}</div>
                    <div class="personas-card__info">
                      <span class="personas-card__name">
                        {p.name}
                        {isActive && <span class="personas-card__badge">Active</span>}
                      </span>
                    </div>
                    <div class="personas-card__actions">
                      {!isActive && (
                        <button class="personas-card__btn personas-card__btn--switch"
                          onClick={(e: Event) => { e.stopPropagation(); this.onSwitch(p.id) }}
                          title="Switch to this persona">check_circle</button>
                      )}
                      {!p.isDefault && (
                        <button class="personas-card__btn personas-card__btn--delete"
                          onClick={(e: Event) => { e.stopPropagation(); this.onDelete(p.id) }}
                          title="Delete persona">delete</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <button class="personas-add" onClick={() => this.startCreate()}>
              <span class="personas-add__icon">add</span>
              Add Persona
            </button>
          </div>

          {/* Right: Detail panel */}
          <div class="personas-detail">
            {this.showForm && !this.editingId ? (
              this.renderNewForm()
            ) : selected ? (
              <>
                <div class="personas-subtabs">
                  {(['profile', 'prompts', 'facts', 'memory', 'actions'] as const).map((tab) => (
                    <button key={tab}
                      class={['personas-subtab', this.subTab === tab && 'personas-subtab--active']}
                      onClick={() => { this.subTab = tab }}>
                      {{ profile: 'Profile', prompts: 'Prompts', facts: 'Facts', memory: 'Memory', actions: 'Actions' }[tab]}
                    </button>
                  ))}
                </div>
                <div class="personas-subtab-content">
                  {this.subTab === 'profile' && (
                    <ProfileSubTab
                      persona={selected}
                      activePersonaId={this.activePersona?.id ?? undefined}
                      showForm={this.showForm}
                      editingId={this.editingId ?? undefined}
                      formName={this.formName}
                      formAvatar={this.formAvatar}
                      formPersonality={this.formPersonality}
                      formVoiceId={this.formVoiceId}
                      formSaving={this.formSaving}
                      onStartEdit={(p: AgentProfile) => this.startEdit(p)}
                      onSubmit={() => this.submitForm()}
                      onCancel={() => this.resetForm()}
                      onUpdate:formName={(v: string) => { this.formName = v }}
                      onUpdate:formAvatar={(v: string) => { this.formAvatar = v }}
                      onUpdate:formPersonality={(v: string) => { this.formPersonality = v }}
                      onUpdate:formVoiceId={(v: string) => { this.formVoiceId = v }}
                    />
                  )}
                  {this.subTab === 'prompts' && (
                    <PromptsSubTab key={`prompts-${selected.id}`} personaId={selected.id} />
                  )}
                  {this.subTab === 'facts' && (
                    <FactsSubTab key={`facts-${selected.id}`} personaId={selected.id} />
                  )}
                  {this.subTab === 'memory' && (
                    <MemorySubTab key={`memory-${selected.id}`} personaId={selected.id} />
                  )}
                  {this.subTab === 'actions' && (
                    <ActionsSubTab key={`actions-${selected.id}`} personaId={selected.id} />
                  )}
                </div>
              </>
            ) : (
              <div class="personas-detail__empty">
                Select a persona or create a new one
              </div>
            )}
          </div>
        </div>
      </div>
    )
  },
})
