import { ref, computed } from 'vue'
import type { CursorAnimation } from '@/types/agent'
import { api } from '@/api'

/**
 * useAgentCursor — overlay cursor animation composable (singleton).
 *
 * Subscribes to `agent.onCursorAnimation` tRPC subscription and manages
 * the reactive state for the AgentCursor overlay component.
 *
 * Coordinate mapping: screen-space pixel coords → CSS position
 * using window.innerWidth/Height proportions.
 */

// ── Singleton State ──

const visible = ref(false)
const x = ref(0)
const y = ref(0)
const animationType = ref<CursorAnimation['type']>('hide')
const typingText = ref('')
const scrollDirection = ref<'up' | 'down'>('down')

/** Whether the cursor has been shown at least once (for initial position) */
const hasInitialPosition = ref(false)

/** Click ripple animation trigger */
const clicking = ref(false)

/** Double click second ripple */
const doubleClicking = ref(false)

// ── tRPC Subscription (initialized once) ──

let subscribed = false

function initSubscription() {
  if (subscribed) return
  subscribed = true

  api.agent.onCursorAnimation.subscribe(undefined, {
    onData(payload: CursorAnimation) {
      handleAnimation(payload)
    },
  })
}

function handleAnimation(payload: CursorAnimation) {
  if (payload.type === 'hide') {
    visible.value = false
    clicking.value = false
    doubleClicking.value = false
    typingText.value = ''
    hasInitialPosition.value = false
    return
  }

  animationType.value = payload.type

  // First appearance: start at center, then glide to target
  if (!visible.value) {
    // Place cursor at center of viewport initially
    x.value = Math.round(window.innerWidth / 2)
    y.value = Math.round(window.innerHeight / 2)
    hasInitialPosition.value = false
    visible.value = true

    // After browser renders at center, enable transitions and move to target
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        hasInitialPosition.value = true
        if (payload.x !== undefined && payload.y !== undefined) {
          x.value = payload.x
          y.value = payload.y
        }
      })
    })
  } else {
    // Subsequent moves: update position directly (transition is active)
    hasInitialPosition.value = true
    if (payload.x !== undefined && payload.y !== undefined) {
      x.value = payload.x
      y.value = payload.y
    }
  }

  // Handle action-specific effects
  clicking.value = false
  doubleClicking.value = false
  typingText.value = ''

  if (payload.type === 'move-click' || payload.type === 'move-rightClick') {
    // Trigger click ripple after cursor arrives (transition duration)
    setTimeout(() => {
      clicking.value = true
      setTimeout(() => { clicking.value = false }, 400)
    }, 350)
  }

  if (payload.type === 'move-doubleClick') {
    // Two ripples for double click
    setTimeout(() => {
      clicking.value = true
      setTimeout(() => {
        clicking.value = false
        setTimeout(() => {
          doubleClicking.value = true
          setTimeout(() => { doubleClicking.value = false }, 400)
        }, 80)
      }, 200)
    }, 350)
  }

  if (payload.type === 'type' && payload.text) {
    typingText.value = payload.text.length > 30
      ? payload.text.slice(0, 27) + '…'
      : payload.text
  }

  if (payload.type === 'scroll') {
    scrollDirection.value = payload.direction ?? 'down'
  }
}

initSubscription()

// ── Composable ──

export function useAgentCursor() {
  const cursorStyle = computed(() => ({
    left: `${x.value}px`,
    top: `${y.value}px`,
    transition: hasInitialPosition.value
      ? 'left 350ms cubic-bezier(0.33, 1, 0.68, 1), top 350ms cubic-bezier(0.33, 1, 0.68, 1)'
      : 'none',
  }))

  return {
    visible,
    x,
    y,
    animationType,
    typingText,
    scrollDirection,
    clicking,
    doubleClicking,
    cursorStyle,
  }
}
