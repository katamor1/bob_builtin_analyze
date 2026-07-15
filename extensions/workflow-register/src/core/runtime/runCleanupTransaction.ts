import { randomUUID } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"
import {
  planWorkflowRunCleanup,
  verifyWorkflowRunCleanupPlan,
  type WorkflowRunCleanupPlan,
  type WorkflowRunDirectoryIdentity,
  type WorkflowRunRetentionInventoryItem
} from "../retention/runRetention"
import { hashWorkflowRunBytes } from "./runEventLog"
import { readRunDurabilityFile } from "./runDurabilityPath"
import { withWorkflowRunCleanupLeases } from "./runCleanupLease"
import { resolveWorkflowRunWorkspaceRoot } from "./workflowRunWorkspaceRootBinding"
import {
  inspectWorkflowRunRetentionCandidatePhysicalEvidence,
  inspectWorkflowRunRetentionDirectoryPhysicalEvidence,
  inspectWorkflowRunRetentionInventory,
  type WorkflowRunRetentionCandidatePhysicalEvidence
} from "./runRetentionInventory"
import { assertSafeWorkflowRunId, readContainedRunFile } from "./runStatePath"

interface WorkflowRunCleanupCandidate {
  runId: string
  revision: string
}

export interface WorkflowRunCleanupTransactionResult {
  removedRunIds: string[]
  transactionId: string
  quarantinePath: string
}

export type WorkflowRunCleanupIncompletePhase = "parent-cleanup" | "purge" | "rollback"

export class WorkflowRunCleanupIncompleteError extends Error {
  readonly phase: WorkflowRunCleanupIncompletePhase
  readonly committedRunIds: readonly string[]
  readonly residualRunIds: readonly string[]
  readonly retainedQuarantinePath: string
  readonly reclaimedBytes = 0

  constructor(options: {
    phase: WorkflowRunCleanupIncompletePhase
    committedRunIds: readonly string[]
    residualRunIds: readonly string[]
    retainedQuarantinePath: string
    cause: unknown
    message: string
  }) {
    super(options.message, { cause: options.cause })
    this.name = "WorkflowRunCleanupIncompleteError"
    this.phase = options.phase
    this.committedRunIds = Object.freeze([...options.committedRunIds])
    this.residualRunIds = Object.freeze([...options.residualRunIds])
    this.retainedQuarantinePath = options.retainedQuarantinePath
  }
}

export interface WorkflowRunCleanupFileSystem {
  mkdir: typeof fs.mkdir
  lstat: typeof fs.lstat
  realpath: typeof fs.realpath
  rename: typeof fs.rename
  rm: typeof fs.rm
  rmdir: typeof fs.rmdir
  readdir: typeof fs.readdir
}

const DEFAULT_FS: WorkflowRunCleanupFileSystem = {
  mkdir: fs.mkdir,
  lstat: fs.lstat,
  realpath: fs.realpath,
  rename: fs.rename,
  rm: fs.rm,
  rmdir: fs.rmdir,
  readdir: fs.readdir
}

export async function applyWorkflowRunCleanupTransaction(input: {
  workspaceRoot: string
  expectedPlan: WorkflowRunCleanupPlan
  transactionId?: string
  fsOps?: Partial<WorkflowRunCleanupFileSystem>
}): Promise<WorkflowRunCleanupTransactionResult> {
  if (!input.expectedPlan) {
    throw new Error("A verified expected cleanup plan is required for a non-empty workflow run cleanup transaction.")
  }
  const candidates = resolveCandidates(input.expectedPlan)
  const transactionId = safeSegment(input.transactionId ?? `cleanup-${randomUUID()}`, "transaction id")
  const fsOps: WorkflowRunCleanupFileSystem = { ...DEFAULT_FS, ...input.fsOps }
  if (candidates.length === 0) return { removedRunIds: [], transactionId, quarantinePath: "" }

  return withWorkflowRunCleanupLeases(input.workspaceRoot, candidates.map((candidate) => candidate.runId), async () => {
    const boundRoot = await resolveWorkflowRunWorkspaceRoot(input.workspaceRoot, fsOps.realpath)
    const root = await fsOps.realpath(boundRoot)
    const workflowsRoot = await ensureDirectoryChain(fsOps, root, [".bob", "workflows"], false)
    const runsRoot = path.join(workflowsRoot, "runs")
    await assertDirectDirectory(fsOps, runsRoot, root, "Workflow runs directory")
    const preflight = await inspectWorkflowRunRetentionInventory(input.workspaceRoot)
    assertExpectedPlanUnchanged(input.expectedPlan, preflight.inventory)
    const expectedEvidence = new Map<string, WorkflowRunRetentionInventoryItem>()
    for (const candidate of candidates) {
      const item = findCandidateEvidence(preflight.inventory, candidate.runId)
      assertCandidateEvidence(item, preflight.referenceGraphComplete, candidate)
      expectedEvidence.set(candidate.runId, item)
    }

    const quarantineBase = path.join(workflowsRoot, "run-cleanup-quarantine")
    await mkdirIfNeeded(fsOps, quarantineBase)
    await assertDirectDirectory(fsOps, quarantineBase, root, "Workflow cleanup quarantine directory")
    const quarantinePath = path.join(quarantineBase, transactionId)
    await fsOps.mkdir(quarantinePath)
    await assertDirectDirectory(fsOps, quarantinePath, root, "Workflow cleanup quarantine transaction")

    const moved: Array<{ runId: string; source: string; target: string; identityVerified: boolean }> = []
    try {
      for (const candidate of candidates) {
        const expected = expectedEvidence.get(candidate.runId)
        if (!expected) throw new Error(`Workflow run '${candidate.runId}' has no locked cleanup evidence.`)
        const boundary = await inspectWorkflowRunRetentionCandidatePhysicalEvidence(input.workspaceRoot, candidate.runId)
        assertCandidatePhysicalEvidence(boundary, candidate, expected)
        await assertCandidateUnchanged(input.workspaceRoot, candidate)
        const source = path.join(runsRoot, candidate.runId)
        const target = path.join(quarantinePath, candidate.runId)
        await assertDirectDirectory(fsOps, source, root, `Workflow run '${candidate.runId}' directory`, expected.directoryIdentity ?? undefined)
        const finalBoundary = await inspectWorkflowRunRetentionCandidatePhysicalEvidence(input.workspaceRoot, candidate.runId)
        assertCandidatePhysicalEvidence(finalBoundary, candidate, expected)
        // Node does not provide an identity-conditional rename. The target identity
        // check immediately after rename detects a source swap without purging it.
        await fsOps.rename(source, target)
        const movedEntry = { runId: candidate.runId, source, target, identityVerified: false }
        moved.push(movedEntry)
        await assertDirectDirectory(fsOps, target, root, `Workflow run '${candidate.runId}' quarantined directory`, expected.directoryIdentity ?? undefined)
        movedEntry.identityVerified = true
      }
    } catch (error) {
      const rollbackErrors: string[] = []
      for (const entry of [...moved].reverse()) {
        try {
          const expected = expectedEvidence.get(entry.runId)
          await assertDirectDirectory(fsOps, entry.target, root, `Workflow run '${entry.runId}' rollback source`, expected?.directoryIdentity ?? undefined)
          await assertMissingRollbackDestination(fsOps, entry.source, entry.runId)
          await assertDirectDirectory(fsOps, runsRoot, root, "Workflow runs rollback directory")
          await fsOps.rename(entry.target, entry.source)
          await assertDirectDirectory(fsOps, entry.source, root, `Workflow run '${entry.runId}' restored directory`, expected?.directoryIdentity ?? undefined)
        } catch (rollbackError) {
          rollbackErrors.push(`${entry.runId}: ${formatError(rollbackError)}`)
        }
      }
      if (rollbackErrors.length > 0) {
        const residualRunIds = await findResidualRunIds(fsOps, moved)
        const residualSet = new Set(residualRunIds)
        const committedRunIds = moved
          .filter((entry) => entry.identityVerified && residualSet.has(entry.runId))
          .map((entry) => entry.runId)
        throw new WorkflowRunCleanupIncompleteError({
          phase: "rollback",
          committedRunIds,
          residualRunIds,
          retainedQuarantinePath: quarantinePath,
          cause: error,
          message: `Workflow run cleanup failed (${formatError(error)}); rollback failed: ${rollbackErrors.join("; ")}. Quarantine preserved at ${quarantinePath}`
        })
      }
      try {
        await fsOps.rmdir(quarantinePath)
      } catch (cleanupError) {
        throw new WorkflowRunCleanupIncompleteError({
          phase: "rollback",
          committedRunIds: [],
          residualRunIds: [],
          retainedQuarantinePath: await retainedPathIfPresent(fsOps, quarantinePath),
          cause: error,
          message: `Workflow run cleanup failed (${formatError(error)}); rollback completed, but quarantine cleanup failed (${formatError(cleanupError)}). Quarantine preserved at ${quarantinePath}`
        })
      }
      try {
        await removeIfEmpty(fsOps, quarantineBase)
      } catch (cleanupError) {
        appendSuppressedError(error, cleanupError, "quarantine parent cleanup also failed")
      }
      throw error
    }

    try {
      for (const entry of moved) {
        const expected = expectedEvidence.get(entry.runId)
        if (!expected) throw new Error(`Workflow run '${entry.runId}' has no locked cleanup evidence before purge.`)
        const evidence = await inspectWorkflowRunRetentionDirectoryPhysicalEvidence(
          input.workspaceRoot,
          entry.target,
          entry.runId
        )
        assertCandidatePhysicalEvidence(evidence, { runId: entry.runId, revision: expected.revision }, expected)
        await assertDirectDirectory(
          fsOps,
          entry.target,
          root,
          `Workflow run '${entry.runId}' purge target`,
          expected.directoryIdentity ?? undefined
        )
        // Node has no handle-relative, identity-conditional recursive remove.
        // Cleanup leases exclude coordinated writers; a direct OS actor still has
        // an unavoidable narrow race between this final check and fs.rm.
        await fsOps.rm(entry.target, { recursive: true, force: false })
      }
      await fsOps.rmdir(quarantinePath)
    } catch (error) {
      const committedRunIds = moved.map((entry) => entry.runId)
      const residualRunIds = await findResidualRunIds(fsOps, moved)
      const retainedQuarantinePath = await retainedPathIfPresent(fsOps, quarantinePath)
      throw new WorkflowRunCleanupIncompleteError({
        phase: "purge",
        committedRunIds,
        residualRunIds,
        retainedQuarantinePath,
        cause: error,
        message: `Workflow run cleanup committed ${committedRunIds.length} run(s), but quarantine purge failed (${formatError(error)}).${retainedQuarantinePath ? ` Quarantine retained at ${retainedQuarantinePath}` : ""}`
      })
    }
    try {
      await removeIfEmpty(fsOps, quarantineBase)
    } catch (error) {
      const retainedQuarantinePath = await retainedPathIfPresent(fsOps, quarantineBase)
      const committedRunIds = moved.map((entry) => entry.runId)
      throw new WorkflowRunCleanupIncompleteError({
        phase: "parent-cleanup",
        committedRunIds,
        residualRunIds: [],
        retainedQuarantinePath,
        cause: error,
        message: `Workflow run cleanup committed ${committedRunIds.length} run(s), but quarantine parent cleanup failed (${formatError(error)}).${retainedQuarantinePath ? ` Quarantine parent retained at ${retainedQuarantinePath}` : ""}`
      })
    }
    return { removedRunIds: moved.map((entry) => entry.runId), transactionId, quarantinePath }
  })
}

async function assertCandidateUnchanged(workspaceRoot: string, candidate: WorkflowRunCleanupCandidate): Promise<void> {
  const [lock, journal, snapshot] = await Promise.all([
    readRunDurabilityFile(workspaceRoot, candidate.runId, "run.lock.json"),
    readRunDurabilityFile(workspaceRoot, candidate.runId, "run-state.journal.json"),
    readContainedRunFile(workspaceRoot, candidate.runId)
  ])
  if (lock) throw new Error(`Workflow run '${candidate.runId}' has an execution lock.`)
  if (journal) throw new Error(`Workflow run '${candidate.runId}' has a pending journal.`)
  const revision = hashWorkflowRunBytes(snapshot.bytes)
  if (revision !== candidate.revision) throw new Error(`Workflow run '${candidate.runId}' changed after cleanup preview.`)
}

function normalizeCandidates(values: readonly WorkflowRunCleanupCandidate[]): WorkflowRunCleanupCandidate[] {
  const seen = new Set<string>()
  const result: WorkflowRunCleanupCandidate[] = []
  for (const candidate of values) {
    assertSafeWorkflowRunId(candidate.runId)
    if (!candidate.revision) throw new Error(`Workflow run '${candidate.runId}' cleanup candidate has no revision.`)
    if (seen.has(candidate.runId)) throw new Error(`Duplicate workflow run cleanup candidate: ${candidate.runId}`)
    seen.add(candidate.runId)
    result.push({ runId: candidate.runId, revision: candidate.revision })
  }
  return result.sort((left, right) => left.runId.localeCompare(right.runId))
}

async function ensureDirectoryChain(
  fsOps: WorkflowRunCleanupFileSystem,
  root: string,
  segments: readonly string[],
  create: boolean
): Promise<string> {
  let current = root
  for (const segment of segments) {
    current = path.join(current, segment)
    if (create) await mkdirIfNeeded(fsOps, current)
    await assertDirectDirectory(fsOps, current, root, `Workflow cleanup directory '${segment}'`)
  }
  return current
}

async function mkdirIfNeeded(fsOps: WorkflowRunCleanupFileSystem, directory: string): Promise<void> {
  try {
    await fsOps.mkdir(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
  }
}

async function assertDirectDirectory(
  fsOps: WorkflowRunCleanupFileSystem,
  directory: string,
  root: string,
  label: string,
  expectedIdentity?: WorkflowRunDirectoryIdentity
): Promise<void> {
  const before = await fsOps.lstat(directory, { bigint: true })
  if (!before.isDirectory() || before.isSymbolicLink()) throw new Error(`${label} must be a direct directory and not a symlink or junction.`)
  const physical = await fsOps.realpath(directory)
  const relative = path.relative(path.resolve(root), path.resolve(physical))
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes the workflow workspace.`)
  if (!samePath(directory, physical)) throw new Error(`${label} must not use an alias or junction.`)
  const after = await fsOps.lstat(directory, { bigint: true })
  if (!after.isDirectory() || after.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino) {
    throw new Error(`${label} changed while its directory identity was being verified.`)
  }
  if (expectedIdentity && (after.dev.toString() !== expectedIdentity.dev || after.ino.toString() !== expectedIdentity.ino)) {
    throw new Error(`${label} directory identity changed before quarantine.`)
  }
}

async function findResidualRunIds(
  fsOps: WorkflowRunCleanupFileSystem,
  moved: ReadonlyArray<{ runId: string; target: string }>
): Promise<string[]> {
  const residual: string[] = []
  for (const entry of moved) {
    try {
      await fsOps.lstat(entry.target)
      residual.push(entry.runId)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") residual.push(entry.runId)
    }
  }
  return residual
}

async function retainedPathIfPresent(fsOps: WorkflowRunCleanupFileSystem, target: string): Promise<string> {
  try {
    await fsOps.lstat(target)
    return target
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "" : target
  }
}

async function assertMissingRollbackDestination(
  fsOps: WorkflowRunCleanupFileSystem,
  destination: string,
  runId: string
): Promise<void> {
  try {
    await fsOps.lstat(destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
  throw new Error(`Workflow run '${runId}' rollback destination appeared while cleanup was in progress.`)
}

async function removeIfEmpty(fsOps: WorkflowRunCleanupFileSystem, directory: string): Promise<void> {
  try {
    await fsOps.rmdir(directory)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "ENOENT" && code !== "ENOTEMPTY") throw error
  }
}

function appendSuppressedError(primary: unknown, secondary: unknown, label: string): void {
  if ((typeof primary === "object" && primary !== null) || typeof primary === "function") {
    try {
      const existing = Reflect.get(primary, "suppressedErrors")
      const suppressedErrors = Object.freeze(Array.isArray(existing) ? [...existing, secondary] : [secondary])
      Object.defineProperty(primary, "suppressedErrors", {
        value: suppressedErrors,
        configurable: true,
        enumerable: false,
        writable: false
      })
    } catch {
      // A frozen or host-provided primary error must still retain precedence.
    }
  }
  if (primary instanceof Error) {
    try {
      primary.message = `${primary.message}; ${label} (${formatError(secondary)})`
    } catch {
      // Message decoration is diagnostic-only and must never replace the primary error.
    }
  }
}

function resolveCandidates(expectedPlan: WorkflowRunCleanupPlan): WorkflowRunCleanupCandidate[] {
  if (!verifyWorkflowRunCleanupPlan(expectedPlan)) throw new Error("Workflow run cleanup plan digest is invalid.")
  return normalizeCandidates(expectedPlan.decisions
    .filter((decision) => decision.action === "delete")
    .map((decision) => ({ runId: decision.runId, revision: decision.revision }))
  )
}

function assertExpectedPlanUnchanged(
  expected: WorkflowRunCleanupPlan,
  inventory: readonly WorkflowRunRetentionInventoryItem[]
): void {
  const refreshed = planWorkflowRunCleanup(inventory, expected.policy)
  if (refreshed.digest !== expected.digest
    || JSON.stringify(refreshed.candidateRunIds) !== JSON.stringify(expected.candidateRunIds)) {
    throw new Error("Workflow run cleanup inventory changed after preview; the cleanup plan changed after cleanup leases were acquired. Refresh and retry.")
  }
}

function findCandidateEvidence(
  inventory: readonly WorkflowRunRetentionInventoryItem[],
  runId: string
): WorkflowRunRetentionInventoryItem {
  const item = inventory.find((entry) => entry.runId === runId)
  if (!item) {
    throw new Error(`Workflow run '${runId}' directory is missing or is not a direct directory; symlinks and junctions are unsupported.`)
  }
  return item
}

function assertCandidateEvidence(
  item: WorkflowRunRetentionInventoryItem,
  referenceGraphComplete: boolean,
  candidate: WorkflowRunCleanupCandidate
): void {
  if (item.revision !== candidate.revision) throw new Error(`Workflow run '${candidate.runId}' changed after cleanup preview.`)
  if (item.lockPresent) throw new Error(`Workflow run '${candidate.runId}' has an execution lock.`)
  if (item.journalPending) throw new Error(`Workflow run '${candidate.runId}' has a pending journal.`)
  if (!item.measurementComplete || !item.pathContained || !item.directoryIdentity) {
    throw new Error(`Workflow run '${candidate.runId}' physical tree measurement is incomplete or unsafe.`)
  }
  if (!referenceGraphComplete || !item.referenceGraphComplete) {
    throw new Error(`Workflow run '${candidate.runId}' reference graph is incomplete.`)
  }
  if (item.referencedBy.length > 0) {
    throw new Error(`Workflow run '${candidate.runId}' is referenced by ${item.referencedBy.join(", ")}.`)
  }
  if (item.pinned || item.readOnly || item.recoverable || (item.status !== "completed" && item.status !== "failed")) {
    throw new Error(`Workflow run '${candidate.runId}' is not eligible for cleanup.`)
  }
}

function assertCandidatePhysicalEvidence(
  item: WorkflowRunRetentionCandidatePhysicalEvidence,
  candidate: WorkflowRunCleanupCandidate,
  expected: WorkflowRunRetentionInventoryItem,
): void {
  if (item.runId !== candidate.runId || item.revision !== candidate.revision) {
    throw new Error(`Workflow run '${candidate.runId}' changed after cleanup preview.`)
  }
  if (item.lockPresent) throw new Error(`Workflow run '${candidate.runId}' has an execution lock.`)
  if (item.journalPending) throw new Error(`Workflow run '${candidate.runId}' has a pending journal.`)
  if (!item.measurementComplete || !item.pathContained || !item.directoryIdentity) {
    throw new Error(`Workflow run '${candidate.runId}' physical tree measurement is incomplete or unsafe.`)
  }
  const unchanged = expected.revision === item.revision
    && expected.retentionRevision === item.retentionRevision
    && expected.treeFingerprint === item.treeFingerprint
    && expected.bytes === item.bytes
    && expected.measurementComplete === item.measurementComplete
    && expected.lockPresent === item.lockPresent
    && expected.journalPending === item.journalPending
    && expected.pathContained === item.pathContained
    && JSON.stringify(expected.directoryIdentity) === JSON.stringify(item.directoryIdentity)
  if (!unchanged) {
    throw new Error(`Workflow run '${candidate.runId}' physical tree or retention evidence changed before quarantine rename.`)
  }
}

function safeSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(value) || value === "." || value === "..") {
    throw new Error(`Workflow run cleanup ${label} is unsafe: ${value}`)
  }
  return value
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value)
  return normalize(left) === normalize(right)
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
