import { randomBytes } from "node:crypto"
import { REVIEW_GUI_BODY, REVIEW_GUI_STYLE, renderReviewGuiScript } from "./reviewGuiHtmlAssets"
import type { BazaarReviewInitialTarget } from "./reviewGuiTypes"

export function renderHtml(cspSource: string, initialTarget?: BazaarReviewInitialTarget, renderToken = createNonce()): string {
  const nonce = createNonce()
  const initialTargetJson = JSON.stringify(initialTarget ?? {}).replace(/</g, "\u003c")
  const script = renderReviewGuiScript(nonce, initialTargetJson, JSON.stringify(renderToken)).replace(
    `    $("refreshReviewRuns").onclick = () => postMessage({ type: "refreshReviewRuns" })`,
    `    $("refreshReviewRuns").onclick = () => postMessage({ type: "refreshReviewRuns" })\n    $("recoverLegacyReview").onclick = () => postMessage({ type: "recoverLegacyReview" })`
  )

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bazaar レビューを開始</title>
  <style>${REVIEW_GUI_STYLE}</style>
</head>
<body>${REVIEW_GUI_BODY}
  <div class="card">
    <h2>既存成果物からレビューを復旧</h2>
    <div class="small">既存のレビュー資料・結果・判定・実績記録は変更せず、確認後に review-run.json だけを生成します。</div>
    <div class="row" style="margin-top:10px"><button class="secondary" id="recoverLegacyReview">既存成果物から復旧</button></div>
  </div>
  ${script}
</body>
</html>`
}

export function createNonce(): string {
  return randomBytes(16).toString("base64")
}
