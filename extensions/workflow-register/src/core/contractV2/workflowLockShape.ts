import { cloneAndFreezeJsonValue } from "./jsonValue"
import type { WorkflowPackageDocumentV2 } from "./packageShape"
import type { WorkflowPackagePointer } from "./packagePointer"
import { bob } from "./workflowLockBob"
import {
  WORKFLOW_COMPILER_CONTRACT_VERSION,
  WORKFLOW_COMPILER_POLICY_VERSIONS,
  WORKFLOW_PACKAGE_LOCK_SCHEMA_VERSION,
  type WorkflowPackageLock
} from "./workflowLockContract"
import { files, policy, workflow } from "./workflowLockFiles"
import { preflightWorkflowLockCollectionLimits } from "./workflowLockPreflight"
import { providers } from "./workflowLockProvider"
import { array, digest, record } from "./workflowLockValidation"

export {
  WORKFLOW_COMPILER_CONTRACT_VERSION,
  WORKFLOW_COMPILER_POLICY_VERSIONS,
  WORKFLOW_PACKAGE_LOCK_SCHEMA_DIALECT,
  WORKFLOW_PACKAGE_LOCK_SCHEMA_VERSION
} from "./workflowLockContract"
export type {
  LockedBobBinding,
  LockedFileEvidence,
  LockedProviderBinding,
  LockedProviderOutput,
  LockedProviderSchemaEvidence,
  WorkflowCompilerPolicyVersions,
  WorkflowLockedSchemaIdentity,
  WorkflowPackageLock
} from "./workflowLockContract"

export interface WorkflowPackageSchemaV2 {
  readonly document: WorkflowPackageDocumentV2
  readonly pointer: WorkflowPackagePointer
  readonly lock: WorkflowPackageLock
}

export function decodeWorkflowPackageLock(input: unknown): WorkflowPackageLock {
  preflightWorkflowLockCollectionLimits(input)
  const value = record(cloneAndFreezeJsonValue(input), [
    "schemaVersion", "compilerContractVersion", "policyVersions", "workflow",
    "prompts", "schemas", "providers", "bob", "environmentDigest"
  ], "Workflow package lock")
  if (value.schemaVersion !== WORKFLOW_PACKAGE_LOCK_SCHEMA_VERSION) {
    throw new TypeError("Workflow package lock.schemaVersion is invalid.")
  }
  if (value.compilerContractVersion !== WORKFLOW_COMPILER_CONTRACT_VERSION) {
    throw new TypeError("Workflow package lock.compilerContractVersion is invalid.")
  }
  const prompts = array(value.prompts, 510, "Workflow package lock.prompts")
  const schemas = array(value.schemas, 510, "Workflow package lock.schemas")
  if (prompts.length + schemas.length > 510) {
    throw new TypeError("Workflow package lock prompts and schemas exceed the combined length limit.")
  }
  const providerValues = array(value.providers, 256, "Workflow package lock.providers")
  return Object.freeze({
    schemaVersion: WORKFLOW_PACKAGE_LOCK_SCHEMA_VERSION,
    compilerContractVersion: WORKFLOW_COMPILER_CONTRACT_VERSION,
    policyVersions: policy(value.policyVersions),
    workflow: workflow(value.workflow),
    prompts: files(prompts, "prompt", "Workflow package lock.prompts"),
    schemas: files(schemas, "schema", "Workflow package lock.schemas"),
    providers: providers(providerValues),
    bob: bob(value.bob),
    environmentDigest: digest(value.environmentDigest, "Workflow package lock.environmentDigest")
  })
}
