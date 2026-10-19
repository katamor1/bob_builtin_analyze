import * as fs from "node:fs"
import * as path from "node:path"
import * as vscode from "vscode"
import { buildCaptureWorkflowOptions } from "./workflowOptions"
import { buildSafeWorkflowOptions, optionRecord } from "./workflowUserOptions"

const WORKFLOW_REGISTER_EXTENSION_ID = "local.workflow-register"
const CODE_CONSISTENCY_PROVIDER_SOURCE_ID = "local.bob-code-consistency-review"

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
}

interface WorkflowActionProvider {
  id: string
  sourceId?: string
  execute: (input: WorkflowActionExecutionInput) => Promise<unknown> | unknown
}

export interface WorkflowContributionProvenance { readonly id: string; readonly version: string; readonly extensionRoot: string }
export interface WorkflowRegisterApi {
  readonly apiVersion: "provider-registry/v1"
  negotiateProviderRegistry: (range: { min: string; max: string }) => "provider-registry/v1"
  registerContributionSet: (manifest: unknown, provenance: WorkflowContributionProvenance, handlers: {
    actionProviders: Map<string, WorkflowActionProvider>; preflightChecks: Map<string, never>; resultSinks: Map<string, never>
  }) => vscode.Disposable
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

export async function registerWorkflowProviders(
  handlers: CodeConsistencyWorkflowHandlers,
  context?: Pick<vscode.ExtensionContext, "extension" | "extensionPath">
): Promise<WorkflowProviderRegistrationResult> {
  const api = await getWorkflowRegisterApi()
  if (!api) return { registered: false, registrations: [] }

  const { manifest, provenance } = readInstalledWorkflowContribution(context, CODE_CONSISTENCY_PROVIDER_SOURCE_ID)
  const providers: WorkflowActionProvider[] = []
  {
    providers.push({
      id: "bobCodeConsistency.initializeWorkspace",
      execute: (input) => handlers.initializeWorkspace(mergeWorkflowOptions("bobCodeConsistency.initializeWorkspace", input))
    })
    providers.push({
      id: "bobCodeConsistency.createReviewInput",
      execute: (input) => handlers.createReviewInput(mergeWorkflowOptions("bobCodeConsistency.createReviewInput", input))
    })
    providers.push({
      id: "bobCodeConsistency.prepareAiReviewInputDraft",
      execute: (input) => handlers.prepareAiReviewInputDraft(mergeWorkflowOptions("bobCodeConsistency.prepareAiReviewInputDraft", input))
    })
    providers.push({
      id: "bobCodeConsistency.applyAiReviewInputDraft",
      execute: (input) => handlers.applyAiReviewInputDraft(mergeWorkflowOptions("bobCodeConsistency.applyAiReviewInputDraft", input))
    })
    providers.push({
      id: "bobCodeConsistency.prepareAiTraceabilityDraft",
      execute: (input) => handlers.prepareAiTraceabilityDraft(mergeWorkflowOptions("bobCodeConsistency.prepareAiTraceabilityDraft", input))
    })
    providers.push({
      id: "bobCodeConsistency.captureAiTraceabilityDraft",
      execute: (input) => handlers.captureAiTraceabilityDraft(buildCaptureTraceabilityDraftOptions(input))
    })
    providers.push({
      id: "bobCodeConsistency.applyAiTraceabilityDraft",
      execute: (input) => handlers.applyAiTraceabilityDraft(buildApplyTraceabilityDraftOptions(input))
    })
    providers.push({
      id: "bobCodeConsistency.openTraceabilityPrep",
      execute: (input) => handlers.openTraceabilityPrep(mergeWorkflowOptions("bobCodeConsistency.openTraceabilityPrep", input))
    })
    providers.push({
      id: "bobCodeConsistency.validateTraceabilityCatalog",
      execute: (input) => handlers.validateTraceabilityCatalog(mergeWorkflowOptions("bobCodeConsistency.validateTraceabilityCatalog", input))
    })
    providers.push({
      id: "bobCodeConsistency.createReviewInputFromTraceability",
      execute: (input) => handlers.createReviewInputFromTraceability(mergeWorkflowOptions("bobCodeConsistency.createReviewInputFromTraceability", input))
    })
    providers.push({
      id: "bobCodeConsistency.repairReviewInput",
      execute: (input) => handlers.repairReviewInput(mergeWorkflowOptions("bobCodeConsistency.repairReviewInput", input))
    })
    providers.push({
      id: "bobCodeConsistency.explainReviewInputDiagnostics",
      execute: (input) => handlers.explainReviewInputDiagnostics(mergeWorkflowOptions("bobCodeConsistency.explainReviewInputDiagnostics", input))
    })
    providers.push({
      id: "bobCodeConsistency.preprocess",
      execute: (input) => handlers.preprocess(mergeWorkflowOptions("bobCodeConsistency.preprocess", input))
    })
    providers.push({
      id: "bobCodeConsistency.captureBobOutput",
      execute: (input) => handlers.captureBobOutput(buildCaptureBobOutputOptions(input))
    })
    providers.push({
      id: "bobCodeConsistency.validateOutput",
      execute: (input) => handlers.validateOutput(mergeWorkflowOptions("bobCodeConsistency.validateOutput", input))
    })
    providers.push({
      id: "bobCodeConsistency.triage",
      execute: (input) => handlers.triage(mergeWorkflowOptions("bobCodeConsistency.triage", input))
    })
    const registration = api.registerContributionSet(manifest, provenance, {
      actionProviders: new Map(providers.map(provider => [provider.id, { ...provider, sourceId: CODE_CONSISTENCY_PROVIDER_SOURCE_ID }])),
      preflightChecks: new Map<string, never>(), resultSinks: new Map<string, never>()
    })
    if (!registration || typeof registration.dispose !== "function") throw new Error("Atomic provider registration requires a disposable.")
    const registrations = [registration]
    return { registered: true, registrations, api }
  }
}



export function disposeRegistrations(registrations: vscode.Disposable[]): void {
  for (const registration of [...registrations].reverse()) registration.dispose()
  registrations.length = 0
}

async function getWorkflowRegisterApi(): Promise<WorkflowRegisterApi | undefined> {
  const extension = vscode.extensions.getExtension<WorkflowRegisterApi>(WORKFLOW_REGISTER_EXTENSION_ID)
  if (!extension) {
    console.warn(`workflow-register 拡張機能が見つかりません: ${WORKFLOW_REGISTER_EXTENSION_ID}`)
    return undefined
  }

  const api = extension.isActive ? extension.exports : await extension.activate()
  if (!api || api.apiVersion !== "provider-registry/v1" || typeof api.negotiateProviderRegistry !== "function" || typeof api.registerContributionSet !== "function") return undefined
  if (api.negotiateProviderRegistry({ min: "provider-registry/v1", max: "provider-registry/v1" }) !== "provider-registry/v1") return undefined

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

/** Native installed metadata is checked before reading a manifest or publishing handlers. */
export function readInstalledWorkflowContribution(context: Pick<vscode.ExtensionContext, "extension" | "extensionPath"> | undefined, sourceId: string): { manifest: unknown; provenance: WorkflowContributionProvenance } {
  const native = vscode.extensions.getExtension(sourceId)
  const declared = context?.extension ?? native
  const root = context?.extensionPath ?? declared?.extensionPath
  if (!native || !declared || declared.id !== sourceId || native.id !== sourceId
    || typeof root !== "string" || typeof native.extensionPath !== "string" || typeof declared.extensionPath !== "string"
    || path.relative(path.resolve(root), path.resolve(native.extensionPath)) !== "" || path.relative(path.resolve(declared.extensionPath), path.resolve(native.extensionPath)) !== ""
    || typeof native.packageJSON?.version !== "string" || declared.packageJSON?.version !== native.packageJSON.version
    || native.packageJSON.publisher + "." + native.packageJSON.name !== sourceId
    || declared.packageJSON?.publisher + "." + declared.packageJSON?.name !== sourceId) {
    throw new Error("Workflow contribution installed metadata is invalid.")
  }
  const bytes = fs.readFileSync(path.join(native.extensionPath, "contracts/workflow-contributions.json"))
  if (bytes.length > 4_194_304) throw new Error("Workflow contribution manifest is too large.")
  return { manifest: JSON.parse(bytes.toString("utf8")), provenance: { id: sourceId, version: native.packageJSON.version, extensionRoot: native.extensionPath } }
}
