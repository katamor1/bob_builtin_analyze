export class ReviewAcceptanceCoordinator {
  private readonly inFlight = new Map<string, Promise<unknown>>()

  coordinate<T>(workspaceRoot: string, runId: string, operation: () => Promise<T>): Promise<T> {
    const key = acceptanceKey(workspaceRoot, runId)
    const existing = this.inFlight.get(key)
    if (existing) return existing as Promise<T>

    const owner = Promise.resolve().then(operation)
    let coordinated!: Promise<T>
    coordinated = owner.finally(() => {
      if (this.inFlight.get(key) === coordinated) this.inFlight.delete(key)
    })
    this.inFlight.set(key, coordinated)
    return coordinated
  }
}

function acceptanceKey(workspaceRoot: string, runId: string): string {
  return JSON.stringify([workspaceRoot, runId])
}
