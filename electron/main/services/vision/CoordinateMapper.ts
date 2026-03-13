import { screen } from 'electron'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('CoordinateMapper')

export interface ScreenInfo {
  width: number
  height: number
  scaleFactor: number
}

/**
 * CoordinateMapper — translates between logical and physical screen coordinates.
 *
 * Handles DPI scaling so the LLM can work with pixel coordinates from
 * screenshots and we convert them to actual screen positions for nut.js.
 */
export class CoordinateMapper {
  /**
   * Get primary display info.
   */
  getScreenInfo(): ScreenInfo {
    const primary = screen.getPrimaryDisplay()
    const { width, height } = primary.size
    const scaleFactor = primary.scaleFactor

    log.debug(`Screen: ${width}x${height} @ ${scaleFactor}x`)
    return { width, height, scaleFactor }
  }

  /**
   * Convert coordinates from screenshot pixel space to OS logical space.
   *
   * Screenshots capture at physical resolution (e.g. 3840x2160 on a 2x display).
   * nut.js operates in logical space (1920x1080). We divide by scaleFactor.
   */
  toLogical(physicalX: number, physicalY: number): { x: number; y: number } {
    const { scaleFactor } = this.getScreenInfo()
    return {
      x: Math.round(physicalX / scaleFactor),
      y: Math.round(physicalY / scaleFactor),
    }
  }

  /**
   * Convert logical coordinates to physical (screenshot) space.
   */
  toPhysical(logicalX: number, logicalY: number): { x: number; y: number } {
    const { scaleFactor } = this.getScreenInfo()
    return {
      x: Math.round(logicalX * scaleFactor),
      y: Math.round(logicalY * scaleFactor),
    }
  }

  /**
   * Get the screen resolution string for prompt injection (e.g. "1920x1080").
   */
  getResolutionString(): string {
    const { width, height } = this.getScreenInfo()
    return `${width}x${height}`
  }
}
