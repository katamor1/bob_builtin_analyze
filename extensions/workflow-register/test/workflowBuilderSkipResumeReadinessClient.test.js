const test = require("node:test")
const assert = require("node:assert/strict")
const vm = require("node:vm")

const { renderWorkflowBuilderSkipResumeReadinessScript } = require("../out/webview/workflowBuilderSkipResumeReadinessScript")

function workflowModel() {
  return {
    metadata: { schemaVersion: "workflow-register/v1", name: "client-readiness", description: "Client readiness.", mode: "agent", workspaceRequired: true },
    inputs: [],
    preflight: [],
    steps: [{ id: "analyze", title: "Analyze", type: "agent", prompt: "Analyze.", resultKey: "report" }],
    artifacts: []
  }
}

function clientHarness() {
  const posted = []
  const documentListeners = {}
  const windowListeners = {}
  let renderCount = 0
  let previewRequestCount = 0
  const context = {
    model: workflowModel(),
    activeTab: "artifacts",
    vscode: { postMessage: (message) => posted.push(structuredClone(message)) },
    escapeHtml: (value) => String(value ?? "").replace(/[&<>\"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[ch]),
    renderArtifacts: () => { renderCount += 1 },
    render: () => { renderCount += 1 },
    requestPreview: () => { previewRequestCount += 1 },
    document: { addEventListener: (type, listener) => { (documentListeners[type] ||= []).push(listener) } },
    window: { addEventListener: (type, listener) => { (windowListeners[type] ||= []).push(listener) } },
    setTimeout: (callback) => { callback(); return 1 },
    clearTimeout: () => undefined,
    confirm: () => true,
    console,
    Date,
    JSON,
    Set,
    Object,
    Array,
    String,
    Boolean
  }
  vm.createContext(context)
  vm.runInContext(renderWorkflowBuilderSkipResumeReadinessScript(), context)
  return {
    context,
    posted,
    documentListeners,
    windowListeners,
    renderCount: () => renderCount,
    previewRequestCount: () => previewRequestCount,
    evaluate: (source) => vm.runInContext(source, context)
  }
}

function deliver(harness, message) {
  for (const listener of harness.windowListeners.message || []) listener({ data: message })
}

test("stale preview responses are ignored after the model changes", () => {
  const harness = clientHarness()
  harness.evaluate("renderSkipResumeReadiness()")
  const firstRequest = harness.posted.at(-1)
  assert.equal(firstRequest.type, "previewSkipResumeReadiness")

  harness.context.model.steps[0].resultKey = "newReport"
  harness.evaluate("invalidateSkipResumeReadinessPreview()")
  deliver(harness, {
    type: "skipResumeReadinessPreviewResult",
    requestId: firstRequest.requestId,
    ok: true,
    candidates: [],
    blockingIssues: [],
    changes: [],
    selectedStepIds: [],
    beforeMarkdown: "STALE_BEFORE",
    afterMarkdown: "STALE_AFTER",
    diagnostics: []
  })

  const html = harness.evaluate("renderSkipResumeReadiness()")
  assert.doesNotMatch(html, /STALE_AFTER/)
  assert.equal(harness.posted.at(-1).type, "previewSkipResumeReadiness")
  assert.equal(harness.posted.at(-1).model.steps[0].resultKey, "newReport")
})

test("successful apply replaces the model and immediately requests a fresh preview", () => {
  const harness = clientHarness()
  harness.evaluate("renderSkipResumeReadiness()")
  const previewRequest = harness.posted.at(-1)
  deliver(harness, {
    type: "skipResumeReadinessPreviewResult",
    requestId: previewRequest.requestId,
    ok: true,
    candidates: [],
    blockingIssues: [],
    changes: ["Enable x-skipResume.fileBound."],
    selectedStepIds: [],
    beforeMarkdown: "BEFORE",
    afterMarkdown: "AFTER",
    diagnostics: []
  })

  for (const listener of harness.documentListeners.click || []) {
    listener({ target: { closest: () => ({ dataset: { action: "apply-skip-resume-readiness" } }) } })
  }
  const applyRequest = harness.posted.at(-1)
  assert.equal(applyRequest.type, "applySkipResumeReadiness")

  const appliedModel = workflowModel()
  appliedModel.skipResume = { fileBound: true }
  appliedModel.artifacts = [{ id: "report", producedBy: "analyze", path: ".bob/workflows/runs/{{run.id}}/artifacts/analyze/report.md", schema: "text/markdown" }]
  deliver(harness, {
    type: "skipResumeReadinessApplied",
    requestId: applyRequest.requestId,
    model: appliedModel,
    preview: {
      ok: true,
      candidates: [],
      blockingIssues: [],
      changes: ["Enable x-skipResume.fileBound."],
      selectedStepIds: [],
      beforeMarkdown: "BEFORE",
      afterMarkdown: "AFTER",
      diagnostics: []
    }
  })

  assert.deepEqual(harness.context.model, appliedModel)
  assert.equal(harness.previewRequestCount(), 1)
  assert.equal(harness.posted.at(-1).type, "previewSkipResumeReadiness")
  assert.deepEqual(harness.posted.at(-1).model, appliedModel)
})
