import { defineComponent, ref, nextTick, onMounted } from 'vue'
import GlassInput from '@/components/core/GlassInput'
import './InputBar.css'

/**
 * InputBar — text command input, shown on demand.
 *
 * - No voice mode (orb handles listening state)
 * - Emits 'submit' when user presses Enter
 * - Emits 'close' when user presses Escape or submits
 */
export default defineComponent({
  name: 'InputBar',

  props: {
    visible: {
      type: Boolean,
      default: true,
    },
  },

  emits: ['submit', 'close'],

  setup(props, { emit }) {
    const inputText = ref('')
    const inputRef = ref<HTMLInputElement | null>(null)

    function onSubmit() {
      if (inputText.value.trim()) {
        emit('submit', inputText.value.trim())
        inputText.value = ''
      }
      emit('close')
    }

    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        inputText.value = ''
        emit('close')
      }
    }

    function focusInput() {
      nextTick(() => {
        // inputRef is the GlassInput component instance
        // Access the underlying <input> via $el
        const el = inputRef.value as any
        if (el?.$el) {
          el.$el.focus()
        } else if (el?.focus) {
          el.focus()
        }
      })
    }

    // Auto-focus when mounted
    onMounted(focusInput)

    return { inputText, inputRef, onSubmit, onKeydown, focusInput }
  },

  render() {
    return (
      <div
        class={['input-bar glass-pill', this.visible ? 'animate-slide-up' : 'animate-slide-down']}
        onKeydown={this.onKeydown}
      >
        <div class="input-bar__text">
          <GlassInput
            ref="inputRef"
            modelValue={this.inputText}
            placeholder="Type a command..."
            class="input-bar__input"
            onUpdate:modelValue={(v: string) => (this.inputText = v)}
            onSubmit={this.onSubmit}
          />
          <button
            class="input-bar__submit-btn"
            onClick={this.onSubmit}
            title="Send command"
          >
            <span class="island__icon">arrow_upward</span>
          </button>
        </div>
      </div>
    )
  },
})
