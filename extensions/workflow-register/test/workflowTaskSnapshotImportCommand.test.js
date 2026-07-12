const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSrc } = require("./helpers/sourceReader")

test("task snapshot import command previews and selects before acquiring the execution lease", () => {
  const source = readSrc("workflowRunCommands.ts")
  const methodStart = source.indexOf("async importArtifactsFromTaskSnapshots")
  const methodEnd = source.indexOf("async runNextStep", methodStart)
  assert.ok(methodStart >= 0 && methodEnd > methodStart)
  const method = source.slice(methodStart, methodEnd)

  const preview = method.indexOf("previewArtifactsFromTaskSnapshots")
  const choose = method.indexOf("chooseTaskSnapshotImportSelection")
  const gate = method.indexOf("coordinateGateDecision")
  const lease = method.indexOf("coordinateWorkflowRunExecution")
  const apply = method.indexOf("importTaskSnapshotArtifacts")

  assert.ok(preview >= 0, "preview call")
  assert.ok(choose > preview, "selection follows preview")
  assert.ok(gate > choose, "gate is acquired after user selection")
  assert.ok(lease > gate, "execution lease is acquired inside the gate")
  assert.ok(apply > lease, "apply happens inside the execution lease")
  assert.match(method, /expectedPreviewDigest:\s*preview\.previewDigest/)
  assert.match(method, /overwriteExisting:\s*chosen\.overwriteExisting/)
  assert.match(method, /selectedArtifactIds:\s*chosen\.selectedArtifactIds/)
})

test("task snapshot import command uses contained reads and modal overwrite confirmation", () => {
  const source = readSrc("workflowRunCommands.ts")
  assert.match(source, /readOptionalPhysicallyContainedWorkspaceFile/)
  assert.match(source, /showMarkdownReport\(\s*"Task Snapshot Artifact Import Preview"/)
  assert.match(source, /canPickMany:\s*true/)
  assert.match(source, /showWarningMessage\([\s\S]*\{ modal: true \}[\s\S]*Import and overwrite/)
})
