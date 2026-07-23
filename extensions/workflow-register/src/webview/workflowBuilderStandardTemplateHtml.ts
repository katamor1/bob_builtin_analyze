import { TemplateCustomizationStudioModel, TemplateLibraryEntry } from "../template/templateStudioModel"
import { renderWorkflowBuilderStandardTemplateClientScript } from "./workflowBuilderStandardTemplateClientScript"
import { renderWorkflowBuilderStandardTemplateStyles } from "./workflowBuilderStandardTemplateStyles"

export interface RenderWorkflowBuilderStandardTemplateHtmlOptions {
  cspSource: string
  nonce: string
  templates: TemplateLibraryEntry[]
  model: TemplateCustomizationStudioModel
  diagnostics?: string[]
  sessionToken: string
}

export function renderWorkflowBuilderStandardTemplateHtml(options: RenderWorkflowBuilderStandardTemplateHtmlOptions): string {
  const selectedTemplate = options.templates.find((template) => template.templatePath === options.model.templatePath) ?? options.templates[0]
  const supportedLanguages = selectedTemplate?.supportedLanguages?.length ? selectedTemplate.supportedLanguages : [options.model.targetLanguage]
  const supportedVcs = selectedTemplate?.supportedVcs?.length ? selectedTemplate.supportedVcs : [options.model.vcsType]
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${options.cspSource} 'unsafe-inline'; script-src 'nonce-${options.nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ワークフロー作成・編集</title>
<style>
${renderWorkflowBuilderStandardTemplateStyles()}
</style>
</head>
<body>
<header>
  <h1>ワークフロー作成・編集</h1>
  ${renderModeSelector("standard-template")}
  <div class="muted">標準テンプレートを選び、許可されたプロジェクト情報とワークフロー設定だけを編集します。Bazaar では <code>bzr --no-aliases</code> を前提にします。</div>
</header>
<main>
<aside>
  <h2>テンプレート一覧</h2>
  <button class="secondary" data-action="refresh-library">再読み込み</button>
  <div id="templateList" class="template-list">
    ${renderTemplateList(options.templates, options.model.templatePath)}
  </div>
</aside>
<section>
  <div class="tabs">
    <button class="tab active" data-action="tab" data-tab="library">テンプレート一覧</button>
    <button class="tab" data-action="tab" data-tab="customize">プロジェクト設定</button>
    <button class="tab" data-action="tab" data-tab="readiness">適用準備状況</button>
  </div>

  <div class="tab-panel active" data-panel="library">
    <h2>${escapeHtml(options.model.title)}</h2>
    <div class="panel">
      <div><strong>テンプレート ID（templateId）</strong>: ${escapeHtml(options.model.templateId)}</div>
      <div><strong>テンプレート版（templateVersion）</strong>: ${escapeHtml(options.model.templateVersion)}</div>
      <div><strong>基準テンプレートハッシュ（baseTemplateHash）</strong>: ${escapeHtml(options.model.baseTemplateHash)}</div>
      <div class="muted">${escapeHtml(options.model.description)}</div>
    </div>
  </div>

  <div class="tab-panel" data-panel="customize">
    <input id="templatePath" type="hidden" value="${attribute(options.model.templatePath)}">
    <input id="templateId" type="hidden" value="${attribute(options.model.templateId)}">
    <input id="templateVersion" type="hidden" value="${attribute(options.model.templateVersion)}">
    <input id="baseTemplateHash" type="hidden" value="${attribute(options.model.baseTemplateHash)}">

    <h2>プロジェクト情報</h2>
    <div class="row">
      <div><label for="projectId">プロジェクト ID（projectId）</label><input id="projectId" value="${attribute(options.model.projectId)}"></div>
      <div><label for="displayName">表示名</label><input id="displayName" value="${attribute(options.model.displayName)}"></div>
    </div>
    <div class="row">
      <div><label for="targetLanguage">対象言語</label>${renderSelect("targetLanguage", supportedLanguages, options.model.targetLanguage)}</div>
      <div><label for="vcsType">バージョン管理方式</label>${renderSelect("vcsType", supportedVcs, options.model.vcsType)}</div>
    </div>
    <label for="vcsRoot">バージョン管理のルート</label><input id="vcsRoot" value="${attribute(options.model.vcsRoot)}">
    <div class="muted">Bazaar / bzr の profile は <code>vcs.noAliases: true</code> を保存し、操作は <code>bzr --no-aliases</code> を使います。</div>
    <label for="checklistPath">チェックリストのパス</label><input id="checklistPath" value="${attribute(options.model.checklistPath)}">
    <label for="artifactOutputRoot">工程成果物の出力先</label><input id="artifactOutputRoot" value="${attribute(options.model.artifactOutputRoot)}">
    <label for="uatEvidencePath">UAT 証跡のパス</label><input id="uatEvidencePath" value="${attribute(options.model.uatEvidencePath)}">

    <h2>ワークフロー設定</h2>
    <div class="row">
      <div><label for="workflowName">ワークフロー名</label><input id="workflowName" value="${attribute(options.model.workflowName)}"></div>
      <div><label for="workflowTitle">表示名</label><input id="workflowTitle" value="${attribute(options.model.title)}"></div>
    </div>
    <label for="workflowDescription">説明</label><textarea id="workflowDescription">${escapeHtml(options.model.description)}</textarea>
    <h3>入力項目の既定値</h3>
    <div class="input-defaults">
      ${renderInputDefaults(options.model.inputDefaults)}
    </div>
    <label for="promptSupplement">Bob への補足指示</label><textarea id="promptSupplement">${escapeHtml(options.model.promptSupplement)}</textarea>
    <div class="row">
      <div><label for="humanGate">人による確認</label><input id="humanGate" value="required" disabled></div>
      <div><label for="stepReviewPauseAfter">ステップ後の一時停止</label>${renderSelect("stepReviewPauseAfter", ["agentAndCommand", "everyStep", "none"], options.model.stepReviewPauseAfter)}</div>
    </div>
    <div class="action-row">
      <button data-action="validate-profile">プロジェクト情報を検証</button>
      <button data-action="validate-customization">ワークフロー設定を検証</button>
      <button data-action="preview-workflow">プレビュー</button>
      <button data-action="show-workflow-diff" class="secondary">差分を表示</button>
      <button data-action="generate-workflow">Builder に反映</button>
    </div>
  </div>

  <div class="tab-panel" data-panel="readiness">
    <h2>適用準備状況</h2>
    <div class="action-row">
      <button data-action="check-readiness">適用準備状況を確認</button>
      <button data-action="open-readiness-report" class="secondary">レポートを開く</button>
    </div>
    <div id="readinessStatus" class="panel status">状態: 未確認</div>
    <div id="readinessScore" class="panel">スコア: -</div>
    <h3>確認項目</h3>
    <div id="readinessChecks" class="panel"></div>
    <h3>次の対応</h3>
    <div id="readinessNextActions" class="panel"></div>
    <pre id="readinessOutput"></pre>
  </div>

  <h2>プレビューと診断</h2>
  <pre id="diagnosticsOutput">${escapeHtml((options.diagnostics ?? []).join("\n"))}</pre>
  <pre id="previewOutput"></pre>
</section>
</main>
<script nonce="${options.nonce}">
const initialTemplates = ${jsonForScript(options.templates)};
const initialModel = ${jsonForScript(options.model)};
const sessionToken = ${jsonForScript(options.sessionToken)};
${renderWorkflowBuilderStandardTemplateClientScript()}
</script>
</body>
</html>`
}

function renderModeSelector(activeMode: string): string {
  const modes = [
    ["empty", "空のワークフロー"],
    ["standard-template", "標準テンプレートから作成"],
    ["edit", "既存ワークフローを編集"]
  ]
  return `<nav class="builder-modes">${modes.map(([mode, label]) => `<button class="secondary${mode === activeMode ? " active" : ""}" data-builder-mode="${mode}"${mode === activeMode ? " disabled aria-current=\"page\"" : ""}>${label}</button>`).join("")}</nav>`
}

function renderTemplateList(templates: TemplateLibraryEntry[], selectedPath: string): string {
  if (templates.length === 0) return `<div class="muted">metadata.yaml が見つかりません。</div>`
  return templates.map((template) => {
    const selected = template.templatePath === selectedPath ? " selected" : ""
    return `<button class="template-item${selected}" data-action="load-template" data-template-path="${attribute(template.templatePath)}">
  <span class="template-title">${escapeHtml(template.displayName)}</span>
  <span class="muted">${escapeHtml(template.templateId)} / ${escapeHtml(template.templateVersion)}</span>
  <span>${renderBadges(template.supportedLanguages)}${renderBadges(template.supportedVcs)}</span>
</button>`
  }).join("")
}

function renderInputDefaults(inputDefaults: Record<string, string | number | boolean | null>): string {
  const entries = Object.entries(inputDefaults)
  if (entries.length === 0) return `<div class="muted">このテンプレートに編集できる入力項目の既定値はありません。</div>`
  return entries.map(([key, value]) => renderInputDefault(key, value)).join("")
}

function renderInputDefault(key: string, value: string | number | boolean | null): string {
  const valueType = value === null ? "null" : typeof value
  const id = `input-default-${attribute(key)}`
  const data = `data-input-default="${attribute(key)}" data-input-default-type="${attribute(valueType)}"`
  if (typeof value === "boolean") {
    return `<div><label for="${id}">${escapeHtml(key)}</label><select id="${id}" ${data}><option value="true"${value ? " selected" : ""}>true</option><option value="false"${value ? "" : " selected"}>false</option></select></div>`
  }
  const inputType = typeof value === "number" ? ` type="number"` : ""
  return `<div><label for="${id}">${escapeHtml(key)}</label><input id="${id}"${inputType} ${data} value="${attribute(String(value ?? ""))}"></div>`
}

function renderSelect(id: string, values: string[], selected: string): string {
  return `<select id="${attribute(id)}">${values.map((value) => `<option value="${attribute(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}</select>`
}

function renderBadges(values: string[]): string {
  return values.map((value) => `<span class="badge">${escapeHtml(value)}</span>`).join("")
}

function attribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;")
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}
