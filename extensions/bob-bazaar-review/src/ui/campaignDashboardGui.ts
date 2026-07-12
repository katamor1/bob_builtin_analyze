import { randomBytes } from "node:crypto"
import * as vscode from "vscode"
import {
  generateCampaignDashboardArtifacts,
  listCampaignIds,
  type CampaignDashboardArtifacts
} from "../dashboard/campaignDashboardStore"

interface DashboardMessage {
  type: "bazaarCampaignDashboard.action"
  action: "refresh" | "openJson" | "openMarkdown" | "openCsv"
}

export async function openBazaarCampaignDashboard(context: vscode.ExtensionContext): Promise<void> {
  const workspaceRoot = await pickWorkspaceRoot()
  if (!workspaceRoot) return
  const campaignIds = await listCampaignIds(workspaceRoot)
  if (campaignIds.length === 0) {
    void vscode.window.showWarningMessage("Campaign Dashboardを生成できるcampaignがありません。")
    return
  }
  const campaignId = campaignIds.length === 1
    ? campaignIds[0]
    : await vscode.window.showQuickPick(campaignIds, { placeHolder: "Dashboardを表示するcampaignを選択" })
  if (!campaignId) return

  const panel = vscode.window.createWebviewPanel(
    "bobBazaarCampaignDashboard",
    `Bazaar Campaign Dashboard: ${campaignId}`,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  )
  const controller = new CampaignDashboardController(context, panel, workspaceRoot, campaignId)
  context.subscriptions.push(panel.webview.onDidReceiveMessage((message) => controller.handleMessage(message)))
  await controller.refresh()
}

class CampaignDashboardController {
  private artifacts?: CampaignDashboardArtifacts

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    private readonly workspaceRoot: string,
    private readonly campaignId: string
  ) {}

  async refresh(): Promise<void> {
    try {
      this.artifacts = await generateCampaignDashboardArtifacts(this.workspaceRoot, this.campaignId)
      this.panel.webview.html = renderDashboardHtml(
        this.panel.webview.cspSource,
        randomBytes(16).toString("base64"),
        this.artifacts
      )
    } catch (error) {
      this.panel.webview.html = renderErrorHtml(
        this.panel.webview.cspSource,
        randomBytes(16).toString("base64"),
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  async handleMessage(raw: unknown): Promise<void> {
    const message = parseDashboardMessage(raw)
    if (!message) {
      void vscode.window.showErrorMessage("不正なCampaign Dashboard操作を拒否しました。")
      return
    }
    if (message.action === "refresh") {
      await this.refresh()
      return
    }
    if (!this.artifacts) return
    const filePath = message.action === "openJson"
      ? this.artifacts.jsonPath
      : message.action === "openMarkdown"
        ? this.artifacts.markdownPath
        : this.artifacts.csvPath
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
    await vscode.window.showTextDocument(document, { preview: false })
  }
}

function renderDashboardHtml(cspSource: string, nonce: string, artifacts: CampaignDashboardArtifacts): string {
  const dashboard = artifacts.dashboard
  const phaseRows = Object.entries(dashboard.review_runs.by_next_phase)
    .map(([phase, count]) => `<tr><td>${escapeHtml(phase)}</td><td>${count}</td></tr>`)
    .join("")
  const changeRows = Object.entries(dashboard.change_types)
    .map(([type, row]) => `<tr><td>${escapeHtml(type)}</td><td>${row.records}</td><td>${row.findings}</td><td>${row.estimated_minutes_saved}</td></tr>`)
    .join("")
  const ruleRows = dashboard.rules
    .map((row) => `<tr data-rule="${escapeHtml(row.rule_id.toLowerCase())}" data-severity="${escapeHtml(row.severity)}"><td>${escapeHtml(row.rule_id)}</td><td>${escapeHtml(row.severity)}</td><td>${row.findings}</td><td>${row.accepted}</td><td>${row.rejected}</td><td>${row.needs_investigation}</td><td>${row.deferred}</td><td>${row.acceptance_rate_percent}%</td></tr>`)
    .join("")
  const warnings = dashboard.warnings.length
    ? `<ul>${dashboard.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
    : "<p>なし</p>"

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Campaign Dashboard</title>
<style>body{font-family:var(--vscode-font-family);padding:18px;color:var(--vscode-foreground)}.toolbar{display:flex;gap:8px;flex-wrap:wrap}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:16px 0}.card{border:1px solid var(--vscode-panel-border);padding:12px;border-radius:6px}.value{font-size:24px;font-weight:700}table{border-collapse:collapse;width:100%;margin:8px 0 20px}th,td{border:1px solid var(--vscode-panel-border);padding:6px;text-align:left}input,select,button{font:inherit;padding:6px}.filters{display:flex;gap:8px;margin:8px 0}</style></head>
<body><h1>Campaign Dashboard</h1><p><code>${escapeHtml(dashboard.campaign_id)}</code> / ${escapeHtml(dashboard.generated_at)}</p>
<div class="toolbar"><button data-action="refresh">再集計</button><button data-action="openJson">JSONを開く</button><button data-action="openMarkdown">Markdownを開く</button><button data-action="openCsv">CSVを開く</button></div>
<div class="cards"><div class="card"><div>Review Runs</div><div class="value">${dashboard.review_runs.completed}/${dashboard.review_runs.total}</div></div><div class="card"><div>Records</div><div class="value">${dashboard.records.total}</div></div><div class="card"><div>Estimated saved</div><div class="value">${dashboard.timing.estimated_minutes_saved} min</div></div><div class="card"><div>Baseline coverage</div><div class="value">${dashboard.coverage.baseline_percent}%</div></div></div>
<h2>Coverage</h2><table><tr><th>Metric</th><th>Coverage</th></tr><tr><td>Baseline</td><td>${dashboard.coverage.baseline_records}/${dashboard.records.total} (${dashboard.coverage.baseline_percent}%)</td></tr><tr><td>Triage</td><td>${dashboard.coverage.triage_records}/${dashboard.records.total} (${dashboard.coverage.triage_percent}%)</td></tr><tr><td>Schema valid</td><td>${dashboard.coverage.schema_valid_records}/${dashboard.records.total} (${dashboard.coverage.schema_valid_percent}%)</td></tr></table>
<h2>Next phase</h2><table><tr><th>Phase</th><th>Runs</th></tr>${phaseRows}</table>
<h2>Change type</h2><table><tr><th>Type</th><th>Records</th><th>Findings</th><th>Saved min</th></tr>${changeRows}</table>
<h2>Rule effectiveness</h2><div class="filters"><input id="ruleFilter" placeholder="rule filter"><select id="severityFilter"><option value="">all severity</option><option>critical</option><option>error</option><option>warning</option><option>info</option><option>unknown</option></select></div><table><thead><tr><th>Rule</th><th>Severity</th><th>Findings</th><th>Accepted</th><th>Rejected</th><th>Investigation</th><th>Deferred</th><th>Acceptance</th></tr></thead><tbody id="ruleRows">${ruleRows}</tbody></table>
<h2>Warnings</h2>${warnings}
<script nonce="${nonce}">const vscode=acquireVsCodeApi();document.querySelectorAll('button[data-action]').forEach((button)=>button.addEventListener('click',()=>vscode.postMessage({type:'bazaarCampaignDashboard.action',action:button.dataset.action})));const ruleFilter=document.getElementById('ruleFilter');const severityFilter=document.getElementById('severityFilter');function applyFilter(){const rule=ruleFilter.value.trim().toLowerCase();const severity=severityFilter.value;document.querySelectorAll('#ruleRows tr').forEach((row)=>{row.hidden=Boolean(rule&&!row.dataset.rule.includes(rule)||severity&&row.dataset.severity!==severity)})}ruleFilter.addEventListener('input',applyFilter);severityFilter.addEventListener('change',applyFilter);</script></body></html>`
}

function renderErrorHtml(cspSource: string, nonce: string, message: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"></head><body><h1>Campaign Dashboard</h1><p>${escapeHtml(message)}</p><button id="refresh">再試行</button><script nonce="${nonce}">const vscode=acquireVsCodeApi();document.getElementById('refresh').addEventListener('click',()=>vscode.postMessage({type:'bazaarCampaignDashboard.action',action:'refresh'}));</script></body></html>`
}

function parseDashboardMessage(value: unknown): DashboardMessage | undefined {
  if (!value || typeof value !== "object") return undefined
  const message = value as Record<string, unknown>
  if (message.type !== "bazaarCampaignDashboard.action") return undefined
  if (message.action !== "refresh" && message.action !== "openJson" && message.action !== "openMarkdown" && message.action !== "openCsv") return undefined
  return { type: "bazaarCampaignDashboard.action", action: message.action }
}

async function pickWorkspaceRoot(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? []
  if (folders.length === 1) return folders[0].uri.fsPath
  const picked = await vscode.window.showWorkspaceFolderPick({ placeHolder: "Campaign Dashboardのworkspaceを選択" })
  return picked?.uri.fsPath
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character))
}
