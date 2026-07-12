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
import { loadProjectChecklistRequired, loadReviewResultSchemaRequired } from "../projectRules/io"
import { buildProjectRulesSection } from "../projectRules/packet"
import {
  buildReviewRunMetadataSection,
  loadReviewRun,
  recordReviewPacket,
  reviewRunCommandInput,
  startReviewRun,
  validateReviewRunCommandInput
} from "../reviewRuns/reviewRunCoordinator"
import { buildReviewRunResumeCandidate, nextReviewRunAction } from "../reviewRuns/reviewRunResume"
import { buildReviewId } from "../reviewRuns/reviewRunState"
import { listReviewRuns } from "../reviewRuns/reviewRunStore"
import type { ReviewRunCommandInput, ReviewRunContext } from "../reviewRuns/reviewRunTypes"
import { getBobWorkspaceStatus, initializeBobWorkspaceFromTemplates } from "../workspace/bobWorkspaceInit"
import { resolveBazaarWorkspaceFolder, resolveBobWorkspaceFolder } from "../workspace/workspaceResolver"
import { completeCurrentWorkflowStepAfterGuiAction } from "../workflow/workflowStepCompletion"
import { renderHtml } from "./reviewGuiHtml"
import type { BazaarReviewInitialTarget } from "./reviewGuiTypes"

const DEFAULT_CAMPAIGN_ID = "phase1-bazaar-review-uat-001"

interface ReviewRunSelection {
  campaignId: string
  reviewId?: string
}

export function openBazaarReviewGui(context: vscode.ExtensionContext, initialTarget?: BazaarReviewInitialTarget): void {
  const panel = vscode.window.createWebviewPanel("bobBazaarReviewGui", "Bazaar レビュー", vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true
  })
  const controller = new BazaarReviewGuiController(context, panel, initialTarget)
  controller.initialize()
}

class BazaarReviewGuiController {
  private bazaarWorkspaceFolder?: vscode.WorkspaceFolder
  private bobWorkspaceFolder?: vscode.WorkspaceFolder
  private activeReviewRun?: ReviewRunContext

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    private readonly initialTarget?: BazaarReviewInitialTarget
  ) {}

  initialize(): void {
    this.panel.webview.html = renderHtml(this.panel.webview.cspSource, this.initialTarget)
    this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message), undefined, this.context.subscriptions)
  }

  private async handleMessage(message: any): Promise<void> {
    try {
      if (message?.type === "ready") {
        await this.postWorkspaceState()
        await this.postReviewRuns()
      } else if (message?.type === "selectWorkspace") {
        await this.selectWorkspace()
      } else if (message?.type === "initializeBobWorkspace") {
        await this.initializeBobWorkspace()
      } else if (message?.type === "loadTarget") {
        await this.loadTarget(parseTargetRequest(message))
      } else if (message?.type === "reviewTarget") {
        await this.reviewTarget(parseTargetRequest(message), parseReviewRunSelection(message))
      } else if (message?.type === "openResultCapture") {
        await this.openReviewRunCommand("bobBazaar.openResultCaptureGui")
      } else if (message?.type === "openHumanTriage") {
        await this.openReviewRunCommand("bobBazaar.openHumanTriageGui")
      } else if (message?.type === "refreshReviewRuns") {
        await this.postReviewRuns()
      } else if (message?.type === "resumeReviewRun") {
        await this.resumeReviewRun(message)
      }
    } catch (error: any) {
      this.post({ type: "error", message: error?.message ?? String(error) })
    }
  }

  private async openReviewRunCommand(command: string): Promise<void> {
    if (this.activeReviewRun) {
      await vscode.commands.executeCommand(command, reviewRunCommandInput(this.activeReviewRun))
      return
    }
    await vscode.commands.executeCommand(command)
  }

  private async postWorkspaceState(): Promise<void> {
    if (!this.bazaarWorkspaceFolder) {
      this.bazaarWorkspaceFolder = await resolveBazaarWorkspaceFolder({
        explicitRoot: this.initialTarget?.bazaarRoot ?? this.initialTarget?.repositoryRoot,
        workflowRoot: this.initialTarget?.workflowRoot,
        allowPick: false
      })
    }
    if (!this.bobWorkspaceFolder) {
      this.bobWorkspaceFolder = await resolveBobWorkspaceFolder({
        workflowRoot: this.initialTarget?.workflowRoot,
        allowPick: false
      })
    }
    this.post({
      type: "workspaceState",
      workspace: this.bazaarWorkspaceFolder?.uri.fsPath,
      bobWorkspace: this.bobWorkspaceFolder?.uri.fsPath
    })
    await this.postBobWorkspaceStatus()
  }

  private async postBobWorkspaceStatus(): Promise<void> {
    if (!this.bobWorkspaceFolder) {
      this.post({ type: "bobWorkspaceStatus", initialized: false, missing: ["Bob ワークスペース未選択"], present: [] })
      return
    }
    const serverName = vscode.workspace.getConfiguration("bobBazaar").get<string>("mcpServerName", "bazaar")
    this.post({ type: "bobWorkspaceStatus", ...(await getBobWorkspaceStatus(this.bobWorkspaceFolder, serverName)) })
  }

  private async postReviewRuns(): Promise<void> {
    const folder = this.bobWorkspaceFolder ?? this.bazaarWorkspaceFolder
    if (!folder) {
      this.post({ type: "reviewRuns", items: [] })
      return
    }
    const items = (await listReviewRuns(folder.uri.fsPath))
      .filter((run) => run.status !== "completed")
      .map(buildReviewRunResumeCandidate)
    this.post({ type: "reviewRuns", items })
  }

  private async resumeReviewRun(message: any): Promise<void> {
    const rawInput: ReviewRunCommandInput = {
      workspaceRoot: requiredText(message?.workspaceRoot, "workspaceRoot"),
      campaignId: requiredText(message?.campaignId, "campaignId"),
      reviewId: requiredText(message?.reviewId, "reviewId")
    }
    const input = await validateReviewRunCommandInput(
      rawInput,
      (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath)
    )
    const run = await loadReviewRun(input)
    this.activeReviewRun = run
    const action = nextReviewRunAction(run)
    if (action === "review") {
      this.post({ type: "resumeTarget", target: run.target, reviewRun: serializeReviewRun(run) })
      return
    }
    this.post({
      type: "activeReviewRun",
      reviewRun: serializeReviewRun(run),
      message: `Review Runを再開しました。次の操作: ${action}`
    })
    if (action === "resultCapture") {
      await vscode.commands.executeCommand("bobBazaar.openResultCaptureGui", reviewRunCommandInput(run))
    } else if (action === "humanTriage" || action === "finalize") {
      await vscode.commands.executeCommand("bobBazaar.openHumanTriageGui", reviewRunCommandInput(run))
    }
  }

  private async selectWorkspace(): Promise<void> {
    const folder = await resolveBazaarWorkspaceFolder({
      explicitRoot: this.initialTarget?.bazaarRoot ?? this.initialTarget?.repositoryRoot,
      workflowRoot: this.initialTarget?.workflowRoot,
      allowPick: true,
      title: "Bazaar ワークスペースを選択"
    })
    if (!folder) throw new Error("先に Bazaar ワークスペースフォルダーを開いてください。")
    this.bazaarWorkspaceFolder = folder
    if (!this.bobWorkspaceFolder) {
      this.bobWorkspaceFolder = await resolveBobWorkspaceFolder({ workflowRoot: this.initialTarget?.workflowRoot, allowPick: false })
    }
    await this.postWorkspaceState()
    await this.postReviewRuns()
  }

  private async initializeBobWorkspace(): Promise<void> {
    const folder = await this.requireBobWorkspaceFolder()
    const config = vscode.workspace.getConfiguration("bobBazaar")
    this.post({ type: "loading", message: ".bob を初期化しています..." })
    const status = await initializeBobWorkspaceFromTemplates({
      context: this.context,
      workspaceFolder: folder,
      allowedRoots: this.bazaarWorkspaceFolder ? [this.bazaarWorkspaceFolder.uri.fsPath] : undefined,
      bzrPath: resolveBzrPath(config, vscode.workspace.isTrusted),
      serverName: config.get<string>("mcpServerName", "bazaar"),
      textEncoding: config.get<string>("textEncoding", "auto")
    })
    this.post({ type: "bobWorkspaceStatus", ...status })
    this.post({ type: "initialized", message: ".bob 初期化が完了しました。Bob MCP サーバーを Refresh / Restart してください。" })
    await this.postReviewRuns()
  }

  private async loadTarget(request: TargetRequest): Promise<void> {
    const folder = await this.requireBazaarWorkspaceFolder()
    validateTargetRequest(request)
    this.post({ type: "loading", message: "対象情報を取得しています..." })
    const prepared = await prepareTarget(makeBazaarClient(), folder.uri.fsPath, request, {
      includeAddedFiles: false,
      maxAddedFileContentBytes: getMaxAddedFileContentBytes()
    })
    this.post({
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

  private async reviewTarget(request: TargetRequest, selection: ReviewRunSelection): Promise<void> {
    const bazaarFolder = await this.requireBazaarWorkspaceFolder()
    const bobFolder = request.withProjectRules ? await this.requireBobWorkspaceFolder() : undefined
    validateTargetRequest(request)
    if (request.withProjectRules && bobFolder) {
      const serverName = vscode.workspace.getConfiguration("bobBazaar").get<string>("mcpServerName", "bazaar")
      const status = await getBobWorkspaceStatus(bobFolder, serverName)
      if (!status.initialized) {
        this.post({ type: "bobWorkspaceStatus", ...status })
        throw new Error(".bob が未初期化です。先に『.bob を初期化』ボタンを押してください。")
      }
    }

    this.post({ type: "loading", message: "Review Runを作成し、レビュー packet を Bob コンテキストへ追加しています..." })
    const prepared = await prepareTarget(makeBazaarClient(), bazaarFolder.uri.fsPath, request, {
      includeAddedFiles: true,
      maxAddedFileContentBytes: getMaxAddedFileContentBytes()
    })
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
    const projectRulesSection = request.withProjectRules && bobFolder ? await buildProjectRulesSectionForWorkspace(bobFolder.uri.fsPath) : undefined
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
    this.activeReviewRun = reviewRun

    const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: packet })
    await vscode.window.showTextDocument(doc, { preview: false })
    let addResult: "added" | "clipboardFallback" | "skipped" = "skipped"
    let workflowStepCompleted = false
    if (isBobCodeExtensionAvailable()) {
      addResult = await addPacketToBobContext(doc.uri, packet)
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
      }
    } else {
      await vscode.window.showInformationMessage("IBM Bob 拡張機能が見つからないため、Bazaar Revision Review Request の Markdown を作成しました。Bob コンテキスト追加は行いません。")
    }
    this.post({
      type: "reviewAdded",
      info: prepared.info,
      packetBytes: Buffer.byteLength(packet, "utf8"),
      bobContextAvailable: addResult !== "skipped",
      bobContextAdded: addResult === "added",
      workflowStepCompleted,
      reviewRun: serializeReviewRun(reviewRun)
    })
    await this.postReviewRuns()
  }

  private reusableTargetRun(campaignId: string, reviewId: string, repositoryRoot: string, info: any): ReviewRunContext | undefined {
    const run = this.activeReviewRun
    if (!run || run.status === "completed" || run.phases.packet.status === "completed") return undefined
    if (run.campaignId !== campaignId || run.reviewId !== reviewId) return undefined
    if (run.target.mode !== info.mode || run.target.repositoryRoot !== repositoryRoot) {
      throw new Error("選択したReview Runのtargetと現在のBazaar targetが一致しません。")
    }
    if ((run.target.revision ?? "") !== (info.revision ?? "") ||
        (run.target.baseRevision ?? "") !== (info.baseRevision ?? "") ||
        (run.target.targetRevision ?? "") !== (info.targetRevision ?? "")) {
      throw new Error("選択したReview Runのrevision情報と現在のtargetが一致しません。")
    }
    return run
  }

  private async requireBazaarWorkspaceFolder(): Promise<vscode.WorkspaceFolder> {
    if (!this.bazaarWorkspaceFolder) await this.selectWorkspace()
    if (!this.bazaarWorkspaceFolder) throw new Error("Bazaar ワークスペースフォルダーが選択されていません。")
    return this.bazaarWorkspaceFolder
  }

  private async requireBobWorkspaceFolder(): Promise<vscode.WorkspaceFolder> {
    if (!this.bobWorkspaceFolder) {
      this.bobWorkspaceFolder = await resolveBobWorkspaceFolder({
        workflowRoot: this.initialTarget?.workflowRoot,
        allowPick: true,
        title: "Bob ワークスペースを選択"
      })
    }
    if (!this.bobWorkspaceFolder) throw new Error("Bob ワークスペースフォルダーが選択されていません。")
    return this.bobWorkspaceFolder
  }

  private post(message: any): void {
    void this.panel.webview.postMessage(message)
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

function textOrDefault(value: unknown, fallback: string): string {
  return textOrUndefined(value) ?? fallback
}

function textOrUndefined(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : ""
  return text || undefined
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
  const [checklist, schema] = await Promise.all([
    loadProjectChecklistRequired(workspaceRoot, config.get<string>("projectRules.checklistPath", ".bob/review/checklist.json")),
    loadReviewResultSchemaRequired(workspaceRoot, config.get<string>("projectRules.schemaPath", ".bob/review/review-result.schema.json"))
  ])
  return buildProjectRulesSection({ checklist, schema })
}

async function addPacketToBobContext(uri: vscode.Uri, packet: string) {
  return addMarkdownPacketToBobContext({
    executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args),
    writeClipboard: (text) => vscode.env.clipboard.writeText(text),
    showWarningMessage: (message) => vscode.window.showWarningMessage(message)
  }, uri, packet)
}
