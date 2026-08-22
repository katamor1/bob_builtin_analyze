const assert = require("node:assert/strict")
const { test } = require("node:test")

const LOCATION = Object.freeze({ path: "workflow.yaml", pointer: "/providers/0" })
const DIGEST_A = `sha256:${"a".repeat(64)}`
const DIGEST_B = `sha256:${"b".repeat(64)}`

function providerModule() {
  return require("../out/core/contractV2/providerRegistry.js")
}

function actionModule() {
  return require("../out/core/actionRegistry.js")
}

function schema(id = "schemas/input.json", bytes = 12, digest = DIGEST_A) {
  return { id, bytes, digest }
}

function contract(overrides = {}) {
  return {
    id: "sample.collect",
    version: "1.2.3",
    inputSchema: schema(),
    output: { kind: "value", schema: schema("schemas/output.json", 14, DIGEST_B) },
    errorSchema: schema("schemas/error.json", 9, DIGEST_B),
    sideEffect: "none",
    idempotency: "idempotent",
    requiredCapabilities: ["task.read", "task.write"],
    dispatch: () => "unused",
    ...overrides
  }
}

function requirement(overrides = {}) {
  const source = contract()
  delete source.dispatch
  return { ...source, version: "^1.0.0", ...overrides }
}

function register(registry, value = contract(), sourceId = "extension.alpha") {
  return registry.registerWorkflowProviderContract({ sourceId, contract: value })
}

function mismatch(result, pointer) {
  assert.equal(result.ok, false)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].code, "WF2_PROVIDER_CONTRACT_MISMATCH")
  assert.equal(result.diagnostics[0].severity, "error")
  assert.deepEqual(result.diagnostics[0].location, {
    path: LOCATION.path,
    pointer: `${LOCATION.pointer}${pointer}`
  })
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.diagnostics), true)
  assert.equal(Object.isFrozen(result.diagnostics[0]), true)
}

test("registration detaches and recursively freezes exact contract evidence", () => {
  const { ActionRegistry } = actionModule()
  const { canonicalJsonDigest } = require("../out/core/contractV2/canonicalJson.js")
  const registry = new ActionRegistry()
  const mutable = contract({ version: "1.2.3+linux.1" })
  register(registry, mutable)
  mutable.id = "changed"
  mutable.inputSchema.id = "schemas/changed.json"
  mutable.output.schema.bytes = 99
  mutable.requiredCapabilities[0] = "changed"

  const catalog = registry.snapshotWorkflowProviderCatalog()
  const evidence = catalog.evidence
  const expectedPreimage = {
    id: "sample.collect",
    version: "1.2.3+linux.1",
    inputSchema: schema(),
    output: { kind: "value", schema: schema("schemas/output.json", 14, DIGEST_B) },
    errorSchema: schema("schemas/error.json", 9, DIGEST_B),
    sideEffect: "none",
    idempotency: "idempotent",
    requiredCapabilities: ["task.read", "task.write"]
  }

  assert.deepEqual(JSON.parse(JSON.stringify(evidence)), {
    schemaVersion: "workflow-provider-catalog/v2",
    providers: [{ ...expectedPreimage, contractDigest: canonicalJsonDigest(expectedPreimage) }]
  })
  assert.deepEqual(Object.keys(evidence.providers[0]), [
    "id", "version", "inputSchema", "output", "errorSchema", "sideEffect",
    "idempotency", "requiredCapabilities", "contractDigest"
  ])
  assert.equal("sourceId" in evidence.providers[0], false)
  assert.equal("dispatch" in evidence.providers[0], false)
  assert.equal(Object.isFrozen(catalog), true)
  assert.equal(Object.isFrozen(evidence), true)
  assert.equal(Object.isFrozen(evidence.providers), true)
  assert.equal(Object.isFrozen(evidence.providers[0].inputSchema), true)
  assert.equal(Object.isFrozen(evidence.providers[0].output.schema), true)
  assert.equal(Object.isFrozen(evidence.providers[0].requiredCapabilities), true)
})

test("registration rejects hostile containers and exact leaf boundaries atomically", async (t) => {
  const { ActionRegistry } = actionModule()
  const invalid = [
    ["missing wrapper field", { sourceId: "extension.alpha" }],
    ["unknown wrapper field", { sourceId: "extension.alpha", contract: contract(), extra: true }],
    ["proxy wrapper", new Proxy({ sourceId: "extension.alpha", contract: contract() }, {})],
    ["accessor contract", Object.defineProperty(contract(), "id", { enumerable: true, get() { throw new Error("invoked") } })],
    ["exotic contract", Object.assign(Object.create({}), contract())],
    ["noncanonical version", contract({ version: "v1.2.3" })],
    ["empty id", contract({ id: "" })],
    ["invalid schema path", contract({ inputSchema: schema("schemas/a/b.json") })],
    ["zero schema bytes", contract({ inputSchema: schema("schemas/a.json", 0) })],
    ["oversize schema bytes", contract({ inputSchema: schema("schemas/a.json", 4_194_305) })],
    ["uppercase digest", contract({ inputSchema: schema("schemas/a.json", 1, `sha256:${"A".repeat(64)}`) })],
    ["unknown output field", contract({ output: { kind: "unit", schema: schema() } })],
    ["wrong side effect", contract({ sideEffect: "network" })],
    ["wrong idempotency", contract({ idempotency: "sometimes" })],
    ["unsorted capabilities", contract({ requiredCapabilities: ["task.write", "task.read"] })],
    ["duplicate capabilities", contract({ requiredCapabilities: ["task.read", "task.read"] })],
    ["sparse capabilities", contract({ requiredCapabilities: Array(1) })],
    ["extra array property", (() => { const value = []; value.extra = true; return contract({ requiredCapabilities: value }) })()],
    ["noncallable dispatch", contract({ dispatch: {} })],
    ["callable proxy dispatch", contract({ dispatch: new Proxy(() => undefined, {}) })],
    ["reserved none capability", contract({ requiredCapabilities: ["workflow.effect.external"] })],
    ["workspace missing reserved capability", contract({ sideEffect: "workspace-write" })],
    ["external conflicting reserved capability", contract({ sideEffect: "external", requiredCapabilities: ["workflow.effect.external", "workflow.effect.workspace-write"] })]
  ]

  for (const [name, value] of invalid) {
    await t.test(name, () => {
      const registry = new ActionRegistry()
      const input = name.includes("wrapper") ? value : { sourceId: "extension.alpha", contract: value }
      assert.throws(() => registry.registerWorkflowProviderContract(input), TypeError)
      assert.deepEqual(registry.snapshotWorkflowProviderCatalog().evidence.providers, [])
    })
  }
})

test("hostile registration values are rejected without invoking behavior or dispatch", () => {
  const { ActionRegistry } = actionModule()
  let getterCalls = 0
  let dispatchCalls = 0
  const hostile = contract({ dispatch: () => { dispatchCalls += 1 } })
  Object.defineProperty(hostile.inputSchema, "id", {
    enumerable: true,
    get() { getterCalls += 1; return "schemas/input.json" }
  })
  const registry = new ActionRegistry()
  assert.throws(() => register(registry, hostile), TypeError)
  assert.equal(getterCalls, 0)
  assert.equal(dispatchCalls, 0)
})

test("duplicates, disposal, stale tokens, isolation, and legacy behavior remain independent", async () => {
  const { ActionRegistry } = actionModule()
  const firstRegistry = new ActionRegistry()
  const secondRegistry = new ActionRegistry()
  const first = register(firstRegistry)
  register(firstRegistry, contract({ version: "2.0.0" }), "extension.beta")
  register(secondRegistry, contract(), "extension.other")
  assert.throws(
    () => register(firstRegistry, contract(), "extension.requester"),
    /sample\.collect.*extension\.alpha.*extension\.requester/
  )

  first.dispose()
  first.dispose()
  const replacement = register(firstRegistry, contract(), "extension.replacement")
  first.dispose()
  assert.deepEqual(firstRegistry.snapshotWorkflowProviderCatalog().evidence.providers.map((item) => item.version), ["1.2.3", "2.0.0"])
  replacement.dispose()
  assert.deepEqual(firstRegistry.snapshotWorkflowProviderCatalog().evidence.providers.map((item) => item.version), ["2.0.0"])
  assert.equal(secondRegistry.snapshotWorkflowProviderCatalog().evidence.providers.length, 1)

  firstRegistry.register({ id: "sample.collect", sourceId: "legacy", execute: () => "legacy" })
  assert.deepEqual(firstRegistry.list(), ["sample.collect"])
  assert.deepEqual(await firstRegistry.execute("sample.collect", { args: {}, inputs: {} }), { ok: true, value: "legacy" })
})

test("catalogs are sorted snapshots with private branding and stable captured bindings", () => {
  const { ActionRegistry } = actionModule()
  const { bindWorkflowProvider } = providerModule()
  const registry = new ActionRegistry()
  let calls = 0
  const token = register(registry, contract({ id: "z.provider", dispatch: () => { calls += 1 } }))
  register(registry, contract({ id: "a.provider", version: "2.0.0" }))
  register(registry, contract({ id: "a.provider", version: "1.0.0" }))
  const catalog = registry.snapshotWorkflowProviderCatalog()
  assert.deepEqual(catalog.evidence.providers.map(({ id, version }) => `${id}@${version}`), [
    "a.provider@1.0.0", "a.provider@2.0.0", "z.provider@1.2.3"
  ])
  const bound = bindWorkflowProvider({ catalog, requirement: requirement({ id: "z.provider" }), location: LOCATION })
  assert.equal(bound.ok, true)
  assert.deepEqual(Object.keys(bound.dispatchHandle), [])
  assert.equal(typeof bound.dispatchHandle.dispatch, "undefined")
  assert.equal(Object.isFrozen(bound.dispatchHandle), true)
  token.dispose()
  register(registry, contract({ id: "z.provider", dispatch: () => { calls += 10 } }), "extension.beta")
  assert.equal(catalog.evidence.providers.length, 3)
  assert.equal(calls, 0)
  assert.equal(bindWorkflowProvider({ catalog, requirement: requirement({ id: "z.provider" }), location: LOCATION }).dispatchHandle, bound.dispatchHandle)
  assert.throws(
    () => bindWorkflowProvider({ catalog: { evidence: catalog.evidence }, requirement: requirement(), location: LOCATION }),
    TypeError
  )
})

test("binding selects the highest exact version and returns exact frozen lock evidence", () => {
  const { ActionRegistry } = actionModule()
  const { bindWorkflowProvider } = providerModule()
  const registry = new ActionRegistry()
  register(registry, contract({ version: "1.0.0" }))
  register(registry, contract({ version: "1.9.0" }), "extension.beta")
  const catalog = registry.snapshotWorkflowProviderCatalog()
  const result = bindWorkflowProvider({ catalog, requirement: requirement(), location: LOCATION })
  assert.equal(result.ok, true)
  assert.deepEqual(result.lockEvidence, {
    id: "sample.collect",
    requestedVersion: "^1.0.0",
    exactVersion: "1.9.0",
    contractDigest: catalog.evidence.providers[1].contractDigest,
    inputSchema: schema(),
    output: { kind: "value", schema: schema("schemas/output.json", 14, DIGEST_B) },
    errorSchema: schema("schemas/error.json", 9, DIGEST_B),
    sideEffect: "none",
    idempotency: "idempotent",
    requiredCapabilities: ["task.read", "task.write"]
  })
  assert.deepEqual(result.diagnostics, [])
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.lockEvidence), true)
  assert.equal(Object.isFrozen(result.lockEvidence.output.schema), true)
  assert.equal(Object.isFrozen(result.lockEvidence.requiredCapabilities), true)
  assert.equal(Object.isFrozen(result.diagnostics), true)
})

test("binding returns exact first-failure pointers in normative precedence", async (t) => {
  const { ActionRegistry } = actionModule()
  const { bindWorkflowProvider } = providerModule()
  const registry = new ActionRegistry()
  register(registry)
  const catalog = registry.snapshotWorkflowProviderCatalog()
  const cases = [
    ["missing id", (() => { const value = requirement(); delete value.id; return value })(), "/id"],
    ["bad input id before later error", requirement({ inputSchema: schema("bad"), sideEffect: "bad" }), "/inputSchema/id"],
    ["input unknown escaped key", (() => { const value = requirement(); value.inputSchema["a/b~c"] = true; return value })(), "/inputSchema/a~1b~0c"],
    ["unit schema unknown", requirement({ output: { kind: "unit", schema: schema() } }), "/output/schema"],
    ["capability invalid index", requirement({ requiredCapabilities: ["task.read", "bad id"] }), "/requiredCapabilities/1"],
    ["capability duplicate index", requirement({ requiredCapabilities: ["task.read", "task.read"] }), "/requiredCapabilities/1"],
    ["capability order index", requirement({ requiredCapabilities: ["task.write", "task.read"] }), "/requiredCapabilities/1"],
    ["malformed range", requirement({ version: "not a range" }), "/version"],
    ["control range", requirement({ version: "^1.0.0\n" }), "/version"],
    ["missing candidate", requirement({ version: "^9.0.0" }), "/version"],
    ["schema mismatch", requirement({ inputSchema: schema("schemas/other.json") }), "/inputSchema/id"],
    ["output mismatch", requirement({ output: { kind: "unit" } }), "/output/kind"],
    ["capability prefix mismatch", requirement({ requiredCapabilities: ["task.read"] }), "/requiredCapabilities/1"]
  ]
  for (const [name, value, pointer] of cases) {
    await t.test(name, () => mismatch(bindWorkflowProvider({ catalog, requirement: value, location: LOCATION }), pointer))
  }
})

test("binding rejects invalid outer/location/catalog as programmer errors before hostile reads", () => {
  const { ActionRegistry } = actionModule()
  const { bindWorkflowProvider } = providerModule()
  const registry = new ActionRegistry()
  register(registry)
  const catalog = registry.snapshotWorkflowProviderCatalog()
  let calls = 0
  const hostile = Object.defineProperty({}, "catalog", { enumerable: true, get() { calls += 1 } })
  assert.throws(() => bindWorkflowProvider(hostile), TypeError)
  assert.equal(calls, 0)
  assert.throws(() => bindWorkflowProvider({ catalog, requirement: requirement(), location: { path: "/absolute", pointer: "" } }), TypeError)
  assert.throws(() => bindWorkflowProvider({ catalog: {}, requirement: requirement(), location: LOCATION }), TypeError)
})

test("prerelease selection, build metadata ties, and no lower-version fallback are exact", () => {
  const { ActionRegistry } = actionModule()
  const { bindWorkflowProvider } = providerModule()
  const registry = new ActionRegistry()
  register(registry, contract({ version: "1.5.0", inputSchema: schema("schemas/lower.json") }))
  register(registry, contract({ version: "1.9.0", inputSchema: schema("schemas/highest.json") }), "extension.beta")
  register(registry, contract({ version: "2.0.0-beta.1" }), "extension.pre")
  let catalog = registry.snapshotWorkflowProviderCatalog()
  mismatch(bindWorkflowProvider({ catalog, requirement: requirement({ inputSchema: schema("schemas/lower.json") }), location: LOCATION }), "/inputSchema/id")
  mismatch(bindWorkflowProvider({ catalog, requirement: requirement({ version: ">=2.0.0 <3.0.0" }), location: LOCATION }), "/version")
  assert.equal(bindWorkflowProvider({ catalog, requirement: requirement({ version: ">=2.0.0-beta.1 <2.0.0" }), location: LOCATION }).ok, true)

  const tie = new ActionRegistry()
  register(tie, contract({ version: "3.0.0+linux" }))
  register(tie, contract({ version: "3.0.0+darwin" }), "extension.beta")
  catalog = tie.snapshotWorkflowProviderCatalog()
  mismatch(bindWorkflowProvider({ catalog, requirement: requirement({ version: "3.0.0" }), location: LOCATION }), "/version")
})

test("reserved capability declarations accept only the exact side-effect mapping", () => {
  const { ActionRegistry } = actionModule()
  const cases = [
    contract({ sideEffect: "none", requiredCapabilities: [] }),
    contract({ sideEffect: "workspace-write", requiredCapabilities: ["workflow.effect.workspace-write"] }),
    contract({ sideEffect: "external", requiredCapabilities: ["workflow.effect.external"] })
  ]
  for (const value of cases) register(new ActionRegistry(), value)
})

test("registry uses captured collection and inspection intrinsics", () => {
  const { ActionRegistry } = actionModule()
  const originals = {
    arrayIterator: Array.prototype[Symbol.iterator],
    arrayPush: Array.prototype.push,
    arraySort: Array.prototype.sort,
    mapDelete: Map.prototype.delete,
    mapForEach: Map.prototype.forEach,
    mapGet: Map.prototype.get,
    mapSet: Map.prototype.set,
    mapSize: Object.getOwnPropertyDescriptor(Map.prototype, "size"),
    mapValues: Map.prototype.values,
    objectDescriptors: Object.getOwnPropertyDescriptors,
    objectKeys: Object.keys,
    objectPrototype: Object.getPrototypeOf,
    stringNormalize: String.prototype.normalize,
    stringReplace: String.prototype.replace,
    weakMapGet: WeakMap.prototype.get,
    weakMapHas: WeakMap.prototype.has,
    weakMapSet: WeakMap.prototype.set
  }
  let evidence
  let disposedEvidence
  try {
    Array.prototype[Symbol.iterator] = () => { throw new Error("live array iterator") }
    Array.prototype.push = () => 0
    Array.prototype.sort = function () { return this }
    Map.prototype.delete = () => false
    Map.prototype.forEach = () => { throw new Error("live Map forEach") }
    Map.prototype.get = () => undefined
    Map.prototype.set = function () { return this }
    Map.prototype.values = () => { throw new Error("live map values") }
    Object.defineProperty(Map.prototype, "size", { configurable: true, get: () => { throw new Error("live Map size") } })
    Object.getOwnPropertyDescriptors = () => { throw new Error("live descriptors") }
    Object.keys = () => []
    Object.getPrototypeOf = () => { throw new Error("live prototype") }
    String.prototype.normalize = () => "changed"
    String.prototype.replace = () => "changed"
    WeakMap.prototype.get = () => undefined
    WeakMap.prototype.has = () => false
    WeakMap.prototype.set = function () { return this }

    const registry = new ActionRegistry()
    const registration = register(registry)
    evidence = registry.snapshotWorkflowProviderCatalog().evidence
    registration.dispose()
    disposedEvidence = registry.snapshotWorkflowProviderCatalog().evidence
  } finally {
    Array.prototype[Symbol.iterator] = originals.arrayIterator
    Array.prototype.push = originals.arrayPush
    Array.prototype.sort = originals.arraySort
    Map.prototype.delete = originals.mapDelete
    Map.prototype.forEach = originals.mapForEach
    Map.prototype.get = originals.mapGet
    Map.prototype.set = originals.mapSet
    Map.prototype.values = originals.mapValues
    Object.defineProperty(Map.prototype, "size", originals.mapSize)
    Object.getOwnPropertyDescriptors = originals.objectDescriptors
    Object.keys = originals.objectKeys
    Object.getPrototypeOf = originals.objectPrototype
    String.prototype.normalize = originals.stringNormalize
    String.prototype.replace = originals.stringReplace
    WeakMap.prototype.get = originals.weakMapGet
    WeakMap.prototype.has = originals.weakMapHas
    WeakMap.prototype.set = originals.weakMapSet
  }
  assert.equal(evidence.providers.length, 1)
  assert.equal(disposedEvidence.providers.length, 0)
})

for (const iteratorMember of [Symbol.iterator, "next"]) {
  test(`snapshot and bind do not use live Map iterator ${String(iteratorMember)}`, () => {
    const { ActionRegistry } = actionModule()
    const { bindWorkflowProvider } = providerModule()
    const registry = new ActionRegistry()
    register(registry)
    const iteratorPrototype = Object.getPrototypeOf(new Map().values())
    const original = iteratorPrototype[iteratorMember]
    let result
    try {
      iteratorPrototype[iteratorMember] = () => { throw new Error("live Map iterator") }
      const catalog = registry.snapshotWorkflowProviderCatalog()
      result = bindWorkflowProvider({ catalog, requirement: requirement(), location: LOCATION })
    } finally {
      iteratorPrototype[iteratorMember] = original
    }
    assert.equal(result.ok, true)
  })
}

test("capability array validation does not call the live global Number", () => {
  const { ActionRegistry } = actionModule()
  const OriginalNumber = global.Number
  let evidence
  try {
    global.Number = () => { throw new Error("live Number") }
    const registry = new ActionRegistry()
    register(registry)
    evidence = registry.snapshotWorkflowProviderCatalog().evidence
  } finally {
    global.Number = OriginalNumber
  }
  assert.equal(evidence.providers.length, 1)
})

test("valid binding uses captured diagnostic number, string, array, and math intrinsics", () => {
  const { ActionRegistry } = actionModule()
  const { bindWorkflowProvider } = providerModule()
  const registry = new ActionRegistry()
  register(registry)
  const catalog = registry.snapshotWorkflowProviderCatalog()
  const calls = {
    arrayFrom: 0,
    charCodeAt: 0,
    endsWith: 0,
    includes: 0,
    indexOf: 0,
    mathMin: 0,
    number: 0,
    numberIsInteger: 0,
    numberIsSafeInteger: 0,
    startsWith: 0
  }
  const originals = {
    arrayFrom: Array.from,
    charCodeAt: String.prototype.charCodeAt,
    endsWith: String.prototype.endsWith,
    includes: String.prototype.includes,
    indexOf: String.prototype.indexOf,
    mathMin: Math.min,
    number: global.Number,
    startsWith: String.prototype.startsWith
  }
  const hostile = (name) => function () {
    calls[name] += 1
    throw new Error(`live ${name}`)
  }
  const HostileNumber = hostile("number")
  HostileNumber.isInteger = hostile("numberIsInteger")
  HostileNumber.isSafeInteger = hostile("numberIsSafeInteger")
  let result
  try {
    Array.from = hostile("arrayFrom")
    String.prototype.charCodeAt = hostile("charCodeAt")
    String.prototype.endsWith = hostile("endsWith")
    String.prototype.includes = hostile("includes")
    String.prototype.indexOf = hostile("indexOf")
    Math.min = hostile("mathMin")
    global.Number = HostileNumber
    String.prototype.startsWith = hostile("startsWith")
    result = bindWorkflowProvider({
      catalog,
      requirement: requirement({ version: "*" }),
      location: LOCATION
    })
  } finally {
    Array.from = originals.arrayFrom
    String.prototype.charCodeAt = originals.charCodeAt
    String.prototype.endsWith = originals.endsWith
    String.prototype.includes = originals.includes
    String.prototype.indexOf = originals.indexOf
    Math.min = originals.mathMin
    global.Number = originals.number
    String.prototype.startsWith = originals.startsWith
  }
  assert.equal(result.ok, true)
  assert.deepEqual(calls, {
    arrayFrom: 0,
    charCodeAt: 0,
    endsWith: 0,
    includes: 0,
    indexOf: 0,
    mathMin: 0,
    number: 0,
    numberIsInteger: 0,
    numberIsSafeInteger: 0,
    startsWith: 0
  })
})

test("reserved-capability diagnostics match the package-shape pointer matrix", async (t) => {
  const { ActionRegistry } = actionModule()
  const { bindWorkflowProvider } = providerModule()
  const registry = new ActionRegistry()
  register(registry, contract({ requiredCapabilities: [] }))
  const catalog = registry.snapshotWorkflowProviderCatalog()
  const external = "workflow.effect.external"
  const workspace = "workflow.effect.workspace-write"
  const cases = [
    ["none forbids workspace first even when its sorted index is later", "none", [external, workspace], "/requiredCapabilities/1"],
    ["none forbids workspace", "none", [workspace], "/requiredCapabilities/0"],
    ["none forbids external", "none", [external], "/requiredCapabilities/0"],
    ["workspace-write forbids external", "workspace-write", [external, workspace], "/requiredCapabilities/0"],
    ["workspace-write requires workspace", "workspace-write", [], "/requiredCapabilities"],
    ["external forbids workspace", "external", [external, workspace], "/requiredCapabilities/1"],
    ["external requires external", "external", [], "/requiredCapabilities"]
  ]
  for (const [name, sideEffect, requiredCapabilities, pointer] of cases) {
    await t.test(name, () => {
      mismatch(bindWorkflowProvider({
        catalog,
        requirement: requirement({ sideEffect, requiredCapabilities }),
        location: LOCATION
      }), pointer)
    })
  }
})

test("registration accepts exact maxima and rejects each one-over boundary", () => {
  const { ActionRegistry } = actionModule()
  const maxId = `A${"a".repeat(127)}`
  const maxCapabilities = [
    maxId,
    ...Array.from({ length: 127 }, (_, index) => `cap${String(index + 1).padStart(3, "0")}`)
  ]
  const accepted = new ActionRegistry()
  register(accepted, contract({
    id: maxId,
    inputSchema: schema("schemas/input.json", 4_194_304),
    requiredCapabilities: maxCapabilities
  }), maxId)
  assert.equal(accepted.snapshotWorkflowProviderCatalog().evidence.providers.length, 1)

  const invalid = [
    ["source id", maxId + "a", contract()],
    ["provider id", "extension.alpha", contract({ id: maxId + "a" })],
    ["capability id", "extension.alpha", contract({ requiredCapabilities: [maxId + "a"] })],
    ["capability count", "extension.alpha", contract({
      requiredCapabilities: Array.from({ length: 129 }, (_, index) => `cap${String(index).padStart(3, "0")}`)
    })],
    ["schema bytes", "extension.alpha", contract({ inputSchema: schema("schemas/input.json", 4_194_305) })]
  ]
  for (const [name, sourceId, value] of invalid) {
    assert.throws(() => register(new ActionRegistry(), value, sourceId), TypeError, name)
  }
})

test("binding accepts a 256-code-unit range and rejects 257 code units", () => {
  const { ActionRegistry } = actionModule()
  const { bindWorkflowProvider } = providerModule()
  const registry = new ActionRegistry()
  register(registry)
  const catalog = registry.snapshotWorkflowProviderCatalog()
  const exactMaximum = `${" ".repeat(251)}1.2.3`
  const oneOver = ` ${exactMaximum}`
  assert.equal(exactMaximum.length, 256)
  assert.equal(oneOver.length, 257)
  assert.equal(bindWorkflowProvider({
    catalog,
    requirement: requirement({ version: exactMaximum }),
    location: LOCATION
  }).ok, true)
  mismatch(bindWorkflowProvider({
    catalog,
    requirement: requirement({ version: oneOver }),
    location: LOCATION
  }), "/version")
})

test("disposing repeated unique ids leaves clean snapshots and permits fresh registrations", () => {
  const { ActionRegistry } = actionModule()
  const registry = new ActionRegistry()
  for (let index = 0; index < 256; index += 1) {
    const registration = register(registry, contract({ id: `provider.${index}` }))
    assert.equal(registry.workflowProviders.byId.size, 1)
    registration.dispose()
    // Intentional compiled-private inspection: this is a memory-retention invariant.
    assert.equal(registry.workflowProviders.byId.size, 0)
  }
  assert.equal(registry.workflowProviders.byId.size, 0)
  assert.deepEqual(registry.snapshotWorkflowProviderCatalog().evidence.providers, [])
  register(registry, contract({ id: "provider.fresh" }))
  assert.deepEqual(
    registry.snapshotWorkflowProviderCatalog().evidence.providers.map(({ id }) => id),
    ["provider.fresh"]
  )
})
