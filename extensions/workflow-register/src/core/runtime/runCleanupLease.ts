import { randomUUID } from "crypto"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { assertSafeWorkflowRunId } from "./runStatePath"

export const CURRENT_WORKFLOW_RUN_CLEANUP_LEASE_SCHEMA_VERSION = "workflow-register/run-cleanup-lease/v1" as const

export interface WorkflowRunCleanupLeaseV1 {
  schemaVersion: typeof CURRENT_WORKFLOW_RUN_CLEANUP_LEASE_SCHEMA_VERSION
  runId: string
  token: string
  pid: number
  hostname: string
  createdAt: string
  heartbeatAt: string
}

export interface WorkflowRunCleanupLeaseOptions {
  now?: () => Date
  token?: () => string
  hostname?: string
  processAlive?: (pid: number) => boolean
  staleMs?: number
}

interface CleanupLeaseLocations {
  root: string
  directory: string
}

interface CleanupLeaseSnapshot {
  bytes: Buffer
  mtimeMs: number
  dev: bigint
  ino: bigint
}

const RUNS_ROOT_SEGMENTS = [".bob", "workflows", "runs"] as const
const CLEANUP_LEASE_DIRECTORY = ".cleanup-leases"

export async function workflowRunCleanupLeasePresent(workspaceRoot: string, runId: string): Promise<boolean> {
  assertSafeWorkflowRunId(runId)
  const locations = await cleanupLeaseLocations(workspaceRoot, false)
  if (!locations) return false
  const file = leaseFile(locations.directory, runId)
  try {
    await readCleanupLeaseSnapshot(file, locations.root, runId)
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

export async function withWorkflowRunCleanupLeases<T>(
  workspaceRoot: string,
  runIds: readonly string[],
  operation: () => Promise<T>,
  options: WorkflowRunCleanupLeaseOptions = {}
): Promise<T> {
  const uniqueRunIds = [...new Set(runIds)].sort()
  uniqueRunIds.forEach(assertSafeWorkflowRunId)
  if (uniqueRunIds.length === 0) return operation()
  const resolved = resolveOptions(options)
  const locations = await cleanupLeaseLocations(workspaceRoot, true)
  if (!locations) throw new Error("Workflow cleanup lease directory is unavailable.")
  const leases: Array<{ file: string; lease: WorkflowRunCleanupLeaseV1 }> = []
  let result!: T
  let operationError: unknown
  try {
    for (const runId of uniqueRunIds) {
      const acquired = await acquireCleanupLease(locations, runId, resolved)
      leases.push(acquired)
    }
    result = await operation()
  } catch (error) {
    operationError = error
  }

  const releaseErrors: string[] = []
  for (const entry of [...leases].reverse()) {
    try {
      await releaseCleanupLease(entry.file, locations.root, entry.lease)
    } catch (error) {
      releaseErrors.push(`${entry.lease.runId}: ${formatError(error)}`)
    }
  }
  await removeLeaseDirectoryIfEmpty(locations.directory)

  if (operationError && releaseErrors.length > 0) {
    throw new Error(`Workflow cleanup operation failed (${formatError(operationError)}); lease release also failed: ${releaseErrors.join("; ")}`)
  }
  if (operationError) throw operationError
  if (releaseErrors.length > 0) throw new Error(`Workflow cleanup lease release failed: ${releaseErrors.join("; ")}`)
  return result
}

interface ResolvedCleanupLeaseOptions {
  now: () => Date
  token: () => string
  hostname: string
  processAlive: (pid: number) => boolean
  staleMs: number
}

async function acquireCleanupLease(
  locations: CleanupLeaseLocations,
  runId: string,
  options: ResolvedCleanupLeaseOptions
): Promise<{ file: string; lease: WorkflowRunCleanupLeaseV1 }> {
  const file = leaseFile(locations.directory, runId)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = options.now()
    const lease: WorkflowRunCleanupLeaseV1 = {
      schemaVersion: CURRENT_WORKFLOW_RUN_CLEANUP_LEASE_SCHEMA_VERSION,
      runId,
      token: boundedToken(options.token(), "token"),
      pid: process.pid,
      hostname: boundedToken(options.hostname, "hostname"),
      createdAt: now.toISOString(),
      heartbeatAt: now.toISOString()
    }
    try {
      const handle = await fs.open(file, "wx", 0o600)
      try {
        await handle.writeFile(`${JSON.stringify(lease, null, 2)}\n`, "utf8")
        await handle.sync()
      } finally {
        await handle.close()
      }
      await readCleanupLeaseSnapshot(file, locations.root, runId)
      return { file, lease }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }

    const snapshot = await readCleanupLeaseSnapshot(file, locations.root, runId)
    const inspection = inspectExistingLease(snapshot, runId, options)
    if (!inspection.reclaim) {
      throw new Error(`Workflow run '${runId}' is reserved by a cleanup operation. ${inspection.message}`)
    }
    if (!await removeUnchangedCleanupLease(file, locations.root, runId, snapshot)) {
      if (attempt < 2) continue
      throw new Error(`Workflow run '${runId}' cleanup lease changed while stale ownership was being reclaimed.`)
    }
  }
  throw new Error(`Workflow run '${runId}' cleanup lease could not be acquired.`)
}

function inspectExistingLease(
  snapshot: CleanupLeaseSnapshot,
  runId: string,
  options: ResolvedCleanupLeaseOptions
): { reclaim: boolean; message: string } {
  let lease: WorkflowRunCleanupLeaseV1
  try {
    lease = parseCleanupLease(JSON.parse(snapshot.bytes.toString("utf8")), runId)
  } catch (error) {
    const ageMs = Math.max(0, options.now().getTime() - snapshot.mtimeMs)
    return {
      reclaim: ageMs > options.staleMs,
      message: ageMs > options.staleMs
        ? `Reclaiming malformed stale cleanup lease after ${ageMs}ms.`
        : `A malformed recent cleanup lease is present (${formatError(error)}).`
    }
  }
  if (lease.hostname === options.hostname) {
    if (options.processAlive(lease.pid)) return { reclaim: false, message: `Owned by live pid ${lease.pid} on ${lease.hostname}.` }
    return { reclaim: true, message: `Reclaiming cleanup lease from dead pid ${lease.pid} on ${lease.hostname}.` }
  }
  const ageMs = Math.max(0, options.now().getTime() - Date.parse(lease.heartbeatAt))
  return {
    reclaim: ageMs > options.staleMs,
    message: ageMs > options.staleMs
      ? `Reclaiming stale foreign-host cleanup lease from ${lease.hostname} after ${ageMs}ms.`
      : `Owned by ${lease.pid} on ${lease.hostname}; heartbeat age ${ageMs}ms.`
  }
}

function parseCleanupLease(value: unknown, expectedRunId: string): WorkflowRunCleanupLeaseV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cleanup lease must be an object.")
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== CURRENT_WORKFLOW_RUN_CLEANUP_LEASE_SCHEMA_VERSION) throw new Error("Unsupported cleanup lease schemaVersion.")
  if (record.runId !== expectedRunId) throw new Error(`Cleanup lease run id mismatch: ${String(record.runId)}`)
  const token = boundedToken(record.token, "token")
  const hostname = boundedToken(record.hostname, "hostname")
  const pid = Number(record.pid)
  if (!Number.isInteger(pid) || pid < 1) throw new Error("Cleanup lease pid must be a positive integer.")
  const createdAt = timestamp(record.createdAt, "createdAt")
  const heartbeatAt = timestamp(record.heartbeatAt, "heartbeatAt")
  return {
    schemaVersion: CURRENT_WORKFLOW_RUN_CLEANUP_LEASE_SCHEMA_VERSION,
    runId: expectedRunId,
    token,
    pid,
    hostname,
    createdAt,
    heartbeatAt
  }
}

async function releaseCleanupLease(file: string, root: string, expected: WorkflowRunCleanupLeaseV1): Promise<void> {
  const snapshot = await readCleanupLeaseSnapshot(file, root, expected.runId)
  const current = parseCleanupLease(JSON.parse(snapshot.bytes.toString("utf8")), expected.runId)
  if (current.token !== expected.token) throw new Error(`Workflow run '${expected.runId}' cleanup lease ownership changed.`)
  if (!await removeUnchangedCleanupLease(file, root, expected.runId, snapshot)) {
    throw new Error(`Workflow run '${expected.runId}' cleanup lease changed before release.`)
  }
}

async function removeUnchangedCleanupLease(
  file: string,
  root: string,
  runId: string,
  expected: CleanupLeaseSnapshot
): Promise<boolean> {
  let current: CleanupLeaseSnapshot
  try {
    current = await readCleanupLeaseSnapshot(file, root, runId)
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
  if (current.dev !== expected.dev || current.ino !== expected.ino || !current.bytes.equals(expected.bytes)) return false
  await fs.rm(file)
  return true
}

async function readCleanupLeaseSnapshot(file: string, root: string, runId: string): Promise<CleanupLeaseSnapshot> {
  const before = await fs.lstat(file, { bigint: true })
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`Workflow run '${runId}' cleanup lease must be a direct regular file.`)
  const physical = await fs.realpath(file)
  assertContained(root, physical, `Workflow run '${runId}' cleanup lease`)
  if (!samePath(file, physical)) throw new Error(`Workflow run '${runId}' cleanup lease must not be a file alias.`)
  const handle = await fs.open(file, "r")
  try {
    const stat = await handle.stat({ bigint: true })
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino) throw new Error(`Workflow run '${runId}' cleanup lease changed while opened.`)
    const numeric = await handle.stat()
    return { bytes: await handle.readFile(), mtimeMs: numeric.mtimeMs, dev: stat.dev, ino: stat.ino }
  } finally {
    await handle.close()
  }
}

async function cleanupLeaseLocations(workspaceRoot: string, create: boolean): Promise<CleanupLeaseLocations | undefined> {
  const root = await fs.realpath(path.resolve(workspaceRoot))
  let current = root
  for (const segment of RUNS_ROOT_SEGMENTS) {
    current = path.join(current, segment)
    if (create) await mkdirIfNeeded(current)
    try {
      await assertDirectDirectory(current, root, `Workflow cleanup path '${segment}'`)
    } catch (error) {
      if (!create && isMissing(error)) return undefined
      throw error
    }
  }
  const directory = path.join(current, CLEANUP_LEASE_DIRECTORY)
  if (create) await mkdirIfNeeded(directory)
  try {
    await assertDirectDirectory(directory, root, "Workflow cleanup lease directory")
  } catch (error) {
    if (!create && isMissing(error)) return undefined
    throw error
  }
  return { root, directory }
}

async function mkdirIfNeeded(directory: string): Promise<void> {
  try {
    await fs.mkdir(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
  }
}

async function removeLeaseDirectoryIfEmpty(directory: string): Promise<void> {
  try {
    if ((await fs.readdir(directory)).length === 0) await fs.rmdir(directory)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "ENOENT" && code !== "ENOTEMPTY") throw error
  }
}

async function assertDirectDirectory(file: string, root: string, label: string): Promise<void> {
  const stat = await fs.lstat(file)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a direct directory.`)
  const physical = await fs.realpath(file)
  assertContained(root, physical, label)
  if (!samePath(file, physical)) throw new Error(`${label} must not be an alias or junction.`)
}

function leaseFile(directory: string, runId: string): string {
  return path.join(directory, `${runId}.json`)
}

function resolveOptions(options: WorkflowRunCleanupLeaseOptions): ResolvedCleanupLeaseOptions {
  const staleMs = options.staleMs ?? 30_000
  if (!Number.isFinite(staleMs) || staleMs < 0) throw new Error("Workflow cleanup lease staleMs must be non-negative.")
  return {
    now: options.now ?? (() => new Date()),
    token: options.token ?? randomUUID,
    hostname: options.hostname ?? os.hostname(),
    processAlive: options.processAlive ?? defaultProcessAlive,
    staleMs
  }
}

function defaultProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

function boundedToken(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Workflow cleanup lease ${label} is invalid.`)
  }
  return value
}

function timestamp(value: unknown, label: string): string {
  const text = boundedToken(value, label)
  if (!Number.isFinite(Date.parse(text))) throw new Error(`Workflow cleanup lease ${label} must be an ISO timestamp.`)
  return new Date(text).toISOString()
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

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === "ENOENT" || code === "ENOTDIR"
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
