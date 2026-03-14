/**
 * ttsErrors — unified TTS error parsing and formatting.
 *
 * Mirrors {@link formatLLMError} pattern for TTS providers.
 * Extracts meaningful messages from ElevenLabs SDK errors
 * (quota_exceeded, auth failures, rate limits) and maps them
 * to user-friendly strings.
 *
 * ## i18n Readiness
 *
 * Uses key-based lookup via {@link TTS_FALLBACK_MESSAGES}.
 * Replace with `t('tts.error.*')` calls when i18n is introduced.
 */

/**
 * Known TTS error status → user-facing message key.
 */
const STATUS_MESSAGES: Record<string, string> = {
  '401': 'tts.error.auth_failed',
  '403': 'tts.error.permission_denied',
  '429': 'tts.error.rate_limit',
  '500': 'tts.error.internal',
  '503': 'tts.error.unavailable',
}

/**
 * Fallback messages for error keys (used until i18n is integrated).
 */
const TTS_FALLBACK_MESSAGES: Record<string, string> = {
  'tts.error.quota_exceeded': 'TTS quota exhausted. Voice output is paused until credits reset. You can dismiss this warning.',
  'tts.error.auth_failed': 'TTS authentication failed. Check your ElevenLabs API key in Settings → TTS.',
  'tts.error.permission_denied': 'TTS API key is invalid or lacks permissions. Check your key in Settings → TTS.',
  'tts.error.rate_limit': 'TTS rate limit exceeded. Voice output will resume shortly.',
  'tts.error.internal': 'TTS API error. Voice output is temporarily unavailable.',
  'tts.error.unavailable': 'TTS is temporarily unavailable. Voice output will resume when the service is back.',
}

function resolveMessage(key: string): string {
  return TTS_FALLBACK_MESSAGES[key] ?? key
}

/**
 * Format any TTS SDK error into a clean, user-facing message.
 *
 * Handles:
 * - ElevenLabs quota_exceeded (body.detail.status)
 * - HTTP status codes (401, 403, 429, 500, 503)
 * - Generic Error objects
 *
 * @param err — raw error from a TTS SDK call
 * @returns A clean, user-friendly error message
 */
export function formatTTSError(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err)
  }

  const message = err.message || ''
  const errObj = err as unknown as Record<string, unknown>

  // ── ElevenLabs quota_exceeded detection ──
  // ElevenLabs SDK errors have a `body` property with { detail: { status, message } }
  const body = errObj.body as Record<string, unknown> | undefined
  if (body) {
    const detail = body.detail as Record<string, unknown> | undefined
    if (detail?.status === 'quota_exceeded') {
      return resolveMessage('tts.error.quota_exceeded')
    }
  }

  // Also check string in error message
  if (message.includes('quota_exceeded')) {
    return resolveMessage('tts.error.quota_exceeded')
  }

  // ── HTTP status code from error object ──
  const statusCode = errObj.statusCode ?? errObj.status
  if (typeof statusCode === 'number') {
    const key = STATUS_MESSAGES[String(statusCode)]
    if (key) return resolveMessage(key)
  }

  // ── Check for status codes in error message ──
  for (const [code, key] of Object.entries(STATUS_MESSAGES)) {
    if (message.includes(code)) {
      return resolveMessage(key)
    }
  }

  // Fall through to raw message
  return message || 'Unknown TTS error. Check logs for details.'
}

/**
 * Check if a TTS error indicates quota exhaustion.
 *
 * Useful for deciding whether to auto-disable TTS
 * to avoid spamming failed requests.
 */
export function isTTSQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false

  const errObj = err as unknown as Record<string, unknown>
  const body = errObj.body as Record<string, unknown> | undefined
  const detail = body?.detail as Record<string, unknown> | undefined

  return detail?.status === 'quota_exceeded' || err.message.includes('quota_exceeded')
}
