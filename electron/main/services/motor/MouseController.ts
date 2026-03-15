import robot from '@hurdlegroup/robotjs'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('MouseController')

/**
 * MouseController — wraps robotjs mouse API.
 *
 * Provides high-level methods for mouse operations:
 * click, double-click, right-click, move, drag, scroll.
 *
 * All methods are synchronous (robotjs is a native addon).
 */
export class MouseController {
  /** Move to coordinates and left-click */
  click(x: number, y: number): void {
    log.info(`click(${x}, ${y})`)
    robot.moveMouse(x, y)
    robot.mouseClick()
  }

  /** Move to coordinates and double-click */
  doubleClick(x: number, y: number): void {
    log.info(`doubleClick(${x}, ${y})`)
    robot.moveMouse(x, y)
    robot.mouseClick('left', true)
  }

  /** Move to coordinates and right-click */
  rightClick(x: number, y: number): void {
    log.info(`rightClick(${x}, ${y})`)
    robot.moveMouse(x, y)
    robot.mouseClick('right')
  }

  /** Move mouse to coordinates without clicking */
  moveTo(x: number, y: number): void {
    log.debug(`moveTo(${x}, ${y})`)
    robot.moveMouse(x, y)
  }

  /** Drag from one point to another */
  drag(fromX: number, fromY: number, toX: number, toY: number): void {
    log.info(`drag(${fromX},${fromY} → ${toX},${toY})`)
    robot.moveMouse(fromX, fromY)
    robot.mouseToggle('down')
    robot.dragMouse(toX, toY)
    robot.mouseToggle('up')
  }

  /** Scroll up or down */
  scroll(direction: 'up' | 'down', amount: number = 3): void {
    log.info(`scroll(${direction}, ${amount})`)
    // robotjs scrollMouse sends raw delta without WHEEL_DELTA (120),
    // so each unit is ~1/120 of a scroll wheel notch — virtually invisible.
    // Multiply by 120 so 1 amount unit = 1 real wheel notch (≈3 lines).
    const SCROLL_MULTIPLIER = 120
    const scrollAmount = direction === 'up' ? amount : -amount
    robot.scrollMouse(0, scrollAmount * SCROLL_MULTIPLIER)
  }
}
