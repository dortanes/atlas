/**
 * Config migration — handles legacy flat config keys.
 *
 * Early versions of Atlas stored settings as flat top-level keys
 * (e.g. `apiKey`, `textModel`). This module migrates them to the
 * current nested structure (e.g. `llm.apiKey`, `llm.textModel`).
 *
 * Run once during loadConfig(). Safe to call on already-migrated configs.
 */

import { createLogger } from '@electron/utils/logger'

const log = createLogger('ConfigMigration')

/**
 * Mapping: old flat key → [nested group, nested key].
 *
 * When adding new migrations, just add entries here.
 */
const FLAT_TO_NESTED: Record<string, [string, string]> = {
  llmProvider:       ['llm', 'provider'],
  apiKey:            ['llm', 'apiKey'],
  baseURL:           ['llm', 'baseURL'],
  textModel:         ['llm', 'textModel'],
  visionModel:       ['llm', 'visionModel'],
  classifierModel:   ['llm', 'classifierModel'],
  geminiModel:       ['llm', 'textModel'],  // legacy name
  ttsProvider:       ['tts', 'provider'],
  ttsApiKey:         ['tts', 'apiKey'],
  ttsVoiceId:        ['tts', 'voiceId'],
  ttsModel:          ['tts', 'model'],
  ttsEnabled:        ['tts', 'enabled'],
  alwaysOnTop:       ['ui', 'alwaysOnTop'],
  positionSide:      ['ui', 'positionSide'],
  openDevTools:      ['ui', 'openDevTools'],
  logLevel:          ['ui', 'logLevel'],
  chatTemperature:   ['generation', 'chatTemperature'],
  chatTopP:          ['generation', 'chatTopP'],
  chatTopK:          ['generation', 'chatTopK'],
  chatMaxTokens:     ['generation', 'chatMaxTokens'],
  visionTemperature: ['generation', 'visionTemperature'],
  visionMaxTokens:   ['generation', 'visionMaxTokens'],
}

/**
 * Migrate old flat config keys to nested structure.
 *
 * Mutates `parsed` in place — moves flat keys into their nested groups
 * and deletes the original flat keys.
 *
 * @param parsed — raw JSON object from config.json
 * @returns The same object with flat keys migrated
 */
export function migrateFlat(parsed: Record<string, unknown>): Record<string, unknown> {
  let migrated = false

  for (const [flatKey, [group, nestedKey]] of Object.entries(FLAT_TO_NESTED)) {
    if (flatKey in parsed && parsed[flatKey] !== undefined) {
      if (!parsed[group] || typeof parsed[group] !== 'object') {
        parsed[group] = {}
      }
      const groupObj = parsed[group] as Record<string, unknown>
      // Only migrate if the nested key is not already set
      if (!(nestedKey in groupObj) || groupObj[nestedKey] === '' || groupObj[nestedKey] === undefined) {
        groupObj[nestedKey] = parsed[flatKey]
      }
      delete parsed[flatKey]
      migrated = true
    }
  }

  if (migrated) {
    log.info('Migrated legacy flat config keys to nested structure')
  }

  return parsed
}
