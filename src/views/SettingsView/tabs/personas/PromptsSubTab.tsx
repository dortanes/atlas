import { defineComponent, onMounted } from 'vue'
import { useSettings } from '@/composables/useSettings'
import PromptsTab from '../PromptsTab'

/**
 * PromptsSubTab — prompts editor scoped to a persona.
 */
export default defineComponent({
  name: 'PromptsSubTab',

  props: {
    personaId: { type: String, required: true },
  },

  setup(props) {
    const {
      prompts, activePrompt, promptContent, promptLoading, promptSaving,
      listPrompts, loadPrompt, savePrompt, resetPrompt,
    } = useSettings()

    onMounted(() => listPrompts(props.personaId))

    return {
      prompts, activePrompt, promptContent, promptLoading, promptSaving,
      listPrompts, loadPrompt, savePrompt, resetPrompt,
    }
  },

  render() {
    return (
      <PromptsTab
        prompts={this.prompts}
        activePrompt={this.activePrompt}
        promptContent={this.promptContent}
        promptLoading={this.promptLoading}
        promptSaving={this.promptSaving}
        onSelect={(name: string) => this.loadPrompt(name, this.personaId)}
        onUpdate:content={(v: string) => { this.promptContent = v }}
        onSave={() => this.savePrompt(this.personaId)}
        onReset={() => this.resetPrompt(this.personaId)}
      />
    )
  },
})
