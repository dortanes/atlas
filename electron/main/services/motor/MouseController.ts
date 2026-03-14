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
    // robotjs scrollMouse: positive y = up, negative y = down
    const scrollAmount = direction === 'up' ? amount : -amount
    robot.scrollMouse(0, scrollAmount)
  }
}
