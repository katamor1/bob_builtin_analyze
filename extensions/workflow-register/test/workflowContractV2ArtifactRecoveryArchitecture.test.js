const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const root = path.join(__dirname, "..", "src")
function source(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8")
}

function before(text, left, right) {
  const leftIndex = text.indexOf(left)
  const rightIndex = text.indexOf(right)
  assert.ok(leftIndex >= 0, `missing source marker: ${left}`)
  assert.ok(rightIndex >= 0, `missing source marker: ${right}`)
  assert.ok(leftIndex < rightIndex, `${left} must precede ${right}`)
}

test("R6 compares staging identity around the R3 committed inspection", () => {
  const inspection = source("core/contractV2/artifactTransactionRecovery.ts")
  before(inspection, "const before = await snapshotStagingDirectories", "inspectCommittedCaptured")
  before(inspection, "inspectCommittedCaptured", "const after = await snapshotStagingDirectories")
  assert.match(inspection, /sameDirectorySnapshots\(before, after\)/)
  assert.match(inspection, /both staging and committed locations/)
})

test("attempt recovery verifies committed visibility and classifies unreferenced attempts", () => {
  const recovery = source("core/contractV2/runAttemptRecovery.ts")
  assert.match(recovery, /workflow\.contractV2\.artifactSet\./)
  assert.match(recovery, /expectedArtifactSetDigest: visibility\.artifactSetDigest/)
  assert.match(recovery, /artifactStatus: "orphaned"/)
  assert.match(recovery, /artifactStatus: inspection\.status/)
  assert.match(recovery, /Completed workspace-write step lacks committed artifact visibility evidence/)
})

test("product recovery rejects invalid or in-doubt attempt evidence before continuation", () => {
  const product = source("workflowContractV2RunRecovery.ts")
  before(product, "recoverWorkflowContractV2RunPlanLease", "classifyWorkflowContractV2AttemptRecovery")
  assert.match(product, /attemptRecovery\.kind === "invalid"/)
  assert.match(product, /attemptRecovery\.kind === "in-doubt"/)
  assert.match(product, /releaseWorkflowContractV2RunPlanLease/)
})
