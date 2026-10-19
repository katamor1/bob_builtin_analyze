export interface DisposalStep { readonly name: string; readonly dispose: () => void | Promise<void> }
export interface DisposalFailure { readonly name: string; readonly error: unknown }
export interface DisposalResult { readonly failures: readonly DisposalFailure[] }

/** Start each cleanup in order; settle all asynchronous results after every attempt. */
export function disposeResourcesInOrder(steps: readonly DisposalStep[]): Promise<DisposalResult> {
  const pending = steps.map(step => {
    try {
      return Promise.resolve(step.dispose()).then(
        () => undefined,
        error => Object.freeze({ name: step.name, error })
      )
    } catch (error) {
      return Promise.resolve(Object.freeze({ name: step.name, error }))
    }
  })
  return Promise.all(pending).then(results => Object.freeze({
    failures: Object.freeze(results.filter((result): result is DisposalFailure => result !== undefined))
  }))
}
