import { defineComponent, type SlotsType } from 'vue'

/**
 * GlassPanel — base glass container component.
 *
 * Renders a frosted-glass div with configurable padding and optional CSS class.
 * All child content is passed via the default slot.
 */
export default defineComponent({
  name: 'GlassPanel',

  props: {
    /** Additional CSS classes */
    class: {
      type: String,
      default: '',
    },
    /** HTML tag to render */
    tag: {
      type: String,
      default: 'div',
    },
  },

  slots: Object as SlotsType<{
    default: () => any
  }>,

  render() {
    const Tag = this.tag as any

    return (
      <Tag class={['glass', this.class].filter(Boolean).join(' ')}>
        {this.$slots.default?.()}
      </Tag>
    )
  },
})
