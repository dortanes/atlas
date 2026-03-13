import { defineComponent, type PropType } from 'vue'
import type { AgentProfile } from '@/composables/usePersonas'

/**
 * ProfileSubTab — displays persona info with inline editing.
 */
export default defineComponent({
  name: 'ProfileSubTab',

  props: {
    persona: { type: Object as PropType<AgentProfile>, required: true },
    activePersonaId: { type: String, default: null },
    showForm: { type: Boolean, default: false },
    editingId: { type: String, default: null },
    formName: { type: String, default: '' },
    formAvatar: { type: String, default: '🤖' },
    formPersonality: { type: String, default: '' },
    formVoiceId: { type: String, default: '' },
    formSaving: { type: Boolean, default: false },
  },

  emits: ['startEdit', 'submit', 'cancel', 'update:formName', 'update:formAvatar', 'update:formPersonality', 'update:formVoiceId'],

  methods: {
    renderView() {
      const p = this.persona
      return (
        <div>
          <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
            <div style="font-size: 48px; line-height: 1;">{p.avatar}</div>
            <div style="flex: 1;">
              <div style="font-size: 18px; font-weight: 600; color: oklch(0.95 0 0); display: flex; align-items: center; gap: 8px;">
                {p.name}
                {this.activePersonaId === p.id && <span class="personas-card__badge">Active</span>}
                {p.isDefault && <span class="personas-card__badge personas-card__badge--default">Default</span>}
              </div>
              {p.ttsVoiceId && (
                <div style="font-size: 11px; color: oklch(0.5 0 0); margin-top: 4px;">
                  Voice: {p.ttsVoiceId}
                </div>
              )}
            </div>
            <button
              class="personas-card__btn personas-card__btn--edit"
              onClick={() => this.$emit('startEdit', p)}
              title="Edit persona"
              style="width: 32px; height: 32px; font-size: 20px;"
            >edit</button>
          </div>
          <label class="settings-field">
            <span class="settings-field__label">Personality</span>
            <div style="padding: 12px; background: rgba(255 255 255 / 0.03); border: 1px solid rgba(255 255 255 / 0.06); border-radius: 8px; font-size: 13px; color: oklch(0.8 0 0); line-height: 1.6; white-space: pre-wrap;">
              {p.personality || '(no personality defined)'}
            </div>
          </label>
        </div>
      )
    },

    renderForm() {
      return (
        <div class="personas-form" style="border: none; padding: 0; margin: 0; background: none;">
          <h4 class="personas-form__title">
            {this.editingId ? 'Edit Persona' : 'New Persona'}
          </h4>
          <div class="personas-form__row">
            <label class="settings-field" style="width: 80px; flex-shrink: 0">
              <span class="settings-field__label">Avatar</span>
              <input class="settings-field__input personas-form__avatar-input" value={this.formAvatar}
                onInput={(e: Event) => this.$emit('update:formAvatar', (e.target as HTMLInputElement).value)}
                maxlength={10} placeholder="🤖" />
            </label>
            <label class="settings-field" style="flex: 1">
              <span class="settings-field__label">Name</span>
              <input class="settings-field__input" value={this.formName}
                onInput={(e: Event) => this.$emit('update:formName', (e.target as HTMLInputElement).value)}
                maxlength={50} placeholder="Aria" />
            </label>
          </div>
          <label class="settings-field">
            <span class="settings-field__label">Personality</span>
            <textarea class="settings-field__input personas-form__personality" value={this.formPersonality}
              onInput={(e: Event) => this.$emit('update:formPersonality', (e.target as HTMLTextAreaElement).value)}
              maxlength={2000} placeholder="Describe this persona's personality, tone, and behavior…" rows={4} />
          </label>
          <label class="settings-field">
            <span class="settings-field__label">TTS Voice ID <span style="opacity: 0.5; font-weight: normal">(optional)</span></span>
            <input class="settings-field__input" value={this.formVoiceId}
              onInput={(e: Event) => this.$emit('update:formVoiceId', (e.target as HTMLInputElement).value)}
              maxlength={100} placeholder="Leave empty to use global voice" />
          </label>
          <div class="personas-form__buttons">
            <button class="personas-form__cancel" onClick={() => this.$emit('cancel')}>Cancel</button>
            <button class="personas-form__save" onClick={() => this.$emit('submit')}
              disabled={this.formSaving || !this.formName.trim()}>
              {this.formSaving ? 'Saving…' : (this.editingId ? 'Update' : 'Create')}
            </button>
          </div>
        </div>
      )
    },
  },

  render() {
    if (this.showForm && this.editingId === this.persona.id) {
      return this.renderForm()
    }
    return this.renderView()
  },
})
