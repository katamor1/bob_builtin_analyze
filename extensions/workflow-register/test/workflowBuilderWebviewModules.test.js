const test = require("node:test")
const assert = require("node:assert/strict")

const { createAuthoringModelFromTemplate } = require("../out/core/workflowAuthoringDefaults")
const { renderWorkflowBuilderBodyScript } = require("../out/webview/workflowBuilderBodyScript")
const { workflowBuilderHelpCatalog } = require("../out/webview/workflowBuilderHelpCatalog")
const { renderWorkflowBuilderHelpScript } = require("../out/webview/workflowBuilderHelpScript")
const { renderWorkflowBuilderHtml } = require("../out/webview/workflowBuilderHtml")
const { renderWorkflowBuilderStyles } = require("../out/webview/workflowBuilderStyles")
const { renderWorkflowBuilderClientScript } = require("../out/webview/workflowBuilderClientScript")

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
})

test("workflow builder split modules expose approval, markdown body, and help editor pieces", () => {
  assert.match(renderWorkflowBuilderStyles(), /\.tabs/)
  assert.match(renderWorkflowBuilderStyles(), /\.help-panel/)
  const script = renderWorkflowBuilderClientScript()
  assert.match(script, /add-approval/)
  assert.match(script, /delete-approval/)
  assert.match(script, /data-approval-field/)

  const bodyScript = renderWorkflowBuilderBodyScript()
  assert.match(bodyScript, /renderMarkdownBody/)
  assert.match(bodyScript, /data-body-field/)
  assert.match(bodyScript, /model\.body/)

  const helpScript = renderWorkflowBuilderHelpScript()
  assert.match(helpScript, /renderHelpPanel/)
  assert.match(helpScript, /data-help-id/)
  assert.match(helpScript, /MutationObserver/)
})

test("workflow builder help catalog covers high priority Japanese help entries", () => {
  assert.equal(workflowBuilderHelpCatalog["step.type"].labelJa, "Step 種別")
  assert.equal(workflowBuilderHelpCatalog["preflight.failurePolicy"].options.stop.label, "stop")
  assert.match(workflowBuilderHelpCatalog["guardrails.allowedCommands"].summary, /許可/)
  assert.match(workflowBuilderHelpCatalog["approval.when"].example, /reviewContext\.changedFiles\.count/)
  assert.match(workflowBuilderHelpCatalog["completion.validateResult"].effect, /schema/)
})
