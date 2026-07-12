import type {
  CampaignDashboard,
  CampaignDashboardChangeTypeTrend,
  CampaignDashboardRuleTrend,
  CampaignDashboardRun,
  CampaignDashboardWarning
} from "../dashboard/campaignDashboardTypes"

export interface CampaignDashboardGuiModel {
  workspaceRoot?: string
  campaigns: string[]
  selectedCampaignId?: string
  dashboard?: CampaignDashboard
  status?: string
  error?: string
  exportedPaths?: {
    jsonPath: string
    markdownPath: string
    csvPath: string
  }
}

export interface RenderCampaignDashboardHtmlInput {
  cspSource: string
  nonce: string
  model: CampaignDashboardGuiModel
}

export function renderCampaignDashboardHtml(input: RenderCampaignDashboardHtmlInput): string {
  const { model } = input
  const dashboard = model.dashboard
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escapeHtml(input.cspSource)} 'unsafe-inline'; script-src 'nonce-${escapeHtml(input.nonce)}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bob Bazaar Campaign Dashboard</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 18px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    h2 { font-size: 16px; margin: 22px 0 8px; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: end; margin: 14px 0; }
    .field { display: flex; flex-direction: column; gap: 4px; min-width: 260px; flex: 1 1 320px; }
    select { color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 7px; }
    button { border: 0; padding: 7px 12px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button:disabled { opacity: 0.55; cursor: default; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
    .kpi, .card { border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); border-radius: 6px; padding: 11px; }
    .kpi strong { display: block; font-size: 22px; margin-top: 4px; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; min-width: 720px; }
    th, td { border-bottom: 1px solid var(--vscode-panel-border); padding: 7px; text-align: left; vertical-align: top; }
    th { color: var(--vscode-descriptionForeground); font-weight: 600; position: sticky; top: 0; background: var(--vscode-sideBar-background); }
    tr:last-child td { border-bottom: 0; }
    code { font-family: var(--vscode-editor-font-family); }
    .status { white-space: pre-wrap; margin-top: 10px; }
    .error { color: var(--vscode-errorForeground); }
    .ok { color: var(--vscode-testing-iconPassed); }
    .bar { height: 5px; margin-top: 4px; background: var(--vscode-progressBar-background); max-width: 100%; }
    .empty { padding: 12px; border: 1px dashed var(--vscode-panel-border); color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <h1>Campaign Dashboard</h1>
  <div class="muted">Review Run、Human Triage、rule、target mode、時間指標をsource artifactから集計します。</div>
  <div class="toolbar">
    <div class="field">
      <label for="campaignId" class="muted">campaign_id</label>
      <select id="campaignId"${model.campaigns.length === 0 ? " disabled" : ""}>
        ${model.campaigns.length === 0 ? `<option value="">campaignがありません</option>` : model.campaigns.map((campaignId) => `<option value="${escapeHtml(campaignId)}"${campaignId === model.selectedCampaignId ? " selected" : ""}>${escapeHtml(campaignId)}</option>`).join("")}
      </select>
    </div>
    <button type="button" data-action="refresh">再読込</button>
    <button type="button" class="secondary" data-action="export"${dashboard ? "" : " disabled"}>JSON / Markdown / CSV export</button>
  </div>
  <div class="muted">workspace: ${escapeHtml(model.workspaceRoot ?? "未選択")}</div>
  ${dashboard ? renderDashboard(dashboard) : `<div class="empty">表示できるcampaign dataがありません。</div>`}
  ${model.exportedPaths ? `<section class="card"><h2>Exports</h2><div><code>${escapeHtml(model.exportedPaths.jsonPath)}</code></div><div><code>${escapeHtml(model.exportedPaths.markdownPath)}</code></div><div><code>${escapeHtml(model.exportedPaths.csvPath)}</code></div></section>` : ""}
  <div id="status" class="status ${model.error ? "error" : model.status ? "ok" : "muted"}">${escapeHtml(model.error ?? model.status ?? "")}</div>
  <script nonce="${escapeHtml(input.nonce)}">
    const vscode = acquireVsCodeApi();
    const campaign = document.getElementById('campaignId');
    campaign.addEventListener('change', () => {
      vscode.postMessage({ type: 'campaignDashboard.selectCampaign', campaignId: campaign.value });
    });
    document.addEventListener('click', (event) => {
      const button = event.target && event.target.closest ? event.target.closest('button[data-action]') : undefined;
      if (!button || button.disabled) return;
      const action = button.dataset.action;
      if (action === 'refresh') vscode.postMessage({ type: 'campaignDashboard.refresh' });
      if (action === 'export') vscode.postMessage({ type: 'campaignDashboard.export' });
    });
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      const status = document.getElementById('status');
      status.className = 'status ' + (message.ok ? 'ok' : 'error');
      status.textContent = message.message || '';
    });
  </script>
</body>
</html>`
}

function renderDashboard(dashboard: CampaignDashboard): string {
  const overview = dashboard.overview
  return `${renderOverview(dashboard)}
    <h2>Human Triage Pending</h2>
    ${renderRunTable(dashboard.triage_pending, true)}
    <h2>Review Runs</h2>
    ${renderRunTable(dashboard.runs, false)}
    <h2>Rule Trends</h2>
    ${renderRuleTable(dashboard.rule_trends)}
    <h2>Change Type Trends</h2>
    ${renderChangeTypeTable(dashboard.change_type_trends)}
    <h2>Time</h2>
    <div class="kpis">
      ${kpi("Baseline review", overview.baseline_review_minutes_total, "min")}
      ${kpi("Bob review", overview.bob_review_minutes_total, "min")}
      ${kpi("Human Triage", overview.human_triage_minutes_total, "min")}
      ${kpi("Estimated saved", overview.estimated_minutes_saved, "min")}
    </div>
    <h2>Warnings</h2>
    ${renderWarnings(dashboard.warnings)}`
}

function renderOverview(dashboard: CampaignDashboard): string {
  const overview = dashboard.overview
  return `<section aria-labelledby="overview-heading">
    <h2 id="overview-heading">Overview</h2>
    <div class="muted">campaign: ${escapeHtml(dashboard.campaign_id)} · generated: ${escapeHtml(dashboard.generated_at)}</div>
    <div class="kpis">
      ${kpi("Review Runs", overview.review_runs_total)}
      ${kpi("Completed", overview.completed_runs)}
      ${kpi("In progress", overview.in_progress_runs)}
      ${kpi("Triage pending", overview.triage_pending)}
      ${kpi("Schema validation", formatRate(overview.schema_validation_rate))}
      ${kpi("Finding acceptance", formatRate(overview.finding_acceptance_rate))}
      ${kpi("Finding rejection", formatRate(overview.finding_rejection_rate))}
      ${kpi("Finding resolution", formatRate(overview.finding_resolution_rate))}
    </div>
  </section>`
}

function kpi(label: string, value: string | number, suffix = ""): string {
  return `<div class="kpi"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(value)}${suffix ? ` <span class="muted">${escapeHtml(suffix)}</span>` : ""}</strong></div>`
}

function renderRunTable(runs: CampaignDashboardRun[], pending: boolean): string {
  if (runs.length === 0) return `<div class="empty">${pending ? "triage pendingなし" : "Review Runなし"}</div>`
  return `<div class="table-wrap"><table>
    <thead><tr><th>review_id</th><th>status</th><th>target mode</th><th>triage</th><th>schema</th><th>next</th><th>metrics</th><th>updated</th></tr></thead>
    <tbody>${runs.map((run) => `<tr>
      <td><code>${escapeHtml(run.review_id)}</code></td>
      <td>${escapeHtml(run.status)}</td>
      <td>${escapeHtml(run.target_mode)}</td>
      <td>${escapeHtml(run.triage_status)}</td>
      <td>${run.schema_valid === null ? "n/a" : escapeHtml(run.schema_valid)}</td>
      <td>${escapeHtml(run.next_action)}</td>
      <td>${escapeHtml(run.metrics_source)}; Bob ${escapeHtml(run.bob_review_minutes)} min; Human ${escapeHtml(run.human_triage_minutes)} min</td>
      <td>${escapeHtml(run.updated_at)}</td>
    </tr>`).join("")}</tbody>
  </table></div>`
}

function renderRuleTable(trends: CampaignDashboardRuleTrend[]): string {
  if (trends.length === 0) return `<div class="empty">rule trend dataなし</div>`
  return `<div class="table-wrap"><table>
    <thead><tr><th>rule_id</th><th>title</th><th>detected</th><th>accepted</th><th>rejected</th><th>investigation</th><th>deferred</th><th>accept rate</th></tr></thead>
    <tbody>${trends.map((trend) => `<tr>
      <td><code>${escapeHtml(trend.rule_id)}</code></td>
      <td>${escapeHtml(trend.title ?? "")}</td>
      <td>${trend.detected_count}</td>
      <td>${trend.accepted}</td>
      <td>${trend.rejected}</td>
      <td>${trend.needs_investigation}</td>
      <td>${trend.deferred}</td>
      <td>${formatRate(trend.acceptance_rate)}<div class="bar" style="width:${rateWidth(trend.acceptance_rate)}%" aria-hidden="true"></div></td>
    </tr>`).join("")}</tbody>
  </table></div>`
}

function renderChangeTypeTable(trends: CampaignDashboardChangeTypeTrend[]): string {
  if (trends.length === 0) return `<div class="empty">change type dataなし</div>`
  return `<div class="table-wrap"><table>
    <thead><tr><th>change type</th><th>runs</th><th>completed</th><th>triage pending</th><th>findings</th><th>accepted</th><th>rejected</th><th>accept rate</th><th>saved min</th></tr></thead>
    <tbody>${trends.map((trend) => `<tr>
      <td>${escapeHtml(trend.change_type)}</td>
      <td>${trend.review_runs}</td>
      <td>${trend.completed_runs}</td>
      <td>${trend.triage_pending}</td>
      <td>${trend.findings_total}</td>
      <td>${trend.accepted}</td>
      <td>${trend.rejected}</td>
      <td>${formatRate(trend.acceptance_rate)}</td>
      <td>${trend.estimated_minutes_saved}</td>
    </tr>`).join("")}</tbody>
  </table></div>`
}

function renderWarnings(warnings: CampaignDashboardWarning[]): string {
  if (warnings.length === 0) return `<div class="empty">warningなし</div>`
  return `<div class="table-wrap"><table>
    <thead><tr><th>code</th><th>review_id</th><th>artifact</th><th>message</th></tr></thead>
    <tbody>${warnings.map((warning) => `<tr><td><code>${escapeHtml(warning.code)}</code></td><td>${escapeHtml(warning.review_id ?? "")}</td><td>${escapeHtml(warning.artifact ?? "")}</td><td>${escapeHtml(warning.message)}</td></tr>`).join("")}</tbody>
  </table></div>`
}

function formatRate(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`
}

function rateWidth(value: number | null): number {
  if (value === null) return 0
  return Math.max(0, Math.min(100, value * 100))
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
