import { defineComponent } from 'vue'
import GlassPanel from '@/components/core/GlassPanel'
import GlassButton from '@/components/core/GlassButton'
import './PermissionIsland.css'

/**
 * PermissionIsland — permission request for dangerous operations.
 *
 * Shows a description of the action requiring approval with
 * Allow / Deny buttons. Appears as a separate island.
 */
export default defineComponent({
  name: 'PermissionIsland',

  props: {
    message: {
      type: String,
      required: true,
    },
  },

  emits: ['allow', 'deny'],

  render() {
    return (
      <GlassPanel class="island island--permission animate-float-in">
        <div class="island__header island__header--permission">
          <span class="island__icon">lock</span>
          <span class="island__title">Permission Required</span>
        </div>

        <div class="island__body">
          <p class="island__label">{this.message}</p>

          <div class="island__actions">
            <GlassButton
              variant="primary"
              onClick={() => this.$emit('allow')}
            >
              Allow
            </GlassButton>
            <GlassButton
              variant="danger"
              onClick={() => this.$emit('deny')}
            >
              Deny
            </GlassButton>
          </div>
        </div>
      </GlassPanel>
    )
  },
})
