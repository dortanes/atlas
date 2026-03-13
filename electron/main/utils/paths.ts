import { app } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * Path resolution constants for the Electron main process.
 *
 * Resolves build artifacts, preload scripts, and public assets
 * depending on whether the app is packaged or running in dev mode.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isPackaged = app.isPackaged

process.env.APP_ROOT = isPackaged ? __dirname : path.join(__dirname, '../..')

export const MAIN_DIST = isPackaged
  ? __dirname
  : path.join(process.env.APP_ROOT, '.build/dist-electron')

export const RENDERER_DIST = isPackaged
  ? path.join(__dirname, '../../../.build/dist')
  : path.join(process.env.APP_ROOT, 'dist')

export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

export const preload = path.join(__dirname, '../preload/index.mjs')
export const indexHtml = path.join(RENDERER_DIST, 'index.html')
