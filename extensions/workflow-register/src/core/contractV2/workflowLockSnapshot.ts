import { types as utilTypes } from "node:util"
import type { RawWorkflowPackage } from "./packageLoaderContract"
import type { WorkflowProviderLockEvidence } from "./providerRegistry"
import type { LockedBobBinding, LockedProviderBinding } from "./workflowLockContract"
import {
  snapshotWorkflowLockBob,
  snapshotWorkflowLockProviders,
  type WorkflowPackageLockBobInput
} from "./workflowLockEnvironmentSnapshot"
import {
  snapshotWorkflowLockRawPackage,
  workflowLockFileByPath,
  workflowLockFileEvidence,
  WorkflowLockRawPackageEvidenceError,
  type WorkflowLockFileSnapshot,
  type WorkflowLockRawPackageSnapshot
} from "./workflowLockRawPackage"
import {
  freezeWorkflowLockEvidence,
  snapshotExactWorkflowLockRecord,
  testWorkflowLockPattern
} from "./workflowLockSnapshotUtilities"

export interface GenerateWorkflowPackageLockInput {
  readonly rawPackage: RawWorkflowPackage
  readonly providers: readonly WorkflowProviderLockEvidence[]
  readonly bob: WorkflowPackageLockBobInput
}

export type VerifyWorkflowPackageLockInput = GenerateWorkflowPackageLockInput

export interface WorkflowLockGenerationSnapshot {
  readonly rawPackage: WorkflowLockRawPackageSnapshot
  readonly providers: readonly LockedProviderBinding[]
  readonly bob: LockedBobBinding
}

const GENERATE_FIELDS = freezeWorkflowLockEvidence(["rawPackage", "providers", "bob"] as const)
const RAW_PACKAGE_FIELDS = freezeWorkflowLockEvidence([
  "publication", "workflowId", "generation", "packageDigest", "files"
] as const)
const STAGING_GENERATION_PATTERN = /^\.staging-[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u
const isProxy = utilTypes.isProxy
const weakSetAdd = Function.prototype.call.bind(WeakSet.prototype.add) as (
  set: WeakSet<object>, value: object
) => WeakSet<object>
const weakSetHas = Function.prototype.call.bind(WeakSet.prototype.has) as (
  set: WeakSet<object>, value: object
) => boolean
const generationSnapshots = new WeakSet<object>()

export {
  WorkflowLockRawPackageEvidenceError,
  type WorkflowLockFileSnapshot,
  type WorkflowLockRawPackageSnapshot,
  type WorkflowPackageLockBobInput,
  workflowLockFileByPath,
  workflowLockFileEvidence
}

export function snapshotWorkflowLockGenerationInput(
  input: unknown
): WorkflowLockGenerationSnapshot {
  const outer = snapshotExactWorkflowLockRecord(
    input,
    GENERATE_FIELDS,
    "Workflow lock generation input"
  )
  const rawPackage = snapshotWorkflowLockGenerationRawPackage(outer.rawPackage)
  const providers = snapshotWorkflowLockProviders(outer.providers)
  const bob = snapshotWorkflowLockBob(outer.bob)
  return freezeWorkflowLockEvidence({ rawPackage, providers, bob })
}

export function snapshotWorkflowLockGenerationRawPackage(value: unknown): WorkflowLockRawPackageSnapshot {
  if (
    typeof value === "object"
    && value !== null
    && !isProxy(value)
    && weakSetHas(generationSnapshots, value)
  ) {
    const revalidated = snapshotWorkflowLockRawPackage(value)
    weakSetAdd(generationSnapshots, revalidated)
    return revalidated
  }

  const raw = snapshotExactWorkflowLockRecord(
    value,
    RAW_PACKAGE_FIELDS,
    "Workflow raw package"
  )
  const normalized = raw.publication === "staging"
    ? snapshotStagingRawPackage(raw)
    : snapshotWorkflowLockRawPackage(value)
  weakSetAdd(generationSnapshots, normalized)
  return normalized
}

function snapshotStagingRawPackage(raw: Readonly<Record<string, unknown>>): WorkflowLockRawPackageSnapshot {
  if (
    typeof raw.generation !== "string"
    || !testWorkflowLockPattern(STAGING_GENERATION_PATTERN, raw.generation)
  ) throw new WorkflowLockRawPackageEvidenceError()
  return snapshotWorkflowLockRawPackage(freezeWorkflowLockEvidence({
    publication: "staging",
    workflowId: raw.workflowId,
    generation: raw.packageDigest,
    packageDigest: raw.packageDigest,
    files: raw.files
  }))
}
