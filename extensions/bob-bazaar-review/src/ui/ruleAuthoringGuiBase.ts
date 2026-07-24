import { randomBytes } from "node:crypto"
import * as path from "node:path"
import * as vscode from "vscode"
import {
  extractRuleDocuments,
  type DocumentExtractionResult,
  type RuleDocumentBatchResult,
  type RuleDocumentExtractionRequest
} from "../ruleAuthoring/extraction/documentExtractor"
import { sanitizeRemoteSafeText } from "../ruleAuthoring/remoteSafeText"
import {
  bindRuleAuthoringRunToWorkflow,
  confirmRuleAuthoringScope,
  invalidateRuleAuthoringExtraction,
  loadApprovedRuleSourceManifest,
  persistRuleAuthoringExtraction,
  resumeRuleAuthoringExtraction,
  updateRuleAuthoringScopeSelection,
  type ConfirmRuleAuthoringScopeResult,
  type PersistRuleAuthoringExtractionInput as DomainPersistRuleAuthoringExtractionInput,
  type RuleAuthoringExtractionState,
  type RuleAuthoringResumeSource
} from "../ruleAuthoring/ruleAuthoringArtifactStore"
import {
  DEFAULT_RULE_AUTHORING_LIMITS,
  type RuleAuthoringLimits
} from "../ruleAuthoring/ruleAuthoringLimits"
import { validateRuleAuthoringId } from "../ruleAuthoring/ruleAuthoringPaths"
import {
  createRuleAuthoringRun,
  listIncompleteRuleAuthoringRuns,
  type CreateRuleAuthoringRunInput,
  type RuleAuthoringRunV1
} from "../ruleAuthoring/ruleAuthoringRunStore"
import type { DocumentChunkLocatorV1, DocumentChunkV1, RuleSourceManifestV1 } from "../ruleAuthoring/ruleAuthoringTypes"
import {
  findIncompleteRuleApplyTransactions,
  type IncompleteRuleApplyTransactionV1
} from "../ruleAuthoring/ruleApplyTransaction"
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
const SELECTED_ID = /^selected-[a-f0-9]{32}$/
const SOURCE_ID = /^src-[a-f0-9]{12,64}$/
const CHUNK_ID = /^chunk-[a-f0-9]{64}$/
const SHA256 = /^[a-f0-9]{64}$/
const SAFE_WARNING_CODE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/
const MAX_REMOTE_WARNINGS = 100
const MAX_MODEL_CHUNKS = Math.floor(DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes / 128)
const APPROVE_EXCLUSION = "除外して続行"

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
  limits?: RuleAuthoringLimits
  pdfToTextPath?: string
}

export interface RuleAuthoringResumeState {
  run: RuleAuthoringRunV1
  sources: readonly unknown[]
  chunks: readonly DocumentChunkV1[]
  includedChunkIds?: readonly string[]
  aiPayload?: unknown
}

export type PersistRuleAuthoringExtractionInput = DomainPersistRuleAuthoringExtractionInput

export interface PersistRuleAuthoringExtractionResult {
  run: RuleAuthoringRunV1
  sources?: readonly RuleAuthoringResumeSource[]
  chunks?: readonly DocumentChunkV1[]
  includedChunkIds?: readonly string[]
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
    limits: RuleAuthoringLimits
  ) => Promise<RuleDocumentBatchResult>
  persistRuleAuthoringExtraction: (
    input: PersistRuleAuthoringExtractionInput
  ) => Promise<PersistRuleAuthoringExtractionResult>
  updateRuleAuthoringScopeSelection: (input: {
    run: RuleAuthoringRunV1
    chunkId: string
    included: boolean
  }) => Promise<PersistRuleAuthoringExtractionResult>
  confirmRuleAuthoringScope: (input: {
    run: RuleAuthoringRunV1
    expectedSummary?: { logicalNames: string[]; selectedChunkCount: number; utf8Bytes: number }
  }) => Promise<ConfirmRuleAuthoringScopeResult>
  bindRuleAuthoringRunToWorkflow: (input: {
    run: RuleAuthoringRunV1
    workflowRunId: string
  }) => Promise<RuleAuthoringRunV1>
  invalidateRuleAuthoringExtraction: (input: { run: RuleAuthoringRunV1 }) => Promise<RuleAuthoringRunV1>
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
  selectedId: string
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

interface SourceOutcome {
  source: SelectedSource
  model: RuleAuthoringGuiSourceModel
  exclusionRequired: boolean
}

interface NormalizedResumeState {
  sources: RuleAuthoringGuiSourceModel[]
  approvals: Map<string, boolean>
}

class SafeSelectionError extends Error {
  constructor(readonly safeMessage: string) {
    super(safeMessage)
  }
}

export function parseRuleAuthoringGuiMessage(value: unknown): RuleAuthoringGuiMessage | undefined {
  if (!isPlainObject(value) || typeof value.type !== "string") return undefined
  if (value.type === "chooseSources" && hasExactKeys(value, ["type"])) return { type: "chooseSources" }
  if (
    value.type === "removeSource" &&
    hasExactKeys(value, ["type", "sourceId"]) &&
    isSourceSelectionId(value.sourceId)
  ) {
    return { type: "removeSource", sourceId: value.sourceId }
  }
  if (value.type === "extractSources" && hasExactKeys(value, ["type"])) return { type: "extractSources" }
  if (
    value.type === "setChunkIncluded" &&
    hasExactKeys(value, ["type", "chunkId", "included"]) &&
    isChunkId(value.chunkId) &&
    typeof value.included === "boolean"
  ) {
    return { type: "setChunkIncluded", chunkId: value.chunkId, included: value.included }
  }
  if (value.type === "confirmAiPayload" && hasExactKeys(value, ["type"])) return { type: "confirmAiPayload" }
  if (
    value.type === "resumeRun" &&
    hasExactKeys(value, ["type", "runId"]) &&
    isGeneralId(value.runId)
  ) {
    return { type: "resumeRun", runId: value.runId }
  }
  if (value.type === "cancelRun" && hasExactKeys(value, ["type"])) return { type: "cancelRun" }
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
    resumeRuleAuthoringRun: resumeRuleAuthoringExtraction,
    loadApprovedRuleSourceManifest,
    extractRuleDocuments,
    persistRuleAuthoringExtraction,
    updateRuleAuthoringScopeSelection,
    confirmRuleAuthoringScope,
    bindRuleAuthoringRunToWorkflow,
    invalidateRuleAuthoringExtraction,
    completeCurrentWorkflowStepAfterGuiAction,
    ...overrides
  }
  return {
    openRuleAuthoringGui: (context, initial = {}) => openWithDependencies(dependencies, context, initial)
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
    const workflowRunId = optionalGeneralId(initial.runId, "workflow run ID")
    const workflowStepId = optionalGeneralId(initial.stepId, "workflow step ID")
    if ((workflowRunId === undefined) !== (workflowStepId === undefined)) {
      throw new Error("Workflow run and step IDs must be supplied together")
    }
    const workspace = resolveWorkspace(initial.workspaceRoot)
    const limits = boundedRuleAuthoringGuiLimits(initial.limits)
    const pdfToTextPath = boundedPdfToTextPath(initial.pdfToTextPath)

    const transactions = await dependencies.findIncompleteRuleApplyTransactions(workspace.workspaceRoot)
    if (transactions.length > 0) {
      const transactionId = requireGeneralId(transactions[0].transaction_id, "transaction ID")
      await vscode.window.showWarningMessage(
        "未完了の規約反映処理があります。規約作成を続ける前に、規約案の確認・採否画面で復旧または変更前への復元を行ってください。",
        { modal: true }
      )
      return { status: "recovery_required", transactionId }
    }

    const listedRuns = validateListedRuns(
      await dependencies.listIncompleteRuleAuthoringRuns(workspace.workspaceRoot),
      workspace.workspaceRoot
    )
    const resumableRuns = listedRuns.filter((run) => workflowRunId === undefined
      ? run.workflowRunId === undefined
      : run.workflowRunId === undefined || run.workflowRunId === workflowRunId)
    let activeRun: RuleAuthoringRunV1 | undefined
    if (resumableRuns.length === 0) {
      activeRun = await dependencies.createRuleAuthoringRun({
        workspaceRoot: workspace.workspaceRoot,
        runId: newAuthoringRunId(),
        ...(workflowRunId ? { workflowRunId } : {})
      })
      validateActiveRun(activeRun, workspace.workspaceRoot)
      if (activeRun.workflowRunId !== workflowRunId) throw new Error("Created run workflow binding mismatch")
    }

    panel = vscode.window.createWebviewPanel(
      "bobBazaarRuleAuthoring",
      "規約資料の取り込み",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    )

    return await new Promise<RuleAuthoringGuiResult>((resolve) => {
      let settled = false
      let controller: RuleAuthoringGuiController | undefined
      const settle = (result: RuleAuthoringGuiResult, closePanel = true): void => {
        if (settled) return
        settled = true
        resolve(result)
        if (closePanel) panel?.dispose()
      }
      controller = new RuleAuthoringGuiController({
        dependencies,
        panel: panel!,
        workspace,
        configuredBobModelRoute: sanitizeRemoteSafeText(initial.configuredBobModelRoute ?? "未設定", 512),
        bobExtensionAvailable: initial.bobExtensionAvailable ?? detectBobExtension(),
        workflowRunId,
        workflowStepId,
        limits,
        pdfToTextPath,
        resumableRuns,
        activeRun,
        settle
      })

      let messageQueue: Promise<void> = Promise.resolve()
      const messageDisposable = panel!.webview.onDidReceiveMessage((rawMessage) => {
        const parsed = parseRuleAuthoringGuiMessage(rawMessage)
        if (parsed?.type === "cancelRun") {
          controller!.handlePriorityCancel()
          return Promise.resolve()
        }
        messageQueue = messageQueue
          .then(() => controller!.handleMessage(rawMessage))
          .catch(async () => {
            if (controller?.isDisposed()) return
            controller?.showOperationFailure()
            await showSafeHostError()
          })
        return messageQueue
      })
      const disposeDisposable = panel!.onDidDispose(() => controller?.dispose())
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
  limits: RuleAuthoringLimits
  pdfToTextPath: string
  resumableRuns: RuleAuthoringRunV1[]
  activeRun?: RuleAuthoringRunV1
  settle: (result: RuleAuthoringGuiResult, closePanel?: boolean) => void
}

class RuleAuthoringGuiController {
  private selectedSources: SelectedSource[] = []
  private sourceModels: RuleAuthoringGuiSourceModel[] = []
  private sourceApprovals = new Map<string, boolean>()
  private chunks: HostChunk[] = []
  private activeRun?: RuleAuthoringRunV1
  private resumableRuns: RuleAuthoringRunV1[]
  private extractionReady = false
  private hasPersistedExtraction = false
  private warnings: string[] = []
  private status: string
  private operationGeneration = 0
  private disposed = false
  private confirmationStarted = false
  private externalCompletionStarted = false
  private canonicalOverflow = false
  private canonicalMismatch = false

  constructor(private readonly input: ControllerInput) {
    this.activeRun = input.activeRun
    this.resumableRuns = [...input.resumableRuns]
    this.status = this.activeRun
      ? "Choose source files. Extraction and AI consent are separate actions."
      : "Select an incomplete run to resume before choosing sources."
  }

  isDisposed(): boolean {
    return this.disposed
  }

  handlePriorityCancel(): void {
    if (this.disposed) return
    this.dispose()
    this.input.panel.dispose()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.operationGeneration += 1
    if (!this.externalCompletionStarted) this.input.settle({ status: "cancelled" }, false)
  }

  showOperationFailure(): void {
    if (this.disposed) return
    this.status = "The operation could not be completed safely. The persisted scope was not assumed to have changed."
    this.render()
  }

  async handleMessage(rawMessage: unknown): Promise<void> {
    if (this.disposed) return
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
        await this.removeSource(message.sourceId)
        return
      case "extractSources":
        await this.extractSources()
        return
      case "setChunkIncluded":
        await this.setChunkIncluded(message.chunkId, message.included)
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
    if (this.disposed) return
    const payload = this.payloadSummary()
    const model: RuleAuthoringGuiModel = {
      cspSource: this.input.panel.webview.cspSource,
      phase: this.activeRun?.currentPhase ?? "sources",
      environment: {
        workspaceName: sanitizeRemoteSafeText(this.input.workspace.workspaceName, 255),
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
        title: sanitizeRemoteSafeText(chunk.title, 240),
        locator: sanitizeRemoteSafeText(chunk.locator, 240),
        utf8Bytes: chunk.utf8Bytes,
        included: chunk.included
      })),
      aiPayload: {
        logicalNames: payload.logicalNames.map((name) => sanitizeRemoteSafeText(name, 255)),
        selectedChunkCount: payload.selectedChunkCount,
        utf8Bytes: payload.utf8Bytes
      },
      warnings: this.warnings.map((warning) => sanitizeRemoteSafeText(warning, 512)),
      scopeOverflow: payload.overflow || this.canonicalOverflow,
      exclusionsApproved: this.exclusionsApproved(),
      canConfirmAiPayload: this.canConfirm(payload),
      status: sanitizeRemoteSafeText(this.status, 512)
    }
    this.input.panel.webview.html = this.input.dependencies.renderRuleAuthoringGuiHtml(
      model,
      this.input.dependencies.createNonce()
    )
  }

  private async chooseSources(): Promise<void> {
    if (!this.activeRun) {
      this.status = "途中の取り込みを再開してから資料を選択してください。"
      this.render()
      return
    }
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: "規約資料を選択",
      filters: {
        "対応する規約資料": ["docx", "xlsx", "pdf"],
        "旧形式の Office 資料（変換が必要）": ["doc", "xls"]
      }
    })
    if (!selected || this.disposed) return
    try {
      const validated = await validateSelectedUris(
        selected,
        () => `selected-${randomBytes(16).toString("hex")}`,
        this.input.limits
      )
      if (this.disposed) return
      if (this.hasPersistedExtraction) await this.invalidateExtraction()
      if (this.disposed) return
      this.selectedSources = validated
      this.sourceModels = validated.map(selectedSourceModel)
      this.sourceApprovals.clear()
      this.clearExtractionMemory()
      this.status = `${validated.length} source file(s) selected. Start extraction explicitly.`
      this.warnings = []
    } catch (error) {
      this.status = error instanceof SafeSelectionError
        ? error.safeMessage
        : "The selected source files could not be validated safely."
      this.warnings = [this.status]
    }
    this.render()
  }

  private async removeSource(sourceId: string): Promise<void> {
    const selectedIndex = this.selectedSources.findIndex((source) => source.selectedId === sourceId)
    const modelIndex = this.sourceModels.findIndex((source) => source.sourceId === sourceId)
    if (selectedIndex < 0 && modelIndex < 0) return
    if (this.hasPersistedExtraction) await this.invalidateExtraction()
    if (this.disposed) return
    if (selectedIndex >= 0) this.selectedSources.splice(selectedIndex, 1)
    if (modelIndex >= 0) this.sourceModels.splice(modelIndex, 1)
    this.sourceApprovals.delete(sourceId)
    this.clearExtractionMemory()
    if (this.selectedSources.length > 0) this.sourceModels = this.selectedSources.map(selectedSourceModel)
    this.warnings = []
    this.status = "Source scope changed. Extract the remaining sources again before AI consent."
    this.render()
  }

  private async invalidateExtraction(): Promise<void> {
    if (!this.activeRun) return
    const invalidated = await this.input.dependencies.invalidateRuleAuthoringExtraction({ run: this.activeRun })
    validateActiveRun(invalidated, this.input.workspace.workspaceRoot)
    this.activeRun = invalidated
    this.operationGeneration += 1
    this.hasPersistedExtraction = false
    this.clearExtractionMemory()
  }

  private async extractSources(): Promise<void> {
    if (!this.activeRun || this.selectedSources.length === 0) {
      this.status = "Select at least one source file before extraction."
      this.render()
      return
    }
    const generation = ++this.operationGeneration
    let selected: SelectedSource[]
    try {
      selected = await revalidateSelectedSources(this.selectedSources, this.input.limits)
    } catch (error) {
      if (!this.operationIsCurrent(generation)) return
      this.clearExtractionMemory()
      this.status = error instanceof SafeSelectionError
        ? error.safeMessage
        : "The selected source files changed or could not be validated safely."
      this.warnings = [this.status]
      this.render()
      return
    }
    if (!this.operationIsCurrent(generation)) return

    const requests = selected.map((source): RuleDocumentExtractionRequest => ({
      filePath: source.uri.fsPath,
      logicalName: source.logicalName,
      pdf: { command: this.input.pdfToTextPath }
    }))
    const existingManifest = await this.input.dependencies.loadApprovedRuleSourceManifest(
      this.input.workspace.workspaceRoot
    )
    if (!this.operationIsCurrent(generation)) return
    const batch = await this.input.dependencies.extractRuleDocuments(
      requests,
      existingManifest,
      this.input.limits
    )
    if (!this.operationIsCurrent(generation)) return

    const outcomes = sourceOutcomesAfterExtraction(selected, batch)
    const approvals = await requestExclusionApprovals(outcomes)
    if (!this.operationIsCurrent(generation)) return
    const currentRun = this.activeRun
    if (!currentRun) return
    const persisted = await this.input.dependencies.persistRuleAuthoringExtraction({
      workspaceRoot: this.input.workspace.workspaceRoot,
      runId: currentRun.runId,
      run: currentRun,
      batch,
      existingManifest,
      selectedSources: selected.map((source) => ({
        selectedId: source.selectedId,
        absolutePath: source.uri.fsPath,
        logicalName: source.logicalName,
        mediaType: source.mediaType,
        byteSize: source.byteSize
      })),
      exclusionApprovals: outcomes.map((outcome) => ({
        selectedId: outcome.source.selectedId,
        approved: approvals.get(outcome.source.selectedId) === true
      }))
    })
    if (!this.operationIsCurrent(generation)) return
    validateActiveRun(persisted.run, this.input.workspace.workspaceRoot)
    this.activeRun = persisted.run
    this.hasPersistedExtraction = true
    this.selectedSources = selected
    this.sourceModels = outcomes.map((outcome) => cloneSourceModel(outcome.model))
    this.sourceApprovals = approvals
    const namesBySourceId = sourceNamesFromBatch(batch)
    this.chunks = hostChunks(batch.aiChunks, namesBySourceId)
    if (persisted.includedChunkIds) applyIncludedChunkIds(this.chunks, persisted.includedChunkIds)
    this.extractionReady = this.chunks.length > 0
    this.canonicalOverflow = false
    this.canonicalMismatch = false
    this.warnings = batch.diagnostics
      .map((diagnostic) => safeWarningCode(diagnostic.code))
      .filter(isPresent)
      .slice(0, MAX_REMOTE_WARNINGS)
    this.status = this.exclusionsApproved()
      ? "Extraction scope is ready. Review chunks, then use the separate AI payload confirmation action."
      : "AI payload consent is disabled until every exclusion is explicitly approved."
    this.render()
  }

  private async setChunkIncluded(chunkId: string, included: boolean): Promise<void> {
    const chunk = this.chunks.find((candidate) => candidate.chunkId === chunkId)
    if (!chunk || !this.activeRun) {
      this.status = "The requested chunk is not part of this run-local extraction scope."
      this.render()
      return
    }
    const updated = await this.input.dependencies.updateRuleAuthoringScopeSelection({
      run: this.activeRun,
      chunkId,
      included
    })
    if (this.disposed) return
    validateActiveRun(updated.run, this.input.workspace.workspaceRoot)
    this.activeRun = updated.run
    chunk.included = included
    this.canonicalOverflow = false
    this.canonicalMismatch = false
    this.status = "Chunk scope changed durably. Confirm AI payload explicitly when the scope is final."
    this.render()
  }

  private async resumeRun(runId: string): Promise<void> {
    const offered = this.resumableRuns.find((candidate) => candidate.runId === runId)
    if (!offered) {
      this.status = "The requested run is not an offered incomplete run."
      this.render()
      return
    }
    let run = offered
    if (this.input.workflowRunId && run.workflowRunId === undefined) {
      run = await this.input.dependencies.bindRuleAuthoringRunToWorkflow({
        run,
        workflowRunId: this.input.workflowRunId
      })
      validateActiveRun(run, this.input.workspace.workspaceRoot)
      if (run.workflowRunId !== this.input.workflowRunId) throw new Error("Workflow binding was not persisted")
    }
    const resumed = await this.input.dependencies.resumeRuleAuthoringRun(run)
    if (this.disposed) return
    validateActiveRun(resumed.run, this.input.workspace.workspaceRoot)
    if (resumed.run.runId !== run.runId || resumed.run.workflowRunId !== run.workflowRunId) {
      throw new Error("Resumed run identity mismatch")
    }
    const normalized = normalizeResumedSources(resumed.sources)
    const namesBySourceId = namesByResumedSource(resumed.sources, normalized.sources)
    const chunks = hostChunks(resumed.chunks, namesBySourceId)
    applyIncludedChunkIds(chunks, resumed.includedChunkIds ?? resumed.chunks.map((chunk) => chunk.chunk_id))
    this.activeRun = resumed.run
    this.resumableRuns = this.resumableRuns.filter((candidate) => candidate.runId !== runId)
    this.selectedSources = []
    this.sourceModels = normalized.sources
    this.sourceApprovals = normalized.approvals
    this.chunks = chunks
    this.extractionReady = chunks.length > 0
    this.hasPersistedExtraction = Boolean(
      resumed.run.artifacts.sourceScope || normalized.sources.length > 0 || chunks.length > 0
    )
    this.canonicalOverflow = false
    this.canonicalMismatch = false
    this.warnings = []
    this.status = this.extractionReady
      ? "Incomplete run resumed. Review the persisted chunk scope before explicit AI consent."
      : "Incomplete run resumed. Select and extract sources before AI consent."
    this.render()
  }

  private async confirmAiPayload(): Promise<void> {
    const payload = this.payloadSummary()
    if (this.confirmationStarted || !this.canConfirm(payload) || !this.activeRun) {
      if (!this.confirmationStarted) {
        this.status = "AI payload cannot be confirmed: extraction, non-empty scope, limits, and exclusion approval are required."
        this.render()
      }
      return
    }
    this.confirmationStarted = true
    try {
      const confirmed = await this.input.dependencies.confirmRuleAuthoringScope({
        run: this.activeRun,
        expectedSummary: {
          logicalNames: payload.logicalNames,
          selectedChunkCount: payload.selectedChunkCount,
          utf8Bytes: payload.utf8Bytes
        }
      })
      if (this.disposed) return
      validateActiveRun(confirmed.run, this.input.workspace.workspaceRoot)
      this.activeRun = confirmed.run
      if (confirmed.status !== "confirmed") {
        this.confirmationStarted = false
        this.canonicalOverflow = confirmed.status === "overflow"
        this.canonicalMismatch = false
        if (confirmed.status === "approval_required") {
          this.status = "The canonical scope still requires exclusion approval."
        } else if (confirmed.status === "empty") {
          this.status = "The canonical scope is empty. Select at least one extracted chunk."
        } else {
          this.status = "The canonical source index exceeds the 1 MiB limit. Deselect chunks before consent."
        }
        this.render()
        return
      }
      if (!samePayloadSummary(payload, confirmed.summary)) {
        this.confirmationStarted = false
        this.canonicalOverflow = false
        this.canonicalMismatch = true
        this.status = "The canonical consent scope does not match the displayed payload. Workflow completion is disabled."
        this.render()
        return
      }
      this.canonicalOverflow = false
      this.canonicalMismatch = false
      const authoringSession = { run_id: requireGeneralId(confirmed.run.runId, "authoring run ID") }
      if (this.input.workflowRunId === undefined) {
        this.input.settle({ status: "confirmed", authoringSession })
        return
      }
      if (this.input.workflowStepId === undefined) throw new Error("Workflow step identity is missing")
      const metadata: WorkflowStepCompletionOptions = {
        runId: this.input.workflowRunId,
        stepId: this.input.workflowStepId,
        stateUpdates: { authoringSession: JSON.stringify(authoringSession) }
      }
      this.externalCompletionStarted = true
      const completed = await this.input.dependencies.completeCurrentWorkflowStepAfterGuiAction({
        executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args),
        showWarningMessage: () => vscode.window.showWarningMessage(
          "現在の Bob ワークフローステップを自動完了できませんでした。操作センターで実行状態を確認してください。"
        )
      }, metadata)
      this.externalCompletionStarted = false
      if (!completed) {
        this.confirmationStarted = false
        if (this.disposed) {
          this.input.settle({ status: "cancelled" }, false)
          return
        }
        this.status = "AI に送る内容の確認は保存されましたが、ワークフローを完了できませんでした。もう一度完了操作を実行してください。"
        this.render()
        return
      }
      this.input.settle({ status: "confirmed", authoringSession }, !this.disposed)
    } catch (error) {
      this.externalCompletionStarted = false
      this.confirmationStarted = false
      if (this.disposed) {
        this.input.settle({ status: "cancelled" }, false)
        return
      }
      throw error
    }
  }

  private clearExtractionMemory(): void {
    this.chunks = []
    this.extractionReady = false
    this.canonicalOverflow = false
    this.canonicalMismatch = false
  }

  private operationIsCurrent(generation: number): boolean {
    return !this.disposed && generation === this.operationGeneration
  }

  private exclusionsApproved(): boolean {
    if (this.sourceModels.length === 0) return false
    return this.sourceModels.every((source) =>
      !requiresExclusionApproval(source.extractionStatus) || this.sourceApprovals.get(source.sourceId) === true)
  }

  private payloadSummary(): PayloadSummary {
    const logicalNamesBySource = new Map<string, string>()
    let selectedChunkCount = 0
    let utf8Bytes = 0
    let overflow = false
    for (const chunk of this.chunks) {
      if (!chunk.included) continue
      selectedChunkCount += 1
      if (!Number.isSafeInteger(utf8Bytes + chunk.utf8Bytes)) {
        overflow = true
        utf8Bytes = this.input.limits.maxSelectedEvidenceBytes + 1
        break
      }
      utf8Bytes += chunk.utf8Bytes
      if (chunk.logicalName) {
        logicalNamesBySource.set(chunk.sourceId, sanitizeRemoteSafeText(chunk.logicalName, 255))
      }
      if (utf8Bytes > this.input.limits.maxSelectedEvidenceBytes) overflow = true
    }
    return {
      logicalNames: [...logicalNamesBySource.values()].sort(compareText),
      selectedChunkCount,
      utf8Bytes,
      overflow
    }
  }

  private canConfirm(payload: PayloadSummary): boolean {
    return Boolean(
      this.activeRun &&
      this.extractionReady &&
      this.exclusionsApproved() &&
      !this.confirmationStarted &&
      !this.canonicalOverflow &&
      !this.canonicalMismatch &&
      payload.selectedChunkCount > 0 &&
      payload.utf8Bytes > 0 &&
      !payload.overflow &&
      payload.utf8Bytes <= this.input.limits.maxSelectedEvidenceBytes
    )
  }

  private resumableRunModels(): RuleAuthoringGuiResumableRunModel[] {
    return this.resumableRuns.map((run) => ({
      runId: run.runId,
      phase: sanitizeRemoteSafeText(run.currentPhase, 64),
      updatedAt: sanitizeRemoteSafeText(run.updatedAt, 64)
    }))
  }
}

async function validateSelectedUris(
  uris: readonly vscode.Uri[],
  nextSelectedId: () => string,
  limits: RuleAuthoringLimits
): Promise<SelectedSource[]> {
  if (uris.length === 0) throw new SafeSelectionError("Select at least one source file.")
  if (uris.length > limits.maxSourceFiles) {
    throw new SafeSelectionError(`Source file count exceeds the ${limits.maxSourceFiles}-file limit.`)
  }
  const selected: SelectedSource[] = []
  const paths = new Set<string>()
  let aggregateBytes = 0
  let perSourceOverflow = false
  for (const uri of uris) {
    if (uri.scheme !== "file" || !path.isAbsolute(uri.fsPath) || CONTROL_CHARACTER.test(uri.fsPath)) {
      throw new SafeSelectionError("Only supported local files can be selected.")
    }
    const absolutePath = path.resolve(uri.fsPath)
    if (paths.has(absolutePath)) throw new SafeSelectionError("The same source file cannot be selected twice.")
    paths.add(absolutePath)
    const logicalName = requireLogicalName(path.basename(absolutePath))
    const extension = path.extname(logicalName).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new SafeSelectionError("A selected file has an unsupported document extension.")
    const stat = await safeVscodeStat(uri)
    if ((stat.type & vscode.FileType.File) !== vscode.FileType.File || (stat.type & vscode.FileType.Directory) !== 0) {
      throw new SafeSelectionError("Only regular source files can be selected.")
    }
    if (!Number.isSafeInteger(stat.size) || stat.size < 0) throw new SafeSelectionError("A selected source has an invalid byte size.")
    if (stat.size > limits.maxSourceBytes) perSourceOverflow = true
    aggregateBytes += stat.size
    if (!Number.isSafeInteger(aggregateBytes) || aggregateBytes > limits.maxAggregateSourceBytes) {
      throw new SafeSelectionError(`Selected source aggregate bytes exceed the ${limits.maxAggregateSourceBytes}-byte limit.`)
    }
    const selectedId = nextSelectedId()
    if (!SELECTED_ID.test(selectedId)) throw new Error("Selected source ID is invalid")
    selected.push({
      selectedId,
      uri,
      logicalName,
      mediaType: extension.slice(1),
      byteSize: stat.size
    })
  }
  if (perSourceOverflow) {
    throw new SafeSelectionError(`A selected source exceeds the ${limits.maxSourceBytes}-byte per-file limit.`)
  }
  return selected
}

async function revalidateSelectedSources(
  sources: readonly SelectedSource[],
  limits: RuleAuthoringLimits
): Promise<SelectedSource[]> {
  let index = 0
  const validated = await validateSelectedUris(
    sources.map((source) => source.uri),
    () => sources[index++]?.selectedId ?? "",
    limits
  )
  for (const [sourceIndex, source] of sources.entries()) {
    const current = validated[sourceIndex]
    if (
      current.uri.fsPath !== source.uri.fsPath ||
      current.logicalName !== source.logicalName ||
      current.mediaType !== source.mediaType ||
      current.byteSize !== source.byteSize
    ) {
      throw new SafeSelectionError("A selected source changed after selection. Choose the files again.")
    }
  }
  return validated
}

async function safeVscodeStat(uri: vscode.Uri): Promise<vscode.FileStat> {
  try {
    return await vscode.workspace.fs.stat(uri)
  } catch {
    throw new SafeSelectionError("A selected source could not be inspected safely.")
  }
}

function sourceOutcomesAfterExtraction(
  selected: readonly SelectedSource[],
  batch: RuleDocumentBatchResult
): SourceOutcome[] {
  if (!Array.isArray(batch.documents) || !Array.isArray(batch.localSourceMappings)) throw new Error("Invalid extraction batch")
  const documents = new Map<string, DocumentExtractionResult>()
  for (const document of batch.documents) {
    const absolutePath = requireAbsolutePath(document.localPath)
    if (documents.has(absolutePath)) throw new Error("Duplicate extraction source path")
    documents.set(absolutePath, document)
  }
  const mappings = new Map<string, RuleDocumentBatchResult["localSourceMappings"][number]>()
  for (const mapping of batch.localSourceMappings) {
    const absolutePath = requireAbsolutePath(mapping.absolutePath)
    if (mappings.has(absolutePath)) throw new Error("Duplicate source mapping path")
    mappings.set(absolutePath, mapping)
  }
  return selected.map((source) => {
    const absolutePath = path.resolve(source.uri.fsPath)
    const mapping = mappings.get(absolutePath)
    if (!mapping || mapping.logicalName !== source.logicalName) throw new Error("Extraction source mapping is incomplete")
    const document = documents.get(absolutePath)
    const extractionStatus = normalizedExtractionStatus(mapping.status)
    if (document && normalizedExtractionStatus(document.status) !== extractionStatus) {
      throw new Error("Extraction source outcome does not match its exact selected path")
    }
    return {
      source,
      model: {
        sourceId: source.selectedId,
        logicalName: source.logicalName,
        mediaType: source.mediaType,
        byteSize: source.byteSize,
        extractionStatus,
        warnings: (document?.warnings ?? []).map(safeWarningCode).filter(isPresent).slice(0, MAX_REMOTE_WARNINGS)
      },
      exclusionRequired: requiresExclusionApproval(extractionStatus)
    }
  })
}

async function requestExclusionApprovals(outcomes: readonly SourceOutcome[]): Promise<Map<string, boolean>> {
  const approvals = new Map<string, boolean>()
  for (const outcome of outcomes) approvals.set(outcome.source.selectedId, !outcome.exclusionRequired)

  const duplicates = outcomes.filter((outcome) => outcome.model.extractionStatus === "duplicate")
  if (duplicates.length > 0) {
    const names = remoteSafeLogicalNames(duplicates.map((outcome) => outcome.model.logicalName))
    const response = await vscode.window.showWarningMessage(
      `重複している資料は対象から除外されます。資料名: ${names.join(", ")}`,
      { modal: true },
      APPROVE_EXCLUSION
    )
    for (const outcome of duplicates) approvals.set(outcome.source.selectedId, response === APPROVE_EXCLUSION)
  }

  const unavailable = outcomes.filter((outcome) =>
    outcome.exclusionRequired && outcome.model.extractionStatus !== "duplicate")
  if (unavailable.length > 0) {
    const names = remoteSafeLogicalNames(unavailable.map((outcome) => outcome.model.logicalName))
    const hasPartial = unavailable.some((outcome) => outcome.model.extractionStatus === "partial")
    const copy = hasPartial
      ? "一部抽出の資料では、抽出できた範囲を含め、取得できない部分を除外します。抽出不可または共有不可の資料は全体を除外します。"
      : "抽出不可、抽出失敗、共有不可の資料は対象から除外します。"
    const response = await vscode.window.showWarningMessage(
      `${copy} 資料名: ${names.join(", ")}`,
      { modal: true },
      APPROVE_EXCLUSION
    )
    for (const outcome of unavailable) approvals.set(outcome.source.selectedId, response === APPROVE_EXCLUSION)
  }
  return approvals
}

function normalizeResumedSources(values: readonly unknown[]): NormalizedResumeState {
  if (!Array.isArray(values) || values.length > DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles) {
    throw new Error("Invalid resumed source count")
  }
  const seen = new Set<string>()
  const approvals = new Map<string, boolean>()
  const sources = values.map((value, index): RuleAuthoringGuiSourceModel => {
    if (!isPlainObject(value)) throw new Error("Invalid resumed source")
    const logicalName = requireLogicalName(value.logicalName ?? value.logical_name)
    const mediaType = normalizedMediaType(value.mediaType ?? value.media_type, logicalName)
    const selectedIdCandidate = value.selectedId ?? value.selected_id ?? `selected-${String(index + 1).padStart(32, "0")}`
    if (typeof selectedIdCandidate !== "string" || !SELECTED_ID.test(selectedIdCandidate) || seen.has(selectedIdCandidate)) {
      throw new Error("Invalid resumed selected source ID")
    }
    seen.add(selectedIdCandidate)
    const extractionStatus = normalizedExtractionStatus(
      value.extractionStatus ?? value.extraction_status ?? value.status ?? "blocked"
    )
    const approved = typeof value.exclusionApproved === "boolean"
      ? value.exclusionApproved
      : typeof value.exclusion_approved === "boolean"
        ? value.exclusion_approved
        : !requiresExclusionApproval(extractionStatus)
    approvals.set(selectedIdCandidate, approved)
    return {
      sourceId: selectedIdCandidate,
      logicalName,
      mediaType,
      byteSize: safeNonNegativeInteger(value.byteSize ?? value.byte_size),
      extractionStatus,
      warnings: Array.isArray(value.warnings)
        ? value.warnings.map(safeWarningCode).filter(isPresent).slice(0, MAX_REMOTE_WARNINGS)
        : []
    }
  })
  return { sources, approvals }
}

function namesByResumedSource(
  values: readonly unknown[],
  sources: readonly RuleAuthoringGuiSourceModel[]
): ReadonlyMap<string, string> {
  const names = new Map<string, string>()
  for (const [index, value] of values.entries()) {
    if (!isPlainObject(value)) continue
    const explicit = value.sourceId ?? value.source_id
    const sha = typeof value.sha256 === "string" && SHA256.test(value.sha256) ? value.sha256 : undefined
    const sourceId = typeof explicit === "string" && SOURCE_ID.test(explicit)
      ? explicit
      : sha
        ? `src-${sha.slice(0, 12)}`
        : undefined
    if (sourceId && sources[index]) names.set(sourceId, sources[index].logicalName)
  }
  return names
}

function sourceNamesFromBatch(batch: RuleDocumentBatchResult): ReadonlyMap<string, string> {
  if (!isPlainObject(batch.manifest) || !Array.isArray(batch.manifest.sources)) throw new Error("Invalid extraction manifest")
  const names = new Map<string, string>()
  for (const source of batch.manifest.sources) {
    if (!SOURCE_ID.test(source.source_id)) throw new Error("Invalid manifest source ID")
    names.set(source.source_id, requireLogicalName(source.logical_name))
  }
  return names
}

function hostChunks(
  chunks: readonly DocumentChunkV1[],
  namesBySourceId: ReadonlyMap<string, string>
): HostChunk[] {
  if (!Array.isArray(chunks) || chunks.length > MAX_MODEL_CHUNKS) throw new Error("Extraction chunk count exceeds the remote-safe model limit")
  const seen = new Set<string>()
  const fallbackName = namesBySourceId.size === 1 ? [...namesBySourceId.values()][0] : undefined
  return chunks.map((chunk, index) => {
    if (!CHUNK_ID.test(chunk.chunk_id) || !SOURCE_ID.test(chunk.source_id) || seen.has(chunk.chunk_id) || typeof chunk.text !== "string") {
      throw new Error("Invalid extraction chunk")
    }
    seen.add(chunk.chunk_id)
    const utf8Bytes = Buffer.byteLength(chunk.text, "utf8")
    if (!Number.isSafeInteger(utf8Bytes)) throw new Error("Invalid extraction chunk size")
    return {
      chunkId: chunk.chunk_id,
      sourceId: chunk.source_id,
      logicalName: namesBySourceId.get(chunk.source_id) ?? fallbackName,
      utf8Bytes,
      included: true,
      title: sanitizeRemoteSafeText(chunk.title ?? `Extracted chunk ${index + 1}`, 240),
      locator: structuralLocator(chunk.locator)
    }
  })
}

function applyIncludedChunkIds(chunks: HostChunk[], values: readonly string[]): void {
  const included = new Set<string>()
  for (const value of values) {
    if (!CHUNK_ID.test(value) || included.has(value)) throw new Error("Invalid persisted chunk inclusion")
    included.add(value)
  }
  for (const value of included) {
    if (!chunks.some((chunk) => chunk.chunkId === value)) throw new Error("Persisted scope refers to an unknown chunk")
  }
  for (const chunk of chunks) chunk.included = included.has(chunk.chunkId)
}

function structuralLocator(locator: DocumentChunkLocatorV1): string {
  if (!isPlainObject(locator)) return "Structured location"
  const parts: string[] = []
  if (Array.isArray(locator.heading_path) && locator.heading_path.length > 0) {
    parts.push(`Heading ${locator.heading_path.map((part) => sanitizeRemoteSafeText(part, 64)).join(" > ")}`)
  }
  if (typeof locator.sheet === "string") parts.push(`Sheet ${sanitizeRemoteSafeText(locator.sheet, 64)}`)
  if (typeof locator.cell_range === "string") parts.push(`Cells ${sanitizeRemoteSafeText(locator.cell_range, 64)}`)
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
  return sanitizeRemoteSafeText(parts.join(" · ") || "Structured location", 240)
}

function selectedSourceModel(source: SelectedSource): RuleAuthoringGuiSourceModel {
  return {
    sourceId: source.selectedId,
    logicalName: source.logicalName,
    mediaType: source.mediaType,
    byteSize: source.byteSize,
    extractionStatus: "selected",
    warnings: []
  }
}

function validateListedRuns(values: readonly RuleAuthoringRunV1[], workspaceRoot: string): RuleAuthoringRunV1[] {
  if (!Array.isArray(values) || values.length > 1000) throw new Error("Invalid resumable run list")
  const seen = new Set<string>()
  return values.map((run) => {
    validateActiveRun(run, workspaceRoot)
    if (run.currentPhase === "completed" || seen.has(run.runId)) throw new Error("Invalid resumable run")
    seen.add(run.runId)
    return run
  })
}

function validateActiveRun(run: RuleAuthoringRunV1, workspaceRoot: string): void {
  if (!isPlainObject(run) || path.resolve(run.workspaceRoot) !== path.resolve(workspaceRoot)) throw new Error("Run workspace identity mismatch")
  requireGeneralId(run.runId, "authoring run ID")
  if (run.workflowRunId !== undefined) requireGeneralId(run.workflowRunId, "workflow run ID")
  if (typeof run.updatedAt !== "string" || Number.isNaN(Date.parse(run.updatedAt))) throw new Error("Run revision is invalid")
}

function boundedRuleAuthoringGuiLimits(value: RuleAuthoringLimits | undefined): RuleAuthoringLimits {
  if (value === undefined) return { ...DEFAULT_RULE_AUTHORING_LIMITS }
  const output = {} as RuleAuthoringLimits
  for (const key of Object.keys(DEFAULT_RULE_AUTHORING_LIMITS) as Array<keyof RuleAuthoringLimits>) {
    const candidate = value[key]
    if (!Number.isSafeInteger(candidate) || candidate <= 0) {
      throw new Error(`Rule authoring ${key} configuration must be a positive safe integer`)
    }
    output[key] = Math.min(candidate, DEFAULT_RULE_AUTHORING_LIMITS[key])
  }
  return output
}

function boundedPdfToTextPath(value: string | undefined): string {
  const candidate = value === undefined ? "pdftotext" : value.trim()
  if (!candidate || Buffer.byteLength(candidate, "utf8") > 4096 || CONTROL_CHARACTER.test(candidate)) {
    throw new Error("Rule authoring pdftotext path configuration is invalid")
  }
  return candidate
}

function resolveWorkspace(explicitRoot: string | undefined): WorkspaceSelection {
  if (explicitRoot !== undefined) {
    if (typeof explicitRoot !== "string" || !path.isAbsolute(explicitRoot) || CONTROL_CHARACTER.test(explicitRoot)) {
      throw new Error("Workspace root is invalid")
    }
    const workspaceRoot = path.resolve(explicitRoot)
    const matching = vscode.workspace.workspaceFolders?.find((folder) =>
      folder.uri.scheme === "file" && path.resolve(folder.uri.fsPath) === workspaceRoot)
    if (!matching) throw new Error("The requested authoring root is not an open local workspace")
    return { workspaceRoot, workspaceName: matching.name }
  }
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder || folder.uri.scheme !== "file") throw new Error("ローカルワークスペースが必要です。フォルダーを開いてから再実行してください。")
  return { workspaceRoot: path.resolve(folder.uri.fsPath), workspaceName: folder.name }
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
      "規約資料の取り込みを安全に続行できなかったため停止しました。入力資料とワークスペースを確認して再実行してください。"
    )
  } catch {
    // Reporting a safe, pathless error must not create a second failure.
  }
}

function optionalGeneralId(value: unknown, fieldName: string): string | undefined {
  return value === undefined ? undefined : requireGeneralId(value, fieldName)
}

function requireGeneralId(value: unknown, fieldName: string): string {
  if (typeof value !== "string") throw new Error(`${fieldName} is invalid`)
  return validateRuleAuthoringId(value, fieldName)
}

function isGeneralId(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    validateRuleAuthoringId(value, "id")
    return true
  } catch {
    return false
  }
}

function isSourceSelectionId(value: unknown): value is string {
  return typeof value === "string" && (SELECTED_ID.test(value) || SOURCE_ID.test(value))
}

function isChunkId(value: unknown): value is string {
  return typeof value === "string" && CHUNK_ID.test(value)
}

function requireLogicalName(value: unknown): string {
  if (
    typeof value !== "string" || !value || value.trim() !== value ||
    value.includes("/") || value.includes("\\") || CONTROL_CHARACTER.test(value) ||
    Buffer.byteLength(value, "utf8") > 255
  ) {
    throw new Error("Logical source name is invalid")
  }
  return value
}

function requireAbsolutePath(value: unknown): string {
  if (typeof value !== "string" || !path.isAbsolute(value) || CONTROL_CHARACTER.test(value) || Buffer.byteLength(value, "utf8") > 4096) {
    throw new Error("Local source path is invalid")
  }
  return path.resolve(value)
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

function requiresExclusionApproval(status: string): boolean {
  return status !== "success" && status !== "selected"
}

function safeWarningCode(value: unknown): string | undefined {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= 128 && SAFE_WARNING_CODE.test(value)
    ? value
    : undefined
}

function uniqueLogicalNames(values: readonly unknown[]): string[] {
  return [...new Set(values.map(requireLogicalName))].sort(compareText)
}

function remoteSafeLogicalNames(values: readonly unknown[]): string[] {
  return uniqueLogicalNames(values).map((value) => sanitizeRemoteSafeText(value, 255))
}

function safeNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function cloneSourceModel(source: RuleAuthoringGuiSourceModel): RuleAuthoringGuiSourceModel {
  return {
    sourceId: source.sourceId,
    logicalName: sanitizeRemoteSafeText(source.logicalName, 255),
    mediaType: sanitizeRemoteSafeText(source.mediaType, 32),
    byteSize: source.byteSize,
    extractionStatus: sanitizeRemoteSafeText(source.extractionStatus, 64),
    warnings: source.warnings.map((warning) => sanitizeRemoteSafeText(warning, 128))
  }
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

function samePayloadSummary(
  displayed: PayloadSummary,
  canonical: { logicalNames: string[]; selectedChunkCount: number; utf8Bytes: number }
): boolean {
  return JSON.stringify(displayed.logicalNames) === JSON.stringify(canonical.logicalNames) &&
    displayed.selectedChunkCount === canonical.selectedChunkCount &&
    displayed.utf8Bytes === canonical.utf8Bytes
}
