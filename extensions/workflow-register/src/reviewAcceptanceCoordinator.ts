export type ReviewAcceptanceOperationKind =
  | "review-accept"
  | "run-resume"
  | "run-retry"
  | "checkpoint-approve"
  | "checkpoint-abort"

interface InFlightOperation {
  kind: ReviewAcceptanceOperationKind
  promise: Promise<unknown>
}

export class ReviewAcceptanceCoordinator {
  private readonly inFlight = new Map<string, InFlightOperation>()

  coordinate<T>(
    workspaceRoot: string,
    runId: string,
    kind: ReviewAcceptanceOperationKind,
    operation: () => Promise<T>
  ): Promise<T> {
    const key = acceptanceKey(workspaceRoot, runId)
    const existing = this.inFlight.get(key)
    if (existing?.kind === kind) return existing.promise as Promise<T>
    if (existing) {
      const retry = () => this.coordinate(workspaceRoot, runId, kind, operation)
      return existing.promise.then(retry, retry)
    }

    const owner = Promise.resolve().then(operation)
    let coordinated!: Promise<T>
    coordinated = owner.finally(() => {
      if (this.inFlight.get(key)?.promise === coordinated) this.inFlight.delete(key)
    })
    this.inFlight.set(key, { kind, promise: coordinated })
    return coordinated
  }
}

function acceptanceKey(workspaceRoot: string, runId: string): string {
  return JSON.stringify([workspaceRoot, runId])
}
