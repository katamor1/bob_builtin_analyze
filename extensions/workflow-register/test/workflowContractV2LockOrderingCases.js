const { test } = require("node:test")
const {
  canonicalText,
  cloneJson,
  replaceLockBytes,
  subject,
  withEncodedLock
} = require("./workflowContractV2LockTestSupport")
const assert = require("node:assert/strict")

test("known forbidden fields participate in canonical first-difference ordering", () => {
  const lockModule = subject()
  const fixture = withEncodedLock(lockModule)
  const drifted = cloneJson(fixture.lock)
  drifted.packageDigest = fixture.input.rawPackage.packageDigest
  drifted.providers[0].exactVersion = "1.2.4"
  const input = replaceLockBytes(
    fixture.input,
    Buffer.from(canonicalText(drifted), "utf8")
  )
  const result = lockModule.verifyWorkflowPackageLock(input)

  assert.equal(result.ok, false)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].code, "WF2_LOCK_MISMATCH")
  assert.equal(result.diagnostics[0].location.pointer, "/packageDigest")
})
