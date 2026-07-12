const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const { createAuthoringModelFromTemplate } = require("../out/core/workflowAuthoringDefaults")
const { renderWorkflowBuilderClientScript } = require("../out/webview/workflowBuilderClientScript")
const { renderWorkflowBuilderHtml } = require("../out/webview/workflowBuilderHtml")
const { renderWorkflowBuilderStyles } = require("../out/webview/workflowBuilderStyles")

function renderHtml() {
  return renderWorkflowBuilderHtml({
    cspSource: "vscode-resource:",
    initialModel: createAuthoringModelFromTemplate({
      name: "skip-resume-webview",
      title: "Skip Resume Webview",
      description: "Render readiness setup.",
      template: "simple-agent"
    }),
    isEditMode: false,
    modeNote: "mode note",
    nonce: "skip-resume-nonce",
    templateOptions: [{ id: "simple-agent", label: "Simple Agent", description: "simple" }]
  })
}

test("Artifacts tab exposes preview-first skip resume readiness controls", () => {
  const script = renderWorkflowBuilderClientScript()
  const html = renderHtml()

  for (const pattern of [
    /途中再開 readiness/,
    /previewSkipResumeReadiness/,
    /applySkipResumeReadiness/,
    /skipResumeReadinessPreviewResult/,
    /skipResumeReadinessApplied/,
    /apply-skip-resume-readiness/,
    /refresh-skip-resume-readiness/,
    /data-skip-resume-step-id/,
    /beforeMarkdown/,
    /afterMarkdown/
  ]) {
    assert.match(script, pattern)
    assert.match(html, pattern)
  }
})

test("client invalidates stale readiness previews and correlates host responses", () => {
  const script = renderWorkflowBuilderClientScript()

  assert.match(script, /skipResumeReadinessSourceSignature/)
  assert.match(script, /invalidateSkipResumeReadinessPreview/)
  assert.match(script, /requestId/)
  assert.match(script, /message\.requestId !== skipResumeReadinessRequestId/)
  assert.match(script, /model\.steps/)
  assert.match(script, /model\.artifacts/)
  assert.match(script, /model\.skipResume/)
})

test("readiness styling keeps candidates, blockers, and markdown comparison readable", () => {
  const styles = renderWorkflowBuilderStyles()

  assert.match(styles, /\.skip-resume-readiness/)
  assert.match(styles, /\.skip-resume-candidate/)
  assert.match(styles, /\.skip-resume-markdown-grid/)
  assert.match(styles, /\.skip-resume-blockers/)
})

test("workflow builder host echoes readiness request identifiers", () => {
  const panelSource = fs.readFileSync(path.join(__dirname, "..", "src", "webview", "workflowBuilderPanel.ts"), "utf8")

  assert.match(panelSource, /previewSkipResumeReadiness[^\n]*requestId/)
  assert.match(panelSource, /applySkipResumeReadiness[^\n]*requestId/)
  assert.match(panelSource, /skipResumeReadinessPreviewResult/)
  assert.match(panelSource, /skipResumeReadinessApplied/)
  assert.match(panelSource, /requestId/)
})
