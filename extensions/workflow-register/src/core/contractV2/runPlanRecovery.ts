import { types as utilTypes } from "node:util"

import type { WorkflowRunState } from "../model"
import type { WorkflowPlanLease } from "./planLease"
import type { Sha256Digest } from "./providerContract"
import {
  adoptWorkflowContractV2RunPlanLease,
  assertWorkflowContractV2RunPlanProvenanceMatchesLease,
  decodeWorkflowContractV2RunPlanProvenance,
  requireWorkflowContractV2RunPlanLeaseForExecution,
  type WorkflowContractV2RunPlanProvenance
} from "./runPlanProvenance"

export interface WorkflowContractV2RecordedGenerationRequest {
  readonly workflowId: string
  readonly generation: Sha256Digest
  readonly expectedPackageDigest: Sha256Digest
}

export interface RecoverWorkflowContractV2RunPlanInput {
  readonly workspaceScope: string
  readonly run: WorkflowRunState
  readonly acquireGeneration: (
    request: WorkflowContractV2RecordedGenerationRequest
  ) => Promise<WorkflowPlanLease> | WorkflowPlanLease
}

const isProxy = utilTypes.isProxy
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectOwnKeys = Reflect.ownKeys
const INPUT_FIELDS = objectFreeze(["workspaceScope", "run", "acquireGeneration"] as const)

/**
 * Re-establishes the run-scoped live lease from the immutable generation named
 * by persisted provenance. The caller owns package location and environment
 * construction; this core boundary owns provenance validation and lease
 * adoption. No discovery pointer is accepted by this interface.
 */
export async function recoverWorkflowContractV2RunPlanLease(
  input: RecoverWorkflowContractV2RunPlanInput
): Promise<WorkflowPlanLease> {
  const snapshot = snapshotInput(input)
  const workspaceScope = requireWorkspaceScope(snapshot.workspaceScope)
  const run = requireRun(snapshot.run)
  const acquireGeneration = snapshot.acquireGeneration as RecoverWorkflowContractV2RunPlanInput["acquireGeneration"]
  const provenance = requireRecordedProvenance(run)

  let lease: WorkflowPlanLease | undefined
  try {
    lease = await acquireGeneration(objectFreeze({
      workflowId: provenance.workflowId,
      generation: provenance.generation,
      expectedPackageDigest: provenance.packageDigest
    }))
    assertWorkflowContractV2RunPlanProvenanceMatchesLease(provenance, lease)
    try {
      adoptWorkflowContractV2RunPlanLease(workspaceScope, run, lease)
      return lease
    } catch (adoptionError) {
      lease.release()
      lease = undefined
      const retained = requireWorkflowContractV2RunPlanLeaseForExecution(workspaceScope, run)
      if (retained === undefined) throw adoptionError
      assertWorkflowContractV2RunPlanProvenanceMatchesLease(provenance, retained)
      return retained
    }
  } catch (error) {
    if (lease !== undefined && !lease.released) lease.release()
    throw error
  }
}

function requireRecordedProvenance(
  run: WorkflowRunState
): WorkflowContractV2RunPlanProvenance {
  if (
    run.workflowSchemaVersion !== "workflow-register/v2"
    || run.planProvenance === undefined
  ) throw new TypeError("Recorded-generation recovery requires Contract v2 run provenance.")
  const provenance = decodeWorkflowContractV2RunPlanProvenance(run.planProvenance)
  if (
    run.workflowId !== provenance.workflowId
    || run.workflowDefinitionHash !== provenance.planDigest
  ) throw new TypeError("Recorded-generation recovery run identity does not match its provenance.")
  return provenance
}

function snapshotInput(
  value: unknown
): Readonly<Record<(typeof INPUT_FIELDS)[number], unknown>> {
  if (
    value === null
    || typeof value !== "object"
    || isProxy(value)
  ) throw new TypeError("Recorded-generation recovery input must be a non-proxy record.")
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) {
    throw new TypeError("Recorded-generation recovery input must be an ordinary record.")
  }
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== INPUT_FIELDS.length) {
    throw new TypeError("Recorded-generation recovery input has an invalid shape.")
  }
  const result = Object.create(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !contains(INPUT_FIELDS, key)) {
      throw new TypeError("Recorded-generation recovery input contains an unknown field.")
    }
    const descriptor = descriptors[key]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError("Recorded-generation recovery input fields must be enumerable data properties.")
    result[key] = descriptor.value
  }
  return objectFreeze(result) as Readonly<Record<(typeof INPUT_FIELDS)[number], unknown>>
}

function requireRun(value: unknown): WorkflowRunState {
  if (
    value === null
    || typeof value !== "object"
    || isProxy(value)
    || objectGetPrototypeOf(value) !== objectPrototype
  ) throw new TypeError("Recorded-generation recovery run is invalid.")
  return value as WorkflowRunState
}

function requireWorkspaceScope(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("Recorded-generation recovery workspace scope is invalid.")
  }
  return value
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}
