import { defineComponent, ref, onMounted, type Ref } from 'vue'
import './SettingsView.css'
import { useSettings, type AppConfig } from '@/composables/useSettings'
import GeneralTab from './tabs/GeneralTab'
import LLMTab from './tabs/LLMTab'
import VoiceTab from './tabs/VoiceTab'
import AgentTab from './tabs/AgentTab'
import PersonasTab from './tabs/PersonasTab'
import AboutTab from './tabs/AboutTab'

type TabId = 'general' | 'intelligence' | 'voice' | 'agent' | 'personas' | 'about'

interface TabDef {
  id: TabId
  label: string
  icon: string
}

const TABS: TabDef[] = [
  { id: 'general', label: 'General', icon: 'tune' },
  { id: 'intelligence', label: 'Intelligence', icon: 'psychology' },
  { id: 'voice', label: 'Voice', icon: 'graphic_eq' },
  { id: 'agent', label: 'Agent', icon: 'smart_toy' },
  { id: 'personas', label: 'Personas', icon: 'group' },
  { id: 'about', label: 'About', icon: 'info' },
]

/**
 * SettingsView — full-page settings panel.
 *
 * Full-page layout with sidebar navigation, 6 tabs.
 * Auto-saves on change (debounced 800ms).
 */
export default defineComponent({
  name: 'SettingsView',

  props: {
    onClose: {
      type: Function,
      required: true,
    },
  },

  setup(props) {
    const activeTab: Ref<TabId> = ref('general')

    const {
      config,
      loading,
      saving,
      saved,
      loadConfig,
    } = useSettings()

    onMounted(async () => {
      await loadConfig()
    })

    function onUpdate(key: keyof AppConfig, value: unknown) {
      ;(config as Record<string, unknown>)[key] = value
    }

    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        props.onClose()
      }
    }

    return {
      activeTab,
      config,
      loading,
      saving,
      saved,
      onUpdate,
      onKeydown,
    }
  },

  render() {
    return (
      <div class="settings-page" onKeydown={this.onKeydown} tabindex="-1">
        {/* Sidebar */}
        <nav class="settings-nav">
          <button class="settings-nav__back" onClick={() => this.onClose()}>
            <span class="settings-nav__back-icon">arrow_back</span>
            <span>Settings</span>
          </button>

          <div class="settings-nav__tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                class={[
                  'settings-nav__tab',
                  this.activeTab === tab.id && 'settings-nav__tab--active',
                ]}
                onClick={() => { this.activeTab = tab.id }}
              >
                <span class="settings-nav__tab-icon">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Footer: auto-save status */}
          <div class="settings-nav__footer">
            {this.saving && (
              <span class="settings-nav__status settings-nav__status--saving">
                <span class="settings-nav__status-icon">sync</span>
                Saving…
              </span>
            )}
            {this.saved && (
              <span class="settings-nav__status settings-nav__status--saved">
                <span class="settings-nav__status-icon">check_circle</span>
                Saved
              </span>
            )}
          </div>
        </nav>

        {/* Content */}
        <main class="settings-main">
          {this.loading ? (
            <div class="settings-loading">
              <span class="settings-loading__icon">sync</span>
              Loading settings…
            </div>
          ) : (
            <>
              {this.activeTab === 'general' && (
                <GeneralTab config={this.config} onUpdate={this.onUpdate} onClose={() => this.onClose()} />
              )}
              {this.activeTab === 'intelligence' && (
                <LLMTab config={this.config} onUpdate={this.onUpdate} />
              )}
              {this.activeTab === 'voice' && (
                <VoiceTab config={this.config} onUpdate={this.onUpdate} />
              )}
              {this.activeTab === 'agent' && (
                <AgentTab config={this.config} onUpdate={this.onUpdate} />
              )}
              {this.activeTab === 'personas' && (
                <PersonasTab />
              )}
              {this.activeTab === 'about' && (
                <AboutTab onClose={() => this.onClose()} />
              )}
            </>
          )}
        </main>
      </div>
    )
  },
})
