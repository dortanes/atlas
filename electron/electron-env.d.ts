/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string
    VITE_PUBLIC: string
  }
}

/** Preload API exposed via contextBridge */
interface ElectronAPI {
  /** Toggle click-through on the transparent window */
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
