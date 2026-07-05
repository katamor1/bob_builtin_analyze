export const PROCESS_CATALOG_SCHEMA_VERSION = "bob-process-catalog/v1" as const
export const PROCESS_INPUT_SCHEMA_VERSION = "bob-process-input/v1" as const
export const PROCESS_RECORD_SCHEMA_VERSION = "bob-process-record/v1" as const
export const PROCESS_REVIEW_RESULT_SCHEMA_VERSION = "process-review-result/v1" as const

export const PROCESS_WORKFLOW_NAMES = [
  "process-code-doc-investigation",
  "process-qa-intake-analysis",
  "process-external-spec-design",
  "process-external-spec-review",
  "process-internal-spec-design",
  "process-internal-spec-review",
  "process-coding-plan",
  "process-code-precheck",
  "process-unit-test-design",
  "process-unit-test-execution-review",
  "process-functional-test-design",
  "process-functional-test-execution-review",
  "process-integration-test-design",
  "process-common-review"
] as const

export const PROCESS_PHASES = [
  "investigation",
  "qa",
  "external_spec",
  "internal_spec",
  "coding",
  "unit_test",
  "functional_test",
  "integration_test",
  "common"
] as const

export type ProcessWorkflowName = typeof PROCESS_WORKFLOW_NAMES[number]
export type ProcessPhase = typeof PROCESS_PHASES[number]

export interface ProcessCatalogWorkflow {
  name: ProcessWorkflowName | string
  title: string
  phase: ProcessPhase | string
  workflowPath: string
  inputSchema: string
  recordSchema: string
  reviewResultSchema: string
  requiredInputs: string[]
  artifactOutputs: string[]
  humanGates: string[]
}

export interface ProcessCatalog {
  schemaVersion: typeof PROCESS_CATALOG_SCHEMA_VERSION
  catalogId: string
  displayName?: string
  version?: number | string
  workflowRoot: string
  runRoot: string
  recordRoot: string
  workflows: ProcessCatalogWorkflow[]
}

export type ProcessValidationResult<T> =
  | { ok: true; diagnostics: string[]; value: T }
  | { ok: false; diagnostics: string[]; value?: T }
