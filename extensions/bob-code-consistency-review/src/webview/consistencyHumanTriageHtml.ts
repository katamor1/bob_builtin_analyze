import type { HumanTriageViewItem } from "../triage/triageTypes"
import { confidenceLabel, humanDecisionLabel, severityLabel, sourceTypeLabel } from "./displayLabels"

export type ConsistencyHumanTriageItem = HumanTriageViewItem

export interface ConsistencyHumanTriageModel {
  outDir: string
  bobOutputPath: string
  sourceSha256: string
  decisionRevision: number
  items: ConsistencyHumanTriageItem[]
  issues: string[]
}

export interface RenderConsistencyHumanTriageHtmlInput {
  cspSource: string
  nonce: string
  renderToken?: string
  model: ConsistencyHumanTriageModel
}

const DECISIONS = ["accepted", "rejected", "needs_investigation", "deferred", "question"] as const
const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const

export function renderConsistencyHumanTriageHtml(input: RenderConsistencyHumanTriageHtmlInput): string {
  const { model } = input
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escapeHtml(input.cspSource)} 'unsafe-inline'; script-src 'nonce-${escapeHtml(input.nonce)}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>指摘確認・振り分け</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 18px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    h3 { font-size: 14px; margin: 0; }
    .card, .triage-item { border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); border-radius: 6px; padding: 12px; margin-top: 12px; }
    .actions, .fields, .metadata { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    button { border: 0; padding: 7px 11px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    input, select, textarea { color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 6px; box-sizing: border-box; }
    textarea { min-height: 62px; width: 100%; }
    .field { display: flex; flex-direction: column; gap: 4px; min-width: 180px; flex: 1 1 180px; }
    .wide { flex-basis: 100%; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .status { white-space: pre-wrap; margin-top: 10px; }
    .error { color: var(--vscode-errorForeground); }
    .ok { color: var(--vscode-testing-iconPassed); }
    .source-context { margin-top: 8px; padding: 8px; background: var(--vscode-editor-background); border-radius: 4px; }
    .source-context p { margin: 5px 0; white-space: pre-wrap; }
    .evidence { margin: 6px 0 0; padding-left: 20px; }
    .follow-up { align-items: end; }
    code { font-family: var(--vscode-editor-font-family); }
  </style>
</head>
<body>
  <nav class="actions" aria-label="レビュー工程">
    <button type="button" class="secondary" data-stage="review">レビュー準備</button>
    <button type="button" class="secondary" data-stage="traceability">トレーサビリティ整理</button>
    <button type="button" class="secondary" data-stage="review-result-capture">レビュー結果取り込み</button>
    <button type="button" data-stage="triage" aria-current="page" disabled>指摘確認・振り分け</button>
  </nav>
  <h1>指摘確認・振り分け</h1>
  <section class="card">
    <h2>対象</h2>
    <div class="muted">Bob 出力: ${escapeHtml(model.bobOutputPath)} / 判定成果物: ${escapeHtml(model.outDir)}</div>
    <div class="muted">元データ: ${escapeHtml(shortHash(model.sourceSha256))} / 判定版: ${model.decisionRevision}</div>
    <div class="actions">
      <button type="button" data-action="generateTriage">判定一覧を作成</button>
      <button type="button" data-action="saveDecisions"${model.sourceSha256 ? "" : " disabled"}>判定内容を保存</button>
      <button type="button" class="secondary" data-action="openResultCapture">Bob 出力の取り込みへ戻る</button>
    </div>
  </section>
  <section class="card">
    <h2>指摘確認・振り分け</h2>
    ${model.items.length === 0 ? `<div class="muted">判定一覧を作成すると item が表示されます。</div>` : model.items.map(renderItem).join("")}
  </section>
  <section class="card">
    <h2>検証結果</h2>
    <div id="status" class="status ${model.issues.length > 0 ? "error" : "muted"}">${escapeHtml(model.issues.join("\n") || "未実行")}</div>
  </section>
  <script nonce="${escapeHtml(input.nonce)}">
    const vscode = acquireVsCodeApi();
    const renderToken = ${scriptValue(input.renderToken ?? "")};
    const sourceSha256 = ${scriptValue(model.sourceSha256)};
    const decisionRevision = ${model.decisionRevision};
    document.addEventListener('click', (event) => {
      const stageButton = event.target && event.target.closest ? event.target.closest('button[data-stage]') : undefined;
      if (stageButton && !stageButton.disabled) {
        vscode.postMessage({ type: 'consistencyReview.navigate', fromStage: 'triage', stage: stageButton.dataset.stage, renderToken });
        return;
      }
      const button = event.target && event.target.closest ? event.target.closest('button[data-action]') : undefined;
      if (!button || button.disabled) return;
      button.disabled = true;
      vscode.postMessage({
        type: 'consistencyHumanTriage.action',
        action: button.dataset.action,
        sourceSha256,
        decisionRevision,
        items: collectItems(),
        renderToken
      });
      setTimeout(() => { button.disabled = false; }, 1200);
    });
    function collectItems() {
      return Array.from(document.querySelectorAll('[data-triage-row]')).map((row) => ({
        source_id: row.dataset.sourceId,
        decision: row.querySelector('[data-field="decision"]').value,
        final_severity: row.querySelector('[data-field="final_severity"]').value,
        owner: row.querySelector('[data-field="owner"]').value,
        reason: row.querySelector('[data-field="reason"]').value,
        review_comment: row.querySelector('[data-field="review_comment"]').value,
        suggested_recipient: row.querySelector('[data-field="suggested_recipient"]').value,
        follow_up: {
          required: row.querySelector('[data-field="follow_up_required"]').checked,
          action: row.querySelector('[data-field="follow_up_action"]').value,
          due: row.querySelector('[data-field="follow_up_due"]').value
        }
      }));
    }
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

function renderItem(item: ConsistencyHumanTriageItem): string {
  const followUp = item.follow_up ?? {}
  return `<article class="triage-item" data-triage-row data-source-id="${escapeHtml(item.source_id)}">
    <h3><code>${escapeHtml(item.source_id)}</code> ${escapeHtml(item.summary ?? "")}</h3>
    <div class="metadata muted">${[
      item.source_type ? sourceTypeLabel(item.source_type) : undefined,
      item.category,
      item.severity ? `重大度: ${severityLabel(item.severity)}` : undefined,
      item.confidence ? `確信度: ${confidenceLabel(item.confidence)}` : undefined
    ].filter(Boolean).map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div>
    <div class="source-context">
      ${sourceLine("Bob の判断理由", item.source_reason)}
      ${sourceLine("影響", item.impact)}
      ${sourceLine("推奨対応", item.recommended_action ?? item.suggested_action)}
      ${sourceLine("推奨担当者", item.suggested_owner)}
      ${sourceLine("人による確認ポイント", item.human_check)}
      ${renderEvidence(item)}
    </div>
    <div class="fields">
      <label class="field">判定<select data-field="decision">${decisionOptions(item.decision)}</select></label>
      <label class="field">最終重大度<select data-field="final_severity">${severityOptions(item.final_severity)}</select></label>
      <label class="field">担当者<input data-field="owner" value="${escapeHtml(item.owner ?? "")}"></label>
      <label class="field">連絡先候補<input data-field="suggested_recipient" value="${escapeHtml(item.suggested_recipient ?? "")}"></label>
      <label class="field wide">判定理由<textarea data-field="reason">${escapeHtml(item.reason ?? "")}</textarea></label>
      <label class="field wide">レビューコメント<textarea data-field="review_comment">${escapeHtml(item.review_comment ?? "")}</textarea></label>
    </div>
    <div class="fields follow-up">
      <label><input type="checkbox" data-field="follow_up_required"${followUp.required ? " checked" : ""}> 後続対応が必要</label>
      <label class="field">後続対応<input data-field="follow_up_action" value="${escapeHtml(followUp.action ?? "")}"></label>
      <label class="field">期限<input type="date" data-field="follow_up_due" value="${escapeHtml(followUp.due ?? "")}"></label>
    </div>
  </article>`
}

function decisionOptions(selected: string | undefined): string {
  return [
    `<option value=""${selected ? "" : " selected"}>未判断</option>`,
    ...DECISIONS.map((decision) => `<option value="${decision}"${decision === selected ? " selected" : ""}>${escapeHtml(humanDecisionLabel(decision))}</option>`)
  ].join("")
}

function severityOptions(selected: string | undefined): string {
  return [
    `<option value=""${selected ? "" : " selected"}>未設定</option>`,
    ...SEVERITIES.map((severity) => `<option value="${severity}"${severity === selected ? " selected" : ""}>${escapeHtml(severityLabel(severity))}</option>`)
  ].join("")
}

function renderEvidence(item: ConsistencyHumanTriageItem): string {
  if (item.evidence.length === 0) return ""
  return `<div class="muted">根拠</div><ul class="evidence">${item.evidence.map((evidence) => `<li><code>${escapeHtml(evidence.evidence_id ?? "ID なし")}</code> ${escapeHtml(evidence.type ?? "")} ${escapeHtml(evidence.ref ?? "")}</li>`).join("")}</ul>`
}

function sourceLine(label: string, value: string | undefined): string {
  return value ? `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>` : ""
}

function shortHash(value: string): string {
  return value ? value.slice(0, 12) : "未生成"
}

function scriptValue(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
