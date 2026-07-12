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
  <h1>Bob Bazaar レビュー</h1>
  <div class="card">
    <h2>Wizard v3 / Review Run</h2>
    <div class="wizard" aria-label="Bazaar review wizard steps">
      <div class="wizard-step"><strong>campaign</strong><div class="small">Review Run の保存先</div></div>
      <div class="wizard-step"><strong>target</strong><div class="small">revision / range / working tree</div></div>
      <div class="wizard-step"><strong>packet</strong><div class="small">Bob contextへ追加</div></div>
      <div class="wizard-step"><strong>result</strong><div class="small">同じreview_idで保存</div></div>
      <div class="wizard-step"><strong>triage</strong><div class="small">人間の採否判断</div></div>
      <div class="wizard-step"><strong>record / summary</strong><div class="small">実績を確定・集計</div></div>
    </div>
    <div class="row" style="margin-top:12px">
      <div class="field"><label class="small" for="campaignId">campaign_id</label><input id="campaignId" type="text" value="phase1-bazaar-review-uat-001"></div>
      <div class="field"><label class="small" for="reviewId">review_id（対象取得後に自動提案）</label><input id="reviewId" type="text" placeholder="bazaar-r125-project-rule-review"></div>
    </div>
    <div id="runState" class="small">Review Run はまだ開始されていません。</div>
    <div class="row" style="margin-top:12px">
      <button class="secondary" id="openResultCapture">Result Capture を開く</button>
      <button class="secondary" id="openHumanTriage">Human Triage を開く</button>
      <button class="secondary" id="openCampaignDashboard">Campaign Dashboard を開く</button>
    </div>
  </div>

  <div class="card">
    <h2>未完了のReview Runを再開</h2>
    <div class="row">
      <div class="field"><label class="small" for="incompleteRun">Review Run</label><select id="incompleteRun"><option value="">未完了runを取得してください</option></select></div>
      <button class="secondary" id="refreshReviewRuns">一覧を更新</button>
      <button id="resumeReviewRun" disabled>選択したrunを再開</button>
    </div>
    <div id="resumeDetails" class="small">未選択</div>
    <div id="phaseStatuses" class="phase-grid" aria-label="Review Run phase status"></div>
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
  <div class="row"><button id="load">対象情報を取得</button><button id="review" disabled>Review Run を開始して Bob に追加</button></div>
  <label><input id="withProjectRules" type="checkbox" checked> プロジェクト規約を含める</label>
  <div id="status" class="status"></div>
  <div id="info" class="card hidden">
    <h2>対象情報</h2>
    <div class="grid">
      <div class="label">モード</div><div id="infoMode"></div>
      <div class="label">対象</div><div id="infoTarget"></div>
      <div class="label">リビジョン</div><div id="infoRevision"></div>
      <div class="label">Revno</div><div id="infoRevno"></div>
      <div class="label">作者</div><div id="infoAuthor"></div>
      <div class="label">Committer</div><div id="infoCommitter"></div>
      <div class="label">日時</div><div id="infoTimestamp"></div>
      <div class="label">変更ファイル数</div><div id="infoChangedCount"></div>
    </div>
    <h3>メッセージ / status</h3><pre id="infoMessage"></pre>
    <h3>変更ファイル</h3><ul id="infoFiles" class="files"></ul>
  </div>
`

export function renderReviewGuiScript(nonce: string, initialTargetJson: string): string {
  return `<script nonce="${nonce}">
    const vscode = acquireVsCodeApi()
    const $ = (id) => document.getElementById(id)
    const initialTarget = ${initialTargetJson}
    const phases = ["target", "packet", "result", "triage", "record", "summary"]
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
      $("infoMode").textContent = info.mode || ""
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
      $("runState").textContent = "Review Run: " + run.campaignId + " / " + run.reviewId + " / phase=" + (run.phase || "unknown") + " / status=" + (run.status || "in_progress")
      if (run.phases) renderPhaseStatuses(run.phases)
      if (run.artifacts) renderArtifacts(run.artifacts)
      updateReviewButton()
    }
    function renderReviewRuns(items) {
      reviewRuns = items || []
      $("incompleteRun").innerHTML = ""
      const placeholder = document.createElement("option")
      placeholder.value = ""
      placeholder.textContent = reviewRuns.length ? "未完了runを選択" : "未完了runはありません"
      $("incompleteRun").appendChild(placeholder)
      reviewRuns.forEach((run, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = run.label + " — " + run.description; $("incompleteRun").appendChild(option) })
      renderSelectedRun()
    }
    function selectedRun() { const index = Number($("incompleteRun").value); return Number.isInteger(index) ? reviewRuns[index] : undefined }
    function renderSelectedRun() {
      const run = selectedRun()
      $("resumeReviewRun").disabled = !run
      $("resumeDetails").textContent = run ? "target=" + run.targetLabel + " / 次の操作=" + run.action + " / updated=" + run.updatedAt : "未選択"
      renderPhaseStatuses(run ? run.phases : {})
      renderArtifacts(run ? run.artifacts : {})
    }
    function renderPhaseStatuses(statuses) {
      $("phaseStatuses").innerHTML = ""
      phases.forEach((phase) => { const item = document.createElement("div"); item.className = "phase"; const strong = document.createElement("strong"); strong.textContent = phase; const detail = document.createElement("div"); detail.className = "small"; detail.textContent = statuses[phase] || "not_started"; item.append(strong, detail); $("phaseStatuses").appendChild(item) })
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
      setStatus("target phaseのReview Runを選択しました。対象を確認してpacket作成を再試行してください。", false, true)
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
      else if (message.type === "activeReviewRun") { renderReviewRun(message.reviewRun); setStatus(message.message || "Review Runを再開しました。", false, true) }
      else if (message.type === "resumeTarget") applyResumeTarget(message)
      else if (message.type === "initialized") setStatus(message.message, false, true)
      else if (message.type === "loading") setStatus(message.message)
      else if (message.type === "targetInfo") { if (!reviewIdManuallyEdited && message.suggestedReviewId) $("reviewId").value = message.suggestedReviewId; renderInfo(message.info); setStatus("対象情報を取得しました", false, true) }
      else if (message.type === "reviewAdded") { renderInfo(message.info); renderReviewRun(message.reviewRun); setStatus("Review Run と packet を保存しました。packet bytes: " + message.packetBytes, false, true); vscode.postMessage({ type: "refreshReviewRuns" }) }
      else if (message.type === "error") setStatus(message.message || "エラー", true)
    })
    updateMode()
    applyInitialTarget(initialTarget)
    vscode.postMessage({ type: "ready" })
  </script>`
}
