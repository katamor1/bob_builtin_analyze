import { AsyncLocalStorage } from "node:async_hooks"

import { normalizeWorkspaceRootIdentity } from "../../workspaceRootIdentity"
import { canonicalJsonText } from "./canonicalJson"
import { requireCompiledWorkflowPlanState } from "./compiledPlan"
import { cloneAndFreezeJsonValue, type JsonValue } from "./jsonValue"
import type { WorkflowPlanLease } from "./planLease"
import type { Sha256Digest } from "./providerContract"
import { bob as decodeWorkflowLockBob } from "./workflowLockBob"
import {
  WORKFLOW_COMPILER_CONTRACT_VERSION,
  type LockedBobBinding,
  type LockedProviderBinding
} from "./workflowLockContract"
import { freezeEvidence } from "./workflowLockIntrinsics"
import { providers as decodeWorkflowLockProviders } from "./workflowLockProvider"
import { array, digest, identifier, record } from "./workflowLockValidation"

export const WORKFLOW_RUN_PLAN_PROVENANCE_SCHEMA_VERSION =
  "workflow-run-plan-provenance/v1" as const

export interface WorkflowContractV2RunPlanProvenance {
  readonly schemaVersion: typeof WORKFLOW_RUN_PLAN_PROVENANCE_SCHEMA_VERSION
  readonly workflowId: string
  readonly generation: Sha256Digest
  readonly planDigest: Sha256Digest
  readonly packageDigest: Sha256Digest
  readonly lockfileDigest: Sha256Digest
  readonly environmentDigest: Sha256Digest
  readonly compilerContractVersion: typeof WORKFLOW_COMPILER_CONTRACT_VERSION
  readonly providerExactBindings: readonly LockedProviderBinding[]
  readonly bobProfileBinding: LockedBobBinding
}

declare module "../modelRuntime" {
  interface WorkflowRunState {
    planProvenance?: WorkflowContractV2RunPlanProvenance
  }
  interface WorkflowRunStateV2 {
    planProvenance?: WorkflowContractV2RunPlanProvenance
  }
}

interface WorkflowContractV2RunStateLike {
  readonly runId: string
  status: string
  planProvenance?: WorkflowContractV2RunPlanProvenance
}

interface WorkflowContractV2LeaseContext {
  readonly lease: WorkflowPlanLease
  adopted: boolean
}

const PROVENANCE_FIELDS = freezeEvidence([
  "schemaVersion",
  "workflowId",
  "generation",
  "planDigest",
  "packageDigest",
  "lockfileDigest",
  "environmentDigest",
  "compilerContractVersion",
  "providerExactBindings",
  "bobProfileBinding"
] as const)
const arrayFrom = Array.from
const canonicalJsonTextCaptured = canonicalJsonText
const jsonStringify = JSON.stringify
const mapClear = Function.prototype.call.bind(Map.prototype.clear) as (
  map: Map<string, WorkflowPlanLease>
) => void
const mapDelete = Function.prototype.call.bind(Map.prototype.delete) as (
  map: Map<string, WorkflowPlanLease>, key: string
) => boolean
const mapGet = Function.prototype.call.bind(Map.prototype.get) as (
  map: ReadonlyMap<string, WorkflowPlanLease>, key: string
) => WorkflowPlanLease | undefined
const mapSet = Function.prototype.call.bind(Map.prototype.set) as (
  map: Map<string, WorkflowPlanLease>, key: string, value: WorkflowPlanLease
) => Map<string, WorkflowPlanLease>
const mapValues = Function.prototype.call.bind(Map.prototype.values) as (
  map: ReadonlyMap<string, WorkflowPlanLease>
) => IterableIterator<WorkflowPlanLease>
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<object, WorkflowPlanLease>, key: object
) => WorkflowPlanLease | undefined
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<object, WorkflowPlanLease>, key: object, value: WorkflowPlanLease
) => WeakMap<object, WorkflowPlanLease>
const leaseContext = new AsyncLocalStorage<WorkflowContractV2LeaseContext>()
const runObjectLeases = new WeakMap<object, WorkflowPlanLease>()
const runLeases = new Map<string, WorkflowPlanLease>()

export function decodeWorkflowContractV2RunPlanProvenance(
  value: unknown
): WorkflowContractV2RunPlanProvenance {
  const cloned = cloneAndFreezeJsonValue(value)
  const item = record(
    cloned,
    PROVENANCE_FIELDS,
    "Workflow Contract v2 run plan provenance"
  )
  if (item.schemaVersion !== WORKFLOW_RUN_PLAN_PROVENANCE_SCHEMA_VERSION) {
    throw new TypeError("Workflow Contract v2 run plan provenance schemaVersion is invalid.")
  }
  if (item.compilerContractVersion !== WORKFLOW_COMPILER_CONTRACT_VERSION) {
    throw new TypeError("Workflow Contract v2 run plan provenance compiler version is invalid.")
  }
  const providerValues = array(
    item.providerExactBindings,
    256,
    "Workflow Contract v2 run plan provenance.providerExactBindings"
  )
  return freezeEvidence({
    schemaVersion: WORKFLOW_RUN_PLAN_PROVENANCE_SCHEMA_VERSION,
    workflowId: identifier(
      item.workflowId,
      "Workflow Contract v2 run plan provenance.workflowId"
    ),
    generation: digest(
      item.generation,
      "Workflow Contract v2 run plan provenance.generation"
    ),
    planDigest: digest(
      item.planDigest,
      "Workflow Contract v2 run plan provenance.planDigest"
    ),
    packageDigest: digest(
      item.packageDigest,
      "Workflow Contract v2 run plan provenance.packageDigest"
    ),
    lockfileDigest: digest(
      item.lockfileDigest,
      "Workflow Contract v2 run plan provenance.lockfileDigest"
    ),
    environmentDigest: digest(
      item.environmentDigest,
      "Workflow Contract v2 run plan provenance.environmentDigest"
    ),
    compilerContractVersion: WORKFLOW_COMPILER_CONTRACT_VERSION,
    providerExactBindings: decodeWorkflowLockProviders(providerValues),
    bobProfileBinding: decodeWorkflowLockBob(item.bobProfileBinding as JsonValue)
  })
}

export function createWorkflowContractV2RunPlanProvenance(
  lease: WorkflowPlanLease
): WorkflowContractV2RunPlanProvenance {
  const handle = requireActiveLeaseHandle(lease)
  const state = requireCompiledWorkflowPlanState(handle)
  if (state.publication !== "published") {
    throw new TypeError("Workflow Contract v2 run provenance requires a published plan.")
  }
  return decodeWorkflowContractV2RunPlanProvenance({
    schemaVersion: WORKFLOW_RUN_PLAN_PROVENANCE_SCHEMA_VERSION,
    workflowId: handle.plan.workflowId,
    generation: state.generation,
    planDigest: handle.planDigest,
    packageDigest: handle.plan.packageDigest,
    lockfileDigest: handle.plan.lockfileDigest,
    environmentDigest: handle.plan.environmentDigest,
    compilerContractVersion: handle.plan.compilerContractVersion,
    providerExactBindings: handle.plan.providerBindings,
    bobProfileBinding: handle.plan.bobProfileBinding
  })
}

export function assertWorkflowContractV2RunPlanProvenanceMatchesLease(
  value: unknown,
  lease: WorkflowPlanLease
): WorkflowContractV2RunPlanProvenance {
  const actual = decodeWorkflowContractV2RunPlanProvenance(value)
  const expected = createWorkflowContractV2RunPlanProvenance(lease)
  if (canonicalJsonTextCaptured(actual) !== canonicalJsonTextCaptured(expected)) {
    throw new TypeError("Workflow Contract v2 run plan provenance does not match its lease.")
  }
  return actual
}

export async function runWithWorkflowContractV2PlanLease<T>(
  lease: WorkflowPlanLease,
  operation: () => Promise<T> | T
): Promise<T> {
  requireActiveLeaseHandle(lease)
  if (typeof operation !== "function") {
    throw new TypeError("Workflow Contract v2 leased operation is invalid.")
  }
  const existing = leaseContext.getStore()
  if (existing !== undefined) {
    if (existing.lease !== lease) {
      throw new TypeError("Workflow Contract v2 leased operations cannot mix plan leases.")
    }
    return operation()
  }

  const context: WorkflowContractV2LeaseContext = { lease, adopted: false }
  try {
    return await leaseContext.run(context, operation)
  } finally {
    if (!context.adopted) lease.release()
  }
}

export function currentWorkflowContractV2PlanLease(): WorkflowPlanLease | undefined {
  const current = leaseContext.getStore()?.lease
  return current === undefined || current.released ? undefined : current
}

export function bindWorkflowContractV2RunPlanLease(
  run: WorkflowContractV2RunStateLike,
  lease: WorkflowPlanLease
): WorkflowContractV2RunPlanProvenance {
  const provenance = requireRunProvenance(run)
  const verified = assertWorkflowContractV2RunPlanProvenanceMatchesLease(provenance, lease)
  weakMapSet(runObjectLeases, run, lease)
  run.planProvenance = verified
  return verified
}

export function prepareWorkflowContractV2RunPlanLeaseForWrite(
  workspaceScope: string,
  run: WorkflowContractV2RunStateLike
): WorkflowPlanLease | undefined {
  if (run.planProvenance === undefined) return undefined
  const lease = leaseForRun(workspaceScope, run)
  if (lease === undefined) {
    throw new TypeError("Workflow Contract v2 run plan lease is unavailable.")
  }
  bindWorkflowContractV2RunPlanLease(run, lease)
  return lease
}

export function adoptWorkflowContractV2RunPlanLease(
  workspaceScope: string,
  run: WorkflowContractV2RunStateLike,
  preparedLease?: WorkflowPlanLease
): void {
  if (run.planProvenance === undefined) return
  const lease = preparedLease ?? leaseForRun(workspaceScope, run)
  if (lease === undefined) {
    throw new TypeError("Workflow Contract v2 run plan lease is unavailable.")
  }
  bindWorkflowContractV2RunPlanLease(run, lease)
  const key = runLeaseKey(workspaceScope, run.runId)
  const existing = mapGet(runLeases, key)
  if (existing !== undefined && existing !== lease) {
    throw new TypeError("Workflow Contract v2 run already has a different plan lease.")
  }
  mapSet(runLeases, key, lease)
  const context = leaseContext.getStore()
  if (context?.lease === lease) context.adopted = true
}

export function bindAvailableWorkflowContractV2RunPlanLease(
  workspaceScope: string,
  run: WorkflowContractV2RunStateLike
): void {
  if (run.planProvenance === undefined) return
  const lease = mapGet(runLeases, runLeaseKey(workspaceScope, run.runId))
  if (lease === undefined) return
  bindWorkflowContractV2RunPlanLease(run, lease)
}

export function requireWorkflowContractV2RunPlanLease(
  run: WorkflowContractV2RunStateLike
): WorkflowPlanLease {
  if (run.planProvenance === undefined) {
    throw new TypeError("Workflow run does not contain Contract v2 plan provenance.")
  }
  let lease = weakMapGet(runObjectLeases, run)
  if (lease === undefined) {
    lease = currentWorkflowContractV2PlanLease()
    if (lease !== undefined) bindWorkflowContractV2RunPlanLease(run, lease)
  }
  if (lease === undefined || lease.released) {
    throw new TypeError("Workflow Contract v2 run plan lease is unavailable.")
  }
  assertWorkflowContractV2RunPlanProvenanceMatchesLease(run.planProvenance, lease)
  return lease
}

export function requireWorkflowContractV2RunPlanLeaseForExecution(
  workspaceScope: string,
  run: WorkflowContractV2RunStateLike
): WorkflowPlanLease | undefined {
  if (run.planProvenance === undefined) return undefined
  const lease = mapGet(runLeases, runLeaseKey(workspaceScope, run.runId))
  if (lease === undefined || lease.released) {
    throw new TypeError("Workflow Contract v2 run plan lease is unavailable for execution.")
  }
  bindWorkflowContractV2RunPlanLease(run, lease)
  return lease
}

export function releaseWorkflowContractV2RunPlanLease(
  workspaceScope: string,
  runId: string
): void {
  const key = runLeaseKey(workspaceScope, runId)
  const lease = mapGet(runLeases, key)
  if (lease === undefined) return
  mapDelete(runLeases, key)
  lease.release()
}

export function releaseAllWorkflowContractV2RunPlanLeases(): void {
  const leases = arrayFrom(mapValues(runLeases))
  mapClear(runLeases)
  for (const lease of leases) lease.release()
}

export function workflowContractV2RunIsTerminal(
  run: WorkflowContractV2RunStateLike
): boolean {
  return run.status === "completed" || run.status === "failed"
}

function leaseForRun(
  workspaceScope: string,
  run: WorkflowContractV2RunStateLike
): WorkflowPlanLease | undefined {
  const objectLease = weakMapGet(runObjectLeases, run)
  if (objectLease !== undefined && !objectLease.released) return objectLease
  const contextual = currentWorkflowContractV2PlanLease()
  if (contextual !== undefined) return contextual
  const keyed = mapGet(runLeases, runLeaseKey(workspaceScope, run.runId))
  return keyed === undefined || keyed.released ? undefined : keyed
}

function requireRunProvenance(
  run: WorkflowContractV2RunStateLike
): WorkflowContractV2RunPlanProvenance {
  if (run.planProvenance === undefined) {
    throw new TypeError("Workflow Contract v2 run plan provenance is required.")
  }
  return decodeWorkflowContractV2RunPlanProvenance(run.planProvenance)
}

function requireActiveLeaseHandle(lease: WorkflowPlanLease) {
  if (typeof lease !== "object" || lease === null || lease.released) {
    throw new TypeError("Workflow Contract v2 plan lease is invalid or released.")
  }
  return lease.handle
}

function runLeaseKey(workspaceScope: string, runId: string): string {
  if (typeof workspaceScope !== "string" || workspaceScope.length === 0) {
    throw new TypeError("Workflow Contract v2 run workspace scope is invalid.")
  }
  if (typeof runId !== "string" || runId.length === 0) {
    throw new TypeError("Workflow Contract v2 run id is invalid.")
  }
  const normalizedScope = workspaceScope.startsWith("anonymous-run-store:")
    ? workspaceScope
    : normalizeWorkspaceRootIdentity(workspaceScope)
  return jsonStringify([normalizedScope, runId])
}
