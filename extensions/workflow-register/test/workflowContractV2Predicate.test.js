const assert = require("node:assert/strict")
const { test } = require("node:test")
const GOLDEN = require("./fixtures/workflow-contract-v2/predicate-golden.json")

const DIALECT = "https://json-schema.org/draft/2020-12/schema"
const LOCATION = Object.freeze({ path: "workflow.yaml", pointer: "/steps/1/when" })

function predicateModule() {
  return require("../out/core/contractV2/predicate.js")
}

function schemaModule() {
  return require("../out/core/contractV2/jsonSchema.js")
}

function compileSchema(id, body) {
  const result = schemaModule().compileLocalJsonSchema({
    rootId: id,
    schemas: [{
      id,
      schema: { $schema: DIALECT, $id: id, ...body },
      location: { path: id, pointer: "" }
    }],
    diagnosticCode: "WF2_PREDICATE_INVALID",
    location: LOCATION
  })
  assert.equal(result.ok, true, result.diagnostics?.[0]?.message)
  return result.compiled
}

let handles
function schemaHandles() {
  if (handles !== undefined) return handles
  handles = Object.freeze({
    request: compileSchema("schemas/request.json", {
      type: "object",
      properties: {
        status: { type: "string" },
        count: { type: "number" },
        optional: { type: ["string", "null"] },
        nested: {
          type: "object",
          properties: { value: { type: "integer" } }
        }
      },
      additionalProperties: false
    }),
    first: compileSchema("schemas/first.json", {
      type: "object",
      properties: {
        decision: { type: "string" },
        score: { type: "number" },
        payload: {}
      },
      additionalProperties: false
    }),
    second: compileSchema("schemas/second.json", {
      type: "object",
      properties: {
        decision: { type: "string" },
        enabled: { type: "boolean" }
      },
      additionalProperties: false
    })
  })
  return handles
}

function environment() {
  const schema = schemaHandles()
  return {
    inputs: [{ id: "request", schemaId: "schemas/request.json", schema: schema.request }],
    steps: [
      { kind: "value", id: "first", schemaId: "schemas/first.json", schema: schema.first },
      { kind: "value", id: "second", schemaId: "schemas/second.json", schema: schema.second },
      { kind: "noValue" }
    ]
  }
}

function compile(predicate, placement = { kind: "stepEntry", stepIndex: 1 }, overrides = {}) {
  return predicateModule().compileWorkflowPredicate({
    predicate,
    placement,
    schemas: environment(),
    location: LOCATION,
    ...overrides
  })
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function oneDiagnostic(result, pointer = LOCATION.pointer) {
  assert.equal(result.ok, false)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].code, "WF2_PREDICATE_INVALID")
  assert.equal(result.diagnostics[0].severity, "error")
  assert.equal(result.diagnostics[0].message, "Workflow predicate is invalid.")
  assert.deepEqual(result.diagnostics[0].location, { path: LOCATION.path, pointer })
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.diagnostics), true)
  return result.diagnostics[0]
}

function invalidDiagnostic(result) {
  assert.equal(result.ok, false)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].code, "WF2_PREDICATE_INVALID")
  assert.equal(result.diagnostics[0].message, "Workflow predicate is invalid.")
  return result.diagnostics[0]
}

function context(overrides = {}) {
  return {
    inputs: {
      request: {
        status: "ready",
        count: 7,
        nested: { value: 3 }
      }
    },
    committedOutputs: {
      first: {
        decision: "approved",
        score: 8,
        payload: { order: [1, 2], state: "ready" }
      },
      second: { decision: "approved", enabled: true }
    },
    ...overrides
  }
}

test("compiles and evaluates a detached equality predicate", () => {
  const source = {
    kind: "equals",
    left: { source: "input", id: "request", pointer: "/status" },
    right: "ready"
  }

  const result = compile(source)

  assert.equal(result.ok, true)
  assert.deepEqual(JSON.parse(JSON.stringify(result.predicate)), source)
  assert.notEqual(result.predicate, source)
  assert.notEqual(result.predicate.left, source.left)
  assert.equal(Object.getPrototypeOf(result.predicate), null)
  assert.equal(Object.getPrototypeOf(result.predicate.left), null)
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.diagnostics), true)
  assert.equal(Object.isFrozen(result.predicate), true)
  assert.equal(Object.isFrozen(result.predicate.left), true)
  assert.equal(predicateModule().evaluateWorkflowPredicate(result.predicate, {
    inputs: { request: { status: "ready" } },
    committedOutputs: {}
  }), true)
  assert.equal(predicateModule().evaluateWorkflowPredicate(result.predicate, {
    inputs: { request: { status: "waiting" } },
    committedOutputs: {}
  }), false)
})

test("compiles and evaluates every leaf and boolean predicate variant", async (t) => {
  const cases = [
    [
      "notEquals",
      { kind: "notEquals", left: { source: "input", id: "request", pointer: "/status" }, right: "waiting" },
      true
    ],
    [
      "in",
      {
        kind: "in",
        left: { source: "committedOutput", id: "first", pointer: "/payload" },
        right: [{ state: "other" }, { state: "ready", order: [1, 2] }]
      },
      true
    ],
    [
      "greaterThan",
      { kind: "greaterThan", left: { source: "input", id: "request", pointer: "/count" }, right: 6 },
      true
    ],
    [
      "greaterThanOrEqual",
      { kind: "greaterThanOrEqual", left: { source: "input", id: "request", pointer: "/count" }, right: 7 },
      true
    ],
    [
      "lessThan",
      { kind: "lessThan", left: { source: "input", id: "request", pointer: "/status" }, right: "z" },
      true
    ],
    [
      "lessThanOrEqual",
      { kind: "lessThanOrEqual", left: { source: "input", id: "request", pointer: "/count" }, right: 7 },
      true
    ],
    [
      "exists true",
      { kind: "exists", left: { source: "input", id: "request", pointer: "/nested/value" } },
      true
    ],
    [
      "all",
      {
        kind: "all",
        predicates: [
          { kind: "equals", left: { source: "input", id: "request", pointer: "/status" }, right: "ready" },
          { kind: "greaterThan", left: { source: "committedOutput", id: "first", pointer: "/score" }, right: 5 }
        ]
      },
      true
    ],
    [
      "any",
      {
        kind: "any",
        predicates: [
          { kind: "equals", left: { source: "input", id: "request", pointer: "/status" }, right: "missing" },
          { kind: "equals", left: { source: "committedOutput", id: "first", pointer: "/decision" }, right: "approved" }
        ]
      },
      true
    ],
    [
      "not",
      {
        kind: "not",
        predicate: { kind: "equals", left: { source: "input", id: "request", pointer: "/status" }, right: "blocked" }
      },
      true
    ]
  ]

  for (const [name, source, expected] of cases) {
    await t.test(name, () => {
      const result = compile(source)
      assert.equal(result.ok, true)
      assert.deepEqual(plain(result.predicate), source)
      assert.equal(predicateModule().evaluateWorkflowPredicate(result.predicate, context()), expected)
    })
  }
})

test("uses deep canonical equality, deterministic membership, and no ordered coercion", () => {
  const equals = compile({
    kind: "equals",
    left: { source: "committedOutput", id: "first", pointer: "/payload" },
    right: { state: "ready", order: [1, 2] }
  })
  const membership = compile({
    kind: "in",
    left: { source: "committedOutput", id: "first", pointer: "/payload" },
    right: [{ order: [1, 2], state: "ready" }]
  })
  const ordered = compile({
    kind: "greaterThan",
    left: { source: "input", id: "request", pointer: "/count" },
    right: 6
  })

  assert.equal(equals.ok, true)
  assert.equal(membership.ok, true)
  assert.equal(ordered.ok, true)
  assert.equal(predicateModule().evaluateWorkflowPredicate(equals.predicate, context()), true)
  assert.equal(predicateModule().evaluateWorkflowPredicate(membership.predicate, context()), true)
  assert.equal(predicateModule().evaluateWorkflowPredicate(ordered.predicate, context({
    inputs: { request: { status: "ready", count: "7", nested: { value: 3 } } }
  })), false)
})

test("returns false for absent runtime values and preserves boolean short-circuit results", () => {
  const exists = compile({
    kind: "exists",
    left: { source: "input", id: "request", pointer: "/optional" }
  })
  const equals = compile({
    kind: "equals",
    left: { source: "input", id: "request", pointer: "/optional" },
    right: "present"
  })
  const all = compile({
    kind: "all",
    predicates: [
      { kind: "equals", left: { source: "input", id: "request", pointer: "/status" }, right: "blocked" },
      { kind: "exists", left: { source: "committedOutput", id: "first", pointer: "/decision" } }
    ]
  })
  const any = compile({
    kind: "any",
    predicates: [
      { kind: "equals", left: { source: "input", id: "request", pointer: "/status" }, right: "ready" },
      { kind: "exists", left: { source: "committedOutput", id: "first", pointer: "/decision" } }
    ]
  })
  const runtime = context({ committedOutputs: {} })

  for (const result of [exists, equals, all, any]) assert.equal(result.ok, true)
  assert.equal(predicateModule().evaluateWorkflowPredicate(exists.predicate, runtime), false)
  assert.equal(predicateModule().evaluateWorkflowPredicate(equals.predicate, runtime), false)
  assert.equal(predicateModule().evaluateWorkflowPredicate(all.predicate, runtime), false)
  assert.equal(predicateModule().evaluateWorkflowPredicate(any.predicate, runtime), true)
})

test("enforces placement-specific input and committed-output visibility", () => {
  const input = { kind: "exists", left: { source: "input", id: "request", pointer: "/status" } }
  const first = { kind: "exists", left: { source: "committedOutput", id: "first", pointer: "/decision" } }
  const second = { kind: "exists", left: { source: "committedOutput", id: "second", pointer: "/decision" } }

  assert.equal(compile(input, { kind: "inputRequiredWhen", inputIndex: 0 }).ok, true)
  oneDiagnostic(compile(first, { kind: "inputRequiredWhen", inputIndex: 0 }), `${LOCATION.pointer}/left/id`)
  oneDiagnostic(compile(first, { kind: "stepEntry", stepIndex: 0 }), `${LOCATION.pointer}/left/id`)
  assert.equal(compile(first, { kind: "stepEntry", stepIndex: 1 }).ok, true)
  oneDiagnostic(compile(second, { kind: "stepEntry", stepIndex: 1 }), `${LOCATION.pointer}/left/id`)
  assert.equal(compile(second, { kind: "stepTransition", stepIndex: 1 }).ok, true)
  oneDiagnostic(compile(second, { kind: "stepTransition", stepIndex: 0 }), `${LOCATION.pointer}/left/id`)
})

test("resolves pointers only through F3 and rejects incompatible ordered kinds", () => {
  const cases = [
    [
      { kind: "exists", left: { source: "input", id: "request", pointer: "/missing" } },
      `${LOCATION.pointer}/left/pointer`
    ],
    [
      { kind: "exists", left: { source: "input", id: "unknown", pointer: "" } },
      `${LOCATION.pointer}/left/id`
    ],
    [
      { kind: "greaterThan", left: { source: "input", id: "request", pointer: "/status" }, right: 1 },
      `${LOCATION.pointer}/right`
    ],
    [
      { kind: "lessThan", left: { source: "input", id: "request", pointer: "/count" }, right: "10" },
      `${LOCATION.pointer}/right`
    ],
    [
      { kind: "greaterThan", left: { source: "input", id: "request", pointer: "/optional" }, right: "a" },
      `${LOCATION.pointer}/left/pointer`
    ]
  ]

  for (const [predicate, pointer] of cases) oneDiagnostic(compile(predicate), pointer)
})

test("rejects every malformed or no-op predicate field with a precise pointer", () => {
  const sparse = []
  sparse.length = 1
  const cases = [
    ["expression string", "request.status == 'ready'", LOCATION.pointer],
    ["unknown operator", { kind: "matches", left: { source: "input", id: "request", pointer: "/status" } }, `${LOCATION.pointer}/kind`],
    ["missing right", { kind: "equals", left: { source: "input", id: "request", pointer: "/status" } }, `${LOCATION.pointer}/right`],
    ["extra leaf field", { kind: "equals", left: { source: "input", id: "request", pointer: "/status" }, right: "ready", extra: true }, `${LOCATION.pointer}/extra`],
    ["exists right", { kind: "exists", left: { source: "input", id: "request", pointer: "/status" }, right: true }, `${LOCATION.pointer}/right`],
    ["empty in", { kind: "in", left: { source: "input", id: "request", pointer: "/status" }, right: [] }, `${LOCATION.pointer}/right`],
    ["nonarray in", { kind: "in", left: { source: "input", id: "request", pointer: "/status" }, right: "ready" }, `${LOCATION.pointer}/right`],
    ["empty all", { kind: "all", predicates: [] }, `${LOCATION.pointer}/predicates`],
    ["empty any", { kind: "any", predicates: [] }, `${LOCATION.pointer}/predicates`],
    ["sparse children", { kind: "all", predicates: sparse }, `${LOCATION.pointer}/predicates`],
    ["not missing child", { kind: "not" }, `${LOCATION.pointer}/predicate`],
    ["invalid source", { kind: "exists", left: { source: "runState", id: "request", pointer: "/status" } }, `${LOCATION.pointer}/left/source`],
    ["invalid pointer", { kind: "exists", left: { source: "input", id: "request", pointer: "status" } }, `${LOCATION.pointer}/left/pointer`],
    ["extra reference field", { kind: "exists", left: { source: "input", id: "request", pointer: "/status", transient: true } }, `${LOCATION.pointer}/left/transient`],
    ["negative zero", { kind: "equals", left: { source: "input", id: "request", pointer: "/count" }, right: -0 }, `${LOCATION.pointer}/right`],
    ["nonfinite", { kind: "equals", left: { source: "input", id: "request", pointer: "/count" }, right: Infinity }, `${LOCATION.pointer}/right`]
  ]

  for (const [name, predicate, pointer] of cases) {
    assert.doesNotThrow(() => oneDiagnostic(compile(predicate), pointer), name)
  }
})

test("validates the closed compiler-owned schema environment before predicate traversal", () => {
  const predicate = { kind: "exists", left: { source: "input", id: "request", pointer: "/status" } }
  const schema = schemaHandles()
  const invalid = [
    { ...environment(), extra: true },
    { inputs: [{ id: "request", schemaId: "schemas/request.json", schema: schema.request, extra: true }], steps: environment().steps },
    { inputs: [{ id: "request", schemaId: "schemas/other.json", schema: schema.request }], steps: environment().steps },
    { inputs: [{ id: "request", schemaId: "schemas/request.json", schema: { evidence: schema.request.evidence } }], steps: environment().steps },
    { inputs: [
      { id: "request", schemaId: "schemas/request.json", schema: schema.request },
      { id: "request", schemaId: "schemas/request.json", schema: schema.request }
    ], steps: environment().steps },
    { inputs: environment().inputs, steps: [] },
    { inputs: environment().inputs, steps: [
      { kind: "value", id: "duplicate", schemaId: "schemas/first.json", schema: schema.first },
      { kind: "value", id: "duplicate", schemaId: "schemas/second.json", schema: schema.second }
    ] }
  ]

  for (const schemas of invalid) oneDiagnostic(compile(predicate, undefined, { schemas }))
  oneDiagnostic(compile(predicate, { kind: "inputRequiredWhen", inputIndex: 1 }))
  oneDiagnostic(compile(predicate, { kind: "stepEntry", stepIndex: 3 }))
  oneDiagnostic(compile(predicate, { kind: "stepTransition", stepIndex: -1 }))
  oneDiagnostic(compile(predicate, { kind: "stepEntry", stepIndex: 1, extra: true }))
})

test("rejects hostile outer, placement, environment, and binding values without traps", () => {
  const module = predicateModule()
  const valid = {
    predicate: { kind: "exists", left: { source: "input", id: "request", pointer: "/status" } },
    placement: { kind: "stepEntry", stepIndex: 1 },
    schemas: environment(),
    location: LOCATION
  }
  let traps = 0
  const hostile = new Proxy(valid, {
    get() { traps += 1; throw new Error("get") },
    getOwnPropertyDescriptor() { traps += 1; throw new Error("descriptor") },
    getPrototypeOf() { traps += 1; throw new Error("prototype") },
    ownKeys() { traps += 1; throw new Error("ownKeys") }
  })
  const accessorPlacement = {}
  Object.defineProperty(accessorPlacement, "kind", {
    enumerable: true,
    get() { traps += 1; throw new Error("getter") }
  })
  Object.defineProperty(accessorPlacement, "stepIndex", { enumerable: true, value: 1 })

  oneDiagnostic(module.compileWorkflowPredicate(hostile), "")
  oneDiagnostic(module.compileWorkflowPredicate({ ...valid, placement: accessorPlacement }))
  assert.equal(traps, 0)
})

test("accepts exact environment maxima and rejects every one-over value", () => {
  const schema = schemaHandles().request
  const inputs = Array.from({ length: 256 }, (_, index) => ({
    id: `input${index}`,
    schemaId: "schemas/request.json",
    schema
  }))
  const steps = Array.from({ length: 512 }, () => ({ kind: "noValue" }))
  const predicate = { kind: "exists", left: { source: "input", id: "input0", pointer: "/status" } }
  const schemas = { inputs, steps }

  assert.equal(compile(predicate, { kind: "stepEntry", stepIndex: 511 }, { schemas }).ok, true)
  assert.equal(compile(predicate, { kind: "inputRequiredWhen", inputIndex: 255 }, { schemas }).ok, true)
  invalidDiagnostic(compile(predicate, { kind: "stepEntry", stepIndex: 511 }, {
    schemas: { inputs: [...inputs, { id: "input256", schemaId: "schemas/request.json", schema }], steps }
  }))
  invalidDiagnostic(compile(predicate, { kind: "stepEntry", stepIndex: 511 }, {
    schemas: { inputs, steps: [...steps, { kind: "noValue" }] }
  }))
})

test("enforces exact predicate depth and direct-child limits", () => {
  const leaf = { kind: "exists", left: { source: "input", id: "request", pointer: "/status" } }
  let depth32 = leaf
  for (let index = 1; index < 32; index += 1) depth32 = { kind: "not", predicate: depth32 }
  const depth33 = { kind: "not", predicate: depth32 }
  const children128 = { kind: "all", predicates: Array.from({ length: 128 }, () => leaf) }
  const children129 = { kind: "all", predicates: Array.from({ length: 129 }, () => leaf) }

  assert.equal(compile(depth32).ok, true)
  invalidDiagnostic(compile(depth33))
  assert.equal(compile(children128).ok, true)
  invalidDiagnostic(compile(children129))
})

function nodeBoundaryPredicate(lastGroupSize) {
  const leaf = () => ({
    kind: "exists",
    left: { source: "input", id: "request", pointer: "/status" }
  })
  const groups = []
  for (let group = 0; group < 7; group += 1) {
    groups.push({ kind: "all", predicates: Array.from({ length: 128 }, leaf) })
  }
  groups.push({ kind: "all", predicates: Array.from({ length: lastGroupSize }, leaf) })
  return { kind: "all", predicates: groups }
}

test("enforces the exact 1,024-node predicate budget before cloning", () => {
  assert.equal(compile(nodeBoundaryPredicate(119)).ok, true)
  invalidDiagnostic(compile(nodeBoundaryPredicate(120)))

  let hostile = { kind: "exists", left: { source: "input", id: "request", pointer: "/status" } }
  for (let index = 0; index < 20_000; index += 1) hostile = { kind: "not", predicate: hostile }
  assert.doesNotThrow(() => invalidDiagnostic(compile(hostile)))
})

test("enforces exact membership and canonical literal-byte budgets", () => {
  const inPredicate = (length) => ({
    kind: "in",
    left: { source: "input", id: "request", pointer: "/count" },
    right: Array.from({ length }, (_, index) => index)
  })
  const equalsText = (length) => ({
    kind: "equals",
    left: { source: "input", id: "request", pointer: "/status" },
    right: "a".repeat(length)
  })
  const inText = (length) => ({
    kind: "in",
    left: { source: "input", id: "request", pointer: "/status" },
    right: ["a".repeat(length)]
  })

  assert.equal(compile(inPredicate(256)).ok, true)
  invalidDiagnostic(compile(inPredicate(257)))
  assert.equal(compile(equalsText(262_142)).ok, true)
  invalidDiagnostic(compile(equalsText(262_143)))
  assert.equal(compile(inText(262_140)).ok, true)
  invalidDiagnostic(compile(inText(262_141)))
})

test("rejects hostile evaluator contexts without invoking traps", () => {
  const compiled = compile({
    kind: "equals",
    left: { source: "input", id: "request", pointer: "/status" },
    right: "ready"
  })
  assert.equal(compiled.ok, true)
  let traps = 0
  const hostileOuter = new Proxy(context(), {
    get() { traps += 1; throw new Error("get") },
    getOwnPropertyDescriptor() { traps += 1; throw new Error("descriptor") },
    getPrototypeOf() { traps += 1; throw new Error("prototype") },
    ownKeys() { traps += 1; throw new Error("ownKeys") }
  })
  const hostileInputs = {}
  Object.defineProperty(hostileInputs, "request", {
    enumerable: true,
    get() { traps += 1; throw new Error("getter") }
  })

  assert.throws(() => predicateModule().evaluateWorkflowPredicate(compiled.predicate, hostileOuter), TypeError)
  assert.throws(() => predicateModule().evaluateWorkflowPredicate(compiled.predicate, {
    inputs: hostileInputs,
    committedOutputs: {}
  }), TypeError)
  assert.throws(() => predicateModule().evaluateWorkflowPredicate(compiled.predicate, {
    inputs: { request: { status: undefined } },
    committedOutputs: {}
  }), TypeError)
  assert.equal(traps, 0)
})

test("uses captured compile and evaluation intrinsics after module load", () => {
  const module = predicateModule()
  const originals = {
    isArray: Array.isArray,
    objectCreate: Object.create,
    objectKeys: Object.keys,
    descriptors: Object.getOwnPropertyDescriptors,
    prototype: Object.getPrototypeOf,
    ownKeys: Reflect.ownKeys,
    fromCharCode: String.fromCharCode,
    regexpExec: RegExp.prototype.exec,
    typeError: global.TypeError,
    mapGet: Map.prototype.get,
    mapSet: Map.prototype.set,
    setAdd: Set.prototype.add,
    weakSetAdd: WeakSet.prototype.add
  }
  let regexpExecCalls = 0
  let typeErrorCalls = 0
  Array.isArray = () => { throw new Error("patched Array.isArray") }
  Object.create = () => { throw new Error("patched Object.create") }
  Object.keys = () => { throw new Error("patched Object.keys") }
  Object.getOwnPropertyDescriptors = () => { throw new Error("patched descriptors") }
  Object.getPrototypeOf = () => { throw new Error("patched prototype") }
  Reflect.ownKeys = () => { throw new Error("patched ownKeys") }
  String.fromCharCode = () => { throw new Error("patched String.fromCharCode") }
  RegExp.prototype.exec = function (...args) {
    regexpExecCalls += 1
    return Reflect.apply(originals.regexpExec, this, args)
  }
  global.TypeError = function (...args) {
    typeErrorCalls += 1
    return new originals.typeError(...args)
  }
  Map.prototype.get = () => { throw new Error("patched Map.get") }
  Map.prototype.set = () => { throw new Error("patched Map.set") }
  Set.prototype.add = () => { throw new Error("patched Set.add") }
  WeakSet.prototype.add = () => { throw new Error("patched WeakSet.add") }
  let result
  let invalid
  let evaluated
  let evaluationError
  try {
    result = module.compileWorkflowPredicate({
      predicate: { kind: "equals", left: { source: "input", id: "request", pointer: "/status" }, right: "ready" },
      placement: { kind: "stepEntry", stepIndex: 1 },
      schemas: environment(),
      location: LOCATION
    })
    assert.equal(result.ok, true)
    invalid = module.compileWorkflowPredicate({
      predicate: { kind: "exists", left: { source: "providerResult", id: "result", pointer: "" } },
      placement: { kind: "stepEntry", stepIndex: 1 },
      schemas: environment(),
      location: LOCATION
    })
    evaluated = module.evaluateWorkflowPredicate(result.predicate, context())
    try {
      module.evaluateWorkflowPredicate(null, context())
    } catch (error) {
      evaluationError = error
    }
  } finally {
    Array.isArray = originals.isArray
    Object.create = originals.objectCreate
    Object.keys = originals.objectKeys
    Object.getOwnPropertyDescriptors = originals.descriptors
    Object.getPrototypeOf = originals.prototype
    Reflect.ownKeys = originals.ownKeys
    String.fromCharCode = originals.fromCharCode
    RegExp.prototype.exec = originals.regexpExec
    global.TypeError = originals.typeError
    Map.prototype.get = originals.mapGet
    Map.prototype.set = originals.mapSet
    Set.prototype.add = originals.setAdd
    WeakSet.prototype.add = originals.weakSetAdd
  }
  assert.equal(evaluated, true)
  oneDiagnostic(invalid, `${LOCATION.pointer}/left/source`)
  assert.equal(evaluationError instanceof originals.typeError, true)
  assert.equal(regexpExecCalls, 0)
  assert.equal(typeErrorCalls, 0)
})

test("keeps compiler preflight and engine evaluation on one golden predicate contract", () => {
  const compilerContract = predicateModule()
  const engineContract = predicateModule()
  assert.equal(compilerContract, engineContract)
  assert.equal(GOLDEN.version, "workflow-contract-predicate-golden/v1")

  for (const goldenCase of GOLDEN.visibilityCases) {
    const compiled = compilerContract.compileWorkflowPredicate({
      predicate: goldenCase.predicate,
      placement: goldenCase.placement,
      schemas: environment(),
      location: LOCATION
    })
    if (goldenCase.expected.compile === "diagnostic") {
      oneDiagnostic(compiled, goldenCase.expected.pointer)
      continue
    }
    assert.equal(compiled.ok, true, goldenCase.id)
    assert.equal(
      engineContract.evaluateWorkflowPredicate(compiled.predicate, goldenCase.context),
      goldenCase.expected.evaluate,
      goldenCase.id
    )
  }
})

test("freezes all 15 C1 human gates as post-commit same-output decisions", () => {
  const expectedInventory = [
    ["01", ".bob/template-library/standard/process-code-precheck/WORKFLOW.md", 11],
    ["05", ".bob/workflows/process-code-doc-investigation/WORKFLOW.md", 6],
    ["06", ".bob/workflows/process-code-precheck/WORKFLOW.md", 11],
    ["07", ".bob/workflows/process-coding-plan/WORKFLOW.md", 6],
    ["08", ".bob/workflows/process-common-review/WORKFLOW.md", 6],
    ["09", ".bob/workflows/process-external-spec-design/WORKFLOW.md", 6],
    ["10", ".bob/workflows/process-external-spec-review/WORKFLOW.md", 6],
    ["11", ".bob/workflows/process-functional-test-design/WORKFLOW.md", 6],
    ["12", ".bob/workflows/process-functional-test-execution-review/WORKFLOW.md", 6],
    ["13", ".bob/workflows/process-integration-test-design/WORKFLOW.md", 6],
    ["14", ".bob/workflows/process-internal-spec-design/WORKFLOW.md", 6],
    ["15", ".bob/workflows/process-internal-spec-review/WORKFLOW.md", 6],
    ["16", ".bob/workflows/process-qa-intake-analysis/WORKFLOW.md", 6],
    ["17", ".bob/workflows/process-unit-test-design/WORKFLOW.md", 6],
    ["18", ".bob/workflows/process-unit-test-execution-review/WORKFLOW.md", 6]
  ]
  assert.deepEqual(
    GOLDEN.humanGates.map(({ inventoryItem, legacyPath, placement }) => [
      inventoryItem,
      legacyPath,
      placement.stepIndex
    ]),
    expectedInventory
  )

  const schema = schemaHandles().first
  for (const gate of GOLDEN.humanGates) {
    const schemas = {
      inputs: [],
      steps: Array.from({ length: gate.placement.stepIndex + 1 }, (_, stepIndex) => (
        stepIndex === gate.placement.stepIndex
          ? {
              kind: "value",
              id: gate.predicate.left.id,
              schemaId: "schemas/first.json",
              schema
            }
          : { kind: "noValue" }
      ))
    }
    const atEntry = predicateModule().compileWorkflowPredicate({
      predicate: gate.predicate,
      placement: { kind: "stepEntry", stepIndex: gate.placement.stepIndex },
      schemas,
      location: LOCATION
    })
    oneDiagnostic(atEntry, `${LOCATION.pointer}/left/id`)

    const afterCommit = predicateModule().compileWorkflowPredicate({
      predicate: gate.predicate,
      placement: gate.placement,
      schemas,
      location: LOCATION
    })
    assert.equal(gate.expected.compile, "ok", gate.legacyPath)
    assert.equal(afterCommit.ok, true, gate.legacyPath)
    assert.equal(
      predicateModule().evaluateWorkflowPredicate(afterCommit.predicate, gate.context),
      gate.expected.evaluate,
      gate.legacyPath
    )
  }
})

test("checks aggregate literal bytes before building the compiled AST", () => {
  const predicatePath = require.resolve("../out/core/contractV2/predicate.js")
  const canonicalPath = require.resolve("../out/core/contractV2/canonicalJson.js")
  const jsonValuePath = require.resolve("../out/core/contractV2/jsonValue.js")
  const canonical = require(canonicalPath)
  const jsonValue = require(jsonValuePath)
  const originalCanonicalBytes = canonical.canonicalJsonBytes
  const originalClone = jsonValue.cloneAndFreezeJsonValue
  const source = {
    kind: "equals",
    left: { source: "input", id: "request", pointer: "/status" },
    right: "ready"
  }
  let byteChecks = 0
  let astClones = 0
  canonical.canonicalJsonBytes = (value) => {
    byteChecks += 1
    return originalCanonicalBytes(value)
  }
  jsonValue.cloneAndFreezeJsonValue = (value) => {
    if (value === source) astClones += 1
    return originalClone(value)
  }
  delete require.cache[predicatePath]

  try {
    const isolated = require(predicatePath)
    const result = isolated.compileWorkflowPredicate({
      predicate: source,
      placement: { kind: "stepEntry", stepIndex: 1 },
      schemas: environment(),
      location: LOCATION
    })
    assert.equal(result.ok, true)
  } finally {
    canonical.canonicalJsonBytes = originalCanonicalBytes
    jsonValue.cloneAndFreezeJsonValue = originalClone
    delete require.cache[predicatePath]
    require(predicatePath)
  }

  assert.equal(byteChecks, 1)
  assert.equal(astClones, 1)
})
