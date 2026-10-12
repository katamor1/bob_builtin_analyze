import { AsyncLocalStorage } from "node:async_hooks"
import { types as utilTypes } from "node:util"
import type { WorkflowRunState } from "../modelRuntime"
import { assertSafeWorkflowRunId } from "../runtime/runStatePath"
import { normalizeWorkspaceRootIdentity } from "../../workspaceRootIdentity"
import { canonicalJsonText } from "./canonicalJson"
import { requireCompiledWorkflowPlanState } from "./compiledPlan"
import { requireActiveWorkflowPlanLease, type WorkflowPlanLease } from "./planLease"
import { decodeWorkflowContractV2RunPlanProvenance, type WorkflowContractV2RunPlanProvenance } from "./runPlanProvenance"

interface Scope { readonly lease: WorkflowPlanLease; open: boolean }
const scopes = new AsyncLocalStorage<Scope>()
const activeScopes = new WeakMap<WorkflowPlanLease, Scope>()
const runBindings = new WeakMap<object, WorkflowPlanLease>()
const boundRunIds = new WeakMap<WorkflowPlanLease, string>()
const leaseKeys = new WeakMap<WorkflowPlanLease, string>()
const retained = new Map<string, WorkflowPlanLease>()
const isProxy = utilTypes.isProxy
const getDescriptors = Object.getOwnPropertyDescriptors
const hasOwn = Object.hasOwn
const stringify = canonicalJsonText

export function createWorkflowContractV2RunPlanProvenance(value: unknown): WorkflowContractV2RunPlanProvenance {
  const lease = requireActiveWorkflowPlanLease(value)
  const state = requireCompiledWorkflowPlanState(lease.handle), plan = lease.handle.plan
  return decodeWorkflowContractV2RunPlanProvenance({
    schemaVersion: "workflow-run-plan-provenance/v1", workflowId: plan.workflowId, generation: state.generation,
    planDigest: lease.planDigest, packageDigest: lease.packageDigest, lockfileDigest: plan.lockfileDigest,
    environmentDigest: lease.environmentDigest, compilerContractVersion: plan.compilerContractVersion,
    providerExactBindings: plan.providerBindings, bobProfileBinding: plan.bobProfileBinding
  })
}

export function assertWorkflowContractV2RunPlanProvenanceMatchesLease(provenance: unknown, value: unknown): void {
  const lease = requireActiveWorkflowPlanLease(value)
  if (stringify(decodeWorkflowContractV2RunPlanProvenance(provenance)) !== stringify(createWorkflowContractV2RunPlanProvenance(lease))) {
    throw new TypeError("Workflow run plan provenance does not match its exact live lease.")
  }
}

export async function runWithWorkflowContractV2PlanLease<T>(value: unknown, operation: () => T | Promise<T>): Promise<T> {
  const lease = requireActiveWorkflowPlanLease(value), current = scopes.getStore()
  if (current && !current.open) throw new TypeError("Workflow plan lease scope is closed.")
  if (current) {
    if (current.lease === lease) return operation()
    // A lease already owned by another active scope/run is never ours to release.
    if (!activeScopes.has(lease) && !leaseKeys.has(lease)) lease.release()
    throw new TypeError("Conflicting workflow plan lease scope.")
  }
  if (activeScopes.has(lease)) throw new TypeError("Workflow plan lease has a different active scope owner.")
  const scope: Scope = { lease, open: true }; activeScopes.set(lease, scope)
  let failed = false, failure: unknown, result!: T
  try { result = await scopes.run(scope, operation) } catch (error) { failed = true; failure = error }
  scope.open = false; activeScopes.delete(lease)
  let cleanupFailed = false, cleanupError: unknown
  if (failed || !hasRetainedLease(lease)) {
    try { forgetAndRelease(lease) } catch (error) { cleanupFailed = true; cleanupError = error }
  }
  if (failed) throw failure
  if (cleanupFailed) throw cleanupError
  return result
}

export function currentWorkflowContractV2PlanLease(): WorkflowPlanLease | undefined {
  const scope = scopes.getStore()
  if (!scope?.open) return undefined
  try { return requireActiveWorkflowPlanLease(scope.lease) } catch { return undefined }
}

export function bindWorkflowContractV2RunPlanLease(run: WorkflowRunState, value: unknown): void {
  const lease = requireActiveWorkflowPlanLease(value), evidence = runEvidence(run)
  assertWorkflowContractV2RunPlanProvenanceMatchesLease(evidence.provenance, lease)
  const existing = runBindings.get(run), runId = boundRunIds.get(lease)
  if ((existing && existing !== lease) || (runId !== undefined && runId !== evidence.runId)) {
    throw new TypeError("Workflow plan lease has a conflicting run owner.")
  }
  boundRunIds.set(lease, evidence.runId); runBindings.set(run, lease)
}

export function prepareWorkflowContractV2RunPlanLeaseForWrite(workspaceRoot: string, run: WorkflowRunState): void {
  const lease = requireBoundLease(run), key = runKey(workspaceRoot, runEvidence(run).runId)
  requireScope(lease)
  const ownerKey = leaseKeys.get(lease), existing = retained.get(key)
  if ((ownerKey !== undefined && ownerKey !== key) || (existing !== undefined && existing !== lease)) {
    throw new TypeError("Workflow plan lease has a conflicting workspace/run owner.")
  }
  leaseKeys.set(lease, key)
}

export function adoptWorkflowContractV2RunPlanLease(workspaceRoot: string, run: WorkflowRunState): void {
  prepareWorkflowContractV2RunPlanLeaseForWrite(workspaceRoot, run)
  retained.set(runKey(workspaceRoot, runEvidence(run).runId), requireBoundLease(run))
}

export function bindAvailableWorkflowContractV2RunPlanLease(workspaceRoot: string, run: WorkflowRunState): WorkflowPlanLease | undefined {
  const evidence = runEvidence(run), lease = retained.get(runKey(workspaceRoot, evidence.runId))
  if (!lease) return undefined
  requireActiveWorkflowPlanLease(lease)
  bindWorkflowContractV2RunPlanLease(run, lease)
  return lease
}

export function requireWorkflowContractV2RunPlanLease(workspaceRoot: string, run: WorkflowRunState): WorkflowPlanLease {
  const lease = bindAvailableWorkflowContractV2RunPlanLease(workspaceRoot, run)
  if (!lease) throw new TypeError("Workflow run has no retained live plan lease.")
  return lease
}

export function requireWorkflowContractV2RunPlanLeaseForExecution(workspaceRoot: string, run: WorkflowRunState): WorkflowPlanLease {
  const lease = requireWorkflowContractV2RunPlanLease(workspaceRoot, run)
  requireScope(lease)
  return lease
}

export function releaseWorkflowContractV2RunPlanLease(workspaceRoot: string, runId: string): void {
  const lease = retained.get(runKey(workspaceRoot, runId))
  if (lease) forgetAndRelease(lease)
}

export function releaseAllWorkflowContractV2RunPlanLeases(): void {
  const leases = [...retained.values()]
  retained.clear()
  for (let index = 0; index < leases.length; index++) { leaseKeys.delete(leases[index]); boundRunIds.delete(leases[index]) }
  let failed = false, failure: unknown
  for (let index = 0; index < leases.length; index++) {
    try { leases[index].release() } catch (error) { if (!failed) { failed = true; failure = error } }
  }
  if (failed) throw failure
}

function requireScope(lease: WorkflowPlanLease): void {
  if (currentWorkflowContractV2PlanLease() !== lease) throw new TypeError("Workflow run requires its exact active plan lease context.")
}
function requireBoundLease(run: WorkflowRunState): WorkflowPlanLease {
  const evidence = runEvidence(run), value = runBindings.get(run)
  const lease = requireActiveWorkflowPlanLease(value)
  assertWorkflowContractV2RunPlanProvenanceMatchesLease(evidence.provenance, lease)
  if (boundRunIds.get(lease) !== evidence.runId) throw new TypeError("Workflow plan lease run owner changed.")
  return lease
}
function hasRetainedLease(lease: WorkflowPlanLease): boolean {
  const key = leaseKeys.get(lease)
  return key !== undefined && retained.get(key) === lease
}
function forgetAndRelease(lease: WorkflowPlanLease): void {
  const key = leaseKeys.get(lease)
  if (key !== undefined && retained.get(key) === lease) retained.delete(key)
  leaseKeys.delete(lease); boundRunIds.delete(lease)
  lease.release()
}
function runKey(workspaceRoot: string, runId: string): string {
  if (typeof workspaceRoot !== "string" || workspaceRoot.length === 0) throw new TypeError("Workflow run workspace is invalid.")
  assertSafeWorkflowRunId(runId)
  return JSON.stringify([normalizeWorkspaceRootIdentity(workspaceRoot), runId])
}
function runEvidence(run: WorkflowRunState): { runId: string; provenance: WorkflowContractV2RunPlanProvenance } {
  if (typeof run !== "object" || run === null || isProxy(run)) throw new TypeError("Workflow leased run is invalid.")
  const fields = getDescriptors(run)
  for (const key of ["runId", "workflowId", "workflowSchemaVersion", "workflowDefinitionHash", "planProvenance"]) {
    const property = fields[key]
    if (!property || !hasOwn(property, "value") || hasOwn(property, "get") || hasOwn(property, "set")) {
      throw new TypeError("Workflow leased run evidence must use ordinary data properties.")
    }
  }
  const runId: unknown = fields.runId.value
  if (typeof runId !== "string" || fields.workflowSchemaVersion!.value !== "workflow-register/v2") throw new TypeError("Workflow leased run identity is invalid.")
  assertSafeWorkflowRunId(runId)
  const provenance = decodeWorkflowContractV2RunPlanProvenance(fields.planProvenance!.value)
  if (fields.workflowId.value !== provenance.workflowId || fields.workflowDefinitionHash!.value !== provenance.planDigest) {
    throw new TypeError("Workflow leased run provenance association is invalid.")
  }
  return { runId, provenance }
}
