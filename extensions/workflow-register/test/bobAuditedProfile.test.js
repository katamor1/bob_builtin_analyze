const assert = require("node:assert/strict")
const { test } = require("node:test")
const { types: utilTypes } = require("node:util")

function profileModule() {
  return require("../out/bobAuditedProfile.js")
}

function exactSurface(methods) {
  const value = Object.create(null)
  for (const name of methods) {
    Object.defineProperty(value, name, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: function (...args) {
        assert.equal(this, value)
        return { name, args }
      }
    })
  }
  return value
}

test("audited profile pins IBM.bob-code 2.0.1 and its canonical digest", () => {
  const {
    BOB_AUDITED_PROFILE,
    BOB_AUDITED_PROFILE_DIGEST,
    canonicalBobProfileDigest
  } = profileModule()

  assert.deepEqual(BOB_AUDITED_PROFILE, {
    extensionId: "IBM.bob-code",
    extensionVersion: "2.0.1",
    apiCapabilities: ["registerSource"],
    sourceCapabilities: ["deactivate", "log", "registerWorkflow"],
    taskCapabilities: [
      "getAllMetadata",
      "getMessages",
      "sendMessage",
      "setStepComplete",
      "startSubagent",
      "toSerializable"
    ]
  })
  assert.match(BOB_AUDITED_PROFILE_DIGEST, /^sha256:[0-9a-f]{64}$/)
  assert.equal(canonicalBobProfileDigest(BOB_AUDITED_PROFILE), BOB_AUDITED_PROFILE_DIGEST)
  assert.equal(Object.isFrozen(BOB_AUDITED_PROFILE), true)
  assert.equal(Object.isFrozen(BOB_AUDITED_PROFILE.apiCapabilities), true)
  assert.equal(Object.isFrozen(BOB_AUDITED_PROFILE.sourceCapabilities), true)
  assert.equal(Object.isFrozen(BOB_AUDITED_PROFILE.taskCapabilities), true)
})

test("profile drift is detected before any capability object is inspected", () => {
  const { assertAuditedBobProfile } = profileModule()
  let ownKeysCalls = 0
  const hostile = new Proxy({}, {
    ownKeys() {
      ownKeysCalls += 1
      throw new Error("must not inspect")
    }
  })
  assert.throws(
    () => assertAuditedBobProfile({ expectedDigest: `sha256:${"0".repeat(64)}`, capabilityObject: hostile }),
    /profile digest/i
  )
  assert.equal(ownKeysCalls, 0)
})

test("extension identity and version are exact and fail closed", () => {
  const { bindAuditedBobApi } = profileModule()
  const api = exactSurface(["registerSource"])
  for (const extension of [
    { id: "IBM.bob-code", packageJSON: { version: "2.0.0" }, exports: api },
    { id: "ibm.bob-code", packageJSON: { version: "2.0.1" }, exports: api },
    { id: "IBM.bob-code", packageJSON: { version: "2.0.1+local" }, exports: api }
  ]) {
    assert.throws(() => bindAuditedBobApi(extension), /IBM\.bob-code@2\.0\.1/)
  }
})

test("API and source binding rejects proxies, accessors, missing, extra, and non-functions without invocation", async (t) => {
  const { bindAuditedBobApi, bindAuditedBobSource } = profileModule()
  const cases = [
    ["proxy", new Proxy(exactSurface(["registerSource"]), {})],
    ["accessor", Object.defineProperty(Object.create(null), "registerSource", { enumerable: true, get() { throw new Error("invoked") } })],
    ["missing", Object.create(null)],
    ["extra", exactSurface(["registerSource", "unexpected"])],
    ["non-function", Object.assign(Object.create(null), { registerSource: 1 })]
  ]
  for (const [name, value] of cases) {
    await t.test(`api ${name}`, () => {
      assert.throws(() => bindAuditedBobApi({ id: "IBM.bob-code", packageJSON: { version: "2.0.1" }, exports: value }), TypeError)
    })
  }

  const sourceCases = [
    ["proxy", new Proxy(exactSurface(["deactivate", "log", "registerWorkflow"]), {})],
    ["accessor", Object.defineProperty(exactSurface(["deactivate", "log"]), "registerWorkflow", { enumerable: true, get() { throw new Error("invoked") } })],
    ["missing", exactSurface(["deactivate", "log"])],
    ["extra", exactSurface(["deactivate", "log", "registerWorkflow", "unexpected"])],
    ["non-function", Object.assign(Object.create(null), { deactivate() {}, log() {}, registerWorkflow: 1 })]
  ]
  for (const [name, value] of sourceCases) {
    await t.test(`source ${name}`, () => assert.throws(() => bindAuditedBobSource(value), TypeError))
  }
})

test("binding captures receiver-safe, frozen, non-reflective handles", () => {
  const { bindAuditedBobApi, bindAuditedBobSource } = profileModule()
  const apiSurface = exactSurface(["registerSource"])
  const api = bindAuditedBobApi({
    id: "IBM.bob-code",
    packageJSON: { version: "2.0.1" },
    exports: apiSurface
  })
  assert.deepEqual(api.registerSource("id", "name"), { name: "registerSource", args: ["id", "name"] })
  assert.deepEqual(Object.keys(api), ["registerSource"])
  assert.equal(Object.isFrozen(api), true)

  const sourceSurface = exactSurface(["deactivate", "log", "registerWorkflow"])
  const source = bindAuditedBobSource(sourceSurface)
  assert.deepEqual(source.registerWorkflow({ id: "w" }), { name: "registerWorkflow", args: [{ id: "w" }] })
  assert.deepEqual(source.log("message"), { name: "log", args: ["message"] })
  assert.deepEqual(source.deactivate(), { name: "deactivate", args: [] })
  assert.equal(Object.isFrozen(source), true)
})

test("task probe requires the exact six audited capabilities immediately before execution", async (t) => {
  const { probeAuditedBobTask } = profileModule()
  const names = [
    "getAllMetadata",
    "getMessages",
    "sendMessage",
    "setStepComplete",
    "startSubagent",
    "toSerializable"
  ]
  const taskSurface = exactSurface(names)
  const task = probeAuditedBobTask(taskSurface)
  assert.equal(Object.isFrozen(task), true)
  for (const name of names) assert.equal(typeof task[name], "function")

  for (const missing of names) {
    await t.test(`missing ${missing}`, () => {
      const reduced = exactSurface(names.filter((name) => name !== missing))
      assert.throws(() => probeAuditedBobTask(reduced), new RegExp(missing))
    })
  }
  assert.throws(() => probeAuditedBobTask(new Proxy(taskSurface, {})), TypeError)
  assert.equal(utilTypes.isProxy(task), false)
})
