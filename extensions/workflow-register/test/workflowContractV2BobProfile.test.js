const assert = require("node:assert/strict")
const { test } = require("node:test")
const { types: utilTypes } = require("node:util")

const GOLDEN_DIGEST = "sha256:aea18a3b1d19f2a1231c7d5e6ac7a416f0ace09ffa823fe4ceb0f43733492b73"
const TASK_METHODS = [
  "getAllMetadata",
  "getMessages",
  "sendMessage",
  "setStepComplete",
  "startSubagent",
  "toSerializable"
]

function subject() {
  return require("../out/core/contractV2/bobProfile.js")
}

function exactOwnMethods(names, calls = []) {
  const owner = Object.create(null)
  for (const name of names) Object.defineProperty(owner, name, {
    enumerable: true,
    configurable: false,
    writable: false,
    value: function (...args) {
      calls.push({ name, owner: this, args })
      return undefined
    }
  })
  return owner
}

class AuditedSource {
  constructor(calls) {
    this.register = Object.create(null)
    this.id = "workflow-register"
    this._log = Object.create(null)
    this._configuration = Object.create(null)
    this._humanReadableName = "Workflow Register"
    this._parts = []
    this._events = Object.create(null)
    this._enabled = true
    this.calls = calls
  }

  deactivate() {
    this.calls.push({ name: "deactivate", owner: this, args: [] })
  }

  log(message) {
    this.calls.push({ name: "log", owner: this, args: [message] })
  }

  registerWorkflow(workflow) {
    this.calls.push({ name: "registerWorkflow", owner: this, args: [workflow] })
    return workflow
  }

  registerTool() {
    throw new Error("Unrelated source methods must not be invoked by the F7 binder.")
  }
}

class AuditedTask {
  constructor(calls) {
    this.id = "task-1"
    this.status = "running"
    this.calls = calls
  }

  getAllMetadata() {
    this.calls.push({ name: "getAllMetadata", owner: this, args: [] })
    return { id: this.id }
  }

  getMessages() {
    this.calls.push({ name: "getMessages", owner: this, args: [] })
    return []
  }

  sendMessage(...args) {
    this.calls.push({ name: "sendMessage", owner: this, args })
  }

  setStepComplete() {
    this.calls.push({ name: "setStepComplete", owner: this, args: [] })
  }

  startSubagent(...args) {
    this.calls.push({ name: "startSubagent", owner: this, args })
    return Promise.resolve("ok")
  }

  toSerializable() {
    this.calls.push({ name: "toSerializable", owner: this, args: [] })
    return { id: this.id }
  }

  unrelatedTaskMethod() {
    throw new Error("Unrelated task methods must not be invoked by the F7 probe.")
  }
}

function bobExports(calls = []) {
  return {
    openNewTask() {},
    registerSource(id, name) {
      calls.push({ name: "registerSource", owner: this, args: name === undefined ? [id] : [id, name] })
      return new AuditedSource(calls)
    },
    setChatContent() {},
    setFindings() {},
    startTask() {},
    startWorkflow() {}
  }
}

function bindInput(liveExport = bobExports()) {
  return {
    extensionId: "IBM.bob-code",
    extensionVersion: "2.0.1",
    expectedProfileDigest: GOLDEN_DIGEST,
    liveExport
  }
}

function plainProfile(value) {
  return JSON.parse(JSON.stringify(value))
}

test("golden Bob profile and digest are exact detached frozen evidence", () => {
  const { BOB_2_0_1_PROFILE, BOB_2_0_1_PROFILE_DIGEST, canonicalJsonDigest } = subject()
  assert.equal(BOB_2_0_1_PROFILE_DIGEST, GOLDEN_DIGEST)
  assert.equal(canonicalJsonDigest(BOB_2_0_1_PROFILE), GOLDEN_DIGEST)
  assert.deepEqual(plainProfile(BOB_2_0_1_PROFILE), {
    schemaVersion: "workflow-bob-profile/v1",
    extension: { id: "IBM.bob-code", version: "2.0.1" },
    activationDescriptors: [
      { name: "registerSource", valueKind: "function", callShape: "(id: string, name?: string) => source" }
    ],
    sourceDescriptors: [
      { name: "deactivate", valueKind: "function" },
      { name: "log", valueKind: "function" },
      { name: "registerWorkflow", valueKind: "function" }
    ],
    capabilityNames: [
      "source.deactivate", "source.log", "source.registerWorkflow",
      "task.getAllMetadata", "task.getMessages", "task.sendMessage",
      "task.setStepComplete", "task.startSubagent", "task.toSerializable"
    ],
    taskCapabilityDescriptors: [
      { capability: "task.getAllMetadata", name: "getAllMetadata", valueKind: "function" },
      { capability: "task.getMessages", name: "getMessages", valueKind: "function" },
      { capability: "task.sendMessage", name: "sendMessage", valueKind: "function" },
      { capability: "task.setStepComplete", name: "setStepComplete", valueKind: "function" },
      { capability: "task.startSubagent", name: "startSubagent", valueKind: "function" },
      { capability: "task.toSerializable", name: "toSerializable", valueKind: "function" }
    ]
  })
  assert.equal(Object.isFrozen(BOB_2_0_1_PROFILE), true)
  assert.equal(Object.isFrozen(BOB_2_0_1_PROFILE.extension), true)
  assert.equal(Object.isFrozen(BOB_2_0_1_PROFILE.activationDescriptors), true)
  assert.equal(Object.isFrozen(BOB_2_0_1_PROFILE.sourceDescriptors), true)
  assert.equal(Object.isFrozen(BOB_2_0_1_PROFILE.capabilityNames), true)
  assert.equal(Object.isFrozen(BOB_2_0_1_PROFILE.taskCapabilityDescriptors), true)
})

test("compile-time snapshot validates the activation function without invoking it or claiming task capabilities", () => {
  const { snapshotBobContractProfile } = subject()
  const calls = []
  const result = snapshotBobContractProfile(bobExports(calls))
  assert.equal(result.ok, true)
  assert.equal(result.profileDigest, GOLDEN_DIGEST)
  assert.deepEqual(result.compileTimeCapabilities, [
    "source.deactivate", "source.log", "source.registerWorkflow"
  ])
  assert.deepEqual(calls, [])
  assert.equal("task" in result, false)
  assert.equal("liveExport" in result, false)
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.compileTimeCapabilities), true)
})

test("binding accepts the audited function among the other Bob 2.0.1 exports and captures prototype source methods", () => {
  const { bindBobCapabilities } = subject()
  const calls = []
  const liveExport = bobExports(calls)
  const bound = bindBobCapabilities(bindInput(liveExport))
  assert.equal(bound.ok, true)
  assert.deepEqual(calls, [])

  const source = bound.registerSource("workflow-register", "Workflow Register")
  source.registerWorkflow({ id: "sample" })
  source.log("registered")
  source.deactivate()

  assert.equal(calls[0].owner, liveExport)
  assert.deepEqual(calls[0].args, ["workflow-register", "Workflow Register"])
  assert.equal(calls[1].owner instanceof AuditedSource, true)
  assert.equal(calls[2].owner, calls[1].owner)
  assert.equal(calls[3].owner, calls[1].owner)
  assert.deepEqual(Object.keys(source), ["deactivate", "log", "registerWorkflow"])
  assert.equal("registerTool" in source, false)
  assert.equal("_parts" in source, false)
  assert.equal(Object.isFrozen(bound), true)
  assert.equal(Object.isFrozen(source), true)
})

test("source binding fails before returning when an audited source method is missing, accessor-backed, non-callable, or proxied", async (t) => {
  const { bindBobCapabilities } = subject()
  let getterCalls = 0
  const cases = [
    ["missing", class MissingSource extends AuditedSource { constructor(calls) { super(calls); Object.defineProperty(this, "registerWorkflow", { value: undefined }) } }],
    ["accessor", class AccessorSource extends AuditedSource {}],
    ["non-function", class NonFunctionSource extends AuditedSource { constructor(calls) { super(calls); Object.defineProperty(this, "log", { value: 1 }) } }],
    ["callable proxy", class ProxySource extends AuditedSource { constructor(calls) { super(calls); Object.defineProperty(this, "deactivate", { value: new Proxy(() => undefined, {}) }) } }]
  ]
  Object.defineProperty(cases[1][1].prototype, "registerWorkflow", {
    configurable: true,
    get() {
      getterCalls += 1
      return () => undefined
    }
  })

  for (const [name, Source] of cases) await t.test(name, () => {
    const liveExport = bobExports()
    Object.defineProperty(liveExport, "registerSource", {
      enumerable: true,
      value: () => new Source([])
    })
    const bound = bindBobCapabilities(bindInput(liveExport))
    assert.throws(() => bound.registerSource("workflow-register"), TypeError)
  })
  assert.equal(getterCalls, 0)
})

test("activation binding rejects wrong identity, profile drift, proxy, accessor, missing, and non-callable registerSource", async (t) => {
  const { bindBobCapabilities } = subject()
  let getterCalls = 0
  const valid = bobExports()
  const accessor = bobExports()
  Object.defineProperty(accessor, "registerSource", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1
      return () => undefined
    }
  })
  const missing = bobExports()
  delete missing.registerSource
  const nonFunction = bobExports()
  nonFunction.registerSource = 1
  const callableProxy = bobExports()
  callableProxy.registerSource = new Proxy(() => undefined, {})

  const invalid = [
    ["wrong id", { ...bindInput(valid), extensionId: "ibm.bob-code" }],
    ["wrong version", { ...bindInput(valid), extensionVersion: "2.0.0" }],
    ["profile drift", { ...bindInput(valid), expectedProfileDigest: `sha256:${"0".repeat(64)}` }],
    ["proxy export", bindInput(new Proxy(valid, {}))],
    ["accessor", bindInput(accessor)],
    ["missing", bindInput(missing)],
    ["non-function", bindInput(nonFunction)],
    ["callable proxy", bindInput(callableProxy)]
  ]
  for (const [name, input] of invalid) await t.test(name, () => {
    assert.throws(() => bindBobCapabilities(input), TypeError)
  })
  assert.equal(getterCalls, 0)
})

test("binding and task-probe input wrappers reject proxies, accessors, and unknown fields without invoking getters", () => {
  const { bindBobCapabilities, probeBobTaskCapabilities } = subject()
  let getterCalls = 0
  const accessorBindInput = bindInput()
  Object.defineProperty(accessorBindInput, "liveExport", {
    enumerable: true,
    get() {
      getterCalls += 1
      return bobExports()
    }
  })
  assert.throws(() => bindBobCapabilities(accessorBindInput), TypeError)
  assert.throws(() => bindBobCapabilities(new Proxy(bindInput(), {})), TypeError)
  assert.throws(() => bindBobCapabilities({ ...bindInput(), extra: true }), TypeError)

  const task = new AuditedTask([])
  const accessorProbeInput = { expectedProfileDigest: GOLDEN_DIGEST, task }
  Object.defineProperty(accessorProbeInput, "task", {
    enumerable: true,
    get() {
      getterCalls += 1
      return task
    }
  })
  assert.throws(() => probeBobTaskCapabilities(accessorProbeInput), TypeError)
  assert.throws(
    () => probeBobTaskCapabilities(new Proxy({ expectedProfileDigest: GOLDEN_DIGEST, task }, {})),
    TypeError
  )
  assert.throws(
    () => probeBobTaskCapabilities({ expectedProfileDigest: GOLDEN_DIGEST, task, extra: true }),
    TypeError
  )
  assert.equal(getterCalls, 0)
})

test("task probe binds the six audited prototype methods without invoking them and ignores unrelated state and methods", async () => {
  const { probeBobTaskCapabilities } = subject()
  const calls = []
  const task = new AuditedTask(calls)
  const probed = probeBobTaskCapabilities({ expectedProfileDigest: GOLDEN_DIGEST, task })
  assert.deepEqual(calls, [])
  assert.deepEqual(Object.keys(probed), TASK_METHODS)
  assert.equal("unrelatedTaskMethod" in probed, false)
  assert.equal("status" in probed, false)
  assert.equal(Object.isFrozen(probed), true)

  assert.deepEqual(probed.getAllMetadata(), { id: "task-1" })
  assert.deepEqual(probed.getMessages(), [])
  probed.sendMessage("message", "user")
  probed.setStepComplete()
  await probed.startSubagent("prompt")
  assert.deepEqual(probed.toSerializable(), { id: "task-1" })
  assert.equal(calls.every((call) => call.owner === task), true)
})

test("task probe rejects profile drift, missing methods, inherited accessors, non-functions, callable proxies, and proxy handles", async (t) => {
  const { probeBobTaskCapabilities } = subject()
  const task = new AuditedTask([])
  assert.throws(
    () => probeBobTaskCapabilities({ expectedProfileDigest: `sha256:${"0".repeat(64)}`, task }),
    TypeError
  )
  assert.throws(
    () => probeBobTaskCapabilities({ expectedProfileDigest: GOLDEN_DIGEST, task: new Proxy(task, {}) }),
    TypeError
  )

  for (const missing of TASK_METHODS) await t.test(`missing ${missing}`, () => {
    const value = new AuditedTask([])
    Object.defineProperty(value, missing, { value: undefined })
    assert.throws(
      () => probeBobTaskCapabilities({ expectedProfileDigest: GOLDEN_DIGEST, task: value }),
      new RegExp(missing)
    )
  })

  let getterCalls = 0
  class AccessorTask extends AuditedTask {}
  Object.defineProperty(AccessorTask.prototype, "sendMessage", {
    configurable: true,
    get() {
      getterCalls += 1
      return () => undefined
    }
  })
  assert.throws(
    () => probeBobTaskCapabilities({ expectedProfileDigest: GOLDEN_DIGEST, task: new AccessorTask([]) }),
    /sendMessage/
  )
  assert.equal(getterCalls, 0)

  const nonFunction = new AuditedTask([])
  Object.defineProperty(nonFunction, "getMessages", { value: 1 })
  assert.throws(
    () => probeBobTaskCapabilities({ expectedProfileDigest: GOLDEN_DIGEST, task: nonFunction }),
    /getMessages/
  )

  const callableProxy = new AuditedTask([])
  Object.defineProperty(callableProxy, "toSerializable", { value: new Proxy(() => undefined, {}) })
  assert.throws(
    () => probeBobTaskCapabilities({ expectedProfileDigest: GOLDEN_DIGEST, task: callableProxy }),
    /toSerializable/
  )
})

test("captured proxy detection remains authoritative after util.types.isProxy is replaced", () => {
  const { bindBobCapabilities, probeBobTaskCapabilities } = subject()
  const original = utilTypes.isProxy
  utilTypes.isProxy = () => false
  try {
    assert.throws(() => bindBobCapabilities(bindInput(new Proxy(bobExports(), {}))), TypeError)
    assert.throws(
      () => probeBobTaskCapabilities({
        expectedProfileDigest: GOLDEN_DIGEST,
        task: new Proxy(new AuditedTask([]), {})
      }),
      TypeError
    )
  } finally {
    utilTypes.isProxy = original
  }
})
