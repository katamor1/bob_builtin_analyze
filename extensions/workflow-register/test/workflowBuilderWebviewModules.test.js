const test = require("node:test")
const assert = require("node:assert/strict")

const { createAuthoringModelFromTemplate } = require("../out/core/workflowAuthoringDefaults")
const { renderWorkflowBuilderBodyScript } = require("../out/webview/workflowBuilderBodyScript")
const { renderWorkflowBuilderClientScript } = require("../out/webview/workflowBuilderClientScript")
const { renderWorkflowBuilderGuidedHelpScript } = require("../out/webview/workflowBuilderGuidedHelpScript")
const { workflowBuilderHelpCatalog } = require("../out/webview/workflowBuilderHelpCatalog")
const { WorkflowBuilderHelpIds, workflowBuilderHelpIdValues, isWorkflowBuilderHelpId } = require("../out/webview/workflowBuilderHelpIds")
const { renderWorkflowBuilderHelpScript } = require("../out/webview/workflowBuilderHelpScript")
const { renderWorkflowBuilderHtml } = require("../out/webview/workflowBuilderHtml")
const { renderWorkflowBuilderStyles } = require("../out/webview/workflowBuilderStyles")

test("workflow builder html includes split style and client script output", () => {
  const model = createAuthoringModelFromTemplate({
    name: "webview-modules",
    title: "Webview Modules",
    description: "Render split webview modules.",
    template: "simple-agent"
  })
  const html = renderWorkflowBuilderHtml({
    cspSource: "vscode-resource:",
    initialModel: model,
    isEditMode: false,
    modeNote: "mode note",
    nonce: "nonce-123",
    templateOptions: [{ id: "simple-agent", label: "Simple Agent", description: "simple" }]
  })

  assert.match(html, /nonce-123/)
  assert.match(html, /Requires/)
  assert.match(html, /Guardrails/)
  assert.match(html, /Markdown Body/)
  assert.match(html, /requireApproval/)
  assert.match(html, /helpCatalog/)
  assert.match(html, /workflowHelpPanel/)
  assert.match(html, /workflowBuilderJumpToHelp/)
  assert.match(html, /renderWorkflowBuilderGuidedHelpScript|stepTypeGuideHtml/)
})

test("workflow builder split modules expose approval, markdown body, help, and guided navigation pieces", () => {
  const styles = renderWorkflowBuilderStyles()
  assert.match(styles, /\.tabs/)
  assert.match(styles, /\.help-panel/)
  assert.match(styles, /\.help-search-results/)
  assert.match(styles, /\.help-inline-guide/)

  const script = renderWorkflowBuilderClientScript()
  assert.match(script, /add-approval/)
  assert.match(script, /delete-approval/)
  assert.match(script, /data-approval-field/)
  assert.match(script, /goto-help-target/)

  const guidedScript = renderWorkflowBuilderGuidedHelpScript()
  assert.match(guidedScript, /stepTypeGuideHtml/)
  assert.match(guidedScript, /stepOptionLabel/)
  assert.match(guidedScript, /resultKeyOptionLabel/)
  assert.match(guidedScript, /diagnosticTarget/)
  assert.match(guidedScript, /gotoHelpTarget/)

  const bodyScript = renderWorkflowBuilderBodyScript()
  assert.match(bodyScript, /renderMarkdownBody/)
  assert.match(bodyScript, /data-body-field/)
  assert.match(bodyScript, /model\.body/)

  const helpScript = renderWorkflowBuilderHelpScript()
  assert.match(helpScript, /renderHelpPanel/)
  assert.match(helpScript, /data-help-id/)
  assert.match(helpScript, /MutationObserver/)
  assert.match(helpScript, /searchHelpEntries/)
  assert.match(helpScript, /data-help-search/)
  assert.match(helpScript, /data-help-jump/)
  assert.match(helpScript, /jumpToHelpEntry/)
  assert.match(helpScript, /template\.select/)
  assert.match(helpScript, /steps\.addCommand/)
  assert.match(helpScript, /section\.includeState/)
  assert.match(helpScript, /section\.command/)
  assert.match(helpScript, /section\.result/)
  assert.match(helpScript, /dynamicChoiceHelp/)
  assert.match(helpScript, /artifact\.producedBy/)
  assert.match(helpScript, /dataset\.stateKey/)
  assert.match(helpScript, /controlForHelpButton/)
})

test("workflow builder help id registry exposes known ids", () => {
  assert.equal(WorkflowBuilderHelpIds.StepType, "step.type")
  assert.equal(WorkflowBuilderHelpIds.StepPrompt, "step.prompt")
  assert.equal(WorkflowBuilderHelpIds.ArtifactProducedBy, "artifact.producedBy")
  assert.ok(workflowBuilderHelpIdValues.includes("result.source"))
  assert.equal(isWorkflowBuilderHelpId("guardrails.allowedCommands"), true)
  assert.equal(isWorkflowBuilderHelpId("unknown.help"), false)
})

test("workflow builder help catalog covers high priority Japanese help entries", () => {
  assert.equal(workflowBuilderHelpCatalog["step.type"].labelJa, "Step 種別")
  assert.equal(workflowBuilderHelpCatalog["preflight.failurePolicy"].options.stop.label, "stop")
  assert.match(workflowBuilderHelpCatalog["guardrails.allowedCommands"].summary, /許可/)
  assert.match(workflowBuilderHelpCatalog["approval.when"].example, /reviewContext\.changedFiles\.count/)
  assert.match(workflowBuilderHelpCatalog["completion.validateResult"].effect, /schema/)
})
