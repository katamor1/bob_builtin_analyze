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
  snapshotExactWorkflowLockRecord
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
  const rawPackage = snapshotWorkflowLockRawPackage(outer.rawPackage)
  const providers = snapshotWorkflowLockProviders(outer.providers, rawPackage)
  const bob = snapshotWorkflowLockBob(outer.bob)
  return freezeWorkflowLockEvidence({ rawPackage, providers, bob })
}
