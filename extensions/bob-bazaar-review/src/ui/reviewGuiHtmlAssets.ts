export const REVIEW_GUI_STYLE = `
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; }
    .row { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
    .field { display: flex; flex: 1 1 220px; flex-direction: column; gap: 4px; }
    .small { color: var(--vscode-descriptionForeground); font-size: 12px; }
    input, select { padding: 8px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); }
    button { padding: 8px 12px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; cursor: pointer; }
    .secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button:disabled { opacity: 0.5; cursor: default; }
    .card { padding: 14px; margin-top: 12px; background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
    .warning { border-color: var(--vscode-editorWarning-foreground); }
    .grid { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; }
    .label { color: var(--vscode-descriptionForeground); }
    pre { padding: 10px; white-space: pre-wrap; background: var(--vscode-textCodeBlock-background); }
    .files, .missing { max-height: 220px; overflow: auto; }
    .status { margin-top: 12px; white-space: pre-wrap; color: var(--vscode-descriptionForeground); }
    .error { color: var(--vscode-errorForeground); }
    .ok { color: var(--vscode-testing-iconPassed); }
    .hidden { display: none; }
    .wizard, .phase-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 8px; margin-top: 8px; }
    .wizard-step, .phase { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; background: var(--vscode-editor-background); }
    .artifacts { margin: 8px 0 0; padding-left: 20px; }
`

export const REVIEW_GUI_BODY = `
  <h1>Bazaar レビューを開始</h1>
  <div class="card">
    <h2>レビュー手順</h2>
    <div class="wizard" aria-label="Bazaar レビュー手順">
      <div class="wizard-step"><strong>レビューキャンペーン</strong><div class="small">レビュー実行の保存先</div></div>
      <div class="wizard-step"><strong>レビュー対象</strong><div class="small">1リビジョン／範囲／未コミット差分</div></div>
      <div class="wizard-step"><strong>レビュー資料</strong><div class="small">Bob コンテキストへ追加</div></div>
      <div class="wizard-step"><strong>レビュー結果取り込み</strong><div class="small">同じレビュー ID で保存</div></div>
      <div class="wizard-step"><strong>指摘確認・振り分け</strong><div class="small">指摘を採用・却下・保留</div></div>
      <div class="wizard-step"><strong>レビュー実績</strong><div class="small">実績記録と集計レポートを作成</div></div>
    </div>
    <div class="row" style="margin-top:12px">
      <div class="field"><label class="small" for="campaignId">キャンペーン ID <code>campaign_id</code></label><input id="campaignId" type="text" value="phase1-bazaar-review-uat-001"></div>
      <div class="field"><label class="small" for="reviewId">レビュー ID <code>review_id</code>（対象取得後に自動提案）</label><input id="reviewId" type="text" placeholder="bazaar-r125-project-rule-review"></div>
    </div>
    <div id="runState" class="small">レビュー実行はまだ開始されていません。</div>
    <div class="row" style="margin-top:12px">
      <button class="secondary" id="openResultCapture">レビュー結果取り込み</button>
      <button class="secondary" id="openHumanTriage">指摘確認・振り分け</button>
      <button class="secondary" id="openCampaignDashboard">レビュー実績</button>
    </div>
  </div>

  <div class="card">
    <h2>途中のレビューを再開</h2>
    <div class="row">
      <div class="field"><label class="small" for="incompleteRun">レビュー実行</label><select id="incompleteRun"><option value="">途中のレビューを取得してください</option></select></div>
      <button class="secondary" id="refreshReviewRuns">一覧を更新</button>
      <button id="resumeReviewRun" disabled>選択したレビューを再開</button>
    </div>
    <div id="resumeDetails" class="small">未選択</div>
    <div id="phaseStatuses" class="phase-grid" aria-label="レビュー実行の工程状態"></div>
    <ul id="runArtifacts" class="artifacts"></ul>
  </div>

  <div class="row">
    <button class="secondary" id="selectWorkspace">Bazaar ワークスペースを選択</button>
    <span id="workspace">ワークスペース未選択</span>
  </div>
  <div id="initCard" class="card warning hidden">
    <h2>.bob 初期化状態: 未初期化</h2>
    <button id="initializeBob">.bob を初期化</button>
    <ul id="missingFiles" class="missing"></ul>
  </div>
  <div class="row">
    <div class="field">
      <label class="small" for="mode">レビュー対象</label>
      <select id="mode">
        <option value="singleRevision">1リビジョン</option>
        <option value="revisionRange">リビジョン範囲</option>
        <option value="workingTreeSinceRevision">TOPリビジョンと未コミット差分</option>
      </select>
    </div>
  </div>
  <div class="row" id="singleFields"><div class="field"><label class="small" for="revision">リビジョン</label><input id="revision" type="text" placeholder="例: 1234"></div></div>
  <div class="row hidden" id="rangeFields">
    <div class="field"><label class="small" for="baseRevision">基準リビジョン</label><input id="baseRevision" type="text" placeholder="例: 1200"></div>
    <div class="field"><label class="small" for="targetRevision">比較先リビジョン</label><input id="targetRevision" type="text" placeholder="例: 1234"></div>
  </div>
  <div class="row hidden" id="workingTreeFields"><div class="field"><label class="small" for="workingBaseRevision">基準リビジョン（空欄はTOP）</label><input id="workingBaseRevision" type="text"></div></div>
  <div class="row"><button id="load">対象情報を取得</button><button id="review" disabled>レビューを開始して Bob に渡す</button></div>
  <label><input id="withProjectRules" type="checkbox" checked> プロジェクト規約を含める</label>
  <div id="status" class="status"></div>
  <div id="info" class="card hidden">
    <h2>対象情報</h2>
    <div class="grid">
      <div class="label">モード</div><div id="infoMode"></div>
      <div class="label">対象</div><div id="infoTarget"></div>
      <div class="label">リビジョン</div><div id="infoRevision"></div>
      <div class="label">リビジョン番号</div><div id="infoRevno"></div>
      <div class="label">作者</div><div id="infoAuthor"></div>
      <div class="label">コミッター</div><div id="infoCommitter"></div>
      <div class="label">日時</div><div id="infoTimestamp"></div>
      <div class="label">変更ファイル数</div><div id="infoChangedCount"></div>
    </div>
    <h3>コミットメッセージ／状態</h3><pre id="infoMessage"></pre>
    <h3>変更ファイル</h3><ul id="infoFiles" class="files"></ul>
  </div>
`

export function renderReviewGuiScript(nonce: string, initialTargetJson: string, renderTokenJson: string): string {
  const script = `<script nonce="${nonce}">
    const vscode = acquireVsCodeApi()
    const rawPostMessage = vscode.postMessage.bind(vscode)
    const renderToken = ${renderTokenJson}
    const postMessage = (message) => rawPostMessage({ ...message, renderToken })
    const $ = (id) => document.getElementById(id)
    const initialTarget = ${initialTargetJson}
    const phases = ["target", "packet", "result", "triage", "record", "summary"]
    const phaseLabels = { target: "レビュー対象", packet: "レビュー資料", result: "レビュー結果取り込み", triage: "指摘確認・振り分け", record: "実績記録", summary: "集計レポート" }
    const phaseStatusLabels = { not_started: "未開始", in_progress: "実行中", completed: "完了", failed: "失敗", blocked: "続行不可" }
    const nextActionLabels = { review: "レビューを実行", resultCapture: "レビュー結果取り込み", humanTriage: "指摘確認・振り分け", finalize: "完了処理", none: "なし" }
    const targetModeLabels = { singleRevision: "1リビジョン", revisionRange: "リビジョン範囲", workingTreeSinceRevision: "未コミット差分" }
    const labelOrUnknown = (value, labels) => labels[value] || "不明（" + String(value || "") + "）"
    let loaded = false
    let bobInitialized = false
    let reviewIdManuallyEdited = false
    let reviewRuns = []

    $("selectWorkspace").onclick = () => vscode.postMessage({ type: "selectWorkspace" })
    $("initializeBob").onclick = () => vscode.postMessage({ type: "initializeBobWorkspace" })
    $("openResultCapture").onclick = () => vscode.postMessage({ type: "openResultCapture" })
    $("openHumanTriage").onclick = () => vscode.postMessage({ type: "openHumanTriage" })
    $("openCampaignDashboard").onclick = () => vscode.postMessage({ type: "openCampaignDashboard", campaignId: $("campaignId").value.trim() })
    $("refreshReviewRuns").onclick = () => vscode.postMessage({ type: "refreshReviewRuns" })
    $("resumeReviewRun").onclick = () => {
      const selected = selectedRun()
      if (selected) vscode.postMessage({ type: "resumeReviewRun", workspaceRoot: selected.workspaceRoot, campaignId: selected.campaignId, reviewId: selected.reviewId })
    }
    $("incompleteRun").onchange = () => renderSelectedRun()
    $("mode").onchange = () => { updateMode(); clearLoaded() }
    $("campaignId").oninput = () => updateReviewButton()
    $("reviewId").oninput = () => { reviewIdManuallyEdited = Boolean($("reviewId").value.trim()); updateReviewButton() }
    $("load").onclick = () => loadTarget()
    $("review").onclick = () => vscode.postMessage({ type: "reviewTarget", ...collectTarget(), ...collectReviewRun(), withProjectRules: $("withProjectRules").checked })
    $("withProjectRules").onchange = () => updateReviewButton()

    for (const id of ["revision", "baseRevision", "targetRevision", "workingBaseRevision"]) {
      $(id).oninput = () => clearLoaded()
      $(id).onkeydown = (event) => { if (event.key === "Enter") loadTarget() }
    }

    function collectReviewRun() { return { campaignId: $("campaignId").value.trim(), reviewId: $("reviewId").value.trim() } }
    function collectTarget() {
      const mode = $("mode").value
      return {
        mode,
        revision: $("revision").value.trim(),
        baseRevision: mode === "workingTreeSinceRevision" ? $("workingBaseRevision").value.trim() : $("baseRevision").value.trim(),
        ...(mode === "revisionRange" ? { targetRevision: $("targetRevision").value.trim() } : {})
      }
    }
    function updateMode() {
      const mode = $("mode").value
      $("singleFields").classList.toggle("hidden", mode !== "singleRevision")
      $("rangeFields").classList.toggle("hidden", mode !== "revisionRange")
      $("workingTreeFields").classList.toggle("hidden", mode !== "workingTreeSinceRevision")
    }
    function applyInitialTarget(value) {
      if (!value) return
      const mode = value.revisionMode || "singleRevision"
      $("mode").value = mode
      $("revision").value = value.revision || ""
      $("baseRevision").value = value.baseRevision || ""
      $("targetRevision").value = value.targetRevision || ""
      $("workingBaseRevision").value = mode === "workingTreeSinceRevision" ? value.baseRevision || "" : ""
      updateMode()
    }
    function clearLoaded() { loaded = false; if (!reviewIdManuallyEdited) $("reviewId").value = ""; updateReviewButton() }
    function updateReviewButton() {
      const hasIdentity = Boolean($("campaignId").value.trim() && $("reviewId").value.trim())
      $("review").disabled = !loaded || !hasIdentity || ($("withProjectRules").checked && !bobInitialized)
    }
    function setStatus(text, error = false, ok = false) {
      $("status").textContent = text || ""
      $("status").className = error ? "status error" : ok ? "status ok" : "status"
    }
    function loadTarget() {
      const target = collectTarget()
      if (target.mode === "singleRevision" && !target.revision) return setStatus("リビジョンを入力してください", true)
      if (target.mode === "revisionRange" && (!target.baseRevision || !target.targetRevision)) return setStatus("基準リビジョンと比較先リビジョンを入力してください", true)
      clearLoaded()
      vscode.postMessage({ type: "loadTarget", ...target })
    }
    function renderBobStatus(value) {
      bobInitialized = Boolean(value.initialized)
      $("initCard").classList.toggle("hidden", bobInitialized)
      $("missingFiles").innerHTML = ""
      for (const file of value.missing || []) { const item = document.createElement("li"); item.textContent = file; $("missingFiles").appendChild(item) }
      updateReviewButton()
    }
    function renderInfo(info) {
      loaded = true
      $("info").classList.remove("hidden")
      $("infoMode").textContent = info.mode ? labelOrUnknown(info.mode, targetModeLabels) : ""
      $("infoTarget").textContent = info.targetLabel || ""
      $("infoRevision").textContent = info.revision || info.targetRevision || ""
      $("infoRevno").textContent = info.revno || ""
      $("infoAuthor").textContent = info.author || ""
      $("infoCommitter").textContent = info.committer || ""
      $("infoTimestamp").textContent = info.timestamp || ""
      $("infoChangedCount").textContent = String(info.changedFileCount ?? 0)
      $("infoMessage").textContent = info.message || "(メッセージなし)"
      $("infoFiles").innerHTML = ""
      for (const entry of info.changedFileEntries || []) { const item = document.createElement("li"); item.textContent = entry.status + ": " + entry.path; $("infoFiles").appendChild(item) }
      updateReviewButton()
    }
    function renderReviewRun(run) {
      if (!run) return
      $("campaignId").value = run.campaignId || $("campaignId").value
      $("reviewId").value = run.reviewId || $("reviewId").value
      reviewIdManuallyEdited = true
      $("runState").textContent = "レビュー実行: " + run.campaignId + " / " + run.reviewId + " / 工程=" + labelOrUnknown(run.phase || "unknown", phaseLabels) + " / 状態=" + labelOrUnknown(run.status || "in_progress", phaseStatusLabels)
      if (run.phases) renderPhaseStatuses(run.phases)
      if (run.artifacts) renderArtifacts(run.artifacts)
      updateReviewButton()
    }
    function renderReviewRuns(items) {
      reviewRuns = items || []
      $("incompleteRun").innerHTML = ""
      const placeholder = document.createElement("option")
      placeholder.value = ""
      placeholder.textContent = reviewRuns.length ? "途中のレビューを選択" : "途中のレビューはありません"
      $("incompleteRun").appendChild(placeholder)
      reviewRuns.forEach((run, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = run.label + " — " + run.description; $("incompleteRun").appendChild(option) })
      renderSelectedRun()
    }
    function selectedRun() { const index = Number($("incompleteRun").value); return Number.isInteger(index) ? reviewRuns[index] : undefined }
    function renderSelectedRun() {
      const run = selectedRun()
      $("resumeReviewRun").disabled = !run
      $("resumeDetails").textContent = run ? "対象=" + run.targetLabel + " / 次の操作=" + labelOrUnknown(run.action, nextActionLabels) + " / 更新=" + run.updatedAt : "未選択"
      renderPhaseStatuses(run ? run.phases : {})
      renderArtifacts(run ? run.artifacts : {})
    }
    function renderPhaseStatuses(statuses) {
      $("phaseStatuses").innerHTML = ""
      phases.forEach((phase) => { const item = document.createElement("div"); item.className = "phase"; const strong = document.createElement("strong"); strong.textContent = labelOrUnknown(phase, phaseLabels); const detail = document.createElement("div"); detail.className = "small"; detail.textContent = labelOrUnknown(statuses[phase] || "not_started", phaseStatusLabels); item.append(strong, detail); $("phaseStatuses").appendChild(item) })
    }
    function renderArtifacts(artifacts) {
      $("runArtifacts").innerHTML = ""
      Object.entries(artifacts || {}).filter(([, value]) => value).forEach(([name, value]) => { const item = document.createElement("li"); item.textContent = name + ": " + value; $("runArtifacts").appendChild(item) })
    }
    function applyResumeTarget(message) {
      const target = message.target || {}
      $("mode").value = target.mode || "singleRevision"
      $("revision").value = target.revision || ""
      $("baseRevision").value = target.baseRevision || ""
      $("targetRevision").value = target.targetRevision || ""
      $("workingBaseRevision").value = target.mode === "workingTreeSinceRevision" ? target.baseRevision || "" : ""
      updateMode()
      loaded = true
      renderReviewRun(message.reviewRun)
      setStatus("レビュー対象工程の実行を選択しました。対象を確認し、レビュー資料の作成をもう一度実行してください。", false, true)
    }
    function renderWorkspaceState(message) {
      const parts = []
      if (message.workspace) parts.push("Bazaar: " + message.workspace)
      if (message.bobWorkspace) parts.push("Bob: " + message.bobWorkspace)
      $("workspace").textContent = parts.join(" / ") || "ワークスペース未選択"
    }
    window.addEventListener("message", (event) => {
      const message = event.data || {}
      if (message.type === "workspaceState") renderWorkspaceState(message)
      else if (message.type === "bobWorkspaceStatus") renderBobStatus(message)
      else if (message.type === "reviewRuns") renderReviewRuns(message.items)
      else if (message.type === "activeReviewRun") { renderReviewRun(message.reviewRun); setStatus(message.message || "レビュー実行を再開しました。", false, true) }
      else if (message.type === "resumeTarget") applyResumeTarget(message)
      else if (message.type === "initialized") setStatus(message.message, false, true)
      else if (message.type === "loading") setStatus(message.message)
      else if (message.type === "targetInfo") { if (!reviewIdManuallyEdited && message.suggestedReviewId) $("reviewId").value = message.suggestedReviewId; renderInfo(message.info); setStatus("対象情報を取得しました", false, true) }
      else if (message.type === "reviewAdded") { renderInfo(message.info); renderReviewRun(message.reviewRun); setStatus("レビュー実行とレビュー資料を保存しました。資料サイズ: " + message.packetBytes + "バイト", false, true); vscode.postMessage({ type: "refreshReviewRuns" }) }
      else if (message.type === "error") setStatus(message.message || "エラー", true)
    })
    updateMode()
    applyInitialTarget(initialTarget)
    vscode.postMessage({ type: "ready" })
  </script>`
  return script.replaceAll("vscode.postMessage(", "postMessage(")
}
