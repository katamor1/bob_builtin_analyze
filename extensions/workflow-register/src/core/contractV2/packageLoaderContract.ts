import type { WorkflowPackageFileStat, WorkflowPackageFileSystem } from "./packageFileSystem"
import type { WorkflowPackageRoot } from "./packageRoot"
import type { Sha256Digest } from "./providerContract"
import { objectFreeze } from "./packageLoaderIntrinsics"

export const WORKFLOW_PACKAGE_V2_LOAD_LIMITS = objectFreeze({
  maxFiles: 512,
  maxDepth: 3,
  maxLogicalPathBytes: 240,
  maxWorkflowBytes: 1_048_576,
  maxLockBytes: 1_048_576,
  maxPromptBytes: 4_194_304,
  maxSchemaBytes: 4_194_304,
  maxTotalBytes: 33_554_432
} as const)

export const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u
export const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
export const STAGING_NAME_PATTERN = /^\.staging-[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u
export const PROMPT_FILE_PATTERN = /^prompts\/[A-Za-z0-9._-]+\.md$/u
export const SCHEMA_FILE_PATTERN = /^schemas\/[A-Za-z0-9._-]+\.json$/u
export const OWNER_SCHEMA_VERSION = "workflow-package-staging-owner/v1" as const
export const POINTER_MAX_BYTES = 1_048_576
export const OWNER_MAX_BYTES = 65_536

export interface RawWorkflowPackageFile {
  readonly path: string
  readonly bytes: Readonly<Uint8Array>
  readonly byteLength: number
  readonly digest: Sha256Digest
}

export interface RawWorkflowPackage {
  readonly publication: "published" | "staging"
  readonly workflowId: string
  readonly generation: string
  readonly packageDigest: Sha256Digest
  readonly files: readonly RawWorkflowPackageFile[]
}

export type LoadWorkflowPackageResult = RawWorkflowPackage

export interface LoadCurrentWorkflowPackageInput {
  readonly fileSystem: WorkflowPackageFileSystem<unknown>
  readonly collectionRoot: WorkflowPackageRoot
  readonly workflowId: string
}

export interface LoadWorkflowPackageGenerationInput extends LoadCurrentWorkflowPackageInput {
  readonly generation: string
  readonly expectedPackageDigest?: string
}

export type WorkflowPackageCandidate =
  | { readonly kind: "published"; readonly generation: string }
  | {
      readonly kind: "owned-staging"
      readonly name: string
      readonly ownershipToken: string
    }

export interface LoadWorkflowPackageCandidateInput extends LoadCurrentWorkflowPackageInput {
  readonly candidate: WorkflowPackageCandidate
  readonly expectedPackageDigest?: string
}

export interface FileMetadata {
  readonly path: string
  readonly segments: readonly string[]
  readonly stat: WorkflowPackageFileStat
  readonly physical: string
  readonly kind: "workflow" | "lock" | "prompt" | "schema"
}

export interface DirectorySnapshot {
  readonly segments: readonly string[]
  readonly names: readonly string[]
  readonly identity: string
  readonly physical: string
}

export interface CandidateTarget {
  readonly publication: "published" | "staging"
  readonly generation: string
  readonly expectedPackageDigest?: Sha256Digest
  readonly baseSegments: readonly string[]
}
