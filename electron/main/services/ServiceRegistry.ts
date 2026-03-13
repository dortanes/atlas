import { BaseService } from './base/BaseService'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('ServiceRegistry')

/**
 * ServiceRegistry — simple IoC container for backend services.
 *
 * No framework dependencies. Services register by name, get initialized
 * in registration order, and disposed in reverse order.
 *
 * @example
 * const registry = new ServiceRegistry()
 * registry.register('agent', new AgentService())
 * await registry.initAll()
 * // ... app runs ...
 * await registry.disposeAll()
 */
export class ServiceRegistry {
  private services = new Map<string, BaseService>()
  private initOrder: string[] = []

  /** Register a service by name */
  register<T extends BaseService>(name: string, service: T): void {
    if (this.services.has(name)) {
      throw new Error(`Service "${name}" is already registered`)
    }
    this.services.set(name, service)
    this.initOrder.push(name)
    log.debug(`Registered: ${name}`)
  }

  /** Get a service by name */
  get<T extends BaseService>(name: string): T {
    const service = this.services.get(name)
    if (!service) {
      throw new Error(`Service "${name}" is not registered`)
    }
    return service as T
  }

  /** Check if a service is registered */
  has(name: string): boolean {
    return this.services.has(name)
  }

  /** Initialize all services in registration order */
  async initAll(): Promise<void> {
    log.info(`Initializing ${this.services.size} service(s)...`)
    for (const name of this.initOrder) {
      const service = this.services.get(name)!
      log.debug(`Initializing: ${name}`)
      await service.init()
      log.info(`✓ ${name}`)
    }
    log.info('All services initialized')
  }

  /** Dispose all services in reverse registration order */
  async disposeAll(): Promise<void> {
    log.info('Disposing services...')
    const reversed = [...this.initOrder].reverse()
    for (const name of reversed) {
      const service = this.services.get(name)!
      log.debug(`Disposing: ${name}`)
      try {
        await service.dispose()
        log.info(`✓ Disposed: ${name}`)
      } catch (err) {
        log.error(`Failed to dispose ${name}:`, err)
      }
    }
    this.services.clear()
    this.initOrder = []
  }
}
