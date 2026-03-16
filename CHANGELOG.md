# Changelog — v0.2.3 (2026-03-16)

## [Added]

- **Local Speech-to-Text** — offline STT via `vosk-browser` with AudioWorklet-based mic capture (`useSTT` composable, `STTService`, `ModelManager`)
- **Wake word activation** — persona-based wake word detection triggers listening automatically
- **ListeningIsland UI** — floating island component showing live transcript during voice input
- **STT model management** — backend download, progress tracking, and per-language model status via `getSTTModelStatus` (now accepts optional `language` parameter)
- **Full-page Settings UI** — new full-page layout with sidebar navigation replaces glass overlay panel
- **VoiceTab** — unified tab combining TTS and STT settings (replaces separate `TTSTab` and `STTTab`)
- **AboutTab** — displays app version, Electron/Chrome/Node runtime versions
- **CustomSelect component** — styled dropdown replacing native `<select>` across all settings tabs
- **EmojiPicker component** — emoji avatar selection for personas (`vue3-emoji-picker` dependency)
- **Per-section reset to defaults** — `settings.resetSection` tRPC endpoint resets individual config sections (`ui`, `llm`, `generation`, `tts`, `stt`, `agent`)
- **`settings.getAppVersion`** — tRPC endpoint returning app name, version, and runtime versions
- **`system.openExternal`** — tRPC endpoint to open URLs in the default browser
- **`forceHideWindow()`** — unconditional window hide in `WindowManager` (used when closing settings without agent)
- **Sound settings** — `soundEnabled` and `soundVolume` fields in `UIConfig` schema and defaults
- **`.gitattributes`** — enforce consistent line endings across the repository

## [Changed]

- **Settings tab structure** — 7 tabs → 6 tabs (`General`, `Intelligence`, `Voice`, `Agent`, `Personas`, `About`); `LLM` renamed to `Intelligence`
- **GeneralTab** — expanded with sound settings, hotkey binding (moved from `HotkeyTab`), and app exit action
- **AgentTab** — redesigned with card-based sections, slider controls, CustomSelect dropdowns
- **LLMTab (Intelligence)** — includes generation settings, model parameters, and section reset button
- **PersonasTab** — redesigned with emoji avatars, card-based persona list, horizontal sub-tab pills
- **PromptsTab** — restyled with horizontal prompt pills, full-width editor, and Material Icons
- **Persona sub-tabs** (`ActionsSubTab`, `FactsSubTab`, `MemorySubTab`) — unified `subtab-card` class system with Material Icons
- **`useSettings` composable** — auto-save via 800ms debounced watcher replaces manual save button
- **`SettingsView.css`** — fully rewritten (~2300+ lines) for the new full-page layout
- **`WindowManager.showWindowForSettings()`** — now positions window on active monitor without emitting agent-visibility events
- **`system.hideWindow`** — calls `forceHideWindow()` instead of `toggleWindow()`
- **`toggleWindow()`** — removed settings-open guard (no longer needed with full-page settings)
- **`App.tsx` / `MainView.tsx`** — updated for settings routing, window lifecycle, and STT integration
- **Multi-monitor screenshots** — `ScreenCapture` and `CoordinateMapper` now target the active display
- **TTS interruption** — `useTTS` properly stops playback when agent is interrupted
- **Agent warning** — dismissible max-steps warning in `InputBar`
- **Command deduplication** — prevents duplicate command submissions in `AgentService`
- **Hidden UI on startup** — main window starts invisible until explicitly shown
- **CSP headers** — updated Content-Security-Policy in `index.html` for audio worklet support

## [Removed]

- **`TTSTab.tsx`** — merged into `VoiceTab`
- **`STTTab.tsx`** — merged into `VoiceTab`
- **`HotkeyTab.tsx`** — hotkey settings moved into `GeneralTab`
- **`setSettingsOpen()` / `settingsOpen`** state tracking in `WindowManager`
- **`notifySettingsOpen`** tRPC endpoint in `system.router`
- **Manual "Save Settings" button** — replaced by auto-save
- Unused `suspendMic` / `resumeMic` functions
- Unused `tts:format` event from `eventBus.ts`

---

# Changelog — v0.2.2 (2026-03-15)

## [Added]

- **File-based log transport** — all log output (`info`, `warn`, `error`, `debug`) is now persisted to `{userData}/Log` with automatic size rotation (5 MB cap, keeps last ~1 MB)
- **Session banners** — `logSessionStart()` / `logSessionEnd()` write visual delimiters (`SESSION START` / `SESSION END`) to the log file for easier request tracing
- **"Open Log File" button** in `GeneralTab` — opens the log file in the default text editor via `settings.openLogFile` RPC
- **Settings-open guard on tray icon** — `WindowManager` tracks settings-open state via `notifySettingsOpen` RPC; tray click no longer collapses the atlas window while settings are visible

## [Changed]

- **`userData` folder naming** — capitalized to match Chromium conventions (`logs` → `Logs`) across `sessionLogger.ts`, `config/index.ts`, `config/schema.ts`, `config/migration.ts`, `PromptLoader.ts`, `FactService.ts`, `MemoryService.ts`, `MemoryTypes.ts`, `PersonaService.ts`
- **`createLogger`** — refactored to separate prefix formatting from output, enabling dual console + file writes
- **`GeneralTab`** — log buttons now share a horizontal row layout
- **`App.tsx`** — emits `notifySettingsOpen` on settings open/close

---

# Changelog — v0.2.1 (2026-03-15)

## [Added]

- **Gemini Context Caching** — `ContextCacheService` with per-persona, per-prompt-type partitions and automatic invalidation on prompt/persona changes
- **Alice TTS** — new `YandexAliceProvider` (no API key required, opus audio format) + `yandex-alice-client` dependency
- **Agent Cursor Overlay** — `AgentCursor` component, `AgentCursor.css`, and `useAgentCursor` composable for real-time animated cursor (move, click, double-click, right-click, type, scroll)
- **`agentUtils.ts`** — shared `buildDynamicContext()` and `requestPermission()` helpers extracted from loops
- **`navigate` action type** — new action type and `url` field in `AgentAction` for in-tab URL navigation
- **`agent:cursor-animation`** event bus channel for real-time action visualization
- **`prompt:saved`** event emitted on prompt save/reset for cache invalidation
- **`onTTSFormat`** subscription in `audio.router` — tells frontend which playback pipeline (mpeg/opus) to use
- **Opus/blob playback pipeline** in `useTTS` alongside existing MSE/mpeg pipeline
- **`hideCursor()`** method on `MotorService` — called on cleanup in `ActionLoop`, `DirectActionLoop`, and `ComputerUseLoop`
- **`isSendKeysTextCommand()`** guard in `DirectActionLoop` blocking WScript `SendKeys` text input
- **PowerShell special-folder resolution** in `ShellController` for OneDrive-redirected paths
- **`onCursorAnimation`** subscription in `agent.router`
- **`CursorAnimation`** interface in `src/types/agent.ts`
- **`<AgentCursor />`** mounted in `MainView.tsx`

## [Changed]

- **`ComputerUseLoop`** — reduced redundant screenshots, dynamic delay scaling, improved retry/backoff logic, smarter stop-condition checks; now receives `searchService` for web search support
- **`DirectActionLoop`** — on action failure, asks LLM for a natural error explanation; blocks `SendKeys` text input → redirects to vision mode
- **`ChatMode`** — uses `buildDynamicContext()` for dynamic context injection and Gemini context caching
- **`TaskPlanner`** — enforces same-language step descriptions matching the user's command language
- **`AgentService`** — stores `searchService` as class field, passes it through to `AgentLoop`; removed direct state transitions from `onPermissionResponse` (now handled inside loops)
- **`AgentLoop`** — passes `searchService` to `ComputerUseLoop`
- **`IntelligenceService`** + all LLM providers (`BaseLLMProvider`, `GeminiProvider`, `OpenAIProvider`) — added `cachedContent` parameter threading through `chat`, `stream`, `chatWithVision`, `chatStructured`, `chatWithVisionStructured`
- **`system.md`** — removed `time` and `user_facts` placeholders (now injected as dynamic context in messages)
- **`computerUseMapper`** — handles `type_text_at` without coordinates by falling back to `type` action
- **`MouseController`** — increased scroll amount for reliable scrolling
- **`KeyboardController`** — improved text input with configurable delays
- **`settings.router`** — prevents stale `activePersonaId` from overwriting persona switch value; emits `prompt:saved` on save/reset
- **`useResponse`** — clears old response when new command starts processing
- **`useSearch`** — clears search results when new command starts processing
- **`TTSTab`** — conditionally hides API key / voice / model fields for Alice
- **Prompts** (`action.md`, `direct_action.md`, `computer_use.md`, `extract_facts.md`, `intent_classifier.md`) — refined instructions for language consistency and action accuracy
- **`TTSService`** — adds `audioFormat` getter, `disposeProvider()` lifecycle, Alice support, `tts:format` emission
- **`README.md`** — minor documentation updates

## [Removed]

- **`alwaysOnTop`** UI config option — removed from `schema.ts`, `defaults.ts`, `migration.ts`, `useSettings.ts`, `GeneralTab.tsx`, `TrayManager.ts`, `WindowManager.ts`, and `settings.router.ts`
