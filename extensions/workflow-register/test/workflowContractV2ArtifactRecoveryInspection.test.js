const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

function subject() {
  return require("../out/core/contractV2/artifactTransactionRecovery.js")
}

test("recovery inspection rejects portable reserved attempt names before filesystem access", async () => {
  await assert.rejects(
    () => subject().inspectWorkflowArtifactTransactionRecovery({
      runRoot: path.join(os.tmpdir(), "does-not-exist-workflow-run"),
      attemptId: "CON"
    }),
    /attempt id is invalid/i
  )
})

test("a stable staging-only attempt is classified without reading it as committed", async (t) => {
  if (process.platform !== "linux") {
    t.skip("R3 secure committed-artifact inspection is currently Linux-only")
    return
  }
  const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-r6-attempt-recovery-"))
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }))
  await fs.mkdir(path.join(runRoot, "attempts", "staging", "attempt-0001-0001"), {
    recursive: true
  })

  assert.deepEqual(
    await subject().inspectWorkflowArtifactTransactionRecovery({
      runRoot,
      attemptId: "attempt-0001-0001"
    }),
    Object.freeze({ status: "staging" })
  )
})

test("a symlinked staging component fails closed", async (t) => {
  if (process.platform !== "linux") {
    t.skip("symlink recovery inspection is exercised on Linux")
    return
  }
  const runRoot = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-r6-attempt-link-"))
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-r6-attempt-outside-"))
  t.after(() => fs.rm(runRoot, { recursive: true, force: true }))
  t.after(() => fs.rm(outside, { recursive: true, force: true }))
  await fs.mkdir(path.join(runRoot, "attempts"), { recursive: true })
  await fs.symlink(outside, path.join(runRoot, "attempts", "staging"), "dir")

  await assert.rejects(
    () => subject().inspectWorkflowArtifactTransactionRecovery({
      runRoot,
      attemptId: "attempt-0001-0001"
    }),
    /link|indirect|non-directory/i
  )
})

test("captured intrinsic behavior survives later prototype replacement", async () => {
  const module = subject()
  const originalExec = RegExp.prototype.exec
  const originalStartsWith = String.prototype.startsWith
  let replacementCalls = 0
  RegExp.prototype.exec = function () {
    replacementCalls += 1
    throw new Error("replacement exec must not run")
  }
  String.prototype.startsWith = function () {
    replacementCalls += 1
    throw new Error("replacement startsWith must not run")
  }
  try {
    let message = ""
    try {
      await module.inspectWorkflowArtifactTransactionRecovery({
        runRoot: path.join(os.tmpdir(), "does-not-exist-workflow-run"),
        attemptId: "CON"
      })
      assert.fail("reserved attempt name must fail")
    } catch (error) {
      message = String(error?.message ?? error)
    }
    assert.equal(message, "Workflow artifact recovery attempt id is invalid.")
    assert.equal(replacementCalls, 0)
  } finally {
    RegExp.prototype.exec = originalExec
    String.prototype.startsWith = originalStartsWith
  }
})
