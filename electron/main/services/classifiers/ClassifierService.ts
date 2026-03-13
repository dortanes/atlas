import { BaseService } from '@electron/services/base/BaseService'
import { BaseClassifier } from './BaseClassifier'

/**
 * ClassifierService — registry & façade for all classifiers.
 *
 * Register classifiers during app bootstrap, then retrieve them by name
 * anywhere via `classifierService.get<T>('name')`.
 */
export class ClassifierService extends BaseService {
  private classifiers = new Map<string, BaseClassifier>()

  /** Register a classifier instance. Overwrites if name already exists. */
  register(classifier: BaseClassifier): void {
    this.classifiers.set(classifier.name, classifier)
    this.log.debug(`Registered classifier: ${classifier.name}`)
  }

  /** Retrieve a classifier by name with type narrowing. */
  get<T extends BaseClassifier>(name: string): T {
    const c = this.classifiers.get(name)
    if (!c) {
      throw new Error(`Classifier "${name}" not registered`)
    }
    return c as T
  }

  /** Check if a classifier with the given name is registered. */
  has(name: string): boolean {
    return this.classifiers.has(name)
  }

  async init(): Promise<void> {
    this.log.info(`ClassifierService initialized (${this.classifiers.size} classifier(s))`)
  }

  async dispose(): Promise<void> {
    this.classifiers.clear()
    this.log.info('ClassifierService disposed')
  }
}
