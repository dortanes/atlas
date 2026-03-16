import { defineComponent, ref, Teleport, nextTick, onMounted, onBeforeUnmount } from 'vue'
import EmojiPicker from 'vue3-emoji-picker'
import 'vue3-emoji-picker/css'

/**
 * EmojiSelect — thin wrapper around vue3-emoji-picker.
 * Shows current emoji as trigger, opens picker in Teleport popover.
 */
export default defineComponent({
  name: 'EmojiSelect',

  props: {
    modelValue: { type: String, default: '🤖' },
  },

  emits: ['update:modelValue'],

  setup(props, { emit }) {
    const isOpen = ref(false)
    const triggerRef = ref<HTMLElement | null>(null)
    const pickerRef = ref<HTMLElement | null>(null)
    const pickerStyle = ref<Record<string, string>>({})

    function positionPicker() {
      if (!triggerRef.value) return
      const rect = triggerRef.value.getBoundingClientRect()
      pickerStyle.value = {
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        zIndex: '9999',
      }
    }

    async function toggle() {
      isOpen.value = !isOpen.value
      if (isOpen.value) {
        await nextTick()
        positionPicker()
      }
    }

    function onSelect(emoji: { i: string }) {
      emit('update:modelValue', emoji.i)
      isOpen.value = false
    }

    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.value?.contains(target)) return
      if (pickerRef.value?.contains(target)) return
      isOpen.value = false
    }

    onMounted(() => document.addEventListener('mousedown', onClickOutside))
    onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside))

    return { isOpen, triggerRef, pickerRef, pickerStyle, toggle, onSelect }
  },

  render() {
    return (
      <div style="display: inline-flex;">
        <button class="emoji-select__trigger" type="button" ref="triggerRef" onClick={this.toggle}>
          <span style="font-size: 24px; line-height: 1;">{this.modelValue}</span>
          <span class="emoji-select__arrow">expand_more</span>
        </button>

        {this.isOpen && (
          <Teleport to="body">
            <div ref="pickerRef" style={this.pickerStyle}>
              <EmojiPicker
                native={true}
                theme="dark"
                onSelect={this.onSelect}
                disable-skin-tones={true}
              />
            </div>
          </Teleport>
        )}
      </div>
    )
  },
})
