import { randomBytes } from "node:crypto"
import { constants as fsConstants, type Stats } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as vscode from "vscode"
import { getProjectRulesPaths } from "../projectRules/io"
import {
  extractRuleDocuments,
  type DocumentExtractionResult,
  type LocalSourceMapping,
  type RuleDocumentBatchResult,
  type RuleDocumentDuplicate,
  type RuleDocumentExtractionRequest
} from "../ruleAuthoring/extraction/documentExtractor"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "../ruleAuthoring/ruleAuthoringLimits"
import { getRuleAuthoringPaths, validateRuleAuthoringId } from "../ruleAuthoring/ruleAuthoringPaths"
import {
  createRuleAuthoringRun,
  listIncompleteRuleAuthoringRuns,
  writeRuleAuthoringRun,
  withRuleAuthoringDirectoryLock,
  type CreateRuleAuthoringRunInput,
  type RuleAuthoringRunV1
} from "../ruleAuthoring/ruleAuthoringRunStore"
import type {
  DocumentChunkLocatorV1,
  DocumentChunkV1,
  RuleSourceManifestV1
} from "../ruleAuthoring/ruleAuthoringTypes"
import {
  findIncompleteRuleApplyTransactions,
  type IncompleteRuleApplyTransactionV1
} from "../ruleAuthoring/ruleApplyTransaction"
import { buildRuleSourceIndex, serializeRuleSourceIndex } from "../ruleAuthoring/sourceIndex"
import {
  completeCurrentWorkflowStepAfterGuiAction,
  type WorkflowStepCompletionDeps,
  type WorkflowStepCompletionOptions
} from "../workflow/workflowStepCompletion"
import {
  renderRuleAuthoringGuiHtml,
  type RuleAuthoringGuiChunkModel,
  type RuleAuthoringGuiModel,
  type RuleAuthoringGuiResumableRunModel,
  type RuleAuthoringGuiSourceModel
} from "./ruleAuthoringGuiHtml"

export const RULE_AUTHORING_GUI_MESSAGE_TYPES = Object.freeze([
  "chooseSources",
  "removeSource",
  "extractSources",
  "setChunkIncluded",
  "confirmAiPayload",
  "resumeRun",
  "cancelRun"
] as const)

const SUPPORTED_EXTENSIONS = new Set([".docx", ".xlsx", ".pdf", ".doc", ".xls"])
const EXTRACTION_STATUSES = new Set([
  "success",
  "partial",
  "blocked",
  "failed",
  "requires_conversion",
  "requires_ocr",
  "duplicate",
  "selected"
])
const MEDIA_TYPES = new Set(["docx", "xlsx", "pdf", "doc", "xls"])
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/
const SAFE_WARNING_CODE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/
const SHA256 = /^[a-f0-9]{64}$/
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/
const MAX_AI_PAYLOAD_BYTES = DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes
const MAX_DOCUMENT_CHUNKS_BYTES = DEFAULT_RULE_AUTHORING_LIMITS.maxAggregateSourceBytes
const MAX_APPROVED_MANIFEST_BYTES = 4 * 1024 * 1024
const MAX_LOCAL_MAPPING_BYTES = 1024 * 1024
const MAX_LOCAL_MAPPING_RUNS = 128
const MAX_REMOTE_WARNINGS = 100
const MAX_MODEL_CHUNKS = Math.floor(DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes / 128)
const LOCAL_MAPPING_SCHEMA = "bob-bazaar-review/rule-source-locations/v1" as const
const APPROVE_EXCLUSION = "Exclude and continue"

export type RuleAuthoringGuiMessage =
  | { type: "chooseSources" }
  | { type: "removeSource"; sourceId: string }
  | { type: "extractSources" }
  | { type: "setChunkIncluded"; chunkId: string; included: boolean }
  | { type: "confirmAiPayload" }
  | { type: "resumeRun"; runId: string }
  | { type: "cancelRun" }

export type RuleAuthoringGuiResult =
  | { status: "cancelled" }
  | { status: "confirmed"; authoringSession: { run_id: string } }
  | { status: "recovery_required"; transactionId: string }

export interface RuleAuthoringGuiInitial {
  workspaceRoot?: string
  configuredBobModelRoute?: string
  bobExtensionAvailable?: boolean
  runId?: string
  stepId?: string
}

export interface RuleAuthoringResumeState {
  run: RuleAuthoringRunV1
  sources: readonly unknown[]
  chunks: readonly DocumentChunkV1[]
  aiPayload?: unknown
  duplicates?: readonly Pick<RuleDocumentDuplicate, "logical_name">[]
}

export interface PersistRuleAuthoringExtractionInput {
  workspaceRoot: string
  runId: string
  run: RuleAuthoringRunV1
  batch: RuleDocumentBatchResult
}

export interface PersistRuleAuthoringExtractionResult {
  run: RuleAuthoringRunV1
}

export interface RuleAuthoringGuiDependencies {
  createNonce: () => string
  renderRuleAuthoringGuiHtml: typeof renderRuleAuthoringGuiHtml
  findIncompleteRuleApplyTransactions: (
    workspaceRoot: string
  ) => Promise<readonly IncompleteRuleApplyTransactionV1[]>
  listIncompleteRuleAuthoringRuns: (workspaceRoot: string) => Promise<readonly RuleAuthoringRunV1[]>
  createRuleAuthoringRun: (input: CreateRuleAuthoringRunInput) => Promise<RuleAuthoringRunV1>
  resumeRuleAuthoringRun: (run: RuleAuthoringRunV1) => Promise<RuleAuthoringResumeState>
  loadApprovedRuleSourceManifest: (workspaceRoot: string) => Promise<RuleSourceManifestV1 | undefined>
  extractRuleDocuments: (
    requests: readonly RuleDocumentExtractionRequest[],
    existingManifest: RuleSourceManifestV1 | undefined,
    limits: typeof DEFAULT_RULE_AUTHORING_LIMITS
  ) => Promise<RuleDocumentBatchResult>
  persistRuleAuthoringExtraction: (
    input: PersistRuleAuthoringExtractionInput
  ) => Promise<PersistRuleAuthoringExtractionResult>
  completeCurrentWorkflowStepAfterGuiAction: (
    dependencies: WorkflowStepCompletionDeps,
    options: WorkflowStepCompletionOptions
  ) => Promise<boolean>
}

export interface RuleAuthoringGuiHost {
  openRuleAuthoringGui(
    context: vscode.ExtensionContext,
    initial?: RuleAuthoringGuiInitial
  ): Promise<RuleAuthoringGuiResult>
}

interface SelectedSource {
  sourceId: string
  uri: vscode.Uri
  logicalName: string
  mediaType: string
  byteSize: number
}

interface HostChunk {
  chunkId: string
  sourceId: string
  logicalName?: string
  utf8Bytes: number
  included: boolean
  title: string
  locator: string
}

interface LocalMappingRun {
  run_id: string
  updated_at: string
  sources: LocalMappingSource[]
}

interface LocalMappingSource {
  logical_name: string
  absolute_path: string
  sha256: string
  status: LocalSourceMapping["status"]
}

interface LocalMappingFile {
  schema_version: typeof LOCAL_MAPPING_SCHEMA
  runs: LocalMappingRun[]
}

interface WorkspaceSelection {
  workspaceRoot: string
  workspaceName: string
}

interface PayloadSummary {
  logicalNames: string[]
  selectedChunkCount: number
  utf8Bytes: number
  overflow: boolean
}

class SafeSelectionError extends Error {
  constructor(readonly safeMessage: string) {
    super(safeMessage)
  }
}

export function parseRuleAuthoringGuiMessage(value: unknown): RuleAuthoringGuiMessage | undefined {
  if (!isPlainObject(value) || typeof value.type !== "string") return undefined
  if (value.type === "chooseSources" && hasExactKeys(value, ["type"])) {
    return { type: "chooseSources" }
  }
  if (
    value.type === "removeSource" &&
    hasExactKeys(value, ["type", "sourceId"]) &&
    isSafeId(value.sourceId)
  ) {
    return { type: "removeSource", sourceId: value.sourceId }
  }
  if (value.type === "extractSources" && hasExactKeys(value, ["type"])) {
    return { type: "extractSources" }
  }
  if (
    value.type === "setChunkIncluded" &&
    hasExactKeys(value, ["type", "chunkId", "included"]) &&
    isSafeId(value.chunkId) &&
    typeof value.included === "boolean"
  ) {
    return { type: "setChunkIncluded", chunkId: value.chunkId, included: value.included }
  }
  if (value.type === "confirmAiPayload" && hasExactKeys(value, ["type"])) {
    return { type: "confirmAiPayload" }
  }
  if (
    value.type === "resumeRun" &&
    hasExactKeys(value, ["type", "runId"]) &&
    isSafeId(value.runId)
  ) {
    return { type: "resumeRun", runId: value.runId }
  }
  if (value.type === "cancelRun" && hasExactKeys(value, ["type"])) {
    return { type: "cancelRun" }
  }
  return undefined
}

export function createRuleAuthoringGuiHost(
  overrides: Partial<RuleAuthoringGuiDependencies> = {}
): RuleAuthoringGuiHost {
  const dependencies: RuleAuthoringGuiDependencies = {
    createNonce: () => randomBytes(16).toString("base64"),
    renderRuleAuthoringGuiHtml,
    findIncompleteRuleApplyTransactions,
    listIncompleteRuleAuthoringRuns,
    createRuleAuthoringRun,
    resumeRuleAuthoringRun: defaultResumeRuleAuthoringRun,
    loadApprovedRuleSourceManifest: defaultLoadApprovedRuleSourceManifest,
    extractRuleDocuments,
    persistRuleAuthoringExtraction: defaultPersistRuleAuthoringExtraction,
    completeCurrentWorkflowStepAfterGuiAction,
    ...overrides
  }
  return {
    openRuleAuthoringGui: (context, initial = {}) => openWithDependencies(
      dependencies,
      context,
      initial
    )
  }
}

export function openRuleAuthoringGui(
  context: vscode.ExtensionContext,
  initial: RuleAuthoringGuiInitial = {}
): Promise<RuleAuthoringGuiResult> {
  return createRuleAuthoringGuiHost().openRuleAuthoringGui(context, initial)
}

async function openWithDependencies(
  dependencies: RuleAuthoringGuiDependencies,
  context: vscode.ExtensionContext,
  initial: RuleAuthoringGuiInitial
): Promise<RuleAuthoringGuiResult> {
  let panel: vscode.WebviewPanel | undefined
  try {
    const workspace = resolveWorkspace(initial.workspaceRoot)
    const workflowRunId = optionalSafeId(initial.runId, "workflow run ID")
    const workflowStepId = optionalSafeId(initial.stepId, "workflow step ID")

    // Recovery must be the first persisted authoring gate. Do not list or
    // create runs, and do not open a Webview, until it has been cleared.
    const transactions = await dependencies.findIncompleteRuleApplyTransactions(workspace.workspaceRoot)
    if (transactions.length > 0) {
      const transactionId = requireSafeId(transactions[0].transaction_id, "transaction ID")
      await vscode.window.showWarningMessage(
        "An incomplete project rule apply transaction requires recovery or rollback before authoring can continue.",
        { modal: true }
      )
      return { status: "recovery_required", transactionId }
    }

    const resumableRuns = validateResumableRuns(
      await dependencies.listIncompleteRuleAuthoringRuns(workspace.workspaceRoot),
      workspace.workspaceRoot
    )
    let activeRun: RuleAuthoringRunV1 | undefined
    if (resumableRuns.length === 0) {
      activeRun = await dependencies.createRuleAuthoringRun({
        workspaceRoot: workspace.workspaceRoot,
        runId: newAuthoringRunId(),
        ...(workflowRunId ? { workflowRunId } : {})
      })
      validateActiveRun(activeRun, workspace.workspaceRoot)
    }

    panel = vscode.window.createWebviewPanel(
      "bobBazaarRuleAuthoring",
      "Project Rule Source Wizard",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    )

    return await new Promise<RuleAuthoringGuiResult>((resolve) => {
      let settled = false
      const settle = (result: RuleAuthoringGuiResult, closePanel = true): void => {
        if (settled) return
        settled = true
        resolve(result)
        if (closePanel) panel?.dispose()
      }
      const controller = new RuleAuthoringGuiController({
        dependencies,
        panel: panel!,
        workspace,
        configuredBobModelRoute: safeConfiguredRoute(initial.configuredBobModelRoute),
        bobExtensionAvailable: initial.bobExtensionAvailable ?? detectBobExtension(),
        workflowRunId,
        workflowStepId,
        resumableRuns,
        activeRun,
        settle
      })

      const messageDisposable = panel!.webview.onDidReceiveMessage(async (rawMessage) => {
        try {
          await controller.handleMessage(rawMessage)
        } catch {
          await showSafeHostError()
          settle({ status: "cancelled" })
        }
      })
      const disposeDisposable = panel!.onDidDispose(() => settle({ status: "cancelled" }, false))
      context.subscriptions.push(panel!, messageDisposable, disposeDisposable)
      try {
        controller.render()
      } catch {
        void showSafeHostError()
        settle({ status: "cancelled" })
      }
    })
  } catch {
    panel?.dispose()
    await showSafeHostError()
    return { status: "cancelled" }
  }
}

interface ControllerInput {
  dependencies: RuleAuthoringGuiDependencies
  panel: vscode.WebviewPanel
  workspace: WorkspaceSelection
  configuredBobModelRoute: string
  bobExtensionAvailable: boolean
  workflowRunId?: string
  workflowStepId?: string
  resumableRuns: RuleAuthoringRunV1[]
  activeRun?: RuleAuthoringRunV1
  settle: (result: RuleAuthoringGuiResult) => void
}

class RuleAuthoringGuiController {
  private selectedSources: SelectedSource[] = []
  private sourceModels: RuleAuthoringGuiSourceModel[] = []
  private chunks: HostChunk[] = []
  private activeRun?: RuleAuthoringRunV1
  private resumableRuns: RuleAuthoringRunV1[]
  private extractionReady = false
  private exclusionsApproved = false
  private warnings: string[] = []
  private status: string
  private selectedSourceSequence = 0

  constructor(private readonly input: ControllerInput) {
    this.activeRun = input.activeRun
    this.resumableRuns = [...input.resumableRuns]
    this.status = this.activeRun
      ? "Choose source files. Extraction and AI consent are separate actions."
      : "Select an incomplete run to resume before choosing sources."
  }

  async handleMessage(rawMessage: unknown): Promise<void> {
    const message = parseRuleAuthoringGuiMessage(rawMessage)
    if (!message) {
      this.status = "The Webview operation was rejected by the fixed message schema."
      this.render()
      return
    }
    switch (message.type) {
      case "chooseSources":
        await this.chooseSources()
        return
      case "removeSource":
        this.removeSource(message.sourceId)
        return
      case "extractSources":
        await this.extractSources()
        return
      case "setChunkIncluded":
        this.setChunkIncluded(message.chunkId, message.included)
        return
      case "confirmAiPayload":
        await this.confirmAiPayload()
        return
      case "resumeRun":
        await this.resumeRun(message.runId)
        return
      case "cancelRun":
        this.input.settle({ status: "cancelled" })
    }
  }

  render(): void {
    const payload = this.payloadSummary()
    const model: RuleAuthoringGuiModel = {
      cspSource: this.input.panel.webview.cspSource,
      phase: this.activeRun?.currentPhase ?? "sources",
      environment: {
        workspaceName: boundedText(this.input.workspace.workspaceName, 255),
        workspaceReady: true,
        bobExtensionAvailable: this.input.bobExtensionAvailable,
        configuredBobModelRoute: this.input.configuredBobModelRoute
      },
      runId: this.activeRun?.runId,
      resumableRuns: this.resumableRunModels(),
      sources: this.sourceModels.map(cloneSourceModel),
      chunks: this.chunks.map((chunk): RuleAuthoringGuiChunkModel => ({
        chunkId: chunk.chunkId,
        sourceId: chunk.sourceId,
        title: chunk.title,
        locator: chunk.locator,
        utf8Bytes: chunk.utf8Bytes,
        included: chunk.included
      })),
      aiPayload: {
        logicalNames: payload.logicalNames,
        selectedChunkCount: payload.selectedChunkCount,
        utf8Bytes: payload.utf8Bytes
      },
      warnings: [...this.warnings],
      scopeOverflow: payload.overflow,
      exclusionsApproved: this.exclusionsApproved,
      canConfirmAiPayload: this.canConfirm(payload),
      status: this.status
    }
    this.input.panel.webview.html = this.input.dependencies.renderRuleAuthoringGuiHtml(
      model,
      this.input.dependencies.createNonce()
    )
  }

  private async chooseSources(): Promise<void> {
    if (!this.activeRun) {
      this.status = "Resume an incomplete run before selecting sources."
      this.render()
      return
    }
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: "Select project rule sources",
      filters: {
        "Supported rule documents": ["docx", "xlsx", "pdf"],
        "Legacy Office documents (conversion required)": ["doc", "xls"]
      }
    })
    if (!selected) return
    try {
      const validated = await validateSelectedUris(selected, () => {
        this.selectedSourceSequence += 1
        return `selected-${this.selectedSourceSequence}`
      })
      this.selectedSources = validated
      this.sourceModels = validated.map((source) => ({
        sourceId: source.sourceId,
        logicalName: source.logicalName,
        mediaType: source.mediaType,
        byteSize: source.byteSize,
        extractionStatus: "selected",
        warnings: []
      }))
      this.resetExtractionState()
      this.status = `${validated.length} source file(s) selected. Start extraction explicitly.`
      this.warnings = []
    } catch (error) {
      this.resetExtractionState()
      this.status = error instanceof SafeSelectionError
        ? error.safeMessage
        : "The selected source files could not be validated safely."
      this.warnings = [this.status]
    }
    this.render()
  }

  private removeSource(sourceId: string): void {
    const remaining = this.selectedSources.filter((source) => source.sourceId !== sourceId)
    if (remaining.length === this.selectedSources.length) {
      const resumedRemaining = this.sourceModels.filter((source) => source.sourceId !== sourceId)
      if (resumedRemaining.length === this.sourceModels.length) return
      this.sourceModels = resumedRemaining
    } else {
      this.selectedSources = remaining
      this.sourceModels = remaining.map((source) => ({
        sourceId: source.sourceId,
        logicalName: source.logicalName,
        mediaType: source.mediaType,
        byteSize: source.byteSize,
        extractionStatus: "selected",
        warnings: []
      }))
    }
    this.resetExtractionState()
    this.warnings = []
    this.status = "Source scope changed. Extract the remaining sources again before AI consent."
    this.render()
  }

  private async extractSources(): Promise<void> {
    if (!this.activeRun || this.selectedSources.length === 0) {
      this.status = "Select at least one source file before extraction."
      this.render()
      return
    }
    try {
      this.selectedSources = await revalidateSelectedSources(this.selectedSources)
    } catch (error) {
      this.resetExtractionState()
      this.status = error instanceof SafeSelectionError
        ? error.safeMessage
        : "The selected source files changed or could not be validated safely."
      this.warnings = [this.status]
      this.render()
      return
    }

    const requests = this.selectedSources.map((source): RuleDocumentExtractionRequest => ({
      filePath: source.uri.fsPath,
      logicalName: source.logicalName
    }))
    const existingManifest = await this.input.dependencies.loadApprovedRuleSourceManifest(
      this.input.workspace.workspaceRoot
    )
    const batch = await this.input.dependencies.extractRuleDocuments(
      requests,
      existingManifest,
      DEFAULT_RULE_AUTHORING_LIMITS
    )
    const persisted = await this.input.dependencies.persistRuleAuthoringExtraction({
      workspaceRoot: this.input.workspace.workspaceRoot,
      runId: this.activeRun.runId,
      run: this.activeRun,
      batch
    })
    validateActiveRun(persisted.run, this.input.workspace.workspaceRoot)
    this.activeRun = persisted.run
    this.sourceModels = sourceModelsAfterExtraction(this.selectedSources, batch)
    this.chunks = hostChunks(batch.aiChunks, sourceNamesFromBatch(batch))
    this.extractionReady = true
    this.exclusionsApproved = await requestExclusionApprovals(
      batch.duplicates,
      batch.documents
    )
    this.warnings = batch.diagnostics
      .map((diagnostic) => safeWarningCode(diagnostic.code))
      .filter(isPresent)
      .slice(0, MAX_REMOTE_WARNINGS)
    this.status = this.exclusionsApproved
      ? "Extraction scope is ready. Review chunks, then use the separate AI payload confirmation action."
      : "AI payload consent is disabled until every exclusion is explicitly approved."
    this.render()
  }

  private setChunkIncluded(chunkId: string, included: boolean): void {
    const chunk = this.chunks.find((candidate) => candidate.chunkId === chunkId)
    if (!chunk) {
      this.status = "The requested chunk is not part of this run-local extraction scope."
      this.render()
      return
    }
    chunk.included = included
    this.status = "Chunk scope changed. Confirm AI payload explicitly when the scope is final."
    this.render()
  }

  private async resumeRun(runId: string): Promise<void> {
    const run = this.resumableRuns.find((candidate) => candidate.runId === runId)
    if (!run) {
      this.status = "The requested run is not an offered incomplete run."
      this.render()
      return
    }
    const resumed = await this.input.dependencies.resumeRuleAuthoringRun(run)
    validateActiveRun(resumed.run, this.input.workspace.workspaceRoot)
    if (resumed.run.runId !== run.runId) throw new Error("Resumed run identity mismatch")
    const sourceModels = normalizeResumedSources(resumed.sources)
    const namesBySourceId = new Map(sourceModels.map((source) => [source.sourceId, source.logicalName]))
    this.activeRun = resumed.run
    this.resumableRuns = this.resumableRuns.filter((candidate) => candidate.runId !== runId)
    this.selectedSources = []
    this.sourceModels = sourceModels
    this.chunks = hostChunks(resumed.chunks, namesBySourceId)
    this.extractionReady = this.chunks.length > 0
    const duplicates = (resumed.duplicates ?? []).map((duplicate) => ({
      logical_name: requireLogicalName(duplicate.logical_name),
      sha256: "0".repeat(64),
      reason: "duplicate_in_run" as const,
      duplicate_of: "persisted-run"
    }))
    const resumeDocuments = sourceModels
      .filter((source) => source.extractionStatus !== "duplicate")
      .map((source): Pick<DocumentExtractionResult, "logicalName" | "status" | "shareable"> => ({
        logicalName: source.logicalName,
        status: normalizedExtractionStatus(source.extractionStatus) as DocumentExtractionResult["status"],
        shareable: source.extractionStatus === "success" || source.extractionStatus === "partial"
      }))
    this.exclusionsApproved = await requestExclusionApprovals(duplicates, resumeDocuments)
    this.warnings = []
    this.status = this.extractionReady
      ? "Incomplete run resumed. Review the reconstructed chunk scope before explicit AI consent."
      : "Incomplete run resumed. Select and extract sources before AI consent."
    this.render()
  }

  private async confirmAiPayload(): Promise<void> {
    const payload = this.payloadSummary()
    if (!this.canConfirm(payload) || !this.activeRun) {
      this.status = "AI payload cannot be confirmed: extraction, non-empty scope, limits, and exclusion approval are required."
      this.render()
      return
    }
    const authoringSession = { run_id: requireSafeId(this.activeRun.runId, "authoring run ID") }
    const metadata: WorkflowStepCompletionOptions = {
      stateUpdates: { authoringSession: JSON.stringify(authoringSession) }
    }
    if (this.input.workflowRunId) metadata.runId = this.input.workflowRunId
    if (this.input.workflowStepId) metadata.stepId = this.input.workflowStepId
    const completed = await this.input.dependencies.completeCurrentWorkflowStepAfterGuiAction({
      executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args),
      showWarningMessage: () => vscode.window.showWarningMessage(
        "Could not complete the current Bob workflow step automatically."
      )
    }, metadata)
    if (!completed) {
      this.status = "AI payload was not confirmed because workflow completion did not succeed."
      this.render()
      return
    }
    this.input.settle({ status: "confirmed", authoringSession })
  }

  private resetExtractionState(): void {
    this.chunks = []
    this.extractionReady = false
    this.exclusionsApproved = false
  }

  private payloadSummary(): PayloadSummary {
    const logicalNames = new Set<string>()
    let selectedChunkCount = 0
    let utf8Bytes = 0
    let overflow = false
    for (const chunk of this.chunks) {
      if (!chunk.included) continue
      selectedChunkCount += 1
      if (!Number.isSafeInteger(utf8Bytes + chunk.utf8Bytes)) {
        overflow = true
        utf8Bytes = MAX_AI_PAYLOAD_BYTES + 1
        break
      }
      utf8Bytes += chunk.utf8Bytes
      if (chunk.logicalName) logicalNames.add(chunk.logicalName)
      if (utf8Bytes > MAX_AI_PAYLOAD_BYTES) overflow = true
    }
    return {
      logicalNames: [...logicalNames].sort(compareText),
      selectedChunkCount,
      utf8Bytes,
      overflow
    }
  }

  private canConfirm(payload: PayloadSummary): boolean {
    return Boolean(
      this.activeRun &&
      this.extractionReady &&
      this.exclusionsApproved &&
      payload.selectedChunkCount > 0 &&
      payload.utf8Bytes > 0 &&
      !payload.overflow &&
      payload.utf8Bytes <= MAX_AI_PAYLOAD_BYTES
    )
  }

  private resumableRunModels(): RuleAuthoringGuiResumableRunModel[] {
    return this.resumableRuns.map((run) => ({
      runId: run.runId,
      phase: run.currentPhase,
      updatedAt: run.updatedAt
    }))
  }
}

async function validateSelectedUris(
  uris: readonly vscode.Uri[],
  nextSourceId: () => string
): Promise<SelectedSource[]> {
  if (uris.length > DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles) {
    throw new SafeSelectionError(
      `Source file count exceeds the ${DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles}-file limit.`
    )
  }
  const selected: SelectedSource[] = []
  let aggregateBytes = 0
  let perSourceOverflow = false
  for (const uri of uris) {
    if (uri.scheme !== "file" || !path.isAbsolute(uri.fsPath) || CONTROL_CHARACTER.test(uri.fsPath)) {
      throw new SafeSelectionError("Only supported local files can be selected.")
    }
    const logicalName = requireLogicalName(path.basename(uri.fsPath))
    const extension = path.extname(logicalName).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new SafeSelectionError("A selected file has an unsupported document extension.")
    }
    const stat = await safeVscodeStat(uri)
    if ((stat.type & vscode.FileType.File) !== vscode.FileType.File || (stat.type & vscode.FileType.Directory) !== 0) {
      throw new SafeSelectionError("Only regular source files can be selected.")
    }
    if (!Number.isSafeInteger(stat.size) || stat.size < 0) {
      throw new SafeSelectionError("A selected source has an invalid byte size.")
    }
    if (stat.size > DEFAULT_RULE_AUTHORING_LIMITS.maxSourceBytes) perSourceOverflow = true
    aggregateBytes += stat.size
    if (!Number.isSafeInteger(aggregateBytes) || aggregateBytes > DEFAULT_RULE_AUTHORING_LIMITS.maxAggregateSourceBytes) {
      throw new SafeSelectionError("Selected source aggregate bytes exceed the 100 MiB limit.")
    }
    selected.push({
      sourceId: requireSafeId(nextSourceId(), "selected source ID"),
      uri,
      logicalName,
      mediaType: extension.slice(1),
      byteSize: stat.size
    })
  }
  if (perSourceOverflow) {
    throw new SafeSelectionError("A selected source exceeds the 25 MiB per-file limit.")
  }
  return selected
}

async function revalidateSelectedSources(sources: readonly SelectedSource[]): Promise<SelectedSource[]> {
  let index = 0
  const validated = await validateSelectedUris(sources.map((source) => source.uri), () => {
    const sourceId = sources[index]?.sourceId
    index += 1
    return requireSafeId(sourceId, "selected source ID")
  })
  return validated
}

async function safeVscodeStat(uri: vscode.Uri): Promise<vscode.FileStat> {
  try {
    return await vscode.workspace.fs.stat(uri)
  } catch {
    throw new SafeSelectionError("A selected source could not be inspected safely.")
  }
}

function sourceModelsAfterExtraction(
  selected: readonly SelectedSource[],
  batch: RuleDocumentBatchResult
): RuleAuthoringGuiSourceModel[] {
  if (!Array.isArray(batch.documents) || !Array.isArray(batch.duplicates)) {
    throw new Error("Invalid extraction batch")
  }
  const documents = new Map<string, DocumentExtractionResult>()
  for (const document of batch.documents) {
    const logicalName = requireLogicalName(document.logicalName)
    if (!documents.has(logicalName)) documents.set(logicalName, document)
  }
  const duplicateNames = new Set(batch.duplicates.map((duplicate) => requireLogicalName(duplicate.logical_name)))
  return selected.map((source) => {
    const document = documents.get(source.logicalName)
    const extractionStatus = duplicateNames.has(source.logicalName)
      ? "duplicate"
      : normalizedExtractionStatus(document?.status ?? "blocked")
    return {
      sourceId: source.sourceId,
      logicalName: source.logicalName,
      mediaType: source.mediaType,
      byteSize: source.byteSize,
      extractionStatus,
      warnings: (document?.warnings ?? [])
        .map(safeWarningCode)
        .filter(isPresent)
        .slice(0, MAX_REMOTE_WARNINGS)
    }
  })
}

function sourceNamesFromBatch(batch: RuleDocumentBatchResult): ReadonlyMap<string, string> {
  if (!isPlainObject(batch.manifest) || !Array.isArray(batch.manifest.sources)) {
    throw new Error("Invalid extraction manifest")
  }
  const names = new Map<string, string>()
  for (const source of batch.manifest.sources) {
    names.set(
      requireSafeId(source.source_id, "source ID"),
      requireLogicalName(source.logical_name)
    )
  }
  return names
}

function hostChunks(
  chunks: readonly DocumentChunkV1[],
  namesBySourceId: ReadonlyMap<string, string>
): HostChunk[] {
  if (!Array.isArray(chunks) || chunks.length > MAX_MODEL_CHUNKS) {
    throw new Error("Extraction chunk count exceeds the remote-safe model limit")
  }
  const seen = new Set<string>()
  const fallbackName = namesBySourceId.size === 1 ? [...namesBySourceId.values()][0] : undefined
  return chunks.map((chunk, index) => {
    const chunkId = requireSafeId(chunk.chunk_id, "chunk ID")
    const sourceId = requireSafeId(chunk.source_id, "source ID")
    if (seen.has(chunkId) || typeof chunk.text !== "string") throw new Error("Invalid extraction chunk")
    seen.add(chunkId)
    const utf8Bytes = Buffer.byteLength(chunk.text, "utf8")
    if (!Number.isSafeInteger(utf8Bytes) || utf8Bytes < 0) throw new Error("Invalid extraction chunk size")
    return {
      chunkId,
      sourceId,
      logicalName: namesBySourceId.get(sourceId) ?? fallbackName,
      utf8Bytes,
      included: true,
      title: `Extracted chunk ${index + 1}`,
      locator: structuralLocator(chunk.locator)
    }
  })
}

function structuralLocator(locator: DocumentChunkLocatorV1): string {
  if (!isPlainObject(locator)) return "Structured location"
  const parts: string[] = []
  for (const [key, label] of [
    ["page", "Page"],
    ["block_index", "Block"],
    ["table_index", "Table"],
    ["row", "Row"],
    ["part_index", "Part"]
  ] as const) {
    const value = locator[key]
    if (Number.isSafeInteger(value) && (value as number) >= 0) parts.push(`${label} ${value}`)
  }
  return parts.join(" · ") || "Structured location"
}

async function requestExclusionApprovals(
  duplicates: readonly Pick<RuleDocumentDuplicate, "logical_name">[],
  documents: readonly Pick<DocumentExtractionResult, "logicalName" | "status" | "shareable">[]
): Promise<boolean> {
  const duplicateNames = uniqueLogicalNames(duplicates.map((duplicate) => duplicate.logical_name))
  let duplicatesApproved = true
  if (duplicateNames.length > 0) {
    const selected = await vscode.window.showWarningMessage(
      `Duplicate sources will be excluded. Logical names: ${duplicateNames.join(", ")}`,
      { modal: true },
      APPROVE_EXCLUSION
    )
    duplicatesApproved = selected === APPROVE_EXCLUSION
  }

  const partialNames = uniqueLogicalNames(documents
    .filter((document) => !document.shareable || document.status !== "success")
    .map((document) => document.logicalName))
  let partialApproved = true
  if (partialNames.length > 0) {
    const selected = await vscode.window.showWarningMessage(
      `Continue while blocked, failed, partial, or non-shareable sources are excluded. Logical names: ${partialNames.join(", ")}`,
      { modal: true },
      APPROVE_EXCLUSION
    )
    partialApproved = selected === APPROVE_EXCLUSION
  }
  return duplicatesApproved && partialApproved
}

function normalizeResumedSources(sources: readonly unknown[]): RuleAuthoringGuiSourceModel[] {
  if (!Array.isArray(sources) || sources.length > DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles) {
    throw new Error("Invalid resumed source count")
  }
  const seenIds = new Set<string>()
  return sources.map((value, index) => {
    if (!isPlainObject(value)) throw new Error("Invalid resumed source")
    const logicalName = requireLogicalName(value.logicalName ?? value.logical_name)
    const mediaType = normalizedMediaType(value.mediaType ?? value.media_type, logicalName)
    const sha256 = typeof value.sha256 === "string" && SHA256.test(value.sha256) ? value.sha256 : undefined
    const sourceId = requireSafeId(
      value.sourceId ?? value.source_id ?? (sha256 ? `src-${sha256.slice(0, 12)}` : `selected-resumed-${index + 1}`),
      "resumed source ID"
    )
    if (seenIds.has(sourceId)) throw new Error("Duplicate resumed source ID")
    seenIds.add(sourceId)
    const byteSize = safeNonNegativeInteger(value.byteSize ?? value.byte_size)
    const extractionStatus = normalizedExtractionStatus(
      value.status ?? value.extractionStatus ?? value.extraction_status ?? "blocked"
    )
    return {
      sourceId,
      logicalName,
      mediaType,
      byteSize,
      extractionStatus,
      warnings: Array.isArray(value.warnings)
        ? value.warnings.map(safeWarningCode).filter(isPresent).slice(0, MAX_REMOTE_WARNINGS)
        : []
    }
  })
}

async function defaultLoadApprovedRuleSourceManifest(
  workspaceRoot: string
): Promise<RuleSourceManifestV1 | undefined> {
  const sourcesPath = getProjectRulesPaths(workspaceRoot).sourcesPath
  const raw = await readTrustedUtf8(workspaceRoot, sourcesPath, MAX_APPROVED_MANIFEST_BYTES, true)
  if (raw === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("Approved rule source manifest is invalid")
  }
  if (!isPlainObject(parsed)) throw new Error("Approved rule source manifest is invalid")
  return parsed as unknown as RuleSourceManifestV1
}

async function defaultPersistRuleAuthoringExtraction(
  input: PersistRuleAuthoringExtractionInput
): Promise<PersistRuleAuthoringExtractionResult> {
  const workspaceRoot = path.resolve(input.workspaceRoot)
  validateActiveRun(input.run, workspaceRoot)
  const runId = requireSafeId(input.runId, "authoring run ID")
  if (runId !== input.run.runId) throw new Error("Authoring run identity mismatch")
  const paths = getRuleAuthoringPaths(workspaceRoot, runId)
  const index = buildRuleSourceIndex(
    input.batch.manifest,
    input.batch.aiChunks,
    DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes
  )
  const manifestText = boundedSerialization(
    `${JSON.stringify(input.batch.manifest, null, 2)}\n`,
    DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes,
    "Rule source manifest"
  )
  const chunksText = boundedSerialization(
    input.batch.aiChunks.map((chunk) => JSON.stringify(chunk)).join("\n") +
      (input.batch.aiChunks.length > 0 ? "\n" : ""),
    MAX_DOCUMENT_CHUNKS_BYTES,
    "Document chunks"
  )
  const indexText = boundedSerialization(
    serializeRuleSourceIndex(index),
    DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes,
    "Rule source index"
  )
  validateLocalMappings(input.batch.localSourceMappings)

  const lockDirectory = path.join(paths.authoringDirectory, ".gui-persistence-lock")
  return withRuleAuthoringDirectoryLock(workspaceRoot, lockDirectory, async () => {
    await atomicWriteTrusted(workspaceRoot, paths.sourceManifestPath, manifestText)
    await atomicWriteTrusted(workspaceRoot, paths.documentChunksPath, chunksText)
    await atomicWriteTrusted(workspaceRoot, paths.sourceIndexPath, indexText)
    await persistLocalMappings(workspaceRoot, paths.sourceLocationsPath, runId, input.batch.localSourceMappings)

    const timestamp = timestampAfter(input.run.updatedAt)
    const relativeArtifact = (filePath: string): string => path.relative(workspaceRoot, filePath).split(path.sep).join("/")
    const phases = structuredClone(input.run.phases)
    const currentIndex = ["sources", "extraction", "evidence_selection"].indexOf(input.run.currentPhase)
    if (currentIndex < 0) throw new Error("Source extraction cannot move a later authoring phase backwards")
    phases.sources = {
      status: "completed",
      startedAt: phases.sources.startedAt ?? input.run.createdAt,
      completedAt: phases.sources.completedAt ?? timestamp
    }
    phases.extraction = {
      status: "completed",
      startedAt: phases.extraction.startedAt ?? timestamp,
      completedAt: phases.extraction.completedAt ?? timestamp
    }
    phases.evidence_selection = {
      status: "in_progress",
      startedAt: phases.evidence_selection.startedAt ?? timestamp
    }
    const nextRun: RuleAuthoringRunV1 = {
      ...input.run,
      currentPhase: "evidence_selection",
      phases,
      artifacts: {
        ...input.run.artifacts,
        sourceManifest: relativeArtifact(paths.sourceManifestPath),
        documentChunks: relativeArtifact(paths.documentChunksPath),
        sourceIndex: relativeArtifact(paths.sourceIndexPath)
      },
      updatedAt: timestamp
    }
    await writeRuleAuthoringRun(nextRun, input.run.updatedAt)
    return { run: nextRun }
  })
}

async function defaultResumeRuleAuthoringRun(run: RuleAuthoringRunV1): Promise<RuleAuthoringResumeState> {
  validateActiveRun(run, run.workspaceRoot)
  const paths = getRuleAuthoringPaths(run.workspaceRoot, run.runId)
  const artifactKeys = [run.artifacts.sourceManifest, run.artifacts.documentChunks, run.artifacts.sourceIndex]
  if (artifactKeys.every((value) => value === undefined)) {
    return { run, sources: [], chunks: [] }
  }
  if (artifactKeys.some((value) => value === undefined)) {
    throw new Error("Incomplete extraction artifacts cannot be resumed")
  }
  assertExpectedArtifact(run.workspaceRoot, run.artifacts.sourceManifest!, paths.sourceManifestPath)
  assertExpectedArtifact(run.workspaceRoot, run.artifacts.documentChunks!, paths.documentChunksPath)
  assertExpectedArtifact(run.workspaceRoot, run.artifacts.sourceIndex!, paths.sourceIndexPath)
  const [manifestRaw, chunksRaw, indexRaw, mappingRaw] = await Promise.all([
    readTrustedUtf8(run.workspaceRoot, paths.sourceManifestPath, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes),
    readTrustedUtf8(run.workspaceRoot, paths.documentChunksPath, MAX_DOCUMENT_CHUNKS_BYTES),
    readTrustedUtf8(run.workspaceRoot, paths.sourceIndexPath, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes),
    readTrustedUtf8(run.workspaceRoot, paths.sourceLocationsPath, MAX_LOCAL_MAPPING_BYTES, true)
  ])
  const manifest = parseJsonObject(manifestRaw!, "Rule source manifest") as unknown as RuleSourceManifestV1
  const chunks = parseChunkLines(chunksRaw!)
  const rebuiltIndex = buildRuleSourceIndex(manifest, chunks, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes)
  const persistedIndex = parseJsonObject(indexRaw!, "Rule source index")
  if (JSON.stringify(rebuiltIndex) !== JSON.stringify(persistedIndex)) {
    throw new Error("Rule source index does not match persisted extraction artifacts")
  }
  const mapping = mappingRaw === undefined ? undefined : parseLocalMappingFile(mappingRaw)
  const localRun = mapping?.runs.find((candidate) => candidate.run_id === run.runId)
  const sources: Array<Record<string, unknown>> = manifest.sources.map((source) => ({
    sourceId: source.source_id,
    logicalName: source.logical_name,
    mediaType: source.media_type,
    byteSize: source.byte_size,
    extractionStatus: source.extraction_status,
    warnings: [...source.warnings],
    sha256: source.sha256
  }))
  const knownMappings = new Set(manifest.sources.map((source) => `${source.logical_name}\u0000${source.sha256}`))
  for (const local of localRun?.sources ?? []) {
    if (knownMappings.has(`${local.logical_name}\u0000${local.sha256}`)) continue
    sources.push({
      sourceId: `selected-resumed-${sources.length + 1}`,
      logicalName: local.logical_name,
      mediaType: normalizedMediaType(undefined, local.logical_name),
      byteSize: 0,
      extractionStatus: local.status,
      warnings: [],
      sha256: local.sha256
    })
  }
  return {
    run,
    sources,
    chunks,
    duplicates: (localRun?.sources ?? [])
      .filter((source) => source.status === "duplicate")
      .map((source) => ({ logical_name: source.logical_name }))
  }
}

async function persistLocalMappings(
  workspaceRoot: string,
  mappingPath: string,
  runId: string,
  mappings: readonly LocalSourceMapping[]
): Promise<void> {
  const currentRaw = await readTrustedUtf8(workspaceRoot, mappingPath, MAX_LOCAL_MAPPING_BYTES, true)
  const current: LocalMappingFile = currentRaw === undefined
    ? { schema_version: LOCAL_MAPPING_SCHEMA, runs: [] }
    : parseLocalMappingFile(currentRaw)
  const updatedAt = new Date().toISOString()
  const nextRun: LocalMappingRun = {
    run_id: runId,
    updated_at: updatedAt,
    sources: mappings.map((mapping) => ({
      logical_name: requireLogicalName(mapping.logicalName),
      absolute_path: requireBoundedAbsolutePath(mapping.absolutePath),
      sha256: requireSha256(mapping.sha256),
      status: requireLocalMappingStatus(mapping.status)
    }))
  }
  const runs = current.runs
    .filter((candidate) => candidate.run_id !== runId)
    .concat(nextRun)
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at) || compareText(left.run_id, right.run_id))
    .slice(0, MAX_LOCAL_MAPPING_RUNS)
  let serialized = `${JSON.stringify({ schema_version: LOCAL_MAPPING_SCHEMA, runs }, null, 2)}\n`
  while (Buffer.byteLength(serialized, "utf8") > MAX_LOCAL_MAPPING_BYTES && runs.length > 1) {
    runs.pop()
    serialized = `${JSON.stringify({ schema_version: LOCAL_MAPPING_SCHEMA, runs }, null, 2)}\n`
  }
  serialized = boundedSerialization(serialized, MAX_LOCAL_MAPPING_BYTES, "Local source mapping")
  await atomicWriteTrusted(workspaceRoot, mappingPath, serialized)
}

function parseLocalMappingFile(raw: string): LocalMappingFile {
  const parsed = parseJsonObject(raw, "Local source mapping")
  if (!hasExactKeys(parsed, ["schema_version", "runs"]) || parsed.schema_version !== LOCAL_MAPPING_SCHEMA || !Array.isArray(parsed.runs) || parsed.runs.length > MAX_LOCAL_MAPPING_RUNS) {
    throw new Error("Local source mapping has an invalid schema")
  }
  const seen = new Set<string>()
  const runs: LocalMappingRun[] = parsed.runs.map((value) => {
    if (!isPlainObject(value) || !hasExactKeys(value, ["run_id", "updated_at", "sources"]) || !Array.isArray(value.sources) || value.sources.length > DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles) {
      throw new Error("Local source mapping has an invalid run")
    }
    const runId = requireSafeId(value.run_id, "local mapping run ID")
    if (seen.has(runId)) throw new Error("Local source mapping has duplicate runs")
    seen.add(runId)
    const updatedAt = requireTimestamp(value.updated_at)
    const sources: LocalMappingSource[] = value.sources.map((source) => {
      if (!isPlainObject(source) || !hasExactKeys(source, ["logical_name", "absolute_path", "sha256", "status"])) {
        throw new Error("Local source mapping has an invalid source")
      }
      return {
        logical_name: requireLogicalName(source.logical_name),
        absolute_path: requireBoundedAbsolutePath(source.absolute_path),
        sha256: requireSha256(source.sha256),
        status: requireLocalMappingStatus(source.status)
      }
    })
    return { run_id: runId, updated_at: updatedAt, sources }
  })
  return { schema_version: LOCAL_MAPPING_SCHEMA, runs }
}

function parseChunkLines(raw: string): DocumentChunkV1[] {
  const lines = raw.split("\n").filter((line) => line.length > 0)
  if (lines.length > MAX_MODEL_CHUNKS) throw new Error("Persisted chunk count exceeds its limit")
  return lines.map((line) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      throw new Error("Persisted document chunks are invalid")
    }
    if (!isPlainObject(parsed)) throw new Error("Persisted document chunks are invalid")
    return parsed as unknown as DocumentChunkV1
  })
}

function validateLocalMappings(mappings: readonly LocalSourceMapping[]): void {
  if (!Array.isArray(mappings) || mappings.length > DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles) {
    throw new Error("Local source mapping count exceeds its limit")
  }
  for (const mapping of mappings) {
    requireLogicalName(mapping.logicalName)
    requireBoundedAbsolutePath(mapping.absolutePath)
    requireSha256(mapping.sha256)
    requireLocalMappingStatus(mapping.status)
  }
}

async function readTrustedUtf8(
  workspaceRootInput: string,
  filePathInput: string,
  maxBytes: number,
  optional = false
): Promise<string | undefined> {
  const workspaceRoot = path.resolve(workspaceRootInput)
  const filePath = path.resolve(filePathInput)
  assertLexicallyContained(workspaceRoot, filePath)
  let before: Stats
  try {
    before = await fs.lstat(filePath)
  } catch (error) {
    if (optional && isNodeError(error) && error.code === "ENOENT") return undefined
    throw error
  }
  if (before.isSymbolicLink() || !before.isFile() || before.size > maxBytes) {
    throw new Error("Rule authoring artifact is unsafe or exceeds its byte limit")
  }
  await assertTrustedDirectoryChain(workspaceRoot, path.dirname(filePath))
  const handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
  try {
    const opened = await handle.stat()
    if (!sameFile(before, opened) || opened.size > maxBytes) throw new Error("Rule authoring artifact changed while opening")
    const bytes = await handle.readFile()
    if (bytes.byteLength > maxBytes) throw new Error("Rule authoring artifact exceeds its byte limit")
    const after = await handle.stat()
    if (!sameFile(opened, after)) throw new Error("Rule authoring artifact changed while reading")
    await assertTrustedDirectoryChain(workspaceRoot, path.dirname(filePath))
    return bytes.toString("utf8")
  } finally {
    await handle.close()
  }
}

async function atomicWriteTrusted(
  workspaceRootInput: string,
  filePathInput: string,
  content: string
): Promise<void> {
  const workspaceRoot = path.resolve(workspaceRootInput)
  const filePath = path.resolve(filePathInput)
  assertLexicallyContained(workspaceRoot, filePath)
  const directory = path.dirname(filePath)
  await assertTrustedDirectoryChain(workspaceRoot, directory)
  const directoryBefore = await fs.lstat(directory)
  const previous = await lstatOptional(filePath)
  if (previous && (previous.isSymbolicLink() || !previous.isFile())) {
    throw new Error("Rule authoring artifact target is unsafe")
  }
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`)
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(temporaryPath, "wx", 0o600)
    await handle.writeFile(content, "utf8")
    await handle.sync()
    const temporary = await handle.stat()
    await handle.close()
    handle = undefined
    await assertTrustedDirectoryChain(workspaceRoot, directory)
    const directoryAfter = await fs.lstat(directory)
    if (!sameDirectory(directoryBefore, directoryAfter)) throw new Error("Rule authoring artifact directory changed")
    const currentPrevious = await lstatOptional(filePath)
    if (!sameOptionalFile(previous, currentPrevious)) throw new Error("Rule authoring artifact changed before replacement")
    const currentTemporary = await fs.lstat(temporaryPath)
    if (!sameFile(temporary, currentTemporary) || currentTemporary.isSymbolicLink()) {
      throw new Error("Rule authoring temporary artifact changed")
    }
    await fs.rename(temporaryPath, filePath)
    const installed = await fs.lstat(filePath)
    if (!sameFile(temporary, installed) || installed.isSymbolicLink() || !installed.isFile()) {
      throw new Error("Rule authoring artifact replacement changed identity")
    }
    await assertTrustedDirectoryChain(workspaceRoot, directory)
  } finally {
    await handle?.close().catch(() => undefined)
    const directoryNow = await lstatOptional(directory)
    if (directoryNow && sameDirectory(directoryBefore, directoryNow)) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    }
  }
}

async function assertTrustedDirectoryChain(workspaceRootInput: string, directoryInput: string): Promise<void> {
  const workspaceRoot = path.resolve(workspaceRootInput)
  const directory = path.resolve(directoryInput)
  assertLexicallyContained(workspaceRoot, directory)
  let current = workspaceRoot
  const rootStats = await fs.lstat(current)
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new Error("Workspace root is not a trusted directory")
  for (const segment of path.relative(workspaceRoot, directory).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    const stats = await fs.lstat(current)
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error("Rule authoring path contains an unsafe directory")
  }
  const [realRoot, realDirectory] = await Promise.all([fs.realpath(workspaceRoot), fs.realpath(directory)])
  assertLexicallyContained(realRoot, realDirectory)
}

function resolveWorkspace(explicitRoot: string | undefined): WorkspaceSelection {
  const folders = vscode.workspace.workspaceFolders ?? []
  if (folders.length === 0) throw new Error("Rule authoring requires an open workspace")
  if (explicitRoot !== undefined && (!path.isAbsolute(explicitRoot) || CONTROL_CHARACTER.test(explicitRoot))) {
    throw new Error("Explicit workspace root is invalid")
  }
  const requested = path.resolve(explicitRoot ?? folders[0].uri.fsPath)
  const folder = folders.find((candidate) => path.resolve(candidate.uri.fsPath) === requested)
  if (!folder) throw new Error("Rule authoring workspace must be an open workspace folder")
  return { workspaceRoot: requested, workspaceName: boundedText(folder.name, 255) }
}

function validateResumableRuns(
  runs: readonly RuleAuthoringRunV1[],
  workspaceRoot: string
): RuleAuthoringRunV1[] {
  if (!Array.isArray(runs) || runs.length > 100) throw new Error("Too many incomplete authoring runs")
  const seen = new Set<string>()
  return runs.map((run) => {
    validateActiveRun(run, workspaceRoot)
    if (seen.has(run.runId)) throw new Error("Duplicate incomplete authoring run")
    seen.add(run.runId)
    return run
  })
}

function validateActiveRun(run: RuleAuthoringRunV1, workspaceRoot: string): void {
  if (!isPlainObject(run)) throw new Error("Invalid authoring run")
  requireSafeId(run.runId, "authoring run ID")
  if (path.resolve(run.workspaceRoot) !== path.resolve(workspaceRoot)) throw new Error("Authoring run workspace mismatch")
}

function safeConfiguredRoute(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || CONTROL_CHARACTER.test(value)) return "Not configured"
  const candidate = boundedText(value.trim(), 512)
  if (
    path.isAbsolute(candidate) ||
    /^[A-Za-z]:[\\/]/.test(candidate) ||
    /^\\\\/.test(candidate) ||
    /^file:\/\//i.test(candidate)
  ) {
    return "Configured route withheld because it resembles a local path"
  }
  return candidate
}

function detectBobExtension(): boolean {
  const registry = vscode.extensions
  if (!registry?.getExtension) return false
  return Boolean(
    registry.getExtension("IBM.bob-code") ||
    registry.getExtension("IBM.bob") ||
    registry.getExtension("ibm.bob-code")
  )
}

function newAuthoringRunId(): string {
  return `authoring-${Date.now().toString(36)}-${randomBytes(8).toString("hex")}`
}

async function showSafeHostError(): Promise<void> {
  try {
    await vscode.window.showErrorMessage(
      "Project rule source wizard stopped because an operation could not be completed safely."
    )
  } catch {
    // UI reporting must never turn a safely-settled host failure into a rejection.
  }
}

function assertExpectedArtifact(workspaceRoot: string, relative: string, expectedPath: string): void {
  const resolved = path.resolve(workspaceRoot, relative)
  if (resolved !== path.resolve(expectedPath)) throw new Error("Authoring artifact path does not match its trusted run path")
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${label} is invalid`)
  }
  if (!isPlainObject(parsed)) throw new Error(`${label} is invalid`)
  return parsed
}

function boundedSerialization(value: string, maxBytes: number, label: string): string {
  if (Buffer.byteLength(value, "utf8") > maxBytes) throw new Error(`${label} exceeds its byte limit`)
  return value
}

function timestampAfter(previous: string): string {
  const previousMillis = Date.parse(requireTimestamp(previous))
  const nextMillis = Math.max(Date.now(), previousMillis + 1)
  return new Date(nextMillis).toISOString()
}

function requireTimestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error("Timestamp is invalid")
  }
  return value
}

function uniqueLogicalNames(values: readonly unknown[]): string[] {
  return [...new Set(values.map(requireLogicalName))].sort(compareText)
}

function requireLogicalName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    value.includes("/") ||
    value.includes("\\") ||
    CONTROL_CHARACTER.test(value) ||
    Buffer.byteLength(value, "utf8") > 255
  ) {
    throw new Error("Logical source name is invalid")
  }
  return value
}

function normalizedMediaType(value: unknown, logicalName: string): string {
  const candidate = typeof value === "string" ? value.toLowerCase() : path.extname(logicalName).slice(1).toLowerCase()
  if (!MEDIA_TYPES.has(candidate)) throw new Error("Source media type is invalid")
  return candidate
}

function normalizedExtractionStatus(value: unknown): string {
  if (typeof value !== "string" || !EXTRACTION_STATUSES.has(value)) throw new Error("Source extraction status is invalid")
  return value
}

function safeWarningCode(value: unknown): string | undefined {
  return typeof value === "string" &&
    Buffer.byteLength(value, "utf8") <= 128 &&
    SAFE_WARNING_CODE.test(value)
    ? value
    : undefined
}

function requireSafeId(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !isSafeId(value)) throw new Error(`${fieldName} is invalid`)
  return value
}

function optionalSafeId(value: unknown, fieldName: string): string | undefined {
  return value === undefined ? undefined : requireSafeId(value, fieldName)
}

function isSafeId(value: unknown): value is string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) return false
  try {
    validateRuleAuthoringId(value, "id")
    return true
  } catch {
    return false
  }
}

function requireSha256(value: unknown): string {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error("Source SHA-256 is invalid")
  return value
}

function requireBoundedAbsolutePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !path.isAbsolute(value) ||
    CONTROL_CHARACTER.test(value) ||
    Buffer.byteLength(value, "utf8") > 4096
  ) {
    throw new Error("Local source path is invalid")
  }
  return path.resolve(value)
}

function requireLocalMappingStatus(value: unknown): LocalSourceMapping["status"] {
  if (value === "success" || value === "partial" || value === "blocked" || value === "requires_conversion" || value === "requires_ocr" || value === "duplicate") {
    return value
  }
  throw new Error("Local source mapping status is invalid")
}

function safeNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function cloneSourceModel(source: RuleAuthoringGuiSourceModel): RuleAuthoringGuiSourceModel {
  return {
    sourceId: source.sourceId,
    logicalName: source.logicalName,
    mediaType: source.mediaType,
    byteSize: source.byteSize,
    extractionStatus: source.extractionStatus,
    warnings: [...source.warnings]
  }
}

function boundedText(value: unknown, maxBytes: number): string {
  const text = typeof value === "string" ? value : String(value ?? "")
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text
  let output = ""
  let bytes = 0
  for (const codePoint of text) {
    const size = Buffer.byteLength(codePoint, "utf8")
    if (bytes + size > maxBytes) break
    output += codePoint
    bytes += size
  }
  return output
}

function assertLexicallyContained(root: string, target: string): void {
  const relative = path.relative(root, target)
  if (relative === "") return
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Rule authoring path escapes the workspace")
  }
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs
}

function sameDirectory(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.isDirectory() && right.isDirectory()
}

function sameOptionalFile(left: Stats | undefined, right: Stats | undefined): boolean {
  if (!left || !right) return left === right
  return sameFile(left, right)
}

async function lstatOptional(filePath: string): Promise<Stats | undefined> {
  try {
    return await fs.lstat(filePath)
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index])
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
