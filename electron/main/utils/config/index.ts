/**
 * Config module — persistent app settings with load/save.
 *
 * Public API:
 * - `loadConfig()` — reads config.json from userData, merges with defaults
 * - `saveConfig(partial)` — merges partial updates, writes to disk
 * - `getConfig()` — returns current in-memory config (singleton)
 *
 * First launch: file doesn't exist → defaults are used and saved.
 *
 * Re-exports all types from schema for convenience:
 * ```ts
 * import { getConfig, type AppConfig } from '@electron/utils/config'
 * ```
 */

import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createLogger } from '@electron/utils/logger'
import type { AppConfig, DeepPartial } from './schema'
import { defaultConfig } from './defaults'
import { migrateFlat } from './migration'

const log = createLogger('Config')

// ── Re-exports ──
export type { AppConfig, UIConfig, LLMConfig, GenerationConfig, TTSConfig, AgentConfig, DeepPartial } from './schema'
export { defaultConfig } from './defaults'

// ── Singleton ──

let currentConfig: AppConfig = structuredClone(defaultConfig)

/** Path to config.json in userData */
function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

/** Deep-merge source into target (two-level deep for nested groups) */
function merge(target: AppConfig, source: DeepPartial<AppConfig>): AppConfig {
  const result = { ...target } as unknown as Record<string, unknown>
  const src = source as unknown as Record<string, unknown>
  const tgt = target as unknown as Record<string, unknown>
  for (const key of Object.keys(src)) {
    const val = src[key]
    if (val !== undefined && typeof val === 'object' && !Array.isArray(val) && typeof tgt[key] === 'object') {
      result[key] = { ...(tgt[key] as object), ...(val as object) }
    } else if (val !== undefined) {
      result[key] = val
    }
  }
  return result as unknown as AppConfig
}

// ── Public API ──

/** Load config from disk, merge with defaults. Call once on startup. */
export function loadConfig(): AppConfig {
  const filePath = getConfigPath()
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      let parsed = JSON.parse(raw)
      parsed = migrateFlat(parsed)
      currentConfig = merge(defaultConfig, parsed)
      saveConfig({}) // persist any new default fields + clean migrated keys
      log.info('Loaded config from', filePath)
    } else {
      currentConfig = structuredClone(defaultConfig)
      saveConfig({}) // persist defaults on first launch
      log.info('No config found, using defaults')
    }
  } catch (err) {
    log.error('Failed to load config, using defaults:', err)
    currentConfig = structuredClone(defaultConfig)
  }
  return currentConfig
}

/** Save partial config updates to disk. */
export function saveConfig(partial: DeepPartial<AppConfig>): void {
  currentConfig = merge(currentConfig, partial)
  const filePath = getConfigPath()
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, JSON.stringify(currentConfig, null, 2), 'utf-8')
    log.debug('Config saved to', filePath)
  } catch (err) {
    log.error('Failed to save config:', err)
  }
}

/** Get current in-memory config (returns singleton). */
export function getConfig(): AppConfig {
  return currentConfig
}
