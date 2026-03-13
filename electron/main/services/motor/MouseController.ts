import { mouse, Point, Button, straightTo } from '@nut-tree-fork/nut-js'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('MouseController')

/**
 * MouseController — wraps nut.js mouse API.
 *
 * Provides high-level methods for mouse operations:
 * click, double-click, right-click, move, drag, scroll.
 */
export class MouseController {
  /** Move to coordinates and left-click */
  async click(x: number, y: number): Promise<void> {
    log.info(`click(${x}, ${y})`)
    await mouse.setPosition(new Point(x, y))
    await mouse.click(Button.LEFT)
  }

  /** Move to coordinates and double-click */
  async doubleClick(x: number, y: number): Promise<void> {
    log.info(`doubleClick(${x}, ${y})`)
    await mouse.setPosition(new Point(x, y))
    await mouse.doubleClick(Button.LEFT)
  }

  /** Move to coordinates and right-click */
  async rightClick(x: number, y: number): Promise<void> {
    log.info(`rightClick(${x}, ${y})`)
    await mouse.setPosition(new Point(x, y))
    await mouse.click(Button.RIGHT)
  }

  /** Move mouse to coordinates without clicking */
  async moveTo(x: number, y: number): Promise<void> {
    log.debug(`moveTo(${x}, ${y})`)
    await mouse.move(straightTo(new Point(x, y)))
  }

  /** Drag from one point to another */
  async drag(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
    log.info(`drag(${fromX},${fromY} → ${toX},${toY})`)
    await mouse.setPosition(new Point(fromX, fromY))
    await mouse.pressButton(Button.LEFT)
    await mouse.move(straightTo(new Point(toX, toY)))
    await mouse.releaseButton(Button.LEFT)
  }

  /** Scroll up or down */
  async scroll(direction: 'up' | 'down', amount: number = 3): Promise<void> {
    log.info(`scroll(${direction}, ${amount})`)
    if (direction === 'up') {
      await mouse.scrollUp(amount)
    } else {
      await mouse.scrollDown(amount)
    }
  }
}
