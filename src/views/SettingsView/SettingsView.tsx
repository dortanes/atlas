import { defineComponent, ref, onMounted, type Ref } from 'vue'
import './SettingsView.css'
import { useSettings, type AppConfig } from '@/composables/useSettings'
import GeneralTab from './tabs/GeneralTab'
import LLMTab from './tabs/LLMTab'
import TTSTab from './tabs/TTSTab'
import HotkeyTab from './tabs/HotkeyTab'
import AgentTab from './tabs/AgentTab'
import PersonasTab from './tabs/PersonasTab'

type TabId = 'general' | 'llm' | 'tts' | 'hotkey' | 'agent' | 'personas'

interface TabDef {
  id: TabId
  label: string
  icon: string
}

const TABS: TabDef[] = [
  { id: 'general', label: 'General', icon: 'tune' },
  { id: 'llm', label: 'LLM', icon: 'psychology' },
  { id: 'tts', label: 'TTS', icon: 'record_voice_over' },
  { id: 'agent', label: 'Agent', icon: 'smart_toy' },
  { id: 'hotkey', label: 'Hotkey', icon: 'keyboard' },
  { id: 'personas', label: 'Personas', icon: 'group' },
]

/**
 * SettingsView — full-screen overlay settings panel.
 *
 * Tabbed layout with glass styling. Each tab is a separate component.
 * Per-persona entities (Prompts, Facts, Memory) are managed inside PersonasTab.
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
      saveConfig,
    } = useSettings()

    onMounted(async () => {
      await loadConfig()
    })

    function onUpdate(key: keyof AppConfig, value: any) {
      ;(config as any)[key] = value
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
      saveConfig,
      onUpdate,
      onKeydown,
    }
  },

  render() {
    return (
      <div class="settings-overlay" onKeydown={this.onKeydown}>
        <div class="settings-panel glass">
          {/* Header */}
          <div class="settings-header">
            <h2 class="settings-header__title">Settings</h2>
            <button class="settings-header__close" onClick={() => this.onClose()}>✕</button>
          </div>

          <div class="settings-body">
            {/* Sidebar tabs */}
            <nav class="settings-sidebar">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  class={[
                    'settings-sidebar__tab',
                    this.activeTab === tab.id && 'settings-sidebar__tab--active',
                  ]}
                  onClick={() => { this.activeTab = tab.id }}
                >
                  <span class="settings-sidebar__icon">{tab.icon}</span>
                  <span class="settings-sidebar__label">{tab.label}</span>
                </button>
              ))}
            </nav>

            {/* Tab content */}
            <div class="settings-content">
              {this.loading ? (
                <div class="settings-loading">Loading…</div>
              ) : (
                <>
                  {this.activeTab === 'general' && (
                    <GeneralTab config={this.config} onUpdate={this.onUpdate} />
                  )}
                  {this.activeTab === 'llm' && (
                    <LLMTab config={this.config} onUpdate={this.onUpdate} />
                  )}
                  {this.activeTab === 'tts' && (
                    <TTSTab config={this.config} onUpdate={this.onUpdate} />
                  )}
                  {this.activeTab === 'hotkey' && (
                    <HotkeyTab config={this.config} onUpdate={this.onUpdate} />
                  )}
                  {this.activeTab === 'agent' && (
                    <AgentTab config={this.config} onUpdate={this.onUpdate} />
                  )}
                  {this.activeTab === 'personas' && (
                    <PersonasTab />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Footer — save button */}
          <div class="settings-footer">
            {this.saved && <span class="settings-footer__saved">✓ Saved</span>}
            <button
              class="settings-footer__save"
              onClick={() => this.saveConfig()}
              disabled={this.saving}
            >
              {this.saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    )
  },
})
