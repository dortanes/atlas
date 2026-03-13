import { defineComponent, type PropType } from 'vue'

/**
 * PromptsTab — view, edit, and reset .md prompt templates.
 */
export default defineComponent({
  name: 'PromptsTab',

  props: {
    prompts: {
      type: Array as PropType<string[]>,
      required: true,
    },
    activePrompt: {
      type: String,
      required: true,
    },
    promptContent: {
      type: String,
      required: true,
    },
    promptLoading: {
      type: Boolean,
      default: false,
    },
    promptSaving: {
      type: Boolean,
      default: false,
    },
  },

  emits: ['select', 'update:content', 'save', 'reset'],

  render() {
    return (
      <div class="settings-tab settings-tab--prompts">
        <h3 class="settings-tab__title">Prompt Editor</h3>

        <div class="settings-prompts__warning">
          <span class="settings-prompts__warning-icon">warning</span>
          <p>Editing prompts can significantly alter the agent's behavior. Incorrect changes may cause errors, unexpected actions, or break safety guardrails. Use "Reset to Default" if something goes wrong.</p>
        </div>

        <div class="settings-prompts">
          {/* Prompt list */}
          <div class="settings-prompts__list">
            {this.prompts.map((name) => (
              <button
                key={name}
                class={[
                  'settings-prompts__item',
                  name === this.activePrompt && 'settings-prompts__item--active',
                ]}
                onClick={() => this.$emit('select', name)}
              >
                {name}.md
              </button>
            ))}
          </div>

          {/* Editor */}
          <div class="settings-prompts__editor">
            {this.activePrompt ? (
              <>
                <div class="settings-prompts__header">
                  <span class="settings-prompts__filename">{this.activePrompt}.md</span>
                  <div class="settings-prompts__actions">
                    <button
                      class="settings-prompts__btn settings-prompts__btn--reset"
                      onClick={() => this.$emit('reset')}
                      disabled={this.promptLoading}
                    >
                      Reset to Default
                    </button>
                    <button
                      class="settings-prompts__btn settings-prompts__btn--save"
                      onClick={() => this.$emit('save')}
                      disabled={this.promptSaving}
                    >
                      {this.promptSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
                <textarea
                  class="settings-prompts__textarea"
                  value={this.promptContent}
                  onInput={(e: Event) =>
                    this.$emit('update:content', (e.target as HTMLTextAreaElement).value)
                  }
                  disabled={this.promptLoading}
                  placeholder={this.promptLoading ? 'Loading…' : 'Select a prompt to edit'}
                />
              </>
            ) : (
              <div class="settings-prompts__empty">
                Select a prompt from the list to edit
              </div>
            )}
          </div>
        </div>
      </div>
    )
  },
})
