import type { ReviewRunCommandInput } from "../reviewRuns/reviewRunTypes"

export interface RenderResultCaptureHtmlInput {
  cspSource: string
  nonce: string
  reviewRun?: ReviewRunCommandInput
}

export function renderResultCaptureHtml(input: RenderResultCaptureHtmlInput): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escapeHtml(input.cspSource)} 'unsafe-inline'; script-src 'nonce-${escapeHtml(input.nonce)}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bazaar レビュー結果の取り込み</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 18px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    .card { border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); border-radius: 6px; padding: 12px; margin-top: 12px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    button { border: 0; padding: 7px 11px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    textarea { width: 100%; min-height: 220px; box-sizing: border-box; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); font-family: var(--vscode-editor-font-family); }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .status { white-space: pre-wrap; margin-top: 10px; }
    .ok { color: var(--vscode-testing-iconPassed); }
    .error { color: var(--vscode-errorForeground); }
    code { font-family: var(--vscode-editor-font-family); }
  </style>
</head>
<body>
  <h1>レビュー結果の取り込み</h1>
  ${renderReviewRunCard(input.reviewRun)}
  <section class="card">
    <h2>Bob のレビュー結果</h2>
    <div class="muted">選択範囲、開いているファイル、クリップボードの順に候補を探します。保存前に JSON の形式とチェックリストとの整合を確認します。</div>
    <div class="actions">
      <button type="button" data-action="captureCandidates">見つかった候補を取り込む</button>
      <button type="button" class="secondary" data-action="validateActive">開いているレビュー結果を検証</button>
      <button type="button" class="secondary" data-action="openTriage">人による判定へ進む</button>
    </div>
  </section>
  <section class="card">
    <h2>JSON を貼り付けて取り込む</h2>
    <textarea id="manualText" aria-label="Bob review-result JSON"></textarea>
    <div class="actions">
      <button type="button" data-action="captureManual">貼り付け内容を検証して保存</button>
    </div>
  </section>
  <section class="card">
    <h2>取り込み結果</h2>
    <div id="status" class="status muted">未実行</div>
  </section>
  <script nonce="${escapeHtml(input.nonce)}">
    const vscode = acquireVsCodeApi();
    const status = document.getElementById('status');
    document.addEventListener('click', (event) => {
      const button = event.target && event.target.closest ? event.target.closest('button[data-action]') : undefined;
      if (!button) return;
      button.disabled = true;
      vscode.postMessage({
        type: 'bazaarResultCapture.action',
        action: button.dataset.action,
        text: document.getElementById('manualText').value
      });
      setTimeout(() => { button.disabled = false; }, 1200);
    });
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      status.className = 'status ' + (message.ok ? 'ok' : message.error ? 'error' : 'muted');
      status.textContent = message.message || '';
    });
  </script>
</body>
</html>`
}

function renderReviewRunCard(reviewRun: ReviewRunCommandInput | undefined): string {
  if (!reviewRun) {
    return `<section class="card"><div class="muted">単独実行モード: 保存先とレビュー ID は取り込み結果から決定します。</div></section>`
  }
  return `<section class="card">
    <h2>現在のレビュー</h2>
    <div><code>${escapeHtml(reviewRun.campaignId)}</code> / <code>${escapeHtml(reviewRun.reviewId)}</code></div>
    <div class="muted">最終 JSON にはこのレビュー ID を使用してください。保存後は同じレビューの「人による判定」を開きます。</div>
  </section>`
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
