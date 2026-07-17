import { WorkflowAuthoringModel } from "../core/workflowAuthoringModel"
import { renderWorkflowBuilderBodyScript } from "./workflowBuilderBodyScript"
import { renderWorkflowBuilderClientScript } from "./workflowBuilderClientScript"
import { renderWorkflowBuilderGuidedHelpScript } from "./workflowBuilderGuidedHelpScript"
import { workflowBuilderHelpCatalog } from "./workflowBuilderHelpCatalog"
import { renderWorkflowBuilderHelpScript } from "./workflowBuilderHelpScript"
import { renderWorkflowBuilderStepDraftRepairScript } from "./workflowBuilderStepDraftRepairScript"
import { renderWorkflowBuilderStepDraftScript } from "./workflowBuilderStepDraftScript"
import { renderWorkflowBuilderStyles } from "./workflowBuilderStyles"

export interface WorkflowBuilderTemplateOption {
  id: string
  label: string
  description: string
}

export interface RenderWorkflowBuilderHtmlOptions {
  cspSource: string
  initialModel: WorkflowAuthoringModel
  isEditMode: boolean
  focusStepId?: string
  modeNote: string
  nonce: string
  templateOptions: WorkflowBuilderTemplateOption[]
}

export function renderWorkflowBuilderHtml(options: RenderWorkflowBuilderHtmlOptions): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${options.cspSource} 'unsafe-inline'; script-src 'nonce-${options.nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bob ワークフロー作成・編集</title>
<style>
${renderWorkflowBuilderStyles()}
</style>
</head>
<body>
<header><h1>Bob ワークフロー作成・編集</h1><div class="muted">${options.modeNote}</div></header>
<main>
<aside>
<h2>基本情報</h2>
<label>テンプレート</label><select id="templateSelect"></select><button class="secondary" data-action="apply-template">テンプレートを反映</button>
<label>ワークフロー名</label><input id="workflowName" data-meta="name" /><div class="muted">英数字、ドット、アンダースコア、ハイフンを推奨。新規作成では保存先フォルダ名にも使います。</div>
<label>表示名</label><input id="workflowTitle" data-meta="title" />
<label>説明</label><textarea id="workflowDescription" data-meta="description"></textarea>
<label><input id="workspaceRequired" type="checkbox" data-meta="workspaceRequired" style="width:auto" /> ワークスペースを必須にする（workspaceRequired）</label>
<h2>ステップ</h2>
<button data-action="add-step" data-step-type="agent">AI ステップを追加</button><button data-action="add-step" data-step-type="command">コマンドステップを追加</button><button data-action="add-step" data-step-type="manual">手動ステップを追加</button><button data-action="add-step" data-step-type="result">保存ステップを追加</button>
<div id="stepsList"></div>
</aside>
<section>
<div class="tabs">
<div class="tab active" data-tab="step">ステップ設定</div><div class="tab" data-tab="inputs">入力項目</div><div class="tab" data-tab="requires">実行条件</div><div class="tab" data-tab="preflight">事前確認</div><div class="tab" data-tab="branching">分岐・ループ</div><div class="tab" data-tab="artifacts">成果物</div><div class="tab" data-tab="guardrails">安全制限</div><div class="tab" data-tab="completion">完了時の処理</div><div class="tab" data-tab="body">Markdown 本文</div><div class="tab" data-tab="preview">プレビューと診断</div>
</div>
<div id="content"></div>
</section>
</main>
<script nonce="${options.nonce}">
const templates = ${JSON.stringify(options.templateOptions)};
const helpCatalog = ${JSON.stringify(workflowBuilderHelpCatalog)};
let model = ${JSON.stringify(options.initialModel)};
let editMode = ${JSON.stringify(options.isEditMode)};
let focusStepId = ${JSON.stringify(options.focusStepId ?? "")};
${renderWorkflowBuilderClientScript()}
${renderWorkflowBuilderStepDraftScript()}
${renderWorkflowBuilderStepDraftRepairScript()}
if (focusStepId) {
  const focusIndex = model.steps.findIndex(function(step) { return step.id === focusStepId; });
  if (focusIndex >= 0) { selectedStepIndex = focusIndex; activeTab = 'step'; render(); }
  focusStepId = '';
}
${renderWorkflowBuilderGuidedHelpScript()}
${renderWorkflowBuilderBodyScript()}
${renderWorkflowBuilderHelpScript()}
window.workflowBuilderJumpToHelp = typeof jumpToHelpEntry === 'function' ? jumpToHelpEntry : undefined;
</script>
</body>
</html>`
}
