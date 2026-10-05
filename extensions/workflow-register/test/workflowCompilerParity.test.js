const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const outRoot = path.resolve(__dirname, "..", "out")
let runtime

class RelativePattern {
  constructor(base, pattern) {
    this.base = typeof base === "string" ? base : base.fsPath
    this.pattern = pattern
  }
}

const vscode = {
  Uri: { file: fsPath => ({ fsPath }) },
  RelativePattern,
  workspace: {
    get workspaceFolders() {
      return runtime.workspaceFolders
    },
    getConfiguration: () => ({
      get: (key, fallback) => runtime.configuration[key] ?? fallback
    }),
    findFiles: async (pattern) => findWorkflowFiles(pattern),
    fs: {
      readFile: async (uri) => fsp.readFile(uri.fsPath)
    },
    asRelativePath: (uri) => relativeToWorkspace(uri.fsPath)
  },
  window: {
    get activeTextEditor() {
      return runtime.activeTextEditor
    },
    showErrorMessage: async () => undefined
  },
  commands: {
    executeCommand: async (...args) => {
      runtime.commandCalls.push(args)
      return undefined
    }
  },
  extensions: {
    getExtension: () => { runtime.bobGetExtensionCalls++;return ({
      id: "IBM.bob-code",
      isActive: true,
      packageJSON: { version: runtime.bobVersion ?? "2.0.1" },
      exports: {
        registerSource: () => {
          runtime.registerSourceCalls += 1
          return runtime.source
        }
      }
    }) }
  }
}

function requireWithVscode(relativePath) {
  const modulePath = path.join(outRoot, relativePath)
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

function resetRuntime(workspaceRoot, files) {
  runtime = {
    workspaceFolders: [{ name: path.basename(workspaceRoot), uri: { fsPath: workspaceRoot } }],
    files: files.map((fsPath) => ({ fsPath })),
    configuration: { sourceId: "workflow-register", sourceName: "Workflow Register" },
    commandCalls: [],
    registerSourceCalls: 0,
    bobGetExtensionCalls: 0,
    registeredWorkflows: [],
    activeTextEditor: undefined
  }
  runtime.source = {
    deactivate: () => undefined,
    log: () => undefined,
    registerWorkflow: (workflow) => {
      runtime.registeredWorkflows.push(workflow)
      return true
    }
  }
}

async function writeWorkflow(root, name, text) {
  const filePath = path.join(root, ".bob", "workflows", name, "WORKFLOW.md")
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  await fsp.writeFile(filePath, text, "utf8")
  return filePath
}

function findWorkflowFiles(pattern) {
  const roots = pattern instanceof RelativePattern
    ? [path.resolve(pattern.base)]
    : runtime.workspaceFolders.map((folder) => path.resolve(folder.uri.fsPath))
  return runtime.files.filter((file) => roots.some((root) => {
    const relative = path.relative(root, file.fsPath).replace(/\\/g, "/")
    const glob = pattern.pattern ?? ""
    if (glob.endsWith("current.json")) return /^\.bob\/workflows\/[^/]+\/current\.json$/.test(relative)
    if (glob.endsWith("workflow.yaml")) return /^\.bob\/workflows\/[^/]+\/versions\/[^/]+\/workflow\.yaml$/.test(relative)
    return /^\.bob\/workflows\/[^/]+\/WORKFLOW\.md$/.test(relative)
  }))
}

function relativeToWorkspace(filePath) {
  const root = runtime.workspaceFolders[0]?.uri.fsPath ?? ""
  return path.relative(root, filePath).replace(/\\/g, "/")
}

function runnerStub() {
  return {
    runSingleWorkflowStep: async () => true,
    runTodoStep: async () => true,
    runEngineStep: async () => true
  }
}

function workflowText(name, steps, extra = "") {
  return `---
schemaVersion: workflow-register/v1
name: ${name}
description: ${name} workflow.
${extra}${extra ? "\n" : ""}steps:
${steps}
---
# ${name}
`
}

const duplicateStepWorkflow = workflowText("duplicate-step", `  - id: analyze
    title: Analyze once
    type: manual
  - id: analyze
    title: Analyze twice
    type: manual`)

const validWorkflow = workflowText("valid-workflow", `  - id: collect
    title: Collect
    type: command
    action:
      provider: sample.collect
    resultKey: context
  - id: analyze
    title: Analyze
    type: agent
    prompt: Analyze the context.
    includeState:
      - context
    resultKey: analysis`)

const unknownStateWorkflow = workflowText("unknown-state", `  - id: analyze
    title: Analyze
    type: agent
    prompt: Analyze.
    includeState:
      - missingContext`)

const invalidBranchWorkflow = workflowText("invalid-branch", `  - id: collect
    title: Collect
    type: command
    action:
      provider: sample.collect
    resultKey: context
  - id: review
    title: Review
    type: manual
    transition:
      decisions:
        - id: retry
          when:
            stateKey: context.status
            equals: retry
          goto: missing-step`, `branching:
  enabled: true
  loops: []`)

const reservedResultKeyWorkflow = workflowText("reserved-result", `  - id: collect
    title: Collect
    type: command
    action:
      provider: sample.collect
    resultKey: workflow.approval.collect`)

const duplicateResultKeyWorkflow = workflowText("duplicate-result", `  - id: first
    title: First
    type: command
    action:
      provider: sample.first
    resultKey: shared
  - id: second
    title: Second
    type: command
    action:
      provider: sample.second
    resultKey: shared`)

const warningWorkflow = workflowText("warning-workflow", `  - id: review
    title: Review
    type: manual`, "unknownTopLevel: true")

const stableOrderingWorkflow = workflowText("stable-order", `  - id: duplicate
    title: First
    type: command
    action:
      provider: sample.first
    resultKey: workflow.reserved
  - id: duplicate
    title: Second
    type: agent
    prompt: Analyze.
    includeState:
      - missing`)

const legacyWorkflow = `---
name: legacy-workflow
description: Legacy workflow.
---
# Legacy workflow
`

test("registration rejects a schema-valid workflow with duplicate step ids before adaptation", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "workflow-compiler-registration-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const invalidPath = await writeWorkflow(root, "duplicate-step", duplicateStepWorkflow)
  resetRuntime(root, [invalidPath])

  const { validateWorkflowText } = require(path.join(outRoot, "core", "workflowValidator.js"))
  const validation = validateWorkflowText({
    sourceId: "workflow-register",
    filePath: ".bob/workflows/duplicate-step/WORKFLOW.md",
    text: duplicateStepWorkflow,
    strict: true
  })
  assert.equal(validation.ok, false)
  const semanticErrors = validation.diagnostics
    .filter((item) => item.severity === "error")
    .map((item) => item.message)
  assert.ok(semanticErrors.some((message) => message.includes("Duplicate step id 'analyze'")))

  const { loadWorkspaceWorkflows } = requireWithVscode("workflowDefinitionLoader.js")
  const loaded = await loadWorkspaceWorkflows("workflow-register")
  let runnerCreations = 0
  const { registerWorkflows } = requireWithVscode("workflowRegistrationService.js")
  const update = await registerWorkflows({
    createRunner: () => {
      runnerCreations += 1
      return runnerStub()
    }
  })
  const missingRegistrationDiagnostics = semanticErrors.filter(
    (message) => !update.result.lines.some((line) => line.includes(message))
  )

  assert.deepEqual({
    adaptedWorkflows: loaded.workflows.length,
    runnerCreations,
    registerSourceCalls: runtime.registerSourceCalls,
    registerWorkflowCalls: runtime.registeredWorkflows.length,
    missingRegistrationDiagnostics
  }, {
    adaptedWorkflows: 0,
    runnerCreations: 0,
    registerSourceCalls: 0,
    registerWorkflowCalls: 0,
    missingRegistrationDiagnostics: []
  })
})

test("Bob 2.1 registration loads a Markdown workflow and executes with its actual task capabilities", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "workflow-bob21-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = await writeWorkflow(root, "legacy-workflow", legacyWorkflow)
  resetRuntime(root, [file])
  runtime.bobVersion = "2.1.0"
  const { registerWorkflows } = requireWithVscode("workflowRegistrationService.js")
  let received
  const update = await registerWorkflows({ createRunner: () => ({
    ...runnerStub(), runSingleWorkflowStep: async (task) => { received = task; return true }
  }) })
  assert.equal(runtime.registeredWorkflows.length, 1, update.result.lines.join("\n"))
  assert.ok(update.result.lines.some((line) => line.includes("Bob extension version: 2.1.0")))
  assert.ok(update.result.lines.some((line) => line.includes(">=2.0.0 <3.0.0")))
  const task = { getAllMetadata() { return {} }, getMessages() { return [] }, sendMessage() {}, setStepComplete() {}, startSubagent() {} }
  assert.equal(await runtime.registeredWorkflows[0].getSteps()[0].execution(task), true)
  assert.equal(received, task)
})

test("unsupported Bob version diagnostics clear previous registration without registering a source", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "workflow-bob-version-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = await writeWorkflow(root, "legacy-workflow", legacyWorkflow)
  resetRuntime(root, [file])
  runtime.bobVersion = "3.0.0"
  let deactivated = 0
  const { registerWorkflows } = requireWithVscode("workflowRegistrationService.js")
  const update = await registerWorkflows({
    createRunner: runnerStub,
    previousSource: { deactivate() { deactivated += 1 }, log() {}, registerWorkflow() {} }
  })
  assert.equal(deactivated, 1)
  assert.equal(runtime.registerSourceCalls, 0)
  assert.equal(update.registeredIds.size, 0)
  assert.equal(update.registeredSource, undefined)
  assert.ok(runtime.commandCalls.some((call) => call[0] === "setContext" && call[1] === "bob-code.hasWorkflows" && call[2] === false))
  assert.ok(update.result.lines.some((line) => line.includes("Bob extension version: 3.0.0")))
  assert.ok(update.result.lines.some((line) => line.includes("Bob activation error:") && line.includes("version")))
})

test("mixed registration adapts and registers only valid workflow documents", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "workflow-compiler-mixed-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const validPath = await writeWorkflow(root, "valid-workflow", validWorkflow)
  const invalidPath = await writeWorkflow(root, "duplicate-step", duplicateStepWorkflow)
  resetRuntime(root, [validPath, invalidPath])

  const { loadWorkspaceWorkflows } = requireWithVscode("workflowDefinitionLoader.js")
  const loaded = await loadWorkspaceWorkflows("workflow-register")
  let runnerCreations = 0
  const { registerWorkflows } = requireWithVscode("workflowRegistrationService.js")
  await registerWorkflows({
    createRunner: () => {
      runnerCreations += 1
      return runnerStub()
    }
  })

  assert.deepEqual({
    loadedIds: loaded.workflows.map((workflow) => workflow.id),
    coreIds: loaded.coreWorkflows.map((workflow) => workflow.id),
    runnerCreations,
    registeredIds: runtime.registeredWorkflows.map((workflow) => workflow.getId())
  }, {
    loadedIds: ["workflow-register.valid-workflow"],
    coreIds: ["workflow-register.valid-workflow"],
    runnerCreations: 1,
    registeredIds: ["workflow-register.valid-workflow"]
  })
  assert.ok(loaded.diagnostics.some((line) => line.includes("Duplicate step id 'analyze'")))
})

test("workspace validation compiles the same nested marker-root document set as registration", async (t) => {
  const workspaceRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "workflow-compiler-nested-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const nestedRoot = path.join(workspaceRoot, "nested-repository")
  const validPath = await writeWorkflow(nestedRoot, "valid-workflow", validWorkflow)
  const invalidPath = await writeWorkflow(nestedRoot, "duplicate-step", duplicateStepWorkflow)
  resetRuntime(workspaceRoot, [validPath, invalidPath])

  const { discoverWorkspaceWorkflowFiles } = requireWithVscode("workflowDiscovery.js")
  const discovered = await discoverWorkspaceWorkflowFiles()
  const { loadWorkspaceWorkflows } = requireWithVscode("workflowDefinitionLoader.js")
  const loaded = await loadWorkspaceWorkflows("workflow-register")
  const reports = []
  const diagnosticsByFile = new Map()
  const diagnostics = {
    clear: () => diagnosticsByFile.clear(),
    set: (uri, result) => diagnosticsByFile.set(uri.fsPath, result)
  }
  const { compileWorkflowDocument } = require(path.join(outRoot, "core", "workflowCompiler.js"))
  const { validateTextDocument, validateWorkspaceWorkflows } = requireWithVscode(path.join("commands", "validateWorkflow.js"))
  await validateWorkspaceWorkflows({
    sourceId: "workflow-register",
    diagnostics,
    showMarkdownReport: async (title, summary, lines) => reports.push({ title, summary, lines })
  })

  assert.deepEqual(discovered.files.map((candidate) => candidate.file.fsPath).sort(), [invalidPath, validPath].sort())
  assert.deepEqual([...diagnosticsByFile.keys()].sort(), [invalidPath, validPath].sort())
  assert.deepEqual(diagnosticsByFile.get(invalidPath), compileWorkflowDocument({
    sourceId: "workflow-register",
    filePath: ".bob/workflows/duplicate-step/WORKFLOW.md",
    text: duplicateStepWorkflow,
    strict: true
  }))
  assert.deepEqual(diagnosticsByFile.get(validPath), compileWorkflowDocument({
    sourceId: "workflow-register",
    filePath: ".bob/workflows/valid-workflow/WORKFLOW.md",
    text: validWorkflow,
    strict: true
  }))
  assert.equal(reports[0].summary, "ワークフローファイル 2件、エラー 1件、警告 0件。")
  assert.deepEqual(loaded.workflows.map((workflow) => workflow.id), ["workflow-register.valid-workflow"])
  assert.ok(loaded.diagnostics.some((line) => line.includes("Duplicate step id 'analyze'")))

  const currentResult = validateTextDocument({
    uri: { fsPath: invalidPath },
    getText: () => duplicateStepWorkflow
  }, { sourceId: "workflow-register", diagnostics })
  assert.deepEqual(currentResult, compileWorkflowDocument({
    sourceId: "workflow-register",
    filePath: ".bob/workflows/duplicate-step/WORKFLOW.md",
    text: duplicateStepWorkflow
  }))
})

test("explicit current and workspace validation match strict registration diagnostics for warning-only workflows", async (t) => {
  const workspaceRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "workflow-compiler-strict-parity-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const warningPath = await writeWorkflow(workspaceRoot, "warning-workflow", warningWorkflow)
  resetRuntime(workspaceRoot, [warningPath])

  const document = {
    uri: { fsPath: warningPath },
    getText: () => warningWorkflow
  }
  runtime.activeTextEditor = { document }
  const currentReports = []
  const currentDiagnostics = new Map()
  const workspaceReports = []
  const workspaceDiagnostics = new Map()
  const { compileWorkflowDocument, formatWorkflowDiagnostics } = require(path.join(outRoot, "core", "workflowCompiler.js"))
  const {
    validateCurrentWorkflow,
    validateTextDocument,
    validateWorkspaceWorkflows
  } = requireWithVscode(path.join("commands", "validateWorkflow.js"))
  const expected = compileWorkflowDocument({
    sourceId: "workflow-register",
    filePath: ".bob/workflows/warning-workflow/WORKFLOW.md",
    text: warningWorkflow,
    strict: true
  })

  const currentResult = validateTextDocument(document, {
    sourceId: "workflow-register",
    diagnostics: {
      set: (uri, result) => currentDiagnostics.set(uri.fsPath, result)
    }
  })
  await validateCurrentWorkflow({
    sourceId: "workflow-register",
    diagnostics: {
      set: (uri, result) => currentDiagnostics.set(uri.fsPath, result)
    },
    showMarkdownReport: async (title, summary, lines) => currentReports.push({ title, summary, lines })
  })
  await validateWorkspaceWorkflows({
    sourceId: "workflow-register",
    diagnostics: {
      clear: () => workspaceDiagnostics.clear(),
      set: (uri, result) => workspaceDiagnostics.set(uri.fsPath, result)
    },
    showMarkdownReport: async (title, summary, lines) => workspaceReports.push({ title, summary, lines })
  })

  const { loadWorkspaceWorkflows } = requireWithVscode("workflowDefinitionLoader.js")
  const loaded = await loadWorkspaceWorkflows("workflow-register")
  const { registerWorkflows } = requireWithVscode("workflowRegistrationService.js")
  const registered = await registerWorkflows({ createRunner: runnerStub })
  const expectedLines = formatWorkflowDiagnostics(expected)

  assert.equal(expected.ok, false)
  assert.deepEqual(currentResult, expected)
  assert.deepEqual(currentDiagnostics.get(warningPath), expected)
  assert.deepEqual(workspaceDiagnostics.get(warningPath), expected)
  assert.deepEqual(currentReports, [{
    title: "現在のワークフローの検証",
    summary: "ワークフローファイル1件、エラー 1件、警告 0件。",
    lines: expectedLines
  }])
  assert.deepEqual(workspaceReports, [{
    title: "ワークスペースのワークフロー検証",
    summary: "ワークフローファイル 1件、エラー 1件、警告 0件。",
    lines: expectedLines
  }])
  assert.deepEqual(loaded.workflows, [])
  assert.deepEqual(loaded.coreWorkflows, [])
  assert.deepEqual(loaded.diagnostics.slice(-expectedLines.length), expectedLines)
  assert.deepEqual(registered.coreWorkflows, [])
  assert.deepEqual(registered.result.lines.slice(-expectedLines.length), expectedLines)
  assert.equal(runtime.registerSourceCalls, 0)
  assert.deepEqual(runtime.registeredWorkflows, [])
})

test("CI workflow contract paths include the canonical compiler source", () => {
  const ciWorkflow = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", ".github", "workflows", "workflow-contracts.yml"), "utf8")
  assert.equal(ciWorkflow.match(/extensions\/workflow-register\/src\/core\/workflowCompiler\.ts/g)?.length, 2)
})

test("formatted parser diagnostics include their file path exactly once", async (t) => {
  const { compileWorkflowDocument, formatWorkflowDiagnostics } = require(path.join(outRoot, "core", "workflowCompiler.js"))
  const filePath = ".bob/workflows/sample/WORKFLOW.md"
  const cases = [
    {
      name: "missing front matter",
      text: "not a workflow",
      severity: "error",
      message: "missing YAML front matter."
    },
    {
      name: "invalid YAML syntax",
      text: "---\nname: [\n---\n",
      severity: "error",
      messagePrefix: "invalid YAML:"
    },
    {
      name: "schema failure",
      text: "---\nschemaVersion: workflow-register/v1\ndescription: Missing name.\nsteps: []\n---\n",
      severity: "error",
      message: "/ must have required property 'name'."
    },
    {
      name: "parser warning",
      text: warningWorkflow,
      severity: "warning",
      message: "unknown top-level field 'unknownTopLevel'."
    },
    {
      name: "parser info",
      text: workflowText("sample", "  []"),
      severity: "info",
      message: "workflow-register.sample; schemaVersion=workflow-register/v1; steps=0"
    }
  ]

  for (const item of cases) {
    await t.test(item.name, () => {
      const result = compileWorkflowDocument({ sourceId: "workflow-register", filePath, text: item.text })
      const diagnostic = result.diagnostics.find((candidate) => candidate.severity === item.severity)
      assert.ok(diagnostic)
      if (item.message) assert.equal(diagnostic.message, item.message)
      if (item.messagePrefix) assert.ok(diagnostic.message.startsWith(item.messagePrefix))
      const formatted = formatWorkflowDiagnostics({ ...result, diagnostics: [diagnostic] })[0]
      assert.equal(countOccurrences(formatted, `${filePath}: `), 1, formatted)
    })
  }
})

test("parser diagnostic normalization preserves matching path text inside the message body", () => {
  const { compileWorkflowDocument, formatWorkflowDiagnostics } = require(path.join(outRoot, "core", "workflowCompiler.js"))
  const filePath = ".bob/workflows/sample/WORKFLOW.md"
  const embeddedPathWorkflow = workflowText("embedded-path", "  []", `"${filePath}: note": true`)
  const result = compileWorkflowDocument({ sourceId: "workflow-register", filePath, text: embeddedPathWorkflow })
  const warning = result.diagnostics.find((item) => item.severity === "warning")

  assert.ok(warning)
  assert.equal(warning.message, `unknown top-level field '${filePath}: note'.`)
  assert.equal(
    formatWorkflowDiagnostics({ ...result, diagnostics: [warning] })[0],
    `- warning: ${filePath}: unknown top-level field '${filePath}: note'.`
  )
})

test("workflow compiler owns parse, semantic, strict, catalog, and diagnostic parity", () => {
  const { compileWorkflowDocument } = require(path.join(outRoot, "core", "workflowCompiler.js"))
  const { parseWorkflowMarkdown } = require(path.join(outRoot, "core", "parser"))
  const { validateWorkflowText } = require(path.join(outRoot, "core", "workflowValidator.js"))
  const base = {
    sourceId: "workflow-register",
    filePath: ".bob/workflows/sample/WORKFLOW.md"
  }

  for (const [text, expectedMessage] of [
    [duplicateStepWorkflow, "Duplicate step id 'analyze'"],
    [unknownStateWorkflow, "includeState references unknown resultKey 'missingContext'"],
    [invalidBranchWorkflow, "goto references unknown step 'missing-step'"],
    [reservedResultKeyWorkflow, "uses the reserved workflow state namespace"],
    [duplicateResultKeyWorkflow, "resultKey 'shared' conflicts"]
  ]) {
    const result = compileWorkflowDocument({ ...base, text })
    assert.equal(result.ok, false)
    assert.ok(result.workflow, "schema-valid semantic failures retain their normalized workflow")
    assert.ok(result.diagnostics.some((item) => item.message.includes(expectedMessage)), expectedMessage)
    assert.deepEqual(validateWorkflowText({ ...base, text }), result)
  }

  const missingFrontMatter = compileWorkflowDocument({ ...base, text: "not a workflow" })
  const invalidSchema = compileWorkflowDocument({
    ...base,
    text: "---\nschemaVersion: workflow-register/v1\ndescription: Missing name.\nsteps: []\n---\n"
  })
  assert.equal(missingFrontMatter.ok, false)
  assert.equal(missingFrontMatter.workflow, undefined)
  assert.equal(invalidSchema.ok, false)
  assert.equal(invalidSchema.workflow, undefined)

  const relaxed = compileWorkflowDocument({ ...base, text: warningWorkflow })
  const strict = compileWorkflowDocument({ ...base, text: warningWorkflow, strict: true })
  assert.equal(relaxed.ok, true)
  assert.ok(relaxed.diagnostics.some((item) => item.severity === "warning"))
  assert.equal(strict.ok, false)
  assert.ok(strict.diagnostics.some((item) => item.severity === "error" && item.message.includes("unknown top-level field")))

  const catalogOptional = compileWorkflowDocument({ ...base, text: validWorkflow, strict: true })
  const catalogEnforced = compileWorkflowDocument({
    ...base,
    text: validWorkflow,
    strict: true,
    availableActionProviders: []
  })
  assert.equal(catalogOptional.ok, true)
  assert.equal(catalogEnforced.ok, false)
  assert.ok(catalogEnforced.diagnostics.some((item) => item.message.includes("unsupported action provider 'sample.collect'")))

  const ordered = compileWorkflowDocument({ ...base, text: stableOrderingWorkflow })
  const repeated = compileWorkflowDocument({ ...base, text: stableOrderingWorkflow })
  assert.deepEqual(repeated.diagnostics, ordered.diagnostics)
  assert.deepEqual(ordered.diagnostics, [...ordered.diagnostics].sort(compareDiagnostics))

  for (const text of [validWorkflow, legacyWorkflow]) {
    const parsed = parseWorkflowMarkdown({ ...base, text })
    const compiled = compileWorkflowDocument({ ...base, text })
    const withBom = compileWorkflowDocument({ ...base, text: `\uFEFF${text}` })
    assert.equal(parsed.ok, true, parsed.diagnostics.join("\n"))
    assert.equal(compiled.ok, true, compiled.diagnostics.map((item) => item.message).join("\n"))
    assert.equal(compiled.workflow.id, parsed.workflow.id)
    assert.equal(compiled.workflow.schemaVersion, parsed.workflow.schemaVersion)
    assert.equal(compiled.workflow.definitionHash, parsed.workflow.definitionHash)
    assert.equal(withBom.workflow.definitionHash, parsed.workflow.definitionHash)
  }
})

test("cross-document duplicate workflow ids remain qualified outside the document compiler", () => {
  const { compileWorkflowDocument } = require(path.join(outRoot, "core", "workflowCompiler.js"))
  const { qualifyDuplicateWorkflowIds } = requireWithVscode("workflowAdapter.js")
  const first = compileWorkflowDocument({
    sourceId: "workflow-register",
    filePath: ".bob/workflows/valid-workflow/WORKFLOW.md",
    text: validWorkflow
  }).workflow
  const second = compileWorkflowDocument({
    sourceId: "workflow-register",
    filePath: ".bob/workflows/valid-workflow/WORKFLOW.md",
    text: validWorkflow
  }).workflow
  first.workflowRoot = "C:/workspace/first"
  second.workflowRoot = "C:/workspace/second"
  const coreWorkflows = [first, second]

  qualifyDuplicateWorkflowIds([], coreWorkflows)

  assert.equal(coreWorkflows[0].logicalWorkflowId, "workflow-register.valid-workflow")
  assert.equal(coreWorkflows[1].logicalWorkflowId, "workflow-register.valid-workflow")
  assert.notEqual(coreWorkflows[0].id, coreWorkflows[1].id)
})

function compareDiagnostics(left, right) {
  const severity = { error: 0, warning: 1, info: 2 }
  return severity[left.severity] - severity[right.severity]
    || compareText(String(left.filePath ?? ""), String(right.filePath ?? ""))
    || compareText(left.message, right.message)
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function countOccurrences(value, search) {
  return value.split(search).length - 1
}

const {publishNodeFixture}=require('./workflowContractV2EntrypointTestSupport')
function shadowGateway(){
 const {ActionRegistry}=requireWithVscode('core/actionRegistry.js');const {WorkflowPlanStore}=require(path.join(outRoot,'core/contractV2'));const store=new WorkflowPlanStore();let acquired=0;
 const {createWorkflowContractV2ProductEntrypoint}=require(path.join(outRoot,'workflowContractV2Product'));
 const gateway=createWorkflowContractV2ProductEntrypoint({actionRegistry:new ActionRegistry(),planStore:{getOrCompile:input=>store.getOrCompile(input),acquire:input=>{acquired++;return store.acquire(input);},invalidate:(a,b)=>store.invalidateSlot(a,b)}});
 return {gateway,acquired:()=>acquired};
}
async function shadowWorkspace(t){const root=await fsp.mkdtemp(path.join(os.tmpdir(),'p6-shadow-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const collection=path.join(root,'.bob/workflows');const published=publishNodeFixture(collection);const pointer=path.join(collection,'minimal/current.json'),generation=path.join(collection,...published.published.base,'workflow.yaml');return {root,collection,pointer,generation};}
test('shadow-only registration displays compiled view without Bob activation, registration, runner or deactivation',async t=>{
 const f=await shadowWorkspace(t);resetRuntime(f.root,[f.pointer,f.generation]);const g=shadowGateway();let runners=0,deactivated=0;
 const {registerWorkflows}=requireWithVscode('workflowRegistrationService.js');const result=await registerWorkflows({contractV2:g.gateway,createRunner(){runners++;return runnerStub();},previousSource:{deactivate(){deactivated++;},log(){},registerWorkflow(){}}});
 assert.equal(result.coreWorkflows.length,1,result.result.lines.join('\n'));assert.equal(result.coreWorkflows[0].contractV2.schemaVersion,'workflow-contract-v2-view/v1');
 assert.equal(runtime.bobGetExtensionCalls,0);assert.equal(runtime.registerSourceCalls,0);assert.equal(runtime.registeredWorkflows.length,0);assert.equal(runners,0);assert.equal(deactivated,0);assert.equal(g.acquired(),0);
});
test('invalid or missing current pointer reserves its V2 slot and never falls back to its valid V1 document',async t=>{
 for(const kind of ['invalid','missing','gateway-missing']){
 const f=await shadowWorkspace(t),legacy=await writeWorkflow(f.root,'minimal',legacyWorkflow),other=await writeWorkflow(f.root,'other',legacyWorkflow.replace('legacy-workflow','other-workflow'));await fsp.writeFile(f.pointer,'{}');
 if(kind==='missing')await fsp.unlink(f.pointer);resetRuntime(f.root,[...(kind==='missing'?[]:[f.pointer]),f.generation,legacy,other]);const g=shadowGateway();
 const {loadWorkspaceWorkflows}=requireWithVscode('workflowDefinitionLoader.js');const result=await loadWorkspaceWorkflows('workflow-register',kind==='gateway-missing'?undefined:g.gateway);
 assert.equal(result.coreWorkflows.length,1,result.diagnostics.join('\n'));assert.equal(result.coreWorkflows[0].workflowFile,other);assert.ok(result.diagnostics.some(x=>/WF2_PACKAGE_LAYOUT_INVALID|gateway|current.json/.test(x)));assert.equal(g.acquired(),0);
 }
});
test('multi-root same-name V2 slots get separate valid collection identities',async t=>{
 const a=await shadowWorkspace(t),b=await shadowWorkspace(t);resetRuntime(a.root,[a.pointer,a.generation,b.pointer,b.generation]);runtime.workspaceFolders.push({name:'second',uri:{fsPath:b.root}});
 const {discoverWorkspaceWorkflowFiles}=requireWithVscode('workflowDiscovery.js');const result=await discoverWorkspaceWorkflowFiles();assert.equal(result.packages.length,2);assert.notEqual(result.packages[0].collectionId,result.packages[1].collectionId);assert.ok(result.packages.every(x=>/^collection-[a-f0-9]{64}$/.test(x.collectionId)));
});
test('V2 validation and registration report the same loader failure while V1 remains synchronous',async t=>{
 const f=await shadowWorkspace(t);await fsp.writeFile(f.pointer,'{}');resetRuntime(f.root,[f.pointer,f.generation]);const g=shadowGateway();
 const {loadWorkspaceWorkflows}=requireWithVscode('workflowDefinitionLoader.js'),commands=requireWithVscode('commands/validateWorkflow.js');const loaded=await loadWorkspaceWorkflows('workflow-register',g.gateway);let report;
 await commands.validateWorkspaceWorkflows({sourceId:'workflow-register',compileCurrentWorkflowPackage:input=>g.gateway.compileCurrent(input),showMarkdownReport:async(...args)=>{report=args;}});
 assert.ok(loaded.diagnostics.some(x=>x.includes('[WF2_PACKAGE_LAYOUT_INVALID]')));assert.ok(report[2].some(x=>x.includes('[WF2_PACKAGE_LAYOUT_INVALID]')));
 const result=commands.validateTextDocument({uri:{fsPath:path.join(f.root,'.bob/workflows/v1/WORKFLOW.md')},getText:()=>legacyWorkflow},{sourceId:'workflow-register'});assert.equal(typeof result.then,'undefined');assert.equal(result.ok,true);
});

test('V2 pointer reload keeps an unchanged V1 Bob registration and compiled view binding stays private',async t=>{
 const f=await shadowWorkspace(t),legacy=await writeWorkflow(f.root,'other',legacyWorkflow);resetRuntime(f.root,[f.pointer,f.generation,legacy]);const g=shadowGateway();let runners=0;
 const {registerWorkflows}=requireWithVscode('workflowRegistrationService.js');const first=await registerWorkflows({contractV2:g.gateway,createRunner(){runners++;return runnerStub();}});
 assert.equal(runtime.registeredWorkflows.length,1);assert.equal(runners,1);assert.equal(first.coreWorkflows.length,2);
 const second=await registerWorkflows({contractV2:g.gateway,previousSource:first.registeredSource,previousLegacyFingerprint:first.legacyFingerprint,createRunner(){runners++;return runnerStub();}});
 assert.equal(second.sourceChanged,false);assert.equal(runtime.registerSourceCalls,1);assert.equal(runners,1);
 const view=requireWithVscode('workflowContractV2View.js');const core=second.coreWorkflows.find(x=>x.contractV2);assert.equal(Object.isFrozen(core),true);assert.ok(view.workflowContractV2CoreBinding(core));assert.equal(Reflect.deleteProperty(core,'contractV2'),false);
 assert.throws(()=>view.workflowContractV2CoreBinding({...core}),/Unauthenticated/);
});

test('pure V1 explicit reload preserves source re-registration',async t=>{
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'p6-v1-reload-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=await writeWorkflow(root,'legacy',legacyWorkflow);resetRuntime(root,[file]);const {registerWorkflows}=requireWithVscode('workflowRegistrationService.js');const first=await registerWorkflows({createRunner:runnerStub});await registerWorkflows({createRunner:runnerStub,previousSource:first.registeredSource,previousLegacyFingerprint:first.legacyFingerprint});assert.equal(runtime.registerSourceCalls,2);assert.equal(runtime.registeredWorkflows.length,2);
});


test('mixed V1 registration retries a partial failure before caching an unchanged reload', async t => {
  const f = await shadowWorkspace(t)
  const firstFile = await writeWorkflow(f.root, 'first', legacyWorkflow)
  const secondFile = await writeWorkflow(f.root, 'second', legacyWorkflow.replace('legacy-workflow', 'second-workflow'))
  resetRuntime(f.root, [f.pointer, f.generation, firstFile, secondFile])
  const g = shadowGateway()
  const originalRegister = runtime.source.registerWorkflow
  let attempts = 0
  let failed = false
  runtime.source.registerWorkflow = workflow => {
    attempts += 1
    if (!failed) { failed = true; throw new Error('Transient Bob registration failure') }
    return originalRegister(workflow)
  }
  const { registerWorkflows } = requireWithVscode('workflowRegistrationService.js')
  const first = await registerWorkflows({ contractV2: g.gateway, createRunner: runnerStub })
  assert.equal(first.registeredIds.size, 1)
  const second = await registerWorkflows({ contractV2: g.gateway, createRunner: runnerStub,
    previousSource: first.registeredSource, previousLegacyFingerprint: first.legacyFingerprint })
  assert.equal(attempts, 4, 'An explicit reload must retry missing V1 registrations')
  assert.equal(second.registeredIds.size, 2)
  await registerWorkflows({ contractV2: g.gateway, createRunner: runnerStub,
    previousSource: second.registeredSource, previousLegacyFingerprint: second.legacyFingerprint })
  assert.equal(attempts, 4, 'A fully successful unchanged mixed registration should be retained')
  assert.equal(runtime.registerSourceCalls, 2)
  assert.equal(g.acquired(), 0)
})

test('file exclusions cannot hide V2 slot authority and enable same-slot V1 fallback', async t => {
  const originalFind = vscode.workspace.findFiles
  vscode.workspace.findFiles = async (pattern, exclude) => {
    const files = await originalFind(pattern)
    if (exclude === null) return files
    return files.filter(uri => uri.fsPath.endsWith('WORKFLOW.md'))
  }
  t.after(() => { vscode.workspace.findFiles = originalFind })
  for (const state of ['valid', 'invalid', 'missing']) {
    const f = await shadowWorkspace(t)
    const same = await writeWorkflow(f.root, 'minimal', legacyWorkflow)
    const other = await writeWorkflow(f.root, 'other', legacyWorkflow.replace('legacy-workflow', 'other-workflow'))
    if (state === 'invalid') await fsp.writeFile(f.pointer, '{}')
    if (state === 'missing') await fsp.unlink(f.pointer)
    resetRuntime(f.root, [same, other, f.generation, ...(state === 'missing' ? [] : [f.pointer])])
    const g = shadowGateway()
    const { registerWorkflows } = requireWithVscode('workflowRegistrationService.js')
    const result = await registerWorkflows({ contractV2: g.gateway, createRunner: runnerStub })
    assert.ok(result.coreWorkflows.every(workflow => workflow.workflowFile !== same), state)
    assert.equal(result.coreWorkflows.length, state === 'valid' ? 2 : 1, state)
    assert.equal(runtime.registeredWorkflows.length, 1, 'Only the separate V1 slot can register')
    assert.equal(runtime.registeredWorkflows[0].getId(), 'workflow-register.other-workflow')
    assert.equal(g.acquired(), 0)
  }
})

test('malformed V2 slot IDs are diagnosed per candidate while separate V1 remains usable', async t => {
  for (const route of ['loader', 'registration', 'workspace-validation', 'current-validation']) {
    await t.test(route, async t => {
      const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'p6-invalid-slot-'))
      t.after(() => fs.rmSync(root, { recursive: true, force: true }))
      const same = await writeWorkflow(root, '123', legacyWorkflow)
      const other = await writeWorkflow(root, 'other', legacyWorkflow.replace('legacy-workflow', 'other-workflow'))
      const pointer = path.join(root, '.bob/workflows/123/current.json')
      await fsp.writeFile(pointer, '{}')
      resetRuntime(root, [same, other, pointer])
      const g = shadowGateway()
      if (route === 'loader' || route === 'registration') {
        const module = requireWithVscode(route === 'loader' ? 'workflowDefinitionLoader.js' : 'workflowRegistrationService.js')
        const result = route === 'loader' ? await module.loadWorkspaceWorkflows('workflow-register', g.gateway)
          : await module.registerWorkflows({ contractV2: g.gateway, createRunner: runnerStub })
        assert.equal(result.coreWorkflows.length, 1)
        assert.equal(result.coreWorkflows[0].workflowFile, other)
        const lines = route === 'loader' ? result.diagnostics : result.result.lines
        assert.ok(lines.some(line => line.includes('WF2_PACKAGE_LAYOUT_INVALID')))
        if (route === 'registration') assert.equal(runtime.registeredWorkflows.length, 1)
      } else {
        const commands = requireWithVscode('commands/validateWorkflow.js')
        runtime.activeTextEditor = { document: { uri: { fsPath: pointer }, getText: () => '{}' } }
        let report
        const options = { sourceId: 'workflow-register', compileCurrentWorkflowPackage: input => g.gateway.compileCurrent(input),
          showMarkdownReport: async (...args) => { report = args } }
        await commands[route === 'workspace-validation' ? 'validateWorkspaceWorkflows' : 'validateCurrentWorkflow'](options)
        assert.ok(report[2].some(line => line.includes('WF2_PACKAGE_LAYOUT_INVALID')))
        if (route === 'workspace-validation') assert.match(report[1], /2件/)
      }
      assert.equal(g.acquired(), 0)
    })
  }
})


test('malformed V2 structural entries reserve their slot without a searchable workflow file', async t => {
  for (const layout of ['pointer-directory', 'incomplete-generation']) {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'p6-structural-slot-'))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const same = await writeWorkflow(root, 'minimal', legacyWorkflow)
    const other = await writeWorkflow(root, 'other', legacyWorkflow.replace('legacy-workflow', 'other-workflow'))
    const pointer = path.join(root, '.bob/workflows/minimal/current.json')
    if (layout === 'pointer-directory') await fsp.mkdir(pointer)
    else {
      const generation = path.join(root, '.bob/workflows/minimal/versions/incomplete')
      await fsp.mkdir(generation, { recursive: true })
      await fsp.writeFile(path.join(generation, 'workflow.lock.json'), '{}')
    }
    resetRuntime(root, [same, other])
    const g = shadowGateway()
    const { registerWorkflows } = requireWithVscode('workflowRegistrationService.js')
    const result = await registerWorkflows({ contractV2: g.gateway, createRunner: runnerStub })
    assert.deepEqual(result.coreWorkflows.map(workflow => workflow.workflowFile), [other], layout)
    assert.ok(result.result.lines.some(line => line.includes('WF2_PACKAGE_LAYOUT_INVALID')), layout)
    assert.equal(runtime.registeredWorkflows.length, 1)
    assert.equal(g.acquired(), 0)
  }
})
