import { randomUUID } from "crypto"
import * as path from "path"
import {
  planWorkflowRunCleanup,
  verifyWorkflowRunCleanupPlan,
  type WorkflowRunCleanupPlan,
  type WorkflowRunRetentionInventoryItem,
  type WorkflowRunRetentionPolicy
} from "../retention/runRetention"
import {
  createWorkflowRunRetentionMetadata,
  serializeWorkflowRunRetentionMetadata
} from "../retention/runRetentionMetadata"
import { applyWorkflowRunCleanupTransaction } from "./runCleanupTransaction"
import { inspectWorkflowRunRetentionInventory } from "./runRetentionInventory"
import { FileRunStateStore } from "./runStateStore"
import { assertSafeWorkflowRunId, writeContainedRunFile } from "./runStatePath"

const RETENTION_FILE = "retention.json"

export interface WorkflowRunStorageSummary {
  runCount: number
  totalBytes: number
  terminalRunCount: number
  recoverableRunCount: number
  pinnedRunCount: number
  referencedRunCount: number
  readOnlyRunCount: number
  unknownRunCount: number
  blockedRunCount: number
  measurementIncompleteRunCount: number
  referenceGraphComplete: boolean
}

export interface WorkflowRunStorageInspection {
  summary: WorkflowRunStorageSummary
  inventory: WorkflowRunRetentionInventoryItem[]
  referenceGraphComplete: boolean
}

export class WorkflowRunRetentionService {
  private readonly workspaceRoot: string
  private readonly now: () => string
  private readonly runStore: FileRunStateStore

  constructor(options: { workspaceRoot: string; now?: () => string }) {
    this.workspaceRoot = path.resolve(options.workspaceRoot)
    this.now = options.now ?? (() => new Date().toISOString())
    this.runStore = new FileRunStateStore({ workspaceRoot: this.workspaceRoot })
  }

  async inspect(): Promise<WorkflowRunStorageInspection> {
    const snapshot = await inspectWorkflowRunRetentionInventory(this.workspaceRoot)
    const inventory = snapshot.inventory
    const summary: WorkflowRunStorageSummary = {
      runCount: inventory.length,
      totalBytes: inventory.reduce((sum, item) => sum + item.bytes, 0),
      terminalRunCount: inventory.filter((item) => item.status === "completed" || item.status === "failed").length,
      recoverableRunCount: inventory.filter((item) => item.recoverable).length,
      pinnedRunCount: inventory.filter((item) => item.pinned).length,
      referencedRunCount: inventory.filter((item) => item.referencedBy.length > 0).length,
      readOnlyRunCount: inventory.filter((item) => item.readOnly).length,
      unknownRunCount: inventory.filter((item) => item.status === "unknown").length,
      blockedRunCount: inventory.filter(isUnconditionallyBlocked).length,
      measurementIncompleteRunCount: inventory.filter((item) => !item.measurementComplete).length,
      referenceGraphComplete: snapshot.referenceGraphComplete
    }
    return { inventory, summary, referenceGraphComplete: snapshot.referenceGraphComplete }
  }

  async inventory(): Promise<WorkflowRunRetentionInventoryItem[]> {
    return (await this.inspect()).inventory
  }

  async summarize(): Promise<WorkflowRunStorageSummary> {
    return (await this.inspect()).summary
  }

  async preview(policy: Omit<WorkflowRunRetentionPolicy, "now"> & { now?: string }): Promise<WorkflowRunCleanupPlan> {
    const inspection = await this.inspect()
    return planWorkflowRunCleanup(inspection.inventory, { ...policy, now: policy.now ?? this.now() })
  }

  async apply(plan: WorkflowRunCleanupPlan): Promise<{ removedRunIds: string[]; reclaimedBytes: number; transactionId?: string }> {
    if (!verifyWorkflowRunCleanupPlan(plan)) throw new Error("Workflow run cleanup plan digest is invalid.")
    const refreshed = planWorkflowRunCleanup((await this.inspect()).inventory, plan.policy)
    if (refreshed.digest !== plan.digest) throw new Error("Workflow run cleanup inventory changed after preview; refresh and retry.")
    const candidates = refreshed.decisions
      .filter((decision) => decision.action === "delete")
      .map((decision) => ({ runId: decision.runId, revision: decision.revision }))
    if (candidates.length === 0) return { removedRunIds: [], reclaimedBytes: 0 }
    const transaction = await applyWorkflowRunCleanupTransaction({
      workspaceRoot: this.workspaceRoot,
      candidates,
      transactionId: `cleanup-${randomUUID()}`
    })
    const removed = new Set(transaction.removedRunIds)
    return {
      removedRunIds: transaction.removedRunIds,
      reclaimedBytes: refreshed.decisions.filter((decision) => removed.has(decision.runId)).reduce((sum, decision) => sum + decision.bytes, 0),
      transactionId: transaction.transactionId
    }
  }

  async setPinned(runId: string, pinned: boolean, note?: string): Promise<void> {
    assertSafeWorkflowRunId(runId)
    await this.runStore.withRunLock(runId, async () => {
      const run = await this.runStore.loadRun(runId)
      if (!run) throw new Error(`Workflow run not found: ${runId}`)
      const metadata = createWorkflowRunRetentionMetadata({ pinned, updatedAt: this.now(), note })
      await writeContainedRunFile(
        this.workspaceRoot,
        runId,
        serializeWorkflowRunRetentionMetadata(metadata),
        RETENTION_FILE
      )
    }, { requireExistingRunDirectory: true })
  }
}

function isUnconditionallyBlocked(item: WorkflowRunRetentionInventoryItem): boolean {
  return item.recoverable
    || item.pinned
    || item.referencedBy.length > 0
    || item.readOnly
    || item.journalPending
    || item.lockPresent
    || !item.pathContained
    || !item.measurementComplete
    || !item.referenceGraphComplete
    || (item.status !== "completed" && item.status !== "failed")
}
