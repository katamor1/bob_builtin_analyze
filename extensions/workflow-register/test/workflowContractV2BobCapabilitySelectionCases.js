const assert = require("node:assert/strict")
const { test } = require("node:test")

const subject = () => require("../out/core/contractV2/bobProfile.js")
const DIGEST = "sha256:aea18a3b1d19f2a1231c7d5e6ac7a416f0ace09ffa823fe4ceb0f43733492b73"
const ALL_CAPABILITIES = [
  "source.deactivate", "source.log", "source.registerWorkflow",
  "task.getAllMetadata", "task.getMessages", "task.sendMessage",
  "task.setStepComplete", "task.startSubagent", "task.toSerializable"
]

function source() {
  return {
    deactivate() {},
    log() {},
    registerWorkflow() {}
  }
}

function exportsValue() {
  return { registerSource() { return source() } }
}

function bindingInput(requiredCapabilities) {
  const value = {
    extensionId: "IBM.bob-code",
    extensionVersion: "2.0.1",
    expectedProfileDigest: DIGEST,
    liveExport: exportsValue()
  }
  if (requiredCapabilities !== undefined) value.requiredCapabilities = requiredCapabilities
  return value
}

test("binding publishes exact detached frozen Bob lock evidence", () => {
  const { bindBobCapabilities } = subject()
  const required = ["source.registerWorkflow", "task.sendMessage"]
  const result = bindBobCapabilities(bindingInput(required))
  required[0] = "changed"

  assert.equal(result.profile, "bob/2.0.1")
  assert.equal(result.extensionId, "IBM.bob-code")
  assert.equal(result.extensionVersion, "2.0.1")
  assert.equal(result.profileDigest, DIGEST)
  assert.deepEqual(result.capabilities, ALL_CAPABILITIES)
  assert.deepEqual(result.requiredCapabilities, ["source.registerWorkflow", "task.sendMessage"])
  assert.deepEqual(result.taskCapabilities, ["task.sendMessage"])
  assert.equal(Object.isFrozen(result.capabilities), true)
  assert.equal(Object.isFrozen(result.requiredCapabilities), true)
  assert.equal(Object.isFrozen(result.taskCapabilities), true)
})

test("binding rejects unknown, duplicate, unsorted, sparse, proxied, and extra-property capability lists", async (t) => {
  const { bindBobCapabilities } = subject()
  const sparse = Array(1)
  const extra = []
  extra.extra = true
  const cases = [
    ["unknown", ["task.unknown"]],
    ["duplicate", ["task.sendMessage", "task.sendMessage"]],
    ["unsorted", ["task.toSerializable", "task.sendMessage"]],
    ["sparse", sparse],
    ["extra", extra],
    ["proxy", new Proxy(["task.sendMessage"], {})]
  ]
  for (const [name, requiredCapabilities] of cases) {
    await t.test(name, () => {
      assert.throws(() => bindBobCapabilities(bindingInput(requiredCapabilities)), TypeError)
    })
  }
})

test("task probe validates only the selected task subset and returns detached evidence", () => {
  const { probeBobTaskCapabilities } = subject()
  const calls = []
  const task = { sendMessage() { calls.push("send") } }
  const requiredCapabilities = ["task.sendMessage"]
  const result = probeBobTaskCapabilities({
    expectedProfileDigest: DIGEST,
    requiredCapabilities,
    task
  })
  requiredCapabilities[0] = "changed"

  assert.deepEqual(result, {
    ok: true,
    profileDigest: DIGEST,
    taskCapabilities: ["task.sendMessage"]
  })
  assert.deepEqual(calls, [])
  assert.equal("sendMessage" in result, false)
  assert.equal("task" in result, false)
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.taskCapabilities), true)
})

test("task probe rejects source, unknown, duplicate, and unsorted requested capabilities", async (t) => {
  const { probeBobTaskCapabilities } = subject()
  const cases = [
    ["source", ["source.log"]],
    ["unknown", ["task.nope"]],
    ["duplicate", ["task.sendMessage", "task.sendMessage"]],
    ["unsorted", ["task.toSerializable", "task.sendMessage"]]
  ]
  for (const [name, requiredCapabilities] of cases) {
    await t.test(name, () => {
      assert.throws(() => probeBobTaskCapabilities({
        expectedProfileDigest: DIGEST,
        requiredCapabilities,
        task: {}
      }), TypeError)
    })
  }
})
