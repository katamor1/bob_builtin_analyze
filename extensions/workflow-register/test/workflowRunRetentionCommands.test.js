const assert = require("node:assert/strict")
const fs = require("node:fs")
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
