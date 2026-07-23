export interface RenderConsistencyResultCaptureHtmlInput {
  cspSource: string
  nonce: string
  renderToken?: string
}

export function renderConsistencyResultCaptureHtml(input: RenderConsistencyResultCaptureHtmlInput): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${escapeHtml(input.cspSource)} 'unsafe-inline'; script-src 'nonce-${escapeHtml(input.nonce)}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bob 出力の取り込み</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 18px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    .card { border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); border-radius: 6px; padding: 12px; margin-top: 12px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    button { border: 0; padding: 7px 11px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    textarea { width: 100%; min-height: 240px; box-sizing: border-box; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); font-family: var(--vscode-editor-font-family); }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .status { white-space: pre-wrap; margin-top: 10px; }
    .ok { color: var(--vscode-testing-iconPassed); }
    .error { color: var(--vscode-errorForeground); }
  </style>
</head>
<body>
  <nav class="actions" aria-label="レビュー工程">
    <button type="button" class="secondary" data-stage="review">レビュー準備</button>
    <button type="button" class="secondary" data-stage="traceability">トレーサビリティ整理</button>
    <button type="button" data-stage="review-result-capture" aria-current="page" disabled>レビュー結果取り込み</button>
    <button type="button" class="secondary" data-stage="triage">指摘確認・振り分け</button>
  </nav>
  <h1>Bob 出力の取り込み</h1>
  <section class="card">
    <h2>Bob 出力（YAML）</h2>
    <div class="muted">保存前に YAML の形式と、根拠 ID の参照先を確認します。</div>
    <textarea id="manualText" aria-label="Bob 出力（YAML）"></textarea>
    <div class="actions">
      <button type="button" data-action="captureManual">貼り付け内容を検証して保存</button>
      <button type="button" class="secondary" data-action="captureClipboard">クリップボードから取り込む</button>
      <button type="button" class="secondary" data-action="validateOutput">保存済みの Bob 出力を検証</button>
      <button type="button" class="secondary" data-action="openHumanTriage">指摘確認・振り分けへ進む</button>
    </div>
  </section>
  <section class="card">
    <h2>取り込み結果</h2>
    <div id="status" class="status muted">未実行</div>
  </section>
  <script nonce="${escapeHtml(input.nonce)}">
    const vscode = acquireVsCodeApi();
    const renderToken = ${scriptValue(input.renderToken ?? "")};
    document.addEventListener('click', (event) => {
      const stageButton = event.target && event.target.closest ? event.target.closest('button[data-stage]') : undefined;
      if (stageButton && !stageButton.disabled) {
        vscode.postMessage({ type: 'consistencyReview.navigate', fromStage: 'review-result-capture', stage: stageButton.dataset.stage, renderToken });
        return;
      }
      const button = event.target && event.target.closest ? event.target.closest('button[data-action]') : undefined;
      if (!button) return;
      button.disabled = true;
      vscode.postMessage({
        type: 'consistencyResultCapture.action',
        action: button.dataset.action,
        text: document.getElementById('manualText').value,
        renderToken
      });
      setTimeout(() => { button.disabled = false; }, 1200);
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
