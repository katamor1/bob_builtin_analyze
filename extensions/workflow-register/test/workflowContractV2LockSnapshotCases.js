const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  generationInput
} = require("./workflowContractV2LockTestSupport")

test("branded lock snapshots are revalidated before reuse", () => {
  const snapshotModule = require("../out/core/contractV2/workflowLockSnapshot.js")
  const snapshot = snapshotModule.snapshotWorkflowLockGenerationRawPackage(
    generationInput().rawPackage
  )
  const workflow = snapshot.files.find((file) => file.path === "workflow.yaml")
  workflow.bytes[0] ^= 0xff

  assert.throws(
    () => snapshotModule.snapshotWorkflowLockGenerationRawPackage(snapshot),
    /raw evidence|digest|inconsistent/i
  )
})

test("normalized staging snapshots are also revalidated before reuse", () => {
  const snapshotModule = require("../out/core/contractV2/workflowLockSnapshot.js")
  const input = generationInput().rawPackage
  input.publication = "staging"
  input.generation = ".staging-lock-revalidation"
  const snapshot = snapshotModule.snapshotWorkflowLockGenerationRawPackage(input)
  const lock = snapshot.files.find((file) => file.path === "workflow.lock.json")
  lock.bytes[0] ^= 0xff

  assert.throws(
    () => snapshotModule.snapshotWorkflowLockGenerationRawPackage(snapshot),
    /raw evidence|digest|inconsistent/i
  )
})
