import { canonicalJsonDigest } from "./canonicalJson"
import type { Sha256Digest } from "./providerContract"
import {
  decodeWorkflowPackageLock,
  WORKFLOW_COMPILER_CONTRACT_VERSION,
  WORKFLOW_COMPILER_POLICY_VERSIONS,
  WORKFLOW_PACKAGE_LOCK_SCHEMA_VERSION,
  type WorkflowPackageLock
} from "./workflowLockShape"
import {
  workflowLockFileByPath,
  workflowLockFileEvidence,
  type WorkflowLockGenerationSnapshot
} from "./workflowLockSnapshot"

const objectFreeze = Object.freeze

export function generateWorkflowPackageLockFromSnapshot(
  snapshot: WorkflowLockGenerationSnapshot
): WorkflowPackageLock {
  const workflow = workflowLockFileByPath(snapshot.rawPackage, "workflow.yaml")
  if (workflow === undefined) throw new TypeError("Workflow package does not contain workflow.yaml.")

  const policyVersions = objectFreeze({ ...WORKFLOW_COMPILER_POLICY_VERSIONS })
  const environmentDigest = canonicalJsonDigest(objectFreeze({
    schemaVersion: "workflow-register-compiler-environment/v2" as const,
    compilerContractVersion: WORKFLOW_COMPILER_CONTRACT_VERSION,
    policyVersions,
    providers: snapshot.providers,
    bob: snapshot.bob
  })) as Sha256Digest

  return decodeWorkflowPackageLock(objectFreeze({
    schemaVersion: WORKFLOW_PACKAGE_LOCK_SCHEMA_VERSION,
    compilerContractVersion: WORKFLOW_COMPILER_CONTRACT_VERSION,
    policyVersions,
    workflow: objectFreeze({
      path: "workflow.yaml" as const,
      bytes: workflow.byteLength,
      digest: workflow.digest
    }),
    prompts: workflowLockFileEvidence(snapshot.rawPackage, "prompt"),
    schemas: workflowLockFileEvidence(snapshot.rawPackage, "schema"),
    providers: snapshot.providers,
    bob: snapshot.bob,
    environmentDigest
  }))
}
