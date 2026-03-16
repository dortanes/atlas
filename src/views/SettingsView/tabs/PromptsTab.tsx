import { defineComponent, type PropType } from 'vue'

/**
 * PromptsTab — view, edit, and reset .md prompt templates.
 * Horizontal prompt pills + full-width editor.
 */
export default defineComponent({
  name: 'PromptsTab',

  props: {
    prompts: { type: Array as PropType<string[]>, required: true },
    activePrompt: { type: String, required: true },
    promptContent: { type: String, required: true },
    promptLoading: { type: Boolean, default: false },
    promptSaving: { type: Boolean, default: false },
  },

  emits: ['select', 'update:content', 'save', 'reset'],

  render() {
    return (
      <div class="prompts-redesign">
        {/* Warning banner */}
        <div class="prompts-redesign__warning">
          <span class="prompts-redesign__warning-icon">warning</span>
          <span>Editing prompts can significantly alter the agent's behavior. Use "Reset" if something goes wrong.</span>
        </div>

        {/* Horizontal prompt pills */}
        <div class="prompts-redesign__pills">
          {this.prompts.map((name) => (
            <button key={name}
              class={['prompts-redesign__pill', name === this.activePrompt && 'prompts-redesign__pill--active']}
              onClick={() => this.$emit('select', name)}>
              <span class="prompts-redesign__pill-icon">description</span>
              {name}
            </button>
          ))}
        </div>

        {/* Editor */}
        {this.activePrompt ? (
          <div class="prompts-redesign__editor">
            <div class="prompts-redesign__editor-header">
              <span class="prompts-redesign__filename">
                <span class="prompts-redesign__filename-icon">edit_note</span>
                {this.activePrompt}.md
              </span>
              <div class="prompts-redesign__editor-actions">
                <button class="settings-field__button" onClick={() => this.$emit('reset')} disabled={this.promptLoading}>
                  <span class="settings-field__button-icon">restart_alt</span>
                  Reset
                </button>
                <button class="settings-field__button" onClick={() => this.$emit('save')} disabled={this.promptSaving}>
                  <span class="settings-field__button-icon">save</span>
                  {this.promptSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            <textarea class="prompts-redesign__textarea"
              value={this.promptContent}
              onInput={(e: Event) => this.$emit('update:content', (e.target as HTMLTextAreaElement).value)}
              disabled={this.promptLoading}
              placeholder={this.promptLoading ? 'Loading…' : 'Select a prompt to edit'} />
          </div>
        ) : (
          <div class="prompts-redesign__empty">
            <span class="prompts-redesign__empty-icon">touch_app</span>
            <span>Select a prompt from above to view and edit</span>
          </div>
        )}
      </div>
    )
  },
})
