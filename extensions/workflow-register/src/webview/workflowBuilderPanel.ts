import * as vscode from "vscode"
import { createAuthoringModelFromTemplate, createEmptyAuthoringStep } from "../core/workflowAuthoringDefaults"
import { WorkflowAuthoringInput, WorkflowAuthoringModel, WorkflowAuthoringStep, availableResultKeysBefore, nextUniqueId, normalizeId } from "../core/workflowAuthoringModel"
import { serializeAuthoringModelToMarkdown } from "../core/workflowAuthoringSerializer"
import { WorkflowTemplateKind, workflowTemplates } from "../core/workflowScaffold"
import { formatWorkflowDiagnostics, validateWorkflowText } from "../core/workflowValidator"

export interface WorkflowBuilderPanelOptions {
  extensionUri: vscode.Uri
  workflowRoot: string
  sourceId: string
}

type WorkflowBuilderMessage =
  | { type: "preview"; model: WorkflowAuthoringModel }
  | { type: "save"; model: WorkflowAuthoringModel }
  | { type: "resetTemplate"; name: string; title?: string; description: string; template: WorkflowTemplateKind }

export class WorkflowBuilderPanel {
  private static currentPanel: WorkflowBuilderPanel | undefined
  private readonly panel: vscode.WebviewPanel
  private disposables: vscode.Disposable[] = []

  private constructor(private readonly options: WorkflowBuilderPanelOptions, initialModel: WorkflowAuthoringModel) {
    this.panel = vscode.window.createWebviewPanel(
      "workflowRegisterBuilder",
      "Bob Workflow Builder",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    )
    this.panel.webview.html = this.renderHtml(initialModel)
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables)
    this.panel.webview.onDidReceiveMessage((message: WorkflowBuilderMessage) => this.onMessage(message), undefined, this.disposables)
  }

  static createOrShow(options: WorkflowBuilderPanelOptions): WorkflowBuilderPanel {
    const initialModel = createAuthoringModelFromTemplate({
      name: "new-workflow",
      title: "New Workflow",
      description: "Run New Workflow.",
      template: "simple-agent"
    })
    if (WorkflowBuilderPanel.currentPanel) {
      WorkflowBuilderPanel.currentPanel.panel.reveal(vscode.ViewColumn.One)
      WorkflowBuilderPanel.currentPanel.postModel(initialModel)
      return WorkflowBuilderPanel.currentPanel
    }
    const panel = new WorkflowBuilderPanel(options, initialModel)
    WorkflowBuilderPanel.currentPanel = panel
    return panel
  }

  dispose(): void {
    WorkflowBuilderPanel.currentPanel = undefined
    while (this.disposables.length) this.disposables.pop()?.dispose()
  }

  private async onMessage(message: WorkflowBuilderMessage): Promise<void> {
    if (message.type === "resetTemplate") {
      this.postModel(createAuthoringModelFromTemplate(message))
      return
    }
    if (message.type === "preview") {
      await this.preview(message.model)
      return
    }
    if (message.type === "save") {
      await this.save(message.model)
    }
  }

  private async preview(model: WorkflowAuthoringModel): Promise<void> {
    const rendered = serializeAuthoringModelToMarkdown(model)
    const validation = validateWorkflowText({ sourceId: this.options.sourceId, filePath: rendered.filePath, text: rendered.markdown })
    await this.panel.webview.postMessage({
      type: "previewResult",
      markdown: rendered.markdown,
      ok: validation.ok,
      diagnostics: formatWorkflowDiagnostics(validation)
    })
  }

  private async save(model: WorkflowAuthoringModel): Promise<void> {
    const rendered = serializeAuthoringModelToMarkdown(model)
    const validation = validateWorkflowText({ sourceId: this.options.sourceId, filePath: rendered.filePath, text: rendered.markdown })
    if (!validation.ok) {
      await this.panel.webview.postMessage({ type: "previewResult", markdown: rendered.markdown, ok: false, diagnostics: formatWorkflowDiagnostics(validation) })
      await vscode.window.showErrorMessage("Workflow validation failed. Fix errors before saving.")
      return
    }

    const dir = vscode.Uri.joinPath(vscode.Uri.file(this.options.workflowRoot), ".bob", "workflows", rendered.name)
    const uri = vscode.Uri.joinPath(dir, "WORKFLOW.md")
    await vscode.workspace.fs.createDirectory(dir)
    if (await exists(uri)) {
      const overwrite = await vscode.window.showWarningMessage(`WORKFLOW.md already exists for '${rendered.name}'. Overwrite it after creating a backup?`, { modal: true }, "Overwrite")
      if (overwrite !== "Overwrite") return
      const backupUri = vscode.Uri.joinPath(dir, `WORKFLOW.backup-${timestamp()}.md`)
      await vscode.workspace.fs.copy(uri, backupUri, { overwrite: true })
    }
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(rendered.markdown))
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { preview: false })
    await vscode.commands.executeCommand("workflowRegister.reload")
    await this.panel.webview.postMessage({ type: "saved", filePath: rendered.filePath })
    await vscode.window.showInformationMessage(`Saved ${rendered.filePath}`)
  }

  private postModel(model: WorkflowAuthoringModel): void {
    void this.panel.webview.postMessage({ type: "model", model })
  }

  private renderHtml(initialModel: WorkflowAuthoringModel): string {
    const nonce = getNonce()
    const templateOptions = workflowTemplates.map((template) => ({ id: template.id, label: template.label, description: template.description }))
    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bob Workflow Builder</title>
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 0; margin: 0; }
  header { padding: 14px 18px; border-bottom: 1px solid var(--vscode-panel-border); }
  main { display: grid; grid-template-columns: 360px minmax(420px, 1fr); gap: 0; min-height: calc(100vh - 64px); }
  aside { border-right: 1px solid var(--vscode-panel-border); padding: 14px; overflow: auto; }
  section { padding: 14px 18px; overflow: auto; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 18px 0 8px; }
  h3 { font-size: 13px; margin: 14px 0 6px; }
  label { display: block; font-weight: 600; margin: 10px 0 4px; }
  input, select, textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); padding: 6px; border-radius: 2px; font-family: var(--vscode-font-family); }
  textarea { min-height: 92px; font-family: var(--vscode-editor-font-family); }
  button { border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); padding: 6px 10px; margin: 4px 4px 4px 0; border-radius: 2px; cursor: pointer; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.danger { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); }
  button.link { background: transparent; color: var(--vscode-textLink-foreground); border: none; padding-left: 0; }
  .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .card { border: 1px solid var(--vscode-panel-border); padding: 10px; margin: 8px 0; border-radius: 4px; background: var(--vscode-sideBar-background); }
  .step-card { cursor: pointer; }
  .step-card.selected { outline: 1px solid var(--vscode-focusBorder); }
  .badge { display: inline-block; border: 1px solid var(--vscode-panel-border); padding: 1px 6px; border-radius: 99px; font-size: 11px; margin-left: 6px; }
  .tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--vscode-panel-border); margin-top: 12px; }
  .tab { padding: 6px 10px; cursor: pointer; border: 1px solid transparent; border-bottom: none; }
  .tab.active { border-color: var(--vscode-panel-border); background: var(--vscode-sideBar-background); }
  pre { white-space: pre-wrap; overflow: auto; padding: 10px; background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); }
  .diagnostics.ok { border-left: 4px solid var(--vscode-testing-iconPassed); }
  .diagnostics.ng { border-left: 4px solid var(--vscode-testing-iconFailed); }
</style>
</head>
<body>
<header>
  <h1>Bob Workflow Builder</h1>
  <div class="muted">フォームで新しい <code>.bob/workflows/&lt;name&gt;/WORKFLOW.md</code> を作成します。AI連携と既存編集は後続フェーズの土台だけを残しています。</div>
</header>
<main>
  <aside>
    <h2>基本情報</h2>
    <label>テンプレート</label>
    <select id="templateSelect"></select>
    <button class="secondary" data-action="apply-template">テンプレートを反映</button>
    <label>workflow name</label>
    <input id="workflowName" data-meta="name" />
    <div class="muted">英数字、ドット、アンダースコア、ハイフンを推奨。保存先フォルダ名にも使います。</div>
    <label>title</label>
    <input id="workflowTitle" data-meta="title" />
    <label>description</label>
    <textarea id="workflowDescription" data-meta="description"></textarea>
    <label><input id="workspaceRequired" type="checkbox" data-meta="workspaceRequired" style="width:auto" /> workspaceRequired</label>

    <h2>Steps</h2>
    <button data-action="add-step" data-step-type="agent">+ AI step</button>
    <button data-action="add-step" data-step-type="command">+ Command</button>
    <button data-action="add-step" data-step-type="manual">+ Manual</button>
    <button data-action="add-step" data-step-type="result">+ Result</button>
    <div id="stepsList"></div>
  </aside>
  <section>
    <div class="tabs">
      <div class="tab active" data-tab="step">Step detail</div>
      <div class="tab" data-tab="inputs">Inputs</div>
      <div class="tab" data-tab="artifacts">Artifacts</div>
      <div class="tab" data-tab="guardrails">Guardrails</div>
      <div class="tab" data-tab="preview">Preview / Diagnostics</div>
    </div>
    <div id="content"></div>
  </section>
</main>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const templates = ${JSON.stringify(templateOptions)};
let model = ${JSON.stringify(initialModel)};
let activeTab = 'step';
let selectedStepIndex = 0;
let previewTimer = undefined;
let latestPreview = '';
let latestDiagnostics = ['- preview is not ready yet.'];
let latestOk = false;

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value).replace(/[&<>\"]/g, function(ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' })[ch];
  });
}
function linesFromText(value) { return String(value || '').split(/\r?\n/).map(function(x) { return x.trim(); }).filter(Boolean); }
function textFromLines(value) { return Array.isArray(value) ? value.join('\n') : ''; }
function selectedStep() { return model.steps[selectedStepIndex]; }
function usedStepIds() { return model.steps.map(function(step) { return step.id; }); }
function normalizeId(value) { return String(value || '').trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^[._-]+/, '').replace(/[._-]+$/, ''); }
function nextId(base) {
  const normalized = normalizeId(base) || 'step';
  const used = new Set(usedStepIds());
  if (!used.has(normalized)) return normalized;
  for (let i = 2; i < 1000; i++) if (!used.has(normalized + '-' + i)) return normalized + '-' + i;
  return normalized + '-' + Date.now();
}
function titleFromId(id) { return String(id || 'New Step').split(/[._-]+/).filter(Boolean).map(function(part) { return part.slice(0, 1).toUpperCase() + part.slice(1); }).join(' ') || 'New Step'; }
function resultKeysBefore(index) { return model.steps.slice(0, Math.max(0, index)).map(function(step) { return step.resultKey; }).filter(Boolean); }
function ensureArrays() {
  model.inputs = Array.isArray(model.inputs) ? model.inputs : [];
  model.preflight = Array.isArray(model.preflight) ? model.preflight : [];
  model.steps = Array.isArray(model.steps) ? model.steps : [];
  model.artifacts = Array.isArray(model.artifacts) ? model.artifacts : [];
  if (!model.guardrails) model.guardrails = {};
}
function requestPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(function() { vscode.postMessage({ type: 'preview', model: model }); }, 180);
}
function render() {
  ensureArrays();
  if (selectedStepIndex >= model.steps.length) selectedStepIndex = Math.max(0, model.steps.length - 1);
  renderTemplateSelect();
  document.getElementById('workflowName').value = model.metadata.name || '';
  document.getElementById('workflowTitle').value = model.metadata.title || '';
  document.getElementById('workflowDescription').value = model.metadata.description || '';
  document.getElementById('workspaceRequired').checked = model.metadata.workspaceRequired !== false;
  renderStepsList();
  renderTabs();
  requestPreview();
}
function renderTemplateSelect() {
  const select = document.getElementById('templateSelect');
  const current = model.metadata.template || 'simple-agent';
  select.innerHTML = templates.map(function(template) {
    return '<option value="' + escapeHtml(template.id) + '" ' + (template.id === current ? 'selected' : '') + '>' + escapeHtml(template.label) + ' - ' + escapeHtml(template.description) + '</option>';
  }).join('');
}
function renderStepsList() {
  const list = document.getElementById('stepsList');
  list.innerHTML = model.steps.map(function(step, index) {
    const selected = index === selectedStepIndex ? ' selected' : '';
    const output = step.resultKey ? '<span class="badge">out: ' + escapeHtml(step.resultKey) + '</span>' : '';
    return '<div class="card step-card' + selected + '" data-action="select-step" data-index="' + index + '">' +
      '<strong>' + (index + 1) + '. ' + escapeHtml(step.title || step.id) + '</strong><span class="badge">' + escapeHtml(step.type) + '</span>' + output +
      '<div class="muted">' + escapeHtml(step.id) + '</div></div>';
  }).join('') || '<div class="muted">step がありません。追加してください。</div>';
}
function renderTabs() {
  document.querySelectorAll('.tab').forEach(function(tab) { tab.classList.toggle('active', tab.dataset.tab === activeTab); });
  if (activeTab === 'inputs') renderInputs();
  else if (activeTab === 'artifacts') renderArtifacts();
  else if (activeTab === 'guardrails') renderGuardrails();
  else if (activeTab === 'preview') renderPreview();
  else renderStepDetail();
}
function renderStepDetail() {
  const content = document.getElementById('content');
  const step = selectedStep();
  if (!step) {
    content.innerHTML = '<h2>Step detail</h2><p class="muted">左のボタンから step を追加してください。</p>';
    return;
  }
  const beforeKeys = resultKeysBefore(selectedStepIndex);
  const includeState = Array.isArray(step.includeState) ? step.includeState : [];
  const includeStateHtml = beforeKeys.length === 0 ? '<div class="muted">前段 step の resultKey がまだありません。</div>' : beforeKeys.map(function(key) {
    return '<label><input type="checkbox" style="width:auto" data-state-key="' + escapeHtml(key) + '" ' + (includeState.includes(key) ? 'checked' : '') + ' /> ' + escapeHtml(key) + '</label>';
  }).join('');
  let typeSpecific = '';
  if (step.type === 'command') typeSpecific = renderCommandStep(step);
  else if (step.type === 'result') typeSpecific = renderResultStep(step, beforeKeys);
  else typeSpecific = '<label>prompt</label><textarea data-step-field="prompt">' + escapeHtml(step.prompt || '') + '</textarea>';
  content.innerHTML = '<h2>Step detail</h2>' +
    '<div class="row"><div><label>id</label><input data-step-field="id" value="' + escapeHtml(step.id) + '" /></div>' +
    '<div><label>type</label><select data-step-field="type">' + stepTypeOptions(step.type) + '</select></div></div>' +
    '<label>title</label><input data-step-field="title" value="' + escapeHtml(step.title) + '" />' +
    '<div class="row"><label><input type="checkbox" style="width:auto" data-step-field="required" ' + (step.required ? 'checked' : '') + ' /> required</label>' +
    '<label><input type="checkbox" style="width:auto" data-step-field="stateRequired" ' + (step.stateRequired ? 'checked' : '') + ' /> stateRequired</label></div>' +
    '<div class="row"><div><label>resultKey</label><input data-step-field="resultKey" value="' + escapeHtml(step.resultKey || '') + '" /></div>' +
    '<div><label>maxResultBytes</label><input type="number" data-step-field="maxResultBytes" value="' + escapeHtml(step.maxResultBytes || '') + '" /></div></div>' +
    '<h3>includeState</h3>' + includeStateHtml +
    typeSpecific +
    '<h3>操作</h3><button class="secondary" data-action="move-step-up">上へ</button><button class="secondary" data-action="move-step-down">下へ</button><button class="secondary" data-action="duplicate-step">複製</button><button class="danger" data-action="delete-step">削除</button>';
}
function stepTypeOptions(current) {
  return ['agent', 'command', 'manual', 'result'].map(function(type) { return '<option value="' + type + '" ' + (type === current ? 'selected' : '') + '>' + type + '</option>'; }).join('');
}
function renderCommandStep(step) {
  const args = Array.isArray(step.action && step.action.args) ? step.action.args : [];
  const commandId = typeof args[0] === 'string' ? args[0] : '';
  const extraArgs = args.slice(1);
  return '<h3>Command</h3>' +
    '<label>action.provider</label><input data-command-field="provider" value="' + escapeHtml((step.action && step.action.provider) || 'vscode.executeCommand') + '" />' +
    '<label>VS Code command ID / args[0]</label><input data-command-field="commandId" value="' + escapeHtml(commandId) + '" />' +
    '<label>extra args JSON array</label><textarea data-command-field="extraArgs">' + escapeHtml(JSON.stringify(extraArgs, null, 2)) + '</textarea>' +
    '<label><input type="checkbox" style="width:auto" data-step-field="sendResult" ' + (step.sendResult ? 'checked' : '') + ' /> sendResult</label>' +
    '<label><input type="checkbox" style="width:auto" data-step-field="completeOnSuccess" ' + (step.completeOnSuccess ? 'checked' : '') + ' /> completeOnSuccess</label>';
}
function ensureResult(step) {
  if (!step.result) step.result = { source: 'state', stateKey: '', sinks: [{ type: 'file', path: '.bob/artifacts/result.md' }] };
  if (!Array.isArray(step.result.sinks) || step.result.sinks.length === 0) step.result.sinks = [{ type: 'file', path: '.bob/artifacts/result.md' }];
  return step.result;
}
function renderResultStep(step, beforeKeys) {
  const result = ensureResult(step);
  const sink = result.sinks[0] || { type: 'file', path: '' };
  const stateKeyOptions = [''].concat(beforeKeys).map(function(key) { return '<option value="' + escapeHtml(key) + '" ' + (key === result.stateKey ? 'selected' : '') + '>' + escapeHtml(key || '(未選択)') + '</option>'; }).join('');
  return '<h3>Result</h3>' +
    '<label>source</label><select data-result-field="source"><option value="state" ' + (result.source === 'state' ? 'selected' : '') + '>state</option><option value="literal" ' + (result.source === 'literal' ? 'selected' : '') + '>literal</option><option value="agent" ' + (result.source === 'agent' ? 'selected' : '') + '>agent</option></select>' +
    '<label>stateKey</label><select data-result-field="stateKey">' + stateKeyOptions + '</select>' +
    '<label>literal text</label><textarea data-result-field="text">' + escapeHtml(result.text || '') + '</textarea>' +
    '<label>file sink path</label><input data-result-field="path" value="' + escapeHtml(sink.path || '') + '" />';
}
function renderInputs() {
  const content = document.getElementById('content');
  content.innerHTML = '<h2>Inputs</h2><button data-action="add-input">+ input</button>' +
    model.inputs.map(function(input, index) {
      return '<div class="card"><div class="row"><div><label>id</label><input data-input-index="' + index + '" data-input-field="id" value="' + escapeHtml(input.id) + '" /></div>' +
        '<div><label>type</label><select data-input-index="' + index + '" data-input-field="type">' + inputTypeOptions(input.type) + '</select></div></div>' +
        '<label>title</label><input data-input-index="' + index + '" data-input-field="title" value="' + escapeHtml(input.title || '') + '" />' +
        '<label><input type="checkbox" style="width:auto" data-input-index="' + index + '" data-input-field="required" ' + (input.required ? 'checked' : '') + ' /> required</label>' +
        '<label>options（select の場合。1行1項目）</label><textarea data-input-index="' + index + '" data-input-field="options">' + escapeHtml(textFromLines(input.options || [])) + '</textarea>' +
        '<button class="danger" data-action="delete-input" data-index="' + index + '">削除</button></div>';
    }).join('') + '<p class="muted">select input は options が空だと保存前 validation error になります。</p>';
}
function inputTypeOptions(current) {
  return ['string', 'number', 'boolean', 'select'].map(function(type) { return '<option value="' + type + '" ' + (type === current ? 'selected' : '') + '>' + type + '</option>'; }).join('');
}
function renderArtifacts() {
  const content = document.getElementById('content');
  const stepIds = model.steps.map(function(step) { return step.id; });
  content.innerHTML = '<h2>Artifacts</h2><button data-action="add-artifact">+ artifact</button>' +
    model.artifacts.map(function(artifact, index) {
      const producedByOptions = [''].concat(stepIds).map(function(id) { return '<option value="' + escapeHtml(id) + '" ' + (id === artifact.producedBy ? 'selected' : '') + '>' + escapeHtml(id || '(未選択)') + '</option>'; }).join('');
      return '<div class="card"><div class="row"><div><label>id</label><input data-artifact-index="' + index + '" data-artifact-field="id" value="' + escapeHtml(artifact.id) + '" /></div>' +
        '<div><label>producedBy</label><select data-artifact-index="' + index + '" data-artifact-field="producedBy">' + producedByOptions + '</select></div></div>' +
        '<label>path</label><input data-artifact-index="' + index + '" data-artifact-field="path" value="' + escapeHtml(artifact.path) + '" />' +
        '<button class="danger" data-action="delete-artifact" data-index="' + index + '">削除</button></div>';
    }).join('') + '<p class="muted">producedBy は存在する step id から選択してください。</p>';
}
function renderGuardrails() {
  const guardrails = model.guardrails || {};
  document.getElementById('content').innerHTML = '<h2>Guardrails</h2>' +
    '<label>allowedCommands（1行1 command）</label><textarea data-guardrail-field="allowedCommands">' + escapeHtml(textFromLines(guardrails.allowedCommands || [])) + '</textarea>' +
    '<label>deniedCommands（1行1 command）</label><textarea data-guardrail-field="deniedCommands">' + escapeHtml(textFromLines(guardrails.deniedCommands || [])) + '</textarea>' +
    '<p class="muted">command step を使う場合は、破壊的 command を deniedCommands に明示することを推奨します。</p>';
}
function renderPreview() {
  document.getElementById('content').innerHTML = '<h2>Preview / Diagnostics</h2>' +
    '<button data-action="validate">Validate</button><button data-action="save">Save WORKFLOW.md</button>' +
    '<div class="card diagnostics ' + (latestOk ? 'ok' : 'ng') + '"><strong>' + (latestOk ? 'Validation OK' : 'Validation has errors/warnings') + '</strong><pre>' + escapeHtml(latestDiagnostics.join('\n')) + '</pre></div>' +
    '<h3>YAML / Markdown Preview</h3><pre>' + escapeHtml(latestPreview) + '</pre>';
}
function makeStep(type) {
  const id = nextId(type === 'agent' ? 'analyze' : type === 'command' ? 'collect-context' : type === 'result' ? 'write-result' : 'confirm');
  if (type === 'command') return { id: id, title: titleFromId(id), type: 'command', action: { provider: 'vscode.executeCommand', args: ['example.commandId'] }, resultKey: normalizeId(id) + 'Result' };
  if (type === 'manual') return { id: id, title: titleFromId(id), type: 'manual', prompt: 'Confirm this step before continuing.' };
  if (type === 'result') return { id: id, title: titleFromId(id), type: 'result', result: { source: 'state', stateKey: '', sinks: [{ type: 'file', path: '.bob/artifacts/' + id + '.md' }] } };
  return { id: id, title: titleFromId(id), type: 'agent', prompt: 'Describe the task for Bob to perform.' };
}
function duplicate(value) { return JSON.parse(JSON.stringify(value)); }
function handleFieldEvent(event) {
  const target = event.target;
  if (!target || !target.dataset) return;
  const value = target.type === 'checkbox' ? target.checked : target.value;
  if (target.dataset.meta) {
    model.metadata[target.dataset.meta] = value;
    requestPreview();
    return;
  }
  const step = selectedStep();
  if (step && target.dataset.stepField) {
    const field = target.dataset.stepField;
    if (field === 'type') {
      const replacement = makeStep(value);
      replacement.id = step.id;
      replacement.title = step.title;
      replacement.prompt = step.prompt;
      model.steps[selectedStepIndex] = replacement;
      render();
      return;
    }
    if (field === 'maxResultBytes') step[field] = value ? Number(value) : undefined;
    else step[field] = value;
    renderStepsList(); requestPreview(); return;
  }
  if (step && target.dataset.commandField && step.type === 'command') {
    if (!step.action) step.action = { provider: 'vscode.executeCommand', args: [] };
    const args = Array.isArray(step.action.args) ? step.action.args.slice() : [];
    if (target.dataset.commandField === 'provider') step.action.provider = value;
    if (target.dataset.commandField === 'commandId') step.action.args = [value].concat(args.slice(1));
    if (target.dataset.commandField === 'extraArgs') {
      try {
        const extra = JSON.parse(value || '[]');
        step.action.args = [args[0] || ''].concat(Array.isArray(extra) ? extra : [extra]);
      } catch (error) {}
    }
    requestPreview(); return;
  }
  if (step && target.dataset.resultField && (step.type === 'result' || step.type === 'agent')) {
    const result = ensureResult(step);
    const field = target.dataset.resultField;
    if (field === 'source') {
      const sinks = result.sinks;
      if (value === 'literal') step.result = { source: 'literal', text: result.text || '', sinks: sinks };
      else if (value === 'agent') step.result = { source: 'agent', sinks: sinks };
      else step.result = { source: 'state', stateKey: result.stateKey || '', sinks: sinks };
      render();
      return;
    }
    if (field === 'stateKey' && result.source === 'state') result.stateKey = value;
    if (field === 'text' && result.source === 'literal') result.text = value;
    if (field === 'path') result.sinks[0] = { type: 'file', path: value };
    requestPreview(); return;
  }
  if (target.dataset.stateKey && step) {
    step.includeState = Array.isArray(step.includeState) ? step.includeState : [];
    if (target.checked && !step.includeState.includes(target.dataset.stateKey)) step.includeState.push(target.dataset.stateKey);
    if (!target.checked) step.includeState = step.includeState.filter(function(key) { return key !== target.dataset.stateKey; });
    requestPreview(); return;
  }
  if (target.dataset.inputIndex) {
    const input = model.inputs[Number(target.dataset.inputIndex)];
    if (!input) return;
    const field = target.dataset.inputField;
    if (field === 'options') input.options = linesFromText(value);
    else input[field] = value;
    requestPreview(); return;
  }
  if (target.dataset.artifactIndex) {
    const artifact = model.artifacts[Number(target.dataset.artifactIndex)];
    if (!artifact) return;
    artifact[target.dataset.artifactField] = value || undefined;
    requestPreview(); return;
  }
  if (target.dataset.guardrailField) {
    if (!model.guardrails) model.guardrails = {};
    model.guardrails[target.dataset.guardrailField] = linesFromText(value);
    requestPreview(); return;
  }
}
document.addEventListener('input', handleFieldEvent);
document.addEventListener('change', handleFieldEvent);
document.addEventListener('click', function(event) {
  const target = event.target.closest('[data-action], .tab');
  if (!target) return;
  if (target.dataset.tab) { activeTab = target.dataset.tab; renderTabs(); return; }
  const action = target.dataset.action;
  if (action === 'select-step') { selectedStepIndex = Number(target.dataset.index); activeTab = 'step'; render(); return; }
  if (action === 'add-step') { model.steps.push(makeStep(target.dataset.stepType)); selectedStepIndex = model.steps.length - 1; activeTab = 'step'; render(); return; }
  if (action === 'delete-step') { if (selectedStep() && confirm('選択中 step を削除しますか？')) { model.steps.splice(selectedStepIndex, 1); render(); } return; }
  if (action === 'duplicate-step') { const copy = duplicate(selectedStep()); copy.id = nextId(copy.id); if (copy.resultKey) copy.resultKey = copy.resultKey + '2'; model.steps.splice(selectedStepIndex + 1, 0, copy); selectedStepIndex += 1; render(); return; }
  if (action === 'move-step-up' && selectedStepIndex > 0) { const s = model.steps.splice(selectedStepIndex, 1)[0]; model.steps.splice(selectedStepIndex - 1, 0, s); selectedStepIndex -= 1; render(); return; }
  if (action === 'move-step-down' && selectedStepIndex < model.steps.length - 1) { const s = model.steps.splice(selectedStepIndex, 1)[0]; model.steps.splice(selectedStepIndex + 1, 0, s); selectedStepIndex += 1; render(); return; }
  if (action === 'add-input') { const id = nextId('input'); model.inputs.push({ id: id, type: 'string', title: titleFromId(id), required: false }); renderInputs(); requestPreview(); return; }
  if (action === 'delete-input') { model.inputs.splice(Number(target.dataset.index), 1); renderInputs(); requestPreview(); return; }
  if (action === 'add-artifact') { model.artifacts.push({ id: nextId('report'), producedBy: selectedStep() ? selectedStep().id : undefined, path: '.bob/artifacts/report.md' }); renderArtifacts(); requestPreview(); return; }
  if (action === 'delete-artifact') { model.artifacts.splice(Number(target.dataset.index), 1); renderArtifacts(); requestPreview(); return; }
  if (action === 'apply-template') { vscode.postMessage({ type: 'resetTemplate', name: model.metadata.name || 'new-workflow', title: model.metadata.title || '', description: model.metadata.description || 'Run workflow.', template: document.getElementById('templateSelect').value }); return; }
  if (action === 'validate') { vscode.postMessage({ type: 'preview', model: model }); return; }
  if (action === 'save') { vscode.postMessage({ type: 'save', model: model }); return; }
});
window.addEventListener('message', function(event) {
  const message = event.data;
  if (message.type === 'previewResult') {
    latestPreview = message.markdown || '';
    latestDiagnostics = message.diagnostics || [];
    latestOk = Boolean(message.ok);
    if (activeTab === 'preview') renderPreview();
  }
  if (message.type === 'model') {
    model = message.model;
    selectedStepIndex = 0;
    activeTab = 'step';
    render();
  }
  if (message.type === 'saved') {
    latestDiagnostics = ['- saved: ' + message.filePath];
    activeTab = 'preview';
    render();
  }
});
render();
</script>
</body>
</html>`
  }
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch {
    return false
  }
}

function timestamp(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let text = ""
  for (let index = 0; index < 32; index += 1) text += chars.charAt(Math.floor(Math.random() * chars.length))
  return text
}
