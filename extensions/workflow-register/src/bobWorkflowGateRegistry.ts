import type { RunStatus } from "./core/model"

export interface BobWorkflowGateDecision {
  runId: string
  stepId: string
  status: RunStatus
}

export type BobWorkflowGateAcceptResult = "accepted" | "alreadyAccepted" | "aborted" | "missing"

type SettledGateOutcome = "accepted" | "aborted"

interface PendingGate {
  promise: Promise<boolean>
  reject: (reason: Error) => void
  resolve: (accepted: boolean) => void
}

export class BobWorkflowGateRegistry {
  private readonly pending = new Map<string, PendingGate>()
  private readonly settled = new Map<string, SettledGateOutcome>()
  private disposed = false

  waitForDecision(input: BobWorkflowGateDecision): Promise<boolean> {
    const key = gateKey(input.runId, input.stepId)
    const existing = this.pending.get(key)
    if (existing) return existing.promise
    if (this.disposed) return Promise.reject(new Error("Bob workflow gate registry is disposed."))
    this.settled.delete(key)

    let resolve!: PendingGate["resolve"]
    let reject!: PendingGate["reject"]
    const promise = new Promise<boolean>((resolveGate, rejectGate) => {
      resolve = resolveGate
      reject = rejectGate
    })
    this.pending.set(key, { promise, reject, resolve })
    return promise
  }

  accept(runId: string, stepId: string): BobWorkflowGateAcceptResult {
    const key = gateKey(runId, stepId)
    const gate = this.pending.get(key)
    if (!gate) {
      const settled = this.settled.get(key)
      if (settled === "accepted") return "alreadyAccepted"
      return settled ?? "missing"
    }
    this.pending.delete(key)
    this.settled.set(key, "accepted")
    gate.resolve(true)
    return "accepted"
  }

  abort(runId: string, stepId: string, reason: string): boolean {
    const key = gateKey(runId, stepId)
    const gate = this.pending.get(key)
    if (!gate) return false
    this.pending.delete(key)
    this.settled.set(key, "aborted")
    gate.reject(new Error(reason))
    return true
  }

  isPending(runId: string, stepId: string): boolean {
    return this.pending.has(gateKey(runId, stepId))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const gates = [...this.pending.entries()]
    this.pending.clear()
    for (const [key, gate] of gates) {
      this.settled.set(key, "aborted")
      gate.reject(new Error("Bob workflow gate registry is disposed."))
    }
  }
}

function gateKey(runId: string, stepId: string): string {
  return `${runId}:${stepId}`
}
