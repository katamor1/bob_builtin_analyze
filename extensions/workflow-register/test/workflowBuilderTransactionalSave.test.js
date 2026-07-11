const assert = require("node:assert/strict")
const fs = require("node:fs")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const vm = require("node:vm")

const { createAuthoringModelFromTemplate } = require("../out/core/workflowAuthoringDefaults")
const { loadAuthoringModelFromMarkdown } = require("../out/core/workflowAuthoringLoader")
const { serializeAuthoringModelToMarkdown } = require("../out/core/workflowAuthoringSerializer")
const { validateWorkflowText } = require("../out/core/workflowValidator")
const { renderWorkflowBuilderClientScript } = require("../out/webview/workflowBuilderClientScript")

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

function existingWorkflow(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-builder-transaction-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const model = createAuthoringModelFromTemplate({
    name: "transactional-builder",
    title: "Transactional Builder",
    description: "Original workflow description.",
    template: "simple-agent"
  })
  const rendered = serializeAuthoringModelToMarkdown(model)
  const target = path.join(root, ...rendered.filePath.split("/"))
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, rendered.markdown)
  const loaded = loadAuthoringModelFromMarkdown({
    sourceId: "workflow-register",
    filePath: rendered.filePath,
    text: rendered.markdown
  })
  return { root, target, oldText: rendered.markdown, model: loaded.model }
}

function createPanelHarness(t) {
  const fixture = existingWorkflow(t)
  const state = {
    commands: [],
    errors: [],
    information: [],
    posted: [],
    shownDocuments: [],
    warningResponses: [],
    warnings: []
  }
  let receiveMessage
  let disposeListener
  let disposed = false
  const uri = (fsPath) => ({ fsPath: path.resolve(fsPath) })
  const webview = {
    cspSource: "vscode-resource:",
    html: "",
    onDidReceiveMessage: (listener) => {
      receiveMessage = listener
      return { dispose: () => undefined }
    },
    postMessage: async (message) => {
      state.posted.push(message)
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
    dispose: () => {
      if (disposed) return
      disposed = true
      disposeListener?.()
    }
  }
  const vscode = {
    commands: {
      executeCommand: async (...args) => {
        state.commands.push(args)
        return undefined
      }
    },
    Uri: {
      file: (fsPath) => uri(fsPath),
      joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts))
    },
    ViewColumn: { One: 1 },
    window: {
      createWebviewPanel: () => panel,
      showErrorMessage: async (message) => { state.errors.push(message) },
      showInformationMessage: async (message) => { state.information.push(message) },
      showTextDocument: async (document) => { state.shownDocuments.push(document) },
      showWarningMessage: async (message) => {
        state.warnings.push(message)
        return state.warningResponses.shift()
      }
    },
    workspace: {
      fs: {
        copy: async (source, target) => {
          await fs.promises.copyFile(source.fsPath, target.fsPath)
        },
        createDirectory: async (target) => {
          await fs.promises.mkdir(target.fsPath, { recursive: true })
        },
        readFile: async (target) => fs.promises.readFile(target.fsPath),
        stat: async (target) => fs.promises.stat(target.fsPath),
        writeFile: async (target, bytes) => {
          await fs.promises.writeFile(target.fsPath, bytes)
        }
      },
      openTextDocument: async (target) => target
    }
  }
  const WorkflowBuilderPanel = loadPanelWithVscode(vscode)
  const builder = WorkflowBuilderPanel.createOrShow({
    extensionUri: uri(fixture.root),
    workflowRoot: fixture.root,
    sourceId: "workflow-register",
    mode: "edit",
    editingFilePath: fixture.target,
    originalText: fixture.oldText,
    initialModel: fixture.model
  })
  t.after(() => panel.dispose())
  return {
    ...fixture,
    builder,
    panel,
    state,
    send: (message) => receiveMessage(message)
  }
}

function editedModel(model, description) {
  return {
    ...model,
    metadata: { ...model.metadata, description }
  }
}

function backupFiles(target) {
  return fs.readdirSync(path.dirname(target)).filter((name) => /^WORKFLOW\.backup-.*\.md$/.test(name))
}

function complexWorkflowModel() {
  return {
    metadata: {
      schemaVersion: "workflow-register/v1",
      name: "inactive-tabs",
      title: "Inactive Tabs",
      description: "Preserve every supported section without visiting its tab.",
      mode: "agent",
      workspaceRequired: true,
      hidden: false
    },
    inputs: [
      { id: "scope", type: "string", title: "Scope", required: true, prompt: true, default: null },
      { id: "limit", type: "number", title: "Limit", required: false, default: 0 },
      { id: "enabled", type: "boolean", title: "Enabled", required: false, default: false },
      { id: "style", type: "select", title: "Style", requiredWhen: "enabled == true", default: "concise", options: ["concise", "detailed"] }
    ],
    requires: { workspace: true, bob: { minVersion: "2.1.0" }, files: ["README.md"] },
    preflight: [{
      id: "check-readme",
      title: "Check README",
      required: true,
      checks: ["workflow.filesExist"],
      files: ["README.md"],
      failurePolicy: "stop"
    }],
    guardrails: { allowedCommandIds: ["sample.collect"] },
    branching: {
      enabled: true,
      loops: [{
        id: "retry-loop",
        title: "Retry loop",
        entryStep: "collect",
        maxIterations: 2,
        extensionSize: 1,
        checkpoint: { title: "Retry limit", message: "Review before extending." }
      }]
    },
    steps: [
      {
        id: "collect",
        title: "Collect",
        type: "command",
        action: { provider: "vscode.executeCommand", args: ["sample.collect"] },
        resultKey: "context"
      },
      {
        id: "review",
        title: "Review",
        type: "agent",
        includeState: ["context"],
        resultKey: "report",
        prompt: "Review the context.",
        transition: {
          decisions: [{
            id: "retry",
            when: { stateKey: "report", equals: "retry" },
            goto: "collect",
            loop: "retry-loop"
          }],
          default: "end"
        }
      }
    ],
    artifacts: [{ id: "report", producedBy: "review", path: ".bob/artifacts/report.md", schema: "report/v1" }],
    completion: { summary: "Done", includeArtifacts: true, validateResult: false },
    body: "# Inactive Tabs\n\nKeep the body.",
    unknownFrontMatter: {
      category: "review",
      futureConfig: { owner: "operator", flags: ["keep", "roundtrip"] }
    }
  }
}

function runBuilderClientWithoutVisitingTabs(initialModel) {
  const listeners = new Map()
  const messages = []
  const timers = new Map()
  let nextTimer = 1
  const elements = new Map()
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        checked: false,
        classList: { toggle: () => undefined },
        dataset: {},
        innerHTML: "",
        setAttribute: () => undefined,
        value: ""
      })
    }
    return elements.get(id)
  }
  const document = {
    addEventListener: (type, listener) => {
      const current = listeners.get(type) ?? []
      current.push(listener)
      listeners.set(type, current)
    },
    getElementById: element,
    querySelectorAll: () => []
  }
  const window = {
    addEventListener: (type, listener) => {
      const current = listeners.get(`window:${type}`) ?? []
      current.push(listener)
      listeners.set(`window:${type}`, current)
    }
  }
  const sandbox = {
    acquireVsCodeApi: () => ({ postMessage: (message) => messages.push(message) }),
    clearTimeout: (id) => timers.delete(id),
    confirm: () => true,
    console,
    document,
    editMode: true,
    model: JSON.parse(JSON.stringify(initialModel)),
    setTimeout: (callback) => {
      const id = nextTimer++
      timers.set(id, callback)
      return id
    },
    structuredClone,
    templates: [],
    window
  }

  vm.runInNewContext(renderWorkflowBuilderClientScript(), sandbox)
  for (const callback of [...timers.values()]) callback()
  for (const listener of listeners.get("click") ?? []) {
    listener({ target: { closest: () => ({ dataset: { action: "save" } }) } })
  }
  return messages.map((message) => JSON.parse(JSON.stringify(message)))
}

test("Builder cancel leaves the existing target, backups, documents, and reload untouched", async (t) => {
  const harness = createPanelHarness(t)
  harness.state.warningResponses.push(undefined)

  await harness.send({ type: "save", model: editedModel(harness.model, "Cancelled description.") })

  assert.equal(fs.readFileSync(harness.target, "utf8"), harness.oldText)
  assert.deepEqual(backupFiles(harness.target), [])
  assert.deepEqual(harness.state.commands, [])
  assert.deepEqual(harness.state.shownDocuments, [])
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), false)
})

test("Builder confirmation backs up the exact old bytes before overwriting and reloading", async (t) => {
  const harness = createPanelHarness(t)
  harness.state.warningResponses.push("Apply changes")

  await harness.send({ type: "save", model: editedModel(harness.model, "Confirmed description.") })

  const backups = backupFiles(harness.target)
  assert.equal(backups.length, 1)
  assert.equal(fs.readFileSync(path.join(path.dirname(harness.target), backups[0]), "utf8"), harness.oldText)
  assert.match(fs.readFileSync(harness.target, "utf8"), /description: Confirmed description\./)
  assert.deepEqual(harness.state.commands, [["workflowRegister.reload"]])
  assert.equal(harness.state.shownDocuments.length, 1)
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), true)
})

test("Builder rejects an external edit against originalText before backup, overwrite, or reload", async (t) => {
  const harness = createPanelHarness(t)
  const externalText = harness.oldText.replace("Original workflow description.", "External winner description.")
  fs.writeFileSync(harness.target, externalText)
  harness.state.warningResponses.push("Apply changes")

  await harness.send({ type: "save", model: editedModel(harness.model, "Stale builder description.") })

  assert.equal(fs.readFileSync(harness.target, "utf8"), externalText)
  assert.deepEqual(backupFiles(harness.target), [])
  assert.deepEqual(harness.state.commands, [])
  assert.deepEqual(harness.state.shownDocuments, [])
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), false)
  assert.ok(
    [...harness.state.errors, ...harness.state.warnings].some((message) => /refresh|reopen|再読込|更新/i.test(message)),
    `expected refresh/reopen diagnostic, got ${JSON.stringify({ errors: harness.state.errors, warnings: harness.state.warnings })}`
  )
})

test("Builder advances its originalText baseline only after each successful save", async (t) => {
  const harness = createPanelHarness(t)
  harness.state.warningResponses.push("Apply changes", "Apply changes")

  await harness.send({ type: "save", model: editedModel(harness.model, "First successful description.") })
  await harness.send({ type: "save", model: editedModel(harness.model, "Second successful description.") })

  assert.match(fs.readFileSync(harness.target, "utf8"), /description: Second successful description\./)
  assert.deepEqual(harness.state.commands, [["workflowRegister.reload"], ["workflowRegister.reload"]])
  assert.equal(harness.state.posted.filter((message) => message.type === "saved").length, 2)
})

test("Builder inactive tabs preserve all inputs and advanced sections through actual preview and save payloads", () => {
  const original = serializeAuthoringModelToMarkdown(complexWorkflowModel())
  const initialValidation = validateWorkflowText({ sourceId: "workflow-register", filePath: original.filePath, text: original.markdown })
  assert.equal(initialValidation.ok, true, initialValidation.diagnostics.map((item) => item.message).join("\n"))
  const loaded = loadAuthoringModelFromMarkdown({
    sourceId: "workflow-register",
    filePath: original.filePath,
    text: original.markdown
  })

  const messages = runBuilderClientWithoutVisitingTabs(loaded.model)
  const preview = messages.find((message) => message.type === "preview")
  const save = messages.find((message) => message.type === "save")
  assert.ok(preview)
  assert.ok(save)
  assert.deepEqual(save.model, preview.model)
  assert.deepEqual(save.model.inputs.map((input) => [input.type, input.default]), [
    ["string", null],
    ["number", 0],
    ["boolean", false],
    ["select", "concise"]
  ])
  assert.deepEqual(save.model.requires, loaded.model.requires)
  assert.deepEqual(save.model.preflight, loaded.model.preflight)
  assert.deepEqual(save.model.branching, loaded.model.branching)
  assert.deepEqual(save.model.artifacts, loaded.model.artifacts)
  assert.deepEqual(save.model.unknownFrontMatter, loaded.model.unknownFrontMatter)

  const saved = serializeAuthoringModelToMarkdown(save.model)
  const reopened = loadAuthoringModelFromMarkdown({
    sourceId: "workflow-register",
    filePath: saved.filePath,
    text: saved.markdown
  })
  assert.deepEqual(reopened.model.inputs.map((input) => [input.type, input.default]), [
    ["string", null],
    ["number", 0],
    ["boolean", false],
    ["select", "concise"]
  ])
  assert.deepEqual(reopened.model.requires, loaded.model.requires)
  assert.deepEqual(reopened.model.preflight, loaded.model.preflight)
  assert.deepEqual(reopened.model.branching, loaded.model.branching)
  assert.deepEqual(reopened.model.artifacts, loaded.model.artifacts)
  assert.deepEqual(reopened.model.unknownFrontMatter, loaded.model.unknownFrontMatter)
})

test("Builder roundtrip does not broaden v1 nested input schema", () => {
  const rendered = serializeAuthoringModelToMarkdown(complexWorkflowModel())
  const invalid = rendered.markdown.replace(
    "    type: string\n",
    "    type: string\n    futureNestedInputProperty: reject-me\n"
  )
  const validation = validateWorkflowText({ sourceId: "workflow-register", filePath: rendered.filePath, text: invalid })

  assert.equal(validation.ok, false)
  assert.ok(validation.diagnostics.some((item) => /additional properties|futureNestedInputProperty/i.test(item.message)))
})
