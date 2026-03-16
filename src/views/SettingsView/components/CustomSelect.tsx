import { defineComponent, ref, onMounted, onBeforeUnmount, Teleport, nextTick, type PropType } from 'vue'

export interface SelectOption {
  value: string
  label: string
}

/**
 * CustomSelect — fully styled dropdown replacement for native <select>.
 *
 * Uses Teleport to render dropdown in <body> to avoid overflow clipping.
 * Positions dropdown relative to trigger via getBoundingClientRect().
 * Handles keyboard nav (↑↓ Enter Escape), click-outside close.
 */
export default defineComponent({
  name: 'CustomSelect',

  props: {
    modelValue: { type: String, default: '' },
    options: { type: Array as PropType<SelectOption[]>, required: true },
    placeholder: { type: String, default: 'Select…' },
  },

  emits: ['update:modelValue'],

  setup(props, { emit }) {
    const isOpen = ref(false)
    const triggerRef = ref<HTMLElement | null>(null)
    const dropdownRef = ref<HTMLElement | null>(null)
    const focusedIndex = ref(-1)
    const dropdownStyle = ref<Record<string, string>>({})

    function positionDropdown() {
      if (!triggerRef.value) return
      const rect = triggerRef.value.getBoundingClientRect()
      dropdownStyle.value = {
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        minWidth: `${rect.width}px`,
        zIndex: '9999',
      }
    }

    async function toggle() {
      isOpen.value = !isOpen.value
      if (isOpen.value) {
        focusedIndex.value = props.options.findIndex((o) => o.value === props.modelValue)
        await nextTick()
        positionDropdown()
      }
    }

    function close() {
      isOpen.value = false
    }

    function select(val: string) {
      emit('update:modelValue', val)
      close()
    }

    function onKeydown(e: KeyboardEvent) {
      if (!isOpen.value && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
        e.preventDefault()
        toggle()
        return
      }
      if (!isOpen.value) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          focusedIndex.value = Math.min(focusedIndex.value + 1, props.options.length - 1)
          break
        case 'ArrowUp':
          e.preventDefault()
          focusedIndex.value = Math.max(focusedIndex.value - 1, 0)
          break
        case 'Enter':
          e.preventDefault()
          if (focusedIndex.value >= 0 && focusedIndex.value < props.options.length) {
            select(props.options[focusedIndex.value].value)
          }
          break
        case 'Escape':
          e.preventDefault()
          close()
          break
      }
    }

    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.value?.contains(target)) return
      if (dropdownRef.value?.contains(target)) return
      close()
    }

    onMounted(() => document.addEventListener('mousedown', onClickOutside))
    onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside))

    return { isOpen, triggerRef, dropdownRef, focusedIndex, dropdownStyle, toggle, select, close, onKeydown }
  },

  render() {
    const selected = this.options.find((o) => o.value === this.modelValue)

    return (
      <div
        class={['custom-select', this.isOpen && 'custom-select--open']}
        tabindex={0}
        onKeydown={this.onKeydown}
      >
        <button class="custom-select__trigger" type="button" ref="triggerRef" onClick={this.toggle}>
          <span class={['custom-select__label', !selected && 'custom-select__label--placeholder']}>
            {selected?.label || this.placeholder}
          </span>
          <span class="custom-select__arrow">expand_more</span>
        </button>

        {this.isOpen && (
          <Teleport to="body">
            <div class="custom-select__dropdown" ref="dropdownRef" style={this.dropdownStyle}>
              {this.options.map((opt, i) => (
                <div
                  key={opt.value}
                  class={[
                    'custom-select__option',
                    opt.value === this.modelValue && 'custom-select__option--active',
                    i === this.focusedIndex && 'custom-select__option--focused',
                  ]}
                  onClick={() => this.select(opt.value)}
                  onMouseenter={() => { this.focusedIndex = i }}
                >
                  {opt.label}
                  {opt.value === this.modelValue && (
                    <span class="custom-select__check">check</span>
                  )}
                </div>
              ))}
            </div>
          </Teleport>
        )}
      </div>
    )
  },
})
