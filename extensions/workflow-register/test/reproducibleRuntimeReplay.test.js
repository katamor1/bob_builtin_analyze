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

  await t.test("toJSON", () => {
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
