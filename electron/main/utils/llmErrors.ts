/**
 * llmErrors — unified LLM error parsing and formatting.
 *
 * Provides a single {@link formatLLMError} function that extracts
 * meaningful messages from raw SDK errors (Google GenAI, OpenAI, etc.)
 * and maps known status codes to user-friendly messages.
 *
 * ## i18n Readiness
 *
 * Error messages use key-based lookup via {@link STATUS_MESSAGES}.
 * When i18n is introduced, replace this map with `t('llm.error.403')` calls
 * (or equivalent) — the keys are already structured for localization.
 *
 * @example
 * ```ts
 * // Future i18n integration:
 * // const STATUS_MESSAGES = Object.fromEntries(
 * //   Object.keys(STATUS_KEYS).map(k => [k, t(`llm.error.${k}`)])
 * // )
 * ```
 */

/**
 * Known HTTP/gRPC status → user-facing message.
 *
 * Keys are ready for i18n — when adding localization, map these
 * to `t('llm.error.STATUS_KEY')` calls.
 */
const STATUS_MESSAGES: Record<string, string> = {
  // HTTP status codes
  '400': 'llm.error.invalid_request',
  '401': 'llm.error.auth_failed',
  '403': 'llm.error.permission_denied',
  '404': 'llm.error.model_not_found',
  '429': 'llm.error.rate_limit',
  '500': 'llm.error.internal',
  '503': 'llm.error.unavailable',
  // gRPC status codes (Gemini)
  PERMISSION_DENIED:   'llm.error.permission_denied',
  NOT_FOUND:           'llm.error.model_not_found',
  RESOURCE_EXHAUSTED:  'llm.error.rate_limit',
  UNAUTHENTICATED:     'llm.error.auth_failed',
  UNAVAILABLE:         'llm.error.unavailable',
  INTERNAL:            'llm.error.internal',
  INVALID_ARGUMENT:    'llm.error.invalid_request',
}

/**
 * Fallback messages for error keys (used until i18n is integrated).
 *
 * When i18n arrives, these become the default locale entries.
 */
const FALLBACK_MESSAGES: Record<string, string> = {
  'llm.error.invalid_request': 'Invalid request to API. Check your settings and try again.',
  'llm.error.auth_failed': 'Authentication failed. Check your API key in Settings → LLM.',
  'llm.error.permission_denied': 'API key is invalid or lacks permissions. Check your key in Settings → LLM.',
  'llm.error.model_not_found': 'Model not found. Check the model name in Settings → LLM.',
  'llm.error.rate_limit': 'Rate limit exceeded. Wait a moment and try again.',
  'llm.error.internal': 'API internal error. Try again later.',
  'llm.error.unavailable': 'API temporarily unavailable. Try again later.',
}

/**
 * Resolve a message key to a human-readable string.
 *
 * When i18n is added, replace this with your t() function.
 *
 * @param key — message key from STATUS_MESSAGES
 * @returns Localized string (currently English fallback)
 */
function resolveMessage(key: string): string {
  return FALLBACK_MESSAGES[key] ?? key
}

/**
 * Format any LLM SDK error into a clean, user-facing message.
 *
 * Handles:
 * - Google GenAI errors (status codes, gRPC codes)
 * - OpenAI errors (HTTP status codes, error.message)
 * - Generic Error objects
 * - Unknown error shapes
 *
 * @param err — raw error from an LLM SDK call
 * @returns A clean, user-friendly error message
 */
export function formatLLMError(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err)
  }

  const message = err.message || ''

  // Check for known status codes in the error message
  for (const [code, key] of Object.entries(STATUS_MESSAGES)) {
    if (message.includes(code)) {
      return resolveMessage(key)
    }
  }

  // Check for HTTP status code in error object
  const errObj = err as unknown as Record<string, unknown>
  const statusCode = errObj.status ?? errObj.statusCode

  if (typeof statusCode === 'number') {
    const key = STATUS_MESSAGES[String(statusCode)]
    if (key) return resolveMessage(key)
  }

  // Fall through to raw message
  return message || 'Unknown LLM error. Check logs for details.'
}
