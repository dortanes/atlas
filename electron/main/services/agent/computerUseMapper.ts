/**
 * computerUseMapper — translates Gemini computer_use function_calls into AgentAction.
 *
 * The Gemini computer_use API returns actions as `function_call` parts with names like
 * `click_at`, `type_text_at`, `key_combination`, etc. This module maps those to our
 * internal `AgentAction` interface used by MotorService.
 *
 * Coordinate denormalization: Gemini returns coords normalized 0–999.
 * We convert to actual screen pixels: `actual = Math.round(normalized / 999 * screenSize)`.
 */

import type { AgentAction } from './types'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('ComputerUseMapper')

/** Screen dimensions for denormalization */
export interface ScreenDimensions {
  width: number
  height: number
}

/**
 * Denormalize a coordinate from 0–999 range to actual pixel range.
 */
function denormalize(normalized: number, screenSize: number): number {
  return Math.round((normalized / 999) * screenSize)
}

/**
 * Map a Gemini computer_use function_call to an AgentAction.
 *
 * @param name — function_call.name (e.g. "click_at", "type_text_at")
 * @param args — function_call.args (coordinate values, text, etc.)
 * @param screen — actual screen dimensions for coordinate denormalization
 * @returns AgentAction compatible with MotorService, or null if unmapped
 */
export function mapFunctionCallToAction(
  name: string,
  args: Record<string, unknown>,
  screen: ScreenDimensions,
): AgentAction | null {
  switch (name) {
    case 'click_at': {
      const x = denormalize(Number(args.x ?? 0), screen.width)
      const y = denormalize(Number(args.y ?? 0), screen.height)
      return {
        action: 'click',
        coords: [x, y],
        reason: `Click at (${x}, ${y})`,
        risk: 'low',
      }
    }

    case 'type_text_at': {
      const x = denormalize(Number(args.x ?? 0), screen.width)
      const y = denormalize(Number(args.y ?? 0), screen.height)
      const text = String(args.text ?? '')
      const pressEnter = Boolean(args.press_enter)
      // Build a compound action — click at location first, then type
      // We return the click action; the loop will handle type separately
      return {
        action: 'click',
        coords: [x, y],
        text, // Store text for the loop to handle typing after click
        reason: `Type "${text.slice(0, 40)}${text.length > 40 ? '...' : ''}" at (${x}, ${y})${pressEnter ? ' + Enter' : ''}`,
        risk: 'low',
        // Store pressEnter in key field as flag
        key: pressEnter ? 'enter' : undefined,
      }
    }

    case 'hover_at': {
      const x = denormalize(Number(args.x ?? 0), screen.width)
      const y = denormalize(Number(args.y ?? 0), screen.height)
      return {
        action: 'click', // We'll skip the actual click in the loop — this is a move
        coords: [x, y],
        reason: `Hover at (${x}, ${y})`,
        risk: 'low',
      }
    }

    case 'key_combination': {
      const keysStr = String(args.keys ?? '')
      const keys = keysStr.split('+').map(k => k.trim().toLowerCase())
      return {
        action: 'hotkey',
        keys,
        reason: `Key combination: ${keysStr}`,
        risk: 'low',
      }
    }

    case 'scroll_at': {
      const direction = String(args.direction ?? 'down') as 'up' | 'down'
      const magnitude = Number(args.magnitude ?? 3)
      // Scroll at a specific position — move mouse there first
      const x = denormalize(Number(args.x ?? 500), screen.width)
      const y = denormalize(Number(args.y ?? 500), screen.height)
      return {
        action: 'scroll',
        direction,
        amount: Math.round(magnitude / 100) || 3, // Convert Gemini magnitude (px) to lines
        coords: [x, y],
        reason: `Scroll ${direction} at (${x}, ${y})`,
        risk: 'low',
      }
    }

    case 'scroll_document': {
      const direction = String(args.direction ?? 'down') as 'up' | 'down'
      return {
        action: 'scroll',
        direction,
        amount: 5,
        reason: `Scroll document ${direction}`,
        risk: 'low',
      }
    }

    case 'drag_and_drop': {
      // MotorService doesn't have drag yet — fall back to click source then click dest
      const srcX = denormalize(Number(args.x ?? 0), screen.width)
      const srcY = denormalize(Number(args.y ?? 0), screen.height)
      log.warn(`drag_and_drop not fully supported, clicking source at (${srcX}, ${srcY})`)
      return {
        action: 'click',
        coords: [srcX, srcY],
        reason: `Drag from (${srcX}, ${srcY}) (simplified)`,
        risk: 'medium',
      }
    }

    case 'open_web_browser': {
      return {
        action: 'runCommand',
        command: 'Start-Process "https://www.google.com"',
        reason: 'Open web browser',
        risk: 'low',
      }
    }

    case 'navigate': {
      const url = String(args.url ?? 'https://www.google.com')
      return {
        action: 'runCommand',
        command: `Start-Process "${url}"`,
        reason: `Navigate to ${url}`,
        risk: 'low',
      }
    }

    case 'go_back': {
      return {
        action: 'hotkey',
        keys: ['alt', 'left'],
        reason: 'Browser: go back',
        risk: 'low',
      }
    }

    case 'go_forward': {
      return {
        action: 'hotkey',
        keys: ['alt', 'right'],
        reason: 'Browser: go forward',
        risk: 'low',
      }
    }

    case 'search': {
      // Open browser address bar and search
      return {
        action: 'hotkey',
        keys: ['ctrl', 'l'],
        reason: 'Focus browser address bar (search)',
        risk: 'low',
      }
    }

    case 'wait_5_seconds': {
      return {
        action: 'wait',
        amount: 5000,
        reason: 'Wait 5 seconds',
        risk: 'low',
      }
    }

    default:
      log.warn(`Unknown computer_use function: ${name}`)
      return null
  }
}

/**
 * Extract safety_decision from function_call args if present.
 *
 * @returns 'require_confirmation' if risky, null otherwise
 */
export function extractSafetyDecision(args: Record<string, unknown>): {
  decision: 'require_confirmation' | 'allowed'
  explanation: string
} | null {
  const safety = args.safety_decision as Record<string, unknown> | undefined
  if (!safety) return null

  return {
    decision: (safety.decision as string) === 'require_confirmation' ? 'require_confirmation' : 'allowed',
    explanation: String(safety.explanation ?? 'Action requires confirmation'),
  }
}
