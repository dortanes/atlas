import screenshot from 'screenshot-desktop'
import { nativeImage } from 'electron'
import { createLogger } from '@electron/utils/logger'
import { getConfig } from '@electron/utils/config'

const log = createLogger('ScreenCapture')



export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * ScreenCapture — wraps `screenshot-desktop` to capture the screen.
 *
 * Captures at native resolution, then resizes to MAX_WIDTH and
 * compresses to JPEG for efficient LLM API usage.
 * 2560x1440 PNG (~3MB) → 1280x720 JPEG (~150-300KB)
 */
export class ScreenCapture {
  /**
   * Capture the full primary display, optimized for LLM.
   * Returns a resized JPEG buffer.
   */
  async captureFullScreen(): Promise<Buffer> {
    log.debug('Capturing full screen...')
    const img = await screenshot({ format: 'png' })
    const raw = Buffer.isBuffer(img) ? img : Buffer.from(img)
    log.debug(`Raw screenshot: ${raw.length} bytes`)

    const optimized = this.optimize(raw)
    log.info(`Screenshot captured: ${raw.length} → ${optimized.length} bytes (${Math.round(optimized.length / 1024)}KB)`)
    return optimized
  }

  /**
   * List available displays (for multi-monitor setups).
   */
  async listDisplays(): Promise<Array<{ id: string; name: string }>> {
    const displays = await screenshot.listDisplays()
    return displays.map((d: { id: string | number; name?: string }) => ({
      id: String(d.id),
      name: d.name ?? `Display ${d.id}`,
    }))
  }

  /**
   * Capture a specific display by ID (optimized).
   */
  async captureDisplay(displayId: string): Promise<Buffer> {
    log.debug(`Capturing display: ${displayId}`)
    const img = await screenshot({ screen: displayId, format: 'png' })
    const raw = Buffer.isBuffer(img) ? img : Buffer.from(img)
    const optimized = this.optimize(raw)
    log.info(`Display ${displayId}: ${raw.length} → ${optimized.length} bytes`)
    return optimized
  }

  /**
   * Resize + compress a screenshot for LLM consumption.
   *
   * Uses Electron's nativeImage (no extra dependencies):
   * 1. Resize to MAX_WIDTH (aspect ratio preserved)
   * 2. Encode as JPEG at JPEG_QUALITY
   */
  private optimize(pngBuffer: Buffer): Buffer {
    const image = nativeImage.createFromBuffer(pngBuffer)
    const { width, height } = image.getSize()
    const { screenshotMaxWidth, screenshotQuality } = getConfig().agent

    if (width <= screenshotMaxWidth) {
      // Already small enough — just compress to JPEG
      return image.toJPEG(screenshotQuality)
    }

    // Resize maintaining aspect ratio
    const scale = screenshotMaxWidth / width
    const newWidth = screenshotMaxWidth
    const newHeight = Math.round(height * scale)

    const resized = image.resize({ width: newWidth, height: newHeight, quality: 'good' })
    return resized.toJPEG(screenshotQuality)
  }
}
