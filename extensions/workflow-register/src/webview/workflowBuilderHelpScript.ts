export function renderWorkflowBuilderHelpScript(): string {
  return String.raw`
let activeHelpId = 'tab.step';
const defaultHelpId = 'tab.step';
function helpEntry(id) { return helpCatalog[id] || helpCatalog[defaultHelpId]; }
function optionHelpHtml(entry, control) {
  if (!entry || !entry.options || !control || control.tagName !== 'SELECT') return '';
  const option = entry.options[control.value];
  if (!option) return '';
  return '<div class="help-option"><strong>選択中: ' + escapeHtml(option.label) + '</strong><p>' + escapeHtml(option.summary) + '</p><p>' + escapeHtml(option.effect) + '</p>' + (option.caution ? '<p class="help-caution">注意: ' + escapeHtml(option.caution) + '</p>' : '') + '</div>';
}
function renderHelpPanel(id, control) {
  activeHelpId = id || activeHelpId || defaultHelpId;
  const entry = helpEntry(activeHelpId);
  const panel = ensureHelpPanel();
  if (!entry || !panel) return;
  panel.innerHTML = '<h2>この項目の説明</h2>' +
    '<div class="help-title">' + escapeHtml(entry.labelJa) + '</div>' +
    '<div class="help-key">' + escapeHtml(entry.fieldKey) + '</div>' +
    '<p>' + escapeHtml(entry.summary) + '</p>' +
    '<h3>効果</h3><p>' + escapeHtml(entry.effect) + '</p>' +
    (entry.whenToUse ? '<h3>使う場面</h3><p>' + escapeHtml(entry.whenToUse) + '</p>' : '') +
    (entry.caution ? '<h3>注意</h3><p class="help-caution">' + escapeHtml(entry.caution) + '</p>' : '') +
    optionHelpHtml(entry, control) +
    (entry.example ? '<h3>YAML例</h3><pre>' + escapeHtml(entry.example) + '</pre>' : '') +
    (entry.related && entry.related.length ? '<h3>関連</h3><ul>' + entry.related.map(function(item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>' : '');
}
function ensureHelpPanel() {
  let panel = document.getElementById('workflowHelpPanel');
  if (panel) return panel;
  const main = document.querySelector('main');
  if (!main) return undefined;
  panel = document.createElement('aside');
  panel.id = 'workflowHelpPanel';
  panel.className = 'help-panel';
  panel.setAttribute('aria-live', 'polite');
  main.appendChild(panel);
  return panel;
}
function fieldIdForControl(control) {
  if (!control || !control.dataset) return undefined;
  if (control.dataset.meta) return 'meta.' + control.dataset.meta;
  if (control.dataset.bodyField) return 'body.' + control.dataset.bodyField;
  if (control.dataset.stepField) return 'step.' + control.dataset.stepField;
  if (control.dataset.commandField) return 'command.' + control.dataset.commandField;
  if (control.dataset.resultField) return 'result.' + control.dataset.resultField;
  if (control.dataset.stateKey) return 'step.includeState';
  if (control.dataset.inputField) return 'input.' + control.dataset.inputField;
  if (control.dataset.requiresField) return 'requires.' + control.dataset.requiresField;
  if (control.dataset.preflightField) return 'preflight.' + control.dataset.preflightField;
  if (control.dataset.artifactField) return 'artifact.' + control.dataset.artifactField;
  if (control.dataset.guardrailField) return 'guardrails.' + control.dataset.guardrailField;
  if (control.dataset.approvalField) return 'approval.' + control.dataset.approvalField;
  if (control.dataset.completionField) return 'completion.' + control.dataset.completionField;
  return undefined;
}
function labelForControl(control) {
  if (!control) return undefined;
  const wrapped = control.closest && control.closest('label');
  if (wrapped) return wrapped;
  let previous = control.previousElementSibling;
  while (previous && previous.nodeType === 1) {
    if (previous.tagName === 'LABEL') return previous;
    if (!previous.classList || !previous.classList.contains('muted')) break;
    previous = previous.previousElementSibling;
  }
  return undefined;
}
function decorateHelpTargets(root) {
  const scope = root || document;
  scope.querySelectorAll('input, select, textarea').forEach(function(control) {
    const id = fieldIdForControl(control);
    if (!id || !helpCatalog[id]) return;
    control.setAttribute('data-help-id', id);
    const label = labelForControl(control);
    if (!label || label.querySelector('[data-help-button="' + id + '"]')) return;
    const entry = helpCatalog[id];
    if (!label.querySelector('.field-key') && entry.fieldKey) {
      const key = document.createElement('span');
      key.className = 'field-key';
      key.textContent = entry.fieldKey;
      label.appendChild(document.createTextNode(' '));
      label.appendChild(key);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'help-button';
    button.textContent = '?';
    button.setAttribute('aria-label', entry.labelJa + ' の説明を表示');
    button.setAttribute('data-help-button', id);
    button.setAttribute('data-help-id', id);
    label.appendChild(document.createTextNode(' '));
    label.appendChild(button);
  });
}
function helpForActiveTab() {
  const tab = document.querySelector('.tab.active');
  if (!tab || !tab.dataset || !tab.dataset.tab) return defaultHelpId;
  return 'tab.' + tab.dataset.tab;
}
document.addEventListener('focusin', function(event) {
  const control = event.target && event.target.closest ? event.target.closest('[data-help-id]') : undefined;
  if (control) renderHelpPanel(control.dataset.helpId, control);
});
document.addEventListener('change', function(event) {
  const control = event.target && event.target.closest ? event.target.closest('[data-help-id]') : undefined;
  if (control) renderHelpPanel(control.dataset.helpId, control);
});
document.addEventListener('click', function(event) {
  const button = event.target && event.target.closest ? event.target.closest('[data-help-id]') : undefined;
  if (button && button.classList && button.classList.contains('help-button')) {
    event.preventDefault();
    event.stopPropagation();
    const label = button.closest('label');
    const control = label ? label.querySelector('[data-help-id]:not(.help-button)') : undefined;
    renderHelpPanel(button.dataset.helpId, control);
    return;
  }
  const tab = event.target && event.target.closest ? event.target.closest('.tab') : undefined;
  if (tab && tab.dataset && tab.dataset.tab) setTimeout(function() { decorateHelpTargets(document.getElementById('content')); renderHelpPanel('tab.' + tab.dataset.tab); }, 0);
});
const helpObserver = new MutationObserver(function(mutations) {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach(function(node) {
      if (node.nodeType === 1) decorateHelpTargets(node);
    });
  }
});
helpObserver.observe(document.body, { childList: true, subtree: true });
ensureHelpPanel();
decorateHelpTargets(document);
renderHelpPanel(helpForActiveTab());
`
}
