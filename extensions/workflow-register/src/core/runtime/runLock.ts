import { AsyncLocalStorage } from "async_hooks"
import { randomUUID } from "crypto"
import * as os from "os"
import * as path from "path"
import {
  RunDurabilityDirectoryMissingError,
  createRunDurabilityFile,
  readRunDurabilityFile,
  removeRunDurabilityFile,
  runDurabilityDirectoryPresent,
  touchRunDurabilityFileMtime
} from "./runDurabilityPath"
import { workflowRunCleanupLeasePresent } from "./runCleanupLease"
import {
  createWorkflowRunWorkspaceRootScope,
  resolveWorkflowRunWorkspaceRoot,
  type WorkflowRunWorkspaceRootScopeToken,
  withWorkflowRunWorkspaceRootBinding
} from "./workflowRunWorkspaceRootBinding"

export const CURRENT_WORKFLOW_RUN_LOCK_SCHEMA_VERSION = "workflow-register/run-lock/v1" as const

export interface WorkflowRunLockV1 {
  schemaVersion: typeof CURRENT_WORKFLOW_RUN_LOCK_SCHEMA_VERSION
  runId: string
  token: string
  pid: number
  hostname: string
  createdAt: string
  heartbeatAt: string
}

export interface WorkflowRunLockOptions {
  requireExistingRunDirectory?: boolean
  timeoutMs?: number
  staleMs?: number
  heartbeatMs?: number
  pollMs?: number
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  processAlive?: (pid: number) => boolean
  hostname?: string
  token?: () => string
  onReclaimed?: (message: string) => void
}

const activeLocks = new AsyncLocalStorage<ReadonlyMap<string, WorkflowRunWorkspaceRootScopeToken>>()

export async function withWorkflowRunLock<T>(
  workspaceRoot: string,
  runId: string,
  operation: () => Promise<T>,
  options: WorkflowRunLockOptions = {}
): Promise<T> {
  const physicalRoot = await resolveWorkflowRunWorkspaceRoot(workspaceRoot)
  const key = JSON.stringify([normalizePhysicalRoot(physicalRoot), runId])
  const active = activeLocks.getStore()
  const activeScope = active?.get(key)
  if (activeScope?.isActive()) {
    return withWorkflowRunWorkspaceRootBinding(workspaceRoot, physicalRoot, activeScope, operation)
  }

  const resolved = resolveOptions(options)
  const runDirectoryExistedAtEntry = await runDurabilityDirectoryPresent(physicalRoot, runId)
  const owner = await acquireWorkflowRunLock(
    physicalRoot,
    runId,
    resolved,
    runDirectoryExistedAtEntry,
    options.requireExistingRunDirectory === true
  )
  const scope = createWorkflowRunWorkspaceRootScope()
  const chain = new Map(
    [...(active ?? [])].filter(([, candidate]) => candidate.isActive())
  )
  chain.set(key, scope.token)
  let heartbeatError: unknown
  let heartbeatInFlight: Promise<void> | undefined
  let heartbeatPending = false
  let stopping = false
  const startHeartbeat = (): void => {
    if (heartbeatError || stopping) return
    if (heartbeatInFlight) {
      heartbeatPending = true
      return
    }
    heartbeatInFlight = (async () => {
      do {
        heartbeatPending = false
        await refreshWorkflowRunLock(physicalRoot, runId, owner, resolved)
      } while (heartbeatPending && !stopping)
    })()
      .catch((error) => { heartbeatError = error })
      .finally(() => {
        heartbeatInFlight = undefined
        if (heartbeatPending && !stopping && !heartbeatError) startHeartbeat()
      })
  }
  const timer = resolved.heartbeatMs > 0
    ? setInterval(startHeartbeat, resolved.heartbeatMs)
    : undefined
  timer?.unref?.()

  let result!: T
  let operationError: unknown
  try {
    result = await activeLocks.run(chain, () => (
      withWorkflowRunWorkspaceRootBinding(workspaceRoot, physicalRoot, scope.token, operation)
    ))
  } catch (error) {
    operationError = error
  } finally {
    scope.revoke()
    stopping = true
    if (timer) clearInterval(timer)
    await heartbeatInFlight
    const released = await releaseWorkflowRunLock(physicalRoot, runId, owner)
    if (!released && !heartbeatError) {
      heartbeatError = new Error(`Workflow run '${runId}' lock ownership changed before release.`)
    }
  }
  if (operationError) throw operationError
  if (heartbeatError) throw heartbeatError
  return result
}

export function parseWorkflowRunLock(value: unknown, expectedRunId: string): WorkflowRunLockV1 {
  const record = requiredRecord(value, `Workflow run '${expectedRunId}' lock`)
  if (record.schemaVersion !== CURRENT_WORKFLOW_RUN_LOCK_SCHEMA_VERSION) {
    throw new Error(`Workflow run '${expectedRunId}' lock has unsupported schemaVersion '${String(record.schemaVersion)}'.`)
  }
  const runId = requiredString(record.runId, "runId", expectedRunId)
  if (runId !== expectedRunId) throw new Error(`Workflow run lock run id mismatch: expected '${expectedRunId}', got '${runId}'.`)
  const token = requiredString(record.token, "token", expectedRunId)
  const pid = requiredPositiveInteger(record.pid, "pid", expectedRunId)
  const hostname = requiredString(record.hostname, "hostname", expectedRunId)
  const createdAt = requiredTimestamp(record.createdAt, "createdAt", expectedRunId)
  const heartbeatAt = requiredTimestamp(record.heartbeatAt, "heartbeatAt", expectedRunId)
  return {
    schemaVersion: CURRENT_WORKFLOW_RUN_LOCK_SCHEMA_VERSION,
    runId,
    token,
    pid,
    hostname,
    createdAt,
    heartbeatAt
  }
}

export function serializeWorkflowRunLock(lock: WorkflowRunLockV1): string {
  return `${JSON.stringify(parseWorkflowRunLock(lock, lock.runId), null, 2)}\n`
}

interface ResolvedWorkflowRunLockOptions {
  timeoutMs: number
  staleMs: number
  heartbeatMs: number
  pollMs: number
  now: () => Date
  sleep: (ms: number) => Promise<void>
  processAlive: (pid: number) => boolean
  hostname: string
  token: () => string
  onReclaimed?: (message: string) => void
}

async function acquireWorkflowRunLock(
  workspaceRoot: string,
  runId: string,
  options: ResolvedWorkflowRunLockOptions,
  runDirectoryExistedAtEntry: boolean,
  requireExistingRunDirectory: boolean
): Promise<WorkflowRunLockV1> {
  const startedAt = Date.now()
  while (true) {
    const now = options.now()
    const owner: WorkflowRunLockV1 = {
      schemaVersion: CURRENT_WORKFLOW_RUN_LOCK_SCHEMA_VERSION,
      runId,
      token: options.token(),
      pid: process.pid,
      hostname: options.hostname,
      createdAt: now.toISOString(),
      heartbeatAt: now.toISOString()
    }
    let contentionMessage = "Lock metadata changed while it was being inspected."
    try {
      if (await workflowRunCleanupLeasePresent(workspaceRoot, runId)) {
        contentionMessage = `Workflow run '${runId}' is reserved by a cleanup operation.`
      } else if (await createRunDurabilityFile(
        workspaceRoot,
        runId,
        "run.lock.json",
        serializeWorkflowRunLock(owner),
        { createRunDirectory: !requireExistingRunDirectory && !runDirectoryExistedAtEntry }
      )) {
        if (!await workflowRunCleanupLeasePresent(workspaceRoot, runId)) return owner
        const removed = await releaseWorkflowRunLock(workspaceRoot, runId, owner)
        contentionMessage = removed
          ? `Workflow run '${runId}' became reserved by a cleanup operation while its lock was being acquired.`
          : `Workflow run '${runId}' became reserved by a cleanup operation and the created lock changed ownership before release.`
      } else {
        const snapshot = await readRunDurabilityFile(workspaceRoot, runId, "run.lock.json")
        if (!snapshot) continue
        const inspection = inspectExistingLock(snapshot.bytes, snapshot.mtimeMs, runId, options)
        contentionMessage = inspection.message
        if (inspection.reclaim) {
          const removed = await removeRunDurabilityFile(workspaceRoot, runId, "run.lock.json", snapshot.bytes)
          if (removed) {
            try {
              options.onReclaimed?.(inspection.message)
            } catch (error) {
              console.warn("Workflow run lock reclamation callback failed.", error)
            }
            continue
          }
        }
      }
    } catch (error) {
      if (error instanceof RunDurabilityDirectoryMissingError) {
        throw new Error(`Workflow run '${runId}' disappeared while its execution lock was being acquired.`)
      }
      if (!isTransientLockContention(error, runId)) throw error
      contentionMessage = `Lock metadata changed while it was being inspected (${formatError(error)}).`
    }

    const elapsed = Date.now() - startedAt
    if (elapsed >= options.timeoutMs) {
      throw new Error(`Workflow run '${runId}' is busy or locked by another process. ${contentionMessage}`)
    }
    await options.sleep(Math.min(options.pollMs, Math.max(1, options.timeoutMs - elapsed)))
  }
}

async function refreshWorkflowRunLock(
  workspaceRoot: string,
  runId: string,
  owner: WorkflowRunLockV1,
  options: ResolvedWorkflowRunLockOptions
): Promise<void> {
  await touchRunDurabilityFileMtime(
    workspaceRoot,
    runId,
    "run.lock.json",
    Buffer.from(serializeWorkflowRunLock(owner), "utf8"),
    options.now
  )
}

async function releaseWorkflowRunLock(workspaceRoot: string, runId: string, owner: WorkflowRunLockV1): Promise<boolean> {
  const snapshot = await readRunDurabilityFile(workspaceRoot, runId, "run.lock.json")
  if (!snapshot) return false
  let current: WorkflowRunLockV1
  try {
    current = parseWorkflowRunLock(JSON.parse(snapshot.bytes.toString("utf8")), runId)
  } catch {
    return false
  }
  if (current.token !== owner.token) return false
  return removeRunDurabilityFile(workspaceRoot, runId, "run.lock.json", snapshot.bytes)
}

function inspectExistingLock(
  bytes: Buffer,
  mtimeMs: number,
  runId: string,
  options: ResolvedWorkflowRunLockOptions
): { reclaim: boolean; message: string } {
  let lock: WorkflowRunLockV1
  try {
    lock = parseWorkflowRunLock(JSON.parse(bytes.toString("utf8")), runId)
  } catch (error) {
    const ageMs = Math.max(0, options.now().getTime() - mtimeMs)
    return {
      reclaim: ageMs > options.staleMs,
      message: ageMs > options.staleMs
        ? `Reclaimed malformed stale lock after ${ageMs}ms.`
        : `A malformed recent lock is present (${formatError(error)}).`
    }
  }

  if (lock.hostname === options.hostname) {
    if (options.processAlive(lock.pid)) {
      return { reclaim: false, message: `Owned by live pid ${lock.pid} on ${lock.hostname}.` }
    }
    return { reclaim: true, message: `Reclaimed lock from dead pid ${lock.pid} on ${lock.hostname}.` }
  }

  // The owner refreshes mtime without rewriting its token-bearing bytes. A process
  // stalled longer than staleMs can still be reclaimed; no lease can prevent an
  // arbitrary event-loop or machine stall without an external fencing service.
  const lastHeartbeatMs = Math.max(Date.parse(lock.heartbeatAt), mtimeMs)
  const heartbeatAgeMs = Math.max(0, options.now().getTime() - lastHeartbeatMs)
  return {
    reclaim: heartbeatAgeMs > options.staleMs,
    message: heartbeatAgeMs > options.staleMs
      ? `Reclaimed stale foreign-host lock from ${lock.hostname} after ${heartbeatAgeMs}ms.`
      : `Owned by ${lock.pid} on ${lock.hostname}; heartbeat age ${heartbeatAgeMs}ms.`
  }
}

function isTransientLockContention(error: unknown, runId: string): boolean {
  const code = (error as NodeJS.ErrnoException).code
  if (code === "ENOENT" || code === "ENOTDIR") return true
  const message = formatError(error)
  return message.includes(`Workflow run '${runId}' durability file 'run.lock.json'`)
    && (
      message.includes("changed while its path was being verified")
      || message.includes("changed while it was being read")
      || message.includes("physical identity does not match its direct file path")
    )
}

function resolveOptions(options: WorkflowRunLockOptions): ResolvedWorkflowRunLockOptions {
  return {
    timeoutMs: nonNegative(options.timeoutMs, 5_000, "timeoutMs"),
    staleMs: nonNegative(options.staleMs, 30_000, "staleMs"),
    heartbeatMs: nonNegative(options.heartbeatMs, 5_000, "heartbeatMs"),
    pollMs: Math.max(1, nonNegative(options.pollMs, 25, "pollMs")),
    now: options.now ?? (() => new Date()),
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    processAlive: options.processAlive ?? defaultProcessAlive,
    hostname: options.hostname ?? os.hostname(),
    token: options.token ?? randomUUID,
    onReclaimed: options.onReclaimed
  }
}

function defaultProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === "EPERM"
  }
}

function normalizePhysicalRoot(value: string): string {
  const resolved = path.resolve(value)
  return process.platform === "win32" ? resolved.toLowerCase() : resolved
}

function nonNegative(value: number | undefined, fallback: number, label: string): number {
  const selected = value ?? fallback
  if (!Number.isFinite(selected) || selected < 0) {
    throw new Error(`Workflow run lock option '${label}' must be a non-negative finite number.`)
  }
  return selected
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function requiredString(value: unknown, field: string, runId: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Workflow run '${runId}' lock field '${field}' must be a non-empty string.`)
  return value
}

function requiredPositiveInteger(value: unknown, field: string, runId: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error(`Workflow run '${runId}' lock field '${field}' must be a positive integer.`)
  }
  return Number(value)
}

function requiredTimestamp(value: unknown, field: string, runId: string): string {
  const timestamp = requiredString(value, field, runId)
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`Workflow run '${runId}' lock field '${field}' must be an ISO timestamp.`)
  }
  return timestamp
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
