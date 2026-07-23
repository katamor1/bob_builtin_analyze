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

test("every exposed bound capability function is frozen", () => {
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
  for (const name of Object.keys(probed)) {
    assert.equal(Object.isFrozen(probed[name]), true, name)
  }
})
