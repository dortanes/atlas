/**
 * AgentProfile — data model for a persona (agent identity).
 *
 * Each persona has a unique name, avatar emoji, personality description,
 * and optionally overridden prompts stored in its own directory.
 */
export interface AgentProfile {
  /** Unique identifier (UUID or well-known slug like 'atlas-default') */
  id: string
  /** Display name ("Atlas", "Aria", …) */
  name: string
  /** Single emoji used as avatar */
  avatar: string
  /** Personality description injected into the system prompt */
  personality: string
  /** Optional TTS voice ID override (falls back to global config if empty) */
  ttsVoiceId?: string
  /** ISO timestamp */
  createdAt: string
  /** True only for the built-in "Atlas" persona (cannot be deleted) */
  isDefault: boolean
}

/** The built-in default persona that ships with the app */
export const DEFAULT_PERSONA: AgentProfile = {
  id: 'atlas-default',
  name: 'Atlas',
  avatar: '🛸',
  personality:
    'You are helpful, concise, and proactive.\n' +
    'You speak naturally, not in a robotic manner.\n' +
    'You explain what you are doing before and after acting.\n' +
    'When unsure, you ask clarifying questions rather than guess.',
  createdAt: new Date(0).toISOString(),
  isDefault: true,
}
