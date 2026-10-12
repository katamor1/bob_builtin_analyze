import { types as utilTypes } from "node:util"
import { cloneAndFreezeJsonValue } from "./jsonValue"
import type { Sha256Digest } from "./providerContract"
import type { LockedBobBinding, LockedProviderBinding } from "./workflowLockContract"
import { bob } from "./workflowLockBob"
import { providers } from "./workflowLockProvider"
import { array, digest, identifier, record } from "./workflowLockValidation"

export const WORKFLOW_RUN_PLAN_PROVENANCE_SCHEMA_VERSION = "workflow-run-plan-provenance/v1" as const
export interface WorkflowContractV2RunPlanProvenance {
  readonly schemaVersion: typeof WORKFLOW_RUN_PLAN_PROVENANCE_SCHEMA_VERSION
  readonly workflowId: string
  readonly generation: Sha256Digest
  readonly planDigest: Sha256Digest
  readonly packageDigest: Sha256Digest
  readonly lockfileDigest: Sha256Digest
  readonly environmentDigest: Sha256Digest
  readonly compilerContractVersion: "workflow-register-compiler/v2"
  readonly providerExactBindings: readonly LockedProviderBinding[]
  readonly bobProfileBinding: LockedBobBinding
}

const isProxy = utilTypes.isProxy
const descriptors = Object.getOwnPropertyDescriptors
const ownKeys = Reflect.ownKeys
const hasOwn = Object.hasOwn
const freeze = Object.freeze
const WeakSetClass = WeakSet
const seenHas = Function.prototype.call.bind(WeakSet.prototype.has) as (set: WeakSet<object>, value: object) => boolean
const seenAdd = Function.prototype.call.bind(WeakSet.prototype.add) as (set: WeakSet<object>, value: object) => unknown
const FIELDS = freeze(["schemaVersion", "workflowId", "generation", "planDigest", "packageDigest", "lockfileDigest",
  "environmentDigest", "compilerContractVersion", "providerExactBindings", "bobProfileBinding"])

export function decodeWorkflowContractV2RunPlanProvenance(value: unknown): WorkflowContractV2RunPlanProvenance {
  rejectAliasedData(value, new WeakSetClass<object>(), { nodes: 0 }, 0)
  const label = "Workflow run plan provenance"
  const snapshot = record(cloneAndFreezeJsonValue(value), FIELDS, label)
  if (snapshot.schemaVersion !== WORKFLOW_RUN_PLAN_PROVENANCE_SCHEMA_VERSION
    || snapshot.compilerContractVersion !== "workflow-register-compiler/v2") {
    throw new TypeError(`${label} has an unsupported contract version.`)
  }
  return freeze({
    schemaVersion: WORKFLOW_RUN_PLAN_PROVENANCE_SCHEMA_VERSION,
    workflowId: identifier(snapshot.workflowId, `${label}.workflowId`),
    generation: digest(snapshot.generation, `${label}.generation`),
    planDigest: digest(snapshot.planDigest, `${label}.planDigest`),
    packageDigest: digest(snapshot.packageDigest, `${label}.packageDigest`),
    lockfileDigest: digest(snapshot.lockfileDigest, `${label}.lockfileDigest`),
    environmentDigest: digest(snapshot.environmentDigest, `${label}.environmentDigest`),
    compilerContractVersion: "workflow-register-compiler/v2" as const,
    providerExactBindings: providers(array(snapshot.providerExactBindings, 256, `${label}.providerExactBindings`)),
    bobProfileBinding: bob(snapshot.bobProfileBinding)
  })
}

function rejectAliasedData(value: unknown, seen: WeakSet<object>, budget: { nodes: number }, depth: number): void {
  if (isProxy(value)) throw new TypeError("Workflow run plan provenance cannot contain a proxy.")
  if (value === null || typeof value !== "object") return
  if (depth > 32 || ++budget.nodes > 16_384 || seenHas(seen, value)) {
    throw new TypeError("Workflow run plan provenance contains aliased, cyclic or excessive data.")
  }
  seenAdd(seen, value)
  const snapshot = descriptors(value)
  for (const key of ownKeys(snapshot)) {
    if (typeof key !== "string" || key === "__proto__" || key === "prototype" || key === "constructor") {
      throw new TypeError("Workflow run plan provenance contains an invalid key.")
    }
    const descriptor = snapshot[key]
    if (!hasOwn(descriptor, "value") || hasOwn(descriptor, "get") || hasOwn(descriptor, "set")) {
      throw new TypeError("Workflow run plan provenance cannot contain an accessor.")
    }
    rejectAliasedData(descriptor.value, seen, budget, depth + 1)
  }
}
