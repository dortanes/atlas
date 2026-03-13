import { defineComponent } from 'vue'
import './GlassInput.css'

/**
 * GlassInput — text input with frosted-glass styling.
 *
 * Supports v-model via `modelValue` prop and `update:modelValue` emit.
 */
export default defineComponent({
  name: 'GlassInput',

  props: {
    modelValue: {
      type: String,
      default: '',
    },
    placeholder: {
      type: String,
      default: '',
    },
    class: {
      type: String,
      default: '',
    },
  },

  emits: ['update:modelValue', 'submit'],

  methods: {
    onInput(e: Event) {
      const target = e.target as HTMLInputElement
      this.$emit('update:modelValue', target.value)
    },

    onKeydown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        this.$emit('submit')
      }
    },
  },

  render() {
    return (
      <input
        type="text"
        value={this.modelValue}
        placeholder={this.placeholder}
        class={['glass-input', this.class].filter(Boolean).join(' ')}
        onInput={this.onInput}
        onKeydown={this.onKeydown}
      />
    )
  },
})
