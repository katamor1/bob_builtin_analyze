const assert = require("node:assert/strict")
const { test } = require("node:test")
const vm = require("node:vm")

const { renderWorkflowBuilderActionEventsScript } = require("../out/webview/workflowBuilderActionEventsScript")
const { renderWorkflowBuilderClientStateScript } = require("../out/webview/workflowBuilderClientStateScript")
const { renderWorkflowBuilderFieldEventsScript } = require("../out/webview/workflowBuilderFieldEventsScript")
const { renderWorkflowBuilderSkipResumeReadinessScript } = require("../out/webview/workflowBuilderSkipResumeReadinessScript")
const { renderWorkflowBuilderStandardTemplateClientScript } = require("../out/webview/workflowBuilderStandardTemplateClientScript")
const { renderWorkflowBuilderStepDraftScript } = require("../out/webview/workflowBuilderStepDraftScript")

function ordinaryClientHarness() {
  const documentListeners = new Map()
  const messages = []
  const windowListeners = []
  const timers = []
  const context = {
    acquireVsCodeApi: () => ({ postMessage: (message) => messages.push(message) }),
    confirm: () => true,
    document: {
      addEventListener: (type, listener) => {
        const listeners = documentListeners.get(type) ?? []
        listeners.push(listener)
        documentListeners.set(type, listeners)
      },
      removeEventListener: (type, listener) => {
        documentListeners.set(type, (documentListeners.get(type) ?? []).filter((candidate) => candidate !== listener))
      },
      getElementById: () => ({ value: "" }),
      querySelectorAll: () => []
    },
    model: { metadata: {}, inputs: [], preflight: [], steps: [], artifacts: [] },
    render: () => undefined,
    renderPreview: () => undefined,
    renderStepDetail: () => undefined,
    renderStepsList: () => undefined,
    renderTabs: () => undefined,
    sessionToken: "current-render",
    window: { addEventListener: (type, listener) => { if (type === "message") windowListeners.push(listener) } },
    clearTimeout: () => undefined,
    setTimeout: (callback) => { timers.push(callback); return timers.length },
    console
  }
  vm.createContext(context)
  vm.runInContext(renderWorkflowBuilderClientStateScript(), context)
  vm.runInContext(renderWorkflowBuilderFieldEventsScript(), context)
  vm.runInContext(renderWorkflowBuilderSkipResumeReadinessScript(), context)
  vm.runInContext(renderWorkflowBuilderActionEventsScript(), context)
  return {
    deliver: (message) => windowListeners.forEach((listener) => listener({ data: message })),
    activeTab: () => vm.runInContext("activeTab", context),
    selectedStepIndex: () => vm.runInContext("selectedStepIndex", context),
    latestPreview: () => vm.runInContext("latestPreview", context),
    messages,
    requestPreview: () => vm.runInContext("requestPreview(true)", context),
    modelDescription: () => vm.runInContext("model.metadata.description", context),
    windowListenerCount: () => windowListeners.length
  }
}

function standardTemplateClientHarness() {
  const documentListeners = new Map()
  const messages = []
  const elements = new Map()
  const windowListeners = []
  const element = (id = "") => {
    if (!elements.has(id)) {
      elements.set(id, {
        children: [],
        classList: { toggle: () => undefined },
        firstChild: null,
        textContent: "",
        value: "",
        appendChild(child) { this.children.push(child); this.firstChild = this.children[0] },
        getAttribute: () => "",
        removeChild() { this.children.shift(); this.firstChild = this.children[0] ?? null },
        setAttribute: () => undefined
      })
    }
    return elements.get(id)
  }
  const context = {
    acquireVsCodeApi: () => ({ postMessage: (message) => messages.push(message) }),
    document: {
      addEventListener: (type, listener) => {
        const listeners = documentListeners.get(type) ?? []
        listeners.push(listener)
        documentListeners.set(type, listeners)
      },
      createElement: () => element(`created-${elements.size}`),
      getElementById: element,
      querySelectorAll: () => []
    },
    initialModel: { templatePath: "" },
    initialTemplates: [],
    sessionToken: "current-render",
    window: { addEventListener: (type, listener) => { if (type === "message") windowListeners.push(listener) } },
    console
  }
  vm.createContext(context)
  vm.runInContext(renderWorkflowBuilderStandardTemplateClientScript(), context)
  return {
    deliver: (message) => windowListeners.forEach((listener) => listener({ data: message })),
    dispatch: (type, event) => (documentListeners.get(type) ?? []).forEach((listener) => listener(event)),
    messages,
    text: (id) => element(id).textContent
  }
}

test("ordinary Builder client ignores older and token-mismatched host responses", () => {
  const harness = ordinaryClientHarness()

  harness.deliver({ type: "previewResult", sessionToken: "current-render", generation: 2, markdown: "preview B" })
  harness.deliver({ type: "previewResult", sessionToken: "current-render", generation: 1, markdown: "preview A" })
  harness.deliver({ type: "previewResult", sessionToken: "other-render", generation: 3, markdown: "wrong token" })

  assert.equal(harness.latestPreview(), "preview B")
})

test("standard-template client ignores older and token-mismatched host responses", () => {
  const harness = standardTemplateClientHarness()

  harness.deliver({ type: "previewResult", sessionToken: "current-render", generation: 2, markdown: "preview B" })
  harness.deliver({ type: "previewResult", sessionToken: "current-render", generation: 1, markdown: "preview A" })
  harness.deliver({ type: "previewResult", sessionToken: "other-render", generation: 3, markdown: "wrong token" })

  assert.equal(harness.text("previewOutput"), "preview B")
})

test("ordinary Builder sends its live draft before the preview debounce", () => {
  const harness = ordinaryClientHarness()

  harness.requestPreview()

  assert.equal(harness.messages[0].type, "draftChanged")
  assert.equal(harness.messages[0].sessionToken, "current-render")
})

test("standard-template client sends edited customization state immediately", () => {
  const harness = standardTemplateClientHarness()

  harness.dispatch("input", { target: { id: "workflowDescription" } })

  const message = harness.messages.at(-1)
  assert.equal(message.type, "templateDraftChanged")
  assert.equal(message.sessionToken, "current-render")
})

test("ordinary Builder listeners all accept one equal-generation model response", () => {
  const harness = ordinaryClientHarness()
  assert.ok(harness.windowListenerCount() >= 2)

  harness.deliver({
    type: "model",
    sessionToken: "current-render",
    generation: 4,
    model: { metadata: { description: "accepted by every listener" }, inputs: [], preflight: [], steps: [], artifacts: [] },
    editMode: true
  })

  assert.equal(harness.modelDescription(), "accepted by every listener")
})

test("ordinary Builder applies focus responses without requiring a page rerender", () => {
  const harness = ordinaryClientHarness()

  harness.deliver({
    type: "model",
    sessionToken: "current-render",
    generation: 4,
    model: { metadata: {}, inputs: [], preflight: [], steps: [{ id: "prepare", type: "agent" }, { id: "review", type: "agent" }], artifacts: [] },
    editMode: true
  })
  harness.deliver({ type: "focusStep", sessionToken: "current-render", generation: 5, focusStepId: "review" })

  assert.equal(harness.activeTab(), "step")
  assert.equal(harness.selectedStepIndex(), 1)
})

test("step draft field and result-sink mutations signal dirty state immediately", () => {
  const script = renderWorkflowBuilderStepDraftScript()

  assert.match(script, /mutateStepDraftFromEvent[\s\S]*vscode\.postMessage\(\{ type: 'draftChanged', source: 'stepDraft' \}\)/)
  assert.equal((script.match(/vscode\.postMessage\(\{ type: 'draftChanged', source: 'stepDraft' \}\)/g) || []).length, 3)
  assert.equal((script.match(/vscode\.postMessage\(\{ type: 'draftChanged', source: 'stepDraft', dirty: false \}\)/g) || []).length, 2)
})

test("standard-template readiness commit errors render an error state", () => {
  const harness = standardTemplateClientHarness()

  harness.deliver({
    type: "readinessResult",
    sessionToken: "current-render",
    generation: 3,
    status: "error",
    diagnostics: ["readiness disk failure"],
    readiness: { status: "pass", score: 100, checks: [], nextActions: [] }
  })

  assert.match(harness.text("readinessStatus"), /エラー/)
  assert.match(harness.text("readinessNextActions"), /readiness disk failure/)
})
