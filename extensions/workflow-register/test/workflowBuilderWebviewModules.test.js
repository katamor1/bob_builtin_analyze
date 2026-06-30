const test = require("node:test")
const assert = require("node:assert/strict")

const { createAuthoringModelFromTemplate } = require("../out/core/workflowAuthoringDefaults")
const { renderWorkflowBuilderBodyScript } = require("../out/webview/workflowBuilderBodyScript")
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
})

test("workflow builder split modules expose approval and markdown body editor pieces", () => {
  assert.match(renderWorkflowBuilderStyles(), /\.tabs/)
  const script = renderWorkflowBuilderClientScript()
  assert.match(script, /add-approval/)
  assert.match(script, /delete-approval/)
  assert.match(script, /data-approval-field/)

  const bodyScript = renderWorkflowBuilderBodyScript()
  assert.match(bodyScript, /renderMarkdownBody/)
  assert.match(bodyScript, /data-body-field/)
  assert.match(bodyScript, /model\.body/)
})
