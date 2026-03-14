import { BaseService } from '@electron/services/base/BaseService'
import { MouseController } from './MouseController'
import { KeyboardController } from './KeyboardController'
import { ShellController } from './ShellController'
import type { AgentAction, ActionResult } from '@electron/services/agent/types'

/**
 * MotorService — the agent's hands.
 *
 * Facade over MouseController + KeyboardController.
 * Dispatches AgentAction objects to the appropriate controller.
 *
 * Handles coordinate rescaling: LLM returns coords in screenshot space
 * (e.g. 1280px wide), and we scale them to actual screen space (e.g. 2560px).
 */
export class MotorService extends BaseService {
  readonly mouse = new MouseController()
  readonly keyboard = new KeyboardController()
  readonly shell = new ShellController()

  /** Actual screen width (logical, from Electron). Set by AgentLoop. */
  private screenWidth = 1920
  private screenHeight = 1080

  /** Screenshot width the LLM sees (after ScreenCapture resize). */
  private screenshotWidth = 1280
  private screenshotHeight = 720

  async init(): Promise<void> {
    this.log.info('MotorService initialized')
  }

  async dispose(): Promise<void> {
    this.log.info('MotorService disposed')
  }

  /**
   * Set the real screen dimensions and screenshot dimensions
   * so we can rescale LLM coordinates correctly.
   */
  setDimensions(screen: { width: number; height: number }, screenshot: { width: number; height: number }): void {
    this.screenWidth = screen.width
    this.screenHeight = screen.height
    this.screenshotWidth = screenshot.width
    this.screenshotHeight = screenshot.height
    this.log.debug(`Dimensions: screen=${screen.width}x${screen.height}, screenshot=${screenshot.width}x${screenshot.height}, scale=${(screen.width / screenshot.width).toFixed(2)}x`)
  }

  /**
   * Scale coordinates from LLM screenshot space → real screen space.
   */
  private scaleCoords(x: number, y: number): [number, number] {
    const scaleX = this.screenWidth / this.screenshotWidth
    const scaleY = this.screenHeight / this.screenshotHeight
    return [Math.round(x * scaleX), Math.round(y * scaleY)]
  }

  /**
   * Execute a single agent action.
   *
   * Routes the action to the correct controller based on action type.
   * Returns success/failure and optional error message.
   */
  async executeAction(action: AgentAction): Promise<ActionResult> {
    this.log.info(`Executing: ${action.action} — ${action.reason}`)

    try {
      switch (action.action) {
        case 'click': {
          if (!action.coords) throw new Error('click action requires coords')
          const [cx, cy] = this.scaleCoords(action.coords[0], action.coords[1])
          this.log.debug(`LLM coords: [${action.coords[0]}, ${action.coords[1]}] → screen: [${cx}, ${cy}]`)
          this.mouse.click(cx, cy)
          break
        }

        case 'doubleClick': {
          if (!action.coords) throw new Error('doubleClick action requires coords')
          const [dx, dy] = this.scaleCoords(action.coords[0], action.coords[1])
          this.log.debug(`LLM coords: [${action.coords[0]}, ${action.coords[1]}] → screen: [${dx}, ${dy}]`)
          this.mouse.doubleClick(dx, dy)
          break
        }

        case 'rightClick': {
          if (!action.coords) throw new Error('rightClick action requires coords')
          const [rx, ry] = this.scaleCoords(action.coords[0], action.coords[1])
          this.log.debug(`LLM coords: [${action.coords[0]}, ${action.coords[1]}] → screen: [${rx}, ${ry}]`)
          this.mouse.rightClick(rx, ry)
          break
        }

        case 'type':
          if (!action.text) throw new Error('type action requires text')
          await this.keyboard.type(action.text)
          break

        case 'hotkey':
          if (!action.keys || action.keys.length === 0) throw new Error('hotkey action requires keys')
          this.keyboard.hotkey(...action.keys)
          break

        case 'keyPress':
          if (!action.key) throw new Error('keyPress action requires key')
          this.keyboard.keyPress(action.key)
          break

        case 'scroll':
          this.mouse.scroll(action.direction ?? 'down', action.amount ?? 3)
          break

        case 'runCommand': {
          if (!action.command) throw new Error('runCommand action requires command')
          const shellResult = await this.shell.exec(action.command)
          this.log.info(`Command exit code: ${shellResult.exitCode}`)
          return {
            success: shellResult.exitCode === 0,
            error: shellResult.exitCode !== 0 ? (shellResult.stderr || shellResult.stdout) : undefined,
            output: shellResult.stdout || shellResult.stderr,
          }
        }

        case 'wait':
          await this.sleep(action.amount ?? 1000)
          break

        case 'screenshot':
        case 'done':
          // These are handled by AgentLoop, not MotorService
          break

        default:
          throw new Error(`Unknown action type: ${action.action}`)
      }

      this.log.info(`Action complete: ${action.action}`)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      this.log.error(`Action failed: ${action.action} — ${message}`)
      return { success: false, error: message }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
