import type { TriageDecision, TriageItem } from "../records/reviewRecordTypes"
import type {
  ReviewRunPhaseStatus,
  ReviewRunTrackedPhase
} from "../reviewRuns/reviewRunTypes"

export interface HumanTriageGuiModel {
  campaignId: string
  reviewId: string
  reviewResultJsonPath: string
  triagePath?: string
  reviewRunBound?: boolean
  reviewRunStatus?: "in_progress" | "completed"
  phaseStatuses?: Partial<Record<ReviewRunTrackedPhase, ReviewRunPhaseStatus>>
  baselineReviewMinutes?: number
  bobReviewMinutes?: number
  humanTriageMinutes?: number
  recordPath?: string
  summaryMarkdownPath?: string
  canFinalize?: boolean
  issues: string[]
  items: TriageItem[]
}

export interface RenderHumanTriageHtmlInput {
  cspSource: string
  nonce: string
  model: HumanTriageGuiModel
}

const DECISIONS: TriageDecision[] = ["accepted", "rejected", "needs_investigation", "deferred"]
const PHASES: ReviewRunTrackedPhase[] = ["target", "packet", "result", "triage", "record", "summary"]

export function renderHumanTriageHtml(input: RenderHumanTriageHtmlInput): string {
  const { model } = input
  const readonly = model.reviewRunBound ? " readonly" : ""
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escapeHtml(input.cspSource)} 'unsafe-inline'; script-src 'nonce-${escapeHtml(input.nonce)}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bob Bazaar Human Triage</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 18px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    .card { border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); border-radius: 6px; padding: 12px; margin-top: 12px; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; }
    .field { display: flex; flex-direction: column; gap: 4px; min-width: 180px; flex: 1 1 180px; }
    label, .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    input, select, textarea { color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 7px; }
    input[readonly] { opacity: 0.85; }
    textarea { min-height: 54px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    button { border: 0; padding: 7px 11px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button:disabled { opacity: 0.55; cursor: default; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid var(--vscode-panel-border); padding: 6px; text-align: left; vertical-align: top; }
    th { color: var(--vscode-descriptionForeground); font-weight: 500; }
    .status { white-space: pre-wrap; margin-top: 10px; }
    .error { color: var(--vscode-errorForeground); }
    .ok { color: var(--vscode-testing-iconPassed); }
    .phase-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(125px, 1fr)); gap: 6px; margin-top: 8px; }
    .phase { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 6px; }
    code { font-family: var(--vscode-editor-font-family); }
  </style>
</head>
<body>
  <h1>Human Triage</h1>
  <section class="card">
    <h2>対象</h2>
    ${model.reviewRunBound ? `<div class="muted">Active Review Runから引き継いだ値です。campaign / review / result pathの再入力は不要です。</div>` : ""}
    <div class="row">
      <div class="field">
        <label for="campaignId">campaign_id</label>
        <input id="campaignId" value="${escapeHtml(model.campaignId)}"${readonly}>
      </div>
      <div class="field">
        <label for="reviewId">review_id</label>
        <input id="reviewId" value="${escapeHtml(model.reviewId)}"${readonly}>
      </div>
      <div class="field">
        <label for="reviewResultJsonPath">review-result JSON</label>
        <input id="reviewResultJsonPath" value="${escapeHtml(model.reviewResultJsonPath)}"${readonly}>
      </div>
    </div>
    <div class="muted">triage: ${escapeHtml(model.triagePath ?? "未生成")}</div>
    ${model.reviewRunBound ? renderRunStatus(model) : ""}
    <div class="actions">
      ${model.reviewRunBound ? "" : `<button type="button" data-action="initCampaign">campaign を初期化</button>`}
      <button type="button" data-action="createTriage">triage 雛形を生成</button>
      <button type="button" class="secondary" data-action="validateTriage">triage を検証</button>
      ${model.reviewRunBound ? "" : `<button type="button" class="secondary" data-action="createRecord">record を作成</button><button type="button" class="secondary" data-action="generateSummary">summary 生成</button>`}
    </div>
  </section>
  ${model.reviewRunBound ? renderMetrics(model) : ""}
  <section class="card">
    <h2>Finding 採否判断</h2>
    ${model.items.length === 0 ? `<div class="muted">triage 雛形を生成すると finding が表示されます。</div>` : renderItemsTable(model.items)}
    <div class="actions">
      <button type="button" data-action="saveDecisions">すべて保存</button>
      ${model.reviewRunBound ? `<button type="button" data-action="finalizeReviewRun"${model.canFinalize === false || model.reviewRunStatus === "completed" ? " disabled" : ""}>Review Runを完了して集計</button>` : ""}
    </div>
  </section>
  <section class="card">
    <h2>検証結果</h2>
    <div id="status" class="status ${model.issues.length > 0 ? "error" : "muted"}">${escapeHtml(model.issues.join("\n") || (model.reviewRunStatus === "completed" ? "Review Runは完了しています。" : "未実行"))}</div>
  </section>
  <script nonce="${escapeHtml(input.nonce)}">
    const vscode = acquireVsCodeApi();
    const status = document.getElementById('status');
    document.addEventListener('click', (event) => {
      const button = event.target && event.target.closest ? event.target.closest('button[data-action]') : undefined;
      if (!button || button.disabled) return;
      const action = button.dataset.action;
      const items = collectItems();
      if (action === 'saveDecisions' || action === 'finalizeReviewRun') {
        const issues = validateDecisionItems(items);
        if (issues.length > 0) {
          status.className = 'status error';
          status.textContent = issues.join('\n');
          return;
        }
      }
      button.disabled = true;
      vscode.postMessage({
        type: 'bazaarHumanTriage.action',
        action,
        campaignId: document.getElementById('campaignId').value,
        reviewId: document.getElementById('reviewId').value,
        reviewResultJsonPath: document.getElementById('reviewResultJsonPath').value,
        baselineReviewMinutes: numberValue('baselineReviewMinutes'),
        bobReviewMinutes: numberValue('bobReviewMinutes'),
        humanTriageMinutes: numberValue('humanTriageMinutes'),
        items
      });
      setTimeout(() => { button.disabled = false; }, 1200);
    });
    function numberValue(id) {
      const element = document.getElementById(id);
      if (!element || element.value.trim() === '') return undefined;
      return Number(element.value);
    }
    function collectItems() {
      return Array.from(document.querySelectorAll('[data-triage-row]')).map((row) => ({
        finding_id: row.dataset.findingId,
        rule_id: row.dataset.ruleId || undefined,
        decision: row.querySelector('[data-field="decision"]').value,
        action: row.querySelector('[data-field="action"]').value,
        owner: row.querySelector('[data-field="owner"]').value,
        reason: row.querySelector('[data-field="reason"]').value
      }));
    }
    function validateDecisionItems(items) {
      const issues = [];
      items.forEach((item, index) => {
        const owner = item.owner.trim();
        const action = item.action.trim();
        const reason = item.reason.trim();
        if (item.decision === 'accepted' && !owner && !action) issues.push('items[' + index + ']: acceptedにはownerまたはactionが必要です。');
        if (item.decision === 'rejected' && !reason) issues.push('items[' + index + ']: rejectedにはreasonが必要です。');
        if (item.decision === 'needs_investigation' && !owner) issues.push('items[' + index + ']: needs_investigationにはownerが必要です。');
        if (item.decision === 'needs_investigation' && !action) issues.push('items[' + index + ']: needs_investigationにはactionが必要です。');
        if (item.decision === 'deferred' && !reason) issues.push('items[' + index + ']: deferredにはreasonが必要です。');
      });
      return issues;
    }
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      status.className = 'status ' + (message.ok ? 'ok' : 'error');
      status.textContent = message.message || '';
    });
  </script>
</body>
</html>`
}

function renderRunStatus(model: HumanTriageGuiModel): string {
  return `<div class="phase-grid" aria-label="Review Run phase status">${PHASES.map((phase) => `<div class="phase"><strong>${phase}</strong><div class="muted">${escapeHtml(model.phaseStatuses?.[phase] ?? "not_started")}</div></div>`).join("")}</div>
    <div class="muted">record: ${escapeHtml(model.recordPath ?? "未作成")}</div>
    <div class="muted">summary: ${escapeHtml(model.summaryMarkdownPath ?? "未作成")}</div>`
}

function renderMetrics(model: HumanTriageGuiModel): string {
  return `<section class="card">
    <h2>Review Run Metrics</h2>
    <div class="muted">自動計測値は確定前に補正できます。単位は分です。</div>
    <div class="row">
      <div class="field"><label for="baselineReviewMinutes">baseline review</label><input id="baselineReviewMinutes" type="number" min="0" step="0.1" value="${numberAttribute(model.baselineReviewMinutes)}"></div>
      <div class="field"><label for="bobReviewMinutes">Bob review</label><input id="bobReviewMinutes" type="number" min="0" step="0.1" value="${numberAttribute(model.bobReviewMinutes)}"></div>
      <div class="field"><label for="humanTriageMinutes">Human Triage</label><input id="humanTriageMinutes" type="number" min="0" step="0.1" value="${numberAttribute(model.humanTriageMinutes)}"></div>
    </div>
    <div class="actions"><button type="button" class="secondary" data-action="saveMetrics">metricsを保存</button></div>
  </section>`
}

function renderItemsTable(items: TriageItem[]): string {
  return `<table>
    <thead>
      <tr>
        <th>finding</th>
        <th>rule_id</th>
        <th>decision</th>
        <th>owner</th>
        <th>action</th>
        <th>reason</th>
      </tr>
    </thead>
    <tbody>${items.map(renderItemRow).join("")}</tbody>
  </table>`
}

function renderItemRow(item: TriageItem): string {
  return `<tr data-triage-row data-finding-id="${escapeHtml(item.finding_id)}" data-rule-id="${escapeHtml(item.rule_id ?? "")}">
    <td><code>${escapeHtml(item.finding_id)}</code></td>
    <td><code>${escapeHtml(item.rule_id ?? "")}</code></td>
    <td><select data-field="decision">${DECISIONS.map((decision) => `<option value="${decision}"${decision === item.decision ? " selected" : ""}>${decision}</option>`).join("")}</select></td>
    <td><input data-field="owner" value="${escapeHtml(item.owner ?? "")}"></td>
    <td><input data-field="action" value="${escapeHtml(item.action ?? "")}"></td>
    <td><textarea data-field="reason">${escapeHtml(item.reason ?? "")}</textarea></td>
  </tr>`
}

function numberAttribute(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "" : escapeHtml(String(value))
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
