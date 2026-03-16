import { defineComponent, ref, onUnmounted } from 'vue'
import MainView from '@/views/MainView'
import SettingsView from '@/views/SettingsView'
import { api } from '@/api'

/**
 * App — root application component.
 *
 * Routes between MainView (agent overlay) and SettingsView (settings panel).
 * Settings are opened via tray menu → tRPC subscription.
 */
export default defineComponent({
  name: 'App',

  setup() {
    const view = ref<'main' | 'settings'>('main')
    const agentIsVisible = ref(false)
    let agentWasVisibleBeforeSettings = false

    // Track real agent visibility from backend
    const visibilitySub = api.system.onAgentVisibility.subscribe(undefined, {
      onData(visible: boolean) {
        agentIsVisible.value = visible
      },
    })

    // Listen for "open settings" events from tray
    const settingsSub = api.system.onOpenSettings.subscribe(undefined, {
      onData() {
        // Snapshot agent visibility BEFORE opening settings
        agentWasVisibleBeforeSettings = agentIsVisible.value
        // Disable click-through so user can interact with settings
        api.system.setIgnoreMouseEvents.mutate({ ignore: false })
        view.value = 'settings'
      },
    })

    function closeSettings() {
      view.value = 'main'
      // Re-enable click-through for overlay mode
      api.system.setIgnoreMouseEvents.mutate({ ignore: true, forward: true })
      // If agent wasn't visible before settings, hide the window
      if (!agentWasVisibleBeforeSettings) {
        api.system.hideWindow.mutate()
      }
    }

    onUnmounted(() => {
      settingsSub.unsubscribe()
      visibilitySub.unsubscribe()
    })

    return { view, closeSettings }
  },

  render() {
    if (this.view === 'settings') {
      return <SettingsView onClose={this.closeSettings} />
    }
    return <MainView />
  },
})
