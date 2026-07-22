import type { WorkflowContractAssetValidationResult } from "./templateMirrorValidator"

export const WORKFLOW_PACKAGE_EXPECTATION_SCHEMA_VERSION = "workflow-package-expectation/v1" as const

export interface WorkflowPackageExpectationOwner {
  id: string
  version: string
  owner_directory: string
  manifest_path: string
  manifest_sha256: string
  package_path: string
  package_sha256: string
}

export interface WorkflowPackageExpectationAsset {
  kind: "schema" | "template"
  id: string
  path: string
  sha256: string
}

export interface WorkflowPackageExpectation {
  schema_version: typeof WORKFLOW_PACKAGE_EXPECTATION_SCHEMA_VERSION
  owner: WorkflowPackageExpectationOwner
  assets: WorkflowPackageExpectationAsset[]
}

export interface VsixContributionPayloadValidationInput {
  archiveContent: Buffer
  expectedCatalog: unknown
  ownerId: string
}

interface ValidationEngine {
  validateVsixContributionPayload(input: VsixContributionPayloadValidationInput): WorkflowContractAssetValidationResult
}

// The CommonJS engine is deliberately tracked beside the packaging scripts so
// policy checks can load and execute from a clean checkout before TypeScript
// output exists. This source module is the typed adapter used by core callers.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const engine = require("../../scripts/lib/vsix-contribution-payload-validator") as ValidationEngine

export function validateVsixContributionPayload(
  input: VsixContributionPayloadValidationInput
): WorkflowContractAssetValidationResult {
  return engine.validateVsixContributionPayload(input)
}
