const assert = require("node:assert/strict")
const { test } = require("node:test")

test("runAgent result handoff calls the allowed result command with result text first", async () => {
  const { executeResultHandoff, resultSourceForStep } = require("../out/resultHandoff")
  const calls = []
  const step = {
    captureResult: true,
    runAgent: true,
    resultCommand: "bobBazaar.captureReviewResult",
    resultCommandArgs: ["extra"]
  }

  const result = await executeResultHandoff(step, "agent result json", {
    executeCommand: async (...args) => {
      calls.push(args)
      return { status: "ok" }
    }
  })

  assert.equal(resultSourceForStep(step), "agent")
  assert.equal(result.ok, true)
  assert.deepEqual(calls, [["bobBazaar.captureReviewResult", "agent result json", "extra"]])
})

test("result handoff is skipped when captureResult is not enabled", async () => {
  const { executeResultHandoff } = require("../out/resultHandoff")
  const calls = []

  const result = await executeResultHandoff({ captureResult: false, runAgent: true }, "unused", {
    executeCommand: async (...args) => calls.push(args)
  })

  assert.equal(result.ok, true)
  assert.equal(result.skipped, true)
  assert.deepEqual(calls, [])
})

test("unsupported result commands are rejected before command execution", async () => {
  const { executeResultHandoff } = require("../out/resultHandoff")
  const calls = []

  const result = await executeResultHandoff({
    captureResult: true,
    runAgent: true,
    resultCommand: "workbench.action.files.save"
  }, "agent result", {
    executeCommand: async (...args) => calls.push(args)
  })

  assert.equal(result.ok, false)
  assert.match(result.error, /Unsupported result command/)
  assert.deepEqual(calls, [])
})

test("result handoff fails when the allowed command reports validation failure", async () => {
  const { executeResultHandoff } = require("../out/resultHandoff")

  const result = await executeResultHandoff({
    captureResult: true,
    runAgent: true,
    resultCommand: "bobBazaar.captureReviewResult"
  }, "invalid json", {
    executeCommand: async () => ({
      status: "error",
      issueCount: 1,
      issues: [{ path: "$.vcs", message: "Missing required object." }]
    })
  })

  assert.equal(result.ok, false)
  assert.match(result.error, /result command reported an error/)
  assert.match(result.error, /\$\.vcs/)
})

test("last assistant extraction reads only assistant messages after the step start index", () => {
  const { extractLastAssistantText, resultSourceForStep } = require("../out/resultHandoff")
  const messages = [
    { role: "assistant", content: "previous step" },
    { role: "user", content: "current step prompt" },
    { role: "assistant", content: "first answer" },
    { role: "assistant", content: "final answer" }
  ]

  assert.equal(resultSourceForStep({ captureResult: true, runAgent: false }), "lastAssistant")
  assert.equal(extractLastAssistantText(messages, 1), "final answer")
})
