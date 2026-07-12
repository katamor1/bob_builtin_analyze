const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")

const { renderWorkflowBuilderHtml } = require("../out/webview/workflowBuilderHtml")
const { renderWorkflowBuilderClientScript } = require("../out/webview/workflowBuilderClientScript")

function readinessModel(name = "readiness-builder") {
  return {
    metadata: {
      schemaVersion: "workflow-register/v1",
      name,
      title: "Readiness Builder",
      description: "Configure reusable outputs safely.",
      mode: "agent",
      workspaceRequired: true
    },
    inputs: [],
    preflight: [],
    steps: [
      {
        id: "collect",
        title: "Collect",
        type: "command",
        action: { provider: "sample.collect" },
        resultKey: "context"
      },
      {
        id: "review",
        title: "Review",
        type: "agent",
        prompt: "Review context.",
        includeState: ["context"],
        resultKey: "report"
      }
    ],
    artifacts: [],
    body: "# Readiness Builder\n"
  }
}

function loadPanelWithVscode(vscode) {
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const modulePath = require.resolve("../out/webview/workflowBuilderPanel")
    delete require.cache[modulePath]
    return require(modulePath).WorkflowBuilderPanel
  } finally {
    Module._load = originalLoad
  }
}

function createPanelHarness(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-readiness-builder-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const state = { errors: [], posted: [] }
  let receiveMessage
  let disposeListener
  const uri = (fsPath) => ({ fsPath: path.resolve(fsPath) })
  const webview = {
    cspSource: "vscode-resource:",
    html: "",
    onDidReceiveMessage: (listener) => {
      receiveMessage = listener
      return { dispose: () => undefined }
    },
    postMessage: async (message) => {
      state.posted.push(JSON.parse(JSON.stringify(message)))
      return true
    }
  }
  const panel = {
    title: "",
    webview,
    onDidDispose: (listener) => {
      disposeListener = listener
      return { dispose: () => undefined }
    },
    reveal: () => undefined,
    dispose: () => disposeListener?.()
  }
  const vscode = {
    commands: { executeCommand: async () => undefined },
    Uri: {
      file: (fsPath) => uri(fsPath),
      joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts))
    },
    ViewColumn: { One: 1 },
    window: {
      createWebviewPanel: () => panel,
      showErrorMessage: async (message) => { state.errors.push(message) },
      showInformationMessage: async () => undefined,
      showTextDocument: async () => undefined,
      showWarningMessage: async () => undefined
    },
    workspace: {
      fs: {
        copy: async () => undefined,
        createDirectory: async () => undefined,
        delete: async () => undefined,
        readFile: async () => Buffer.from(""),
        stat: async () => { throw Object.assign(new Error("missing"), { code: "FileNotFound" }) },
        writeFile: async () => undefined
      },
      openTextDocument: async (target) => target
    }
  }
  const WorkflowBuilderPanel = loadPanelWithVscode(vscode)
  const show = (model, suffix = "a") => WorkflowBuilderPanel.createOrShow({
    extensionUri: uri(root),
    workflowRoot: root,
    sourceId: "workflow-register",
    mode: "create",
    initialModel: model,
    editingFilePath: path.join(root, `.bob/workflows/${suffix}/WORKFLOW.md`)
  })
  const builder = show(readinessModel())
  t.after(() => panel.dispose())
  return {
    builder,
    panel,
    show,
    state,
    send: async (message) => receiveMessage(message)
  }
}

test("Builder client exposes candidate selection, preview, apply, and invalidation contracts", () => {
  const model = readinessModel()
  const html = renderWorkflowBuilderHtml({
    cspSource: "vscode-resource:",
    initialModel: model,
    isEditMode: false,
    modeNote: "create mode",
    nonce: "nonce-readiness",
    templateOptions: []
  })
  const client = renderWorkflowBuilderClientScript()

  assert.match(html, /Skip Resume Readiness/)
  assert.match(client, /preview-skip-resume/)
  assert.match(client, /apply-skip-resume/)
  assert.match(client, /data-readiness-candidate/)
  assert.match(client, /skipResumeReadinessPreviewResult/)
  assert.match(client, /skipResumeReadinessApplied/)
  assert.match(client, /clearSkipResumeReadinessPreview/)
})

test("Builder panel previews and applies readiness without saving the file", async (t) => {
  const harness = createPanelHarness(t)
  const model = readinessModel()

  await harness.send({ type: "previewSkipResumeReadiness", model })
  const preview = harness.state.posted.find((message) => message.type === "skipResumeReadinessPreviewResult")
  assert.ok(preview)
  assert.equal(preview.ok, true, JSON.stringify(preview.diagnostics))
  assert.match(preview.previewToken, /^[0-9a-f-]+$/i)
  assert.equal(preview.plan.candidates.length, 2)
  assert.equal(preview.plan.errors.length, 0)

  await harness.send({
    type: "applySkipResumeReadiness",
    model,
    selectedCandidateIds: preview.plan.selectedCandidateIds,
    previewToken: preview.previewToken
  })
  const applied = harness.state.posted.find((message) => message.type === "skipResumeReadinessApplied")
  assert.ok(applied)
  assert.deepEqual(applied.model.skipResume, { fileBound: true })
  assert.deepEqual(applied.model.artifacts.map((artifact) => [artifact.id, artifact.producedBy]), [["context", "collect"], ["report", "review"]])
  assert.deepEqual(harness.state.errors, [])
})

test("Builder panel rejects stale and cross-session readiness previews", async (t) => {
  const harness = createPanelHarness(t)
  const model = readinessModel()

  await harness.send({ type: "previewSkipResumeReadiness", model })
  const firstPreview = harness.state.posted.find((message) => message.type === "skipResumeReadinessPreviewResult")
  const changed = structuredClone(model)
  changed.steps[0].title = "Changed after preview"
  await harness.send({
    type: "applySkipResumeReadiness",
    model: changed,
    selectedCandidateIds: firstPreview.plan.selectedCandidateIds,
    previewToken: firstPreview.previewToken
  })
  assert.ok(harness.state.errors.some((message) => /changed|preview|stale/i.test(message)))

  harness.state.errors.length = 0
  await harness.send({ type: "previewSkipResumeReadiness", model })
  const previews = harness.state.posted.filter((message) => message.type === "skipResumeReadinessPreviewResult")
  const secondPreview = previews.at(-1)
  harness.show(readinessModel("other-session"), "b")
  await harness.send({
    type: "applySkipResumeReadiness",
    model,
    selectedCandidateIds: secondPreview.plan.selectedCandidateIds,
    previewToken: secondPreview.previewToken
  })
  assert.ok(harness.state.errors.some((message) => /session|preview|stale/i.test(message)))
})
