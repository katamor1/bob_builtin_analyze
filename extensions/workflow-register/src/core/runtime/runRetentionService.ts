import { randomUUID } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"
import type { WorkflowRunState } from "../model"
import {
  planWorkflowRunCleanup,
  verifyWorkflowRunCleanupPlan,
  type WorkflowRunCleanupPlan,
  type WorkflowRunRetentionInventoryItem,
  type WorkflowRunRetentionPolicy
} from "../retention/runRetention"
import {
  createWorkflowRunRetentionMetadata,
  decodeWorkflowRunRetentionMetadata,
  serializeWorkflowRunRetentionMetadata
} from "../retention/runRetentionMetadata"
import { isWorkflowRunStateWritable } from "../runStateStore"
import { applyWorkflowRunCleanupTransaction } from "./runCleanupTransaction"
import { hashWorkflowRunBytes } from "./runEventLog"
import { readRunDurabilityFile } from "./runDurabilityPath"
import { FileRunStateStore } from "./runStateStore"
import { assertSafeWorkflowRunId, readContainedRunFile, writeContainedRunFile } from "./runStatePath"

const RECOVERABLE_STATUSES = new Set(["running", "paused", "checkpoint", "reviewing", "held"])
const RETENTION_FILE = "retention.json"

export interface WorkflowRunStorageSummary {
  runCount: number
  totalBytes: number
  terminalRunCount: number
  recoverableRunCount: number
  pinnedRunCount: number
  referencedRunCount: number
  readOnlyRunCount: number
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

  async inventory(): Promise<WorkflowRunRetentionInventoryItem[]> {
    const runs = await this.runStore.listRuns()
    const references = collectSourceRunReferences(runs)
    const items = await Promise.all(runs.map(async (run): Promise<WorkflowRunRetentionInventoryItem> => {
      const [snapshot, measurement, retention, lock, journal] = await Promise.all([
        readContainedRunFile(this.workspaceRoot, run.runId),
        measureRunDirectory(this.workspaceRoot, run.runId),
        readRetentionSidecar(this.workspaceRoot, run.runId),
        readRunDurabilityFile(this.workspaceRoot, run.runId, "run.lock.json"),
        readRunDurabilityFile(this.workspaceRoot, run.runId, "run-state.journal.json")
      ])
      return {
        runId: run.runId,
        status: run.status,
        updatedAt: run.updatedAt,
        bytes: measurement.bytes,
        revision: hashWorkflowRunBytes(snapshot.bytes),
        recoverable: RECOVERABLE_STATUSES.has(run.status),
        pinned: retention.pinned,
        referencedBy: references.get(run.runId) ?? [],
        readOnly: !isWorkflowRunStateWritable(run),
        journalPending: Boolean(journal),
        lockPresent: Boolean(lock),
        pathContained: measurement.contained
      }
    }))
    return items.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.runId.localeCompare(right.runId))
  }

  async summarize(): Promise<WorkflowRunStorageSummary> {
    const inventory = await this.inventory()
    return {
      runCount: inventory.length,
      totalBytes: inventory.reduce((sum, item) => sum + item.bytes, 0),
      terminalRunCount: inventory.filter((item) => item.status === "completed" || item.status === "failed").length,
      recoverableRunCount: inventory.filter((item) => item.recoverable).length,
      pinnedRunCount: inventory.filter((item) => item.pinned).length,
      referencedRunCount: inventory.filter((item) => item.referencedBy.length > 0).length,
      readOnlyRunCount: inventory.filter((item) => item.readOnly).length
    }
  }

  async preview(policy: Omit<WorkflowRunRetentionPolicy, "now"> & { now?: string }): Promise<WorkflowRunCleanupPlan> {
    return planWorkflowRunCleanup(await this.inventory(), { ...policy, now: policy.now ?? this.now() })
  }

  async apply(plan: WorkflowRunCleanupPlan): Promise<{ removedRunIds: string[]; reclaimedBytes: number; transactionId?: string }> {
    if (!verifyWorkflowRunCleanupPlan(plan)) throw new Error("Workflow run cleanup plan digest is invalid.")
    const refreshed = planWorkflowRunCleanup(await this.inventory(), plan.policy)
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
    })
  }
}

function collectSourceRunReferences(runs: readonly WorkflowRunState[]): Map<string, string[]> {
  const references = new Map<string, Set<string>>()
  for (const run of runs) {
    for (const raw of Object.values(run.state)) {
      for (const sourceRunId of sourceRunIdsFromValue(raw)) {
        if (sourceRunId === run.runId) continue
        const existing = references.get(sourceRunId) ?? new Set<string>()
        existing.add(run.runId)
        references.set(sourceRunId, existing)
      }
    }
  }
  return new Map([...references].map(([runId, referrers]) => [runId, [...referrers].sort()]))
}

function sourceRunIdsFromValue(value: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return []
  }
  const output = new Set<string>()
  const visit = (current: unknown, depth: number, seen: Set<unknown>) => {
    if (!current || typeof current !== "object" || depth > 8 || seen.has(current)) return
    seen.add(current)
    if (Array.isArray(current)) {
      current.forEach((item) => visit(item, depth + 1, seen))
      return
    }
    const record = current as Record<string, unknown>
    if (typeof record.sourceRunId === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(record.sourceRunId)) output.add(record.sourceRunId)
    Object.values(record).forEach((item) => visit(item, depth + 1, seen))
  }
  visit(parsed, 0, new Set())
  return [...output]
}

async function readRetentionSidecar(workspaceRoot: string, runId: string): Promise<{ pinned: boolean }> {
  try {
    const snapshot = await readContainedRunFile(workspaceRoot, runId, RETENTION_FILE)
    const decoded = decodeWorkflowRunRetentionMetadata(snapshot.bytes.toString("utf8"))
    return decoded.status === "valid" ? { pinned: decoded.metadata.pinned } : { pinned: true }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { pinned: false }
    return { pinned: true }
  }
}

async function measureRunDirectory(workspaceRoot: string, runId: string): Promise<{ bytes: number; contained: boolean }> {
  try {
    const root = await fs.realpath(path.resolve(workspaceRoot))
    const directory = path.join(root, ".bob", "workflows", "runs", runId)
    await assertDirectDirectory(directory, root, `Workflow run '${runId}' directory`)
    return { bytes: await measureDirectory(root, directory), contained: true }
  } catch {
    return { bytes: 0, contained: false }
  }
}

async function measureDirectory(root: string, directory: string): Promise<number> {
  let total = 0
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    const stat = await fs.lstat(target)
    if (stat.isSymbolicLink()) throw new Error(`Workflow run retention refuses symbolic links: ${target}`)
    const physical = await fs.realpath(target)
    assertContained(root, physical, `Workflow run retention path '${target}'`)
    if (stat.isDirectory()) total += await measureDirectory(root, target)
    else if (stat.isFile()) total += stat.size
    else throw new Error(`Workflow run retention refuses non-file entries: ${target}`)
  }
  return total
}

async function assertDirectDirectory(directory: string, root: string, label: string): Promise<void> {
  const stat = await fs.lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a direct directory.`)
  const physical = await fs.realpath(directory)
  assertContained(root, physical, label)
  if (!samePath(directory, physical)) throw new Error(`${label} must not use an alias or junction.`)
}

function assertContained(root: string, target: string, label: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return
  throw new Error(`${label} escapes the workflow workspace.`)
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value)
  return normalize(left) === normalize(right)
}
