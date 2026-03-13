import { createLogger, type Logger } from '@electron/utils/logger'

/**
 * BaseService — abstract parent for all backend services.
 *
 * Provides:
 * - `init()` / `dispose()` lifecycle hooks
 * - Scoped logger via `createLogger(this.constructor.name)`
 *
 * Every service in `electron/main/services/` must extend this class.
 */
export abstract class BaseService {
  protected readonly log: Logger

  constructor() {
    this.log = createLogger(this.constructor.name)
  }

  /** Initialize the service (called by ServiceRegistry.initAll) */
  abstract init(): Promise<void>

  /** Clean up resources (called by ServiceRegistry.disposeAll) */
  abstract dispose(): Promise<void>
}
