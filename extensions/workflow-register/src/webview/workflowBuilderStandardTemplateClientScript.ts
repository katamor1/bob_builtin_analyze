export function renderWorkflowBuilderStandardTemplateClientScript(): string {
  return String.raw`
const rawVscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage: function(message) { console.log(message); } };
const vscode = { postMessage: function(message) { rawVscode.postMessage(Object.assign({}, message, { sessionToken: sessionToken })); } };
const BAZAAR_PROMPT_SUPPLEMENT = 'Bazaar 操作では bzr --no-aliases を使う。';
let activeTab = 'library';
let templates = Array.isArray(initialTemplates) ? initialTemplates.slice() : [];
let selectedTemplatePath = initialModel && initialModel.templatePath ? initialModel.templatePath : '';
let latestHostGeneration = -1;

function acceptHostMessage(message) {
  if (!message || message.sessionToken !== sessionToken) return false;
  const generation = Number(message.generation);
  if (!Number.isInteger(generation) || generation < latestHostGeneration) return false;
  latestHostGeneration = generation;
  return true;
}

function $(id) {
  return document.getElementById(id);
}

function post(type, extra) {
  vscode.postMessage(Object.assign({ type: type }, extra || {}));
}

function currentModel() {
  const defaults = {};
  document.querySelectorAll('[data-input-default]').forEach(function(input) {
    defaults[input.getAttribute('data-input-default')] = readInputDefaultValue(input);
  });
  return {
    templatePath: $('templatePath').value,
    templateId: $('templateId').value,
    templateVersion: $('templateVersion').value,
    baseTemplateHash: $('baseTemplateHash').value,
    projectId: $('projectId').value,
    displayName: $('displayName').value,
    targetLanguage: $('targetLanguage').value,
    vcsType: $('vcsType').value,
    vcsRoot: $('vcsRoot').value,
    checklistPath: $('checklistPath').value,
    artifactOutputRoot: $('artifactOutputRoot').value,
    uatEvidencePath: $('uatEvidencePath').value,
    workflowName: $('workflowName').value,
    title: $('workflowTitle').value,
    description: $('workflowDescription').value,
    inputDefaults: defaults,
    promptSupplement: $('promptSupplement').value,
    requireHumanGate: true,
    stepReviewPauseAfter: $('stepReviewPauseAfter').value
  };
}

function readInputDefaultValue(input) {
  const type = input.getAttribute('data-input-default-type') || 'string';
  if (type === 'number') {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : input.value;
  }
  if (type === 'boolean') return input.value === 'true';
  if (type === 'null') return input.value === '' ? null : input.value;
  return input.value;
}

function setTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach(function(tab) {
    tab.classList.toggle('active', tab.getAttribute('data-tab') === name);
  });
  document.querySelectorAll('.tab-panel').forEach(function(panel) {
    panel.classList.toggle('active', panel.getAttribute('data-panel') === name);
  });
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value || '';
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function appendText(parent, className, value) {
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = value || '';
  parent.appendChild(span);
  return span;
}

function renderBadges(parent, values) {
  const badgeValues = Array.isArray(values) ? values : [];
  badgeValues.forEach(function(value) {
    appendText(parent, 'badge', value);
  });
}

function renderTemplateList(nextTemplates, selectedPath) {
  const list = $('templateList');
  if (!list) return;
  clearNode(list);
  const entries = Array.isArray(nextTemplates) ? nextTemplates : [];
  if (entries.length === 0) {
    appendText(list, 'muted', 'metadata.yaml が見つかりません。');
    return;
  }
  entries.forEach(function(template) {
    const button = document.createElement('button');
    const templatePath = template.templatePath || '';
    button.className = 'template-item' + (templatePath === selectedPath ? ' selected' : '');
    button.setAttribute('data-action', 'load-template');
    button.setAttribute('data-template-path', templatePath);
    appendText(button, 'template-title', template.displayName || template.templateId || 'template');
    appendText(button, 'muted', (template.templateId || '') + ' / ' + (template.templateVersion || ''));
    const badges = document.createElement('span');
    renderBadges(badges, template.supportedLanguages);
    renderBadges(badges, template.supportedVcs);
    button.appendChild(badges);
    list.appendChild(button);
  });
}

function renderDiagnostics(result) {
  const diagnostics = result && Array.isArray(result.diagnostics) ? result.diagnostics : [];
  return diagnostics.length === 0 ? '診断結果はありません。' : diagnostics.join('\n');
}

function readinessStatusLabel(status) {
  return { pass: '合格', warning: '注意', fail: '要対応', error: 'エラー' }[status] || '不明（' + String(status || '') + '）';
}

function renderReadiness(readiness) {
  if (!readiness) return;
  const status = readiness.status || 'error';
  const statusNode = $('readinessStatus');
  if (statusNode) {
    statusNode.className = 'panel status ' + status;
    statusNode.textContent = '状態: ' + readinessStatusLabel(status);
  }
  setText('readinessScore', 'スコア: ' + String(readiness.score));
  const checks = Array.isArray(readiness.checks) ? readiness.checks : [];
  setText('readinessChecks', checks.map(function(check) {
    const diagnostics = Array.isArray(check.diagnostics) && check.diagnostics.length > 0
      ? ' - ' + check.diagnostics.join('; ')
      : '';
    return readinessStatusLabel(check.status) + ': ' + check.id + ' - ' + check.title + diagnostics;
  }).join('\n'));
  const nextActions = Array.isArray(readiness.nextActions) ? readiness.nextActions : [];
  setText('readinessNextActions', nextActions.length === 0 ? '次の対応はありません。' : nextActions.join('\n'));
}

document.addEventListener('click', function(event) {
  const target = event.target && event.target.closest ? event.target.closest('[data-action], [data-builder-mode]') : event.target;
  const nextMode = target && target.getAttribute ? target.getAttribute('data-builder-mode') : '';
  if (nextMode) { post('selectMode', { mode: nextMode }); return; }
  const action = target && target.getAttribute ? target.getAttribute('data-action') : '';
  if (!action) return;
  if (action === 'tab') setTab(target.getAttribute('data-tab'));
  if (action === 'refresh-library') post('listTemplates');
  if (action === 'load-template') {
    selectedTemplatePath = target.getAttribute('data-template-path') || '';
    renderTemplateList(templates, selectedTemplatePath);
    post('loadTemplate', { templatePath: selectedTemplatePath });
  }
  if (action === 'validate-profile') post('validateProfile', { model: currentModel() });
  if (action === 'validate-customization') post('validateCustomization', { model: currentModel() });
  if (action === 'preview-workflow') post('previewWorkflow', { model: currentModel() });
  if (action === 'generate-workflow') post('applyStandardTemplate', { model: currentModel() });
  if (action === 'check-readiness') post('checkReadiness', { model: currentModel() });
  if (action === 'open-readiness-report') post('openReadinessReport');
  if (action === 'show-workflow-diff') post('showWorkflowDiff', { model: currentModel() });
});

document.addEventListener('change', function(event) {
  if (event.target && event.target.id === 'vcsType') {
    const prompt = $('promptSupplement');
    if (prompt) {
      const current = prompt.value.trim();
      if (!current || current === BAZAAR_PROMPT_SUPPLEMENT) {
        const nextVcs = event.target.value;
        prompt.value = (nextVcs === 'bazaar' || nextVcs === 'bzr') ? BAZAAR_PROMPT_SUPPLEMENT : '';
      }
    }
  }
  post('templateDraftChanged', { model: currentModel() });
});

document.addEventListener('input', function() { post('templateDraftChanged', { model: currentModel() }); });

window.addEventListener('message', function(event) {
  const message = event.data || {};
  if (!acceptHostMessage(message)) return;
  if (message.type === 'templateList') {
    templates = Array.isArray(message.templates) ? message.templates : [];
    selectedTemplatePath = currentModel().templatePath || selectedTemplatePath;
    renderTemplateList(templates, selectedTemplatePath);
    setText('diagnosticsOutput', renderDiagnostics(message));
  }
  if (message.type === 'diagnostics') setText('diagnosticsOutput', renderDiagnostics(message.result));
  if (message.type === 'previewResult') {
    setText('previewOutput', message.markdown || '');
    setText('diagnosticsOutput', renderDiagnostics(message));
  }
  if (message.type === 'readinessResult') {
    const readiness = message.readiness || (message.result && message.result.readiness);
    renderReadiness(message.status === 'error'
      ? Object.assign({}, readiness || {}, { status: 'error', nextActions: message.diagnostics || [] })
      : readiness);
    setText('readinessOutput', JSON.stringify(message, null, 2));
  }
});

setTab(activeTab);
post('listTemplates');
`
}
