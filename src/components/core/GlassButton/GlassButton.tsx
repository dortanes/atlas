import { defineComponent, type PropType, type SlotsType } from 'vue'
import './GlassButton.css'

/** Supported button visual variants */
export type GlassButtonVariant = 'primary' | 'danger' | 'ghost'

/**
 * GlassButton — button with glass styling and DaisyUI integration.
 *
 * Provides three visual variants:
 * - `primary`  — accent-colored glow
 * - `danger`   — red-tinted glow
 * - `ghost`    — transparent, subtle hover
 */
export default defineComponent({
  name: 'GlassButton',

  props: {
    variant: {
      type: String as PropType<GlassButtonVariant>,
      default: 'ghost',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    class: {
      type: String,
      default: '',
    },
  },

  emits: ['click'],

  slots: Object as SlotsType<{
    default: () => any
  }>,

  computed: {
    variantClasses(): string {
      const map: Record<GlassButtonVariant, string> = {
        primary: 'glass-btn glass-btn--primary',
        danger: 'glass-btn glass-btn--danger',
        ghost: 'glass-btn glass-btn--ghost',
      }
      return map[this.variant]
    },
  },

  render() {
    return (
      <button
        class={[this.variantClasses, this.class].filter(Boolean).join(' ')}
        disabled={this.disabled}
        onClick={(e: MouseEvent) => this.$emit('click', e)}
      >
        {this.$slots.default?.()}
      </button>
    )
  },
})
