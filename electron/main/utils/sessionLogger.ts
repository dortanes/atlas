/**
 * SessionLogger — per-request debug log writer.
 *
 * When `config.ui.debugLog` is enabled, AgentService creates a new
 * SessionLogger for every `executeCommand()`. Each pipeline stage
 * (intent classification, LLM calls, actions, streaming) appends
 * timestamped entries. On `flush()`, the full log is written to
 * `{userData}/logs/session_{ISO}.log`.
 *
 * Zero overhead when disabled — the logger is simply not instantiated.
 */

import { app, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// ── Helpers ──

function ts(): string {
  return new Date().toISOString()
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// ── SessionLogger ──

export class SessionLogger {
  private lines: string[] = []
  private sessionStart: number

  constructor(command: string, personaName: string) {
    this.sessionStart = performance.now()

    this.lines.push(
      '═══════════════════════════════════════════',
      ' Atlas Session Log',
      ` ${ts()}`,
      ` Persona: ${personaName}`,
      '═══════════════════════════════════════════',
      '',
      `▶ User command: "${command}"`,
      '',
    )
  }

  /** Add a labelled entry */
  step(label: string): void {
    this.lines.push(`  ${label}`)
  }

  /** Add a section header */
  section(title: string): void {
    this.lines.push('', `── ${title} ──`)
  }

  /**
   * Start a timer. Returns a stop function that logs the duration.
   *
   * @example
   * const stop = logger.startTimer('LLM call')
   * await llm.chat(...)
   * stop() // logs "LLM call: 312ms"
   */
  startTimer(label: string): () => void {
    const start = performance.now()
    return () => {
      const elapsed = performance.now() - start
      this.lines.push(`  ${label}: ${fmtMs(elapsed)}`)
    }
  }

  /** Write the full log to disk */
  flush(): void {
    const totalMs = performance.now() - this.sessionStart

    this.lines.push(
      '',
      '═══════════════════════════════════════════',
      ` Total duration: ${fmtMs(totalMs)}`,
      '═══════════════════════════════════════════',
      '',
    )

    const logsDir = getLogsDir()
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }

    // Filename: session_2026-03-14T05-38-00.log (colons replaced for Windows)
    const safeName = new Date().toISOString().replace(/:/g, '-').replace(/\..+$/, '')
    const filePath = path.join(logsDir, `session_${safeName}.log`)

    fs.writeFileSync(filePath, this.lines.join('\n'), 'utf-8')
  }
}

// ── Public helpers ──

/** Get the logs directory path */
export function getLogsDir(): string {
  return path.join(app.getPath('userData'), 'logs')
}

/** Open the logs directory in the OS file manager */
export async function openLogsFolder(): Promise<void> {
  const dir = getLogsDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  await shell.openPath(dir)
}
