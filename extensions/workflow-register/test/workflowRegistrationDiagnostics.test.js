const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

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
    get workspaceFolders() { return [{ name: "workspace", uri: { fsPath: runtime.root } }] },
    getConfiguration: () => ({ get: (_key, fallback) => fallback }),
    findFiles: async pattern => runtime.files.filter(file => {
      const relative = path.relative(pattern.base, file.fsPath).replace(/\\/g, "/")
      return pattern.pattern.endsWith("WORKFLOW.md") && /^\.bob\/workflows\/[^/]+\/WORKFLOW\.md$/.test(relative)
    }),
    fs: { readFile: uri => fsp.readFile(uri.fsPath) }
  },
  commands: { executeCommand: async (...args) => { runtime.commands.push(args) } },
  extensions: {
    getExtension: () => {
      runtime.bobApiLookups += 1
      return {
        id: "IBM.bob-code",
        isActive: true,
        packageJSON: { version: runtime.bobVersion },
        exports: { registerSource: () => {
          runtime.sourceRegistrations += 1
          return {
            deactivate() {},
            log() {},
            registerWorkflow: workflow => { runtime.registered.push(workflow.getId()) }
          }
        } }
      }
    }
  }
}

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "vscode") return vscode
  return originalLoad.call(this, request, parent, isMain)
}
let registerWorkflows
try {
  ;({ registerWorkflows } = require("../out/workflowRegistrationService.js"))
} finally {
  Module._load = originalLoad
}

async function workspace(t, definitions = {}) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "workflow-registration-diagnostics-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const files = []
  for (const [name, text] of Object.entries(definitions)) {
    const fsPath = path.join(root, ".bob", "workflows", name, "WORKFLOW.md")
    await fsp.mkdir(path.dirname(fsPath), { recursive: true })
    await fsp.writeFile(fsPath, text, "utf8")
    files.push({ fsPath })
  }
  runtime = { root, files, bobVersion: "2.2.3", bobApiLookups: 0, sourceRegistrations: 0, registered: [], commands: [] }
}

function workflow(name, agentOptions = "", topLevelOptions = "") {
  return `---
schemaVersion: workflow-register/v1
name: ${name}
description: Review workflow.
${topLevelOptions}steps:
  - id: collect
    title: Collect context
    type: command
    action:
      provider: sample.collect
    maxResultBytes: 20000
    resultKey: context
  - id: analyze
    title: Analyze context
    type: agent
    prompt: Preserve this custom review prompt.
    includeState:
      - context
${agentOptions}---
# Review
`
}

function createRunner() {
  return { runSingleWorkflowStep: async () => true, runTodoStep: async () => true, runEngineStep: async () => true }
}

test("all invalid V1 definitions report validation exclusion with file reasons before any Bob API lookup", async t => {
  await workspace(t, {
    obsolete: workflow("obsolete", "    maxResultBytes: 20000\n"),
    unknown: workflow("unknown", "", "unknownTopLevel: true\n")
  })
  let deactivated = 0
  const update = await registerWorkflows({
    createRunner: () => { assert.fail("Invalid definitions must not create runners") },
    previousSource: { deactivate() { deactivated += 1 }, log() {}, registerWorkflow() {} }
  })

  assert.match(update.result.summary, /検証.*除外/)
  const diagnostics = update.result.lines.join("\n")
  assert.match(diagnostics, /Bob registration API was not called.*validation/i)
  assert.match(diagnostics, /\.bob\/workflows\/obsolete\/WORKFLOW\.md:.*maxResultBytes/)
  assert.match(diagnostics, /\.bob\/workflows\/unknown\/WORKFLOW\.md:.*unknownTopLevel/)
  assert.equal(runtime.bobApiLookups, 0)
  assert.equal(runtime.sourceRegistrations, 0)
  assert.equal(deactivated, 1)
  assert.deepEqual(update.coreWorkflows, [])
  assert.deepEqual([...update.registeredIds], [])
  assert.equal(update.registeredSource, undefined)
  assert.ok(runtime.commands.some(args => args[0] === "setContext" && args[1] === "bob-code.hasWorkflows" && args[2] === false))
})

test("a workspace without definitions reports missing workflows without claiming validation failure", async t => {
  await workspace(t)
  const update = await registerWorkflows({ createRunner })

  assert.equal(update.result.summary, "No .bob workflows were found.")
  assert.doesNotMatch(update.result.lines.join("\n"), /validation|検証.*除外/i)
  assert.equal(runtime.bobApiLookups, 0)
  assert.deepEqual([...update.registeredIds], [])
})

test("a valid V1 workflow still registers with its command limit and custom agent prompt beside an invalid definition", async t => {
  await workspace(t, {
    custom: workflow("custom"),
    obsolete: workflow("obsolete", "    maxResultBytes: 20000\n")
  })
  const update = await registerWorkflows({ createRunner })

  assert.match(update.result.summary, /Registered 1 workflow/)
  assert.deepEqual(runtime.registered, ["workflow-register.custom"])
  assert.deepEqual([...update.registeredIds], ["workflow-register.custom"])
  assert.equal(update.coreWorkflows[0].engineSteps[0].maxResultBytes, 20000)
  assert.equal(update.coreWorkflows[0].engineSteps[1].prompt, "Preserve this custom review prompt.")
  assert.ok(runtime.commands.some(args => args[0] === "setContext" && args[1] === "bob-code.hasWorkflows" && args[2] === true))
})

test("a valid definition with an incompatible Bob API reports API failure separately from validation", async t => {
  await workspace(t, { custom: workflow("custom") })
  runtime.bobVersion = "3.0.0"
  const update = await registerWorkflows({ createRunner })

  assert.equal(update.result.summary, "Bob workflow registration API is unavailable or incompatible.")
  assert.match(update.result.lines.join("\n"), /Bob extension version: 3\.0\.0/)
  assert.doesNotMatch(update.result.lines.join("\n"), /Bob registration API was not called/)
  assert.equal(runtime.bobApiLookups, 1)
  assert.equal(runtime.sourceRegistrations, 0)
  assert.deepEqual([...update.registeredIds], [])
})
