/**
 * createLogger — structured scoped logger for the main process.
 *
 * Features:
 * - ISO-8601 timestamps on every line
 * - Log level filtering via `LOG_LEVEL` env var (debug | info | warn | error)
 * - Format: `[TIMESTAMP] [LEVEL] [Scope] message`
 * - Same `Logger` interface — zero changes for consumers
 *
 * @example
 * const log = createLogger('AgentService')
 * log.info('Initialized')    // → [2026-03-12T03:00:00.000Z] [INFO] [AgentService] Initialized
 * log.error('Boom', err)     // → [2026-03-12T03:00:00.000Z] [ERROR] [AgentService] Boom Error: ...
 */

export type LogFn = (...args: unknown[]) => void

export interface Logger {
  info: LogFn
  warn: LogFn
  error: LogFn
  debug: LogFn
}

// ── Log Level Filtering ──

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase()
  if (env && env in LEVEL_PRIORITY) return env as LogLevel
  // Default: debug in dev, info in production
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getMinLevel()]
}

// ── Logger Factory ──

export function createLogger(scope: string): Logger {
  function format(level: string): string {
    return `[${new Date().toISOString()}] [${level}] [${scope}]`
  }

  return {
    info: (...args) => {
      if (shouldLog('info')) console.log(format('INFO'), ...args)
    },
    warn: (...args) => {
      if (shouldLog('warn')) console.warn(format('WARN'), ...args)
    },
    error: (...args) => {
      if (shouldLog('error')) console.error(format('ERROR'), ...args)
    },
    debug: (...args) => {
      if (shouldLog('debug')) console.debug(format('DEBUG'), ...args)
    },
  }
}
