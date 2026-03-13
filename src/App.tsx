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

    // Listen for "open settings" events from tray
    const settingsSub = api.system.onOpenSettings.subscribe(undefined, {
      onData() {
        // Disable click-through so user can interact with settings
        api.system.setIgnoreMouseEvents.mutate({ ignore: false })
        view.value = 'settings'
      },
    })

    function closeSettings() {
      view.value = 'main'
      // Re-enable click-through for overlay mode
      api.system.setIgnoreMouseEvents.mutate({ ignore: true, forward: true })
    }

    onUnmounted(() => settingsSub.unsubscribe())

    return { view, closeSettings }
  },

  render() {
    if (this.view === 'settings') {
      return <SettingsView onClose={this.closeSettings} />
    }
    return <MainView />
  },
})
