export function renderWorkflowBuilderSkipResumeReadinessScript(): string {
  return String.raw`
let skipResumeReadinessPreview = undefined;
let skipResumeReadinessPreviewSourceSignature = '';
let skipResumeReadinessPendingSignature = '';
let skipResumeReadinessRequestId = '';
let skipResumeReadinessSequence = 0;
let skipResumeReadinessSelection = new Set();
let skipResumeReadinessSelectionInitialized = false;

function skipResumeReadinessSourceSignature() {
  const steps = (model.steps || []).map(function(step) {
    return {
      id: step.id,
      title: step.title,
      type: step.type,
      resultKey: step.resultKey,
      formResultKey: step.form && step.form.resultKey,
      approvalResultKey: step.approval && step.approval.resultKey,
      result: step.result ? {
        source: step.result.source,
        stateKey: step.result.stateKey,
        text: step.result.text,
        sinks: step.result.sinks
      } : undefined
    };
  });
  return JSON.stringify({
    steps: steps,
    artifacts: model.artifacts || [],
    skipResume: model.skipResume || null
  });
}

function orderedSkipResumeReadinessSelection() {
  return (model.steps || []).map(function(step) { return step.id; }).filter(function(stepId, index, all) {
    return all.indexOf(stepId) === index && skipResumeReadinessSelection.has(stepId);
  });
}

function invalidateSkipResumeReadinessPreview() {
  skipResumeReadinessPreview = undefined;
  skipResumeReadinessPreviewSourceSignature = '';
  skipResumeReadinessPendingSignature = '';
  skipResumeReadinessRequestId = '';
  skipResumeReadinessSelection = new Set();
  skipResumeReadinessSelectionInitialized = false;
}

function requestSkipResumeReadinessPreview(force) {
  const signature = skipResumeReadinessSourceSignature();
  if (!force && skipResumeReadinessPendingSignature === signature) return;
  const requestId = 'skip-resume-' + (++skipResumeReadinessSequence) + '-' + Date.now();
  skipResumeReadinessRequestId = requestId;
  skipResumeReadinessPendingSignature = signature;
  const message = {
    type: 'previewSkipResumeReadiness',
    model: model,
    requestId: requestId
  };
  if (skipResumeReadinessSelectionInitialized) message.selectedStepIds = orderedSkipResumeReadinessSelection();
  vscode.postMessage(message);
}

function queueSkipResumeReadinessPreview() {
  const signature = skipResumeReadinessSourceSignature();
  if (skipResumeReadinessPreview && skipResumeReadinessPreviewSourceSignature === signature) return;
  if (skipResumeReadinessPendingSignature === signature) return;
  setTimeout(function() {
    if (activeTab !== 'artifacts') return;
    const currentSignature = skipResumeReadinessSourceSignature();
    if (skipResumeReadinessPreview && skipResumeReadinessPreviewSourceSignature === currentSignature) return;
    if (skipResumeReadinessPendingSignature === currentSignature) return;
    requestSkipResumeReadinessPreview(false);
  }, 0);
}

function applySkipResumeReadinessFromPreview() {
  if (!skipResumeReadinessPreview || !skipResumeReadinessPreview.ok) return;
  const signature = skipResumeReadinessSourceSignature();
  const requestId = 'skip-resume-apply-' + (++skipResumeReadinessSequence) + '-' + Date.now();
  skipResumeReadinessRequestId = requestId;
  skipResumeReadinessPendingSignature = signature;
  vscode.postMessage({
    type: 'applySkipResumeReadiness',
    model: model,
    selectedStepIds: orderedSkipResumeReadinessSelection(),
    requestId: requestId
  });
}

function renderSkipResumeReadiness() {
  const signature = skipResumeReadinessSourceSignature();
  if (skipResumeReadinessPreview && skipResumeReadinessPreviewSourceSignature !== signature) invalidateSkipResumeReadinessPreview();
  const preview = skipResumeReadinessPreview;
  if (!preview) {
    queueSkipResumeReadinessPreview();
    return '<div class="card skip-resume-readiness"><h3>途中再開 readiness</h3><p class="muted">再利用可能な step output と artifact 定義を検査しています。</p><button class="secondary" data-action="refresh-skip-resume-readiness">再評価</button></div>';
  }

  const candidateHtml = (preview.candidates || []).map(function(candidate) {
    const selected = Boolean(candidate.selected) || candidate.status === 'existing';
    const disabled = candidate.status === 'ready' ? '' : ' disabled';
    const checked = selected ? ' checked' : '';
    const issueHtml = (candidate.issues || []).map(function(issue) { return '<li>' + escapeHtml(issue) + '</li>'; }).join('');
    const issueList = issueHtml ? '<ul class="issue-list">' + issueHtml + '</ul>' : '';
    return '<div class="skip-resume-candidate"><label><input type="checkbox" style="width:auto" data-skip-resume-step-id="' + escapeHtml(candidate.stepId) + '"' + checked + disabled + ' /> ' + escapeHtml(candidate.stepTitle || candidate.stepId) + ' <span class="badge">' + escapeHtml(candidate.status) + '</span></label><div class="muted">resultKey / artifact id: <code>' + escapeHtml(candidate.resultKey) + '</code></div><div class="muted">producedBy: <code>' + escapeHtml(candidate.artifact.producedBy || '') + '</code></div><div class="muted">path: <code>' + escapeHtml(candidate.artifact.path || '') + '</code></div><div class="muted">schema: <code>' + escapeHtml(candidate.artifact.schema || 'text/markdown') + '</code></div>' + issueList + '</div>';
  }).join('') || '<p class="muted">再利用対象の output はありません。</p>';

  const blockers = (preview.blockingIssues || []).map(function(issue) { return '<li>' + escapeHtml(issue) + '</li>'; }).join('');
  const blockerHtml = blockers ? '<div class="skip-resume-blockers"><strong>適用を止めている項目</strong><ul class="issue-list">' + blockers + '</ul></div>' : '';
  const changes = (preview.changes || []).map(function(change) { return '<li>' + escapeHtml(change) + '</li>'; }).join('');
  const changeHtml = changes ? '<div><strong>適用内容</strong><ul class="issue-list">' + changes + '</ul></div>' : '<p class="muted">追加変更はありません。</p>';
  const diagnostics = (preview.diagnostics || []).map(function(item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('');
  const diagnosticHtml = diagnostics ? '<div><strong>Strict diagnostics</strong><ul class="issue-list">' + diagnostics + '</ul></div>' : '';
  const disabled = preview.ok ? '' : ' disabled';
  const status = preview.ok ? '<span class="badge">ready</span>' : '<span class="badge error">blocked</span>';

  return '<div class="card skip-resume-readiness"><div><h3>途中再開 readiness ' + status + '</h3><p class="muted">再利用する output を選び、生成後の WORKFLOW.md を確認してからBuilder modelへ適用します。既存artifactは自動上書きしません。</p></div><div>' + candidateHtml + '</div>' + blockerHtml + changeHtml + diagnosticHtml + '<div class="skip-resume-markdown-grid"><div><strong>Before</strong><pre>' + escapeHtml(preview.beforeMarkdown || '') + '</pre></div><div><strong>After</strong><pre>' + escapeHtml(preview.afterMarkdown || '') + '</pre></div></div><button class="secondary" data-action="refresh-skip-resume-readiness">再評価</button><button data-action="apply-skip-resume-readiness"' + disabled + '>この設定を適用</button></div>';
}

function readinessModelMutation(event) {
  const target = event.target;
  if (!target || !target.dataset || target.dataset.skipResumeStepId) return;
  if (target.closest && target.closest('.skip-resume-readiness')) return;
  invalidateSkipResumeReadinessPreview();
  if (activeTab === 'artifacts') setTimeout(function() { renderArtifacts(); }, 0);
}

document.addEventListener('input', readinessModelMutation);
document.addEventListener('change', function(event) {
  const target = event.target;
  if (target && target.dataset && target.dataset.skipResumeStepId) {
    skipResumeReadinessSelectionInitialized = true;
    if (target.checked) skipResumeReadinessSelection.add(target.dataset.skipResumeStepId);
    else skipResumeReadinessSelection.delete(target.dataset.skipResumeStepId);
    skipResumeReadinessPreview = undefined;
    skipResumeReadinessPreviewSourceSignature = '';
    skipResumeReadinessPendingSignature = '';
    requestSkipResumeReadinessPreview(true);
    if (activeTab === 'artifacts') renderArtifacts();
    return;
  }
  readinessModelMutation(event);
});

document.addEventListener('click', function(event) {
  const target = event.target.closest && event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'refresh-skip-resume-readiness') {
    invalidateSkipResumeReadinessPreview();
    requestSkipResumeReadinessPreview(true);
    if (activeTab === 'artifacts') renderArtifacts();
    return;
  }
  if (action === 'apply-skip-resume-readiness') {
    applySkipResumeReadinessFromPreview();
    return;
  }
  if (['add-step', 'delete-step', 'duplicate-step', 'move-step-up', 'move-step-down', 'add-artifact', 'delete-artifact', 'apply-template'].includes(action)) {
    invalidateSkipResumeReadinessPreview();
    if (activeTab === 'artifacts') setTimeout(function() { renderArtifacts(); }, 0);
  }
});

window.addEventListener('message', function(event) {
  const message = event.data || {};
  if (message.type === 'model') {
    invalidateSkipResumeReadinessPreview();
    return;
  }
  if (message.type === 'skipResumeReadinessPreviewResult') {
    if (message.requestId !== skipResumeReadinessRequestId) return;
    skipResumeReadinessPreview = message;
    skipResumeReadinessPreviewSourceSignature = skipResumeReadinessSourceSignature();
    skipResumeReadinessPendingSignature = '';
    skipResumeReadinessSelection = new Set(message.selectedStepIds || []);
    skipResumeReadinessSelectionInitialized = true;
    if (activeTab === 'artifacts') renderArtifacts();
    return;
  }
  if (message.type === 'skipResumeReadinessApplied') {
    if (message.requestId !== skipResumeReadinessRequestId) return;
    model = message.model;
    const appliedSelection = new Set((message.preview && message.preview.selectedStepIds) || []);
    invalidateSkipResumeReadinessPreview();
    skipResumeReadinessSelection = appliedSelection;
    skipResumeReadinessSelectionInitialized = true;
    requestPreview();
    render();
    requestSkipResumeReadinessPreview(true);
  }
});
`
}
