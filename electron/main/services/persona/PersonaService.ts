import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { BaseService } from '@electron/services/base/BaseService'
import { getConfig, saveConfig } from '@electron/utils/config'
import { mainEventBus } from '@electron/utils/eventBus'
import { type AgentProfile, DEFAULT_PERSONA } from './AgentProfile'
import type { MemoryService } from '@electron/services/memory/MemoryService'
import type { FactService } from '@electron/services/memory/FactService'

/**
 * PersonaService — CRUD for agent personas.
 *
 * Storage: `userData/personas.json` — a flat JSON array of AgentProfile[].
 * Each persona can optionally have prompt overrides in `userData/prompts/{personaId}/`.
 *
 * The default "Atlas" persona is always present and cannot be deleted.
 */
export class PersonaService extends BaseService {
  private personas: AgentProfile[] = []
  private filePath = ''
  private memoryService: MemoryService | null = null
  private factService: FactService | null = null

  /** Set after both services are registered (avoids circular dep) */
  setMemoryService(ms: MemoryService): void {
    this.memoryService = ms
  }

  setFactService(fs: FactService): void {
    this.factService = fs
  }

  async init(): Promise<void> {
    this.filePath = path.join(app.getPath('userData'), 'personas.json')
    this.loadFromDisk()

    // Ensure default persona always exists
    if (!this.personas.find((p) => p.id === DEFAULT_PERSONA.id)) {
      this.personas.unshift({ ...DEFAULT_PERSONA, createdAt: new Date().toISOString() })
      this.saveToDisk()
    }

    // Ensure activePersonaId points to an existing persona
    const config = getConfig()
    if (!this.personas.find((p) => p.id === config.activePersonaId)) {
      saveConfig({ activePersonaId: DEFAULT_PERSONA.id })
    }

    this.log.info(`PersonaService initialized (${this.personas.length} persona(s))`)
  }

  async dispose(): Promise<void> {
    this.personas = []
    this.log.info('PersonaService disposed')
  }

  // ── Queries ──

  /** Return all personas */
  list(): AgentProfile[] {
    return [...this.personas]
  }

  /** Get persona by ID */
  get(id: string): AgentProfile | undefined {
    return this.personas.find((p) => p.id === id)
  }

  /** Get currently active persona */
  getActive(): AgentProfile {
    const config = getConfig()
    return this.get(config.activePersonaId) ?? this.personas[0] ?? DEFAULT_PERSONA
  }

  // ── Mutations ──

  /** Create a new persona */
  create(data: { name: string; avatar: string; personality: string; ttsVoiceId?: string }): AgentProfile {
    const persona: AgentProfile = {
      id: randomUUID(),
      name: data.name,
      avatar: data.avatar,
      personality: data.personality,
      ttsVoiceId: data.ttsVoiceId || undefined,
      createdAt: new Date().toISOString(),
      isDefault: false,
    }
    this.personas.push(persona)
    this.saveToDisk()

    // Create per-persona prompts directory
    this.ensurePersonaPromptsDir(persona.id)

    this.log.info(`Created persona: "${persona.name}" (${persona.id})`)
    return persona
  }

  /** Update an existing persona */
  update(id: string, partial: Partial<Pick<AgentProfile, 'name' | 'avatar' | 'personality' | 'ttsVoiceId'>>): AgentProfile | null {
    const persona = this.personas.find((p) => p.id === id)
    if (!persona) return null

    if (partial.name !== undefined) persona.name = partial.name
    if (partial.avatar !== undefined) persona.avatar = partial.avatar
    if (partial.personality !== undefined) persona.personality = partial.personality
    if (partial.ttsVoiceId !== undefined) persona.ttsVoiceId = partial.ttsVoiceId || undefined

    this.saveToDisk()
    this.log.info(`Updated persona: "${persona.name}" (${id})`)

    // If this is the active persona, notify about the update
    const config = getConfig()
    if (config.activePersonaId === id) {
      mainEventBus.emit('persona:switched', { id, persona })
    }

    return persona
  }

  /** Delete a persona (cannot delete the default) */
  delete(id: string): boolean {
    const persona = this.personas.find((p) => p.id === id)
    if (!persona) return false
    if (persona.isDefault) {
      this.log.warn('Cannot delete the default persona')
      return false
    }

    this.personas = this.personas.filter((p) => p.id !== id)
    this.saveToDisk()

    // If the deleted persona was active, switch to default
    const config = getConfig()
    if (config.activePersonaId === id) {
      this.switch(DEFAULT_PERSONA.id)
    }

    // Clean up per-persona prompts directory
    this.removePersonaPromptsDir(id)

    // Clean up per-persona memory
    this.memoryService?.deletePersonaMemory(id)

    // Clean up per-persona facts
    this.factService?.deletePersonaFacts(id)

    this.log.info(`Deleted persona: "${persona.name}" (${id})`)
    return true
  }

  /** Switch the active persona */
  switch(id: string): boolean {
    const persona = this.personas.find((p) => p.id === id)
    if (!persona) return false

    saveConfig({ activePersonaId: id })

    // Verify config was saved
    const verified = getConfig()
    this.log.info(`Switched to persona: "${persona.name}" (${id}), config.activePersonaId = ${verified.activePersonaId}`)

    mainEventBus.emit('persona:switched', { id, persona })
    return true
  }

  // ── Private helpers ──

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        this.personas = JSON.parse(raw) as AgentProfile[]
        this.log.debug(`Loaded ${this.personas.length} persona(s) from disk`)
      }
    } catch (err) {
      this.log.error('Failed to load personas:', err)
      this.personas = []
    }
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.filePath, JSON.stringify(this.personas, null, 2), 'utf-8')
      this.log.debug('Personas saved to disk')
    } catch (err) {
      this.log.error('Failed to save personas:', err)
    }
  }

  private ensurePersonaPromptsDir(id: string): void {
    const dir = path.join(app.getPath('userData'), 'prompts', id)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  private removePersonaPromptsDir(id: string): void {
    const dir = path.join(app.getPath('userData'), 'prompts', id)
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    } catch (err) {
      this.log.error(`Failed to remove persona prompts dir: ${dir}`, err)
    }
  }
}
