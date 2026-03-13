/**
 * BaseClassifier — abstract base for all classifiers.
 *
 * Every classifier (intent detection, risk assessment, …) implements
 * this contract so ClassifierService can store and retrieve them uniformly.
 *
 * @template TInput  — the shape of data fed into the classifier
 * @template TOutput — the result type returned by the classifier
 */
export abstract class BaseClassifier<TInput = unknown, TOutput = unknown> {
  /** Unique name used to retrieve the classifier from ClassifierService. */
  abstract readonly name: string

  /**
   * Run the classification.
   * May be synchronous logic or an async LLM call — the caller doesn't care.
   */
  abstract classify(input: TInput): Promise<TOutput>
}
