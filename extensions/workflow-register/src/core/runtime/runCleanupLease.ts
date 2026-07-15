import { randomUUID } from "crypto"
import { constants } from "fs"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { readRunDurabilityFile } from "./runDurabilityPath"
import { assertSafeWorkflowRunId } from "./runStatePath"
import {
  createWorkflowRunWorkspaceRootScope,
  resolveWorkflowRunWorkspaceRoot,
  withWorkflowRunWorkspaceRootBinding
} from "./workflowRunWorkspaceRootBinding"

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
  nlink: bigint
}

interface FileIdentity {
  dev: bigint
  ino: bigint
}

interface CleanupLeaseGuard {
  directory: string
  ownerFile: string
  dev: bigint
  ino: bigint
}

interface OwnedCleanupLease {
  file: string
  guard: CleanupLeaseGuard
  lease: WorkflowRunCleanupLeaseV1
}

const WORKFLOWS_ROOT_SEGMENTS = [".bob", "workflows"] as const
const CLEANUP_LEASE_DIRECTORY = "run-cleanup-leases"
const CLEANUP_GUARD_SUFFIX = ".guard"
const CLEANUP_GUARD_OWNER_FILE = "owner.json"
const DEFAULT_CLEANUP_HEARTBEAT_MS = 5_000

export async function workflowRunCleanupLeasePresent(workspaceRoot: string, runId: string): Promise<boolean> {
  assertSafeWorkflowRunId(runId)
  const locations = await cleanupLeaseLocations(workspaceRoot, false)
  if (!locations) return false
  const guard = guardDirectory(locations.directory, runId)
  try {
    await assertDirectDirectory(guard, locations.root, `Workflow run '${runId}' cleanup guard`)
    return true
  } catch (error) {
    if (!isMissing(error)) throw error
  }
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
  const leases: OwnedCleanupLease[] = []
  let heartbeatError: unknown
  let heartbeatRunning = false
  let heartbeatChain: Promise<void> = Promise.resolve()
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  const startHeartbeat = () => {
    if (heartbeatTimer) return
    heartbeatTimer = setInterval(() => {
      if (heartbeatError || heartbeatRunning) return
      heartbeatRunning = true
      heartbeatChain = refreshCleanupLeases(leases, locations.root, resolved)
        .catch((error) => { heartbeatError = error })
        .finally(() => { heartbeatRunning = false })
    }, resolved.heartbeatMs)
    heartbeatTimer.unref?.()
  }
  let result!: T
  let operationError: unknown
  try {
    for (const runId of uniqueRunIds) {
      const acquired = await acquireCleanupLease(locations, runId, resolved)
      leases.push(acquired)
      startHeartbeat()
    }
    for (const runId of uniqueRunIds) {
      if (await readRunDurabilityFile(locations.root, runId, "run.lock.json")) {
        throw new Error(`Workflow run '${runId}' has an active execution lock and cannot be cleaned up.`)
      }
    }
    const scope = createWorkflowRunWorkspaceRootScope()
    try {
      result = await withWorkflowRunWorkspaceRootBinding(workspaceRoot, locations.root, scope.token, operation)
    } finally {
      scope.revoke()
    }
  } catch (error) {
    operationError = error
  }

  if (heartbeatTimer) clearInterval(heartbeatTimer)
  await heartbeatChain
  if (!operationError && heartbeatError) operationError = heartbeatError

  const releaseErrors: Array<{ runId: string; error: unknown }> = []
  for (const entry of [...leases].reverse()) {
    try {
      await releaseCleanupLease(entry, locations.root)
    } catch (error) {
      releaseErrors.push({ runId: entry.lease.runId, error })
    }
  }
  let parentCleanupError: unknown
  let parentCleanupFailed = false
  try {
    await removeLeaseDirectoryIfEmpty(locations.directory)
  } catch (error) {
    parentCleanupError = error
    parentCleanupFailed = true
  }

  const releaseDetails = releaseErrors
    .map((failure) => `${failure.runId}: ${formatError(failure.error)}`)
    .join("; ")
  const parentCleanupDetails = parentCleanupFailed
    ? `lease parent cleanup also failed: ${formatError(parentCleanupError)}`
    : ""
  if (operationError) {
    const secondaryDetails: string[] = []
    const suppressedErrors: unknown[] = []
    if (releaseErrors.length > 0) {
      secondaryDetails.push(`lease release also failed: ${releaseDetails}`)
      suppressedErrors.push(...releaseErrors.map((failure) => failure.error))
    }
    if (parentCleanupFailed) {
      secondaryDetails.push(parentCleanupDetails)
      suppressedErrors.push(parentCleanupError)
    }
    if (secondaryDetails.length > 0) {
      throw appendSuppressedFailureContext(operationError, secondaryDetails.join("; "), suppressedErrors)
    }
    throw operationError
  }
  if (releaseErrors.length > 0) {
    const releaseError = new Error(`Workflow cleanup lease release failed: ${releaseDetails}`, { cause: releaseErrors[0].error })
    addSuppressedErrors(releaseError, releaseErrors.map((failure) => failure.error))
    if (parentCleanupFailed) {
      throw appendSuppressedFailureContext(releaseError, parentCleanupDetails, [parentCleanupError])
    }
    throw releaseError
  }
  if (parentCleanupFailed) throw parentCleanupError
  return result
}

interface ResolvedCleanupLeaseOptions {
  now: () => Date
  token: () => string
  hostname: string
  processAlive: (pid: number) => boolean
  staleMs: number
  heartbeatMs: number
}

async function acquireCleanupLease(
  locations: CleanupLeaseLocations,
  runId: string,
  options: ResolvedCleanupLeaseOptions
): Promise<OwnedCleanupLease> {
  const file = leaseFile(locations.directory, runId)
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
  const guard = await acquireCleanupGuard(locations, lease)
  let ownsMetadata = false
  try {
    let snapshot: CleanupLeaseSnapshot | undefined
    try {
      snapshot = await readCleanupLeaseSnapshot(file, locations.root, runId)
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    if (snapshot) {
      const inspection = inspectExistingLease(snapshot, runId, options)
      if (!inspection.reclaim) {
        throw new Error(`Workflow run '${runId}' is reserved by a cleanup operation. ${inspection.message}`)
      }
      if (!await removeLegacyCleanupLeaseWhileGuarded(file, locations.root, runId, snapshot, guard, lease)) {
        throw new Error(`Workflow run '${runId}' cleanup lease changed while stale legacy ownership was being reclaimed.`)
      }
    }
    await verifyCleanupGuard(guard, locations.root, lease)
    await writeCleanupLeaseFile(file, lease)
    ownsMetadata = true
    const persisted = await readCleanupLeaseSnapshot(file, locations.root, runId)
    const current = parseCleanupLease(JSON.parse(persisted.bytes.toString("utf8")), runId)
    if (current.token !== lease.token) throw new Error(`Workflow run '${runId}' cleanup lease ownership changed during creation.`)
    await verifyCleanupGuard(guard, locations.root, lease)
    return { file, guard, lease }
  } catch (error) {
    try {
      if (ownsMetadata) await releaseCleanupLease({ file, guard, lease }, locations.root)
      else await releaseCleanupGuard(guard, locations.root, lease)
    } catch (releaseError) {
      throw new Error(`Workflow run '${runId}' cleanup lease acquisition failed (${formatError(error)}); guard release also failed: ${formatError(releaseError)}`)
    }
    throw error
  }
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
  const heartbeatTimeMs = Math.max(Date.parse(lease.heartbeatAt), snapshot.mtimeMs)
  const ageMs = Math.max(0, options.now().getTime() - heartbeatTimeMs)
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

async function acquireCleanupGuard(
  locations: CleanupLeaseLocations,
  lease: WorkflowRunCleanupLeaseV1
): Promise<CleanupLeaseGuard> {
  const directory = guardDirectory(locations.directory, lease.runId)
  try {
    await fs.mkdir(directory, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    await assertDirectDirectory(directory, locations.root, `Workflow run '${lease.runId}' cleanup guard`)
    throw new Error(`Workflow run '${lease.runId}' is reserved by a cleanup operation. An authoritative cleanup guard is present.`)
  }

  const ownerFile = path.join(directory, CLEANUP_GUARD_OWNER_FILE)
  await writeCleanupLeaseFile(ownerFile, lease)
  const identity = await assertDirectDirectory(directory, locations.root, `Workflow run '${lease.runId}' cleanup guard`)
  const guard = { directory, ownerFile, ...identity }
  await verifyCleanupGuard(guard, locations.root, lease)
  return guard
}

async function verifyCleanupGuard(
  guard: CleanupLeaseGuard,
  root: string,
  expected: WorkflowRunCleanupLeaseV1
): Promise<void> {
  const before = await assertDirectDirectory(guard.directory, root, `Workflow run '${expected.runId}' cleanup guard`)
  if (!sameIdentity(before, guard)) throw new Error(`Workflow run '${expected.runId}' cleanup guard ownership changed.`)
  const snapshot = await readCleanupLeaseSnapshot(guard.ownerFile, root, expected.runId)
  const owner = parseCleanupLease(JSON.parse(snapshot.bytes.toString("utf8")), expected.runId)
  if (owner.token !== expected.token) throw new Error(`Workflow run '${expected.runId}' cleanup guard ownership changed.`)
  const after = await assertDirectDirectory(guard.directory, root, `Workflow run '${expected.runId}' cleanup guard`)
  if (!sameIdentity(after, guard)) throw new Error(`Workflow run '${expected.runId}' cleanup guard ownership changed.`)
}

async function releaseCleanupGuard(
  guard: CleanupLeaseGuard,
  root: string,
  expected: WorkflowRunCleanupLeaseV1
): Promise<void> {
  await verifyCleanupGuard(guard, root, expected)
  const entries = await fs.readdir(guard.directory)
  if (entries.length !== 1 || entries[0] !== CLEANUP_GUARD_OWNER_FILE) {
    throw new Error(`Workflow run '${expected.runId}' cleanup guard contains unexpected entries and was preserved.`)
  }
  await fs.rm(guard.ownerFile)
  await fs.rmdir(guard.directory)
}

async function writeCleanupLeaseFile(file: string, lease: WorkflowRunCleanupLeaseV1): Promise<void> {
  const handle = await fs.open(file, "wx", 0o600)
  try {
    assertSingleLinkedRegularFile(await handle.stat({ bigint: true }), `Workflow run '${lease.runId}' cleanup lease`)
    await handle.writeFile(`${JSON.stringify(lease, null, 2)}\n`, "utf8")
    await handle.sync()
    assertSingleLinkedRegularFile(await handle.stat({ bigint: true }), `Workflow run '${lease.runId}' cleanup lease`)
  } finally {
    await handle.close()
  }
}

async function releaseCleanupLease(entry: OwnedCleanupLease, root: string): Promise<void> {
  const { file, guard, lease: expected } = entry
  await verifyCleanupGuard(guard, root, expected)
  const snapshot = await readCleanupLeaseSnapshot(file, root, expected.runId)
  const current = parseCleanupLease(JSON.parse(snapshot.bytes.toString("utf8")), expected.runId)
  if (current.token !== expected.token) throw new Error(`Workflow run '${expected.runId}' cleanup lease ownership changed.`)
  await verifyCleanupGuard(guard, root, expected)
  await fs.rm(file)
  await verifyCleanupGuard(guard, root, expected)
  await releaseCleanupGuard(guard, root, expected)
}

async function refreshCleanupLeases(
  leases: ReadonlyArray<OwnedCleanupLease>,
  root: string,
  options: ResolvedCleanupLeaseOptions
): Promise<void> {
  for (const entry of leases) {
    await refreshCleanupLease(entry, root, options)
  }
}

async function refreshCleanupLease(
  entry: OwnedCleanupLease,
  root: string,
  options: ResolvedCleanupLeaseOptions
): Promise<void> {
  const { file, guard, lease: expected } = entry
  const heartbeatAt = options.now()
  await verifyCleanupGuard(guard, root, expected)
  const snapshot = await readCleanupLeaseSnapshot(file, root, expected.runId)
  const current = parseCleanupLease(JSON.parse(snapshot.bytes.toString("utf8")), expected.runId)
  if (current.token !== expected.token) throw new Error(`Workflow run '${expected.runId}' cleanup lease ownership changed.`)
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
  const handle = await fs.open(file, constants.O_RDWR | noFollow)
  try {
    const stat = await handle.stat({ bigint: true })
    assertSingleLinkedRegularFile(stat, `Workflow run '${expected.runId}' cleanup lease`)
    if (stat.dev !== snapshot.dev || stat.ino !== snapshot.ino || stat.nlink !== snapshot.nlink) {
      throw new Error(`Workflow run '${expected.runId}' cleanup lease changed before heartbeat.`)
    }
    await handle.utimes(heartbeatAt, heartbeatAt)
    await handle.sync()
  } finally {
    await handle.close()
  }
  const refreshed = await readCleanupLeaseSnapshot(file, root, expected.runId)
  const persisted = parseCleanupLease(JSON.parse(refreshed.bytes.toString("utf8")), expected.runId)
  if (
    refreshed.dev !== snapshot.dev
    || refreshed.ino !== snapshot.ino
    || refreshed.nlink !== snapshot.nlink
    || persisted.token !== expected.token
  ) {
    throw new Error(`Workflow run '${expected.runId}' cleanup lease ownership changed during heartbeat.`)
  }
  await verifyCleanupGuard(guard, root, expected)
}

async function removeLegacyCleanupLeaseWhileGuarded(
  file: string,
  root: string,
  runId: string,
  expected: CleanupLeaseSnapshot,
  guard: CleanupLeaseGuard,
  owner: WorkflowRunCleanupLeaseV1
): Promise<boolean> {
  await verifyCleanupGuard(guard, root, owner)
  let current: CleanupLeaseSnapshot
  try {
    current = await readCleanupLeaseSnapshot(file, root, runId)
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
  if (
    current.dev !== expected.dev
    || current.ino !== expected.ino
    || current.nlink !== expected.nlink
    || current.mtimeMs !== expected.mtimeMs
    || !current.bytes.equals(expected.bytes)
  ) return false
  await verifyCleanupGuard(guard, root, owner)
  try {
    await fs.rm(file)
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
  await verifyCleanupGuard(guard, root, owner)
  return true
}

async function readCleanupLeaseSnapshot(file: string, root: string, runId: string): Promise<CleanupLeaseSnapshot> {
  const before = await fs.lstat(file, { bigint: true })
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`Workflow run '${runId}' cleanup lease must be a direct regular file.`)
  assertSingleLinkedRegularFile(before, `Workflow run '${runId}' cleanup lease`)
  const physical = await fs.realpath(file)
  assertContained(root, physical, `Workflow run '${runId}' cleanup lease`)
  if (!samePath(file, physical)) throw new Error(`Workflow run '${runId}' cleanup lease must not be a file alias.`)
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
  const handle = await fs.open(file, constants.O_RDONLY | noFollow)
  try {
    const stat = await handle.stat({ bigint: true })
    assertSingleLinkedRegularFile(stat, `Workflow run '${runId}' cleanup lease`)
    if (stat.dev !== before.dev || stat.ino !== before.ino || stat.nlink !== before.nlink) {
      throw new Error(`Workflow run '${runId}' cleanup lease changed while opened.`)
    }
    const bytes = await handle.readFile()
    const read = await handle.stat({ bigint: true })
    assertSingleLinkedRegularFile(read, `Workflow run '${runId}' cleanup lease`)
    const after = await fs.lstat(file, { bigint: true })
    assertSingleLinkedRegularFile(after, `Workflow run '${runId}' cleanup lease`)
    if (
      read.dev !== stat.dev || read.ino !== stat.ino || read.nlink !== stat.nlink
      || after.dev !== read.dev || after.ino !== read.ino || after.nlink !== read.nlink
    ) throw new Error(`Workflow run '${runId}' cleanup lease changed while read.`)
    return {
      bytes,
      mtimeMs: Number(read.mtimeNs) / 1_000_000,
      dev: read.dev,
      ino: read.ino,
      nlink: read.nlink
    }
  } finally {
    await handle.close()
  }
}

async function cleanupLeaseLocations(workspaceRoot: string, create: boolean): Promise<CleanupLeaseLocations | undefined> {
  const root = await resolveWorkflowRunWorkspaceRoot(workspaceRoot)
  let current = root
  for (const segment of WORKFLOWS_ROOT_SEGMENTS) {
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

async function assertDirectDirectory(file: string, root: string, label: string): Promise<FileIdentity> {
  const before = await fs.lstat(file, { bigint: true })
  if (!before.isDirectory() || before.isSymbolicLink()) throw new Error(`${label} must be a direct directory.`)
  const physical = await fs.realpath(file)
  assertContained(root, physical, label)
  if (!samePath(file, physical)) throw new Error(`${label} must not be an alias or junction.`)
  const after = await fs.lstat(file, { bigint: true })
  if (!after.isDirectory() || !sameIdentity(before, after)) throw new Error(`${label} changed while it was being verified.`)
  return { dev: after.dev, ino: after.ino }
}

function leaseFile(directory: string, runId: string): string {
  return path.join(directory, `${runId}.json`)
}

function guardDirectory(directory: string, runId: string): string {
  return path.join(directory, `${runId}${CLEANUP_GUARD_SUFFIX}`)
}

function resolveOptions(options: WorkflowRunCleanupLeaseOptions): ResolvedCleanupLeaseOptions {
  const staleMs = options.staleMs ?? 30_000
  if (!Number.isFinite(staleMs) || staleMs < 0) throw new Error("Workflow cleanup lease staleMs must be non-negative.")
  const heartbeatMs = Math.max(1, Math.min(DEFAULT_CLEANUP_HEARTBEAT_MS, Math.floor(staleMs / 3)))
  return {
    now: options.now ?? (() => new Date()),
    token: options.token ?? randomUUID,
    hostname: options.hostname ?? os.hostname(),
    processAlive: options.processAlive ?? defaultProcessAlive,
    staleMs,
    heartbeatMs
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

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function assertSingleLinkedRegularFile(
  stat: { isFile(): boolean; nlink: bigint },
  label: string
): void {
  if (!stat.isFile()) throw new Error(`${label} must be a regular file.`)
  if (stat.nlink !== 1n) throw new Error(`${label} must have a single link and must not be hard-linked.`)
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === "ENOENT" || code === "ENOTDIR"
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function appendSuppressedFailureContext(
  primary: unknown,
  detail: string,
  suppressedErrors: readonly unknown[]
): unknown {
  if (!(primary instanceof Error)) {
    const wrapped = new Error(`Workflow cleanup operation failed (${formatError(primary)}); ${detail}`, { cause: primary })
    addSuppressedErrors(wrapped, suppressedErrors)
    return wrapped
  }
  try {
    primary.message = `${primary.message}; ${detail}`
  } catch {
    // Context is best-effort; never let annotation replace the primary failure.
  }
  addSuppressedErrors(primary, suppressedErrors)
  return primary
}

function addSuppressedErrors(primary: Error, suppressedErrors: readonly unknown[]): void {
  try {
    const current = (primary as Error & { suppressedErrors?: unknown }).suppressedErrors
    const existing = Array.isArray(current) ? current : []
    Object.defineProperty(primary, "suppressedErrors", {
      configurable: true,
      enumerable: false,
      value: Object.freeze([...existing, ...suppressedErrors]),
      writable: false
    })
  } catch {
    // Suppression metadata is best-effort; never let annotation replace the primary failure.
  }
}
