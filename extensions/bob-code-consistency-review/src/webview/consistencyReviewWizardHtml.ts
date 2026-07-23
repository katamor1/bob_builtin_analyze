import {
  CHANGE_TYPE_VALUES,
  REVIEW_FOCUS_VALUES,
  VCS_VALUES,
  type ChangeType,
  type ReviewFocus,
  type VcsKind
} from "../core/reviewInputBuilder"
import type { ReviewInputDocumentCandidate } from "../core/reviewInputDiscovery"
import { artifactKindLabel, changeTypeLabel, reviewFocusLabel, traceabilityStatusLabel } from "./displayLabels"

export interface ConsistencyWizardTraceabilitySummary {
  proposed: number
  accepted: number
  rejected: number
  deprecated: number
  errors: number
  warnings: number
}

export interface ConsistencyWizardPackageFile {
  label: string
  path: string
}

export interface ConsistencyWizardInitializationStatus {
  initialized: boolean
  workflowPath: string
  missing: string[]
}

export interface ConsistencyWizardStatusNotice {
  tone: "muted" | "warning" | "ok"
  message: string
}

export interface ConsistencyReviewWizardModel {
  workspaceRoot: string
  base: string
  head: string
  vcs: VcsKind
  changeType: ChangeType
  focus: ReviewFocus[]
  documents: ReviewInputDocumentCandidate[]
  traceability: ConsistencyWizardTraceabilitySummary
  packagePreview: ConsistencyWizardPackageFile[]
  initialization: ConsistencyWizardInitializationStatus
  warnings: string[]
  status: ConsistencyWizardStatusNotice
}

export interface RenderConsistencyReviewWizardHtmlInput {
  cspSource: string
  nonce: string
  renderToken?: string
  model: ConsistencyReviewWizardModel
}

export function renderConsistencyReviewWizardHtml(input: RenderConsistencyReviewWizardHtmlInput): string {
  const { model } = input
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escapeHtml(input.cspSource)} 'unsafe-inline'; script-src 'nonce-${escapeHtml(input.nonce)}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>整合プレレビューを開始</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 18px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    .card { border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); border-radius: 6px; padding: 12px; margin-top: 12px; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; }
    .field { display: flex; flex-direction: column; gap: 4px; min-width: 180px; flex: 1 1 180px; }
    label, .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    input, select { color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 7px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    button { border: 0; padding: 7px 11px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
    .doc { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; background: var(--vscode-editor-background); }
    .focus { display: inline-flex; align-items: center; gap: 4px; margin: 4px 10px 4px 0; }
    .status { white-space: pre-wrap; margin-top: 10px; }
    .warning { color: var(--vscode-editorWarning-foreground); }
    .ok { color: var(--vscode-testing-iconPassed); }
    code { font-family: var(--vscode-editor-font-family); }
  </style>
</head>
<body>
  <nav class="actions" aria-label="レビュー工程">
    <button type="button" data-stage="review" aria-current="page" disabled>レビュー準備</button>
    <button type="button" class="secondary" data-stage="traceability">トレーサビリティ整理</button>
    <button type="button" class="secondary" data-stage="review-result-capture">レビュー結果取り込み</button>
    <button type="button" class="secondary" data-stage="triage">指摘確認・振り分け</button>
  </nav>
  <h1>整合プレレビューを開始</h1>
  ${renderWorkspaceInitialization(model.initialization)}
  <section class="card">
    <h2>変更範囲</h2>
    <div class="row">
      <div class="field"><label for="reviewId">レビュー ID <code>review_id</code></label><input id="reviewId" value="code-consistency-review"></div>
      <div class="field"><label for="reviewTitle">表示名 <code>title</code></label><input id="reviewTitle" value="コード整合プレレビュー"></div>
      <div class="field"><label for="vcs">バージョン管理</label><select id="vcs">${VCS_VALUES.map((value) => option(value, model.vcs, vcsLabel(value))).join("")}</select></div>
      <div class="field"><label for="changeType">変更種別 <code>change_type</code></label><select id="changeType">${CHANGE_TYPE_VALUES.map((value) => option(value, model.changeType, changeTypeLabel(value))).join("")}</select></div>
      <div class="field"><label for="base">比較元 <code>base</code></label><input id="base" value="${escapeHtml(model.base)}"></div>
      <div class="field"><label for="head">比較先 <code>head</code></label><input id="head" value="${escapeHtml(model.head)}"></div>
    </div>
  </section>
  <section class="card">
    <h2>関連資料の選択</h2>
    <div class="grid">${model.documents.length === 0 ? `<div class="muted">文書候補はありません。</div>` : model.documents.map(renderDocument).join("")}</div>
  </section>
  <section class="card">
    <h2>確認観点</h2>
    ${REVIEW_FOCUS_VALUES.map((focus) => `<label class="focus"><input type="checkbox" data-focus="${focus}"${model.focus.includes(focus) ? " checked" : ""}>${escapeHtml(reviewFocusLabel(focus))}</label>`).join("")}
  </section>
  <section class="card">
    <h2>トレーサビリティ整理</h2>
    <div class="muted">${traceabilityStatusLabel("proposed")} ${model.traceability.proposed}件 / ${traceabilityStatusLabel("accepted")} ${model.traceability.accepted}件 / ${traceabilityStatusLabel("rejected")} ${model.traceability.rejected}件 / ${traceabilityStatusLabel("deprecated")} ${model.traceability.deprecated}件 / エラー ${model.traceability.errors}件 / 警告 ${model.traceability.warnings}件</div>
    <div class="actions">
      <button type="button" data-action="openTraceabilityPrep">トレーサビリティ整理を開く</button>
      <button type="button" class="secondary" data-action="createReviewInputFromTraceability">トレーサビリティから review-input を作成</button>
      <button type="button" class="secondary" data-action="validateTraceability">トレーサビリティを検証</button>
    </div>
  </section>
  <section class="card">
    <h2>Bob に渡す資料</h2>
    ${model.packagePreview.length === 0 ? `<div class="muted">Bob に渡すレビュー資料はまだ作成されていません。</div>` : `<ul>${model.packagePreview.map((file) => `<li><code>${escapeHtml(file.path)}</code></li>`).join("")}</ul>`}
    <div class="actions">
      <button type="button" data-action="createReviewInput">選択内容から review-input を作成</button>
      <button type="button" data-action="preprocess">Bob に渡すレビュー資料を作成</button>
      <button type="button" class="secondary" data-action="openResultCapture">Bob 出力の取り込みへ進む</button>
      <button type="button" class="secondary" data-action="openHumanTriage">指摘確認・振り分けへ進む</button>
    </div>
  </section>
  <section class="card">
    <h2>実行結果</h2>
    <div id="status" class="status ${escapeHtml(model.status.tone)}">${escapeHtml(model.status.message)}</div>
  </section>
  <script nonce="${escapeHtml(input.nonce)}">
    const vscode = acquireVsCodeApi();
    const renderToken = ${scriptValue(input.renderToken ?? "")};
    document.addEventListener('click', (event) => {
      const stageButton = event.target && event.target.closest ? event.target.closest('button[data-stage]') : undefined;
      if (stageButton && !stageButton.disabled) {
        vscode.postMessage({ type: 'consistencyReview.navigate', fromStage: 'review', stage: stageButton.dataset.stage, renderToken });
        return;
      }
      const button = event.target && event.target.closest ? event.target.closest('button[data-action]') : undefined;
      if (!button) return;
      button.disabled = true;
      vscode.postMessage({ type: 'consistencyWizard.action', action: button.dataset.action, draft: collectDraft(), renderToken });
      setTimeout(() => { button.disabled = false; }, 1200);
    });
    function collectDraft() {
      return {
        reviewId: document.getElementById('reviewId').value,
        reviewTitle: document.getElementById('reviewTitle').value,
        vcs: document.getElementById('vcs').value,
        changeType: document.getElementById('changeType').value,
        base: document.getElementById('base').value,
        head: document.getElementById('head').value,
        documentPaths: Array.from(document.querySelectorAll('[data-document-path]:checked')).map((item) => item.dataset.documentPath),
        focus: Array.from(document.querySelectorAll('[data-focus]:checked')).map((item) => item.dataset.focus)
      };
    }
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      const status = document.getElementById('status');
      status.className = 'status ' + (message.ok ? 'ok' : 'warning');
      status.textContent = message.message || '';
    });
  </script>
</body>
</html>`
}

function scriptValue(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
}

function renderWorkspaceInitialization(status: ConsistencyWizardInitializationStatus): string {
  if (status.initialized) return ""
  return `<section class="card">
    <h2 class="warning">.bob ワークフロー初期化: 未完了</h2>
    <div>コード整合プレレビュー用ワークフローを workspace に配置してください。</div>
    <ul>${status.missing.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join("")}</ul>
    <div class="actions"><button type="button" data-action="initializeWorkspace">.bob を初期化</button></div>
  </section>`
}

function renderDocument(candidate: ReviewInputDocumentCandidate): string {
  return `<label class="doc">
    <input type="checkbox" data-document-path="${escapeHtml(candidate.path)}" checked>
    <strong>${escapeHtml(candidate.label)}</strong>
    <div class="muted">${escapeHtml(artifactKindLabel(candidate.kind))} / ${escapeHtml(candidate.description ?? "")}</div>
  </label>`
}

function option(value: string, selected: string, label: string): string {
  return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`
}

function vcsLabel(value: string): string {
  if (value === "git") return "Git"
  if (value === "bazaar") return "Bazaar"
  if (value === "bzr") return "Bazaar（bzr）"
  return `不明（${value}）`
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
