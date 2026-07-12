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

export interface CampaignDashboardCommandInput {
  workspaceRoot?: string
  campaignId?: string
}

type CampaignDashboardMessage =
  | { type: "campaignDashboard.refresh" }
  | { type: "campaignDashboard.selectCampaign"; campaignId: string }
  | { type: "campaignDashboard.export" }

export function openBazaarCampaignDashboardGui(
  context: vscode.ExtensionContext,
  input: CampaignDashboardCommandInput = {}
): void {
  const panel = vscode.window.createWebviewPanel(
    "bobBazaarCampaignDashboard",
    "Bazaar Campaign Dashboard",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  )
  const controller = new BazaarCampaignDashboardGuiController(panel, input)
  context.subscriptions.push(
    panel.webview.onDidReceiveMessage((message) => controller.handleMessage(message))
  )
  void controller.initialize()
}

class BazaarCampaignDashboardGuiController {
  private workspaceRoot?: string
  private campaigns: string[] = []
  private selectedCampaignId?: string
  private dashboard?: CampaignDashboard
  private exportedPaths?: CampaignDashboardGuiModel["exportedPaths"]

  constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly input: CampaignDashboardCommandInput
  ) {
    this.selectedCampaignId = input.campaignId
  }

  async initialize(): Promise<void> {
    try {
      this.workspaceRoot = await resolveDashboardWorkspaceRoot(this.input.workspaceRoot)
      this.campaigns = await listCampaignDashboardCampaigns(this.workspaceRoot)
      this.selectedCampaignId = selectInitialCampaign(this.selectedCampaignId, this.campaigns)
      await this.reload("Campaign Dashboardを読み込みました。")
    } catch (error) {
      this.render(undefined, errorMessage(error))
    }
  }

  async handleMessage(rawMessage: unknown): Promise<void> {
    const message = parseCampaignDashboardMessage(rawMessage)
    if (!message) {
      this.post({ ok: false, message: "不正なDashboard操作を拒否しました。" })
      return
    }
    try {
      if (message.type === "campaignDashboard.refresh") {
        await this.reload("Campaign Dashboardを再読込しました。")
      } else if (message.type === "campaignDashboard.selectCampaign") {
        const selected = validateReviewRunSegment(message.campaignId, "campaignId")
        if (!this.campaigns.includes(selected)) throw new Error(`campaignが見つかりません: ${selected}`)
        this.selectedCampaignId = selected
        this.exportedPaths = undefined
        await this.reload(`campaign ${selected} を読み込みました。`)
      } else if (message.type === "campaignDashboard.export") {
        await this.exportDashboard()
      }
    } catch (error) {
      const messageText = errorMessage(error)
      this.render(undefined, messageText)
      this.post({ ok: false, message: messageText })
    }
  }

  private async reload(status: string): Promise<void> {
    const workspaceRoot = requiredText(this.workspaceRoot, "workspaceRoot")
    this.campaigns = await listCampaignDashboardCampaigns(workspaceRoot)
    this.selectedCampaignId = selectInitialCampaign(this.selectedCampaignId, this.campaigns)
    this.dashboard = this.selectedCampaignId
      ? await generateCampaignDashboard(workspaceRoot, this.selectedCampaignId)
      : undefined
    this.render(status)
  }

  private async exportDashboard(): Promise<void> {
    const workspaceRoot = requiredText(this.workspaceRoot, "workspaceRoot")
    const campaignId = requiredText(this.selectedCampaignId, "campaignId")
    const dashboard = await generateCampaignDashboard(workspaceRoot, campaignId)
    const paths = await writeCampaignDashboardArtifacts(workspaceRoot, campaignId, dashboard)
    this.dashboard = dashboard
    this.exportedPaths = paths
    this.render("DashboardをJSON / Markdown / CSVへexportしました。")
    await vscode.window.showInformationMessage(`Bazaar Campaign Dashboardをexportしました: ${paths.markdownPath}`)
    this.post({
      ok: true,
      message: [
        "Dashboard exportが完了しました。",
        `JSON: ${paths.jsonPath}`,
        `Markdown: ${paths.markdownPath}`,
        `CSV: ${paths.csvPath}`
      ].join("\n")
    })
  }

  private render(status?: string, error?: string): void {
    this.panel.webview.html = renderCampaignDashboardHtml({
      cspSource: this.panel.webview.cspSource,
      nonce: randomBytes(16).toString("base64"),
      model: {
        workspaceRoot: this.workspaceRoot,
        campaigns: this.campaigns,
        selectedCampaignId: this.selectedCampaignId,
        dashboard: this.dashboard,
        exportedPaths: this.exportedPaths,
        status,
        error
      }
    })
  }

  private post(message: Record<string, unknown>): void {
    void this.panel.webview.postMessage(message)
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
    title: "Campaign DashboardのBob workspaceを選択"
  })
  if (!folder) throw new Error("Campaign DashboardにはBob workspaceが必要です。")
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
      if (!stats.isDirectory()) throw new Error("workspaceRoot is not a directory")
      return workspaceRoot
    } catch (error) {
      boundaryError = error
    }
  }
  const detail = boundaryError instanceof Error ? `: ${boundaryError.message}` : ""
  throw new Error(`Campaign Dashboard workspaceRoot must be inside an open workspace folder: ${value}${detail}`)
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
