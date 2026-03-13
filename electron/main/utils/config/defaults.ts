/**
 * Config defaults — factory defaults for all config sections.
 *
 * Used on first launch and as fallbacks when loading a saved config
 * that may be missing newly-added fields.
 */

import { app } from 'electron'
import type { AppConfig } from './schema'

export const defaultConfig: AppConfig = {
  ui: {
    alwaysOnTop: true,
    positionSide: 'right',
    openDevTools: !app.isPackaged,
    logLevel: 'debug',
  },
  llm: {
    provider: 'gemini',
    baseURL: 'http://localhost:1234/v1',
    apiKey: '',
    textModel: 'gemini-3.1-flash-lite-preview',
    visionModel: '',
    classifierModel: '',
  },
  generation: {
    chatTemperature: 0.7,
    chatTopP: 0.95,
    chatTopK: 40,
    chatMaxTokens: 2048,
    visionTemperature: 0.2,
    visionMaxTokens: 1024,
  },
  tts: {
    provider: 'elevenlabs',
    apiKey: '',
    voiceId: 'JBFqnCBsd6RMkjVDRZzb',
    model: 'eleven_flash_v2_5',
    enabled: true,
  },
  agent: {
    maxIterations: 15,
    maxConsecutiveFailures: 3,
    preActionDelay: 200,
    postActionDelay: 800,
    maxContextMessages: 40,
    commandTimeout: 30_000,
    screenshotMaxWidth: 1280,
    screenshotQuality: 80,
    thoughtsTransitionDelay: 500,
    streamWordsPerChunk: 3,
    streamChunkDelay: 30,
  },
  hotkey: 'Ctrl+Space',
  activePersonaId: 'atlas-default',
}
