import type { RunStatus } from "./core/model"

export interface BobWorkflowGateDecision {
  workspaceRoot?: string
  runId: string
  stepId: string
  ownerStepId?: string
  status: RunStatus
}

export type BobWorkflowGateAcceptResult = "accepted" | "alreadyAccepted" | "aborted" | "missing"

type SettledGateOutcome = "accepted" | "aborted"

interface PendingGate {
  decision: BobWorkflowGateDecision & { ownerStepId: string }
  promise: Promise<boolean>
  reject: (reason: Error) => void
  resolve: (accepted: boolean) => void
}

export class BobWorkflowGateRegistry {
  private readonly pending = new Map<string, PendingGate>()
  private readonly settled = new Map<string, SettledGateOutcome>()
  private readonly settledRuns = new Map<string, SettledGateOutcome>()
  private disposed = false

  waitForDecision(input: BobWorkflowGateDecision): Promise<boolean> {
    const key = gateKey(input.runId, input.stepId)
    const existing = this.pending.get(key)
    if (existing) return existing.promise
    if (this.disposed) return Promise.reject(new Error("Bob workflow gate registry is disposed."))
    this.settled.delete(key)
    this.settledRuns.delete(runKey(input.workspaceRoot, input.runId))

    let resolve!: PendingGate["resolve"]
    let reject!: PendingGate["reject"]
    const promise = new Promise<boolean>((resolveGate, rejectGate) => {
      resolve = resolveGate
      reject = rejectGate
    })
    this.pending.set(key, {
      decision: {
        ...input,
        ownerStepId: input.ownerStepId ?? input.stepId
      },
      promise,
      reject,
      resolve
    })
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
    this.settledRuns.set(runKey(gate.decision.workspaceRoot, runId), "accepted")
    gate.resolve(true)
    return "accepted"
  }

  acceptPending(workspaceRoot: string, runId: string): BobWorkflowGateAcceptResult {
    const gate = this.pendingEntryForRun(workspaceRoot, runId)
    if (gate) return this.accept(runId, gate[1].decision.stepId)
    const settled = this.settledRuns.get(runKey(workspaceRoot, runId))
    if (settled === "accepted") return "alreadyAccepted"
    return settled ?? "missing"
  }

  abort(runId: string, stepId: string, reason: string): boolean {
    const key = gateKey(runId, stepId)
    const gate = this.pending.get(key)
    if (!gate) return false
    this.pending.delete(key)
    this.settled.set(key, "aborted")
    this.settledRuns.set(runKey(gate.decision.workspaceRoot, runId), "aborted")
    gate.reject(new Error(reason))
    return true
  }

  abortPending(workspaceRoot: string, runId: string, reason: string): boolean {
    const gate = this.pendingEntryForRun(workspaceRoot, runId)
    return gate ? this.abort(runId, gate[1].decision.stepId, reason) : false
  }

  pendingForRun(workspaceRoot: string, runId: string): BobWorkflowGateDecision & { ownerStepId: string } | undefined {
    const gate = this.pendingEntryForRun(workspaceRoot, runId)?.[1]
    return gate ? { ...gate.decision } : undefined
  }

  rebind(
    workspaceRoot: string,
    runId: string,
    decision: Pick<BobWorkflowGateDecision, "stepId" | "status">
  ): Promise<boolean> | undefined {
    const entry = this.pendingEntryForRun(workspaceRoot, runId)
    if (!entry) return undefined
    const [currentKey, gate] = entry
    const nextKey = gateKey(runId, decision.stepId)
    const conflict = this.pending.get(nextKey)
    if (conflict && conflict !== gate) return undefined
    if (currentKey !== nextKey) {
      this.pending.delete(currentKey)
      this.pending.set(nextKey, gate)
    }
    this.settled.delete(nextKey)
    gate.decision = {
      ...gate.decision,
      stepId: decision.stepId,
      status: decision.status
    }
    return gate.promise
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
      this.settledRuns.set(runKey(gate.decision.workspaceRoot, gate.decision.runId), "aborted")
      gate.reject(new Error("Bob workflow gate registry is disposed."))
    }
  }

  private pendingEntryForRun(workspaceRoot: string, runId: string): [string, PendingGate] | undefined {
    const matches = [...this.pending.entries()].filter(([, gate]) => (
      gate.decision.workspaceRoot === workspaceRoot && gate.decision.runId === runId
    ))
    return matches.length === 1 ? matches[0] : undefined
  }
}

function gateKey(runId: string, stepId: string): string {
  return `${runId}:${stepId}`
}

function runKey(workspaceRoot: string | undefined, runId: string): string {
  return JSON.stringify([workspaceRoot ?? "", runId])
}
