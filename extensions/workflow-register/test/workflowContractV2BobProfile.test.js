const assert = require("node:assert/strict")
const { test } = require("node:test")

const GOLDEN_DIGEST = "sha256:aea18a3b1d19f2a1231c7d5e6ac7a416f0ace09ffa823fe4ceb0f43733492b73"

function subject() {
  return require("../out/core/contractV2/bobProfile.js")
}

function exactMethods(names, calls = []) {
  const owner = Object.create(null)
  for (const name of names) Object.defineProperty(owner, name, {
    enumerable: true,
    configurable: false,
    writable: false,
    value: function (...args) {
      calls.push({ name, owner: this, args })
      return name === "registerSource" ? exactMethods(["deactivate", "log", "registerWorkflow"], calls) : undefined
    }
  })
  return owner
}

test("golden Bob profile and digest are exact detached frozen evidence", () => {
  const { BOB_2_0_1_PROFILE, BOB_2_0_1_PROFILE_DIGEST, canonicalJsonDigest } = subject()
  assert.equal(BOB_2_0_1_PROFILE_DIGEST, GOLDEN_DIGEST)
  assert.equal(canonicalJsonDigest(BOB_2_0_1_PROFILE), GOLDEN_DIGEST)
  assert.equal(BOB_2_0_1_PROFILE.schemaVersion, "workflow-bob-profile/v1")
  assert.deepEqual(BOB_2_0_1_PROFILE.extension, { id: "IBM.bob-code", version: "2.0.1" })
  assert.deepEqual(BOB_2_0_1_PROFILE.capabilityNames, [
    "source.deactivate", "source.log", "source.registerWorkflow",
    "task.getAllMetadata", "task.getMessages", "task.sendMessage",
    "task.setStepComplete", "task.startSubagent", "task.toSerializable"
  ])
  assert.equal(Object.isFrozen(BOB_2_0_1_PROFILE), true)
  assert.equal(Object.isFrozen(BOB_2_0_1_PROFILE.capabilityNames), true)
})

test("compile-time snapshot validates only activation export and never claims task capabilities", () => {
  const { snapshotBobContractProfile } = subject()
  const result = snapshotBobContractProfile(exactMethods(["registerSource"]))
  assert.equal(result.ok, true)
  assert.equal(result.profileDigest, GOLDEN_DIGEST)
  assert.deepEqual(result.compileTimeCapabilities, [
    "source.deactivate", "source.log", "source.registerWorkflow"
  ])
  assert.equal("task" in result, false)
  assert.equal("liveExport" in result, false)
  assert.equal(Object.isFrozen(result), true)
})

test("binding pins exact extension identity/version and captures receiver-safe source methods", () => {
  const { bindBobCapabilities } = subject()
  const calls = []
  const api = exactMethods(["registerSource"], calls)
  const bound = bindBobCapabilities({
    extensionId: "IBM.bob-code",
    extensionVersion: "2.0.1",
    expectedProfileDigest: GOLDEN_DIGEST,
    liveExport: api
  })
  assert.equal(bound.ok, true)
  const source = bound.registerSource("workflow-register", "Workflow Register")
  source.registerWorkflow({ id: "sample" })
  source.log("registered")
  source.deactivate()
  assert.equal(calls.every((call) => call.owner !== undefined), true)
  assert.equal(Object.isFrozen(bound), true)
  assert.equal(Object.isFrozen(source), true)
})

test("proxy, accessor, missing, extra, non-function, version and digest drift fail closed", async (t) => {
  const { bindBobCapabilities } = subject()
  const valid = exactMethods(["registerSource"])
  const invalid = [
    ["wrong id", { extensionId: "ibm.bob-code", extensionVersion: "2.0.1", expectedProfileDigest: GOLDEN_DIGEST, liveExport: valid }],
    ["wrong version", { extensionId: "IBM.bob-code", extensionVersion: "2.0.0", expectedProfileDigest: GOLDEN_DIGEST, liveExport: valid }],
    ["drift", { extensionId: "IBM.bob-code", extensionVersion: "2.0.1", expectedProfileDigest: `sha256:${"0".repeat(64)}`, liveExport: valid }],
    ["proxy", { extensionId: "IBM.bob-code", extensionVersion: "2.0.1", expectedProfileDigest: GOLDEN_DIGEST, liveExport: new Proxy(valid, {}) }],
    ["missing", { extensionId: "IBM.bob-code", extensionVersion: "2.0.1", expectedProfileDigest: GOLDEN_DIGEST, liveExport: Object.create(null) }],
    ["extra", { extensionId: "IBM.bob-code", extensionVersion: "2.0.1", expectedProfileDigest: GOLDEN_DIGEST, liveExport: exactMethods(["registerSource", "extra"]) }],
    ["non-function", { extensionId: "IBM.bob-code", extensionVersion: "2.0.1", expectedProfileDigest: GOLDEN_DIGEST, liveExport: Object.assign(Object.create(null), { registerSource: 1 }) }],
    ["accessor", { extensionId: "IBM.bob-code", extensionVersion: "2.0.1", expectedProfileDigest: GOLDEN_DIGEST, liveExport: Object.defineProperty(Object.create(null), "registerSource", { enumerable: true, get() { throw new Error("must not run") } }) }]
  ]
  for (const [name, input] of invalid) await t.test(name, () => assert.throws(() => bindBobCapabilities(input), TypeError))
})

test("task probe requires exactly six task methods before dispatch", () => {
  const { probeBobTaskCapabilities } = subject()
  const names = ["getAllMetadata", "getMessages", "sendMessage", "setStepComplete", "startSubagent", "toSerializable"]
  let dispatched = false
  const task = exactMethods(names)
  const probed = probeBobTaskCapabilities({ expectedProfileDigest: GOLDEN_DIGEST, task })
  assert.equal(dispatched, false)
  dispatched = true
  assert.equal(Object.isFrozen(probed), true)
  for (const name of names) assert.equal(typeof probed[name], "function")
  for (const missing of names) {
    assert.throws(
      () => probeBobTaskCapabilities({ expectedProfileDigest: GOLDEN_DIGEST, task: exactMethods(names.filter((name) => name !== missing)) }),
      new RegExp(missing)
    )
  }
  assert.throws(() => probeBobTaskCapabilities({ expectedProfileDigest: GOLDEN_DIGEST, task: new Proxy(task, {}) }), TypeError)
})
