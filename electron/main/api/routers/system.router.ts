import os from 'node:os'
import { BrowserWindow, screen, systemPreferences } from 'electron'
import { observable } from '@trpc/server/observable'
import { z } from 'zod'
import { trpcRouter, publicProcedure } from '@electron/api/context'
import { mainEventBus } from '@electron/utils/eventBus'
import { getAccentHsl } from '@electron/utils/color'
import { toggleWindow } from '@electron/WindowManager'

/**
 * system.router — queries & subscriptions for system-level info.
 */
export const systemRouter = trpcRouter({
  /** Get current system info snapshot */
  getSystemInfo: publicProcedure.query(() => {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize

    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      screenWidth: width,
      screenHeight: height,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
    }
  }),

  /** Get OS accent color as HSL (one-time) */
  getAccentColor: publicProcedure.query(() => getAccentHsl()),

  /** Subscribe to OS accent color changes */
  onAccentColorChange: publicProcedure.subscription(() => {
    return observable<{ h: number; s: number; l: number }>((emit) => {
      emit.next(getAccentHsl())

      const handler = () => emit.next(getAccentHsl())
      systemPreferences.on('accent-color-changed', handler)

      return () => {
        systemPreferences.removeListener('accent-color-changed', handler)
      }
    })
  }),

  /** Subscribe to agent visibility toggled from tray */
  onAgentVisibility: publicProcedure.subscription(() => {
    return observable<boolean>((emit) => {
      emit.next(true)

      const handler = (visible: boolean) => emit.next(visible)
      mainEventBus.on('agent-visibility', handler)

      return () => {
        mainEventBus.removeListener('agent-visibility', handler)
      }
    })
  }),

  /** Toggle click-through on the overlay window */
  setIgnoreMouseEvents: publicProcedure
    .input(z.object({
      ignore: z.boolean(),
      forward: z.boolean().optional(),
    }))
    .mutation(({ input }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) return
      win.setIgnoreMouseEvents(input.ignore, input.forward ? { forward: true } : undefined)
    }),

  /** Subscribe to "open settings" events from tray */
  onOpenSettings: publicProcedure.subscription(() => {
    return observable<boolean>((emit) => {
      const handler = () => emit.next(true)
      mainEventBus.on('system:open-settings', handler)
      return () => {
        mainEventBus.removeListener('system:open-settings', handler)
      }
    })
  }),

  /** Close settings — notify renderer to switch back */
  closeSettings: publicProcedure.mutation(() => {
    mainEventBus.emit('system:close-settings')
  }),

  /** Hide the Atlas window (triggered by Escape from renderer) */
  hideWindow: publicProcedure.mutation(() => {
    toggleWindow()
  }),
})
