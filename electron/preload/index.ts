import { exposeElectronTRPC } from 'electron-trpc/main'

// ── electron-trpc bridge (sole preload responsibility) ──
process.once('loaded', async () => exposeElectronTRPC())
