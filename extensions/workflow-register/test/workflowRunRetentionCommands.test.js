const assert = require("node:assert/strict")
const fs = require("node:fs")
const Module = require("node:module")
const path = require("node:path")
const { test } = require("node:test")
const { readSrc } = require("./helpers/sourceReader")

const root = path.resolve(__dirname, "..")
const commandIds = [
  "workflowRegister.inspectRunStorage",
  "workflowRegister.previewRunCleanup",
  "workflowRegister.cleanupCompletedRuns",
  "workflowRegister.deleteSelectedRuns",
  "workflowRegister.pinRun",
  "workflowRegister.unpinRun"
]

test("retention command adapter exposes preview-first explicit operations without automatic scheduling", () => {
  const source = readSrc("commands", "runRetention.ts")
  assert.match(source, /export async function inspectWorkflowRunStorage/)
  assert.match(source, /export async function previewWorkflowRunCleanup/)
  assert.match(source, /export async function cleanupCompletedWorkflowRuns/)
  assert.match(source, /export async function deleteSelectedWorkflowRuns/)
  assert.match(source, /export async function pinWorkflowRun/)
  assert.match(source, /export async function unpinWorkflowRun/)
  assert.match(source, /showMarkdownReport/)
  assert.match(source, /showWarningMessage[\s\S]*modal: true/)
  assert.doesNotMatch(source, /setInterval|setTimeout|onStartupFinished/)
})

test("extension contributes and registers every retention command", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
  const extension = readSrc("extensionWithAuthoring.ts")
  for (const id of commandIds) {
    assert.ok(packageJson.activationEvents.includes(`onCommand:${id}`), id)
    assert.ok(packageJson.contributes.commands.some((entry) => entry.command === id), id)
    assert.match(extension, new RegExp(id.replaceAll(".", "\\.")))
  }
})

test("retention settings are disabled by default and bounded", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
  const properties = packageJson.contributes.configuration.properties
  assert.equal(properties["workflowRegister.runs.retention.enabled"].default, false)
  assert.equal(properties["workflowRegister.runs.retention.completedDays"].default, 30)
  assert.equal(properties["workflowRegister.runs.retention.maxCompletedRuns"].default, 100)
  assert.equal(properties["workflowRegister.runs.retention.maxTotalBytes"].default, 524288000)
  for (const key of [
    "workflowRegister.runs.retention.completedDays",
    "workflowRegister.runs.retention.maxCompletedRuns",
    "workflowRegister.runs.retention.maxTotalBytes"
  ]) {
    assert.equal(properties[key].minimum, 0)
  }
})

test("retention reports expose identifiers, counts and blockers but not run body values", () => {
  const source = readSrc("commands", "runRetention.ts")
  assert.match(source, /candidateRunIds|reclaimBytes|blockers|reasons/)
  assert.doesNotMatch(source, /run\.inputs|run\.state|artifactBody|taskExport|lastAssistantText/)
})

test("storage inspection renders one snapshot and only explicit metadata fields", async () => {
  const workspaceRoot = path.resolve("retention-command-workspace")
  const inspection = {
    summary: {
      runCount: 1,
      totalBytes: 42,
      terminalRunCount: 1,
      recoverableRunCount: 0,
      pinnedRunCount: 0,
      referencedRunCount: 0,
      readOnlyRunCount: 0,
      unknownRunCount: 0,
      blockedRunCount: 0,
      measurementIncompleteRunCount: 0,
      referenceGraphComplete: true
    },
    inventory: [{
      runId: "safe-run",
      status: "completed",
      updatedAt: "2026-07-13T00:00:00.000Z",
      bytes: 42,
      pinned: false,
      referencedBy: [],
      lockPresent: false,
      journalPending: false,
      inspectionStatus: "valid",
      measurementComplete: true,
      rawEntryName: "RAW_ENTRY_SECRET",
      decodeError: "DECODE_PAYLOAD_SECRET"
    }],
    referenceGraphComplete: true
  }
  let inspectionCalls = 0
  let report
  class RetentionServiceStub {
    async inspect() {
      inspectionCalls += 1
      return inspection
    }

    async summarize() {
      throw new Error("storage command must not start a second summary scan")
    }

    async inventory() {
      throw new Error("storage command must not start a second inventory scan")
    }
  }
  const vscode = {
    workspace: {
      workspaceFolders: [{ name: "workspace", uri: { fsPath: workspaceRoot } }]
    },
    window: {}
  }
  const modulePath = path.join(root, "out", "commands", "runRetention.js")
  const originalLoad = Module._load
  delete require.cache[require.resolve(modulePath)]
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return vscode
    if (request === "../core/runtime/runRetentionService") {
      return { WorkflowRunRetentionService: RetentionServiceStub }
    }
    if (request === "../core/workspaceRoots") {
      return {
        findWorkflowRootCandidates: async () => [{ name: "workspace", root: workspaceRoot }],
        fallbackWorkspaceRootCandidates: () => [{ name: "workspace", root: workspaceRoot }]
      }
    }
    if (request === "../reports") {
      return {
        showMarkdownReport: async (title, summary, lines) => {
          report = { title, summary, lines }
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  let commands
  try {
    commands = require(modulePath)
  } finally {
    Module._load = originalLoad
  }

  const result = await commands.inspectWorkflowRunStorage({ workspaceRoot })

  assert.equal(result, inspection.summary)
  assert.equal(inspectionCalls, 1)
  const rendered = JSON.stringify(report)
  assert.match(rendered, /safe-run/)
  assert.match(rendered, /completed/)
  assert.doesNotMatch(rendered, /RAW_ENTRY_SECRET|DECODE_PAYLOAD_SECRET/)
})
