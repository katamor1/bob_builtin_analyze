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
const { renderWorkflowBuilderStepDraftScript } = require("../out/webview/workflowBuilderStepDraftScript")
const { createDefaultStudioModel } = require("../out/template/templateStudioModel")

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

function existingWorkflow(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-builder-transaction-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const model = createAuthoringModelFromTemplate({
    name: "transactional-builder",
    title: "Transactional Builder",
    description: options.description ?? "Original workflow description.",
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

function createPanelHarness(t, options = {}) {
  const fixture = options.fixture ?? existingWorkflow(t)
  options.setupRoot?.(fixture.root)
  const state = {
    beforeBackupWrite: async () => undefined,
    beforeCommand: async () => undefined,
    beforeOpenTextDocument: async () => undefined,
    beforePost: async () => undefined,
    beforeShowTextDocument: async () => undefined,
    beforeReadFile: async () => undefined,
    beforeTargetWrite: async () => undefined,
    commands: [],
    copies: [],
    errors: [],
    errorRejection: undefined,
    information: [],
    onWarningMessage: () => undefined,
    posted: [],
    shownDocuments: [],
    warningResponses: [],
    warnings: []
  }
  const originalLink = fs.promises.link
  const instrumentedLink = async (source, target) => {
    const relative = path.relative(fixture.root, String(target))
    if (path.basename(String(target)) === "WORKFLOW.md" && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      await state.beforeTargetWrite(String(target))
    }
    return originalLink(source, target)
  }
  fs.promises.link = instrumentedLink
  t.after(() => { if (fs.promises.link === instrumentedLink) fs.promises.link = originalLink })
  const originalWriteFile = fs.promises.writeFile
  const instrumentedWriteFile = async (target, ...args) => {
    if (/^WORKFLOW\.backup-.*\.md$/.test(path.basename(String(target)))) {
      await state.beforeBackupWrite(String(target))
    }
    return originalWriteFile(target, ...args)
  }
  fs.promises.writeFile = instrumentedWriteFile
  t.after(() => { if (fs.promises.writeFile === instrumentedWriteFile) fs.promises.writeFile = originalWriteFile })
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
      await state.beforePost(message)
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
        await state.beforeCommand(...args)
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
      showErrorMessage: async (message) => {
        state.errors.push(message)
        if (state.errorRejection) throw state.errorRejection
      },
      showInformationMessage: async (message) => { state.information.push(message) },
      showTextDocument: async (document) => { await state.beforeShowTextDocument(document); state.shownDocuments.push(document) },
      showWarningMessage: async (message) => {
        state.warnings.push(message)
        state.onWarningMessage(message)
        return state.warningResponses.shift()
      }
    },
    workspace: {
      fs: {
        copy: async (source, target, options) => {
          if (/^WORKFLOW\.backup-.*\.md$/.test(path.basename(target.fsPath))) {
            await state.beforeBackupWrite(target.fsPath)
          }
          state.copies.push({ source: source.fsPath, target: target.fsPath, options })
          await fs.promises.copyFile(
            source.fsPath,
            target.fsPath,
            options?.overwrite === false ? fs.constants.COPYFILE_EXCL : 0
          )
        },
        createDirectory: async (target) => {
          await fs.promises.mkdir(target.fsPath, { recursive: true })
        },
        delete: async (target) => {
          await fs.promises.rm(target.fsPath, { force: true })
        },
        readFile: async (target) => {
          await state.beforeReadFile(target.fsPath)
          return fs.promises.readFile(target.fsPath)
        },
        stat: async (target) => fs.promises.stat(target.fsPath),
        writeFile: async (target, bytes) => {
          if (/^WORKFLOW\.backup-.*\.md$/.test(path.basename(target.fsPath))) {
            await state.beforeBackupWrite(target.fsPath)
          }
          if (path.basename(target.fsPath) === "WORKFLOW.md") {
            await state.beforeTargetWrite(target.fsPath)
          }
          await fs.promises.writeFile(target.fsPath, bytes)
        }
      },
      openTextDocument: async (target) => {
        await state.beforeOpenTextDocument(target)
        if (target && typeof target === "object" && typeof target.content === "string") {
          return { ...target, uri: { fsPath: "", scheme: "untitled" } }
        }
        return target
      }
    }
  }
  const WorkflowBuilderPanel = loadPanelWithVscode(vscode)
  const panelOptions = {
    extensionUri: uri(fixture.root),
    workflowRoot: fixture.root,
    sourceId: "workflow-register",
    mode: options.mode ?? "edit",
    initialModel: fixture.model
  }
  if (panelOptions.mode === "edit") {
    panelOptions.editingFilePath = fixture.target
    panelOptions.originalText = fixture.oldText
  }
  const builder = WorkflowBuilderPanel.createOrShow(panelOptions)
  t.after(() => panel.dispose())
  const showFixture = (nextFixture) => WorkflowBuilderPanel.createOrShow({
    extensionUri: uri(nextFixture.root),
    workflowRoot: nextFixture.root,
    sourceId: "workflow-register",
    mode: "edit",
    editingFilePath: nextFixture.target,
    originalText: nextFixture.oldText,
    initialModel: nextFixture.model
  })
  const reopenSameFile = (overrides = {}) => WorkflowBuilderPanel.createOrShow({
    ...panelOptions,
    ...overrides
  })
  return {
    ...fixture,
    builder,
    panel,
    reopenSameFile,
    showFixture,
    state,
    token: () => currentSessionToken(webview.html),
    send: (message) => receiveMessage({ ...message, sessionToken: currentSessionToken(webview.html) }),
    sendRaw: (message) => receiveMessage(message)
  }
}

async function createStandardPanelHarness(t) {
  const harness = createPanelHarness(t, { mode: "edit", setupRoot: copyStandardTemplateLibrary })
  await harness.send({ type: "selectMode", mode: "standard-template" })
  const template = harness.builder.activeSession.templates[0]
  assert.ok(template, "standard template library loaded")
  const studioModel = createDefaultStudioModel(template)
  studioModel.workflowName = harness.model.metadata.name
  studioModel.title = harness.model.metadata.title
  studioModel.description = "Generated standard-template description."
  await harness.send({ type: "applyStandardTemplate", model: studioModel })
  return { ...harness, studioModel, generatedModel: harness.builder.activeSession.model }
}

function copyStandardTemplateLibrary(root) {
  const sourceRoot = path.resolve(__dirname, "..", "..", "..")
  for (const relativePath of [
    ".bob/template-library/standard/process-code-precheck/metadata.yaml",
    ".bob/template-library/standard/process-code-precheck/WORKFLOW.md"
  ]) {
    const target = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(sourceRoot, relativePath), target)
  }
}

function currentSessionToken(html) {
  const match = html.match(/const sessionToken = ("(?:[^"\\]|\\.)*");/)
  assert.ok(match, "Builder render carries a session token")
  return JSON.parse(match[1])
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

function deferred() {
  let resolve
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve))
}

async function waitFor(predicate, turns = 100) {
  for (let index = 0; index < turns; index += 1) {
    if (predicate()) return
    await nextTurn()
  }
  assert.fail("condition did not become true")
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

function runBuilderClientWithoutVisitingTabs(initialModel, options = {}) {
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
        insertAdjacentHTML: () => undefined,
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
    removeEventListener: (type, listener) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((candidate) => candidate !== listener))
    },
    getElementById: element,
    querySelector: () => undefined,
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
    sessionToken: "test-session",
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
  if (options.invalidAuthoring) {
    for (const listener of listeners.get("input") ?? []) {
      listener({ target: { dataset: { inputIndex: "0", inputField: "defaultJson" }, type: "text", value: "[" } })
    }
    for (const callback of [...timers.values()]) callback()
    for (const action of ["validate", "diff", "save"]) {
      for (const listener of listeners.get("click") ?? []) {
        listener({ target: { closest: (selector) => selector.includes("data-builder-mode") ? null : { dataset: { action } } } })
      }
    }
    const invalidMessages = messages.map((message) => JSON.parse(JSON.stringify(message)))
    const invalidActiveTab = vm.runInNewContext("activeTab", sandbox)
    if (options.repairInvalidAuthoring) {
      messages.length = 0
      timers.clear()
      for (const listener of listeners.get("input") ?? []) {
        listener({ target: { dataset: { inputIndex: "0", inputField: "defaultJson" }, type: "text", value: "{}" } })
      }
      for (const callback of [...timers.values()]) callback()
      for (const action of ["validate", "diff", "save"]) {
        for (const listener of listeners.get("click") ?? []) {
          listener({ target: { closest: (selector) => selector.includes("data-builder-mode") ? null : { dataset: { action } } } })
        }
      }
      return {
        invalidActiveTab,
        invalidMessages,
        repairedMessages: messages.map((message) => JSON.parse(JSON.stringify(message)))
      }
    }
    return invalidMessages
  }
  if (options.invalidStepDraft) {
    vm.runInNewContext(renderWorkflowBuilderStepDraftScript(), sandbox)
    for (const listener of listeners.get("input") ?? []) {
      listener({ target: { dataset: { resultSinkIndex: "0", resultSinkField: "argsJson" }, type: "text", value: "[" } })
    }
    for (const listener of listeners.get("click") ?? []) {
      listener({ preventDefault: () => undefined, stopImmediatePropagation: () => undefined, target: { closest: (selector) => selector.includes("data-builder-mode") ? null : { dataset: { action: "validate-step-draft" } } } })
    }
    return messages.map((message) => JSON.parse(JSON.stringify(message)))
  }
  for (const callback of [...timers.values()]) callback()
  for (const listener of listeners.get("click") ?? []) {
    listener({ target: { closest: () => ({ dataset: { action: "save" } }) } })
  }
  return messages.map((message) => JSON.parse(JSON.stringify(message)))
}

test("direct slow standard-template open renders only a loading shell before the studio", async (t) => {
  const studioModule = require("../out/template/templateStudioModel")
  const originalListTemplates = studioModule.listTemplateLibrary
  const releaseLibrary = deferred()
  const libraryLoaded = deferred()
  studioModule.listTemplateLibrary = async (...args) => {
    await releaseLibrary.promise
    const library = await originalListTemplates(...args)
    libraryLoaded.resolve()
    return library
  }
  t.after(() => { studioModule.listTemplateLibrary = originalListTemplates })

  const harness = createPanelHarness(t, { mode: "standard-template", setupRoot: copyStandardTemplateLibrary })

  assert.match(harness.panel.webview.html, /標準テンプレートを読み込んでいます/)
  assert.doesNotMatch(harness.panel.webview.html, /id="stepsList"|type: 'preview'/)
  assert.doesNotMatch(harness.panel.webview.html, /<script|sessionToken|data-builder-mode/)

  releaseLibrary.resolve()
  await libraryLoaded.promise
  await nextTurn()
  assert.match(harness.panel.webview.html, /id="projectId"/)
  assert.doesNotMatch(harness.panel.webview.html, /id="stepsList"/)
})

test("readiness commit errors are delivered to the current standard-template page", async (t) => {
  const harness = createPanelHarness(t, { mode: "edit", setupRoot: copyStandardTemplateLibrary })
  await harness.send({ type: "selectMode", mode: "standard-template" })
  const studioModule = require("../out/template/templateStudioModel")
  const originalCalculate = studioModule.calculateReadinessFromStudioModel
  const originalCommit = studioModule.commitReadinessReportsFromStudioModel
  studioModule.calculateReadinessFromStudioModel = async () => ({
    status: "ok",
    diagnostics: [],
    readiness: { status: "pass", score: 100, checks: [], nextActions: [] },
    readinessJsonPath: ".bob/template-readiness/test/readiness.json",
    readinessMarkdownPath: ".bob/template-readiness/test/readiness.md"
  })
  studioModule.commitReadinessReportsFromStudioModel = async () => ({ status: "error", diagnostics: ["readiness disk failure"] })
  t.after(() => {
    studioModule.calculateReadinessFromStudioModel = originalCalculate
    studioModule.commitReadinessReportsFromStudioModel = originalCommit
  })

  await harness.send({ type: "checkReadiness", model: harness.builder.activeSession.templateModel })

  const result = harness.state.posted.find((message) => message.type === "readinessResult")
  assert.ok(result)
  assert.equal(result.status, "error")
  assert.deepEqual(result.diagnostics, ["readiness disk failure"])
})

test("direct standard-template initialization rejection is reported once without an unhandled rejection", async (t) => {
  const studioModule = require("../out/template/templateStudioModel")
  const originalListTemplates = studioModule.listTemplateLibrary
  studioModule.listTemplateLibrary = async () => { throw new Error("template initialization failure") }
  t.after(() => { studioModule.listTemplateLibrary = originalListTemplates })
  const unhandled = []
  const onUnhandled = (error) => { unhandled.push(error) }
  process.on("unhandledRejection", onUnhandled)
  t.after(() => process.off("unhandledRejection", onUnhandled))

  const harness = createPanelHarness(t, { mode: "standard-template" })
  await nextTurn()
  await nextTurn()

  assert.equal(harness.state.errors.filter((message) => /template initialization failure/.test(message)).length, 1)
  assert.deepEqual(unhandled, [])
})

test("Builder error reporting is a non-throwing boundary when the notification provider rejects", async (t) => {
  const harness = createPanelHarness(t)
  harness.state.errorRejection = new Error("notification provider unavailable")
  const logged = []
  const originalConsoleError = console.error
  console.error = (...args) => { logged.push(args) }

  try {
    await assert.doesNotReject(harness.builder.reportMessageError(new Error("background operation failed")))
  } finally {
    console.error = originalConsoleError
  }

  assert.equal(harness.state.errors.filter((message) => /background operation failed/.test(message)).length, 1)
  assert.equal(logged.length, 1)
  assert.equal(logged[0][0], "Workflow Builder error notification failed")
  assert.match(String(logged[0][1]), /notification provider unavailable/)
})

test("preview cleanup rejection is reported once without an unhandled rejection", async (t) => {
  const harness = createPanelHarness(t)
  const unhandled = []
  const onUnhandled = (error) => { unhandled.push(error) }
  process.on("unhandledRejection", onUnhandled)
  t.after(() => process.off("unhandledRejection", onUnhandled))
  harness.builder.cleanupSessionPreviews = async () => { throw new Error("preview cleanup failure") }

  harness.panel.dispose()
  await nextTurn()
  await nextTurn()

  assert.equal(harness.state.errors.filter((message) => /preview cleanup failure/.test(message)).length, 1)
  assert.deepEqual(unhandled, [])
})

test("external same-file reopen refreshes a clean Builder model and focus", (t) => {
  const harness = createPanelHarness(t)
  const focusStepId = harness.model.steps[0].id
  const refreshedModel = editedModel(harness.model, "External clean refresh.")
  const refreshedText = serializeAuthoringModelToMarkdown(refreshedModel).markdown

  harness.reopenSameFile({ initialModel: refreshedModel, originalText: refreshedText, focusStepId })

  assert.equal(harness.builder.activeSession.model.metadata.description, "External clean refresh.")
  assert.match(harness.panel.webview.html, new RegExp(`let focusStepId = ${JSON.stringify(focusStepId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
})

test("external same-file reopen preserves a dirty draft, honors focus, and reports the conflict", async (t) => {
  const harness = createPanelHarness(t)
  const originalHtml = harness.panel.webview.html
  const focusStepId = harness.model.steps[0].id
  const dirtyModel = editedModel(harness.model, "Unsaved local draft.")
  const externalModel = editedModel(harness.model, "Fresh external state.")

  await harness.send({ type: "preview", model: dirtyModel })
  harness.reopenSameFile({
    initialModel: externalModel,
    originalText: serializeAuthoringModelToMarkdown(externalModel).markdown,
    focusStepId
  })
  await nextTurn()

  assert.equal(harness.builder.activeSession.model.metadata.description, "Unsaved local draft.")
  assert.equal(harness.panel.webview.html, originalHtml)
  assert.ok(harness.state.posted.some((message) => message.type === "focusStep" && message.focusStepId === focusStepId))
  assert.equal(harness.state.warnings.filter((message) => /未保存.*外部|外部.*未保存/.test(message)).length, 1)
})

test("same-file reopen preserves the live page after a pre-debounce dirty signal with no valid host model", async (t) => {
  const harness = createPanelHarness(t)
  const originalHtml = harness.panel.webview.html

  await harness.send({ type: "draftChanged" })
  harness.reopenSameFile({
    initialModel: editedModel(harness.model, "External candidate must not replace live DOM."),
    originalText: harness.oldText,
    focusStepId: harness.model.steps[0].id
  })
  await nextTurn()

  assert.equal(harness.panel.webview.html, originalHtml)
  assert.equal(harness.builder.activeSession.model.metadata.description, harness.model.metadata.description)
  assert.equal(harness.state.warnings.filter((message) => /未保存.*外部|外部.*未保存/.test(message)).length, 1)
})

test("discarded client-only draft does not permanently latch same-file reopen dirty", async (t) => {
  const harness = createPanelHarness(t)
  await harness.send({ type: "draftChanged" })
  await harness.send({ type: "draftChanged", dirty: false })
  const refreshed = editedModel(harness.model, "Discarded draft accepts refreshed host state.")

  harness.reopenSameFile({ initialModel: refreshed, originalText: serializeAuthoringModelToMarkdown(refreshed).markdown })

  assert.equal(harness.builder.activeSession.model.metadata.description, refreshed.metadata.description)
  assert.equal(harness.state.warnings.length, 0)
})

test("discarding a step draft does not clear a separate invalid authoring draft", async (t) => {
  const harness = createPanelHarness(t)
  const originalHtml = harness.panel.webview.html
  await harness.send({ type: "draftChanged", source: "authoring" })
  await harness.send({ type: "draftChanged", source: "stepDraft" })
  await harness.send({ type: "draftChanged", source: "stepDraft", dirty: false })

  harness.reopenSameFile({ initialModel: editedModel(harness.model, "External state must not replace invalid DOM input."), originalText: harness.oldText })
  await nextTurn()

  assert.equal(harness.panel.webview.html, originalHtml)
  assert.equal(harness.state.warnings.length, 1)
})

test("malformed draft source and dirty payloads are rejected before dirty state changes", async (t) => {
  const harness = createPanelHarness(t)

  await harness.send({ type: "draftChanged", source: "other" })
  await harness.send({ type: "draftChanged", dirty: "false" })

  assert.equal(harness.builder.activeSession.clientDirtySources.size, 0)
  assert.equal(harness.state.errors.length, 2)
})

test("malformed standard-template draft is rejected before session state changes", async (t) => {
  const harness = createPanelHarness(t, { mode: "edit", setupRoot: copyStandardTemplateLibrary })
  await harness.send({ type: "selectMode", mode: "standard-template" })
  const session = harness.builder.activeSession
  const generation = session.generation
  const templateModel = session.templateModel
  const dirtySources = [...session.clientDirtySources]

  await harness.send({ type: "templateDraftChanged", model: { templatePath: "partial" } })

  assert.equal(session.generation, generation)
  assert.equal(session.templateModel, templateModel)
  assert.deepEqual([...session.clientDirtySources], dirtySources)
})

for (const [action, ancillary] of [
  ["previewSkipResumeReadiness", { selectedStepIds: [42], requestId: "preview-request" }],
  ["applySkipResumeReadiness", { selectedStepIds: "not-an-array", requestId: "apply-request" }],
  ["validateStepDraft", { draftStep: { id: 42, type: "agent" }, stepIndex: -1 }]
]) {
  test(`${action} rejects malformed ancillary payload before request state mutation`, async (t) => {
    const harness = createPanelHarness(t)
    const session = harness.builder.activeSession
    session.clientDirtySources.add("stepDraft")
    const generation = session.generation
    const renderTokens = [...session.requestRenderTokens]
    const model = session.model
    const dirtySources = [...session.clientDirtySources]

    await harness.send({ type: action, model: harness.model, ...ancillary })

    assert.equal(session.generation, generation)
    assert.deepEqual([...session.requestRenderTokens], renderTokens)
    assert.equal(session.model, model)
    assert.deepEqual([...session.clientDirtySources], dirtySources)
  })
}

for (const [label, draftCandidate, stepIndex] of [
  ["deep-incomplete result step", { id: "result-step", title: "Result", type: "result" }, 0],
  ["deep-incomplete command step", { id: "command-step", title: "Command", type: "command" }, 0],
  ["out-of-bounds step index", undefined, Number.MAX_SAFE_INTEGER]
]) {
  test(`validateStepDraft rejects ${label} before every request-state mutation`, async (t) => {
    const harness = createPanelHarness(t)
    const session = harness.builder.activeSession
    session.clientDirtySources.add("stepDraft")
    const draftStep = draftCandidate ?? harness.model.steps[0]
    const generation = session.generation
    const renderTokens = [...session.requestRenderTokens]
    const model = session.model
    const dirtySources = [...session.clientDirtySources]
    const posted = [...harness.state.posted]

    await harness.send({ type: "validateStepDraft", model: harness.model, draftStep, stepIndex })

    assert.equal(session.generation, generation)
    assert.deepEqual([...session.requestRenderTokens], renderTokens)
    assert.equal(session.model, model)
    assert.deepEqual([...session.clientDirtySources], dirtySources)
    assert.deepEqual(harness.state.posted, posted)
  })
}

test("validateStepDraft keeps structured domain errors as a host validation response", async (t) => {
  const harness = createPanelHarness(t)
  const generation = harness.builder.activeSession.generation

  await harness.send({
    type: "validateStepDraft",
    model: harness.model,
    draftStep: { id: "result-step", title: "Result", type: "result", result: { source: "state", sinks: [] } },
    stepIndex: 0
  })

  assert.equal(harness.builder.activeSession.generation, generation + 1)
  const response = harness.state.posted.find((message) => message.type === "stepDraftValidationResult")
  assert.ok(response)
  assert.equal(response.stepValidation.status, "error")
  assert.equal(response.stepValidation.diagnostics.some((item) => item.code === "result.stateKey.required"), true)
})

test("same-file reopen preserves a customized standard-template draft before apply", async (t) => {
  const harness = createPanelHarness(t, { mode: "edit", setupRoot: copyStandardTemplateLibrary })
  await harness.send({ type: "selectMode", mode: "standard-template" })
  await waitFor(() => harness.builder.activeSession.templateModel !== undefined)
  const customized = {
    ...harness.builder.activeSession.templateModel,
    description: "Unsaved standard-template customization."
  }
  await harness.send({ type: "previewWorkflow", model: customized })
  const customizedHtml = harness.panel.webview.html

  harness.reopenSameFile({ mode: "standard-template", editingFilePath: undefined, initialModel: harness.model, originalText: harness.oldText })
  await nextTurn()

  assert.equal(harness.builder.activeSession.templateModel.description, "Unsaved standard-template customization.")
  assert.equal(harness.panel.webview.html, customizedHtml)
  assert.equal(harness.state.warnings.filter((message) => /未保存.*外部|外部.*未保存/.test(message)).length, 1)
})

test("standard-template reopen preserves the live page after an input-only dirty signal", async (t) => {
  const harness = createPanelHarness(t, { mode: "edit", setupRoot: copyStandardTemplateLibrary })
  await harness.send({ type: "selectMode", mode: "standard-template" })
  await waitFor(() => harness.builder.activeSession.templateModel !== undefined)
  const originalHtml = harness.panel.webview.html

  await harness.send({ type: "templateDraftChanged", model: { ...harness.builder.activeSession.templateModel, description: "Unsaved input-only customization." } })
  harness.reopenSameFile({ mode: "standard-template", editingFilePath: undefined, initialModel: harness.model, originalText: harness.oldText })
  await nextTurn()

  assert.equal(harness.panel.webview.html, originalHtml)
  assert.equal(harness.state.warnings.filter((message) => /未保存.*外部|外部.*未保存/.test(message)).length, 1)
})

test("standard-template customization restored to baseline does not latch dirty", async (t) => {
  const harness = createPanelHarness(t, { mode: "edit", setupRoot: copyStandardTemplateLibrary })
  await harness.send({ type: "selectMode", mode: "standard-template" })
  const baseline = harness.builder.activeSession.templateModel
  await harness.send({ type: "templateDraftChanged", model: { ...baseline, description: "temporary" } })
  await harness.send({ type: "templateDraftChanged", model: baseline })

  harness.reopenSameFile({ mode: "standard-template", editingFilePath: undefined, initialModel: harness.model, originalText: harness.oldText })

  assert.equal(harness.state.warnings.length, 0)
})

test("standard-template no-change save advances the clean baseline for same-file reopen", async (t) => {
  const harness = await createStandardPanelHarness(t)
  const canonical = serializeAuthoringModelToMarkdown(harness.generatedModel).markdown
  fs.writeFileSync(harness.target, canonical)
  await harness.send({ type: "save", model: harness.generatedModel })
  const refreshed = editedModel(harness.generatedModel, "Fresh reopen after no-change save.")

  harness.builder.constructor.createOrShow({
    ...harness.builder.activeSession.options,
    initialModel: refreshed,
    originalText: serializeAuthoringModelToMarkdown(refreshed).markdown
  })

  assert.equal(harness.builder.activeSession.model.metadata.description, "Fresh reopen after no-change save.")
  assert.equal(harness.state.warnings.filter((message) => /未保存.*外部|外部.*未保存/.test(message)).length, 0)
})

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

test("cancel and validation-only actions preserve authoring dirty-source evidence", async (t) => {
  const harness = createPanelHarness(t)
  harness.state.warningResponses.push(undefined)

  await harness.send({ type: "draftChanged", source: "authoring" })
  await harness.send({ type: "save", model: editedModel(harness.model, "Cancelled dirty draft.") })
  assert.equal(harness.builder.activeSession.clientDirtySources.has("authoring"), true)

  await harness.send({
    type: "previewSkipResumeReadiness",
    model: harness.builder.activeSession.model,
    requestId: "dirty-source-preview"
  })
  assert.equal(harness.builder.activeSession.clientDirtySources.has("authoring"), true)

  await harness.send({
    type: "validateStepDraft",
    model: harness.builder.activeSession.model,
    draftStep: harness.builder.activeSession.model.steps[0],
    stepIndex: 0
  })
  assert.equal(harness.builder.activeSession.clientDirtySources.has("authoring"), true)
})

test("standard-template application only updates Builder memory and cancelled save never writes", async (t) => {
  const harness = await createStandardPanelHarness(t)
  assert.equal(fs.readFileSync(harness.target, "utf8"), harness.oldText)
  assert.match(harness.generatedModel.metadata.description, /Generated standard-template/)
  harness.state.warningResponses.push(undefined)

  await harness.send({ type: "save", model: harness.generatedModel })

  assert.equal(fs.readFileSync(harness.target, "utf8"), harness.oldText)
  assert.deepEqual(backupFiles(harness.target), [])
  assert.equal(harness.state.commands.some(([command]) => command === "workflowRegister.reload"), false)
  assert.equal(harness.builder.activeSession.model.metadata.description, harness.generatedModel.metadata.description)
})

test("standard-template application enters the editable Builder page and its client posts a tokenized save", async (t) => {
  const harness = await createStandardPanelHarness(t)

  assert.match(harness.panel.webview.html, /id="stepsList"/)
  assert.doesNotMatch(harness.panel.webview.html, /id="projectId"/)
  const messages = runBuilderClientWithoutVisitingTabs(harness.generatedModel)
  const save = messages.find((message) => message.type === "save")
  assert.ok(save)
  assert.equal(save.sessionToken, "test-session")
  assert.equal(save.model.metadata.description, "Generated standard-template description.")
})

test("rendered client blocks stale host operations until client-only JSON is repaired", async (t) => {
  const harness = createPanelHarness(t)
  const model = createAuthoringModelFromTemplate({
    name: "invalid-json-client",
    title: "Invalid JSON Client",
    description: "Keep invalid DOM text out of stale host operations.",
    template: "input-driven-agent"
  })
  const result = runBuilderClientWithoutVisitingTabs(model, { invalidAuthoring: true, repairInvalidAuthoring: true })

  assert.deepEqual(result.invalidMessages.map((message) => message.type), ["draftChanged"])
  assert.equal(result.invalidActiveTab, "preview")
  await harness.send(result.invalidMessages[0])
  const generationAfterDirtySignal = harness.builder.activeSession.generation
  assert.equal(harness.builder.activeSession.model, harness.model)
  assert.equal(fs.readFileSync(harness.target, "utf8"), harness.oldText)
  assert.deepEqual(harness.state.commands, [])
  assert.equal(harness.builder.activeSession.generation, generationAfterDirtySignal)

  assert.deepEqual(result.repairedMessages.map((message) => message.type), ["draftChanged", "preview", "preview", "diff", "save"])
})

test("rendered invalid step JSON remains dirty after host step validation", async (t) => {
  const base = existingWorkflow(t)
  const model = createAuthoringModelFromTemplate({
    name: "transactional-builder",
    title: "Transactional Builder",
    description: "Original workflow description.",
    template: "artifact-output"
  })
  const resultStep = model.steps.find((step) => step.type === "result")
  assert.ok(resultStep)
  resultStep.result.sinks = [{ type: "command", command: "sample.consumeResult", args: [] }]
  const rendered = serializeAuthoringModelToMarkdown(model)
  fs.writeFileSync(base.target, rendered.markdown)
  const loaded = loadAuthoringModelFromMarkdown({ sourceId: "workflow-register", filePath: rendered.filePath, text: rendered.markdown })
  const harness = createPanelHarness(t, { fixture: { ...base, oldText: rendered.markdown, model: loaded.model } })
  const originalHtml = harness.panel.webview.html
  const messages = runBuilderClientWithoutVisitingTabs(loaded.model, { invalidStepDraft: true })
    .filter((message) => message.type === "draftChanged" || message.type === "validateStepDraft")

  assert.deepEqual(messages.map((message) => message.type), ["draftChanged", "validateStepDraft"])
  for (const message of messages) await harness.send(message)
  assert.equal(harness.builder.activeSession.clientDirtySources.has("stepDraft"), true)

  harness.reopenSameFile({ initialModel: editedModel(loaded.model, "External replacement must not win."), originalText: rendered.markdown })
  await nextTurn()
  assert.equal(harness.panel.webview.html, originalHtml)
})

test("step validation never acknowledges a separate authoring draft source", async (t) => {
  const harness = createPanelHarness(t)
  await harness.send({ type: "draftChanged", source: "authoring" })

  await harness.send({
    type: "validateStepDraft",
    model: harness.model,
    draftStep: harness.model.steps[0],
    stepIndex: 0
  })

  assert.equal(harness.builder.activeSession.clientDirtySources.has("authoring"), true)
})

test("a cancelled older save cannot replace the latest preview model", async (t) => {
  const harness = createPanelHarness(t)
  const promptShown = deferred()
  const decision = deferred()
  harness.state.onWarningMessage = () => promptShown.resolve()
  harness.state.warningResponses.push(decision.promise)
  const older = editedModel(harness.model, "Older cancelled save.")
  const latest = editedModel(harness.model, "Latest preview wins.")

  const save = harness.send({ type: "save", model: older })
  await promptShown.promise
  await harness.send({ type: "preview", model: latest })
  decision.resolve(undefined)
  await save

  assert.equal(harness.builder.activeSession.model.metadata.description, "Latest preview wins.")
})

test("a save superseded during overwrite confirmation performs zero persistence", async (t) => {
  const harness = createPanelHarness(t)
  const promptShown = deferred()
  const decision = deferred()
  harness.state.onWarningMessage = () => promptShown.resolve()
  harness.state.warningResponses.push(decision.promise)
  let targetWrites = 0
  harness.state.beforeTargetWrite = async () => { targetWrites += 1 }

  const save = harness.send({ type: "save", model: editedModel(harness.model, "Superseded save.") })
  await promptShown.promise
  await harness.send({ type: "preview", model: editedModel(harness.model, "Latest preview wins.") })
  decision.resolve("変更を反映")
  await save

  assert.deepEqual(backupFiles(harness.target), [])
  assert.equal(harness.state.copies.length, 0)
  assert.equal(targetWrites, 0)
  assert.equal(fs.readFileSync(harness.target, "utf8"), harness.oldText)
})

test("an older no-change save cannot replace the latest preview model", async (t) => {
  const harness = createPanelHarness(t)
  const readStarted = deferred()
  const releaseRead = deferred()
  let block = true
  harness.state.beforeReadFile = async (target) => {
    if (!block || path.resolve(target) !== path.resolve(harness.target)) return
    block = false
    readStarted.resolve()
    await releaseRead.promise
  }
  const latest = editedModel(harness.model, "Latest during no-change read.")

  const save = harness.send({ type: "save", model: harness.model })
  await readStarted.promise
  await harness.send({ type: "preview", model: latest })
  releaseRead.resolve()
  await save

  assert.equal(harness.builder.activeSession.model.metadata.description, "Latest during no-change read.")
})

test("a committed older save writes its payload but cannot replace the latest preview model", async (t) => {
  const harness = createPanelHarness(t)
  const writeStarted = deferred()
  const releaseWrite = deferred()
  harness.state.beforeTargetWrite = async () => { writeStarted.resolve(); await releaseWrite.promise }
  harness.state.warningResponses.push("変更を反映")
  const older = editedModel(harness.model, "Older committed payload.")
  const latest = editedModel(harness.model, "Latest preview remains hosted.")

  const save = harness.send({ type: "save", model: older })
  await writeStarted.promise
  await harness.send({ type: "preview", model: latest })
  releaseWrite.resolve()
  await save

  assert.match(fs.readFileSync(harness.target, "utf8"), /Older committed payload/)
  assert.equal(backupFiles(harness.target).length, 1)
  assert.equal(harness.builder.activeSession.model.metadata.description, "Latest preview remains hosted.")
  assert.deepEqual(harness.state.shownDocuments, [])
  assert.equal(harness.state.information.length, 0)
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), false)
})

for (const phase of ["reload", "open", "show", "post"]) {
  test(`a generation change during committed-save ${phase} suppresses only effects that have not started`, async (t) => {
    const harness = createPanelHarness(t)
    const entered = deferred()
    const release = deferred()
    const committed = editedModel(harness.model, `Committed before ${phase} generation change.`)
    const latest = editedModel(harness.model, `Latest during ${phase}.`)
    harness.state.warningResponses.push("変更を反映")
    if (phase === "reload") {
      harness.state.beforeCommand = async (command) => {
        if (command !== "workflowRegister.reload") return
        entered.resolve()
        await release.promise
      }
    } else if (phase === "open") {
      harness.state.beforeOpenTextDocument = async () => { entered.resolve(); await release.promise }
    } else if (phase === "show") {
      harness.state.beforeShowTextDocument = async () => { entered.resolve(); await release.promise }
    } else {
      harness.state.beforePost = async (message) => {
        if (message.type !== "saved") return
        entered.resolve()
        await release.promise
      }
    }

    const save = harness.send({ type: "save", model: committed })
    await entered.promise
    await harness.send({ type: "preview", model: latest })
    release.resolve()
    await save

    assert.match(fs.readFileSync(harness.target, "utf8"), new RegExp(`description: Committed before ${phase} generation change\\.`))
    assert.equal(backupFiles(harness.target).length, 1)
    assert.deepEqual(harness.state.commands, [["workflowRegister.reload"]])
    assert.equal(harness.builder.activeSession.model.metadata.description, `Latest during ${phase}.`)
    assert.equal(harness.state.shownDocuments.length, phase === "show" || phase === "post" ? 1 : 0)
    const saved = harness.state.posted.filter((message) => message.type === "saved")
    assert.equal(saved.length, phase === "post" ? 1 : 0)
    if (phase === "post") assert.ok(saved[0].generation < harness.builder.activeSession.generation)
    assert.equal(harness.state.information.length, 0)
    if (phase === "reload") assert.equal(harness.builder.options.originalText, harness.oldText)
    else assert.match(harness.builder.options.originalText, new RegExp(`description: Committed before ${phase} generation change\\.`))
  })
}

test("Builder preserves an existing target replaced at the final commit boundary and removes its just-created backup", async (t) => {
  const harness = createPanelHarness(t)
  const externalText = harness.oldText.replace("Original workflow description.", "External final-boundary winner.")
  harness.state.beforeTargetWrite = async () => { fs.writeFileSync(harness.target, externalText) }
  harness.state.warningResponses.push("変更を反映")

  await harness.send({ type: "save", model: editedModel(harness.model, "Must not overwrite final winner.") })

  assert.equal(fs.readFileSync(harness.target, "utf8"), externalText)
  assert.deepEqual(backupFiles(harness.target), [])
  assert.equal(harness.state.commands.some(([command]) => command === "workflowRegister.reload"), false)
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), false)
})

test("Builder preserves a missing target created at the final commit boundary", async (t) => {
  const harness = createPanelHarness(t)
  fs.unlinkSync(harness.target)
  const externalText = "external creator at final boundary\n"
  harness.state.beforeTargetWrite = async () => { fs.writeFileSync(harness.target, externalText) }
  harness.state.warningResponses.push("作成")

  await harness.send({ type: "save", model: editedModel(harness.model, "Must not overwrite late creator.") })

  assert.equal(fs.readFileSync(harness.target, "utf8"), externalText)
  assert.equal(harness.state.commands.some(([command]) => command === "workflowRegister.reload"), false)
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), false)
})

test("Builder aborts an existing-target save after a parent swap and cleans only its owned backup", async (t) => {
  const harness = createPanelHarness(t)
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-builder-save-parent-swap-"))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  const parent = path.dirname(harness.target)
  const parked = `${parent}-parked`
  let foreignBackup
  harness.state.beforeTargetWrite = async () => {
    fs.renameSync(parent, parked)
    fs.symlinkSync(outside, parent, process.platform === "win32" ? "junction" : "dir")
    fs.writeFileSync(path.join(outside, "WORKFLOW.md"), "outside replacement\n")
    const ownedName = backupFiles(path.join(parked, "WORKFLOW.md"))[0]
    foreignBackup = path.join(outside, ownedName)
    fs.writeFileSync(foreignBackup, "foreign backup\n")
  }
  harness.state.warningResponses.push("変更を反映")

  await harness.send({ type: "save", model: editedModel(harness.model, "Must not cross parent swap.") })

  assert.equal(fs.readFileSync(path.join(outside, "WORKFLOW.md"), "utf8"), "outside replacement\n")
  assert.equal(fs.readFileSync(foreignBackup, "utf8"), "foreign backup\n")
  assert.deepEqual(backupFiles(path.join(parked, "WORKFLOW.md")), [])
  assert.equal(harness.state.commands.some(([command]) => command === "workflowRegister.reload"), false)
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), false)
})

test("Builder preserves a symlink replacement at the final commit boundary", async (t) => {
  const harness = createPanelHarness(t)
  const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-builder-save-symlink-")), "winner.md")
  fs.writeFileSync(outside, "symlink winner\n")
  t.after(() => fs.rmSync(path.dirname(outside), { recursive: true, force: true }))
  harness.state.beforeTargetWrite = async () => { fs.symlinkSync(outside, harness.target, "file") }
  harness.state.warningResponses.push("変更を反映")

  await harness.send({ type: "save", model: editedModel(harness.model, "Must not replace symlink.") })

  assert.equal(fs.lstatSync(harness.target).isSymbolicLink(), true)
  assert.equal(fs.readFileSync(outside, "utf8"), "symlink winner\n")
  assert.deepEqual(backupFiles(harness.target), [])
  assert.equal(harness.state.commands.some(([command]) => command === "workflowRegister.reload"), false)
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), false)
})

test("Builder serializes saves through lexical workspace aliases of one physical target", async (t) => {
  const first = createPanelHarness(t)
  const aliasRoot = `${first.root}-alias`
  fs.symlinkSync(first.root, aliasRoot, process.platform === "win32" ? "junction" : "dir")
  t.after(() => fs.rmSync(aliasRoot, { recursive: true, force: true }))
  const aliasFixture = {
    root: aliasRoot,
    target: path.join(aliasRoot, path.relative(first.root, first.target)),
    oldText: first.oldText,
    model: first.model
  }
  const second = createPanelHarness(t, { fixture: aliasFixture })
  const firstEntered = deferred()
  const releaseFirst = deferred()
  const secondWrite = deferred()
  first.state.beforeTargetWrite = async () => { firstEntered.resolve(); await releaseFirst.promise }
  second.state.beforeTargetWrite = async () => { secondWrite.resolve() }
  first.state.warningResponses.push("変更を反映")
  second.state.warningResponses.push("変更を反映")

  const firstSave = first.send({ type: "save", model: editedModel(first.model, "First physical-root save.") })
  await firstEntered.promise
  const secondSave = second.send({ type: "save", model: editedModel(second.model, "Second physical-root save.") })
  const raced = await Promise.race([secondWrite.promise.then(() => "wrote"), nextTurn().then(() => "waiting")])
  releaseFirst.resolve()
  await Promise.all([firstSave, secondSave])

  assert.equal(raced, "waiting")
  assert.match(fs.readFileSync(first.target, "utf8"), /First physical-root save/)
  assert.ok(second.state.warnings.some((message) => /画面外で変更/.test(message)))
})

for (const targetExists of [true, false]) {
  test(`Builder rejects a ${targetExists ? "confirmed overwrite" : "confirmed create"} after its parent becomes an external alias`, async (t) => {
    const harness = createPanelHarness(t)
    if (!targetExists) fs.unlinkSync(harness.target)
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-builder-save-parent-swap-"))
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
    const outsideTarget = path.join(outside, "WORKFLOW.md")
    const outsideText = targetExists ? "outside overwrite sentinel\n" : ""
    if (targetExists) fs.writeFileSync(outsideTarget, outsideText)
    const promptShown = deferred()
    const decision = deferred()
    harness.state.onWarningMessage = () => promptShown.resolve()
    harness.state.warningResponses.push(decision.promise)

    const save = harness.send({ type: "save", model: editedModel(harness.model, "Must stay inside the physical workspace.") })
    await promptShown.promise
    const parent = path.dirname(harness.target)
    fs.renameSync(parent, `${parent}-parked`)
    fs.symlinkSync(outside, parent, process.platform === "win32" ? "junction" : "dir")
    decision.resolve(targetExists ? "変更を反映" : "作成")
    await save

    assert.equal(fs.existsSync(outsideTarget), targetExists)
    if (targetExists) assert.equal(fs.readFileSync(outsideTarget, "utf8"), outsideText)
    assert.deepEqual(fs.readdirSync(outside).filter((name) => /^WORKFLOW\.backup-/.test(name)), [])
    assert.equal(harness.state.commands.some(([command]) => command === "workflowRegister.reload"), false)
  })
}

test("Builder performs zero external backup I/O after an overwrite confirmation parent swap", async (t) => {
  const harness = createPanelHarness(t)
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-builder-backup-io-"))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  const promptShown = deferred()
  const decision = deferred()
  const externalBackupWrites = []
  const externalOperations = []
  const originals = {
    writeFile: fs.promises.writeFile,
    copyFile: fs.promises.copyFile,
    rm: fs.promises.rm,
    unlink: fs.promises.unlink
  }
  for (const [method, original] of Object.entries(originals)) {
    fs.promises[method] = async (...args) => {
      const target = method === "copyFile" ? args[1] : args[0]
      try {
        const physicalParent = fs.realpathSync(path.dirname(String(target)))
        if (path.resolve(physicalParent) === path.resolve(outside)) externalOperations.push({ method, target: String(target) })
      } catch { /* Missing parent paths cannot write through the external directory. */ }
      return original(...args)
    }
  }
  t.after(() => {
    for (const [method, original] of Object.entries(originals)) fs.promises[method] = original
  })
  harness.state.onWarningMessage = () => promptShown.resolve()
  harness.state.warningResponses.push(decision.promise)
  harness.state.beforeBackupWrite = async (target) => {
    const physicalParent = fs.realpathSync(path.dirname(target))
    if (path.resolve(physicalParent) === path.resolve(outside)) externalBackupWrites.push(target)
  }

  const save = harness.send({ type: "save", model: editedModel(harness.model, "No external backup I/O.") })
  await promptShown.promise
  const parent = path.dirname(harness.target)
  fs.renameSync(parent, `${parent}-parked`)
  fs.symlinkSync(outside, parent, process.platform === "win32" ? "junction" : "dir")
  fs.writeFileSync(path.join(outside, "WORKFLOW.md"), "outside winner\n")
  decision.resolve("変更を反映")
  await save

  assert.deepEqual(externalBackupWrites, [])
  assert.deepEqual(externalOperations, [])
  assert.equal(fs.readFileSync(path.join(outside, "WORKFLOW.md"), "utf8"), "outside winner\n")
})

test("standard-template save validates, explicitly confirms, and exclusively backs up through the Builder transaction", async (t) => {
  const harness = await createStandardPanelHarness(t)
  harness.state.warningResponses.push("上書き")

  await harness.send({ type: "save", model: harness.generatedModel })

  const backups = backupFiles(harness.target)
  assert.equal(backups.length, 1)
  assert.equal(fs.readFileSync(path.join(path.dirname(harness.target), backups[0]), "utf8"), harness.oldText)
  assert.match(fs.readFileSync(harness.target, "utf8"), /Generated standard-template description/)
  assert.equal(harness.state.copies.length, 0)
  assert.deepEqual(harness.state.commands.filter(([command]) => command === "workflowRegister.reload"), [["workflowRegister.reload"]])
})

test("standard-template saves use the per-target queue and stale-session guard", async (t) => {
  const harness = await createStandardPanelHarness(t)
  const backupStarted = deferred()
  const releaseBackup = deferred()
  let firstBackup = true
  harness.state.beforeBackupWrite = async () => {
    if (!firstBackup) return
    firstBackup = false
    backupStarted.resolve()
    await releaseBackup.promise
  }
  harness.state.warningResponses.push("上書き", "上書き")
  const firstModel = editedModel(harness.generatedModel, "First standard queued model.")
  const secondModel = editedModel(harness.generatedModel, "Second standard queued model.")

  const first = harness.send({ type: "save", model: firstModel })
  await backupStarted.promise
  const second = harness.send({ type: "save", model: secondModel })
  await nextTurn()
  assert.equal(harness.state.warnings.length, 1)
  releaseBackup.resolve()
  await Promise.all([first, second])

  assert.match(fs.readFileSync(harness.target, "utf8"), /Second standard queued model/)

  const staleStarted = deferred()
  const releaseStale = deferred()
  harness.state.beforeBackupWrite = async () => { staleStarted.resolve(); await releaseStale.promise }
  harness.state.warningResponses.push("上書き")
  const stale = harness.send({ type: "save", model: editedModel(secondModel, "Stale standard session model.") })
  await staleStarted.promise
  harness.showFixture(existingWorkflow(t, { description: "New edit session target." }))
  releaseStale.resolve()
  await stale
  assert.match(fs.readFileSync(harness.target, "utf8"), /Second standard queued model/)
})

test("standard-template no-change save performs no write, backup, prompt, or reload", async (t) => {
  const harness = await createStandardPanelHarness(t)
  const canonical = serializeAuthoringModelToMarkdown(harness.generatedModel).markdown
  fs.writeFileSync(harness.target, canonical)

  await harness.send({ type: "save", model: harness.generatedModel })

  assert.equal(fs.readFileSync(harness.target, "utf8"), canonical)
  assert.deepEqual(backupFiles(harness.target), [])
  assert.deepEqual(harness.state.warnings, [])
  assert.deepEqual(harness.state.commands, [])
})

test("standard-template virtual diff performs no I/O through a symlink preview directory", async (t) => {
  const harness = await createStandardPanelHarness(t)
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-builder-diff-outside-"))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  const previewDir = path.join(harness.root, ".bob", "workflows", ".previews")
  try {
    fs.symlinkSync(outside, previewDir, "junction")
  } catch {
    t.skip("symlink creation is not available in this environment")
    return
  }

  await harness.send({ type: "diff", model: harness.generatedModel })

  assert.deepEqual(fs.readdirSync(outside), [])
  assert.equal(harness.state.commands.some(([command]) => command === "vscode.diff"), true)
  assert.deepEqual(harness.state.errors, [])
})

test("Builder diff uses an in-memory preview with zero preview-file I/O", async (t) => {
  const harness = await createStandardPanelHarness(t)
  const previewOperations = []
  const originals = {
    mkdir: fs.promises.mkdir,
    open: fs.promises.open,
    unlink: fs.promises.unlink,
    writeFile: fs.promises.writeFile
  }
  for (const method of Object.keys(originals)) {
    fs.promises[method] = async (target, ...args) => {
      if (String(target).includes(`${path.sep}.previews${path.sep}`) || String(target).endsWith(`${path.sep}.previews`)) {
        previewOperations.push({ method, target: String(target) })
      }
      return originals[method](target, ...args)
    }
  }
  t.after(() => {
    for (const [method, original] of Object.entries(originals)) fs.promises[method] = original
  })

  await harness.send({ type: "diff", model: harness.generatedModel })

  assert.deepEqual(previewOperations, [])
  assert.equal(harness.state.commands.some(([command]) => command === "vscode.diff"), true)
})

test("Builder aborts virtual diff before dispatch when the target identity changes during document creation", async (t) => {
  const harness = await createStandardPanelHarness(t)
  let replaced = false
  harness.state.beforeOpenTextDocument = async (target) => {
    if (replaced || typeof target?.content !== "string") return
    replaced = true
    const replacement = `${harness.target}.replacement`
    fs.writeFileSync(replacement, "external replacement\n")
    fs.renameSync(replacement, harness.target)
  }

  const diffModel = editedModel(harness.generatedModel, "Diff must not commit after target replacement.")
  await harness.send({ type: "diff", model: diffModel })

  assert.equal(replaced, true)
  assert.equal(harness.state.commands.some(([command]) => command === "vscode.diff"), false)
  assert.equal(harness.builder.activeSession.model.metadata.description, harness.generatedModel.metadata.description)
})

test("Builder virtual preview parent swap writes and deletes nothing outside", async (t) => {
  const harness = await createStandardPanelHarness(t)
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-builder-preview-parent-swap-"))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  const previewDir = path.join(harness.root, ".bob", "workflows", ".previews")
  const parked = `${previewDir}-parked`
  fs.mkdirSync(previewDir, { recursive: true })
  let swapped = false
  harness.state.beforeOpenTextDocument = async (target) => {
    if (swapped || typeof target?.content !== "string") return
    fs.renameSync(previewDir, parked)
    fs.symlinkSync(outside, previewDir, process.platform === "win32" ? "junction" : "dir")
    swapped = true
  }

  await harness.send({ type: "diff", model: editedModel(harness.generatedModel, "Preview parent swap must fail closed.") })

  assert.equal(swapped, true)
  assert.deepEqual(fs.readdirSync(outside), [])
  assert.equal(harness.state.commands.some(([command]) => command === "vscode.diff"), true)
})

test("stale standard-template virtual diff leaves a foreign preview untouched", async (t) => {
  const harness = await createStandardPanelHarness(t)
  const diffStarted = deferred()
  const releaseDiff = deferred()
  harness.state.beforeCommand = async (command) => {
    if (command !== "vscode.diff") return
    diffStarted.resolve()
    await releaseDiff.promise
  }

  const diff = harness.send({ type: "diff", model: harness.generatedModel })
  await diffStarted.promise
  const previewDir = path.join(harness.root, ".bob", "workflows", ".previews")
  fs.mkdirSync(previewDir, { recursive: true })
  const foreign = path.join(previewDir, "foreign-preview.md")
  fs.writeFileSync(foreign, "foreign\n")
  harness.showFixture(existingWorkflow(t, { description: "Replacement during diff." }))
  releaseDiff.resolve()
  await diff
  await nextTurn()

  assert.equal(fs.readFileSync(foreign, "utf8"), "foreign\n")
  assert.deepEqual(fs.readdirSync(previewDir).filter((name) => name.startsWith("workflow-builder-")), [])
})

test("standard-template diff parent swap never deletes or writes through the replacement", async (t) => {
  const harness = await createStandardPanelHarness(t)
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-builder-parent-swap-"))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  const diffStarted = deferred()
  const releaseDiff = deferred()
  harness.state.beforeCommand = async (command) => {
    if (command !== "vscode.diff") return
    diffStarted.resolve()
    await releaseDiff.promise
  }

  const diff = harness.send({ type: "diff", model: harness.generatedModel })
  await diffStarted.promise
  const previewDir = path.join(harness.root, ".bob", "workflows", ".previews")
  const movedPreviewDir = `${previewDir}-owned`
  fs.mkdirSync(previewDir, { recursive: true })
  fs.renameSync(previewDir, movedPreviewDir)
  try {
    fs.symlinkSync(outside, previewDir, "junction")
  } catch {
    releaseDiff.resolve()
    await diff
    t.skip("symlink creation is not available in this environment")
    return
  }
  fs.writeFileSync(path.join(outside, "foreign-preview.md"), "outside\n")
  releaseDiff.resolve()
  await diff

  assert.equal(fs.readFileSync(path.join(outside, "foreign-preview.md"), "utf8"), "outside\n")
  assert.equal(fs.readdirSync(outside).length, 1)
  assert.deepEqual(fs.readdirSync(movedPreviewDir).filter((name) => name.startsWith("workflow-builder-")), [])
})

test("same-mode selection is a host no-op and stale or malformed page messages are caught without writes", async (t) => {
  const harness = createPanelHarness(t)
  const originalHtml = harness.panel.webview.html
  const token = harness.token()

  await harness.send({ type: "selectMode", mode: "edit" })
  assert.equal(harness.panel.webview.html, originalHtml)

  harness.showFixture(existingWorkflow(t, { description: "Replacement session." }))
  await harness.sendRaw({ type: "save", sessionToken: token, model: editedModel(harness.model, "Stale old page.") })
  await harness.sendRaw({ type: "save", sessionToken: harness.token(), model: { metadata: {}, steps: "bad" } })

  assert.equal(fs.readFileSync(harness.target, "utf8"), harness.oldText)
  assert.deepEqual(backupFiles(harness.target), [])
  assert.ok(harness.state.errors.some((message) => /stale Builder page/.test(message)))
  assert.ok(harness.state.errors.some((message) => /malformed authoring model/.test(message)))
})

test("unknown Builder actions are rejected before session state changes", async (t) => {
  const harness = createPanelHarness(t)
  const generation = harness.builder.activeSession.generation

  await harness.sendRaw({ type: "unknownAction", sessionToken: harness.token(), model: harness.model })

  assert.equal(harness.builder.activeSession.generation, generation)
  assert.equal(harness.builder.activeSession.model.metadata.description, harness.model.metadata.description)
  assert.ok(harness.state.errors.some((message) => /unsupported Builder action/.test(message)))
})

test("out-of-order authoring requests retain only the latest valid host model", async (t) => {
  const harness = createPanelHarness(t)
  const firstPosted = deferred()
  const releaseFirst = deferred()
  harness.state.beforePost = async (message) => {
    if (message.type !== "previewResult" || !/First pending model/.test(message.markdown ?? "")) return
    firstPosted.resolve()
    await releaseFirst.promise
  }
  const firstModel = editedModel(harness.model, "First pending model.")
  const secondModel = editedModel(harness.model, "Second latest model.")

  const first = harness.send({ type: "preview", model: firstModel })
  await firstPosted.promise
  await harness.send({ type: "preview", model: secondModel })
  releaseFirst.resolve()
  await first

  assert.equal(harness.builder.activeSession.model.metadata.description, "Second latest model.")
})

test("Builder host tags out-of-order responses with monotonic request generations", async (t) => {
  const harness = createPanelHarness(t)
  const firstPostStarted = deferred()
  const releaseFirstPost = deferred()
  harness.state.beforePost = async (message) => {
    if (message.type === "previewResult" && /First delayed response/.test(message.markdown)) {
      firstPostStarted.resolve()
      await releaseFirstPost.promise
    }
  }

  const first = harness.send({ type: "preview", model: editedModel(harness.model, "First delayed response.") })
  await firstPostStarted.promise
  await harness.send({ type: "preview", model: editedModel(harness.model, "Second current response.") })
  releaseFirstPost.resolve()
  await first

  const responses = harness.state.posted.filter((message) => message.type === "previewResult")
  assert.match(responses[0].markdown, /Second current response/)
  assert.match(responses[1].markdown, /First delayed response/)
  assert.equal(Number.isInteger(responses[0].generation), true)
  assert.equal(Number.isInteger(responses[1].generation), true)
  assert.ok(responses[0].generation > responses[1].generation)
  assert.ok(responses.every((message) => message.sessionToken === harness.token()))
})

test("host request-token ownership stays bounded for requests with no response", (t) => {
  const harness = createPanelHarness(t)

  for (let index = 0; index < 300; index += 1) harness.builder.beginRequest()

  assert.equal(harness.builder.activeSession.requestRenderTokens.size, 256)
})

test("an older save response retains its request render token across a same-session rerender", async (t) => {
  const harness = createPanelHarness(t)
  const writeStarted = deferred()
  const releaseWrite = deferred()
  harness.state.beforeTargetWrite = async () => { writeStarted.resolve(); await releaseWrite.promise }
  harness.state.warningResponses.push("変更を反映")
  const requestToken = harness.token()

  const save = harness.send({ type: "save", model: editedModel(harness.model, "Older save across rerender.") })
  await writeStarted.promise
  harness.builder.renderActiveSession()
  const currentToken = harness.token()
  assert.notEqual(currentToken, requestToken)
  releaseWrite.resolve()
  await save

  const saved = harness.state.posted.find((message) => message.type === "saved")
  assert.ok(saved)
  assert.equal(saved.sessionToken, requestToken)
  assert.notEqual(saved.sessionToken, currentToken)
})

test("an older save validation response keeps the save request generation", async (t) => {
  const harness = createPanelHarness(t)
  const model = editedModel(harness.model, "Older invalid save response.")
  const request = harness.builder.beginRequest(model)
  harness.builder.beginRequest()
  const validRendered = serializeAuthoringModelToMarkdown(model)
  const rendered = { ...validRendered, markdown: "---\ninvalid: [\n---\n" }

  await harness.builder.save({
    session: request.session,
    generation: request.generation,
    model,
    rendered,
    targetUri: { fsPath: harness.target },
    targetPath: rendered.filePath
  })

  const response = harness.state.posted.find((message) => message.type === "previewResult")
  assert.ok(response)
  assert.equal(response.generation, request.generation)
})

test("disposing during an authoring operation invalidates its pending host-model commit", async (t) => {
  const harness = createPanelHarness(t)
  const posted = deferred()
  const release = deferred()
  harness.state.beforePost = async (message) => {
    if (message.type !== "previewResult") return
    posted.resolve()
    await release.promise
  }
  const pendingModel = editedModel(harness.model, "Must not commit after dispose.")

  const pending = harness.send({ type: "preview", model: pendingModel })
  await posted.promise
  harness.panel.dispose()
  release.resolve()
  await pending

  assert.equal(harness.builder.activeSession.model.metadata.description, harness.model.metadata.description)
})

test("panel replacement and standard-template apply invalidate older pending model commits", async (t) => {
  const harness = await createStandardPanelHarness(t)
  const firstPosted = deferred()
  const releaseFirst = deferred()
  harness.state.beforePost = async (message) => {
    if (message.type !== "previewResult" || !/Older pending edit/.test(message.markdown ?? "")) return
    firstPosted.resolve()
    await releaseFirst.promise
  }
  const older = editedModel(harness.generatedModel, "Older pending edit.")
  const pending = harness.send({ type: "preview", model: older })
  await firstPosted.promise
  harness.studioModel.description = "Fresh template application."
  await harness.send({ type: "applyStandardTemplate", model: harness.studioModel })
  releaseFirst.resolve()
  await pending

  assert.equal(harness.builder.activeSession.model.metadata.description, "Fresh template application.")

  const replacement = existingWorkflow(t, { description: "Replacement wins pending commit." })
  const secondPosted = deferred()
  const releaseSecond = deferred()
  harness.state.beforePost = async (message) => {
    if (message.type !== "previewResult" || !/Pending before replacement/.test(message.markdown ?? "")) return
    secondPosted.resolve()
    await releaseSecond.promise
  }
  const pendingReplacement = harness.send({ type: "preview", model: editedModel(harness.builder.activeSession.model, "Pending before replacement.") })
  await secondPosted.promise
  harness.showFixture(replacement)
  releaseSecond.resolve()
  await pendingReplacement
  assert.equal(harness.builder.activeSession.model.metadata.description, "Replacement wins pending commit.")
})

test("Builder confirmation backs up the exact old bytes before overwriting and reloading", async (t) => {
  const harness = createPanelHarness(t)
  harness.state.warningResponses.push("変更を反映")

  await harness.send({ type: "save", model: editedModel(harness.model, "Confirmed description.") })

  const backups = backupFiles(harness.target)
  assert.equal(backups.length, 1)
  assert.equal(fs.readFileSync(path.join(path.dirname(harness.target), backups[0]), "utf8"), harness.oldText)
  assert.match(fs.readFileSync(harness.target, "utf8"), /description: Confirmed description\./)
  assert.deepEqual(harness.state.commands, [["workflowRegister.reload"]])
  assert.equal(harness.state.shownDocuments.length, 1)
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), true)
})

test("Builder reports the real transaction error after a publish mutates then rejects", async (t) => {
  const harness = createPanelHarness(t)
  const originalLink = fs.promises.link
  fs.promises.link = async (source, target) => {
    await originalLink(source, target)
    throw new Error("publish mutated rejection detail")
  }
  t.after(() => { if (fs.promises.link !== originalLink) fs.promises.link = originalLink })
  harness.state.warningResponses.push("変更を反映")

  await harness.send({ type: "save", model: editedModel(harness.model, "Rejected publication.") })

  assert.equal(fs.readFileSync(harness.target, "utf8"), harness.oldText)
  assert.deepEqual(backupFiles(harness.target), [])
  assert.ok(harness.state.errors.some((message) => /publish mutated rejection detail/.test(message)))
  assert.equal(harness.state.warnings.some((message) => /保存直前に変更/.test(message)), false)
})

test("Builder rejects an external edit against originalText before backup, overwrite, or reload", async (t) => {
  const harness = createPanelHarness(t)
  const externalText = harness.oldText.replace("Original workflow description.", "External winner description.")
  fs.writeFileSync(harness.target, externalText)
  harness.state.warningResponses.push("変更を反映")

  await harness.send({ type: "save", model: editedModel(harness.model, "Stale builder description.") })

  assert.equal(fs.readFileSync(harness.target, "utf8"), externalText)
  assert.deepEqual(backupFiles(harness.target), [])
  assert.deepEqual(harness.state.commands, [])
  assert.deepEqual(harness.state.shownDocuments, [])
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), false)
  assert.ok(
    [...harness.state.errors, ...harness.state.warnings].some((message) => /refresh|reopen|再読込|再読み込み|開き直す|更新/i.test(message)),
    `expected refresh/reopen diagnostic, got ${JSON.stringify({ errors: harness.state.errors, warnings: harness.state.warnings })}`
  )
})

test("Builder preserves a target created while the missing-target Create confirmation is open", async (t) => {
  const harness = createPanelHarness(t)
  fs.unlinkSync(harness.target)
  const createPromptShown = deferred()
  const createDecision = deferred()
  harness.state.onWarningMessage = (message) => {
    if (/存在しません.*作成|no longer exists.*create/i.test(message)) createPromptShown.resolve()
  }
  harness.state.warningResponses.push(createDecision.promise)

  const staleSave = harness.send({ type: "save", model: editedModel(harness.model, "Stale missing-target description.") })
  await createPromptShown.promise
  const externalText = harness.oldText.replace("Original workflow description.", "External creator wins.")
  fs.writeFileSync(harness.target, externalText)
  createDecision.resolve("作成")
  await staleSave

  assert.equal(fs.readFileSync(harness.target, "utf8"), externalText)
  assert.deepEqual(backupFiles(harness.target), [])
  assert.deepEqual(harness.state.commands, [])
  assert.deepEqual(harness.state.shownDocuments, [])
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), false)
  assert.equal(harness.state.information.length, 0)
  assert.ok(
    harness.state.warnings.some((message) => /refresh|reopen|再読込|再読み込み|開き直す|更新/i.test(message)),
    `expected refresh/reopen diagnostic, got ${JSON.stringify(harness.state.warnings)}`
  )

  fs.writeFileSync(harness.target, harness.oldText)
  harness.state.warningResponses.push("変更を反映")
  await harness.send({ type: "save", model: editedModel(harness.model, "Fresh missing-target retry.") })

  assert.match(fs.readFileSync(harness.target, "utf8"), /description: Fresh missing-target retry\./)
  assert.deepEqual(harness.state.commands, [["workflowRegister.reload"]])
  assert.equal(harness.state.posted.filter((message) => message.type === "saved").length, 1)
})

test("Builder creates the target when it is still missing after Create confirmation", async (t) => {
  const harness = createPanelHarness(t)
  fs.unlinkSync(harness.target)
  harness.state.warningResponses.push("作成")

  await harness.send({ type: "save", model: editedModel(harness.model, "Confirmed missing-target create.") })

  assert.match(fs.readFileSync(harness.target, "utf8"), /description: Confirmed missing-target create\./)
  assert.deepEqual(backupFiles(harness.target), [])
  assert.deepEqual(harness.state.commands, [["workflowRegister.reload"]])
  assert.equal(harness.state.shownDocuments.length, 1)
  assert.equal(harness.state.posted.filter((message) => message.type === "saved").length, 1)
})

test("Builder revalidates original bytes after a blocked backup and preserves the external winner", async (t) => {
  const harness = createPanelHarness(t)
  const backupStarted = deferred()
  const releaseBackup = deferred()
  let blockFirstBackup = true
  harness.state.beforeBackupWrite = async () => {
    if (!blockFirstBackup) return
    blockFirstBackup = false
    backupStarted.resolve()
    await releaseBackup.promise
  }
  harness.state.warningResponses.push("変更を反映")

  const staleSave = harness.send({ type: "save", model: editedModel(harness.model, "Stale builder description.") })
  await backupStarted.promise
  const externalText = harness.oldText.replace("Original workflow description.", "External winner during backup.")
  fs.writeFileSync(harness.target, externalText)
  releaseBackup.resolve()
  await staleSave

  assert.equal(fs.readFileSync(harness.target, "utf8"), externalText)
  assert.deepEqual(harness.state.commands, [])
  assert.deepEqual(harness.state.shownDocuments, [])
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), false)
  assert.equal(harness.state.information.length, 0)
  assert.ok(
    harness.state.warnings.some((message) => /refresh|reopen|再読込|再読み込み|開き直す|更新/i.test(message)),
    `expected refresh/reopen diagnostic, got ${JSON.stringify(harness.state.warnings)}`
  )

  fs.writeFileSync(harness.target, harness.oldText)
  harness.state.warningResponses.push("変更を反映")
  await harness.send({ type: "save", model: editedModel(harness.model, "Fresh retry description.") })

  assert.match(fs.readFileSync(harness.target, "utf8"), /description: Fresh retry description\./)
  assert.deepEqual(harness.state.commands, [["workflowRegister.reload"]])
  assert.equal(harness.state.posted.filter((message) => message.type === "saved").length, 1)
})

test("Builder serializes concurrent save messages for the same target", async (t) => {
  const harness = createPanelHarness(t)
  const backupStarted = deferred()
  const releaseBackup = deferred()
  let blockFirstBackup = true
  harness.state.beforeBackupWrite = async () => {
    if (!blockFirstBackup) return
    blockFirstBackup = false
    backupStarted.resolve()
    await releaseBackup.promise
  }
  harness.state.warningResponses.push("変更を反映", "変更を反映")

  const firstSave = harness.send({ type: "save", model: editedModel(harness.model, "First concurrent description.") })
  await backupStarted.promise
  const secondSave = harness.send({ type: "save", model: editedModel(harness.model, "Second concurrent description.") })
  await nextTurn()
  const warningCountWhileFirstSaveIsBlocked = harness.state.warnings.length
  releaseBackup.resolve()
  await Promise.all([firstSave, secondSave])

  assert.equal(warningCountWhileFirstSaveIsBlocked, 1)
  assert.match(fs.readFileSync(harness.target, "utf8"), /description: Second concurrent description\./)
  assert.deepEqual(harness.state.commands, [["workflowRegister.reload"]])
  assert.equal(harness.state.posted.filter((message) => message.type === "saved").length, 1)
})

test("Builder aborts a queued save when the panel switches sessions before the operation starts", async (t) => {
  const harness = createPanelHarness(t)
  const sessionB = existingWorkflow(t, { description: "Session B original description." })
  harness.state.warningResponses.push("変更を反映", "変更を反映")

  const staleSessionASave = harness.send({ type: "save", model: editedModel(harness.model, "Stale session A description.") })
  harness.showFixture(sessionB)
  await staleSessionASave

  assert.equal(fs.readFileSync(harness.target, "utf8"), harness.oldText)
  assert.equal(fs.readFileSync(sessionB.target, "utf8"), sessionB.oldText)
  assert.deepEqual(backupFiles(harness.target), [])
  assert.deepEqual(backupFiles(sessionB.target), [])
  assert.deepEqual(harness.state.commands, [])
  assert.deepEqual(harness.state.shownDocuments, [])
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), false)
  assert.deepEqual(harness.state.information, [])

  await harness.send({ type: "save", model: editedModel(sessionB.model, "Fresh session B description.") })

  assert.equal(fs.readFileSync(harness.target, "utf8"), harness.oldText)
  assert.match(fs.readFileSync(sessionB.target, "utf8"), /description: Fresh session B description\./)
  assert.equal(backupFiles(sessionB.target).length, 1)
  assert.deepEqual(harness.state.commands, [["workflowRegister.reload"]])
  assert.equal(harness.state.posted.filter((message) => message.type === "saved").length, 1)
})

test("Builder rolls back a backup and aborts when the panel switches sessions during backup", async (t) => {
  const harness = createPanelHarness(t)
  const sessionB = existingWorkflow(t, { description: "Session B original during backup." })
  const backupStarted = deferred()
  const releaseBackup = deferred()
  let blockFirstBackup = true
  harness.state.beforeBackupWrite = async () => {
    if (!blockFirstBackup) return
    blockFirstBackup = false
    backupStarted.resolve()
    await releaseBackup.promise
  }
  harness.state.warningResponses.push("変更を反映", "変更を反映")

  const staleSessionASave = harness.send({ type: "save", model: editedModel(harness.model, "Stale session A during backup.") })
  await backupStarted.promise
  harness.showFixture(sessionB)
  releaseBackup.resolve()
  await staleSessionASave

  assert.equal(fs.readFileSync(harness.target, "utf8"), harness.oldText)
  assert.equal(fs.readFileSync(sessionB.target, "utf8"), sessionB.oldText)
  assert.deepEqual(backupFiles(harness.target), [])
  assert.deepEqual(backupFiles(sessionB.target), [])
  assert.deepEqual(harness.state.commands, [])
  assert.deepEqual(harness.state.shownDocuments, [])
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), false)
  assert.deepEqual(harness.state.information, [])

  await harness.send({ type: "save", model: editedModel(sessionB.model, "Fresh session B after backup switch.") })

  assert.equal(fs.readFileSync(harness.target, "utf8"), harness.oldText)
  assert.match(fs.readFileSync(sessionB.target, "utf8"), /description: Fresh session B after backup switch\./)
  assert.equal(backupFiles(sessionB.target).length, 1)
  assert.deepEqual(harness.state.commands, [["workflowRegister.reload"]])
  assert.equal(harness.state.posted.filter((message) => message.type === "saved").length, 1)
})

test("Builder reloads a committed save without sending stale UI when the panel switches sessions during target write", async (t) => {
  const harness = createPanelHarness(t)
  const sessionB = existingWorkflow(t, { description: "Session B original during target write." })
  const targetWriteStarted = deferred()
  const releaseTargetWrite = deferred()
  let blockFirstTargetWrite = true
  harness.state.beforeTargetWrite = async () => {
    if (!blockFirstTargetWrite) return
    blockFirstTargetWrite = false
    targetWriteStarted.resolve()
    await releaseTargetWrite.promise
  }
  harness.state.warningResponses.push("変更を反映", "変更を反映")

  const committedSessionASave = harness.send({ type: "save", model: editedModel(harness.model, "Committed session A description.") })
  await targetWriteStarted.promise
  harness.showFixture(sessionB)
  releaseTargetWrite.resolve()
  await committedSessionASave

  assert.match(fs.readFileSync(harness.target, "utf8"), /description: Committed session A description\./)
  assert.equal(fs.readFileSync(sessionB.target, "utf8"), sessionB.oldText)
  assert.equal(backupFiles(harness.target).length, 1)
  assert.deepEqual(backupFiles(sessionB.target), [])
  assert.deepEqual(harness.state.commands, [["workflowRegister.reload"]])
  assert.deepEqual(harness.state.shownDocuments, [])
  assert.equal(harness.state.posted.some((message) => message.type === "saved"), false)
  assert.deepEqual(harness.state.information, [])

  await harness.send({ type: "save", model: editedModel(sessionB.model, "Fresh session B after target write.") })

  assert.match(fs.readFileSync(harness.target, "utf8"), /description: Committed session A description\./)
  assert.match(fs.readFileSync(sessionB.target, "utf8"), /description: Fresh session B after target write\./)
  assert.deepEqual(harness.state.commands, [["workflowRegister.reload"], ["workflowRegister.reload"]])
  assert.equal(harness.state.shownDocuments.length, 1)
  assert.equal(harness.state.posted.filter((message) => message.type === "saved").length, 1)
  assert.equal(harness.state.information.length, 1)
})

test("Builder retains two exclusively-created backups for successful saves in the same second", async (t) => {
  const harness = createPanelHarness(t)
  const RealDate = global.Date
  const fixedTime = new RealDate("2026-07-12T03:04:05.000Z")
  global.Date = class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [fixedTime.getTime()]))
    }

    static now() {
      return fixedTime.getTime()
    }
  }
  t.after(() => { global.Date = RealDate })
  harness.state.warningResponses.push("変更を反映", "変更を反映")
  const firstModel = editedModel(harness.model, "First same-second description.")
  const secondModel = editedModel(harness.model, "Second same-second description.")

  await harness.send({ type: "save", model: firstModel })
  await harness.send({ type: "save", model: secondModel })

  const backups = backupFiles(harness.target)
  const backupContents = backups
    .map((name) => fs.readFileSync(path.join(path.dirname(harness.target), name), "utf8"))
    .sort()
  const firstText = serializeAuthoringModelToMarkdown(firstModel).markdown
  assert.equal(backups.length, 2)
  assert.equal(new Set(backups).size, 2)
  assert.deepEqual(backupContents, [harness.oldText, firstText].sort())
  assert.equal(harness.state.copies.length, 0)
})

test("Builder advances its originalText baseline only after each successful save", async (t) => {
  const harness = createPanelHarness(t)
  harness.state.warningResponses.push("変更を反映", "変更を反映")

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
