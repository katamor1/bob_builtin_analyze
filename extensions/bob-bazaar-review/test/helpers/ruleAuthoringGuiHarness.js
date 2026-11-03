const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const GUI_MODULE = path.join(__dirname, "..", "..", "out", "ui", "ruleAuthoringGui.js")
const WORKSPACE_ROOT = "/workspace/acme-project"
const PRIVATE_DOCX = "/private/acme/rule sources/engineering-policy.docx"
const PRIVATE_PDF = "/private/acme/rule sources/scanned-policy.pdf"
const PRIVATE_RAW_TEXT = "RAW PRIVATE POLICY: never render or post this text"
const SAFE_HOST_ERROR_MESSAGE = "規約資料の取り込みを安全に続行できなかったため停止しました。入力資料とワークスペースを確認して再実行してください。"
const SELECTED_ID = `selected-${"1".repeat(32)}`
const CHUNK_ID = `chunk-${"c".repeat(64)}`
const MESSAGE_TYPES = [
  "chooseSources",
  "removeSource",
  "extractSources",
  "setChunkIncluded",
  "confirmAiPayload",
  "resumeRun",
  "cancelRun"
]
const PHASES = [
  "sources",
  "extraction",
  "evidence_selection",
  "proposal",
  "human_review",
  "apply",
  "completed"
]

function renderModel(overrides = {}) {
  return {
    cspSource: "vscode-resource:",
    phase: "evidence_selection",
    environment: {
      workspaceName: "acme <workspace>",
      workspaceReady: true,
      bobExtensionAvailable: true,
      configuredBobModelRoute: "Bob configured route: team/model <primary>"
    },
    runId: "authoring-run-1",
    resumableRuns: [],
    sources: [
      {
        sourceId: SELECTED_ID,
        logicalName: "engineering <policy> & standards.docx",
        mediaType: "docx",
        byteSize: 42,
        extractionStatus: "success",
        warnings: []
      }
    ],
    chunks: [
      {
        chunkId: CHUNK_ID,
        sourceId: "src-aaaaaaaaaaaa",
        title: "Input <validation>",
        locator: "Heading: Security > Input",
        utf8Bytes: 31,
        included: true
      }
    ],
    aiPayload: {
      logicalNames: ["engineering <policy> & standards.docx"],
      selectedChunkCount: 1,
      utf8Bytes: 31
    },
    warnings: ["Treat <document> text as untrusted evidence"],
    scopeOverflow: false,
    exclusionsApproved: true,
    canConfirmAiPayload: true,
    status: "AI payload consent is waiting",
    // These are deliberately hostile extra properties. The renderer must use
    // the remote-safe view model allowlist rather than serializing the object.
    absolutePath: PRIVATE_DOCX,
    windowsAbsolutePath: "C:\\Users\\Alice\\Documents\\engineering-policy.docx",
    sourceFileUri: "file:///private/acme/rule%20sources/engineering-policy.docx",
    rawText: PRIVATE_RAW_TEXT,
    ...overrides
  }
}

function ruleRun(overrides = {}) {
  const timestamp = "2026-07-15T00:00:00.000Z"
  const currentPhase = overrides.currentPhase ?? "sources"
  const currentIndex = PHASES.indexOf(currentPhase)
  return {
    schemaVersion: "bob-bazaar-review/rule-authoring-run/v1",
    workspaceRoot: WORKSPACE_ROOT,
    runId: "authoring-run-1",
    workflowRunId: "workflow-run-7",
    currentPhase,
    phases: Object.fromEntries(PHASES.map((phase, index) => [
      phase,
      index < currentIndex
        ? { status: "completed", startedAt: timestamp, completedAt: timestamp }
        : index === currentIndex
          ? { status: "in_progress", startedAt: timestamp }
          : { status: "not_started" }
    ])),
    artifacts: {},
    warnings: [],
    issues: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  }
}

function successBatch(options = {}) {
  const logicalName = options.logicalName ?? "engineering-policy.docx"
  const localPath = options.localPath ?? PRIVATE_DOCX
  const sourceId = options.sourceId ?? "src-aaaaaaaaaaaa"
  const chunkId = options.chunkId ?? CHUNK_ID
  const sha256 = options.sha256 ?? "a".repeat(64)
  const chunk = {
    schema_version: "bob-bazaar-review/document-chunk/v1",
    chunk_id: chunkId,
    source_id: sourceId,
    kind: "paragraph",
    locator: { heading_path: ["Security"], block_index: 0 },
    title: "Input validation",
    text: PRIVATE_RAW_TEXT,
    text_sha256: "b".repeat(64),
    flags: []
  }
  return {
    manifest: {
      schema_version: "bob-bazaar-review/rule-sources/v1",
      generated_at: "2026-07-15T00:00:00.000Z",
      sources: [{
        source_id: sourceId,
        logical_name: logicalName,
        media_type: "docx",
        sha256,
        byte_size: 42,
        extraction_status: "success",
        extractor: { id: "fake-docx", version: "1" },
        warnings: []
      }]
    },
    documents: [{
      logicalName,
      mediaType: "docx",
      byteSize: 42,
      sha256,
      status: "success",
      warnings: [],
      extractor: { id: "fake-docx", version: "1" },
      chunks: [chunk],
      shareable: true,
      localPath
    }],
    aiChunks: [chunk],
    localSourceMappings: [{ logicalName, absolutePath: localPath, sha256, status: "success" }],
    duplicates: [],
    diagnostics: []
  }
}

function fileUri(fsPath) {
  return {
    fsPath,
    path: fsPath,
    scheme: "file",
    toString: () => `file://${fsPath}`
  }
}

function createFakeVscode(options = {}) {
  const panels = []
  const pickerCalls = []
  const warningCalls = []
  const errorCalls = []
  const informationCalls = []
  const commandCalls = []
  const pickerResults = [...(options.pickerResults ?? [])]
  const sourceSizes = new Map(options.sourceSizes ?? [])
  const workspaceRoot = options.workspaceRoot ?? WORKSPACE_ROOT

  function createWebviewPanel(viewType, title, column, panelOptions) {
    const messageListeners = []
    const disposeListeners = []
    const posts = []
    const htmlHistory = []
    const webview = {
      cspSource: "vscode-resource:",
      postMessage: async (message) => {
        posts.push(structuredClone(message))
        return true
      },
      onDidReceiveMessage: (listener) => {
        messageListeners.push(listener)
        return { dispose() {} }
      }
    }
    Object.defineProperty(webview, "html", {
      get: () => htmlHistory.at(-1) ?? "",
      set: (value) => htmlHistory.push(String(value))
    })
    const panel = {
      viewType,
      title,
      column,
      options: panelOptions,
      webview,
      posts,
      htmlHistory,
      onDidDispose: (listener) => {
        disposeListeners.push(listener)
        return { dispose() {} }
      },
      async emitMessage(message) {
        for (const listener of messageListeners) await Promise.resolve(listener(structuredClone(message)))
        await turn()
      },
      emitMessageWithoutWaiting(message) {
        for (const listener of messageListeners) void listener(structuredClone(message))
      },
      dispose() {
        if (this.disposed) return
        this.disposed = true
        if (!options.deferDisposeCallbacks) this.flushDisposeCallbacks()
      },
      flushDisposeCallbacks() {
        if (this.disposeCallbacksDelivered) return
        this.disposeCallbacksDelivered = true
        for (const listener of disposeListeners) listener()
      }
    }
    panels.push(panel)
    return panel
  }

  const vscode = {
    ViewColumn: { One: 1 },
    Uri: { file: fileUri },
    FileType: { File: 1, Directory: 2 },
    window: {
      createWebviewPanel,
      showOpenDialog: async (pickerOptions) => {
        pickerCalls.push(structuredClone(pickerOptions))
        return pickerResults.shift()
      },
      showWarningMessage: async (message, maybeOptions, ...rest) => {
        const hasOptions = maybeOptions && typeof maybeOptions === "object" && !Array.isArray(maybeOptions)
        const call = {
          message: String(message),
          options: hasOptions ? structuredClone(maybeOptions) : {},
          items: hasOptions ? rest : [maybeOptions, ...rest].filter((item) => item !== undefined)
        }
        warningCalls.push(call)
        return options.warningResponder ? options.warningResponder(call) : undefined
      },
      showErrorMessage: async (message) => {
        errorCalls.push(String(message))
        return undefined
      },
      showInformationMessage: async (message) => {
        informationCalls.push(String(message))
        return undefined
      }
    },
    workspace: {
      workspaceFolders: [{ uri: fileUri(workspaceRoot), name: path.basename(workspaceRoot), index: 0 }],
      fs: {
        stat: async (uri) => ({
          type: 1,
          ctime: 0,
          mtime: 0,
          size: sourceSizes.get(uri.fsPath) ?? 42
        })
      }
    },
    commands: {
      executeCommand: async (command, ...args) => {
        commandCalls.push({ command, args: structuredClone(args) })
        return undefined
      }
    }
  }

  return {
    vscode,
    panels,
    pickerCalls,
    warningCalls,
    errorCalls,
    informationCalls,
    commandCalls
  }
}

function loadRuleAuthoringGui(vscode) {
  const originalLoad = Module._load
  delete require.cache[GUI_MODULE]
  Module._load = function load(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(GUI_MODULE)
  } finally {
    Module._load = originalLoad
  }
}

function hostDependencies(overrides = {}) {
  const reportHostErrors = []
  const renderedModels = []
  const completionCalls = []
  const extractionCalls = []
  const persistenceCalls = []
  const scopeUpdateCalls = []
  const confirmationCalls = []
  const bindingCalls = []
  const invalidationCalls = []
  const createCalls = []
  const resumeCalls = []
  const calls = []
  const dependencies = {
    createNonce: () => "nonce-host-123",
    reportHostError: (error) => {
      reportHostErrors.push(error)
    },
    renderRuleAuthoringGuiHtml: (model, nonce) => {
      renderedModels.push({ model: structuredClone(model), nonce })
      return `<!doctype html><html><body data-render="${renderedModels.length}"></body></html>`
    },
    findIncompleteRuleApplyTransactions: async (workspaceRoot) => {
      calls.push(["findTransactions", workspaceRoot])
      return []
    },
    listIncompleteRuleAuthoringRuns: async (workspaceRoot) => {
      calls.push(["listRuns", workspaceRoot])
      return []
    },
    createRuleAuthoringRun: async (input) => {
      calls.push(["createRun", input.workspaceRoot])
      createCalls.push(structuredClone(input))
      return ruleRun({ workspaceRoot: input.workspaceRoot, workflowRunId: input.workflowRunId })
    },
    resumeRuleAuthoringRun: async (run) => {
      resumeCalls.push(structuredClone(run))
      return { run, sources: [], chunks: [], aiPayload: undefined }
    },
    extractRuleDocuments: async (requests) => {
      extractionCalls.push(structuredClone(requests))
      return successBatch({
        logicalName: path.basename(requests[0].filePath),
        localPath: requests[0].filePath
      })
    },
    persistRuleAuthoringExtraction: async (input) => {
      persistenceCalls.push(structuredClone(input))
      return {
        run: ruleRun({
          workspaceRoot: input.workspaceRoot,
          runId: input.runId,
          currentPhase: "evidence_selection",
          artifacts: {
            sourceManifest: "source-manifest.json",
            documentChunks: "document-chunks.jsonl",
            sourceIndex: "source-index.json"
          }
        })
      }
    },
    updateRuleAuthoringScopeSelection: async (input) => {
      scopeUpdateCalls.push(structuredClone(input))
      return { run: { ...input.run, updatedAt: "2026-07-15T00:00:01.000Z" } }
    },
    confirmRuleAuthoringScope: async (input) => {
      confirmationCalls.push(structuredClone(input))
      return {
        status: "confirmed",
        run: { ...input.run, updatedAt: "2026-07-15T00:00:02.000Z" },
        summary: {
          logicalNames: ["engineering-policy.docx"],
          selectedChunkCount: 1,
          utf8Bytes: Buffer.byteLength(PRIVATE_RAW_TEXT, "utf8")
        }
      }
    },
    bindRuleAuthoringRunToWorkflow: async ({ run, workflowRunId }) => {
      bindingCalls.push({ run: structuredClone(run), workflowRunId })
      return { ...run, workflowRunId, updatedAt: "2026-07-15T00:00:01.000Z" }
    },
    invalidateRuleAuthoringExtraction: async ({ run }) => {
      invalidationCalls.push(structuredClone(run))
      return { ...run, artifacts: {}, updatedAt: "2026-07-15T00:00:03.000Z" }
    },
    completeCurrentWorkflowStepAfterGuiAction: async (_commandDependencies, metadata) => {
      completionCalls.push(structuredClone(metadata))
      return true
    },
    ...overrides
  }
  return {
    dependencies,
    reportHostErrors,
    renderedModels,
    completionCalls,
    extractionCalls,
    persistenceCalls,
    scopeUpdateCalls,
    confirmationCalls,
    bindingCalls,
    invalidationCalls,
    createCalls,
    resumeCalls,
    calls
  }
}

async function startHost(fake, dependencyFixture, initial = {}) {
  const gui = loadRuleAuthoringGui(fake.vscode)
  assert.equal(typeof gui.openRuleAuthoringGui, "function")
  assert.equal(typeof gui.createRuleAuthoringGuiHost, "function")
  const host = gui.createRuleAuthoringGuiHost(dependencyFixture.dependencies)
  assert.equal(typeof host.openRuleAuthoringGui, "function")
  const context = { subscriptions: [], extensionUri: fileUri("/extension") }
  const resultPromise = host.openRuleAuthoringGui(context, {
    workspaceRoot: WORKSPACE_ROOT,
    configuredBobModelRoute: "Bob workflow configured model",
    ...initial
  })
  await turn()
  return { gui, context, resultPromise, panel: fake.panels.at(-1) }
}

function lastModel(fixture) {
  const rendered = fixture.renderedModels.at(-1)
  assert.ok(rendered, "the host should render a Webview model")
  return rendered.model
}

function assertNoPrivateSource(value) {
  const serialized = JSON.stringify(value)
  assert.doesNotMatch(serialized, /\/private\/acme/)
  assert.doesNotMatch(serialized, /\/workspace\/acme-project/)
  assert.doesNotMatch(serialized, /C:\\\\Users\\\\Alice/)
  assert.doesNotMatch(serialized, /file:\/\/\/private\/acme/)
  assert.doesNotMatch(serialized, /RAW PRIVATE POLICY/)
}

function assertReportedExactlyOnce(reportedHostErrors, originalError) {
  assert.equal(reportedHostErrors.length, 1)
  assert.equal(reportedHostErrors[0], originalError)
}

async function turn() {
  await new Promise((resolve) => setImmediate(resolve))
}

async function assertCompletesPromptly(operation, message, timeoutMs = 1_000) {
  let timeout
  try {
    await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
      })
    ])
  } finally {
    clearTimeout(timeout)
  }
}

async function temporaryWorkspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-gui-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}


module.exports={assert,fs,Module,os,path,test,GUI_MODULE,WORKSPACE_ROOT,PRIVATE_DOCX,PRIVATE_PDF,PRIVATE_RAW_TEXT,SAFE_HOST_ERROR_MESSAGE,SELECTED_ID,CHUNK_ID,MESSAGE_TYPES,PHASES,renderModel,ruleRun,successBatch,fileUri,createFakeVscode,loadRuleAuthoringGui,hostDependencies,startHost,lastModel,assertNoPrivateSource,assertReportedExactlyOnce,turn,assertCompletesPromptly,temporaryWorkspace,deferred};
