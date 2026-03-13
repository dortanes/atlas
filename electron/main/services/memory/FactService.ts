import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { BaseService } from '@electron/services/base/BaseService'

/**
 * A single fact about the user.
 */
export interface Fact {
  id: string
  text: string
  createdAt: string
  source: 'extracted' | 'manual'
}

/**
 * FactService — per-persona long-term knowledge storage.
 *
 * Storage: `userData/facts/{personaId}.json` — flat JSON array of Fact[].
 *
 * Facts are extracted from conversations by the LLM and can also be
 * added/edited/deleted manually by the user.
 */
export class FactService extends BaseService {
  private baseDir = ''
  private factsCache = new Map<string, Fact[]>()

  async init(): Promise<void> {
    this.baseDir = path.join(app.getPath('userData'), 'facts')
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
    this.log.info('FactService initialized')
  }

  async dispose(): Promise<void> {
    this.factsCache.clear()
    this.log.info('FactService disposed')
  }

  // ── Queries ──

  /** Get all facts for a persona */
  getFacts(personaId: string): Fact[] {
    const cached = this.factsCache.get(personaId)
    if (cached) return cached

    const facts = this.loadFromDisk(personaId)
    this.factsCache.set(personaId, facts)
    return facts
  }

  /** Format facts as a bullet list for prompt injection */
  getFactsText(personaId: string): string {
    const facts = this.getFacts(personaId)
    if (facts.length === 0) return 'No known facts about the user yet.'
    return facts.map((f) => `- ${f.text}`).join('\n')
  }

  // ── Mutations ──

  /** Add a single fact */
  addFact(personaId: string, text: string, source: 'extracted' | 'manual' = 'manual'): Fact {
    const fact: Fact = {
      id: randomUUID(),
      text: text.trim(),
      createdAt: new Date().toISOString(),
      source,
    }
    const facts = this.getFacts(personaId)
    facts.push(fact)
    this.saveToDisk(personaId, facts)
    this.log.debug(`Added fact for ${personaId}: "${text.slice(0, 50)}"`)
    return fact
  }

  /** Add multiple extracted facts (dedup against existing) */
  addFacts(personaId: string, texts: string[]): Fact[] {
    const existing = this.getFacts(personaId)
    const existingTexts = new Set(existing.map((f) => f.text.toLowerCase()))

    const newFacts: Fact[] = []
    for (const text of texts) {
      const trimmed = text.trim()
      if (!trimmed || existingTexts.has(trimmed.toLowerCase())) continue

      const fact: Fact = {
        id: randomUUID(),
        text: trimmed,
        createdAt: new Date().toISOString(),
        source: 'extracted',
      }
      existing.push(fact)
      newFacts.push(fact)
      existingTexts.add(trimmed.toLowerCase())
    }

    if (newFacts.length > 0) {
      this.saveToDisk(personaId, existing)
      this.log.info(`Extracted ${newFacts.length} new fact(s) for persona ${personaId}`)
    }

    return newFacts
  }

  /** Update a fact's text */
  updateFact(personaId: string, factId: string, text: string): Fact | null {
    const facts = this.getFacts(personaId)
    const fact = facts.find((f) => f.id === factId)
    if (!fact) return null

    fact.text = text.trim()
    this.saveToDisk(personaId, facts)
    this.log.debug(`Updated fact ${factId}`)
    return fact
  }

  /** Delete a single fact */
  deleteFact(personaId: string, factId: string): boolean {
    const facts = this.getFacts(personaId)
    const idx = facts.findIndex((f) => f.id === factId)
    if (idx < 0) return false

    facts.splice(idx, 1)
    this.saveToDisk(personaId, facts)
    this.log.debug(`Deleted fact ${factId}`)
    return true
  }

  /** Delete all facts for a persona */
  clearFacts(personaId: string): void {
    this.factsCache.set(personaId, [])
    this.saveToDisk(personaId, [])
    this.log.info(`Cleared all facts for persona ${personaId}`)
  }

  /** Delete fact file entirely (called when persona is deleted) */
  deletePersonaFacts(personaId: string): void {
    const filePath = this.filePath(personaId)
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch (err) {
      this.log.error(`Failed to delete facts for ${personaId}:`, err)
    }
    this.factsCache.delete(personaId)
    this.log.info(`Deleted all facts for persona ${personaId}`)
  }

  // ── Private helpers ──

  private filePath(personaId: string): string {
    return path.join(this.baseDir, `${personaId}.json`)
  }

  private loadFromDisk(personaId: string): Fact[] {
    const fp = this.filePath(personaId)
    try {
      if (!fs.existsSync(fp)) return []
      const raw = fs.readFileSync(fp, 'utf-8')
      return JSON.parse(raw) as Fact[]
    } catch (err) {
      this.log.error(`Failed to load facts for ${personaId}:`, err)
      return []
    }
  }

  private saveToDisk(personaId: string, facts: Fact[]): void {
    const fp = this.filePath(personaId)
    try {
      fs.writeFileSync(fp, JSON.stringify(facts, null, 2), 'utf-8')
    } catch (err) {
      this.log.error(`Failed to save facts for ${personaId}:`, err)
    }
  }
}
