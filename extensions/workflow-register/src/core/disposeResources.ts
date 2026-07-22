export interface DisposalStep {
  readonly label: string
  readonly propagate: boolean
  readonly dispose: () => void
}

export interface DisposalFailure {
  readonly label: string
  readonly error: unknown
}

export interface DisposalResult {
  readonly failures: readonly DisposalFailure[]
  readonly hasPropagatedError: boolean
  readonly firstPropagatedError: unknown
}

/**
 * Dispose every resource in the declared order while retaining the first error
 * whose caller-visible behavior must be preserved.
 */
export function disposeResourcesInOrder(steps: readonly DisposalStep[]): DisposalResult {
  const failures: DisposalFailure[] = []
  let hasPropagatedError = false
  let firstPropagatedError: unknown

  for (const step of steps) {
    try {
      step.dispose()
    } catch (error) {
      failures.push({ label: step.label, error })
      if (step.propagate && !hasPropagatedError) {
        hasPropagatedError = true
        firstPropagatedError = error
      }
    }
  }

  return { failures, hasPropagatedError, firstPropagatedError }
}
