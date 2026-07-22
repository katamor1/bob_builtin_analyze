import type {
  CampaignDashboard,
  CampaignDashboardChangeTypeTrend,
  CampaignDashboardRuleTrend,
  CampaignDashboardRun,
  CampaignDashboardWarning
} from "../dashboard/campaignDashboardTypes"
import { nextReviewActionLabel, reviewDecisionLabel, reviewRunStatusLabel, targetModeLabel } from "./displayLabels"

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
  renderToken: string
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
  <title>Bazaar レビュー実績</title>
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
  <nav class="toolbar" aria-label="Bazaar レビュー工程">
    <button type="button" class="secondary" data-stage="review">レビュー</button>
    <button type="button" class="secondary" data-stage="review-result-capture">レビュー結果取り込み</button>
    <button type="button" class="secondary" data-stage="triage">指摘確認・振り分け</button>
    <button type="button" data-stage="review-results" aria-current="page">レビュー実績</button>
  </nav>
  <h1>レビュー実績</h1>
  <div class="muted">レビュー実行、指摘確認・振り分け、規約、変更種別、所要時間を保存済み成果物から集計します。</div>
  <div class="toolbar">
    <div class="field">
      <label for="campaignId" class="muted">キャンペーン ID <code>campaign_id</code></label>
      <select id="campaignId"${model.campaigns.length === 0 ? " disabled" : ""}>
        ${model.campaigns.length === 0 ? `<option value="">レビューキャンペーンがありません</option>` : model.campaigns.map((campaignId) => `<option value="${escapeHtml(campaignId)}"${campaignId === model.selectedCampaignId ? " selected" : ""}>${escapeHtml(campaignId)}</option>`).join("")}
      </select>
    </div>
    <button type="button" data-action="refresh">再読み込み</button>
    <button type="button" class="secondary" data-action="export"${dashboard ? "" : " disabled"}>JSON／Markdown／CSV で書き出す</button>
  </div>
  <div class="muted">ワークスペース: ${escapeHtml(model.workspaceRoot ?? "未選択")}</div>
  ${dashboard ? renderDashboard(dashboard) : `<div class="empty">表示できるレビューキャンペーンのデータがありません。</div>`}
  ${model.exportedPaths ? `<section class="card"><h2>書き出したファイル</h2><div><code>${escapeHtml(model.exportedPaths.jsonPath)}</code></div><div><code>${escapeHtml(model.exportedPaths.markdownPath)}</code></div><div><code>${escapeHtml(model.exportedPaths.csvPath)}</code></div></section>` : ""}
  <div id="status" class="status ${model.error ? "error" : model.status ? "ok" : "muted"}">${escapeHtml(model.error ?? model.status ?? "")}</div>
  <script nonce="${escapeHtml(input.nonce)}">
    const vscode = acquireVsCodeApi();
    const renderToken = ${JSON.stringify(input.renderToken)};
    const postMessage = (message) => vscode.postMessage({ ...message, renderToken });
    const campaign = document.getElementById('campaignId');
    campaign.addEventListener('change', () => {
      postMessage({ type: 'campaignDashboard.selectCampaign', campaignId: campaign.value });
    });
    document.addEventListener('click', (event) => {
      const stageButton = event.target && event.target.closest ? event.target.closest('button[data-stage]') : undefined;
      if (stageButton) {
        postMessage({ type: 'bazaarReview.navigate', fromStage: 'review-results', stage: stageButton.dataset.stage });
        return;
      }
      const button = event.target && event.target.closest ? event.target.closest('button[data-action]') : undefined;
      if (!button || button.disabled) return;
      const action = button.dataset.action;
      if (action === 'refresh') postMessage({ type: 'campaignDashboard.refresh' });
      if (action === 'export') postMessage({ type: 'campaignDashboard.export' });
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
    <h2>判定待ち</h2>
    ${renderRunTable(dashboard.triage_pending, true)}
    <h2>レビュー実行</h2>
    ${renderRunTable(dashboard.runs, false)}
    <h2>規約別の傾向</h2>
    ${renderRuleTable(dashboard.rule_trends)}
    <h2>変更種別の傾向</h2>
    ${renderChangeTypeTable(dashboard.change_type_trends)}
    <h2>所要時間</h2>
    <div class="kpis">
      ${kpi("従来レビュー", overview.baseline_review_minutes_total, "分")}
      ${kpi("Bob レビュー", overview.bob_review_minutes_total, "分")}
      ${kpi("指摘確認・振り分け", overview.human_triage_minutes_total, "分")}
      ${kpi("推定削減時間", overview.estimated_minutes_saved, "分")}
    </div>
    <h2>注意事項</h2>
    ${renderWarnings(dashboard.warnings)}`
}

function renderOverview(dashboard: CampaignDashboard): string {
  const overview = dashboard.overview
  return `<section aria-labelledby="overview-heading">
    <h2 id="overview-heading">概要</h2>
    <div class="muted">キャンペーン: ${escapeHtml(dashboard.campaign_id)} · 生成日時: ${escapeHtml(dashboard.generated_at)}</div>
    <div class="kpis">
      ${kpi("レビュー実行", overview.review_runs_total)}
      ${kpi("完了", overview.completed_runs)}
      ${kpi("実行中", overview.in_progress_runs)}
      ${kpi("判定待ち", overview.triage_pending)}
      ${kpi("形式検証率", formatRate(overview.schema_validation_rate))}
      ${kpi("指摘の採用率", formatRate(overview.finding_acceptance_rate))}
      ${kpi("指摘の却下率", formatRate(overview.finding_rejection_rate))}
      ${kpi("指摘の判定完了率", formatRate(overview.finding_resolution_rate))}
    </div>
  </section>`
}

function kpi(label: string, value: string | number, suffix = ""): string {
  return `<div class="kpi"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(value)}${suffix ? ` <span class="muted">${escapeHtml(suffix)}</span>` : ""}</strong></div>`
}

function renderRunTable(runs: CampaignDashboardRun[], pending: boolean): string {
  if (runs.length === 0) return `<div class="empty">${pending ? "判定待ちはありません" : "レビュー実行はありません"}</div>`
  return `<div class="table-wrap"><table>
    <thead><tr><th>レビュー ID</th><th>状態</th><th>変更種別</th><th>指摘確認・振り分け</th><th>形式検証</th><th>次の操作</th><th>所要時間</th><th>更新日時</th></tr></thead>
    <tbody>${runs.map((run) => `<tr>
      <td><code>${escapeHtml(run.review_id)}</code></td>
      <td>${escapeHtml(reviewRunStatusLabel(run.status))}</td>
      <td>${escapeHtml(targetModeLabel(run.target_mode))}</td>
      <td>${escapeHtml(reviewRunStatusLabel(run.triage_status))}</td>
      <td>${run.schema_valid === null ? "未確認" : run.schema_valid ? "有効" : "無効"}</td>
      <td>${escapeHtml(nextReviewActionLabel(run.next_action))}</td>
      <td>${escapeHtml(run.metrics_source)}; Bob ${escapeHtml(run.bob_review_minutes)}分; 人 ${escapeHtml(run.human_triage_minutes)}分</td>
      <td>${escapeHtml(run.updated_at)}</td>
    </tr>`).join("")}</tbody>
  </table></div>`
}

function renderRuleTable(trends: CampaignDashboardRuleTrend[]): string {
  if (trends.length === 0) return `<div class="empty">規約別の傾向データはありません</div>`
  return `<div class="table-wrap"><table>
    <thead><tr><th>規約 ID</th><th>表示名</th><th>検出数</th><th>採用</th><th>却下</th><th>要調査</th><th>保留</th><th>採用率</th></tr></thead>
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
  if (trends.length === 0) return `<div class="empty">変更種別の傾向データはありません</div>`
  return `<div class="table-wrap"><table>
    <thead><tr><th>変更種別</th><th>実行数</th><th>完了</th><th>判定待ち</th><th>指摘数</th><th>採用</th><th>却下</th><th>採用率</th><th>削減時間（分）</th></tr></thead>
    <tbody>${trends.map((trend) => `<tr>
      <td>${escapeHtml(targetModeLabel(trend.change_type))}</td>
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
  if (warnings.length === 0) return `<div class="empty">注意事項はありません</div>`
  return `<div class="table-wrap"><table>
    <thead><tr><th>コード</th><th>レビュー ID</th><th>成果物</th><th>内容</th></tr></thead>
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
