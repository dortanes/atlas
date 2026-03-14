import { defineComponent, ref, onUnmounted } from 'vue'
import './MainView.css'
import AgentOrb from '@/components/agent/AgentOrb'
import ActionIsland from '@/components/islands/ActionIsland'
import WarningIsland from '@/components/islands/WarningIsland'
import PermissionIsland from '@/components/islands/PermissionIsland'
import MicrotaskIsland from '@/components/islands/MicrotaskIsland'
import ResponseIsland from '@/components/islands/ResponseIsland'
import SearchIsland from '@/components/islands/SearchIsland'
import InputBar from '@/components/input/InputBar'
import { useAgent } from '@/composables/useAgent'
import { usePermissions } from '@/composables/usePermissions'
import { useWarnings } from '@/composables/useWarnings'
import { useMicrotasks } from '@/composables/useMicrotasks'
import { useResponse } from '@/composables/useResponse'
import { useSearch } from '@/composables/useSearch'
import { useAccentColor } from '@/composables/useAccentColor'
import { useSounds } from '@/composables/useSounds'
import { useTTS } from '@/composables/useTTS'
import { api } from '@/api'

/**
 * MainView — primary layout container.
 *
 * Layout (top → bottom):
 *   Notifications → spacer → Task Queue → Orb → InputBar (on demand)
 *
 * Click-through: transparent areas pass clicks to the desktop.
 * Keyboard shortcut: "/" or "Ctrl+K" toggles InputBar.
 *
 * All business logic comes from composables — this component
 * is purely a layout orchestrator.
 */
export default defineComponent({
  name: 'MainView',

  setup() {
    /* ── Composables (intermediate I/O layer) ── */
    const { state: agentState, currentAction, sendCommand } = useAgent()
    const { permissions, respond: respondPermission } = usePermissions()
    const { warnings, dismiss: dismissWarning } = useWarnings()
    const { tasks, setTasks, progressPercent, progressLabel } = useMicrotasks()
    const { response, dismissing: responseDismissing, dismiss: dismissResponse } = useResponse()
    const { searchData, dismissing: searchDismissing, dismiss: dismissSearch, clear: clearSearch, openFile, revealFile } = useSearch()

    /* ── UI Position (from config, reactive) ── */
    const positionSide = ref<'left' | 'right' | 'center'>('right')

    // Load initial position
    api.settings.getConfig.query().then((cfg) => {
      positionSide.value = cfg.ui.positionSide || 'right'
    })

    // Subscribe to config changes for live position updates
    const configSub = api.settings.onConfigChange.subscribe(undefined, {
      onData(cfg) {
        positionSide.value = cfg.ui.positionSide || 'right'
      },
    })

    /* ── Click-through toggle (via tRPC mutation) ── */
    function onMouseEnterUI() {
      api.system.setIgnoreMouseEvents.mutate({ ignore: false })
    }
    function onMouseLeaveUI() {
      api.system.setIgnoreMouseEvents.mutate({ ignore: true, forward: true })
    }

    /* ── OS Accent Color (smooth animated via tRPC subscription) ── */
    useAccentColor()

    /* ── Sound Effects ── */
    const sfx = useSounds()

    /* ── TTS Audio Playback (MSE streaming) ── */
    useTTS()

    /* ── Agent Visibility (toggled from tray or Ctrl+Space) ── */
    const agentVisible = ref(true)
    let isFirstVisibilityEvent = true

    const visibilitySub = api.system.onAgentVisibility.subscribe(undefined, {
      onData(visible: boolean) {
        // Skip the initial `true` emitted on subscription connect —
        // it's not a real toggle, so no sound or state change needed.
        if (isFirstVisibilityEvent) {
          isFirstVisibilityEvent = false
          return
        }
        agentVisible.value = visible
        if (visible) {
          sfx.activate()
          inputDismissing.value = false
          showInput.value = true
        } else {
          sfx.deactivate()
          // If agent is idle, clear the response and task queue
          if (agentState.value === 'idle') {
            dismissResponse()
            setTasks([])
            clearSearch()
          } else {
            // Agent is busy — just stop TTS, keep the response visible
            api.audio.stopSpeaking.mutate().catch(() => {})
          }
          setTimeout(() => {
            inputDismissing.value = false
            showInput.value = false
          }, 300)
        }
      },
    })

    onUnmounted(() => visibilitySub.unsubscribe())

    /* ── InputBar visibility ── */
    const showInput = ref(false)
    const inputDismissing = ref(false)

    function toggleInput() {
      if (inputDismissing.value) return
      if (showInput.value) {
        closeInput()
      } else {
        showInput.value = true
      }
    }
    function closeInput() {
      if (!showInput.value || inputDismissing.value) return
      inputDismissing.value = true
      setTimeout(() => {
        showInput.value = false
        inputDismissing.value = false
      }, 300)
    }

    /* ── Permission dismiss animation ── */
    const permissionDismissing = ref(false)

    function onPermissionRespond(id: string, allowed: boolean) {
      permissionDismissing.value = true
      setTimeout(() => {
        respondPermission(id, allowed)
        permissionDismissing.value = false
      }, 400)
    }

    /* ── Warning dismiss animation ── */
    const warningDismissing = ref(false)

    function onWarningDismiss(id: string) {
      warningDismissing.value = true
      setTimeout(() => {
        dismissWarning(id)
        warningDismissing.value = false
      }, 400)
    }

    /* ── Escape key — close InputBar or hide Atlas ── */
    function onEscapeKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (!agentVisible.value) return
      if (showInput.value) {
        closeInput()
      } else {
        api.system.hideWindow.mutate()
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onEscapeKey)
    }

    /* ── Sound effects for agent state transitions ── */
    let prevState = 'idle'
    const stateSoundSub = api.agent.onStateChange.subscribe(undefined, {
      onData(data: { state: string }) {
        if (data.state === 'processing' && prevState === 'idle') {
          sfx.processing()
        } else if (data.state === 'idle' && (prevState === 'processing' || prevState === 'acting')) {
          sfx.responseReady()
          // Auto-show InputBar for follow-up questions
          if (agentVisible.value) {
            setTimeout(() => {
              inputDismissing.value = false
              showInput.value = true
            }, 1500)
          }
        } else if (data.state === 'warning') {
          sfx.warning()
        }
        prevState = data.state
      },
    })

    onUnmounted(() => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onEscapeKey)
      }
      stateSoundSub.unsubscribe()
      configSub.unsubscribe()
    })

    return {
      agentVisible,
      agentState,
      currentAction,
      sendCommand,
      permissions,
      warnings,
      tasks,
      setTasks,
      progressPercent,
      progressLabel,
      response,
      responseDismissing,
      dismissResponse,
      searchData,
      searchDismissing,
      dismissSearch,
      onMouseEnterUI,
      onMouseLeaveUI,
      showInput,
      inputDismissing,
      toggleInput,
      closeInput,
      permissionDismissing,
      onPermissionRespond,
      warningDismissing,
      onWarningDismiss,
      positionSide,
      openFile,
      revealFile,
    }
  },

  render() {
    const firstPermission = this.permissions[0] ?? null
    const firstWarning = this.warnings[0] ?? null

    return (
      <div class={['main-view', `main-view--${this.positionSide}`]}>

        <div class={['main-view__stack', !this.agentVisible && 'main-view__stack--hidden']}>
          {/* Notifications — priority ordered */}
          <div
            class="main-view__islands"
            onMouseenter={this.onMouseEnterUI}
            onMouseleave={this.onMouseLeaveUI}
          >
            {/* P1: Permission — requires immediate user action */}
            {firstPermission && (
              <div class={this.permissionDismissing ? 'animate-island-dismiss' : ''}>
                <PermissionIsland
                  message={firstPermission.message}
                  onAllow={() => this.onPermissionRespond(firstPermission.id, true)}
                  onDeny={() => this.onPermissionRespond(firstPermission.id, false)}
                />
              </div>
            )}
            {/* P2: Warning — urgent information */}
            {firstWarning && (
              <div class={this.warningDismissing ? 'animate-island-dismiss' : ''}>
                <WarningIsland
                  message={firstWarning.message}
                  dismissable={firstWarning.dismissable}
                  onDismiss={() => this.onWarningDismiss(firstWarning.id)}
                />
              </div>
            )}
            {/* P3: Action — current task progress */}
            {this.currentAction && (
              <ActionIsland action={this.currentAction} />
            )}
          </div>

          {/* Agent context — response + task queue above orb */}
          <div
            class="main-view__agent-context"
            onMouseenter={this.onMouseEnterUI}
            onMouseleave={this.onMouseLeaveUI}
          >
            {/* Response / Thoughts — above task queue */}
            {this.response && (
              <div
                class={this.responseDismissing ? 'animate-island-dismiss' : ''}
                style="display: flex; flex: 0 1 auto; min-height: 0;"
              >
                <ResponseIsland
                  response={this.response}
                  onDismiss={this.dismissResponse}
                />
              </div>
            )}

            {/* Search results — between response and task queue */}
            {this.searchData && (
              <div class={this.searchDismissing ? 'animate-island-dismiss' : ''}>
                <SearchIsland
                  type={this.searchData.type}
                  query={this.searchData.query}
                  results={this.searchData.results}
                  fileResults={this.searchData.fileResults}
                  searching={this.searchData.searching}
                  onDismiss={this.dismissSearch}
                  onOpenFile={(path: string) => this.openFile(path)}
                  onRevealFile={(path: string) => this.revealFile(path)}
                />
              </div>
            )}
            <MicrotaskIsland
              tasks={this.tasks}
              progressPercent={this.progressPercent}
              progressLabel={this.progressLabel}
              onDismiss={() => this.setTasks([])}
            />
          </div>

          {/* Orb — reflects agent state; click toggles InputBar */}
          <div
            class="main-view__orb-area animate-orb-in"
            onClick={this.toggleInput}
            onMouseenter={this.onMouseEnterUI}
            onMouseleave={this.onMouseLeaveUI}
          >
            <AgentOrb state={this.agentState} />
            <span class="main-view__state-label">{this.agentState}</span>
          </div>

          {/* Input Bar — always in DOM for smooth height transition */}
          <div
            class={['main-view__input-area', (!this.showInput || this.inputDismissing) && 'main-view__input-area--collapsed']}
            onMouseenter={this.onMouseEnterUI}
            onMouseleave={this.onMouseLeaveUI}
          >
            {this.showInput && (
              <InputBar
                visible={!this.inputDismissing}
                onClose={this.closeInput}
                onSubmit={(text: string) => {
                  this.sendCommand(text)
                }}
              />
            )}
          </div>
        </div>
      </div>
    )
  },
})
