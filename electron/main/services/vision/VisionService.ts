import { BaseService } from '@electron/services/base/BaseService'
import { IntelligenceService } from '@electron/services/intelligence/IntelligenceService'
import { ScreenCapture } from './ScreenCapture'
import { CoordinateMapper, type ScreenInfo } from './CoordinateMapper'

/**
 * VisionService — the agent's eyes.
 *
 * Combines screen capture with LLM vision to let the agent
 * see and understand what's on the user's screen.
 */
export class VisionService extends BaseService {
  private capture = new ScreenCapture()
  private mapper = new CoordinateMapper()
  private intelligence: IntelligenceService

  constructor(intelligence: IntelligenceService) {
    super()
    this.intelligence = intelligence
  }

  async init(): Promise<void> {
    this.log.info('VisionService initialized')
  }

  async dispose(): Promise<void> {
    this.log.info('VisionService disposed')
  }

  /**
   * Take a screenshot and return the buffer.
   *
   * @param format — 'jpeg' (default) or 'png' (required by Computer Use API)
   */
  async takeScreenshot(format: 'jpeg' | 'png' = 'jpeg'): Promise<Buffer> {
    return this.capture.captureFullScreen(format)
  }

  /**
   * Take a screenshot of a specific display by ID.
   */
  async takeScreenshotOfDisplay(displayId: string): Promise<Buffer> {
    return this.capture.captureDisplay(displayId)
  }

  /**
   * List available displays for multi-monitor screenshot targeting.
   */
  async listDisplays(): Promise<Array<{ id: string; name: string }>> {
    return this.capture.listDisplays()
  }

  /**
   * Take a screenshot and ask the LLM to analyze it.
   *
   * @param prompt - What to look for / describe
   * @returns LLM's analysis of the screenshot
   */
  async analyzeScreen(prompt: string): Promise<string> {
    const screenshot = await this.takeScreenshot()
    this.log.debug(`Analyzing screen (${screenshot.length} bytes) with prompt: "${prompt.slice(0, 80)}..."`)
    return this.intelligence.vision(screenshot, prompt)
  }

  /**
   * Get current screen info (resolution, DPI scale).
   */
  getScreenInfo(): ScreenInfo {
    return this.mapper.getScreenInfo()
  }

  /**
   * Get resolution as a string (e.g. "1920x1080") for prompt injection.
   */
  getResolutionString(): string {
    return this.mapper.getResolutionString()
  }

  /**
   * Convert coordinates from screenshot space to logical (OS) space.
   */
  toLogicalCoords(x: number, y: number): { x: number; y: number } {
    return this.mapper.toLogical(x, y)
  }
}
