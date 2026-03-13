import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('PromptLoader')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * PromptLoader — loads .md prompt templates with {{variable}} substitution.
 *
 * Storage strategy (2-tier):
 * 1. Per-persona prompts: `userData/prompts/{personaId}/{name}.md`
 * 2. Bundled defaults:    `intelligence/prompts/{name}.md`
 *
 * User edits are saved per-persona. `reset()` removes the override
 * so the bundled default is used again.
 */
export class PromptLoader {
  private bundledDir: string
  private userDir: string

  constructor() {
    this.bundledDir = path.join(__dirname, 'prompts')
    this.userDir = path.join(app.getPath('userData'), 'prompts')
  }

  /** Resolve the per-persona prompts directory */
  private personaDir(personaId: string): string {
    return path.join(this.userDir, personaId)
  }

  /**
   * Ensure persona prompt directory exists.
   * No longer copies bundled defaults — they're read directly from bundledDir.
   */
  ensureDefaults(personaId?: string): void {
    if (!fs.existsSync(this.userDir)) {
      fs.mkdirSync(this.userDir, { recursive: true })
    }

    if (personaId) {
      const pDir = this.personaDir(personaId)
      if (!fs.existsSync(pDir)) {
        fs.mkdirSync(pDir, { recursive: true })
      }
    }

    const templateCount = fs.existsSync(this.bundledDir)
      ? fs.readdirSync(this.bundledDir).filter((f) => f.endsWith('.md')).length
      : 0

    log.info(`Prompt defaults ensured (${templateCount} templates)`)
  }

  /**
   * Load a prompt by name with optional variable substitution.
   *
   * Resolution order:
   * 1. `userData/prompts/{personaId}/{name}.md` (per-persona override)
   * 2. Bundled `prompts/{name}.md` (default)
   */
  load(name: string, vars?: Record<string, string>, personaId?: string): string {
    const candidates: string[] = []

    if (personaId) {
      candidates.push(path.join(this.personaDir(personaId), `${name}.md`))
    }
    candidates.push(path.join(this.bundledDir, `${name}.md`))

    let content = ''

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        content = fs.readFileSync(candidate, 'utf-8')
        break
      }
    }

    if (!content) {
      log.error(`Prompt not found: ${name}`)
      return ''
    }

    // Replace {{key}} with values
    if (vars) {
      for (const [key, value] of Object.entries(vars)) {
        content = content.split(`{{${key}}}`).join(value)
      }
    }

    return content
  }

  /**
   * List available prompt names (without extension).
   * Merges bundled + persona prompts, deduplicates.
   */
  list(personaId?: string): string[] {
    const names = new Set<string>()

    const dirs = [this.bundledDir]
    if (personaId) dirs.push(this.personaDir(personaId))

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue
      for (const file of fs.readdirSync(dir)) {
        if (file.endsWith('.md')) {
          names.add(file.replace(/\.md$/, ''))
        }
      }
    }

    return Array.from(names).sort()
  }

  /**
   * Save prompt content to the per-persona directory.
   * personaId is required — all edits are per-persona.
   */
  save(name: string, content: string, personaId?: string): void {
    if (!personaId) {
      log.warn(`save() called without personaId for "${name}" — ignoring`)
      return
    }
    const dir = this.personaDir(personaId)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const filePath = path.join(dir, `${name}.md`)
    fs.writeFileSync(filePath, content, 'utf-8')
    log.info(`Saved prompt: ${name} (persona: ${personaId})`)
  }

  /**
   * Reset a prompt to bundled default by removing the per-persona override.
   */
  reset(name: string, personaId?: string): void {
    if (!personaId) {
      log.warn(`reset() called without personaId for "${name}" — ignoring`)
      return
    }
    const personaPath = path.join(this.personaDir(personaId), `${name}.md`)
    if (fs.existsSync(personaPath)) {
      fs.unlinkSync(personaPath)
      log.info(`Removed persona prompt override: ${name} (persona: ${personaId})`)
    }
  }
}
