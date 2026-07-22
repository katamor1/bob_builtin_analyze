import { randomBytes } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as vscode from "vscode"
import {
  generateCampaignDashboard,
  listCampaignDashboardCampaigns
} from "../dashboard/campaignDashboard"
import { writeCampaignDashboardArtifacts } from "../dashboard/campaignDashboardExport"
import type { CampaignDashboard } from "../dashboard/campaignDashboardTypes"
import {
  assertReviewRunPathContained,
  validateReviewRunSegment
} from "../reviewRuns/reviewRunPaths"
import { resolveBobWorkspaceFolder } from "../workspace/workspaceResolver"
import {
  renderCampaignDashboardHtml,
  type CampaignDashboardGuiModel
} from "./campaignDashboardGuiHtml"
import type { BazaarReviewStageHost, BazaarReviewStageRequest, BazaarReviewStageService } from "./reviewGuiStages"

export interface CampaignDashboardCommandInput {
  workspaceRoot?: string
  campaignId?: string
}

type CampaignDashboardMessage =
  | { type: "campaignDashboard.refresh" }
  | { type: "campaignDashboard.selectCampaign"; campaignId: string }
  | { type: "campaignDashboard.export" }

export function createBazaarReviewResultsStage(host: BazaarReviewStageHost, request: BazaarReviewStageRequest = {}): BazaarReviewStageService {
  const reviewRun = host.getActiveReviewRun()
  return new BazaarReviewResultsStage(host, {
    workspaceRoot: reviewRun?.workspaceRoot ?? host.getWorkspaceRoot(),
    campaignId: reviewRun?.campaignId ?? request.campaignId
  })
}

class BazaarReviewResultsStage implements BazaarReviewStageService {
  private workspaceRoot?: string
  private campaigns: string[] = []
  private selectedCampaignId?: string
  private dashboard?: CampaignDashboard
  private exportedPaths?: CampaignDashboardGuiModel["exportedPaths"]
  private operationGeneration = 0

  constructor(
    private readonly host: BazaarReviewStageHost,
    private readonly input: CampaignDashboardCommandInput
  ) {
    this.selectedCampaignId = input.campaignId
  }

  async initialize(): Promise<void> {
    const operation = this.beginOperation()
    try {
      const workspaceRoot = await resolveDashboardWorkspaceRoot(this.input.workspaceRoot)
      if (!this.isCurrentOperation(operation)) return
      await this.reload(operation, "レビュー実績を読み込みました。", this.selectedCampaignId, workspaceRoot)
    } catch (error) {
      if (this.isCurrentOperation(operation)) this.render(undefined, errorMessage(error))
    }
  }

  async handleMessage(rawMessage: unknown): Promise<void> {
    const message = parseCampaignDashboardMessage(rawMessage)
    if (!message) {
      if (this.host.isActive()) {
        await this.host.post({ ok: false, message: "不正なレビュー実績操作を拒否しました。画面を再読み込みしてください。" })
      }
      return
    }
    const operation = this.beginOperation()
    try {
      if (message.type === "campaignDashboard.refresh") {
        await this.reload(operation, "レビュー実績を再読み込みしました。", this.selectedCampaignId)
      } else if (message.type === "campaignDashboard.selectCampaign") {
        const selected = validateReviewRunSegment(message.campaignId, "campaignId")
        if (!this.campaigns.includes(selected)) throw new Error(`レビューキャンペーンが見つかりません: ${selected}`)
        await this.reload(operation, `レビューキャンペーン ${selected} を読み込みました。`, selected)
      } else if (message.type === "campaignDashboard.export") {
        await this.exportDashboard(operation)
      }
    } catch (error) {
      if (!this.isCurrentOperation(operation)) return
      const messageText = errorMessage(error)
      this.render(undefined, messageText)
      await this.host.post({ ok: false, message: messageText })
    }
  }

  private async reload(
    operation: number,
    status: string,
    requestedCampaignId: string | undefined,
    requestedWorkspaceRoot = this.workspaceRoot
  ): Promise<void> {
    const workspaceRoot = requiredText(requestedWorkspaceRoot, "workspaceRoot")
    const campaigns = await listCampaignDashboardCampaigns(workspaceRoot)
    if (!this.isCurrentOperation(operation)) return
    const selectedCampaignId = selectInitialCampaign(requestedCampaignId, campaigns)
    const dashboard = selectedCampaignId
      ? await generateCampaignDashboard(workspaceRoot, selectedCampaignId)
      : undefined
    if (!this.isCurrentOperation(operation)) return
    this.workspaceRoot = workspaceRoot
    this.campaigns = campaigns
    this.selectedCampaignId = selectedCampaignId
    this.dashboard = dashboard
    this.exportedPaths = undefined
    this.render(status)
  }

  private async exportDashboard(operation: number): Promise<void> {
    const workspaceRoot = requiredText(this.workspaceRoot, "workspaceRoot")
    const campaignId = requiredText(this.selectedCampaignId, "campaignId")
    const dashboard = await generateCampaignDashboard(workspaceRoot, campaignId)
    if (!this.isCurrentOperation(operation)) return
    const paths = await writeCampaignDashboardArtifacts(workspaceRoot, campaignId, dashboard)
    if (!this.isCurrentOperation(operation)) return
    this.dashboard = dashboard
    this.exportedPaths = paths
    this.render("レビュー実績を JSON／Markdown／CSV へ書き出しました。")
    if (!this.isCurrentOperation(operation)) return
    await vscode.window.showInformationMessage(`レビュー実績を書き出しました: ${paths.markdownPath}`)
    if (!this.isCurrentOperation(operation)) return
    await this.host.post({
      ok: true,
      message: [
        "ファイルへの書き出しが完了しました。",
        `JSON: ${paths.jsonPath}`,
        `Markdown: ${paths.markdownPath}`,
        `CSV: ${paths.csvPath}`
      ].join("\n")
    })
  }

  private render(status?: string, error?: string): void {
    if (!this.host.isActive()) return
    this.host.render(renderCampaignDashboardHtml({
      cspSource: this.host.cspSource,
      nonce: randomBytes(16).toString("base64"),
      renderToken: this.host.nextRenderToken(),
      model: {
        workspaceRoot: this.workspaceRoot,
        campaigns: this.campaigns,
        selectedCampaignId: this.selectedCampaignId,
        dashboard: this.dashboard,
        exportedPaths: this.exportedPaths,
        status,
        error
      }
    }))
  }

  private beginOperation(): number {
    return ++this.operationGeneration
  }

  private isCurrentOperation(operation: number): boolean {
    return this.host.isActive() && operation === this.operationGeneration
  }
}

async function resolveDashboardWorkspaceRoot(explicitRoot: string | undefined): Promise<string> {
  if (explicitRoot) {
    return validateDashboardWorkspaceRoot(
      explicitRoot,
      (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath)
    )
  }
  const folder = await resolveBobWorkspaceFolder({
    allowPick: true,
    title: "レビュー実績の Bob ワークスペースを選択"
  })
  if (!folder) throw new Error("レビュー実績には Bob ワークスペースが必要です。ワークスペースを選択してください。")
  return validateDashboardWorkspaceRoot(
    folder.uri.fsPath,
    (vscode.workspace.workspaceFolders ?? []).map((candidate) => candidate.uri.fsPath)
  )
}

async function validateDashboardWorkspaceRoot(value: string, openWorkspaceRoots: string[]): Promise<string> {
  const workspaceRoot = path.resolve(value)
  const candidates = openWorkspaceRoots
    .map((root) => path.resolve(root))
    .filter((root) => isInsideOrSame(root, workspaceRoot))
  let boundaryError: unknown
  for (const root of candidates) {
    try {
      await assertReviewRunPathContained(root, workspaceRoot)
      const stats = await fs.stat(workspaceRoot)
      if (!stats.isDirectory()) throw new Error("ワークスペースのパスがフォルダーではありません")
      return workspaceRoot
    } catch (error) {
      boundaryError = error
    }
  }
  const detail = boundaryError instanceof Error ? `: ${boundaryError.message}` : ""
  throw new Error(`レビュー実績のワークスペースは、開いているワークスペースフォルダー内にある必要があります: ${value}${detail}`)
}

function parseCampaignDashboardMessage(value: unknown): CampaignDashboardMessage | undefined {
  if (!value || typeof value !== "object") return undefined
  const message = value as Record<string, unknown>
  if (message.type === "campaignDashboard.refresh") return { type: "campaignDashboard.refresh" }
  if (message.type === "campaignDashboard.export") return { type: "campaignDashboard.export" }
  if (message.type === "campaignDashboard.selectCampaign" && typeof message.campaignId === "string") {
    return { type: "campaignDashboard.selectCampaign", campaignId: message.campaignId }
  }
  return undefined
}

function selectInitialCampaign(requested: string | undefined, campaigns: string[]): string | undefined {
  if (requested) {
    const safe = validateReviewRunSegment(requested, "campaignId")
    if (campaigns.includes(safe)) return safe
  }
  return campaigns[0]
}

function isInsideOrSame(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function requiredText(value: string | undefined, fieldName: string): string {
  if (!value?.trim()) throw new Error(`${fieldName} is required`)
  return value
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
