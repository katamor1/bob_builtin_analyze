const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const GUI_MODULE = path.join(__dirname, "..", "out", "ui", "ruleAuthoringGui.js")
const WORKSPACE_ROOT = "/workspace/acme-project"
const PRIVATE_DOCX = "/private/acme/rule sources/engineering-policy.docx"
const PRIVATE_PDF = "/private/acme/rule sources/scanned-policy.pdf"
const PRIVATE_RAW_TEXT = "RAW PRIVATE POLICY: never render or post this text"
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

async function turn() {
  await new Promise((resolve) => setImmediate(resolve))
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
      sourceId: `selected-${"3".repeat(32)}`,
      logicalName: "legacy.doc",
      mediaType: "doc",
      byteSize: 10,
      extractionStatus: "requires_conversion",
      warnings: ["conversion_required"]
    },
    {
      sourceId: `selected-${"4".repeat(32)}`,
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
        sourceId: `selected-${"5".repeat(32)}`,
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
    { type: "removeSource", sourceId: SELECTED_ID },
    { type: "extractSources" },
    { type: "setChunkIncluded", chunkId: CHUNK_ID, included: false },
    { type: "confirmAiPayload" },
    { type: "resumeRun", runId: "authoring-run-1" },
    { type: "cancelRun" }
  ]
  for (const message of allowed) assert.deepEqual(parseRuleAuthoringGuiMessage(message), message)

  for (const rejected of [
    { type: "executeCommand", command: "workbench.action.terminal.new" },
    { type: "chooseSources", absolutePath: PRIVATE_DOCX },
    { type: "removeSource", sourceId: PRIVATE_DOCX },
    { type: "setChunkIncluded", chunkId: CHUNK_ID, included: "yes" },
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
  batch.localSourceMappings.push({
    logicalName: "duplicate.docx",
    absolutePath: duplicatePath,
    sha256: "a".repeat(64),
    status: "duplicate"
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

test("uses one sanitized logical name for exclusion notice, displayed scope, and canonical consent", async (t) => {
  const cases = [
    ["C:private.docx", "[REDACTED_PATH]"],
    ["api_key=supersecret.docx", "api_key=[REDACTED_SECRET]"]
  ]

  for (const [rawName, expectedName] of cases) {
    await t.test(rawName, async () => {
      const localPath = `/private/acme/rule sources/${rawName}`
      const batch = successBatch({ logicalName: rawName, localPath })
      batch.manifest.sources[0].extraction_status = "partial"
      batch.documents[0].status = "partial"
      batch.localSourceMappings[0].status = "partial"
      const fake = createFakeVscode({
        pickerResults: [[fileUri(localPath)]],
        warningResponder: (call) => call.items[0]
      })
      const fixture = hostDependencies({
        extractRuleDocuments: async () => batch,
        confirmRuleAuthoringScope: async (input) => {
          fixture.confirmationCalls.push(structuredClone(input))
          return {
            status: "confirmed",
            run: { ...input.run, updatedAt: "2026-07-15T00:00:02.000Z" },
            summary: structuredClone(input.expectedSummary)
          }
        }
      })
      const { resultPromise, panel } = await startHost(fake, fixture)

      await panel.emitMessage({ type: "chooseSources" })
      await panel.emitMessage({ type: "extractSources" })

      assert.equal(fake.warningCalls.length, 1)
      assert.equal(fake.warningCalls[0].message.includes(rawName), false)
      assert.equal(fake.warningCalls[0].message.includes(expectedName), true)
      assert.deepEqual(lastModel(fixture).aiPayload.logicalNames, [expectedName])

      await panel.emitMessage({ type: "confirmAiPayload" })
      assert.deepEqual(fixture.confirmationCalls[0].expectedSummary.logicalNames, [expectedName])
      assert.equal((await resultPromise).status, "confirmed")
    })
  }
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
  batch.localSourceMappings.push({
    logicalName: "scanned-policy.pdf",
    absolutePath: PRIVATE_PDF,
    sha256: "c".repeat(64),
    status: "requires_ocr"
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
    workflowRunId: undefined,
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

test("default resume adapter restores fresh and invalidated runs before choose and extract", async (t) => {
  const {
    createRuleAuthoringRun,
    readRuleAuthoringRun,
    writeRuleAuthoringRun
  } = require("../out/ruleAuthoring/ruleAuthoringRunStore")
  const { getRuleAuthoringPaths } = require("../out/ruleAuthoring/ruleAuthoringPaths")
  const { invalidateRuleAuthoringExtraction } = require("../out/ruleAuthoring/ruleAuthoringArtifactStore")

  for (const lifecycle of ["fresh", "invalidated"]) {
    await t.test(lifecycle, async (t) => {
      const root = await temporaryWorkspace(t)
      let run = await createRuleAuthoringRun({ workspaceRoot: root, runId: `${lifecycle}-restart` })
      if (lifecycle === "invalidated") {
        const paths = getRuleAuthoringPaths(root, run.runId)
        const generation = path.join(paths.generationsDirectory, `gen-${"1".repeat(32)}`)
        const withExtraction = {
          ...run,
          artifacts: {
            sourceManifest: path.relative(root, path.join(generation, "source-manifest.json")),
            documentChunks: path.relative(root, path.join(generation, "document-chunks.jsonl")),
            sourceScope: path.relative(root, path.join(generation, "source-scope.json"))
          },
          updatedAt: new Date(Date.parse(run.updatedAt) + 1).toISOString()
        }
        await writeRuleAuthoringRun(withExtraction, run.updatedAt)
        run = await invalidateRuleAuthoringExtraction({ run: withExtraction })
      }
      const restarted = await readRuleAuthoringRun(getRuleAuthoringPaths(root, run.runId))
      const selectedPath = path.join(root, "selected", "policy.docx")
      const fake = createFakeVscode({
        workspaceRoot: root,
        pickerResults: [[fileUri(selectedPath)]]
      })
      const fixture = hostDependencies({
        listIncompleteRuleAuthoringRuns: async () => [restarted]
      })
      delete fixture.dependencies.resumeRuleAuthoringRun
      const { resultPromise, panel } = await startHost(fake, fixture, { workspaceRoot: root })

      await panel.emitMessage({ type: "resumeRun", runId: restarted.runId })
      assert.deepEqual(lastModel(fixture).sources, [])
      assert.deepEqual(lastModel(fixture).chunks, [])
      await panel.emitMessage({ type: "chooseSources" })
      await panel.emitMessage({ type: "extractSources" })

      assert.equal(fixture.extractionCalls.length, 1)
      assert.equal(fixture.persistenceCalls.length, 1)
      await panel.emitMessage({ type: "cancelRun" })
      assert.equal((await resultPromise).status, "cancelled")
    })
  }
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

  await panel.emitMessage({ type: "setChunkIncluded", chunkId: CHUNK_ID, included: true })
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

test("keeps run IDs Unicode-compatible while source and chunk IDs retain strict ASCII/hash schemas", () => {
  const fake = createFakeVscode()
  const { parseRuleAuthoringGuiMessage } = loadRuleAuthoringGui(fake.vscode)

  assert.deepEqual(
    parseRuleAuthoringGuiMessage({ type: "resumeRun", runId: "規約 適用" }),
    { type: "resumeRun", runId: "規約 適用" }
  )
  assert.deepEqual(
    parseRuleAuthoringGuiMessage({ type: "removeSource", sourceId: SELECTED_ID }),
    { type: "removeSource", sourceId: SELECTED_ID }
  )
  assert.deepEqual(
    parseRuleAuthoringGuiMessage({ type: "setChunkIncluded", chunkId: CHUNK_ID, included: false }),
    { type: "setChunkIncluded", chunkId: CHUNK_ID, included: false }
  )

  for (const runId of ["規約\u0000適用", "規約\u007f適用", "規約\u0085適用", "規約\u009f適用"]) {
    assert.equal(parseRuleAuthoringGuiMessage({ type: "resumeRun", runId }), undefined)
  }
  for (const sourceId of ["selected-1", "規約", "src-not-a-hash", PRIVATE_DOCX]) {
    assert.equal(parseRuleAuthoringGuiMessage({ type: "removeSource", sourceId }), undefined)
  }
  for (const chunkId of ["chunk-1", "規約", `chunk-${"g".repeat(64)}`, PRIVATE_DOCX]) {
    assert.equal(parseRuleAuthoringGuiMessage({ type: "setChunkIncluded", chunkId, included: true }), undefined)
  }
})

test("redacts every remote-safe free-form renderer field while preserving public HTTP routes", () => {
  const { renderRuleAuthoringGuiHtml } = require("../out/ui/ruleAuthoringGuiHtml")
  const sensitive = [
    "/private/acme/model",
    "C:\\Users\\Alice\\model",
    "C:private\\model",
    "\\\\server\\share\\model",
    "\\\\?\\C:\\private\\model",
    "file:/private/acme/model",
    "file:///private/acme/model",
    "route?source=/private/acme/model"
  ]
  const html = renderRuleAuthoringGuiHtml(renderModel({
    environment: {
      workspaceName: sensitive[0],
      workspaceReady: true,
      bobExtensionAvailable: true,
      configuredBobModelRoute: "https://models.example/public?cache=/private/acme/model"
    },
    sources: [{
      sourceId: SELECTED_ID,
      logicalName: "policy.pdf",
      mediaType: "pdf",
      byteSize: 1,
      extractionStatus: sensitive[2],
      warnings: sensitive
    }],
    chunks: [{
      chunkId: CHUNK_ID,
      sourceId: `src-${"a".repeat(12)}`,
      title: sensitive[3],
      locator: sensitive[4],
      utf8Bytes: 1,
      included: true
    }],
    aiPayload: { logicalNames: ["policy.pdf"], selectedChunkCount: 1, utf8Bytes: 1 },
    warnings: sensitive,
    status: sensitive[7]
  }), "nonce-redaction")

  for (const value of sensitive) assert.equal(html.includes(value), false, `leaked ${value}`)
  assert.match(html, /https:\/\/models\.example\/public/)
  assert.match(html, /\[REDACTED_PATH\]/)
})

test("describes partial extraction as included chunks plus excluded unavailable portions", () => {
  const { renderRuleAuthoringGuiHtml } = require("../out/ui/ruleAuthoringGuiHtml")
  const html = renderRuleAuthoringGuiHtml(renderModel({
    sources: [
      {
        sourceId: SELECTED_ID,
        logicalName: "partial.pdf",
        mediaType: "pdf",
        byteSize: 10,
        extractionStatus: "partial",
        warnings: []
      },
      {
        sourceId: `selected-${"2".repeat(32)}`,
        logicalName: "blocked.pdf",
        mediaType: "pdf",
        byteSize: 11,
        extractionStatus: "blocked",
        warnings: []
      }
    ]
  }), "nonce-partial")

  assert.match(html, /partial\.pdf[\s\S]{0,600}extracted chunks remain included[\s\S]{0,300}(?:unavailable|failed) portions are excluded/i)
  assert.match(html, /blocked\.pdf[\s\S]{0,500}(?:fully excluded|must be excluded)/i)
})

test("rejects a partial workflow identity pair before run creation or Webview opening", async (t) => {
  for (const initial of [{ runId: "workflow-only" }, { stepId: "step-only" }]) {
    await t.test(Object.keys(initial)[0], async () => {
      const fake = createFakeVscode()
      const fixture = hostDependencies()
      const { resultPromise, panel } = await startHost(fake, fixture, initial)
      if (panel) await panel.emitMessage({ type: "cancelRun" })
      const result = await resultPromise

      assert.equal(result.status, "cancelled")
      assert.equal(panel, undefined)
      assert.equal(fixture.calls.length, 0)
      assert.equal(fixture.createCalls.length, 0)
    })
  }
})

test("rejects an explicit authoring root that is not an open local workspace", async () => {
  const fake = createFakeVscode()
  const fixture = hostDependencies()
  const { resultPromise, panel } = await startHost(fake, fixture, {
    workspaceRoot: "/outside/not-open"
  })
  if (panel) await panel.emitMessage({ type: "cancelRun" })
  const result = await resultPromise

  assert.equal(result.status, "cancelled")
  assert.equal(panel, undefined)
  assert.equal(fixture.calls.length, 0)
  assert.equal(fixture.createCalls.length, 0)
})

test("standalone confirmation persists consent without unscoped workflow completion", async () => {
  const fake = createFakeVscode({ pickerResults: [[fileUri(PRIVATE_DOCX)]] })
  const fixture = hostDependencies()
  const { resultPromise, panel } = await startHost(fake, fixture)

  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })
  await panel.emitMessage({ type: "confirmAiPayload" })

  const result = await resultPromise
  assert.equal(result.status, "confirmed")
  assert.equal(fixture.confirmationCalls.length, 1)
  assert.equal(fixture.completionCalls.length, 0)
})

test("filters resumable runs by mode and binds an unbound run only after its explicit workflow resume click", async () => {
  const unbound = ruleRun({ runId: "未割当 規約", workflowRunId: undefined })
  const sameWorkflow = ruleRun({ runId: "同一 規約", workflowRunId: "実行 七" })
  const otherWorkflow = ruleRun({ runId: "別 規約", workflowRunId: "実行 八" })
  const fake = createFakeVscode()
  const fixture = hostDependencies({
    listIncompleteRuleAuthoringRuns: async () => [unbound, sameWorkflow, otherWorkflow],
    resumeRuleAuthoringRun: async (run) => {
      fixture.resumeCalls.push(structuredClone(run))
      return { run, sources: [], chunks: [] }
    }
  })
  const { resultPromise, panel } = await startHost(fake, fixture, {
    runId: "実行 七",
    stepId: "資料 選択"
  })

  const initialModel = lastModel(fixture)
  assert.deepEqual(initialModel.resumableRuns.map((run) => run.runId), ["未割当 規約", "同一 規約"])
  assert.doesNotMatch(JSON.stringify(initialModel), /別 規約/)
  assert.equal(fixture.bindingCalls.length, 0)

  await panel.emitMessage({ type: "resumeRun", runId: "未割当 規約" })
  assert.equal(fixture.bindingCalls.length, 1)
  assert.equal(fixture.bindingCalls[0].workflowRunId, "実行 七")
  assert.equal(fixture.resumeCalls.length, 1)
  assert.equal(fixture.resumeCalls[0].workflowRunId, "実行 七")

  await panel.emitMessage({ type: "cancelRun" })
  await resultPromise

  const standaloneFake = createFakeVscode()
  const standaloneFixture = hostDependencies({
    listIncompleteRuleAuthoringRuns: async () => [unbound, sameWorkflow, otherWorkflow]
  })
  const standalone = await startHost(standaloneFake, standaloneFixture)
  assert.deepEqual(lastModel(standaloneFixture).resumableRuns.map((run) => run.runId), ["未割当 規約"])
  await standalone.panel.emitMessage({ type: "cancelRun" })
  await standalone.resultPromise
})

test("durably updates chunk inclusion before rendering the new scope", async () => {
  const fake = createFakeVscode({ pickerResults: [[fileUri(PRIVATE_DOCX)]] })
  const fixture = hostDependencies()
  const { resultPromise, panel } = await startHost(fake, fixture)
  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })

  await panel.emitMessage({ type: "setChunkIncluded", chunkId: CHUNK_ID, included: false })

  assert.equal(fixture.scopeUpdateCalls.length, 1)
  assert.equal(fixture.scopeUpdateCalls[0].chunkId, CHUNK_ID)
  assert.equal(fixture.scopeUpdateCalls[0].included, false)
  assert.equal(lastModel(fixture).chunks[0].included, false)
  await panel.emitMessage({ type: "cancelRun" })
  await resultPromise
})

test("serializes rapid confirmation messages and completes the workflow at most once", async () => {
  const completion = deferred()
  const fake = createFakeVscode({ pickerResults: [[fileUri(PRIVATE_DOCX)]] })
  const fixture = hostDependencies({
    completeCurrentWorkflowStepAfterGuiAction: async (_deps, metadata) => {
      fixture.completionCalls.push(structuredClone(metadata))
      return completion.promise
    }
  })
  const { resultPromise, panel } = await startHost(fake, fixture, {
    runId: "workflow-double",
    stepId: "select-and-extract"
  })
  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })

  panel.emitMessageWithoutWaiting({ type: "confirmAiPayload" })
  panel.emitMessageWithoutWaiting({ type: "confirmAiPayload" })
  await turn()
  await turn()
  assert.equal(fixture.confirmationCalls.length, 1)
  assert.equal(fixture.completionCalls.length, 1)

  completion.resolve(true)
  const result = await resultPromise
  assert.equal(result.status, "confirmed")
  assert.equal(fixture.completionCalls.length, 1)
})

test("disposal invalidates unfinished extraction before persistence", async () => {
  const extraction = deferred()
  const fake = createFakeVscode({ pickerResults: [[fileUri(PRIVATE_DOCX)]] })
  const fixture = hostDependencies({
    extractRuleDocuments: async () => extraction.promise
  })
  const { resultPromise, panel } = await startHost(fake, fixture)
  await panel.emitMessage({ type: "chooseSources" })

  panel.emitMessageWithoutWaiting({ type: "extractSources" })
  await turn()
  panel.dispose()
  extraction.resolve(successBatch())
  const result = await resultPromise
  await turn()

  assert.equal(result.status, "cancelled")
  assert.equal(fixture.persistenceCalls.length, 0)
})

test("disposal during external completion waits for its outcome instead of reporting cancellation", async () => {
  const completion = deferred()
  const fake = createFakeVscode({ pickerResults: [[fileUri(PRIVATE_DOCX)]] })
  const fixture = hostDependencies({
    completeCurrentWorkflowStepAfterGuiAction: async (_deps, metadata) => {
      fixture.completionCalls.push(structuredClone(metadata))
      return completion.promise
    }
  })
  const { resultPromise, panel } = await startHost(fake, fixture, {
    runId: "workflow-dispose",
    stepId: "select-and-extract"
  })
  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })
  panel.emitMessageWithoutWaiting({ type: "confirmAiPayload" })
  await turn()
  await turn()
  panel.dispose()

  let settled = false
  void resultPromise.then(() => { settled = true })
  await turn()
  assert.equal(settled, false)
  completion.resolve(true)
  assert.equal((await resultPromise).status, "confirmed")
})

test("disposal while canonical confirmation is pending prevents workflow completion from starting", async () => {
  const confirmation = deferred()
  const fake = createFakeVscode({ pickerResults: [[fileUri(PRIVATE_DOCX)]] })
  const fixture = hostDependencies({
    confirmRuleAuthoringScope: async (input) => {
      fixture.confirmationCalls.push(structuredClone(input))
      return confirmation.promise
    }
  })
  const { resultPromise, panel } = await startHost(fake, fixture, {
    runId: "workflow-confirm-dispose",
    stepId: "select-and-extract"
  })
  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })
  panel.emitMessageWithoutWaiting({ type: "confirmAiPayload" })
  await turn()
  assert.equal(fixture.confirmationCalls.length, 1)

  panel.dispose()
  confirmation.resolve({
    status: "confirmed",
    run: ruleRun({ currentPhase: "evidence_selection" }),
    summary: {
      logicalNames: ["engineering-policy.docx"],
      selectedChunkCount: 1,
      utf8Bytes: Buffer.byteLength(PRIVATE_RAW_TEXT, "utf8")
    }
  })

  assert.equal((await resultPromise).status, "cancelled")
  await turn()
  assert.equal(fixture.completionCalls.length, 0)
})

test("exact cancelRun preempts a pending canonical confirmation before workflow completion", async () => {
  const confirmation = deferred()
  const fake = createFakeVscode({
    pickerResults: [[fileUri(PRIVATE_DOCX)]],
    deferDisposeCallbacks: true
  })
  const fixture = hostDependencies({
    confirmRuleAuthoringScope: async (input) => {
      fixture.confirmationCalls.push(structuredClone(input))
      return confirmation.promise
    }
  })
  const { resultPromise, panel } = await startHost(fake, fixture, {
    runId: "workflow-priority-cancel",
    stepId: "select-and-extract"
  })
  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })
  panel.emitMessageWithoutWaiting({ type: "confirmAiPayload" })
  await turn()
  assert.equal(fixture.confirmationCalls.length, 1)

  let result
  void resultPromise.then((value) => { result = value })
  panel.emitMessageWithoutWaiting({ type: "cancelRun" })
  await turn()
  const cancelledBeforeConfirmationSettled = result?.status === "cancelled"

  confirmation.resolve({
    status: "confirmed",
    run: ruleRun({ currentPhase: "evidence_selection" }),
    summary: {
      logicalNames: ["engineering-policy.docx"],
      selectedChunkCount: 1,
      utf8Bytes: Buffer.byteLength(PRIVATE_RAW_TEXT, "utf8")
    }
  })
  await turn()
  const completionStartedBeforeDisposeDelivery = fixture.completionCalls.length > 0
  panel.flushDisposeCallbacks()
  const finalResult = await resultPromise
  await turn()

  assert.equal(cancelledBeforeConfirmationSettled, true)
  assert.equal(completionStartedBeforeDisposeDelivery, false)
  assert.equal(finalResult.status, "cancelled")
  assert.equal(fixture.completionCalls.length, 0)
})

test("exact cancelRun waits for an external workflow completion that already started", async () => {
  const completion = deferred()
  const fake = createFakeVscode({ pickerResults: [[fileUri(PRIVATE_DOCX)]] })
  const fixture = hostDependencies({
    completeCurrentWorkflowStepAfterGuiAction: async (_deps, metadata) => {
      fixture.completionCalls.push(structuredClone(metadata))
      return completion.promise
    }
  })
  const { resultPromise, panel } = await startHost(fake, fixture, {
    runId: "workflow-cancel-after-completion",
    stepId: "select-and-extract"
  })
  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })
  panel.emitMessageWithoutWaiting({ type: "confirmAiPayload" })
  await turn()
  await turn()
  assert.equal(fixture.completionCalls.length, 1)

  panel.emitMessageWithoutWaiting({ type: "cancelRun" })
  let settled = false
  void resultPromise.then(() => { settled = true })
  await turn()
  assert.equal(settled, false)

  completion.resolve(true)
  assert.equal((await resultPromise).status, "confirmed")
})

test("canonical confirmation overflow leaves the panel open and does not complete the workflow", async () => {
  const fake = createFakeVscode({ pickerResults: [[fileUri(PRIVATE_DOCX)]] })
  const fixture = hostDependencies({
    confirmRuleAuthoringScope: async ({ run }) => {
      fixture.confirmationCalls.push(structuredClone(run))
      return { status: "overflow", run }
    }
  })
  const { resultPromise, panel } = await startHost(fake, fixture, {
    runId: "workflow-overflow",
    stepId: "select-and-extract"
  })
  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })
  await panel.emitMessage({ type: "confirmAiPayload" })

  let settled = false
  void resultPromise.then(() => { settled = true })
  await turn()
  assert.equal(settled, false)
  assert.equal(fixture.completionCalls.length, 0)
  assert.equal(lastModel(fixture).canConfirmAiPayload, false)
  assert.match(lastModel(fixture).status, /index|1 MiB|deselect|scope/i)
  await panel.emitMessage({ type: "cancelRun" })
  await resultPromise
})

test("a canonical confirmation summary mismatch never completes or settles the workflow", async () => {
  const fake = createFakeVscode({ pickerResults: [[fileUri(PRIVATE_DOCX)]] })
  const fixture = hostDependencies({
    confirmRuleAuthoringScope: async (input) => {
      fixture.confirmationCalls.push(structuredClone(input))
      return {
        status: "confirmed",
        run: { ...input.run, updatedAt: "2026-07-15T00:00:04.000Z" },
        summary: {
          logicalNames: ["different-policy.pdf"],
          selectedChunkCount: 2,
          utf8Bytes: 999
        }
      }
    }
  })
  const { resultPromise, panel } = await startHost(fake, fixture, {
    runId: "workflow-summary-mismatch",
    stepId: "select-and-extract"
  })
  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })
  await panel.emitMessage({ type: "confirmAiPayload" })

  let settled = false
  void resultPromise.then(() => { settled = true })
  await turn()
  assert.equal(settled, false)
  assert.equal(fixture.completionCalls.length, 0)
  assert.equal(lastModel(fixture).canConfirmAiPayload, false)
  assert.match(lastModel(fixture).status, /canonical|displayed|match|scope/i)

  await panel.emitMessage({ type: "cancelRun" })
  await resultPromise
})

test("source changes durably invalidate old extraction references", async () => {
  const replacement = "/private/acme/rule sources/replacement.docx"
  const fake = createFakeVscode({
    pickerResults: [[fileUri(PRIVATE_DOCX)], [fileUri(replacement)]]
  })
  const fixture = hostDependencies()
  const { resultPromise, panel } = await startHost(fake, fixture)
  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })
  await panel.emitMessage({ type: "chooseSources" })

  assert.equal(fixture.invalidationCalls.length, 1)
  assert.equal(lastModel(fixture).chunks.length, 0)
  assert.equal(lastModel(fixture).canConfirmAiPayload, false)
  await panel.emitMessage({ type: "cancelRun" })
  await resultPromise
})

test("source changes invalidate a persisted extraction even when it produced no chunks", async () => {
  const replacement = "/private/acme/rule sources/empty-replacement.docx"
  const emptyBatch = successBatch()
  emptyBatch.documents[0].chunks = []
  emptyBatch.aiChunks = []
  const fake = createFakeVscode({
    pickerResults: [[fileUri(PRIVATE_DOCX)], [fileUri(replacement)]]
  })
  const fixture = hostDependencies({ extractRuleDocuments: async () => emptyBatch })
  const { resultPromise, panel } = await startHost(fake, fixture)
  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })
  assert.equal(lastModel(fixture).chunks.length, 0)

  await panel.emitMessage({ type: "chooseSources" })

  assert.equal(fixture.invalidationCalls.length, 1)
  await panel.emitMessage({ type: "cancelRun" })
  await resultPromise
})

test("maps same-basename extraction outcomes by full selected path", async () => {
  const firstPath = "/private/acme/one/policy.pdf"
  const secondPath = "/private/acme/two/policy.pdf"
  const batch = successBatch({ logicalName: "policy.pdf", localPath: firstPath })
  batch.documents.push({
    logicalName: "policy.pdf",
    mediaType: "pdf",
    byteSize: 42,
    sha256: "d".repeat(64),
    status: "blocked",
    warnings: ["pdf.extraction_blocked"],
    extractor: { id: "fixture", version: "1" },
    chunks: [],
    shareable: false,
    localPath: secondPath
  })
  batch.localSourceMappings.push({
    logicalName: "policy.pdf",
    absolutePath: secondPath,
    sha256: "d".repeat(64),
    status: "blocked"
  })
  const fake = createFakeVscode({
    pickerResults: [[fileUri(firstPath), fileUri(secondPath)]],
    warningResponder: (call) => call.items[0]
  })
  const fixture = hostDependencies({ extractRuleDocuments: async () => batch })
  const { resultPromise, panel } = await startHost(fake, fixture)
  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })

  assert.deepEqual(lastModel(fixture).sources.map((source) => source.extractionStatus), ["success", "blocked"])
  assert.notEqual(lastModel(fixture).sources[0].sourceId, lastModel(fixture).sources[1].sourceId)
  await panel.emitMessage({ type: "cancelRun" })
  await resultPromise
})

test("keeps duplicate logical names in the displayed summary when distinct sources contribute chunks", async () => {
  const firstPath = "/private/acme/one/policy.docx"
  const secondPath = "/private/acme/two/policy.docx"
  const batch = successBatch({ logicalName: "policy.docx", localPath: firstPath })
  const secondSourceId = `src-${"d".repeat(12)}`
  const secondChunk = {
    ...batch.aiChunks[0],
    chunk_id: `chunk-${"e".repeat(64)}`,
    source_id: secondSourceId,
    text: "second policy text",
    text_sha256: "f".repeat(64)
  }
  batch.manifest.sources.push({
    ...batch.manifest.sources[0],
    source_id: secondSourceId,
    sha256: "d".repeat(64)
  })
  batch.documents.push({
    ...batch.documents[0],
    sha256: "d".repeat(64),
    chunks: [secondChunk],
    localPath: secondPath
  })
  batch.aiChunks.push(secondChunk)
  batch.localSourceMappings.push({
    logicalName: "policy.docx",
    absolutePath: secondPath,
    sha256: "d".repeat(64),
    status: "success"
  })
  const fake = createFakeVscode({
    pickerResults: [[fileUri(firstPath), fileUri(secondPath)]]
  })
  const fixture = hostDependencies({ extractRuleDocuments: async () => batch })
  const { resultPromise, panel } = await startHost(fake, fixture)
  await panel.emitMessage({ type: "chooseSources" })
  await panel.emitMessage({ type: "extractSources" })

  assert.deepEqual(lastModel(fixture).aiPayload.logicalNames, ["policy.docx", "policy.docx"])
  await panel.emitMessage({ type: "cancelRun" })
  await resultPromise
})

test("resume restores persisted exclusion approval without prompting again", async () => {
  const incomplete = ruleRun({
    runId: "approval-resume",
    workflowRunId: undefined,
    currentPhase: "evidence_selection"
  })
  const fake = createFakeVscode()
  const fixture = hostDependencies({
    listIncompleteRuleAuthoringRuns: async () => [incomplete],
    resumeRuleAuthoringRun: async (run) => ({
      run,
      sources: [{
        selectedId: SELECTED_ID,
        logicalName: "blocked.pdf",
        mediaType: "pdf",
        byteSize: 10,
        extractionStatus: "blocked",
        warnings: [],
        exclusionApproved: true
      }],
      chunks: [successBatch().aiChunks[0]],
      includedChunkIds: [CHUNK_ID]
    })
  })
  const { resultPromise, panel } = await startHost(fake, fixture)
  await panel.emitMessage({ type: "resumeRun", runId: "approval-resume" })

  assert.equal(fake.warningCalls.length, 0)
  assert.equal(lastModel(fixture).exclusionsApproved, true)
  await panel.emitMessage({ type: "cancelRun" })
  await resultPromise
})

test("preserves Unicode recovery transaction IDs in the public result", async () => {
  const fake = createFakeVscode()
  const fixture = hostDependencies({
    findIncompleteRuleApplyTransactions: async () => [{ transaction_id: "復旧 取引" }]
  })
  const { resultPromise } = await startHost(fake, fixture)
  assert.deepEqual(await resultPromise, { status: "recovery_required", transactionId: "復旧 取引" })
})
