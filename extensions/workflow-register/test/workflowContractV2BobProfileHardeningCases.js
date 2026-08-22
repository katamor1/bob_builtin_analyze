const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  bindBobCapabilities,
  probeBobTaskCapabilities,
  BOB_2_0_1_PROFILE_DIGEST
} = require("../out/core/contractV2/bobProfile.js")

function source() {
  return {
    deactivate() {},
    log() {},
    registerWorkflow() {}
  }
}

function bindingInput(liveExport) {
  return {
    extensionId: "IBM.bob-code",
    extensionVersion: "2.0.1",
    expectedProfileDigest: BOB_2_0_1_PROFILE_DIGEST,
    liveExport
  }
}

test("activation registerSource must be an own data capability", () => {
  const inherited = Object.create({ registerSource() { return source() } })
  assert.throws(() => bindBobCapabilities(bindingInput(inherited)), /registerSource/)
})

test("bound activation and source functions are frozen while task probe retains no live callable", () => {
  const bound = bindBobCapabilities(bindingInput({ registerSource() { return source() } }))
  assert.equal(Object.isFrozen(bound.registerSource), true)

  const bobSource = bound.registerSource("workflow-register")
  assert.equal(Object.isFrozen(bobSource.deactivate), true)
  assert.equal(Object.isFrozen(bobSource.log), true)
  assert.equal(Object.isFrozen(bobSource.registerWorkflow), true)

  const task = {
    getAllMetadata() { return {} },
    getMessages() { return [] },
    sendMessage() {},
    setStepComplete() {},
    startSubagent() {},
    toSerializable() { return {} }
  }
  const probed = probeBobTaskCapabilities({
    expectedProfileDigest: BOB_2_0_1_PROFILE_DIGEST,
    task
  })
  assert.equal(Object.isFrozen(probed), true)
  assert.equal(Object.isFrozen(probed.taskCapabilities), true)
  assert.equal("task" in probed, false)
  for (const name of [
    "getAllMetadata", "getMessages", "sendMessage",
    "setStepComplete", "startSubagent", "toSerializable"
  ]) assert.equal(name in probed, false)
})
