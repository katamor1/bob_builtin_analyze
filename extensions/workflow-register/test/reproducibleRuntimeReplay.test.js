const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const PHASE4_RUN = path.join(
  __dirname,
  "fixtures",
  "reproducible-runtime",
  "phase4-v1",
  "run.json"
)

const EXPECTED_PHASE4_V2_BYTES = Buffer.from(
  "{\"createdAt\":\"2026-07-17T00:00:00.000Z\",\"currentStep\":\"collect\",\"engineVersion\":\"phase4-engine\",\"inputs\":{\"revision\":\"abc123\"},\"runId\":\"20260717T000000Z-reproducible-runtime-phase4-000000010000\",\"schemaVersion\":\"workflow-register/run-state/v2\",\"state\":{\"context\":\"phase4-context\\n\"},\"status\":\"running\",\"steps\":[{\"id\":\"collect\",\"status\":\"pending\",\"title\":\"Collect context\",\"type\":\"command\"}],\"updatedAt\":\"2026-07-17T00:03:00.000Z\",\"workflowDefinitionHash\":\"sha256:phase4-characterization\",\"workflowId\":\"workflow-register.reproducible-runtime-phase4\",\"workflowName\":\"reproducible-runtime-phase4\",\"workflowSchemaVersion\":\"workflow-register/v1\"}\n",
  "utf8"
)
const EXPECTED_PHASE4_V2_SHA256 = "sha256:fdf7174e6ce5bdaca0b84c062622984e92e6ceace6df0c3e06de3b2824855b5d"

function canonicalJsonV1() {
  return require("../out/core/runtime/canonicalJsonV1.js")
}

function runStateV2() {
  return require("../out/core/runtime/runStateV2.js")
}

function phase4Run() {
  return JSON.parse(fs.readFileSync(PHASE4_RUN, "utf8"))
}

function richPhase4Run() {
  const run = phase4Run()
  run.inputs = {
    revision: "abc123",
    options: { labels: ["alpha", "beta"], nested: { enabled: true } }
  }
  run.state.context = "rich-context"
  run.steps[0] = {
    ...run.steps[0],
    status: "reviewing",
    attempt: 2,
    attempts: [{
      attempt: 1,
      status: "completed",
      startedAt: "2026-07-17T00:00:10.000Z",
      completedAt: "2026-07-17T00:00:20.000Z",
      reviewDecision: "accepted",
      reviewComment: "reviewed",
      stateSnapshot: { context: "attempt-context", draft: "attempt-draft" },
      branchDecisionId: "decision-1",
      branchLoopId: "review-loop",
      branchFromStepId: "collect",
      branchToStepId: "collect",
      branchLoopCount: 1,
      createdAt: "2026-07-17T00:00:30.000Z"
    }],
    reviewStartedAt: "2026-07-17T00:00:25.000Z"
  }
  run.branching = {
    loops: {
      "review-loop": {
        loopId: "review-loop",
        count: 1,
        allowed: 2,
        maxIterations: 2,
        extensionSize: 1,
        checkpointCount: 1,
        lastTransitionAt: "2026-07-17T00:00:40.000Z"
      }
    },
    checkpoint: {
      id: "checkpoint-1",
      loopId: "review-loop",
      fromStepId: "collect",
      toStepId: "collect",
      decisionId: "decision-1",
      count: 1,
      allowed: 2,
      extensionSize: 1,
      message: "Review again.",
      createdAt: "2026-07-17T00:00:41.000Z"
    },
    checkpointDecisions: [{
      checkpointId: "checkpoint-0",
      outcome: "approved",
      loopId: "review-loop",
      ownerStepId: "collect",
      targetStepId: "collect",
      transitionDecisionId: "decision-0",
      decidedAt: "2026-07-17T00:00:35.000Z",
      reason: "continue"
    }],
    history: [{
      id: "transition-1",
      loopId: "review-loop",
      decisionId: "decision-1",
      fromStepId: "collect",
      toStepId: "collect",
      action: "checkpoint",
      loopCount: 1,
      createdAt: "2026-07-17T00:00:41.000Z",
      conditionSnapshot: { result: "retry", scores: [3, 1] }
    }]
  }
  return run
}

test("canonical-json/v1 is independent of object insertion order", () => {
  const { canonicalizeJsonV1 } = canonicalJsonV1()
  const first = { b: 2, a: 1 }
  const second = { a: 1, b: 2 }

  assert.deepEqual(canonicalizeJsonV1(first), Buffer.from("{\"a\":1,\"b\":2}\n"))
  assert.deepEqual(canonicalizeJsonV1(first), canonicalizeJsonV1(second))
})

test("canonical-json/v1 sorts object keys by JavaScript Unicode code units", () => {
  const { canonicalizeJsonV1 } = canonicalJsonV1()

  assert.equal(
    canonicalizeJsonV1({ "\uE000": 2, "\u{10000}": 1 }).toString("utf8"),
    "{\"\u{10000}\":1,\"\uE000\":2}\n"
  )
})

test("canonical-json/v1 preserves array order and omits undefined object properties", () => {
  const { canonicalizeJsonV1 } = canonicalJsonV1()
  const value = {
    omitted: undefined,
    values: ["third", "first", "second"],
    nested: { kept: true, omitted: undefined }
  }

  assert.equal(
    canonicalizeJsonV1(value).toString("utf8"),
    "{\"nested\":{\"kept\":true},\"values\":[\"third\",\"first\",\"second\"]}\n"
  )
})

test("canonical-json/v1 treats non-callable own toJSON keys as ordinary data", () => {
  const { canonicalizeJsonV1 } = canonicalJsonV1()
  const value = JSON.parse('{"toJSON":"business","nested":{"toJSON":null},"omitted":{}}')
  value.omitted.toJSON = undefined

  assert.equal(
    canonicalizeJsonV1(value).toString("utf8"),
    "{\"nested\":{\"toJSON\":null},\"omitted\":{},\"toJSON\":\"business\"}\n"
  )
})

test("canonical-json/v1 accepts a shared alias without treating it as a cycle", () => {
  const { canonicalizeJsonV1 } = canonicalJsonV1()
  const shared = { value: [2, 1] }

  assert.equal(
    canonicalizeJsonV1({ left: shared, right: shared }).toString("utf8"),
    "{\"left\":{\"value\":[2,1]},\"right\":{\"value\":[2,1]}}\n"
  )
})

test("canonical-json/v1 emits compact UTF-8 with exactly one trailing LF", () => {
  const { canonicalizeJsonV1, hashCanonicalJsonV1 } = canonicalJsonV1()
  const utf8 = canonicalizeJsonV1({ message: "日本語😀" })

  assert.deepEqual(utf8, Buffer.from("{\"message\":\"日本語😀\"}\n", "utf8"))
  assert.equal(utf8.at(-1), 0x0a)
  assert.notEqual(utf8.at(-2), 0x0a)
  assert.equal(
    hashCanonicalJsonV1({ a: 1 }),
    "sha256:e346432021b04179518d9614f3560ccd71354a4ee101ddcb893d6959a9d6301c"
  )
})

test("canonical-json/v1 rejects unsupported JSON values", async (t) => {
  const { canonicalizeJsonV1 } = canonicalJsonV1()
  const cases = [
    ["NaN", { value: Number.NaN }],
    ["positive Infinity", { value: Number.POSITIVE_INFINITY }],
    ["negative Infinity", { value: Number.NEGATIVE_INFINITY }],
    ["bigint", { value: 1n }],
    ["function", { value() {} }],
    ["symbol", { value: Symbol("value") }],
    ["symbol key", { [Symbol("key")]: "value" }],
    ["undefined root", undefined]
  ]

  for (const [name, value] of cases) {
    await t.test(name, () => assert.throws(() => canonicalizeJsonV1(value), /canonical JSON/i))
  }
})

test("canonical-json/v1 rejects sparse arrays and undefined array entries", async (t) => {
  const { canonicalizeJsonV1 } = canonicalJsonV1()
  const sparse = []
  sparse.length = 1

  await t.test("sparse array", () => {
    assert.throws(() => canonicalizeJsonV1(sparse), /sparse|canonical JSON/i)
  })
  await t.test("undefined entry", () => {
    assert.throws(() => canonicalizeJsonV1([undefined]), /undefined|canonical JSON/i)
  })
})

test("canonical-json/v1 rejects cyclic input", () => {
  const { canonicalizeJsonV1 } = canonicalJsonV1()
  const cyclic = { name: "cycle" }
  cyclic.self = cyclic

  assert.throws(() => canonicalizeJsonV1(cyclic), /cyclic|canonical JSON/i)
})

test("canonical-json/v1 rejects root and nested proxies without invoking traps", async (t) => {
  const { canonicalizeJsonV1 } = canonicalJsonV1()

  for (const [name, target, wrap] of [
    ["root object", {}, (proxy) => proxy],
    ["root array", [], (proxy) => proxy],
    ["nested object", {}, (proxy) => ({ nested: proxy })],
    ["nested array", [], (proxy) => [proxy]]
  ]) {
    await t.test(name, () => {
      let trapCalls = 0
      const proxy = new Proxy(target, {
        get() { trapCalls += 1 },
        getOwnPropertyDescriptor() { trapCalls += 1 },
        getPrototypeOf() { trapCalls += 1 },
        has() { trapCalls += 1 },
        ownKeys() { trapCalls += 1 }
      })

      assert.throws(() => canonicalizeJsonV1(wrap(proxy)), /proxy|canonical JSON/i)
      assert.equal(trapCalls, 0)
    })
  }
})

test("canonical-json/v1 rejects custom prototypes, accessors, and toJSON before side effects", async (t) => {
  const { canonicalizeJsonV1 } = canonicalJsonV1()

  await t.test("custom object prototype", () => {
    assert.throws(() => canonicalizeJsonV1(Object.create({ inherited: true })), /prototype|canonical JSON/i)
  })

  await t.test("custom array prototype", () => {
    const value = []
    Object.setPrototypeOf(value, Object.create(Array.prototype))
    assert.throws(() => canonicalizeJsonV1(value), /prototype|canonical JSON/i)
  })

  await t.test("accessor", () => {
    let getterCalls = 0
    const value = {}
    Object.defineProperty(value, "unsafe", {
      enumerable: true,
      get() {
        getterCalls += 1
        return "unsafe"
      }
    })

    assert.throws(() => canonicalizeJsonV1(value), /accessor|canonical JSON/i)
    assert.equal(getterCalls, 0)
  })

  await t.test("callable toJSON", () => {
    let toJSONCalls = 0
    const value = {
      safe: true,
      toJSON() {
        toJSONCalls += 1
        return { replaced: true }
      }
    }

    assert.throws(() => canonicalizeJsonV1(value), /toJSON|canonical JSON/i)
    assert.equal(toJSONCalls, 0)
  })

  await t.test("inherited toJSON", () => {
    let toJSONCalls = 0
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON")
    Object.defineProperty(Object.prototype, "toJSON", {
      configurable: true,
      value() {
        toJSONCalls += 1
        return { replaced: true }
      }
    })
    try {
      assert.throws(() => canonicalizeJsonV1({ safe: true }), /toJSON|canonical JSON/i)
      assert.equal(toJSONCalls, 0)
    } finally {
      if (previous) Object.defineProperty(Object.prototype, "toJSON", previous)
      else delete Object.prototype.toJSON
    }
  })
})

test("canonical-json/v1 never reads absent descriptor fields through Object.prototype", () => {
  const { canonicalizeJsonV1 } = canonicalJsonV1()
  const fields = ["get", "set", "value", "writable", "enumerable", "configurable"]
  const previous = Object.create(null)
  let getterCalls = 0
  let output
  let failure

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    previous[field] = Object.getOwnPropertyDescriptor(Object.prototype, field)
  }
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    const descriptor = Object.create(null)
    descriptor.configurable = true
    descriptor.get = () => {
      getterCalls += 1
      return undefined
    }
    Object.defineProperty(Object.prototype, field, descriptor)
  }
  getterCalls = 0
  try {
    output = canonicalizeJsonV1({ b: [2, 1], a: true }).toString("utf8")
  } catch (error) {
    failure = error
  } finally {
    for (let index = 0; index < fields.length; index += 1) delete Object.prototype[fields[index]]
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index]
      if (previous[field]) Object.defineProperty(Object.prototype, field, previous[field])
    }
  }

  if (failure) throw failure
  assert.equal(getterCalls, 0)
  assert.equal(output, "{\"a\":true,\"b\":[2,1]}\n")
})

test("canonical-json/v1 does not dispatch through modified Array.prototype helpers", () => {
  const { canonicalizeJsonV1 } = canonicalJsonV1()
  const names = ["map", "join", "push", "sort"]
  const previous = {}
  let helperCalls = 0
  let output
  let failure

  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]
    const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, name)
    previous[name] = descriptor
    const original = descriptor.value
    Object.defineProperty(Array.prototype, name, {
      ...descriptor,
      value: function (...args) {
        helperCalls += 1
        return Reflect.apply(original, this, args)
      }
    })
  }
  const iteratorDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator)
  const originalIterator = iteratorDescriptor.value
  const zeroDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, "0")
  Object.defineProperty(Array.prototype, Symbol.iterator, {
    ...iteratorDescriptor,
    value: function () {
      helperCalls += 1
      return Reflect.apply(originalIterator, this, [])
    }
  })
  Object.defineProperty(Array.prototype, "0", {
    configurable: true,
    set() {
      helperCalls += 1
    }
  })

  try {
    output = canonicalizeJsonV1({ z: [3, 1], a: { b: 2, a: 1 } }).toString("utf8")
  } catch (error) {
    failure = error
  } finally {
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index]
      Object.defineProperty(Array.prototype, name, previous[name])
    }
    Object.defineProperty(Array.prototype, Symbol.iterator, iteratorDescriptor)
    if (zeroDescriptor) Object.defineProperty(Array.prototype, "0", zeroDescriptor)
    else delete Array.prototype[0]
  }

  if (failure) throw failure
  assert.equal(helperCalls, 0)
  assert.equal(output, "{\"a\":{\"a\":1,\"b\":2},\"z\":[3,1]}\n")
})

test("Phase 4 v1 upgrades twice to one pinned closed run-state/v2 byte sequence", () => {
  const { hashCanonicalJsonV1 } = canonicalJsonV1()
  const {
    decodeWorkflowRunStateV2,
    encodeWorkflowRunStateV2,
    upgradeWorkflowRunStateV1
  } = runStateV2()
  const source = phase4Run()
  const first = upgradeWorkflowRunStateV1(source)
  const second = upgradeWorkflowRunStateV1(phase4Run())
  const firstBytes = encodeWorkflowRunStateV2(first)
  const secondBytes = encodeWorkflowRunStateV2(second)

  assert.equal(EXPECTED_PHASE4_V2_BYTES.byteLength, 642)
  assert.deepEqual(firstBytes, EXPECTED_PHASE4_V2_BYTES)
  assert.deepEqual(secondBytes, EXPECTED_PHASE4_V2_BYTES)
  assert.equal(hashCanonicalJsonV1(first), EXPECTED_PHASE4_V2_SHA256)
  assert.equal(hashCanonicalJsonV1(second), EXPECTED_PHASE4_V2_SHA256)
  assert.deepEqual(decodeWorkflowRunStateV2(JSON.parse(EXPECTED_PHASE4_V2_BYTES)), first)
})

test("run-state/v2 upgrade excludes volatile projections and paths without mutating v1", () => {
  const { upgradeWorkflowRunStateV1 } = runStateV2()
  const source = phase4Run()
  const original = structuredClone(source)
  source.revision = "projection-revision"
  source.projectionHash = "sha256:projection"
  source.bobTaskSync = {
    schemaVersion: "workflow-register/bob-task-sync/v1",
    projectionVersion: 1,
    completedThroughIndex: 0
  }
  const upgraded = upgradeWorkflowRunStateV1(source)

  assert.equal(upgraded.workflowFile, undefined)
  assert.equal(upgraded.bobTaskSync, undefined)
  assert.equal(upgraded.revision, undefined)
  assert.equal(upgraded.projectionHash, undefined)
  assert.equal(upgraded.state["workflow.artifactManifest"], undefined)
  assert.equal(upgraded.state.context, "phase4-context\n")
  assert.deepEqual(source, {
    ...original,
    revision: "projection-revision",
    projectionHash: "sha256:projection",
    bobTaskSync: {
      schemaVersion: "workflow-register/bob-task-sync/v1",
      projectionVersion: 1,
      completedThroughIndex: 0
    }
  })
})

test("run-state/v2 decoder enforces its closed schema", async (t) => {
  const { decodeWorkflowRunStateV2 } = runStateV2()
  const base = JSON.parse(EXPECTED_PHASE4_V2_BYTES)
  const cases = [
    ["wrong version", { ...base, schemaVersion: "workflow-register/run-state/v1" }],
    ["unknown field", { ...base, futureField: true }],
    ["workflow path", { ...base, workflowFile: ".bob/workflows/unsafe/WORKFLOW.md" }],
    ["Bob projection", { ...base, bobTaskSync: {} }],
    ["revision metadata", { ...base, revision: "sha256:volatile" }],
    ["artifact manifest projection", {
      ...base,
      state: { ...base.state, "workflow.artifactManifest": "{}" }
    }],
    ["unknown step field", {
      ...base,
      steps: [{ ...base.steps[0], futureField: true }]
    }]
  ]

  for (const [name, value] of cases) {
    await t.test(name, () => {
      assert.throws(() => decodeWorkflowRunStateV2(value), /run-state\/v2|schema|field|version/i)
    })
  }
})

test("run-state/v2 preserves arbitrary JSON state keys as own data properties", () => {
  const { decodeWorkflowRunStateV2, encodeWorkflowRunStateV2 } = runStateV2()
  const value = JSON.parse(EXPECTED_PHASE4_V2_BYTES)
  value.state = JSON.parse('{"__proto__":"business value","constructor":"also business"}')

  const decoded = decodeWorkflowRunStateV2(value)

  assert.equal(Object.hasOwn(decoded.state, "__proto__"), true)
  assert.equal(decoded.state.__proto__, "business value")
  assert.equal(decoded.state.constructor, "also business")
  assert.match(encodeWorkflowRunStateV2(decoded).toString("utf8"), /"__proto__":"business value"/)
})

test("run-state/v2 retains non-callable toJSON business keys", () => {
  const { encodeWorkflowRunStateV2, upgradeWorkflowRunStateV1 } = runStateV2()
  const source = phase4Run()
  source.inputs = {
    toJSON: "input business value",
    nested: { toJSON: null },
    omitted: { toJSON: undefined }
  }
  source.state.toJSON = "state business value"

  const upgraded = upgradeWorkflowRunStateV1(source)

  assert.equal(upgraded.inputs.toJSON, "input business value")
  assert.equal(upgraded.inputs.nested.toJSON, null)
  assert.equal(Object.hasOwn(upgraded.inputs.omitted, "toJSON"), false)
  assert.equal(upgraded.state.toJSON, "state business value")
  assert.match(encodeWorkflowRunStateV2(upgraded).toString("utf8"), /"toJSON":"state business value"/)
})

test("run-state/v2 richly upgrades attempts and branching with bidirectional alias isolation", () => {
  const { decodeWorkflowRunStateV2, encodeWorkflowRunStateV2, upgradeWorkflowRunStateV1 } = runStateV2()
  const source = richPhase4Run()
  const upgraded = upgradeWorkflowRunStateV1(source)

  assert.equal(upgraded.steps[0].attempts[0].reviewDecision, "accepted")
  assert.equal(upgraded.branching.loops["review-loop"].checkpointCount, 1)
  assert.equal(upgraded.branching.checkpointDecisions[0].outcome, "approved")
  assert.equal(upgraded.branching.history[0].conditionSnapshot.result, "retry")
  assert.deepEqual(decodeWorkflowRunStateV2(JSON.parse(encodeWorkflowRunStateV2(upgraded))), upgraded)

  source.inputs.options.labels[0] = "source-mutated"
  source.steps[0].attempts[0].stateSnapshot.context = "source-mutated"
  source.branching.history[0].conditionSnapshot.result = "source-mutated"
  assert.equal(upgraded.inputs.options.labels[0], "alpha")
  assert.equal(upgraded.steps[0].attempts[0].stateSnapshot.context, "attempt-context")
  assert.equal(upgraded.branching.history[0].conditionSnapshot.result, "retry")

  upgraded.inputs.options.labels[1] = "upgrade-mutated"
  upgraded.steps[0].attempts[0].stateSnapshot.draft = "upgrade-mutated"
  upgraded.branching.loops["review-loop"].count = 9
  assert.equal(source.inputs.options.labels[1], "beta")
  assert.equal(source.steps[0].attempts[0].stateSnapshot.draft, "attempt-draft")
  assert.equal(source.branching.loops["review-loop"].count, 1)
})

test("run-state/v2 rejects unknown attempt and branching fields", async (t) => {
  const { upgradeWorkflowRunStateV1 } = runStateV2()
  const cases = [
    ["attempt", (run) => { run.steps[0].attempts[0].futureField = true }],
    ["branching", (run) => { run.branching.futureField = true }],
    ["branch loop", (run) => { run.branching.loops["review-loop"].futureField = true }],
    ["checkpoint", (run) => { run.branching.checkpoint.futureField = true }],
    ["checkpoint decision", (run) => { run.branching.checkpointDecisions[0].futureField = true }],
    ["transition", (run) => { run.branching.history[0].futureField = true }]
  ]

  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const source = richPhase4Run()
      mutate(source)
      assert.throws(() => upgradeWorkflowRunStateV1(source), /unsupported field/i)
    })
  }
})
