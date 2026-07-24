import {
  isCompiledWorkflowPlanLeasable,
  type CompiledWorkflowPlanHandle
} from "./compiledPlan"
import { compileWorkflowPackage } from "./compiler"
import {
  requireWorkflowCompilerEnvironmentState,
  type WorkflowCompilerEnvironment
} from "./compilerEnvironment"
import type { WorkflowContractV2Diagnostic } from "./diagnostics"
import { createWorkflowPlanLease, type WorkflowPlanLease } from "./planLease"
import {
  currentWorkflowPlanSlotEpoch,
  invalidateWorkflowPlanSlot,
  isWorkflowPlanRequestCurrent,
  snapshotWorkflowPlanRequest,
  type SnapshotWorkflowPlanRequest
} from "./planStoreInput"
import type { Sha256Digest } from "./providerContract"

export interface GetOrCompileWorkflowPlanInput {
  readonly collectionId: string
  readonly workflowId: string
  readonly rawPackage: SnapshotWorkflowPlanRequest["rawPackage"]
  readonly environment: WorkflowCompilerEnvironment
}

export type AcquireWorkflowPlanInput = GetOrCompileWorkflowPlanInput

export class WorkflowPlanCompilationError extends Error {
  constructor(readonly diagnostics: readonly WorkflowContractV2Diagnostic[]) {
    super("Workflow plan compilation failed with diagnostics.")
    this.name = "WorkflowPlanCompilationError"
  }
}

export class WorkflowPlanInvalidatedError extends Error {
  constructor() {
    super("Workflow plan request was invalidated before compilation completed.")
    this.name = "WorkflowPlanInvalidatedError"
  }
}

interface CacheEntry {
  readonly entryKey: string
  readonly requestKey: string
  readonly slotKey: string
  readonly epoch: number
  readonly packageDigest: Sha256Digest
  readonly environmentDigest: Sha256Digest
  readonly handle: CompiledWorkflowPlanHandle
  leases: number
}

interface NamespaceCache {
  readonly entries: Map<string, CacheEntry>
  readonly requestEntries: Map<string, string>
  readonly pending: Map<string, Promise<CacheEntry>>
}

const objectFreeze = Object.freeze
const mapDelete = Function.prototype.call.bind(Map.prototype.delete) as (
  map: Map<unknown, unknown>, key: unknown
) => boolean
const mapForEach = Function.prototype.call.bind(Map.prototype.forEach) as (
  map: ReadonlyMap<unknown, unknown>, callback: (value: unknown, key: unknown) => void
) => void
const mapGet = Function.prototype.call.bind(Map.prototype.get) as (
  map: ReadonlyMap<unknown, unknown>, key: unknown
) => unknown
const mapSet = Function.prototype.call.bind(Map.prototype.set) as (
  map: Map<unknown, unknown>, key: unknown, value: unknown
) => Map<unknown, unknown>
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<object, NamespaceCache>, key: object
) => NamespaceCache | undefined
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<object, NamespaceCache>, key: object, value: NamespaceCache
) => WeakMap<object, NamespaceCache>
const MapConstructor = Map
const WeakMapConstructor = WeakMap
const promiseResolve = Function.prototype.call.bind(Promise.resolve, Promise) as <T>(
  value: T | PromiseLike<T>
) => Promise<Awaited<T>>

export class WorkflowPlanStore {
  private readonly namespaces = new WeakMapConstructor<object, NamespaceCache>()

  async getOrCompile(input: GetOrCompileWorkflowPlanInput): Promise<CompiledWorkflowPlanHandle> {
    const request = snapshotWorkflowPlanRequest(input)
    return (await this.resolveCurrentEntry(request)).handle
  }

  async acquire(input: AcquireWorkflowPlanInput): Promise<WorkflowPlanLease> {
    const request = snapshotWorkflowPlanRequest(input)
    const environmentState = requireWorkflowCompilerEnvironmentState(request.environment)
    if (environmentState.purpose !== "runtime") {
      throw new TypeError("Workflow plan leases require a runtime compiler environment.")
    }

    const entry = await this.resolveCurrentEntry(request)
    if (!isCompiledWorkflowPlanLeasable(entry.handle)) {
      throw new TypeError("Workflow plan is not a published runtime-leasable handle.")
    }
    entry.leases += 1
    try {
      return createWorkflowPlanLease({
        handle: entry.handle,
        onRelease: () => this.releaseEntry(request.environment, entry)
      })
    } catch (error) {
      entry.leases -= 1
      throw error
    }
  }

  invalidateSlot(collectionId: string, workflowId: string): void {
    invalidateWorkflowPlanSlot(collectionId, workflowId)
  }

  private async resolveCurrentEntry(request: SnapshotWorkflowPlanRequest): Promise<CacheEntry> {
    const entry = await this.resolveEntry(request)
    if (
      entry.slotKey !== request.slotKey
      || entry.epoch !== request.epoch
      || !isWorkflowPlanRequestCurrent(request)
    ) throw new WorkflowPlanInvalidatedError()
    return entry
  }

  private async resolveEntry(request: SnapshotWorkflowPlanRequest): Promise<CacheEntry> {
    const namespace = this.namespace(request.environment)
    pruneStaleEntries(namespace)
    const requestKey = createRequestKey(request)
    const existingKey = mapGet(namespace.requestEntries, requestKey) as string | undefined
    const existing = existingKey === undefined
      ? undefined
      : mapGet(namespace.entries, existingKey) as CacheEntry | undefined
    if (existing !== undefined) return existing
    if (existingKey !== undefined) mapDelete(namespace.requestEntries, requestKey)

    const pending = mapGet(namespace.pending, requestKey) as Promise<CacheEntry> | undefined
    if (pending !== undefined) return pending

    const compilation = promiseResolve(undefined).then(() => this.compileEntry(namespace, request, requestKey))
    mapSet(namespace.pending, requestKey, compilation)
    try {
      return await compilation
    } finally {
      if (mapGet(namespace.pending, requestKey) === compilation) {
        mapDelete(namespace.pending, requestKey)
      }
    }
  }

  private compileEntry(
    namespace: NamespaceCache,
    request: SnapshotWorkflowPlanRequest,
    requestKey: string
  ): CacheEntry {
    const result = compileWorkflowPackage({
      rawPackage: request.rawPackage,
      environment: request.environment
    })
    if (!result.ok) throw new WorkflowPlanCompilationError(result.diagnostics)
    if (
      result.handle.plan.packageDigest !== request.packageDigest
      || result.handle.plan.workflowId !== request.workflowId
    ) throw new WorkflowPlanCompilationError(objectFreeze([]))
    if (!isWorkflowPlanRequestCurrent(request)) throw new WorkflowPlanInvalidatedError()

    const evidenceKey = `${request.packageDigest}|${result.handle.plan.environmentDigest}`
    const entryKey = `${requestKey}|${evidenceKey}`
    const entry: CacheEntry = {
      entryKey,
      requestKey,
      slotKey: request.slotKey,
      epoch: request.epoch,
      packageDigest: request.packageDigest,
      environmentDigest: result.handle.plan.environmentDigest,
      handle: result.handle,
      leases: 0
    }
    mapSet(namespace.entries, entryKey, entry)
    mapSet(namespace.requestEntries, requestKey, entryKey)
    return entry
  }

  private namespace(environment: WorkflowCompilerEnvironment): NamespaceCache {
    const existing = weakMapGet(this.namespaces, environment)
    if (existing !== undefined) return existing
    const created: NamespaceCache = {
      entries: new MapConstructor<string, CacheEntry>(),
      requestEntries: new MapConstructor<string, string>(),
      pending: new MapConstructor<string, Promise<CacheEntry>>()
    }
    weakMapSet(this.namespaces, environment, created)
    return created
  }

  private releaseEntry(environment: WorkflowCompilerEnvironment, entry: CacheEntry): void {
    if (entry.leases <= 0) throw new Error("Workflow plan lease count underflow.")
    entry.leases -= 1
    if (entry.leases !== 0 || currentWorkflowPlanSlotEpoch(entry.slotKey) === entry.epoch) return
    const namespace = weakMapGet(this.namespaces, environment)
    if (namespace !== undefined && mapGet(namespace.entries, entry.entryKey) === entry) {
      mapDelete(namespace.entries, entry.entryKey)
      if (mapGet(namespace.requestEntries, entry.requestKey) === entry.entryKey) {
        mapDelete(namespace.requestEntries, entry.requestKey)
      }
    }
  }
}

function pruneStaleEntries(namespace: NamespaceCache): void {
  const stale: CacheEntry[] = []
  mapForEach(namespace.entries, (value) => {
    const entry = value as CacheEntry
    if (entry.leases === 0 && currentWorkflowPlanSlotEpoch(entry.slotKey) !== entry.epoch) {
      stale[stale.length] = entry
    }
  })
  for (let index = 0; index < stale.length; index += 1) {
    const entry = stale[index]
    mapDelete(namespace.entries, entry.entryKey)
    if (mapGet(namespace.requestEntries, entry.requestKey) === entry.entryKey) {
      mapDelete(namespace.requestEntries, entry.requestKey)
    }
  }
}

function createRequestKey(request: SnapshotWorkflowPlanRequest): string {
  return `${request.slotKey}|${request.epoch}|${request.publication}|${request.generation}|${request.packageDigest}`
}
