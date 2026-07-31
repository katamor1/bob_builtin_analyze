const assert = require("node:assert/strict")
const { test } = require("node:test")

function subject() {
  return require("../out/core/contractV2/bobTaskMethodBinding.js")
}

test("R5 captures one receiver-safe audited Bob task method", async () => {
  const prototype = {
    startSubagent(prompt) {
      assert.equal(this.marker, "task")
      return { result: `done:${prompt}` }
    }
  }
  const task = Object.assign(Object.create(prototype), { marker: "task" })
  const method = subject().bindAuditedBobTaskMethod(task, "task.startSubagent")
  prototype.startSubagent = () => { throw new Error("replacement must not run") }
  assert.deepEqual(await method("hello"), { result: "done:hello" })
})

test("R5 rejects a Bob task accessor without invoking it", () => {
  let getterCalls = 0
  const task = {}
  Object.defineProperty(task, "getMessages", {
    get() {
      getterCalls += 1
      return () => []
    }
  })
  assert.throws(
    () => subject().bindAuditedBobTaskMethod(task, "task.getMessages"),
    /accessor|data method/i
  )
  assert.equal(getterCalls, 0)
})

test("the immediate audited binding keeps all method identities even when metadata mutates the task", async () => {
  const originalStart = async (prompt) => `original:${prompt}`
  const task = {
    getAllMetadata() {
      this.startSubagent = async () => "replacement"
      return { message: "hello" }
    },
    startSubagent: originalStart
  }
  const binding = subject().captureAuditedBobTaskBinding(task, [
    "task.getAllMetadata",
    "task.startSubagent"
  ])
  assert.equal(subject().auditedBobTaskIdentity(binding), task)
  const metadata = subject().auditedBobTaskMethod(binding, "task.getAllMetadata")
  const startSubagent = subject().auditedBobTaskMethod(binding, "task.startSubagent")
  assert.deepEqual(metadata(), { message: "hello" })
  assert.equal(await startSubagent("prompt"), "original:prompt")
})
