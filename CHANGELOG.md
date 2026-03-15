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
