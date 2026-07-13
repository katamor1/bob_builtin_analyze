import { randomUUID } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"
import { hashWorkflowRunBytes } from "./runEventLog"
import { readRunDurabilityFile } from "./runDurabilityPath"
import { withWorkflowRunCleanupLeases } from "./runCleanupLease"
import { assertSafeWorkflowRunId, readContainedRunFile } from "./runStatePath"

export interface WorkflowRunCleanupCandidate {
  runId: string
  revision: string
}

export interface WorkflowRunCleanupTransactionResult {
  removedRunIds: string[]
  transactionId: string
  quarantinePath: string
}

export interface WorkflowRunCleanupFileSystem {
  mkdir: typeof fs.mkdir
  lstat: typeof fs.lstat
  realpath: typeof fs.realpath
  rename: typeof fs.rename
  rm: typeof fs.rm
  readdir: typeof fs.readdir
}

const DEFAULT_FS: WorkflowRunCleanupFileSystem = {
  mkdir: fs.mkdir,
  lstat: fs.lstat,
  realpath: fs.realpath,
  rename: fs.rename,
  rm: fs.rm,
  readdir: fs.readdir
}

export async function applyWorkflowRunCleanupTransaction(input: {
  workspaceRoot: string
  candidates: readonly WorkflowRunCleanupCandidate[]
  transactionId?: string
  fsOps?: WorkflowRunCleanupFileSystem
}): Promise<WorkflowRunCleanupTransactionResult> {
  const candidates = normalizeCandidates(input.candidates)
  const transactionId = safeSegment(input.transactionId ?? `cleanup-${randomUUID()}`, "transaction id")
  const fsOps = input.fsOps ?? DEFAULT_FS
  if (candidates.length === 0) return { removedRunIds: [], transactionId, quarantinePath: "" }

  return withWorkflowRunCleanupLeases(input.workspaceRoot, candidates.map((candidate) => candidate.runId), async () => {
    const root = await fsOps.realpath(path.resolve(input.workspaceRoot))
    const workflowsRoot = await ensureDirectoryChain(fsOps, root, [".bob", "workflows"], false)
    const runsRoot = path.join(workflowsRoot, "runs")
    await assertDirectDirectory(fsOps, runsRoot, root, "Workflow runs directory")
    const quarantineBase = path.join(workflowsRoot, "run-cleanup-quarantine")
    await mkdirIfNeeded(fsOps, quarantineBase)
    await assertDirectDirectory(fsOps, quarantineBase, root, "Workflow cleanup quarantine directory")
    const quarantinePath = path.join(quarantineBase, transactionId)
    await fsOps.mkdir(quarantinePath)
    await assertDirectDirectory(fsOps, quarantinePath, root, "Workflow cleanup quarantine transaction")

    const moved: Array<{ runId: string; source: string; target: string }> = []
    try {
      for (const candidate of candidates) {
        await assertCandidateUnchanged(input.workspaceRoot, candidate)
        const source = path.join(runsRoot, candidate.runId)
        const target = path.join(quarantinePath, candidate.runId)
        await assertDirectDirectory(fsOps, source, root, `Workflow run '${candidate.runId}' directory`)
        await fsOps.rename(source, target)
        await assertDirectDirectory(fsOps, target, root, `Workflow run '${candidate.runId}' quarantined directory`)
        moved.push({ runId: candidate.runId, source, target })
      }
    } catch (error) {
      const rollbackErrors: string[] = []
      for (const entry of [...moved].reverse()) {
        try {
          await fsOps.rename(entry.target, entry.source)
          await assertDirectDirectory(fsOps, entry.source, root, `Workflow run '${entry.runId}' restored directory`)
        } catch (rollbackError) {
          rollbackErrors.push(`${entry.runId}: ${formatError(rollbackError)}`)
        }
      }
      if (rollbackErrors.length > 0) {
        throw new Error(`Workflow run cleanup failed (${formatError(error)}); rollback failed: ${rollbackErrors.join("; ")}. Quarantine preserved at ${quarantinePath}`)
      }
      await fsOps.rm(quarantinePath, { recursive: true, force: true }).catch(() => undefined)
      await removeIfEmpty(fsOps, quarantineBase)
      throw error
    }

    await fsOps.rm(quarantinePath, { recursive: true, force: false })
    await removeIfEmpty(fsOps, quarantineBase)
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
  label: string
): Promise<void> {
  const stat = await fsOps.lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a direct directory and not a symlink or junction.`)
  const physical = await fsOps.realpath(directory)
  const relative = path.relative(path.resolve(root), path.resolve(physical))
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes the workflow workspace.`)
  if (!samePath(directory, physical)) throw new Error(`${label} must not use an alias or junction.`)
}

async function removeIfEmpty(fsOps: WorkflowRunCleanupFileSystem, directory: string): Promise<void> {
  try {
    if ((await fsOps.readdir(directory)).length === 0) await fsOps.rm(directory, { recursive: false, force: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
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
