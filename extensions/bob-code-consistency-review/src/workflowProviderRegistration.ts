import * as vscode from "vscode"
import { buildCaptureWorkflowOptions } from "./workflowOptions"
import { buildSafeWorkflowOptions, optionRecord } from "./workflowUserOptions"

const WORKFLOW_REGISTER_EXTENSION_ID = "local.workflow-register"
const PROVIDER_REGISTRY_API_VERSION = "provider-registry/v1" as const
const contributionManifest = require("../contracts/workflow-contributions.json") as WorkflowContributionManifest

interface WorkflowActionExecutionInput {
  args: unknown
  inputs: Record<string, unknown>
  state?: Record<string, string>
  workflowId?: string
  logicalWorkflowId?: string
  workflowRoot?: string
  workflowFile?: string
  workflowFolderName?: string
  bobRoot?: string
  workspaceRoot?: string
  runId?: string
  stepId?: string
  latestAssistantText?: string
  resultText?: string
  artifactText?: string
}

interface WorkflowActionProvider {
  id: string
  execute: (input: WorkflowActionExecutionInput) => Promise<unknown> | unknown
}

interface WorkflowContributionManifest {
  schema_version: "workflow-contributions/v1"
  owner: { id: string; version: string }
  registry_api: { min: string; max: string }
  action_providers: Array<{ id: string }>
  preflight_checks: unknown[]
  result_sinks: unknown[]
  workflow_templates: unknown[]
  schemas: unknown[]
  workflow_claims: unknown[]
  workflow_exclusions: unknown[]
  external_commands: unknown[]
}

interface WorkflowContributionHandlerSet {
  actionProviders: Map<string, WorkflowActionProvider>
  preflightChecks: Map<string, never>
  resultSinks: Map<string, never>
  agentProvider?: undefined
}

export interface WorkflowRegisterApi {
  readonly apiVersion: typeof PROVIDER_REGISTRY_API_VERSION
  negotiateProviderRegistry: (range: { min: string; max: string }) => typeof PROVIDER_REGISTRY_API_VERSION
  registerContributionSet: (
    manifest: WorkflowContributionManifest,
    provenance: WorkflowProviderProvenanceContext,
    handlers: WorkflowContributionHandlerSet
  ) => vscode.Disposable
}

export interface WorkflowProviderProvenanceContext {
  expectedOwner: { id: string; version: string }
  ownerDirectory: string
}

export type WorkflowProviderRegistrationResult =
  | { registered: false; registrations: vscode.Disposable[]; api?: undefined }
  | { registered: true; registrations: vscode.Disposable[]; api: WorkflowRegisterApi }

type WorkflowCommandHandler = (options?: unknown) => Promise<unknown> | unknown

const REVIEW_METADATA_WORKFLOW_KEYS = [
  "base",
  "changeType",
  "change_type",
  "head",
  "id",
  "outOfScope",
  "out_of_scope",
  "purpose",
  "reviewId",
  "reviewPurpose",
  "reviewTitle",
  "ticketIds",
  "ticket_ids",
  "title",
  "vcs",
  "vcsRoot",
  "vcs_root"
] as const

const WORKFLOW_COMMAND_ALLOWED_OPTIONS: Record<string, readonly string[]> = {
  "bobCodeConsistency.initializeWorkspace": ["reviewInputPath"],
  "bobCodeConsistency.createReviewInput": ["reviewInputPath", "textEncoding"],
  "bobCodeConsistency.prepareAiReviewInputDraft": [
    "aiDraftPromptPath",
    "base",
    "head",
    "reviewInputPath",
    "textEncoding",
    "vcs",
    "vcsRoot",
    "vcs_root"
  ],
  "bobCodeConsistency.applyAiReviewInputDraft": ["reviewInputPath", "strictPaths", "text"],
  "bobCodeConsistency.prepareAiTraceabilityDraft": [
    "aiTraceabilityDraftPromptPath",
    "base",
    "docsRoot",
    "head",
    "textEncoding",
    "traceabilityCatalogPath",
    "vcs",
    "vcsRoot",
    "vcs_root"
  ],
  "bobCodeConsistency.captureAiTraceabilityDraft": [
    "aiTraceabilityDraftPromptPath",
    "text",
    "textEncoding",
    "traceabilityDraftJsonPath"
  ],
  "bobCodeConsistency.applyAiTraceabilityDraft": [
    "aiTraceabilityDraftPromptPath",
    "text",
    "textEncoding",
    "traceabilityCatalogPath",
    "traceabilityDraftJsonPath",
    "traceabilityGateReportPath"
  ],
  "bobCodeConsistency.openTraceabilityPrep": ["textEncoding", "traceabilityCatalogPath", "traceabilityGateReportPath"],
  "bobCodeConsistency.validateTraceabilityCatalog": ["textEncoding", "traceabilityCatalogPath", "traceabilityGateReportPath"],
  "bobCodeConsistency.createReviewInputFromTraceability": [
    ...REVIEW_METADATA_WORKFLOW_KEYS,
    "reviewFocus",
    "review_focus",
    "reviewInputPath",
    "strictPaths",
    "textEncoding",
    "traceabilityCatalogPath",
    "traceabilityGateReportPath"
  ],
  "bobCodeConsistency.repairReviewInput": ["reviewInputPath", "textEncoding"],
  "bobCodeConsistency.explainReviewInputDiagnostics": ["reviewInputPath", "textEncoding"],
  "bobCodeConsistency.preprocess": [
    "maxBobInputBytes",
    "maxDocumentBytes",
    "maxExcerptBytesPerDocument",
    "maxRawDiffBytes",
    "maxRowsPerSheet",
    "maxWorkbookSheets",
    "vcsCommandTimeoutMs",
    "outDir",
    "reviewInputPath",
    "reviewPackagePath",
    "textEncoding"
  ],
  "bobCodeConsistency.validateOutput": ["bobOutputPath", "packageDir", "reviewPackagePath"],
  "bobCodeConsistency.triage": ["bobOutputPath", "outDir", "packageDir", "reviewPackagePath", "triagePath"]
}

export interface CodeConsistencyWorkflowHandlers {
  initializeWorkspace: WorkflowCommandHandler
  createReviewInput: WorkflowCommandHandler
  prepareAiReviewInputDraft: WorkflowCommandHandler
  applyAiReviewInputDraft: WorkflowCommandHandler
  prepareAiTraceabilityDraft: WorkflowCommandHandler
  captureAiTraceabilityDraft: WorkflowCommandHandler
  applyAiTraceabilityDraft: WorkflowCommandHandler
  openTraceabilityPrep: WorkflowCommandHandler
  validateTraceabilityCatalog: WorkflowCommandHandler
  createReviewInputFromTraceability: WorkflowCommandHandler
  repairReviewInput: WorkflowCommandHandler
  explainReviewInputDiagnostics: WorkflowCommandHandler
  preprocess: WorkflowCommandHandler
  captureBobOutput: WorkflowCommandHandler
  validateOutput: WorkflowCommandHandler
  triage: WorkflowCommandHandler
}

const WORKFLOW_HANDLER_KEYS = [
  "initializeWorkspace",
  "createReviewInput",
  "prepareAiReviewInputDraft",
  "applyAiReviewInputDraft",
  "prepareAiTraceabilityDraft",
  "captureAiTraceabilityDraft",
  "applyAiTraceabilityDraft",
  "openTraceabilityPrep",
  "validateTraceabilityCatalog",
  "createReviewInputFromTraceability",
  "repairReviewInput",
  "explainReviewInputDiagnostics",
  "preprocess",
  "captureBobOutput",
  "validateOutput",
  "triage"
] as const

export async function registerWorkflowProviders(
  handlers: CodeConsistencyWorkflowHandlers,
  provenance: WorkflowProviderProvenanceContext
): Promise<WorkflowProviderRegistrationResult> {
  validateWorkflowHandlers(handlers)
  const api = await getWorkflowRegisterApi()
  if (!api) return { registered: false, registrations: [] }

  const negotiatedVersion = api.negotiateProviderRegistry(contributionManifest.registry_api)
  if (negotiatedVersion !== PROVIDER_REGISTRY_API_VERSION) {
    throw new Error("Provider registry negotiation returned an unexpected version.")
  }
  const actionProviders = new Map<string, WorkflowActionProvider>([
    actionProvider({
      id: "bobCodeConsistency.initializeWorkspace",
      execute: (input) => handlers.initializeWorkspace(mergeWorkflowOptions("bobCodeConsistency.initializeWorkspace", input))
    }),
    actionProvider({
      id: "bobCodeConsistency.createReviewInput",
      execute: (input) => handlers.createReviewInput(mergeWorkflowOptions("bobCodeConsistency.createReviewInput", input))
    }),
    actionProvider({
      id: "bobCodeConsistency.prepareAiReviewInputDraft",
      execute: (input) => handlers.prepareAiReviewInputDraft(mergeWorkflowOptions("bobCodeConsistency.prepareAiReviewInputDraft", input))
    }),
    actionProvider({
      id: "bobCodeConsistency.applyAiReviewInputDraft",
      execute: (input) => handlers.applyAiReviewInputDraft(mergeWorkflowOptions("bobCodeConsistency.applyAiReviewInputDraft", input))
    }),
    actionProvider({
      id: "bobCodeConsistency.prepareAiTraceabilityDraft",
      execute: (input) => handlers.prepareAiTraceabilityDraft(mergeWorkflowOptions("bobCodeConsistency.prepareAiTraceabilityDraft", input))
    }),
    actionProvider({
      id: "bobCodeConsistency.captureAiTraceabilityDraft",
      execute: (input) => handlers.captureAiTraceabilityDraft(buildCaptureTraceabilityDraftOptions(input))
    }),
    actionProvider({
      id: "bobCodeConsistency.applyAiTraceabilityDraft",
      execute: (input) => handlers.applyAiTraceabilityDraft(buildApplyTraceabilityDraftOptions(input))
    }),
    actionProvider({
      id: "bobCodeConsistency.openTraceabilityPrep",
      execute: (input) => handlers.openTraceabilityPrep(mergeWorkflowOptions("bobCodeConsistency.openTraceabilityPrep", input))
    }),
    actionProvider({
      id: "bobCodeConsistency.validateTraceabilityCatalog",
      execute: (input) => handlers.validateTraceabilityCatalog(mergeWorkflowOptions("bobCodeConsistency.validateTraceabilityCatalog", input))
    }),
    actionProvider({
      id: "bobCodeConsistency.createReviewInputFromTraceability",
      execute: (input) => handlers.createReviewInputFromTraceability(mergeWorkflowOptions("bobCodeConsistency.createReviewInputFromTraceability", input))
    }),
    actionProvider({
      id: "bobCodeConsistency.repairReviewInput",
      execute: (input) => handlers.repairReviewInput(mergeWorkflowOptions("bobCodeConsistency.repairReviewInput", input))
    }),
    actionProvider({
      id: "bobCodeConsistency.explainReviewInputDiagnostics",
      execute: (input) => handlers.explainReviewInputDiagnostics(mergeWorkflowOptions("bobCodeConsistency.explainReviewInputDiagnostics", input))
    }),
    actionProvider({
      id: "bobCodeConsistency.preprocess",
      execute: (input) => handlers.preprocess(mergeWorkflowOptions("bobCodeConsistency.preprocess", input))
    }),
    actionProvider({
      id: "bobCodeConsistency.captureBobOutput",
      execute: (input) => handlers.captureBobOutput(buildCaptureBobOutputOptions(input))
    }),
    actionProvider({
      id: "bobCodeConsistency.validateOutput",
      execute: (input) => handlers.validateOutput(mergeWorkflowOptions("bobCodeConsistency.validateOutput", input))
    }),
    actionProvider({
      id: "bobCodeConsistency.triage",
      execute: (input) => handlers.triage(mergeWorkflowOptions("bobCodeConsistency.triage", input))
    })
  ])
  const registration = api.registerContributionSet(
    contributionManifest,
    provenance,
    {
      actionProviders,
      preflightChecks: new Map<string, never>(),
      resultSinks: new Map<string, never>()
    }
  )
  return { registered: true, registrations: [registration], api }
}

function actionProvider(
  provider: WorkflowActionProvider
): [string, WorkflowActionProvider] {
  return [provider.id, provider]
}

function validateWorkflowHandlers(handlers: unknown): asserts handlers is CodeConsistencyWorkflowHandlers {
  if (typeof handlers !== "object" || handlers === null) throw invalidWorkflowHandlerSetError()
  const ownKeys = Reflect.ownKeys(handlers)
  if (
    ownKeys.length !== WORKFLOW_HANDLER_KEYS.length
    || WORKFLOW_HANDLER_KEYS.some((key) => !ownKeys.includes(key))
  ) {
    throw invalidWorkflowHandlerSetError()
  }
  for (const key of WORKFLOW_HANDLER_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(handlers, key)
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function") {
      throw invalidWorkflowHandlerSetError()
    }
  }
}

function invalidWorkflowHandlerSetError(): Error {
  return new Error("Code consistency workflow handler set is invalid.")
}

async function getWorkflowRegisterApi(): Promise<WorkflowRegisterApi | undefined> {
  const extension = vscode.extensions.getExtension<WorkflowRegisterApi>(WORKFLOW_REGISTER_EXTENSION_ID)
  if (!extension) {
    console.warn(`workflow-register 拡張機能が見つかりません: ${WORKFLOW_REGISTER_EXTENSION_ID}`)
    return undefined
  }

  const api = extension.isActive ? extension.exports : await extension.activate()
  if (
    !api
    || api.apiVersion !== PROVIDER_REGISTRY_API_VERSION
    || typeof api.negotiateProviderRegistry !== "function"
    || typeof api.registerContributionSet !== "function"
  ) {
    console.warn(
      `workflow-register 拡張機能が provider-registry/v1 API を公開していません: ${WORKFLOW_REGISTER_EXTENSION_ID}`
    )
    return undefined
  }

  return api
}

function buildCaptureBobOutputOptions(input: WorkflowActionExecutionInput): Record<string, unknown> {
  const { args, inputs, state } = input
  return {
    ...optionRecord(buildCaptureWorkflowOptions({ args, inputs, state })),
    ...workflowContextOptions(input)
  }
}

export function buildApplyTraceabilityDraftOptions(input: WorkflowActionExecutionInput): Record<string, unknown> {
  const options = mergeWorkflowOptions("bobCodeConsistency.applyAiTraceabilityDraft", input)
  if (typeof options.text === "string" && options.text.trim().length > 0) return options
  const draftText = input.state?.traceabilityDraftJson
  if (typeof draftText === "string" && draftText.trim().length > 0) {
    return { ...options, text: draftText }
  }
  return options
}

function buildCaptureTraceabilityDraftOptions(input: WorkflowActionExecutionInput): Record<string, unknown> {
  return mergeWorkflowOptions("bobCodeConsistency.captureAiTraceabilityDraft", input)
}

function mergeWorkflowOptions(commandId: string, input: WorkflowActionExecutionInput): Record<string, unknown> {
  return {
    ...buildSafeWorkflowOptions({
      commandId,
      inputs: input.inputs,
      args: input.args,
      allowedKeys: WORKFLOW_COMMAND_ALLOWED_OPTIONS[commandId] ?? []
    }),
    ...workflowContextOptions(input)
  }
}

function workflowContextOptions(input: WorkflowActionExecutionInput): Record<string, unknown> {
  return {
    workflowRoot: input.workflowRoot,
    workflowFile: input.workflowFile,
    workflowFolderName: input.workflowFolderName,
    bobRoot: input.bobRoot,
    workspaceRoot: input.workspaceRoot,
    workflowRunId: input.runId
  }
}

export { optionRecord }
