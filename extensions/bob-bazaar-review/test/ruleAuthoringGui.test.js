const assert = require("node:assert/strict")
const Module = require("node:module")
const path = require("node:path")
const { test } = require("node:test")

const GUI_MODULE = path.join(__dirname, "..", "out", "ui", "ruleAuthoringGui.js")
const WORKSPACE_ROOT = "/workspace/acme-project"
const PRIVATE_DOCX = "/private/acme/rule sources/engineering-policy.docx"
const PRIVATE_PDF = "/private/acme/rule sources/scanned-policy.pdf"
const PRIVATE_RAW_TEXT = "RAW PRIVATE POLICY: never render or post this text"
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
        sourceId: "selected-1",
        logicalName: "engineering <policy> & standards.docx",
        mediaType: "docx",
        byteSize: 42,
        extractionStatus: "success",
        warnings: []
      }
    ],
    chunks: [
      {
        chunkId: "chunk-1",
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
  const chunkId = options.chunkId ?? "chunk-1"
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
      dispose() {
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
      workspaceFolders: [{ uri: fileUri(WORKSPACE_ROOT), name: "acme-project", index: 0 }],
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
  const renderedModels = []
  const completionCalls = []
  const extractionCalls = []
  const persistenceCalls = []
  const createCalls = []
  const resumeCalls = []
  const calls = []
  const dependencies = {
    createNonce: () => "nonce-host-123",
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
    completeCurrentWorkflowStepAfterGuiAction: async (_commandDependencies, metadata) => {
      completionCalls.push(structuredClone(metadata))
      return true
    },
    ...overrides
  }
  return {
    dependencies,
    renderedModels,
    completionCalls,
    extractionCalls,
    persistenceCalls,
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

async function turn() {
  await new Promise((resolve) => setImmediate(resolve))
}

test("renders a nonce-bound escaped initial DOM without paths or raw source text", () => {
  const { renderRuleAuthoringGuiHtml } = require("../out/ui/ruleAuthoringGuiHtml")
  const html = renderRuleAuthoringGuiHtml(renderModel(), "nonce-rule-<123>")

  assert.match(html, /Content-Security-Policy/)
  assert.match(html, /default-src 'none'/)
  assert.match(html, /script-src 'nonce-nonce-rule-&lt;123&gt;'/)
  const scriptTags = html.match(/<script\b[^>]*>/gi) ?? []
  assert.ok(scriptTags.length > 0, "the Webview should have a nonce-bound controller script")
  for (const tag of scriptTags) assert.match(tag, /nonce="nonce-rule-&lt;123&gt;"/)
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i)

  assert.match(html, /acme &lt;workspace&gt;/)
  assert.match(html, /engineering &lt;policy&gt; &amp; standards\.docx/)
  assert.match(html, /team\/model &lt;primary&gt;/)
  assert.match(html, /selected[^<]*chunk|chunk[^<]*1/i)
  assert.match(html, /31[^<]*(?:byte|bytes|バイト)/i)
  assert.doesNotMatch(html, /<policy>/)
  assert.doesNotMatch(html, /<document>/)
  assert.doesNotMatch(html, /\/private\/acme/)
  assert.doesNotMatch(html, /C:\\Users\\Alice/)
  assert.doesNotMatch(html, /file:\/\/\/private\/acme/)
  assert.doesNotMatch(html, /RAW PRIVATE POLICY/)
})

test("disables AI consent for blocked or overflow scope and separates conversion from OCR guidance", async (t) => {
  const { renderRuleAuthoringGuiHtml } = require("../out/ui/ruleAuthoringGuiHtml")
  const legacyAndOcr = [
    {
      sourceId: "selected-doc",
      logicalName: "legacy.doc",
      mediaType: "doc",
      byteSize: 10,
      extractionStatus: "requires_conversion",
      warnings: ["conversion_required"]
    },
    {
      sourceId: "selected-pdf",
      logicalName: "scan.pdf",
      mediaType: "pdf",
      byteSize: 11,
      extractionStatus: "requires_ocr",
      warnings: ["ocr_required"]
    }
  ]

  await t.test("blocked source overrides an optimistic consent flag", () => {
    const html = renderRuleAuthoringGuiHtml(renderModel({
      sources: [...legacyAndOcr, {
        sourceId: "selected-blocked",
        logicalName: "broken.xlsx",
        mediaType: "xlsx",
        byteSize: 12,
        extractionStatus: "blocked",
        warnings: ["extraction_failed"]
      }],
      exclusionsApproved: false,
      canConfirmAiPayload: true
    }), "nonce-blocked")

    assert.match(html, /data-action="confirmAiPayload"[^>]*disabled/)
    assert.match(html, /legacy\.doc[\s\S]{0,500}(?:convert|conversion|変換)/i)
    assert.match(html, /scan\.pdf[\s\S]{0,500}OCR/i)
    assert.notEqual(html.indexOf("legacy.doc"), html.indexOf("scan.pdf"))
  })

  await t.test("scope overflow overrides an optimistic consent flag", () => {
    const html = renderRuleAuthoringGuiHtml(renderModel({
      scopeOverflow: true,
      canConfirmAiPayload: true,
      warnings: ["Selected evidence exceeds the 1 MiB limit"]
    }), "nonce-overflow")

    assert.match(html, /data-action="confirmAiPayload"[^>]*disabled/)
    assert.match(html, /(?:overflow|exceeds|上限|超過)/i)
  })
})

test("accepts only the seven run-local Webview message schemas", () => {
  const fake = createFakeVscode()
  const { RULE_AUTHORING_GUI_MESSAGE_TYPES, parseRuleAuthoringGuiMessage } = loadRuleAuthoringGui(fake.vscode)
  assert.deepEqual([...RULE_AUTHORING_GUI_MESSAGE_TYPES], MESSAGE_TYPES)

  const allowed = [
    { type: "chooseSources" },
    { type: "removeSource", sourceId: "selected-1" },
    { type: "extractSources" },
    { type: "setChunkIncluded", chunkId: "chunk-1", included: false },
    { type: "confirmAiPayload" },
    { type: "resumeRun", runId: "authoring-run-1" },
    { type: "cancelRun" }
  ]
  for (const message of allowed) assert.deepEqual(parseRuleAuthoringGuiMessage(message), message)

  for (const rejected of [
    { type: "executeCommand", command: "workbench.action.terminal.new" },
    { type: "chooseSources", absolutePath: PRIVATE_DOCX },
    { type: "removeSource", sourceId: PRIVATE_DOCX },
    { type: "setChunkIncluded", chunkId: "chunk-1", included: "yes" },
    { type: "confirmAiPayload", rawText: PRIVATE_RAW_TEXT },
    { type: "resumeRun", runId: "../other-run" },
    { type: "cancelRun", extra: true }
  ]) {
    assert.equal(parseRuleAuthoringGuiMessage(rejected), undefined)
  }
})

test("uses a file-only multi-select picker with current and legacy Office filters and treats picker cancel as a no-op", async () => {
  const fake = createFakeVscode({ pickerResults: [undefined] })
  const fixture = hostDependencies()
  const { resultPromise, panel } = await startHost(fake, fixture)
  assert.ok(panel, "the source wizard Webview should open")

  let settled = false
  void resultPromise.then(() => { settled = true })
  await panel.emitMessage({ type: "chooseSources" })

  assert.equal(fake.pickerCalls.length, 1)
  const picker = fake.pickerCalls[0]
  assert.equal(picker.canSelectMany, true)
  assert.equal(picker.canSelectFiles, true)
  assert.equal(picker.canSelectFolders, false)
  assert.deepEqual(
    [...new Set(Object.values(picker.filters).flat())].sort(),
    ["doc", "docx", "pdf", "xls", "xlsx"]
  )
  assert.equal(fixture.extractionCalls.length, 0)
  assert.equal(settled, false)

  await panel.emitMessage({ type: "cancelRun" })
  const result = await resultPromise
  assert.equal(result.status, "cancelled")
})

test("blocks file-count and aggregate-byte overflow before extraction", async (t) => {
  await t.test("more than 20 selected files", async () => {
    const selected = Array.from({ length: 21 }, (_, index) => fileUri(`/private/acme/rule sources/${index}.docx`))
    const fake = createFakeVscode({ pickerResults: [selected] })
    const fixture = hostDependencies()
    const { resultPromise, panel } = await startHost(fake, fixture)

    await panel.emitMessage({ type: "chooseSources" })

    assert.equal(fixture.extractionCalls.length, 0)
    assert.match(JSON.stringify(lastModel(fixture)), /(?:20|file_count|file.*limit|ファイル.*上限)/i)
    assert.equal(lastModel(fixture).canConfirmAiPayload, false)
    assertNoPrivateSource(fixture.renderedModels)
    assertNoPrivateSource(panel.posts)
    await panel.emitMessage({ type: "cancelRun" })
    await resultPromise
  })

  await t.test("selected bytes exceed 100 MiB in aggregate", async () => {
    const first = "/private/acme/rule sources/a.docx"
    const second = "/private/acme/rule sources/b.pdf"
    const fake = createFakeVscode({
      pickerResults: [[fileUri(first), fileUri(second)]],
      sourceSizes: [[first, 60 * 1024 * 1024], [second, 60 * 1024 * 1024]]
    })
    const fixture = hostDependencies()
    const { resultPromise, panel } = await startHost(fake, fixture)

    await panel.emitMessage({ type: "chooseSources" })

    assert.equal(fixture.extractionCalls.length, 0)
    assert.match(JSON.stringify(lastModel(fixture)), /(?:100|aggregate|total.*byte|合計.*上限)/i)
    assert.equal(lastModel(fixture).canConfirmAiPayload, false)
    assertNoPrivateSource(fixture.renderedModels)
    assertNoPrivateSource(panel.posts)
    await panel.emitMessage({ type: "cancelRun" })
    await resultPromise
  })
})

test("requires modal approval for duplicate and partial-source exclusions", async () => {
  const duplicatePath = "/private/acme/rule sources/duplicate.docx"
  const fake = createFakeVscode({
    pickerResults: [[fileUri(PRIVATE_DOCX), fileUri(duplicatePath), fileUri(PRIVATE_PDF)]],
    warningResponder: (call) => call.items[0]
  })
  const batch = successBatch()
  batch.documents.push({
    logicalName: "scanned-policy.pdf",
    mediaType: "pdf",
    byteSize: 17,
    sha256: "c".repeat(64),
    status: "blocked",
    warnings: ["pdftotext_missing"],
    extractor: { id: "pdftotext", version: "1" },
    chunks: [],
    shareable: false,
    localPath: PRIVATE_PDF
  })
  batch.localSourceMappings.push({
    logicalName: "scanned-policy.pdf",
    absolutePath: PRIVATE_PDF,
    sha256: "c".repeat(64),
    status: "blocked"
  })
  batch.duplicates.push({
    logical_name: "duplicate.docx",
    sha256: "a".repeat(64),
    reason: "duplicate_in_run",
    duplicate_of: "engineering-policy.docx"
  })
  const fixture = hostDependencies({ extractRuleDocuments: async () => batch })
  const { resultPromise, panel } = await startHost(fake, fixture)

  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })

  assert.equal(fake.warningCalls.length, 2)
  assert.ok(fake.warningCalls.every((call) => call.options.modal === true))
  assert.match(fake.warningCalls[0].message, /duplicate|重複/i)
  assert.match(fake.warningCalls[1].message, /blocked|failed|除外|抽出/i)
  assert.match(fake.warningCalls[0].message, /duplicate\.docx/)
  assert.match(fake.warningCalls[1].message, /scanned-policy\.pdf/)
  assert.equal(lastModel(fixture).exclusionsApproved, true)
  assertNoPrivateSource(fixture.renderedModels)
  assertNoPrivateSource(panel.posts)

  await panel.emitMessage({ type: "cancelRun" })
  await resultPromise
})

test("keeps consent disabled when partial-source exclusion is not approved", async () => {
  const fake = createFakeVscode({
    pickerResults: [[fileUri(PRIVATE_DOCX), fileUri(PRIVATE_PDF)]],
    warningResponder: () => undefined
  })
  const batch = successBatch()
  batch.documents.push({
    logicalName: "scanned-policy.pdf",
    mediaType: "pdf",
    byteSize: 17,
    sha256: "c".repeat(64),
    status: "requires_ocr",
    warnings: ["ocr_required"],
    extractor: { id: "pdftotext", version: "1" },
    chunks: [],
    shareable: false,
    localPath: PRIVATE_PDF
  })
  const fixture = hostDependencies({ extractRuleDocuments: async () => batch })
  const { resultPromise, panel } = await startHost(fake, fixture)

  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })

  assert.equal(fake.warningCalls.length, 1)
  assert.equal(fake.warningCalls[0].options.modal, true)
  assert.equal(lastModel(fixture).exclusionsApproved, false)
  assert.equal(lastModel(fixture).canConfirmAiPayload, false)
  assert.equal(fixture.completionCalls.length, 0)

  await panel.emitMessage({ type: "confirmAiPayload" })
  assert.equal(fixture.completionCalls.length, 0)
  await panel.emitMessage({ type: "cancelRun" })
  await resultPromise
})

test("checks incomplete apply transactions before listing or resuming authoring runs", async () => {
  const fake = createFakeVscode()
  const calls = []
  const fixture = hostDependencies({
    findIncompleteRuleApplyTransactions: async () => {
      calls.push("transactions")
      return [{ transaction_id: "transaction-1", run_id: "authoring-run-old", status: "applying" }]
    },
    listIncompleteRuleAuthoringRuns: async () => {
      calls.push("runs")
      return [ruleRun()]
    },
    createRuleAuthoringRun: async () => {
      calls.push("create")
      return ruleRun()
    }
  })
  const { resultPromise, panel } = await startHost(fake, fixture)
  const result = await resultPromise

  assert.deepEqual(calls, ["transactions"])
  assert.equal(panel, undefined)
  assert.equal(result.status, "recovery_required")
  assert.equal(result.transactionId, "transaction-1")
  assert.equal(fake.warningCalls.length, 1)
  assert.match(fake.warningCalls[0].message, /transaction|recovery|復旧|rollback/i)
})

test("offers incomplete runs after restart and resumes only the selected run ID", async () => {
  const incomplete = ruleRun({
    runId: "authoring-run-resume",
    currentPhase: "evidence_selection",
    updatedAt: "2026-07-15T01:00:00.000Z"
  })
  const fake = createFakeVscode()
  const fixture = hostDependencies({
    listIncompleteRuleAuthoringRuns: async () => [incomplete],
    createRuleAuthoringRun: async () => {
      throw new Error("a fresh run must not be created before the resume choice")
    },
    resumeRuleAuthoringRun: async (run) => {
      fixture.resumeCalls.push(structuredClone(run))
      const batch = successBatch()
      return {
        run,
        sources: batch.documents,
        chunks: batch.aiChunks,
        aiPayload: {
          logicalNames: ["engineering-policy.docx"],
          selectedChunkCount: 1,
          utf8Bytes: Buffer.byteLength(PRIVATE_RAW_TEXT)
        }
      }
    }
  })
  const { resultPromise, panel } = await startHost(fake, fixture)

  assert.match(JSON.stringify(lastModel(fixture)), /authoring-run-resume/)
  assertNoPrivateSource(fixture.renderedModels)
  await panel.emitMessage({ type: "resumeRun", runId: "authoring-run-resume" })

  assert.equal(fixture.resumeCalls.length, 1)
  assert.equal(fixture.resumeCalls[0].runId, "authoring-run-resume")
  assert.equal(lastModel(fixture).runId, "authoring-run-resume")
  assertNoPrivateSource(fixture.renderedModels)
  assertNoPrivateSource(panel.posts)
  await panel.emitMessage({ type: "cancelRun" })
  await resultPromise
})

test("holds workflow completion through extraction and completes with session metadata only after explicit AI consent", async () => {
  const fake = createFakeVscode({ pickerResults: [[fileUri(PRIVATE_DOCX)]] })
  const fixture = hostDependencies()
  const { resultPromise, panel } = await startHost(fake, fixture, {
    runId: "workflow-run-7",
    stepId: "select-and-extract"
  })
  let settled = false
  void resultPromise.then(() => { settled = true })

  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })

  assert.equal(fixture.extractionCalls.length, 1)
  assert.equal(fixture.extractionCalls[0][0].filePath, PRIVATE_DOCX)
  assert.equal(fixture.completionCalls.length, 0)
  assert.equal(settled, false)
  assertNoPrivateSource(fixture.renderedModels)
  assertNoPrivateSource(panel.posts)

  await panel.emitMessage({ type: "setChunkIncluded", chunkId: "chunk-1", included: true })
  assert.equal(fixture.completionCalls.length, 0)
  await panel.emitMessage({ type: "confirmAiPayload" })

  assert.deepEqual(fixture.completionCalls, [{
    runId: "workflow-run-7",
    stepId: "select-and-extract",
    stateUpdates: {
      authoringSession: JSON.stringify({ run_id: "authoring-run-1" })
    }
  }])
  const result = await resultPromise
  assert.equal(result.status, "confirmed")
  assert.deepEqual(result.authoringSession, { run_id: "authoring-run-1" })
  assertNoPrivateSource(result)
  assertNoPrivateSource(fixture.renderedModels)
  assertNoPrivateSource(panel.posts)
})
