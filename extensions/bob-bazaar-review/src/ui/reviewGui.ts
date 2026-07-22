import { randomBytes } from "node:crypto"
import * as vscode from "vscode"
import { BazaarClient } from "../bazaar/bazaar"
import { clampMaxAddedFileContentBytes, clampMaxDiffBytes, maxBufferForDiffBytes } from "../bazaar/reviewLimits"
import { buildReviewPacket } from "../bazaar/reviewPacket"
import { buildReviewPacketState, REVIEW_PACKET_STATE_KEY } from "../bazaar/reviewPacketSelection"
import { resolveBzrPath } from "../bazaar/bzrPathTrust"
import {
  buildTargetMetadataSection,
  parseTargetRequest,
  prepareTarget,
  validateTargetRequest,
  type TargetRequest
} from "../bazaar/reviewTarget"
import { isBobCodeExtensionAvailable } from "../bob/bobCodeExtension"
import { addMarkdownPacketToBobContext } from "../bob/bobContext"
import { buildProjectRulesSectionFromBundle } from "../projectRules/packet"
import {
  loadProjectRuleBundle,
  PROJECT_RULE_BUNDLE_LIMITS
} from "../ruleAuthoring/ruleBundle"
import {
  buildReviewRunMetadataSection,
  loadReviewRun,
  recordReviewPacket,
  startReviewRun,
  validateReviewRunCommandInput
} from "../reviewRuns/reviewRunCoordinator"
import {
  listLegacyReviewCandidates,
  previewLegacyReviewRecovery,
  recoverLegacyReviewRun
} from "../reviewRuns/reviewRunRecovery"
import { buildReviewRunResumeCandidate, nextReviewRunAction } from "../reviewRuns/reviewRunResume"
import { buildReviewId } from "../reviewRuns/reviewRunState"
import { listReviewRuns } from "../reviewRuns/reviewRunStore"
import type { ReviewRunCommandInput, ReviewRunContext } from "../reviewRuns/reviewRunTypes"
import { getBobWorkspaceStatus, initializeBobWorkspaceFromTemplates } from "../workspace/bobWorkspaceInit"
import { resolveBazaarWorkspaceFolder, resolveBobWorkspaceFolder } from "../workspace/workspaceResolver"
import { completeCurrentWorkflowStepAfterGuiAction } from "../workflow/workflowStepCompletion"
import { nextReviewActionLabel } from "./displayLabels"
import { createBazaarReviewResultsStage } from "./campaignDashboardGui"
import { createBazaarHumanTriageStage } from "./humanTriageGui"
import { createBazaarResultCaptureStage } from "./resultCaptureGui"
import { renderHtml } from "./reviewGuiHtml"
import type {
  BazaarReviewStage,
  BazaarReviewStageFactory,
  BazaarReviewStageHost,
  BazaarReviewStageRequest,
  BazaarReviewStageService
} from "./reviewGuiStages"
import type { BazaarReviewInitialTarget } from "./reviewGuiTypes"

const DEFAULT_CAMPAIGN_ID = "phase1-bazaar-review-uat-001"

interface ReviewRunSelection {
  campaignId: string
  reviewId?: string
}

export interface BazaarReviewGuiControllerDependencies {
  renderReviewHtml?: typeof renderHtml
  createStageService?: BazaarReviewStageFactory
  initialReviewRun?: ReviewRunContext
  validateReviewRunCommandInput?: typeof validateReviewRunCommandInput
  loadReviewRun?: typeof loadReviewRun
  nextReviewRunAction?: typeof nextReviewRunAction
  createRenderToken?: () => string
}

interface ActiveStageService {
  generation: number
  service: BazaarReviewStageService
  ready: boolean
}

interface ReviewOperationLease {
  stageGeneration: number
  operationGeneration: number
}

export function openBazaarReviewGui(context: vscode.ExtensionContext, initialTarget?: BazaarReviewInitialTarget): void {
  const panel = vscode.window.createWebviewPanel("bobBazaarReviewGui", "Bazaar レビューを開始", vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true
  })
  const controller = new BazaarReviewGuiController(context, panel, initialTarget)
  controller.initialize()
}

export class BazaarReviewGuiController {
  private bazaarWorkspaceFolder?: vscode.WorkspaceFolder
  private bobWorkspaceFolder?: vscode.WorkspaceFolder
  private activeReviewRun?: ReviewRunContext
  private activeStageService?: ActiveStageService
  private stage: BazaarReviewStage = "review"
  private stageGeneration = 0
  private reviewOperationGeneration = 0
  private disposed = false
  private reviewTransportErrorGeneration?: number
  private renderToken = ""
  private readonly reportedStageFailures = new Set<number>()
  private readonly dependencies: Required<Omit<BazaarReviewGuiControllerDependencies, "initialReviewRun">>

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    private readonly initialTarget?: BazaarReviewInitialTarget,
    dependencies: BazaarReviewGuiControllerDependencies = {}
  ) {
    this.activeReviewRun = dependencies.initialReviewRun
    this.dependencies = {
      renderReviewHtml: dependencies.renderReviewHtml ?? renderHtml,
      createStageService: dependencies.createStageService ?? ((stage, host, request) => {
        if (stage === "review-result-capture") return createBazaarResultCaptureStage(host)
        if (stage === "triage") return createBazaarHumanTriageStage(this.context, host)
        return createBazaarReviewResultsStage(host, request)
      }),
      validateReviewRunCommandInput: dependencies.validateReviewRunCommandInput ?? validateReviewRunCommandInput,
      loadReviewRun: dependencies.loadReviewRun ?? loadReviewRun,
      nextReviewRunAction: dependencies.nextReviewRunAction ?? nextReviewRunAction,
      createRenderToken: dependencies.createRenderToken ?? (() => randomRenderToken())
    }
  }

  initialize(): void {
    this.renderToken = this.dependencies.createRenderToken()
    this.panel.webview.html = this.dependencies.renderReviewHtml(this.panel.webview.cspSource, this.initialTarget, this.renderToken)
    this.context.subscriptions.push(
      this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message)),
      this.panel.onDidDispose(() => this.dispose())
    )
  }

  private async handleMessage(message: any): Promise<void> {
    let reviewLease: ReviewOperationLease | undefined
    try {
      if (!this.isOwnedMessage(message)) return
      if (message?.type === "bazaarReview.navigate") {
        const stage = parseBazaarReviewStage(message?.stage)
        if (stage && message?.fromStage === this.stage) await this.showStage(stage)
      } else if (this.stage !== "review") {
        if (this.activeStageService?.ready && isMessageForStage(message, this.stage)) {
          await this.activeStageService.service.handleMessage(message)
        }
      } else if (message?.type === "openResultCapture") {
        await this.showStage("review-result-capture")
      } else if (message?.type === "openHumanTriage") {
        await this.showStage("triage")
      } else if (message?.type === "openCampaignDashboard") {
        await this.showStage("review-results", { campaignId: textOrUndefined(message?.campaignId) })
      } else if (message?.type === "ready") {
        reviewLease = this.beginReviewOperation()
        await this.postWorkspaceState(reviewLease)
        await this.postReviewRuns(reviewLease)
      } else if (message?.type === "selectWorkspace") {
        reviewLease = this.beginReviewOperation()
        await this.selectWorkspace(reviewLease)
      } else if (message?.type === "initializeBobWorkspace") {
        reviewLease = this.beginReviewOperation()
        await this.initializeBobWorkspace(reviewLease)
      } else if (message?.type === "loadTarget") {
        reviewLease = this.beginReviewOperation()
        await this.loadTarget(parseTargetRequest(message), reviewLease)
      } else if (message?.type === "reviewTarget") {
        reviewLease = this.beginReviewOperation()
        await this.reviewTarget(
          parseTargetRequest(message),
          parseReviewRunSelection(message),
          reviewLease
        )
      } else if (message?.type === "refreshReviewRuns") {
        reviewLease = this.beginReviewOperation()
        await this.postReviewRuns(reviewLease)
      } else if (message?.type === "resumeReviewRun") {
        reviewLease = this.beginReviewOperation()
        await this.resumeReviewRun(message, reviewLease)
      } else if (message?.type === "recoverLegacyReview") {
        reviewLease = this.beginReviewOperation()
        await this.recoverLegacyReview(reviewLease)
      }
    } catch (error: any) {
      if (reviewLease) {
        if (this.isCurrentReviewLease(reviewLease)) {
          await this.postForReview(reviewLease, { type: "error", message: error?.message ?? String(error) })
        }
      } else if (this.stage === "review") {
        await this.post({ type: "error", message: error?.message ?? String(error) })
      } else {
        this.reportStageFailure(this.stageGeneration, error)
      }
    }
  }

  async showStage(stage: BazaarReviewStage, request: BazaarReviewStageRequest = {}): Promise<boolean> {
    if (this.disposed) return false
    const generation = ++this.stageGeneration
    this.renderToken = this.dependencies.createRenderToken()
    this.stage = stage
    this.activeStageService = undefined
    if (stage === "review") {
      return this.renderForGeneration(
        generation,
        this.dependencies.renderReviewHtml(this.panel.webview.cspSource, this.initialTarget, this.renderToken)
      )
    }

    const host = this.createStageHost(stage, generation)
    const service = this.dependencies.createStageService(stage, host, request)
    const activeService: ActiveStageService = { generation, service, ready: false }
    this.activeStageService = activeService
    try {
      await service.initialize()
    } catch (error) {
      this.reportStageFailure(generation, error)
      return false
    }
    if (this.isCurrentStage(stage, generation) && this.activeStageService === activeService) {
      activeService.ready = true
    }
    return this.isCurrentStage(stage, generation)
  }

  private createStageHost(stage: Exclude<BazaarReviewStage, "review">, generation: number): BazaarReviewStageHost {
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
      getActiveReviewRun: () => this.isCurrentStage(stage, generation) ? this.activeReviewRun : undefined,
      commitActiveReviewRun: (expected, next) => {
        if (!this.isCurrentStage(stage, generation)) return false
        if (this.activeReviewRun !== expected) return false
        if (!expected || !sameReviewRunIdentity(expected, next)) return false
        this.activeReviewRun = next
        return true
      },
      getWorkspaceRoot: () => this.isCurrentStage(stage, generation)
        ? this.activeReviewRun?.workspaceRoot ?? this.bobWorkspaceFolder?.uri.fsPath ?? this.bazaarWorkspaceFolder?.uri.fsPath
        : undefined,
      showStage: async (nextStage) => {
        if (!this.isCurrentStage(stage, generation)) return false
        return this.showStage(nextStage)
      }
    }
  }

  private renderForGeneration(generation: number, html: string): boolean {
    if (this.disposed || generation !== this.stageGeneration) return false
    try {
      this.panel.webview.html = html
      return true
    } catch (error) {
      this.reportStageFailure(generation, error)
      return false
    }
  }

  private async postForStage(
    stage: Exclude<BazaarReviewStage, "review">,
    generation: number,
    message: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.isCurrentStage(stage, generation)) return false
    try {
      const posted = await this.panel.webview.postMessage(message)
      return posted !== false && this.isCurrentStage(stage, generation)
    } catch (error) {
      if (this.isCurrentStage(stage, generation)) this.reportStageFailure(generation, error)
      return false
    }
  }

  private reportStageFailure(generation: number, error: unknown): void {
    if (this.reportedStageFailures.has(generation)) return
    this.reportedStageFailures.add(generation)
    const message = error instanceof Error ? error.message : String(error)
    void Promise.resolve(vscode.window.showErrorMessage(`Bazaar Review GUI: ${message}`)).catch(() => undefined)
  }

  private isCurrentStage(stage: BazaarReviewStage, generation: number): boolean {
    return !this.disposed && this.stage === stage && this.stageGeneration === generation
  }

  private isOwnedMessage(message: unknown): boolean {
    return Boolean(message && typeof message === "object" &&
      (message as { renderToken?: unknown }).renderToken === this.renderToken)
  }

  private isCurrentReviewOperation(stageGeneration: number, operationGeneration: number): boolean {
    return this.isCurrentStage("review", stageGeneration) && this.reviewOperationGeneration === operationGeneration
  }

  private isCurrentReviewLease(lease: ReviewOperationLease): boolean {
    return this.isCurrentReviewOperation(lease.stageGeneration, lease.operationGeneration)
  }

  private beginReviewOperation(): ReviewOperationLease {
    return {
      stageGeneration: this.stageGeneration,
      operationGeneration: ++this.reviewOperationGeneration
    }
  }

  private postForReview(lease: ReviewOperationLease, message: Record<string, unknown>): Promise<boolean> {
    return this.post(message, lease.stageGeneration, lease.operationGeneration)
  }

  private dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stageGeneration += 1
    this.reviewOperationGeneration += 1
    this.activeStageService = undefined
  }

  private async postWorkspaceState(lease: ReviewOperationLease): Promise<void> {
    if (!this.bazaarWorkspaceFolder) {
      const folder = await resolveBazaarWorkspaceFolder({
        explicitRoot: this.initialTarget?.bazaarRoot ?? this.initialTarget?.repositoryRoot,
        workflowRoot: this.initialTarget?.workflowRoot,
        allowPick: false
      })
      if (!this.isCurrentReviewLease(lease)) return
      this.bazaarWorkspaceFolder = folder
    }
    if (!this.bobWorkspaceFolder) {
      const folder = await resolveBobWorkspaceFolder({
        workflowRoot: this.initialTarget?.workflowRoot,
        allowPick: false
      })
      if (!this.isCurrentReviewLease(lease)) return
      this.bobWorkspaceFolder = folder
    }
    await this.postForReview(lease, {
      type: "workspaceState",
      workspace: this.bazaarWorkspaceFolder?.uri.fsPath,
      bobWorkspace: this.bobWorkspaceFolder?.uri.fsPath
    })
    await this.postBobWorkspaceStatus(lease)
  }

  private async postBobWorkspaceStatus(lease: ReviewOperationLease): Promise<void> {
    if (!this.bobWorkspaceFolder) {
      await this.postForReview(lease, {
        type: "bobWorkspaceStatus",
        initialized: false,
        missing: ["Bob ワークスペース未選択"],
        present: []
      })
      return
    }
    const serverName = vscode.workspace.getConfiguration("bobBazaar").get<string>("mcpServerName", "bazaar")
    const status = await getBobWorkspaceStatus(this.bobWorkspaceFolder, serverName)
    await this.postForReview(lease, { type: "bobWorkspaceStatus", ...status })
  }

  private async postReviewRuns(lease: ReviewOperationLease): Promise<void> {
    const folder = this.bobWorkspaceFolder ?? this.bazaarWorkspaceFolder
    if (!folder) {
      await this.postForReview(lease, { type: "reviewRuns", items: [] })
      return
    }
    const items = (await listReviewRuns(folder.uri.fsPath))
      .filter((run) => run.status !== "completed")
      .map(buildReviewRunResumeCandidate)
    await this.postForReview(lease, { type: "reviewRuns", items })
  }

  private async resumeReviewRun(message: any, lease: ReviewOperationLease): Promise<void> {
    const rawInput: ReviewRunCommandInput = {
      workspaceRoot: requiredText(message?.workspaceRoot, "workspaceRoot"),
      campaignId: requiredText(message?.campaignId, "campaignId"),
      reviewId: requiredText(message?.reviewId, "reviewId")
    }
    const input = await this.dependencies.validateReviewRunCommandInput(
      rawInput,
      (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath)
    )
    if (!this.isCurrentReviewLease(lease)) return
    const run = await this.dependencies.loadReviewRun(input)
    if (!this.isCurrentReviewLease(lease)) return
    const action = this.dependencies.nextReviewRunAction(run)
    if (action === "review") {
      const posted = await this.postForReview(lease, {
        type: "resumeTarget",
        target: run.target,
        reviewRun: serializeReviewRun(run)
      })
      if (posted && this.isCurrentReviewLease(lease)) this.activeReviewRun = run
      return
    }
    const posted = await this.postForReview(lease, {
      type: "activeReviewRun",
      reviewRun: serializeReviewRun(run),
      message: `レビュー実行を再開しました。次の操作: ${nextReviewActionLabel(action)}`
    })
    if (!posted || !this.isCurrentReviewLease(lease)) return
    this.activeReviewRun = run
    if (action === "resultCapture") {
      await this.showStage("review-result-capture")
    } else if (action === "humanTriage" || action === "finalize") {
      await this.showStage("triage")
    }
  }

  private async recoverLegacyReview(lease: ReviewOperationLease): Promise<void> {
    const folder = this.bobWorkspaceFolder ?? this.bazaarWorkspaceFolder
    if (!folder) throw new Error("既存成果物を検索するワークスペースが選択されていません。先にワークスペースを選択してください。")
    const candidates = await listLegacyReviewCandidates(folder.uri.fsPath)
    if (!this.isCurrentReviewLease(lease)) return
    if (candidates.length === 0) {
      await vscode.window.showInformationMessage("復旧できる既存のレビュー結果が見つかりませんでした。対象ワークスペースと成果物を確認してください。")
      return
    }
    const selected = await vscode.window.showQuickPick(
      candidates.map((candidate) => ({
        label: candidate.reviewId,
        description: candidate.campaignIds.length > 0 ? candidate.campaignIds.join(", ") : "キャンペーン未特定",
        detail: [candidate.resultJsonPath, ...candidate.issues].join(" · "),
        candidate
      })),
      { title: "復旧する既存レビューを選択" }
    )
    if (!selected || !this.isCurrentReviewLease(lease)) return

    let campaignId: string | undefined
    if (selected.candidate.campaignIds.length === 1) {
      campaignId = selected.candidate.campaignIds[0]
    } else if (selected.candidate.campaignIds.length > 1) {
      const pickedCampaign = await vscode.window.showQuickPick(selected.candidate.campaignIds, {
        title: "レビュー実行を関連付けるキャンペーンを選択"
      })
      if (!pickedCampaign || !this.isCurrentReviewLease(lease)) return
      campaignId = pickedCampaign
    } else {
      campaignId = await vscode.window.showInputBox({
        title: "レビュー実行を関連付けるキャンペーン ID",
        value: DEFAULT_CAMPAIGN_ID,
        validateInput: (value) => value.trim() ? undefined : "キャンペーン ID は必須です。"
      })
      if (!campaignId || !this.isCurrentReviewLease(lease)) return
    }

    const preview = await previewLegacyReviewRecovery(folder.uri.fsPath, selected.candidate, campaignId)
    if (!this.isCurrentReviewLease(lease)) return
    if (preview.blockingIssues.length > 0) {
      throw new Error(`既存成果物からの復旧を実行できません。問題を解消してから再実行してください:\n${preview.blockingIssues.join("\n")}`)
    }
    const artifactLines = Object.entries(preview.artifacts)
      .filter(([, value]) => value)
      .map(([name, value]) => `${name}: ${value}`)
    const confirmation = await vscode.window.showWarningMessage(
      [
        `既存成果物からレビュー実行を復旧します: ${preview.campaignId} / ${preview.reviewId}`,
        "既存成果物は変更せず、review-run.json だけを生成します。",
        ...artifactLines,
        ...preview.warnings.map((warning) => `注意: ${warning}`)
      ].join("\n"),
      { modal: true },
      "復旧する"
    )
    if (confirmation !== "復旧する" || !this.isCurrentReviewLease(lease)) return

    const run = await recoverLegacyReviewRun(preview)
    if (!this.isCurrentReviewLease(lease)) return
    const posted = await this.postForReview(lease, {
      type: "activeReviewRun",
      reviewRun: serializeReviewRun(run),
      message: "既存成果物からレビュー実行を復旧しました。"
    })
    if (!posted || !this.isCurrentReviewLease(lease)) return
    this.activeReviewRun = run
    await this.postReviewRuns(lease)
  }

  private async selectWorkspace(lease: ReviewOperationLease): Promise<void> {
    const folder = await resolveBazaarWorkspaceFolder({
      explicitRoot: this.initialTarget?.bazaarRoot ?? this.initialTarget?.repositoryRoot,
      workflowRoot: this.initialTarget?.workflowRoot,
      allowPick: true,
      title: "Bazaar ワークスペースを選択"
    })
    if (!this.isCurrentReviewLease(lease)) return
    if (!folder) throw new Error("先に Bazaar ワークスペースフォルダーを開いてください。")
    this.bazaarWorkspaceFolder = folder
    if (!this.bobWorkspaceFolder) {
      const bobFolder = await resolveBobWorkspaceFolder({ workflowRoot: this.initialTarget?.workflowRoot, allowPick: false })
      if (!this.isCurrentReviewLease(lease)) return
      this.bobWorkspaceFolder = bobFolder
    }
    await this.postWorkspaceState(lease)
    await this.postReviewRuns(lease)
  }

  private async initializeBobWorkspace(lease: ReviewOperationLease): Promise<void> {
    const folder = await this.requireBobWorkspaceFolder(lease)
    if (!folder || !this.isCurrentReviewLease(lease)) return
    const config = vscode.workspace.getConfiguration("bobBazaar")
    await this.postForReview(lease, { type: "loading", message: ".bob を初期化しています…" })
    const status = await initializeBobWorkspaceFromTemplates({
      context: this.context,
      workspaceFolder: folder,
      allowedRoots: this.bazaarWorkspaceFolder ? [this.bazaarWorkspaceFolder.uri.fsPath] : undefined,
      bzrPath: resolveBzrPath(config, vscode.workspace.isTrusted),
      serverName: config.get<string>("mcpServerName", "bazaar"),
      textEncoding: config.get<string>("textEncoding", "auto")
    })
    if (!this.isCurrentReviewLease(lease)) return
    await this.postForReview(lease, { type: "bobWorkspaceStatus", ...status })
    await this.postForReview(lease, {
      type: "initialized",
      message: ".bob 初期化が完了しました。Bob MCP サーバーを Refresh / Restart してください。"
    })
    await this.postReviewRuns(lease)
  }

  private async loadTarget(request: TargetRequest, lease: ReviewOperationLease): Promise<void> {
    const folder = await this.requireBazaarWorkspaceFolder(lease)
    if (!folder || !this.isCurrentReviewLease(lease)) return
    validateTargetRequest(request)
    await this.postForReview(lease, { type: "loading", message: "対象情報を取得しています…" })
    const prepared = await prepareTarget(makeBazaarClient(), folder.uri.fsPath, request, {
      includeAddedFiles: false,
      maxAddedFileContentBytes: getMaxAddedFileContentBytes()
    })
    if (!this.isCurrentReviewLease(lease)) return
    await this.postForReview(lease, {
      type: "targetInfo",
      info: prepared.info,
      suggestedReviewId: buildReviewId({
        mode: prepared.info.mode,
        revision: prepared.info.revision,
        baseRevision: prepared.info.baseRevision,
        targetRevision: prepared.info.targetRevision
      })
    })
  }

  private async reviewTarget(
    request: TargetRequest,
    selection: ReviewRunSelection,
    lease: ReviewOperationLease
  ): Promise<void> {
    const bazaarFolder = await this.requireBazaarWorkspaceFolder(lease)
    if (!bazaarFolder || !this.isCurrentReviewLease(lease)) return
    const bobFolder = request.withProjectRules ? await this.requireBobWorkspaceFolder(lease) : undefined
    if (request.withProjectRules && (!bobFolder || !this.isCurrentReviewLease(lease))) return
    validateTargetRequest(request)
    if (request.withProjectRules && bobFolder) {
      const serverName = vscode.workspace.getConfiguration("bobBazaar").get<string>("mcpServerName", "bazaar")
      const status = await getBobWorkspaceStatus(bobFolder, serverName)
      if (!this.isCurrentReviewLease(lease)) return
      if (!status.initialized) {
        await this.postForReview(lease, { type: "bobWorkspaceStatus", ...status })
        throw new Error(".bob が未初期化です。先に『.bob を初期化』ボタンを押してください。")
      }
    }

    await this.postForReview(lease, {
      type: "loading",
      message: "レビュー実行を作成し、レビュー資料を Bob コンテキストへ追加しています…"
    })
    const prepared = await prepareTarget(makeBazaarClient(), bazaarFolder.uri.fsPath, request, {
      includeAddedFiles: true,
      maxAddedFileContentBytes: getMaxAddedFileContentBytes()
    })
    if (!this.isCurrentReviewLease(lease)) return
    const runWorkspaceFolder = this.bobWorkspaceFolder ?? bobFolder ?? bazaarFolder
    const reviewId = selection.reviewId ?? buildReviewId({
      mode: prepared.info.mode,
      revision: prepared.info.revision,
      baseRevision: prepared.info.baseRevision,
      targetRevision: prepared.info.targetRevision
    })
    let reviewRun = this.reusableTargetRun(selection.campaignId, reviewId, prepared.root, prepared.info)
      ?? await startReviewRun({
        workspaceRoot: runWorkspaceFolder.uri.fsPath,
        campaignId: selection.campaignId,
        reviewId,
        target: {
          mode: prepared.info.mode,
          repositoryRoot: prepared.root,
          revision: prepared.info.revision,
          baseRevision: prepared.info.baseRevision,
          targetRevision: prepared.info.targetRevision
        }
      })
    if (!this.isCurrentReviewLease(lease)) return
    const projectRulesSection = request.withProjectRules && bobFolder ? await buildProjectRulesSectionForWorkspace(bobFolder.uri.fsPath) : undefined
    if (!this.isCurrentReviewLease(lease)) return
    const extraSections = [
      buildReviewRunMetadataSection(reviewRun),
      buildTargetMetadataSection(prepared.info),
      prepared.addedFilesSection,
      projectRulesSection
    ].filter((section): section is string => Boolean(section))
    const packet = buildReviewPacket({
      repositoryRoot: prepared.root,
      mode: request.mode,
      revision: request.revision,
      baseRevision: prepared.info.baseRevision,
      targetRevision: prepared.info.targetRevision,
      log: prepared.log,
      diff: prepared.diff,
      maxDiffBytes: getMaxDiffBytes(),
      extraSections
    })
    reviewRun = await recordReviewPacket(reviewRun, packet)
    if (!this.isCurrentReviewLease(lease)) return
    this.activeReviewRun = reviewRun

    const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: packet })
    if (!this.isCurrentReviewLease(lease)) return
    await vscode.window.showTextDocument(doc, { preview: false })
    if (!this.isCurrentReviewLease(lease)) return
    let addResult: "added" | "clipboardFallback" | "skipped" = "skipped"
    let workflowStepCompleted = false
    if (isBobCodeExtensionAvailable()) {
      addResult = await addPacketToBobContext(doc.uri, packet)
      if (!this.isCurrentReviewLease(lease)) return
      if (addResult === "added") {
        workflowStepCompleted = await completeCurrentWorkflowStepAfterGuiAction({
          executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args),
          showWarningMessage: (message) => vscode.window.showWarningMessage(message)
        }, {
          runId: this.initialTarget?.runId,
          stepId: this.initialTarget?.stepId,
          stateUpdates: {
            [REVIEW_PACKET_STATE_KEY]: JSON.stringify(buildReviewPacketState({
              packetUri: doc.uri.toString(),
              runId: this.initialTarget?.runId,
              stepId: this.initialTarget?.stepId,
              target: prepared.info.targetRevision ?? prepared.info.revision,
              repositoryRoot: prepared.root
            }))
          }
        })
        if (!this.isCurrentReviewLease(lease)) return
      }
    } else {
      await vscode.window.showInformationMessage("IBM Bob 拡張機能が見つからないため、Bazaar Revision Review Request の Markdown を作成しました。Bob コンテキスト追加は行いません。")
      if (!this.isCurrentReviewLease(lease)) return
    }
    await this.postForReview(lease, {
      type: "reviewAdded",
      info: prepared.info,
      packetBytes: Buffer.byteLength(packet, "utf8"),
      bobContextAvailable: addResult !== "skipped",
      bobContextAdded: addResult === "added",
      workflowStepCompleted,
      reviewRun: serializeReviewRun(reviewRun)
    })
    await this.postReviewRuns(lease)
  }

  private reusableTargetRun(campaignId: string, reviewId: string, repositoryRoot: string, info: any): ReviewRunContext | undefined {
    const run = this.activeReviewRun
    if (!run || run.status === "completed" || run.phases.packet.status === "completed") return undefined
    if (run.campaignId !== campaignId || run.reviewId !== reviewId) return undefined
    if (run.target.mode !== info.mode || run.target.repositoryRoot !== repositoryRoot) {
      throw new Error("選択したレビュー実行の対象と現在の Bazaar 対象が一致しません。対象を再取得してからやり直してください。")
    }
    if ((run.target.revision ?? "") !== (info.revision ?? "") ||
        (run.target.baseRevision ?? "") !== (info.baseRevision ?? "") ||
        (run.target.targetRevision ?? "") !== (info.targetRevision ?? "")) {
      throw new Error("選択したレビュー実行のリビジョン情報と現在の対象が一致しません。対象を再取得してからやり直してください。")
    }
    return run
  }

  private async requireBazaarWorkspaceFolder(lease: ReviewOperationLease): Promise<vscode.WorkspaceFolder | undefined> {
    if (!this.bazaarWorkspaceFolder) await this.selectWorkspace(lease)
    if (!this.isCurrentReviewLease(lease)) return undefined
    if (!this.bazaarWorkspaceFolder) throw new Error("Bazaar ワークスペースフォルダーが選択されていません。")
    return this.bazaarWorkspaceFolder
  }

  private async requireBobWorkspaceFolder(lease: ReviewOperationLease): Promise<vscode.WorkspaceFolder | undefined> {
    if (!this.bobWorkspaceFolder) {
      const folder = await resolveBobWorkspaceFolder({
        workflowRoot: this.initialTarget?.workflowRoot,
        allowPick: true,
        title: "Bob ワークスペースを選択"
      })
      if (!this.isCurrentReviewLease(lease)) return undefined
      this.bobWorkspaceFolder = folder
    }
    if (!this.bobWorkspaceFolder) throw new Error("Bob ワークスペースフォルダーが選択されていません。先にワークスペースを選択してください。")
    return this.bobWorkspaceFolder
  }

  private async post(
    message: Record<string, unknown>,
    generation?: number,
    operationGeneration?: number
  ): Promise<boolean> {
    const isCurrent = () => !this.disposed &&
      this.stage === "review" &&
      (generation === undefined || generation === this.stageGeneration) &&
      (operationGeneration === undefined || operationGeneration === this.reviewOperationGeneration)
    if (!isCurrent()) return false
    try {
      const posted = await this.panel.webview.postMessage(message)
      return posted !== false && isCurrent()
    } catch (error) {
      if (!isCurrent()) return false
      const currentGeneration = generation ?? this.stageGeneration
      if (this.reviewTransportErrorGeneration !== currentGeneration) {
        this.reviewTransportErrorGeneration = currentGeneration
        const messageText = error instanceof Error ? error.message : String(error)
        void Promise.resolve(vscode.window.showErrorMessage(`Bazaar Review GUI: ${messageText}`)).catch(() => undefined)
      }
      return false
    }
  }
}

function parseReviewRunSelection(message: any): ReviewRunSelection {
  return {
    campaignId: textOrDefault(message?.campaignId, DEFAULT_CAMPAIGN_ID),
    reviewId: textOrUndefined(message?.reviewId)
  }
}

function serializeReviewRun(run: ReviewRunContext): Record<string, unknown> {
  return {
    workspaceRoot: run.workspaceRoot,
    campaignId: run.campaignId,
    reviewId: run.reviewId,
    phase: run.phase,
    status: run.status,
    phases: Object.fromEntries(Object.entries(run.phases).map(([phase, progress]) => [phase, progress.status])),
    artifacts: run.artifacts,
    metrics: run.metrics,
    target: run.target
  }
}

function parseBazaarReviewStage(value: unknown): BazaarReviewStage | undefined {
  if (value === "review" || value === "review-result-capture" || value === "triage" || value === "review-results") {
    return value
  }
  return undefined
}

function isMessageForStage(message: unknown, stage: BazaarReviewStage): boolean {
  if (!message || typeof message !== "object") return false
  const type = (message as { type?: unknown }).type
  if (typeof type !== "string") return false
  if (stage === "review-result-capture") return type === "bazaarResultCapture.action"
  if (stage === "triage") return type === "bazaarHumanTriage.action"
  if (stage === "review-results") return type.startsWith("campaignDashboard.")
  return false
}

function sameReviewRunIdentity(left: ReviewRunContext | undefined, right: ReviewRunContext | undefined): boolean {
  if (!left || !right) return left === right
  return left.workspaceRoot === right.workspaceRoot &&
    left.campaignId === right.campaignId &&
    left.reviewId === right.reviewId
}

function textOrDefault(value: unknown, fallback: string): string {
  return textOrUndefined(value) ?? fallback
}

function textOrUndefined(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : ""
  return text || undefined
}

function randomRenderToken(): string {
  return randomBytes(16).toString("hex")
}

function requiredText(value: unknown, fieldName: string): string {
  const text = textOrUndefined(value)
  if (!text) throw new Error(`${fieldName} is required`)
  return text
}

function makeBazaarClient(): BazaarClient {
  const config = vscode.workspace.getConfiguration("bobBazaar")
  return new BazaarClient({
    bzrPath: resolveBzrPath(config, vscode.workspace.isTrusted),
    maxBuffer: maxBufferForDiffBytes(getMaxDiffBytes()),
    textEncoding: config.get<string>("textEncoding", "auto")
  })
}

function getMaxDiffBytes(): number {
  return clampMaxDiffBytes(vscode.workspace.getConfiguration("bobBazaar").get<number>("maxDiffBytes", 1024 * 1024))
}

function getMaxAddedFileContentBytes(): number {
  return clampMaxAddedFileContentBytes(vscode.workspace.getConfiguration("bobBazaar").get<number>("maxAddedFileContentBytes", 256 * 1024))
}

async function buildProjectRulesSectionForWorkspace(workspaceRoot: string): Promise<string> {
  const config = vscode.workspace.getConfiguration("bobBazaar")
  const bundle = await loadProjectRuleBundle(workspaceRoot, {
    checklistPath: config.get<string>("projectRules.checklistPath", ".bob/review/checklist.json"),
    schemaPath: config.get<string>("projectRules.schemaPath", ".bob/review/review-result.schema.json")
  })
  return buildProjectRulesSectionFromBundle(bundle, PROJECT_RULE_BUNDLE_LIMITS)
}

async function addPacketToBobContext(uri: vscode.Uri, packet: string) {
  return addMarkdownPacketToBobContext({
    executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args),
    writeClipboard: (text) => vscode.env.clipboard.writeText(text),
    showWarningMessage: (message) => vscode.window.showWarningMessage(message)
  }, uri, packet)
}
