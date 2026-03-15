/**
 * ContextCacheService — manages Gemini explicit context caching.
 *
 * Caches system prompts + stable action prompts via the Gemini API so they
 * are only transmitted once per TTL period. Subsequent LLM calls reference
 * the cached content by name, saving tokens and reducing costs.
 *
 * What gets cached (stable parts only):
 * - systemInstruction: persona name, personality, capabilities, rules
 * - contents: action-specific prompt (direct_action.md, action.md, etc.)
 *
 * What stays dynamic (NOT cached):
 * - Current time, user facts — prepended to conversation messages
 *
 * Cache invalidation triggers:
 * - Persona switch (`persona:switched`)
 * - Prompt edit (`prompt:saved`)
 * - LLM config change (`config:changed` — model, apiKey)
 *
 * Graceful degradation: if caching fails (minimum token count not met,
 * API error, non-Gemini provider), falls back silently — the caller
 * receives `null` and uses regular `systemInstruction` instead.
 */

import { createHash } from 'node:crypto'
import { GoogleGenAI } from '@google/genai'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('ContextCacheService')

/** Default TTL for cached content (24 hours) */
const DEFAULT_TTL_SECONDS = 24 * 60 * 60

interface CacheEntry {
  /** Gemini cachedContent name (e.g. "cachedContents/abc123") */
  name: string
  /** SHA-256 of model + systemInstruction + stableContents — detects staleness */
  fingerprint: string
  /** Model name used to create the cache */
  model: string
  /** Persona this cache belongs to */
  personaId: string
  /** Cache key (personaId + promptType) */
  cacheKey: string
  /** Timestamp when the cache was created */
  createdAt: number
}

export class ContextCacheService {
  private client: GoogleGenAI | null = null
  private apiKey: string = ''
  /** Active caches keyed by cacheKey (personaId:promptType) */
  private caches = new Map<string, CacheEntry>()

  /**
   * Configure the service with an API key.
   * Must be called before `getOrCreate()`. Called by IntelligenceService
   * on init and reinit.
   */
  configure(apiKey: string): void {
    if (apiKey === this.apiKey && this.client) return
    this.apiKey = apiKey
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null
    // New API key = all old caches are invalid
    this.caches.clear()
    log.info(`Configured${apiKey ? '' : ' (no API key — caching disabled)'}`)
  }

  /**
   * Get an existing valid cache or create a new one.
   *
   * @param model — Gemini model name (e.g. "gemini-2.5-flash")
   * @param systemInstruction — stable system prompt (no time/facts)
   * @param personaId — active persona ID
   * @param stableContent — stable action prompt text to include in cache (optional)
   * @param promptType — cache partition key (e.g. 'chat', 'direct', 'action', 'cu')
   * @returns Cache name string to pass as `cachedContent`, or null if caching unavailable
   */
  async getOrCreate(
    model: string,
    systemInstruction: string,
    personaId: string,
    stableContent?: string,
    promptType: string = 'default',
  ): Promise<string | null> {
    if (!this.client) return null

    const cacheKey = `${personaId}:${promptType}`
    const fingerprint = this.computeFingerprint(model, systemInstruction, stableContent)

    // Check if we already have a valid cache
    const existing = this.caches.get(cacheKey)
    if (existing && existing.fingerprint === fingerprint) {
      log.debug(`Reusing cache: ${existing.name} (key: ${cacheKey})`)
      return existing.name
    }

    // Existing cache is stale — delete it before creating a new one
    if (existing) {
      await this.deleteCache(existing.name)
      this.caches.delete(cacheKey)
    }

    // Create new cache
    try {
      const config: Record<string, unknown> = {
        systemInstruction,
        ttl: `${DEFAULT_TTL_SECONDS}s`,
      }

      // Include stable content (action prompt) in the cache if provided
      if (stableContent) {
        config.contents = [
          { role: 'user', parts: [{ text: stableContent }] },
        ]
      }

      const cache = await this.client.caches.create({ model, config })

      if (!cache.name) {
        log.warn('Cache created but no name returned — fallback to uncached')
        return null
      }

      const entry: CacheEntry = {
        name: cache.name,
        fingerprint,
        model,
        personaId,
        cacheKey,
        createdAt: Date.now(),
      }

      this.caches.set(cacheKey, entry)
      log.info(`Created cache: ${cache.name} (key: ${cacheKey}, model: ${model})`)
      return cache.name
    } catch (err) {
      // Graceful degradation — log and return null
      const msg = err instanceof Error ? err.message : String(err)
      log.warn(`Cache creation failed (falling back to uncached): ${msg}`)
      return null
    }
  }

  /**
   * Invalidate cached content for a specific persona or all personas.
   *
   * @param personaId — persona to invalidate, or undefined for all
   */
  async invalidate(personaId?: string): Promise<void> {
    if (personaId) {
      // Invalidate all cache keys for this persona
      const toDelete: string[] = []
      for (const [key, entry] of this.caches) {
        if (entry.personaId === personaId) {
          toDelete.push(key)
          await this.deleteCache(entry.name)
        }
      }
      for (const key of toDelete) this.caches.delete(key)
      if (toDelete.length > 0) {
        log.info(`Cache invalidated for persona: ${personaId} (${toDelete.length} entries)`)
      }
    } else {
      // Invalidate all
      const promises: Promise<void>[] = []
      for (const [, entry] of this.caches) {
        promises.push(this.deleteCache(entry.name))
      }
      await Promise.allSettled(promises)
      this.caches.clear()
      log.info('All caches invalidated')
    }
  }

  /** Clean up all caches on service disposal */
  async dispose(): Promise<void> {
    await this.invalidate()
    this.client = null
    log.info('ContextCacheService disposed')
  }

  // ── Internal helpers ──

  /** Compute a fingerprint for cache validity checking */
  private computeFingerprint(model: string, systemInstruction: string, stableContent?: string): string {
    const data = stableContent
      ? `${model}:${systemInstruction}:${stableContent}`
      : `${model}:${systemInstruction}`
    return createHash('sha256').update(data).digest('hex')
  }

  /** Delete a cache entry from the Gemini API (best-effort) */
  private async deleteCache(name: string): Promise<void> {
    if (!this.client) return
    try {
      await this.client.caches.delete({ name })
      log.debug(`Deleted cache: ${name}`)
    } catch (err) {
      // Non-fatal — cache may have already expired
      const msg = err instanceof Error ? err.message : String(err)
      log.debug(`Cache delete failed (may have expired): ${msg}`)
    }
  }
}
