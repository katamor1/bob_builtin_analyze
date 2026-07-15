import { createHash } from "crypto"
import type { RunStatus } from "../model"

export const CURRENT_WORKFLOW_RUN_CLEANUP_PLAN_SCHEMA_VERSION = "workflow-register/run-cleanup-plan/v1" as const

export type WorkflowRunRetentionStatus = RunStatus | "unknown"
export type WorkflowRunRetentionInspectionStatus = "valid" | "legacy" | "future" | "invalid" | "missing" | "unsafe"

export interface WorkflowRunDirectoryIdentity {
  dev: string
  ino: string
}

export interface WorkflowRunRetentionInventoryItem {
  runId: string
  status: WorkflowRunRetentionStatus
  updatedAt: string
  bytes: number
  revision: string
  recoverable: boolean
  pinned: boolean
  referencedBy: string[]
  readOnly: boolean
  journalPending: boolean
  lockPresent: boolean
  pathContained: boolean
  inspectionStatus: WorkflowRunRetentionInspectionStatus
  measurementComplete: boolean
  referenceGraphComplete: boolean
  retentionRevision: string
  directoryIdentity: WorkflowRunDirectoryIdentity | null
  treeFingerprint: string
}

export interface WorkflowRunRetentionPolicy {
  now: string
  completedDays?: number
  maxCompletedRuns?: number
  maxTotalBytes?: number
  selectedRunIds?: string[]
}

export interface WorkflowRunCleanupDecision {
  runId: string
  status: WorkflowRunRetentionStatus
  updatedAt: string
  bytes: number
  revision: string
  retentionRevision: string
  directoryIdentity: WorkflowRunDirectoryIdentity | null
  treeFingerprint: string
  measurementComplete: boolean
  action: "keep" | "delete"
  reasons: string[]
  blockers: string[]
}

export interface WorkflowRunCleanupPlan {
  schemaVersion: typeof CURRENT_WORKFLOW_RUN_CLEANUP_PLAN_SCHEMA_VERSION
  createdAt: string
  policy: WorkflowRunRetentionPolicy
  decisions: WorkflowRunCleanupDecision[]
  candidateRunIds: string[]
  totalBytes: number
  reclaimBytes: number
  digest: string
}

const ACTIVE_STATUSES = new Set<WorkflowRunRetentionStatus>(["running", "paused", "checkpoint", "reviewing", "held"])
const TERMINAL_STATUSES = new Set<WorkflowRunRetentionStatus>(["completed", "failed"])
const DAY_MS = 24 * 60 * 60 * 1000

export function planWorkflowRunCleanup(
  inventory: readonly WorkflowRunRetentionInventoryItem[],
  inputPolicy: WorkflowRunRetentionPolicy
): WorkflowRunCleanupPlan {
  const policy = normalizePolicy(inputPolicy)
  const nowMs = Date.parse(policy.now)
  const items = [...inventory].map(normalizeInventoryItem).sort(compareInventory)
  assertUniqueRunIds(items)

  const blockers = new Map(items.map((item) => [item.runId, blockersFor(item)]))
  const reasons = new Map(items.map((item) => [item.runId, new Set<string>()]))
  const selected = new Set(policy.selectedRunIds ?? [])

  if (selected.size > 0) {
    for (const item of items) {
      if (selected.has(item.runId)) reasons.get(item.runId)?.add("selected")
    }
  }

  if (policy.completedDays !== undefined) {
    const cutoff = nowMs - policy.completedDays * DAY_MS
    for (const item of items) {
      if (Date.parse(item.updatedAt) < cutoff) reasons.get(item.runId)?.add("age")
    }
  }

  if (policy.maxCompletedRuns !== undefined) {
    const terminal = items.filter((item) => TERMINAL_STATUSES.has(item.status))
    const excess = Math.max(0, terminal.length - policy.maxCompletedRuns)
    let marked = 0
    for (const item of terminal) {
      if (marked >= excess) break
      if ((blockers.get(item.runId) ?? []).length > 0) continue
      reasons.get(item.runId)?.add("run-count")
      marked += 1
    }
  }

  if (policy.maxTotalBytes !== undefined) {
    let projected = items.reduce((sum, item) => sum + item.bytes, 0)
    for (const item of items) {
      if (projected <= policy.maxTotalBytes) break
      if ((blockers.get(item.runId) ?? []).length > 0) continue
      reasons.get(item.runId)?.add("storage-budget")
      projected -= item.bytes
    }
  }

  const decisions = items.map((item): WorkflowRunCleanupDecision => {
    const itemBlockers = blockers.get(item.runId) ?? []
    const itemReasons = [...(reasons.get(item.runId) ?? [])].sort()
    return {
      runId: item.runId,
      status: item.status,
      updatedAt: item.updatedAt,
      bytes: item.bytes,
      revision: item.revision,
      retentionRevision: item.retentionRevision,
      directoryIdentity: item.directoryIdentity,
      treeFingerprint: item.treeFingerprint,
      measurementComplete: item.measurementComplete,
      action: itemBlockers.length === 0 && itemReasons.length > 0 ? "delete" : "keep",
      reasons: itemReasons,
      blockers: itemBlockers
    }
  })
  const candidateRunIds = decisions.filter((decision) => decision.action === "delete").map((decision) => decision.runId)
  const totalBytes = decisions.reduce((sum, decision) => sum + decision.bytes, 0)
  const reclaimBytes = decisions.filter((decision) => decision.action === "delete").reduce((sum, decision) => sum + decision.bytes, 0)
  const unsigned = {
    schemaVersion: CURRENT_WORKFLOW_RUN_CLEANUP_PLAN_SCHEMA_VERSION,
    createdAt: policy.now,
    policy,
    decisions,
    candidateRunIds,
    totalBytes,
    reclaimBytes
  }
  return { ...unsigned, digest: cleanupPlanDigest(unsigned) }
}

export function verifyWorkflowRunCleanupPlan(plan: WorkflowRunCleanupPlan): boolean {
  if (plan.schemaVersion !== CURRENT_WORKFLOW_RUN_CLEANUP_PLAN_SCHEMA_VERSION) return false
  const { digest, ...unsigned } = plan
  return digest === cleanupPlanDigest(unsigned)
}

function normalizePolicy(policy: WorkflowRunRetentionPolicy): WorkflowRunRetentionPolicy {
  if (!Number.isFinite(Date.parse(policy.now))) throw new Error(`Invalid retention policy timestamp: ${policy.now}`)
  const completedDays = optionalNonNegative(policy.completedDays, "completedDays")
  const maxCompletedRuns = optionalNonNegativeInteger(policy.maxCompletedRuns, "maxCompletedRuns")
  const maxTotalBytes = optionalNonNegativeInteger(policy.maxTotalBytes, "maxTotalBytes")
  const selectedRunIds = policy.selectedRunIds ? uniqueStrings(policy.selectedRunIds.map(assertSelectedRunId)).sort() : undefined
  if (completedDays === undefined && maxCompletedRuns === undefined && maxTotalBytes === undefined && (selectedRunIds?.length ?? 0) === 0) {
    throw new Error("Workflow run retention policy must enable at least one cleanup criterion.")
  }
  return {
    now: new Date(policy.now).toISOString(),
    completedDays,
    maxCompletedRuns,
    maxTotalBytes,
    selectedRunIds
  }
}

function normalizeInventoryItem(item: WorkflowRunRetentionInventoryItem): WorkflowRunRetentionInventoryItem {
  if (!item.runId) throw new Error("Workflow run retention inventory contains an empty runId.")
  if (!Number.isFinite(Date.parse(item.updatedAt))) throw new Error(`Workflow run '${item.runId}' has an invalid updatedAt timestamp.`)
  if (!Number.isFinite(item.bytes) || item.bytes < 0) throw new Error(`Workflow run '${item.runId}' has invalid byte size.`)
  if (!item.revision) throw new Error(`Workflow run '${item.runId}' has no revision.`)
  if (!item.retentionRevision) throw new Error(`Workflow run '${item.runId}' has no retention revision.`)
  if (!item.treeFingerprint) throw new Error(`Workflow run '${item.runId}' has no physical tree fingerprint.`)
  if (item.directoryIdentity && (!/^\d+$/.test(item.directoryIdentity.dev) || !/^\d+$/.test(item.directoryIdentity.ino))) {
    throw new Error(`Workflow run '${item.runId}' has an invalid directory identity.`)
  }
  return {
    ...item,
    bytes: Math.floor(item.bytes),
    directoryIdentity: item.directoryIdentity ? { ...item.directoryIdentity } : null,
    referencedBy: uniqueStrings(item.referencedBy).sort()
  }
}

function blockersFor(item: WorkflowRunRetentionInventoryItem): string[] {
  const blockers: string[] = []
  if (ACTIVE_STATUSES.has(item.status)) blockers.push(`active:${item.status}`)
  if (!TERMINAL_STATUSES.has(item.status)) blockers.push(`non-terminal:${item.status}`)
  if (item.recoverable) blockers.push("recoverable")
  if (item.pinned) blockers.push("pinned")
  if (item.referencedBy.length > 0) blockers.push(`referenced-by:${item.referencedBy.join(",")}`)
  if (item.readOnly) blockers.push("read-only")
  if (item.journalPending) blockers.push("journal-pending")
  if (item.lockPresent) blockers.push("execution-lock-present")
  if (item.inspectionStatus === "future") blockers.push("future-run-state")
  if (item.inspectionStatus === "invalid") blockers.push("run-state-invalid")
  if (item.inspectionStatus === "missing") blockers.push("run-state-missing")
  if (item.inspectionStatus === "unsafe") blockers.push("unsafe-inventory-entry")
  if (!item.measurementComplete) blockers.push("measurement-incomplete")
  if (!item.referenceGraphComplete) blockers.push("reference-graph-incomplete")
  if (!item.directoryIdentity) blockers.push("directory-identity-unavailable")
  if (!item.pathContained) blockers.push("path-not-contained")
  return uniqueStrings(blockers).sort()
}

function compareInventory(left: WorkflowRunRetentionInventoryItem, right: WorkflowRunRetentionInventoryItem): number {
  return left.updatedAt.localeCompare(right.updatedAt) || left.runId.localeCompare(right.runId)
}

function assertUniqueRunIds(items: readonly WorkflowRunRetentionInventoryItem[]): void {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.runId)) throw new Error(`Duplicate workflow run retention inventory id: ${item.runId}`)
    seen.add(item.runId)
  }
}

function optionalNonNegative(value: number | undefined, label: string): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isFinite(value) || value < 0) throw new Error(`Workflow run retention ${label} must be a non-negative finite number.`)
  return value
}

function optionalNonNegativeInteger(value: number | undefined, label: string): number | undefined {
  const normalized = optionalNonNegative(value, label)
  if (normalized === undefined) return undefined
  if (!Number.isInteger(normalized)) throw new Error(`Workflow run retention ${label} must be an integer.`)
  return normalized
}

function assertSelectedRunId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(value) || /[. ]$/.test(value)) {
    throw new Error(`Workflow run retention selectedRunIds contains an unsafe id: ${value}`)
  }
  return value
}

function cleanupPlanDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))]
}
