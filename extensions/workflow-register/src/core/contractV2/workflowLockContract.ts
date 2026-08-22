import {
  BOB_2_0_1_CAPABILITIES,
  BOB_2_0_1_PROFILE_DIGEST,
  type BobCapabilityName,
  type BobTaskCapabilityName
} from "./bobProfile"
import { WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT } from "./jsonSchema"
import type { Sha256Digest } from "./providerContract"

const objectFreeze = Object.freeze

export const WORKFLOW_PACKAGE_LOCK_SCHEMA_VERSION = "workflow-register-lock/v2" as const
export const WORKFLOW_COMPILER_CONTRACT_VERSION = "workflow-register-compiler/v2" as const
export const WORKFLOW_PACKAGE_LOCK_SCHEMA_DIALECT = WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT

export interface WorkflowCompilerPolicyVersions {
  readonly canonicalJson: "workflow-contract-canonical-json/v1"
  readonly diagnostics: "workflow-contract-diagnostics/v1"
  readonly yaml: "workflow-contract-yaml/v2"
  readonly packageShape: "workflow-contract-package-shape/v2"
  readonly jsonSchema: "workflow-contract-json-schema/2020-12-v1"
  readonly predicate: "workflow-contract-predicate/v2"
  readonly provider: "workflow-contract-provider/v2"
  readonly bob: "workflow-contract-bob/2.0.1"
  readonly artifact: "workflow-contract-artifact/v2"
}

export const WORKFLOW_COMPILER_POLICY_VERSIONS: WorkflowCompilerPolicyVersions = objectFreeze({
  canonicalJson: "workflow-contract-canonical-json/v1",
  diagnostics: "workflow-contract-diagnostics/v1",
  yaml: "workflow-contract-yaml/v2",
  packageShape: "workflow-contract-package-shape/v2",
  jsonSchema: "workflow-contract-json-schema/2020-12-v1",
  predicate: "workflow-contract-predicate/v2",
  provider: "workflow-contract-provider/v2",
  bob: "workflow-contract-bob/2.0.1",
  artifact: "workflow-contract-artifact/v2"
})

export interface WorkflowLockedSchemaIdentity {
  readonly dialect: typeof WORKFLOW_PACKAGE_LOCK_SCHEMA_DIALECT
  readonly id: string
  readonly digest: Sha256Digest
}

export interface LockedFileEvidence {
  readonly id: string
  readonly path: string
  readonly bytes: number
  readonly digest: Sha256Digest
}

export interface LockedProviderSchemaEvidence {
  readonly id: string
  readonly bytes: number
  readonly digest: Sha256Digest
}

export type LockedProviderOutput =
  | { readonly kind: "unit" }
  | { readonly kind: "value"; readonly schema: LockedProviderSchemaEvidence }

export interface LockedProviderBinding {
  readonly id: string
  readonly requestedVersion: string
  readonly exactVersion: string
  readonly contractDigest: Sha256Digest
  readonly inputSchema: LockedProviderSchemaEvidence
  readonly output: LockedProviderOutput
  readonly errorSchema: LockedProviderSchemaEvidence
  readonly sideEffect: "none" | "workspace-write" | "external"
  readonly idempotency: "idempotent" | "key-required" | "non-idempotent"
  readonly requiredCapabilities: readonly string[]
}

export interface LockedBobBinding {
  readonly profile: "bob/2.0.1"
  readonly extensionId: "IBM.bob-code"
  readonly extensionVersion: "2.0.1"
  readonly profileDigest: typeof BOB_2_0_1_PROFILE_DIGEST
  readonly capabilities: typeof BOB_2_0_1_CAPABILITIES
  readonly requiredCapabilities: readonly BobCapabilityName[]
  readonly taskCapabilities: readonly BobTaskCapabilityName[]
}

export interface WorkflowPackageLock {
  readonly schemaVersion: typeof WORKFLOW_PACKAGE_LOCK_SCHEMA_VERSION
  readonly compilerContractVersion: typeof WORKFLOW_COMPILER_CONTRACT_VERSION
  readonly policyVersions: WorkflowCompilerPolicyVersions
  readonly workflow: {
    readonly path: "workflow.yaml"
    readonly bytes: number
    readonly digest: Sha256Digest
  }
  readonly prompts: readonly LockedFileEvidence[]
  readonly schemas: readonly LockedFileEvidence[]
  readonly providers: readonly LockedProviderBinding[]
  readonly bob: LockedBobBinding
  readonly environmentDigest: Sha256Digest
}
