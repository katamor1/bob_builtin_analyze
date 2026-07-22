import * as fs from "node:fs/promises"
import * as path from "node:path"
import { randomBytes } from "node:crypto"
import * as vscode from "vscode"
import { discoverReviewInputCandidates, type ReviewInputDocumentCandidate } from "../core/reviewInputDiscovery"
import {
  CHANGE_TYPE_VALUES,
  REVIEW_FOCUS_VALUES,
  type ChangeType,
  type ReviewFocus,
  type ReviewInputDraft,
  type VcsKind,
  VCS_VALUES,
  writeReviewInputFromDraft
} from "../core/reviewInputBuilder"
import { resolveWorkspacePathStrict } from "../core/fileSystem"
import { DEFAULT_TRACEABILITY_CATALOG_PATH, DEFAULT_TRACEABILITY_GATE_REPORT_PATH, readTraceabilityCatalog, validateAndWriteTraceabilityGateReport } from "../core/traceabilityCatalogStore"
import type { TraceabilityCatalog, TraceabilityStatus } from "../core/traceabilityCatalog"
import { getCodeConsistencyWorkspaceInitializationStatus } from "../workspaceInitializer"
import { resolveBobWorkspaceRoot } from "../workspaceResolver"
import { createConsistencyHumanTriageStage } from "./consistencyHumanTriage"
import { createConsistencyResultCaptureStage } from "./consistencyResultCapture"
import { renderConsistencyReviewWizardHtml, type ConsistencyReviewWizardModel, type ConsistencyWizardPackageFile } from "./consistencyReviewWizardHtml"
import type {
  ConsistencyReviewStage,
  ConsistencyReviewStageFactory,
  ConsistencyReviewStageHost,
  ConsistencyReviewStageRequest,
  ConsistencyReviewStageService,
  ConsistencyStageOutcome
} from "./consistencyReviewWizardStages"
import { createTraceabilityPrepStage } from "./traceabilityPrepWebview"

type ConsistencyWizardAction =
  | "initializeWorkspace"
  | "createReviewInput"
  | "openTraceabilityPrep"
  | "createReviewInputFromTraceability"
  | "validateTraceability"
  | "preprocess"
  | "openResultCapture"
  | "openHumanTriage"

interface ConsistencyWizardMessage {
  type: "consistencyWizard.action"
  action: ConsistencyWizardAction
  draft?: Record<string, unknown>
}

export interface OpenConsistencyReviewWizardOptions {
  initialStage?: ConsistencyReviewStage
  workspaceRoot?: string
  catalogPath?: string
  reportPath?: string
  textEncoding?: string
}

export interface ConsistencyReviewWizardControllerDependencies {
  resolveWorkspaceRoot?: () => Promise<string>
  loadReviewModel?: (warnings: string[], options?: LoadReviewModelOptions) => Promise<ConsistencyReviewWizardModel>
  renderReviewHtml?: typeof renderConsistencyReviewWizardHtml
  createStageService?: ConsistencyReviewStageFactory
  createRenderToken?: () => string
}

interface LoadReviewModelOptions {
  skipTraceabilityIo?: boolean
  traceabilityErrorCount?: number
}

interface ActiveStageService {
  generation: number
  service: ConsistencyReviewStageService
  ready: boolean
}

interface ReviewOperationLease {
  stageGeneration: number
  operationGeneration: number
}

export async function openConsistencyReviewWizard(
  context: vscode.ExtensionContext,
  options: OpenConsistencyReviewWizardOptions = {}
): Promise<ConsistencyStageOutcome> {
  const panel = vscode.window.createWebviewPanel("bobCodeConsistencyReviewWizard", "整合プレレビューを開始", vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true
  })
  const controller = new ConsistencyReviewWizardController(context, panel)
  return controller.initialize(options)
}

export class ConsistencyReviewWizardController {
  private workspaceRoot = ""
  private documents: ReviewInputDocumentCandidate[] = []
  private model?: ConsistencyReviewWizardModel
  private stage: ConsistencyReviewStage = "review"
  private stageGeneration = 0
  private operationGeneration = 0
  private activeStageService?: ActiveStageService
  private renderToken = ""
  private disposed = false
  private initializingWorkspace = false
  private openingOptions: OpenConsistencyReviewWizardOptions = {}
  private readonly reportedFailures = new Set<number>()
  private readonly dependencies: Required<ConsistencyReviewWizardControllerDependencies>

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    dependencies: ConsistencyReviewWizardControllerDependencies = {}
  ) {
    this.dependencies = {
      resolveWorkspaceRoot: dependencies.resolveWorkspaceRoot ?? requireWorkspaceRoot,
      loadReviewModel: dependencies.loadReviewModel ?? ((warnings, options) => this.buildModel(warnings, options)),
      renderReviewHtml: dependencies.renderReviewHtml ?? renderConsistencyReviewWizardHtml,
      createStageService: dependencies.createStageService ?? ((stage, host, request) => {
        if (stage === "traceability") return createTraceabilityPrepStage(host, request)
        if (stage === "review-result-capture") return createConsistencyResultCaptureStage(host)
        return createConsistencyHumanTriageStage(host)
      }),
      createRenderToken: dependencies.createRenderToken ?? randomRenderToken
    }
    this.context.subscriptions.push(
      this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message)),
      this.panel.onDidDispose(() => this.dispose())
    )
  }

  async initialize(options: OpenConsistencyReviewWizardOptions = {}): Promise<ConsistencyStageOutcome> {
    this.openingOptions = options
    const workspaceRoot = options.workspaceRoot ?? await this.dependencies.resolveWorkspaceRoot()
    if (this.disposed) return { status: "error", errors: ["panel was disposed"] }
    this.workspaceRoot = workspaceRoot
    return this.showStage(options.initialStage ?? "review")
  }

  private async handleMessage(rawMessage: unknown): Promise<void> {
    let lease: ReviewOperationLease | undefined
    try {
      if (!this.isOwnedMessage(rawMessage)) return
      const navigation = parseNavigationMessage(rawMessage)
      if (navigation) {
        if (navigation.fromStage === this.stage) await this.navigateToStage(navigation.stage)
        return
      }
      if (this.stage !== "review") {
        if (this.activeStageService?.ready && isMessageForStage(rawMessage, this.stage)) {
          await this.activeStageService.service.handleMessage(rawMessage)
        }
        return
      }
      const message = parseConsistencyWizardMessage(rawMessage)
      if (!message) {
        await this.post({ error: true, message: "不正な画面操作を拒否しました。" })
        return
      }
      if (message.action === "initializeWorkspace") {
        if (this.initializingWorkspace) {
          await this.post({ message: "初期化を実行中です。" })
          return
        }
        lease = this.beginReviewOperation()
        await this.initializeWorkspace(lease)
        return
      }
      lease = this.beginReviewOperation()
      if (message.action === "createReviewInput") {
        const resultMessage = await this.createReviewInput(message.draft ?? {})
        if (this.isCurrentReviewLease(lease)) await this.postForReview(lease, { ok: true, message: resultMessage })
      } else if (message.action === "openTraceabilityPrep") {
        await this.navigateToStage("traceability")
      } else if (message.action === "createReviewInputFromTraceability") {
        await vscode.commands.executeCommand("bobCodeConsistency.createReviewInputFromTraceability", { workspaceRoot: this.workspaceRoot })
      } else if (message.action === "validateTraceability") {
        await vscode.commands.executeCommand("bobCodeConsistency.validateTraceabilityCatalog", { workspaceRoot: this.workspaceRoot })
      } else if (message.action === "preprocess") {
        await vscode.commands.executeCommand("bobCodeConsistency.preprocess", { workspaceRoot: this.workspaceRoot })
        const model = await this.dependencies.loadReviewModel(["Bob に渡すレビュー資料を更新しました。"])
        if (!this.isCurrentReviewLease(lease)) return
        this.model = model
        this.renderReview(lease.stageGeneration)
      } else if (message.action === "openResultCapture") {
        await this.navigateToStage("review-result-capture")
      } else if (message.action === "openHumanTriage") {
        await this.navigateToStage("triage")
      }
      if (this.isCurrentReviewLease(lease)) {
        await this.postForReview(lease, { ok: true, message: "操作が完了しました。次の画面を確認してください。" })
      }
    } catch (error) {
      if (lease && this.isCurrentReviewLease(lease)) {
        await this.postForReview(lease, { error: true, message: error instanceof Error ? error.message : String(error) })
      } else if (this.stage !== "review") {
        this.reportFailure(this.stageGeneration, error)
      }
    }
  }

  async showStage(stage: ConsistencyReviewStage): Promise<ConsistencyStageOutcome> {
    if (this.disposed) return { status: "error", errors: ["panel was disposed"] }
    const generation = ++this.stageGeneration
    this.operationGeneration += 1
    this.stage = stage
    this.activeStageService = undefined
    if (stage === "review") {
      let model: ConsistencyReviewWizardModel
      try {
        model = await this.dependencies.loadReviewModel([])
      } catch (error) {
        return { status: "error", errors: [error instanceof Error ? error.message : String(error)] }
      }
      if (!this.isCurrentStage("review", generation)) return { status: "error", errors: ["stage is no longer active"] }
      this.model = model
      if (!this.renderReview(generation)) return { status: "error", errors: ["review stage could not be rendered"] }
      return { status: "ok" }
    }

    const request = this.stageRequest()
    const host = this.createStageHost(stage, generation)
    let active: ActiveStageService | undefined
    let outcome: ConsistencyStageOutcome
    try {
      const service = this.dependencies.createStageService(stage, host, request)
      active = { generation, service, ready: false }
      this.activeStageService = active
      outcome = await service.initialize()
    } catch (error) {
      outcome = { status: "error", errors: [error instanceof Error ? error.message : String(error)] }
    }
    if (!this.isCurrentStage(stage, generation) || (active && this.activeStageService !== active)) {
      return { status: "error", errors: ["stage is no longer active"] }
    }
    if (outcome.status === "error") {
      await this.restoreReviewAfterStageFailure(stage, generation, outcome.errors)
      return outcome
    }
    if (!active) return { status: "error", errors: ["stage service was not created"] }
    active.ready = true
    return outcome
  }

  private async navigateToStage(stage: ConsistencyReviewStage): Promise<ConsistencyStageOutcome> {
    const outcome = await this.showStage(stage)
    if (outcome.status === "error" && !outcome.errors.includes("stage is no longer active")) {
      this.reportFailure(this.stageGeneration, new Error(outcome.errors.join("; ")))
    }
    return outcome
  }

  private async restoreReviewAfterStageFailure(
    failedStage: Exclude<ConsistencyReviewStage, "review">,
    generation: number,
    errors: string[]
  ): Promise<void> {
    if (!this.isCurrentStage(failedStage, generation)) return
    this.stage = "review"
    this.activeStageService = undefined
    if (!this.model) {
      try {
        const model = await this.dependencies.loadReviewModel(errors, failedStage === "traceability"
          ? { skipTraceabilityIo: true, traceabilityErrorCount: errors.length }
          : undefined)
        if (!this.isCurrentStage("review", generation)) return
        this.model = model
      } catch {
        return
      }
    }
    this.renderReview(generation)
  }

  private createStageHost(
    stage: Exclude<ConsistencyReviewStage, "review">,
    generation: number
  ): ConsistencyReviewStageHost {
    return {
      cspSource: this.panel.webview.cspSource,
      stage,
      isActive: () => this.isCurrentStage(stage, generation),
      nextRenderToken: () => {
        if (!this.isCurrentStage(stage, generation)) return ""
        this.renderToken = this.dependencies.createRenderToken()
        return this.renderToken
      },
      render: (html) => this.renderForGeneration(generation, html),
      post: (message) => this.postForStage(stage, generation, message),
      getWorkspaceRoot: () => this.isCurrentStage(stage, generation) ? this.workspaceRoot : undefined,
      showStage: (nextStage) => this.isCurrentStage(stage, generation)
        ? this.navigateToStage(nextStage)
        : Promise.resolve({ status: "error", errors: ["stage is no longer active"] })
    }
  }

  private stageRequest(): ConsistencyReviewStageRequest {
    const config = vscode.workspace.getConfiguration("bobCodeConsistency")
    return {
      workspaceRoot: this.workspaceRoot,
      catalogPath: this.openingOptions.catalogPath ?? config.get<string>("traceabilityCatalogPath", DEFAULT_TRACEABILITY_CATALOG_PATH),
      reportPath: this.openingOptions.reportPath ?? config.get<string>("traceabilityGateReportPath", DEFAULT_TRACEABILITY_GATE_REPORT_PATH),
      textEncoding: this.openingOptions.textEncoding ?? config.get<string>("textEncoding", "auto")
    }
  }

  private renderReview(generation: number): boolean {
    if (!this.model || !this.isCurrentStage("review", generation)) return false
    this.renderToken = this.dependencies.createRenderToken()
    return this.renderForGeneration(generation, this.dependencies.renderReviewHtml({
      cspSource: this.panel.webview.cspSource,
      nonce: nonce(),
      renderToken: this.renderToken,
      model: this.model
    }))
  }

  private renderForGeneration(generation: number, html: string): boolean {
    if (this.disposed || generation !== this.stageGeneration) return false
    try {
      this.panel.webview.html = html
      return true
    } catch (error) {
      return false
    }
  }

  private async postForStage(
    stage: Exclude<ConsistencyReviewStage, "review">,
    generation: number,
    message: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.isCurrentStage(stage, generation)) return false
    return this.post(message, () => this.isCurrentStage(stage, generation), generation)
  }

  private postForReview(lease: ReviewOperationLease, message: Record<string, unknown>): Promise<boolean> {
    return this.post(message, () => this.isCurrentReviewLease(lease), lease.stageGeneration)
  }

  private async post(
    message: Record<string, unknown>,
    isCurrent: () => boolean = () => !this.disposed,
    generation = this.stageGeneration
  ): Promise<boolean> {
    if (!isCurrent()) return false
    try {
      const posted = await this.panel.webview.postMessage(message)
      return posted !== false && isCurrent()
    } catch (error) {
      if (isCurrent()) this.reportFailure(generation, error)
      return false
    }
  }

  private reportFailure(generation: number, error: unknown): void {
    if (this.disposed || this.reportedFailures.has(generation)) return
    this.reportedFailures.add(generation)
    const message = error instanceof Error ? error.message : String(error)
    void Promise.resolve(vscode.window.showErrorMessage(`Code Consistency Review GUI: ${message}`)).catch(() => undefined)
  }

  private isOwnedMessage(message: unknown): boolean {
    return Boolean(message && typeof message === "object" &&
      (message as { renderToken?: unknown }).renderToken === this.renderToken)
  }

  private isCurrentStage(stage: ConsistencyReviewStage, generation: number): boolean {
    return !this.disposed && this.stage === stage && this.stageGeneration === generation
  }

  private beginReviewOperation(): ReviewOperationLease {
    return { stageGeneration: this.stageGeneration, operationGeneration: ++this.operationGeneration }
  }

  private isCurrentReviewLease(lease: ReviewOperationLease): boolean {
    return this.isCurrentStage("review", lease.stageGeneration) && this.operationGeneration === lease.operationGeneration
  }

  private dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stageGeneration += 1
    this.operationGeneration += 1
    this.activeStageService = undefined
  }

  private async buildModel(
    extraWarnings: string[],
    options: LoadReviewModelOptions = {}
  ): Promise<ConsistencyReviewWizardModel> {
    const config = vscode.workspace.getConfiguration("bobCodeConsistency")
    const textEncoding = config.get<string>("textEncoding", "auto")
    const discovery = await discoverReviewInputCandidates(this.workspaceRoot, { textEncoding })
    this.documents = discovery.documents
    const traceability = options.skipTraceabilityIo
      ? {
          proposed: 0,
          accepted: 0,
          rejected: 0,
          deprecated: 0,
          errors: options.traceabilityErrorCount ?? 1,
          warnings: 0
        }
      : await traceabilitySummary({
          workspaceRoot: this.workspaceRoot,
          catalogPath: config.get<string>("traceabilityCatalogPath", DEFAULT_TRACEABILITY_CATALOG_PATH),
          reportPath: config.get<string>("traceabilityGateReportPath", DEFAULT_TRACEABILITY_GATE_REPORT_PATH),
          textEncoding
        })
    const warnings = [...discovery.warnings, ...extraWarnings]
    const initialization = await getCodeConsistencyWorkspaceInitializationStatus(this.workspaceRoot)
    return {
      workspaceRoot: this.workspaceRoot,
      base: "HEAD~1",
      head: "HEAD",
      vcs: "git",
      changeType: "maintenance",
      focus: ["requirement-code-consistency", "design-code-consistency", "test-gap"],
      documents: this.documents,
      traceability,
      packagePreview: await listPackagePreview(this.workspaceRoot, config.get<string>("reviewPackagePath", ".bob-review/review-package")),
      initialization,
      warnings,
      status: {
        tone: warnings.length > 0 ? "warning" : "muted",
        message: warnings.join("\n") || "未実行"
      }
    }
  }

  private async initializeWorkspace(lease: ReviewOperationLease): Promise<void> {
    this.initializingWorkspace = true
    try {
      const result = await vscode.commands.executeCommand(
        "bobCodeConsistency.initializeWorkspace",
        { workspaceRoot: this.workspaceRoot }
      )
      if (!this.isCurrentReviewLease(lease)) return
      const nextModel = await this.dependencies.loadReviewModel([])
      if (!this.isCurrentReviewLease(lease)) return
      nextModel.status = nextModel.initialization.initialized
        ? { tone: "ok", message: initializationSuccessMessage(result) }
        : {
            tone: "warning",
            message: "初期化コマンド完了後もコード整合プレレビュー workflow を確認できませんでした。"
          }
      this.model = nextModel
      this.renderReview(lease.stageGeneration)
    } finally {
      this.initializingWorkspace = false
    }
  }

  private async createReviewInput(rawDraft: Record<string, unknown>): Promise<string> {
    const selectedPaths = stringArray(rawDraft.documentPaths)
    const selectedDocuments = selectedPaths.length > 0
      ? this.documents.filter((candidate) => selectedPaths.includes(candidate.path))
      : this.documents
    if (selectedDocuments.length === 0) throw new Error("関連文書候補を選択してください。")
    const draft: ReviewInputDraft = {
      review: {
        id: stringValue(rawDraft.reviewId) || "code-consistency-review",
        title: stringValue(rawDraft.reviewTitle) || "コード整合プレレビュー",
        purpose: "要求・設計・テスト仕様とコード変更の整合性を確認する",
        change_type: changeTypeValue(rawDraft.changeType),
        vcs: vcsValue(rawDraft.vcs),
        base: stringValue(rawDraft.base) || "HEAD~1",
        head: stringValue(rawDraft.head) || "HEAD"
      },
      artifact_candidates: selectedDocuments.map(stripCandidateUiFields),
      review_focus: focusValues(rawDraft.focus)
    }
    const config = vscode.workspace.getConfiguration("bobCodeConsistency")
    const outputPath = resolveWorkspacePathStrict(this.workspaceRoot, config.get<string>("reviewInputPath", "review-input.yaml"), "reviewInputPath")
    const result = await writeReviewInputFromDraft({
      draft,
      workspaceRoot: this.workspaceRoot,
      outputPath,
      overwrite: true,
      backupExisting: true,
      strictPaths: true
    })
    if (result.status === "error") throw new Error(result.errors.join("; "))
    const document = await vscode.workspace.openTextDocument(result.outputPath)
    await vscode.window.showTextDocument(document, { preview: false })
    return `review-input.yaml を生成しました: ${result.outputPath}`
  }
}

function initializationSuccessMessage(result: unknown): string {
  const fallback = ".bob ワークフローの初期化が完了しました。"
  if (!result || typeof result !== "object") return fallback
  const candidate = result as {
    message?: unknown
    backupPath?: unknown
    reviewInputBackupPath?: unknown
    workflowResult?: unknown
    reviewInputResult?: unknown
  }
  const workflowResult = fileInitializationOutcome(candidate.workflowResult)
  const reviewInputResult = fileInitializationOutcome(candidate.reviewInputResult)
  if (workflowResult && reviewInputResult) {
    return [
      `workflow [${workflowResult.status}]: ${workflowResult.message}`,
      workflowResult.backupPath ? `workflow backup: ${workflowResult.backupPath}` : undefined,
      `review-input [${reviewInputResult.status}]: ${reviewInputResult.message}`,
      reviewInputResult.backupPath ? `review-input backup: ${reviewInputResult.backupPath}` : undefined
    ].filter((line): line is string => Boolean(line)).join("\n")
  }
  const lines: string[] = []
  if (typeof candidate.message === "string" && candidate.message.trim()) {
    lines.push(candidate.message.trim())
  }
  if (typeof candidate.backupPath === "string" && candidate.backupPath.trim()) {
    lines.push(`workflow backup: ${candidate.backupPath.trim()}`)
  }
  if (typeof candidate.reviewInputBackupPath === "string" && candidate.reviewInputBackupPath.trim()) {
    lines.push(`review-input backup: ${candidate.reviewInputBackupPath.trim()}`)
  }
  return lines.join("\n") || fallback
}

function fileInitializationOutcome(value: unknown): {
  status: "created" | "updated" | "unchanged"
  path: string
  backupPath?: string
  message: string
} | undefined {
  if (!value || typeof value !== "object") return undefined
  const candidate = value as Record<string, unknown>
  if (candidate.status !== "created" && candidate.status !== "updated" && candidate.status !== "unchanged") return undefined
  if (typeof candidate.path !== "string" || typeof candidate.message !== "string") return undefined
  if (candidate.backupPath !== undefined && typeof candidate.backupPath !== "string") return undefined
  return {
    status: candidate.status,
    path: candidate.path,
    backupPath: candidate.backupPath,
    message: candidate.message
  }
}

function parseNavigationMessage(message: unknown): {
  type: "consistencyReview.navigate"
  fromStage: ConsistencyReviewStage
  stage: ConsistencyReviewStage
} | undefined {
  if (!message || typeof message !== "object") return undefined
  const candidate = message as Record<string, unknown>
  const fromStage = parseConsistencyReviewStage(candidate.fromStage)
  const stage = parseConsistencyReviewStage(candidate.stage)
  if (candidate.type !== "consistencyReview.navigate" || !fromStage || !stage) return undefined
  return { type: "consistencyReview.navigate", fromStage, stage }
}

function parseConsistencyReviewStage(value: unknown): ConsistencyReviewStage | undefined {
  if (value === "review" || value === "traceability" || value === "review-result-capture" || value === "triage") return value
  return undefined
}

function isMessageForStage(message: unknown, stage: Exclude<ConsistencyReviewStage, "review">): boolean {
  if (!message || typeof message !== "object") return false
  const type = (message as Record<string, unknown>).type
  if (stage === "traceability") {
    return type === "ready" || type === "action" || type === "save" || type === "restoreOriginalCatalog"
  }
  if (stage === "review-result-capture") return type === "consistencyResultCapture.action"
  return type === "consistencyHumanTriage.action"
}

function parseConsistencyWizardMessage(message: unknown): ConsistencyWizardMessage | undefined {
  if (!message || typeof message !== "object") return undefined
  const candidate = message as Partial<Record<keyof ConsistencyWizardMessage, unknown>>
  if (candidate.type !== "consistencyWizard.action") return undefined
  if (!isConsistencyWizardAction(candidate.action)) return undefined
  return {
    type: "consistencyWizard.action",
    action: candidate.action,
    draft: candidate.draft && typeof candidate.draft === "object" ? candidate.draft as Record<string, unknown> : undefined
  }
}

async function requireWorkspaceRoot(): Promise<string> {
  const root = await resolveBobWorkspaceRoot({ allowPick: true, title: "コード整合プレレビューのワークスペースを選択" })
  if (!root) throw new Error("先にワークスペースフォルダーを開いてください。")
  return root
}

async function traceabilitySummary(input: {
  workspaceRoot: string
  catalogPath: string
  reportPath: string
  textEncoding: string
}): Promise<ConsistencyReviewWizardModel["traceability"]> {
  const read = await readTraceabilityCatalog(input)
  if (read.status === "error") return { proposed: 0, accepted: 0, rejected: 0, deprecated: 0, errors: read.errors.length, warnings: 0 }
  const gate = await validateAndWriteTraceabilityGateReport({ ...input, expectedRevision: read.revision })
  const counts = countStatuses(read.catalog)
  return {
    ...counts,
    errors: gate.status === "ok" ? gate.report.errors.length : gate.errors.length,
    warnings: gate.status === "ok" ? gate.report.warnings.length : 0
  }
}

function countStatuses(catalog: TraceabilityCatalog): Record<TraceabilityStatus, number> {
  const counts: Record<TraceabilityStatus, number> = { proposed: 0, accepted: 0, rejected: 0, deprecated: 0 }
  for (const item of [...(catalog.domains ?? []), ...(catalog.items ?? []), ...(catalog.links ?? []), ...(catalog.decisions ?? [])]) {
    if (isTraceabilityStatus(item.status)) counts[item.status] += 1
  }
  return counts
}

function isTraceabilityStatus(value: unknown): value is TraceabilityStatus {
  return value === "proposed" || value === "accepted" || value === "rejected" || value === "deprecated"
}

async function listPackagePreview(workspaceRoot: string, packageDir: string): Promise<ConsistencyWizardPackageFile[]> {
  const root = resolveWorkspacePathStrict(workspaceRoot, packageDir, "reviewPackagePath")
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => ({
        label: entry.name,
        path: path.relative(workspaceRoot, path.join(root, entry.name)).replace(/\\/g, "/")
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, 20)
  } catch {
    return []
  }
}

function stripCandidateUiFields(candidate: ReviewInputDocumentCandidate) {
  const { label: _label, description: _description, ...artifact } = candidate
  return artifact
}

function isConsistencyWizardAction(value: unknown): value is ConsistencyWizardAction {
  return value === "initializeWorkspace" ||
    value === "createReviewInput" ||
    value === "openTraceabilityPrep" ||
    value === "createReviewInputFromTraceability" ||
    value === "validateTraceability" ||
    value === "preprocess" ||
    value === "openResultCapture" ||
    value === "openHumanTriage"
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item)) : []
}

function vcsValue(value: unknown): VcsKind {
  const text = stringValue(value)
  return text && (VCS_VALUES as readonly string[]).includes(text) ? text as VcsKind : "git"
}

function changeTypeValue(value: unknown): ChangeType {
  const text = stringValue(value)
  return text && (CHANGE_TYPE_VALUES as readonly string[]).includes(text) ? text as ChangeType : "maintenance"
}

function focusValues(value: unknown): ReviewFocus[] {
  const values = stringArray(value).filter((item): item is ReviewFocus => (REVIEW_FOCUS_VALUES as readonly string[]).includes(item))
  return values.length > 0 ? values : ["requirement-code-consistency", "design-code-consistency", "test-gap"]
}

function nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let value = ""
  for (let index = 0; index < 32; index += 1) value += chars.charAt(Math.floor(Math.random() * chars.length))
  return value
}

function randomRenderToken(): string {
  return randomBytes(24).toString("hex")
}
