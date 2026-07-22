"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  ContributionRegistry,
  ContributionRegistryError
} = require("../out/core/contributionRegistry")

function ownerContext(ownerId = "local.owner-a", version = "1.0.0") {
  return {
    expectedOwner: { id: ownerId, version },
    ownerDirectory: `extensions/${ownerId.split(".")[1]}`
  }
}

function completeManifest(ownerId = "local.owner-a", version = "1.0.0") {
  const ownerName = ownerId.split(".")[1]
  const prefix = ownerName.replace(/-/g, ".")
  return {
    schema_version: "workflow-contributions/v1",
    owner: { id: ownerId, version },
    registry_api: { min: "provider-registry/v1", max: "provider-registry/v1" },
    action_providers: [{
      id: `${prefix}.action`,
      contract_version: `${prefix}.action/v1`,
      input_schema: `${prefix}.schema.input`,
      output_schema: `${prefix}.schema.output`,
      error_codes: [`${prefix}.failed`]
    }],
    preflight_checks: [{
      id: `${prefix}.preflight`,
      contract_version: `${prefix}.preflight.contract/v1`,
      result_schema: `${prefix}.schema.preflight.result`
    }],
    result_sinks: [{
      type: `${prefix}.sink`,
      contract_version: `${prefix}.sink.contract/v1`,
      payload_schema: `${prefix}.schema.sink.payload`
    }],
    agent_provider: {
      id: `${prefix}.agent`,
      contract_version: `${prefix}.agent.contract/v1`,
      capabilities: [`${prefix}.chat`]
    },
    workflow_templates: [{
      id: `${prefix}.template`,
      source: `extensions/${ownerName}/templates/WORKFLOW.md`,
      destinations: [`extensions/${ownerName}/WORKFLOW.md`]
    }],
    schemas: [
      { id: `${prefix}.schema.input`, path: `extensions/${ownerName}/schema/input.json` },
      { id: `${prefix}.schema.output`, path: `extensions/${ownerName}/schema/output.json` },
      { id: `${prefix}.schema.preflight.result`, path: `extensions/${ownerName}/schema/preflight.json` },
      { id: `${prefix}.schema.sink.payload`, path: `extensions/${ownerName}/schema/sink.json` }
    ]
  }
}

function emptyManifest(ownerId = "local.owner-a", version = "1.0.0") {
  const value = completeManifest(ownerId, version)
  value.action_providers = []
  value.preflight_checks = []
  value.result_sinks = []
  delete value.agent_provider
  value.workflow_templates = []
  value.schemas = []
  return value
}

function completeHandlers(manifest, overrides = {}) {
  const action = manifest.action_providers[0]
  const preflight = manifest.preflight_checks[0]
  const sink = manifest.result_sinks[0]
  return {
    actionProviders: new Map(action ? [[action.id, {
      id: action.id,
      sourceId: manifest.owner.id,
      execute: overrides.execute ?? (() => "action-result")
    }]] : []),
    preflightChecks: new Map(preflight ? [[preflight.id, overrides.preflight ?? (() => true)]] : []),
    resultSinks: new Map(sink ? [[sink.type, overrides.sink ?? (async () => ({ ok: true }))]] : []),
    ...(manifest.agent_provider ? {
      agentProvider: overrides.agent ?? { run: () => "agent-result" }
    } : {})
  }
}

function emptyHandlers() {
  return {
    actionProviders: new Map(),
    preflightChecks: new Map(),
    resultSinks: new Map()
  }
}

function register(registry, manifest, handlers = completeHandlers(manifest), context = ownerContext(manifest.owner.id, manifest.owner.version)) {
  return registry.registerContributionSet(manifest, context, handlers)
}

function assertRegistryError(operation, code) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof ContributionRegistryError)
    assert.equal(error.code, code)
    assert.equal(typeof error.diagnosticId, "string")
    assert.ok(Buffer.byteLength(error.message, "utf8") <= 256, `${Buffer.byteLength(error.message, "utf8")}: ${error.message}`)
    assert.ok(Buffer.byteLength(error.diagnosticId, "utf8") <= 256)
    assert.doesNotMatch(error.message, /[\u0000-\u001f\u007f-\u009f]/)
    return true
  })
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) return
  seen.add(value)
  assert.equal(Object.isFrozen(value), true)
  for (const key of Reflect.ownKeys(value)) assertDeepFrozen(value[key], seen)
}

test("registers all six contribution kinds and exposes metadata separately from handlers", async () => {
  const registry = new ContributionRegistry()
  const manifest = completeManifest()
  const handlers = completeHandlers(manifest)
  const registration = register(registry, manifest, handlers)

  assert.equal(Object.isFrozen(registration), true)
  assert.equal(await registry.getActionProvider(manifest.action_providers[0].id).execute({}), "action-result")
  assert.equal(await registry.getPreflightCheck(manifest.preflight_checks[0].id)({}), true)
  assert.deepEqual(await registry.getResultSink(manifest.result_sinks[0].type)({}, {}), { ok: true })
  assert.equal(await registry.getAgentProvider(manifest.agent_provider.id).run({}), "agent-result")
  assert.equal(registry.getWorkflowTemplateMetadata(manifest.workflow_templates[0].id).kind, "workflow_template")
  assert.equal(registry.getSchemaMetadata(manifest.schemas[0].id).kind, "schema")

  const snapshot = registry.snapshot()
  assert.equal(snapshot.actionProviders.length, 1)
  assert.equal(snapshot.preflightChecks.length, 1)
  assert.equal(snapshot.resultSinks.length, 1)
  assert.equal(snapshot.agentProviders.length, 1)
  assert.equal(snapshot.workflowTemplates.length, 1)
  assert.equal(snapshot.schemas.length, 4)
  assert.equal(registry.getActionProviderMetadata(manifest.action_providers[0].id).owner.id, manifest.owner.id)
  assert.equal(registry.getPreflightCheckMetadata(manifest.preflight_checks[0].id).kind, "preflight_check")
  assert.equal(registry.getResultSinkMetadata(manifest.result_sinks[0].type).kind, "result_sink")
  assert.equal(registry.getAgentProviderMetadata(manifest.agent_provider.id).kind, "agent_provider")
})

test("rejects missing, surplus, non-callable, and agent-presence handler mismatches before publication", () => {
  const mutations = [
    (manifest, handlers) => handlers.actionProviders.delete(manifest.action_providers[0].id),
    (_manifest, handlers) => handlers.actionProviders.set("surplus.action", { id: "surplus.action", execute() {} }),
    (manifest, handlers) => handlers.actionProviders.set(manifest.action_providers[0].id, { id: manifest.action_providers[0].id, execute: 1 }),
    (manifest, handlers) => handlers.preflightChecks.set(manifest.preflight_checks[0].id, 1),
    (manifest, handlers) => handlers.resultSinks.set(manifest.result_sinks[0].type, {}),
    (_manifest, handlers) => { delete handlers.agentProvider }
  ]

  for (const mutate of mutations) {
    const registry = new ContributionRegistry()
    const manifest = completeManifest()
    const handlers = completeHandlers(manifest)
    mutate(manifest, handlers)
    const before = registry.snapshot()
    assertRegistryError(() => register(registry, manifest, handlers), "contribution.registry.handler_mismatch")
    assert.strictEqual(registry.snapshot(), before)
  }

  const registry = new ContributionRegistry()
  const manifest = emptyManifest()
  const handlers = { ...emptyHandlers(), agentProvider: { run() {} } }
  const before = registry.snapshot()
  assertRegistryError(() => register(registry, manifest, handlers), "contribution.registry.handler_mismatch")
  assert.strictEqual(registry.snapshot(), before)
})

test("requires intrinsic Maps and bypasses Map subclass entry and iterator overrides", () => {
  class HostileMap extends Map {
    entries() { throw new Error("overridden entries must not run") }
    [Symbol.iterator]() { throw new Error("overridden iterator must not run") }
  }

  const manifest = completeManifest()
  const handlers = completeHandlers(manifest)
  handlers.actionProviders = new HostileMap(handlers.actionProviders)
  handlers.preflightChecks = new HostileMap(handlers.preflightChecks)
  handlers.resultSinks = new HostileMap(handlers.resultSinks)
  register(new ContributionRegistry(), manifest, handlers)

  for (const invalid of [
    { ...completeHandlers(manifest), actionProviders: Object.fromEntries(completeHandlers(manifest).actionProviders) },
    { ...completeHandlers(manifest), preflightChecks: new Proxy(completeHandlers(manifest).preflightChecks, {}) },
    { ...completeHandlers(manifest), resultSinks: [] }
  ]) {
    const registry = new ContributionRegistry()
    const before = registry.snapshot()
    assertRegistryError(() => register(registry, manifest, invalid), "contribution.registry.handler_set_invalid")
    assert.strictEqual(registry.snapshot(), before)
  }

  const revoked = Proxy.revocable({}, {})
  revoked.revoke()
  assertRegistryError(
    () => register(new ContributionRegistry(), manifest, revoked.proxy),
    "contribution.registry.handler_set_invalid"
  )
})

test("rejects same-owner and other-owner duplicate identifiers without changing the published snapshot", () => {
  const registry = new ContributionRegistry()
  const first = completeManifest()
  register(registry, first)
  const before = registry.snapshot()

  assertRegistryError(() => register(registry, completeManifest()), "contribution.registry.duplicate_identifier")
  assert.strictEqual(registry.snapshot(), before)

  const other = completeManifest("local.owner-b")
  other.action_providers[0].id = first.action_providers[0].id
  const otherHandlers = completeHandlers(other)
  assertRegistryError(
    () => register(registry, other, otherHandlers, ownerContext("local.owner-b")),
    "contribution.registry.duplicate_identifier"
  )
  assert.strictEqual(registry.snapshot(), before)
})

test("uses one global namespace and rolls back an incoming set whose late schema collides", () => {
  const registry = new ContributionRegistry()
  const first = emptyManifest()
  first.workflow_templates = [{
    id: "shared.collision",
    source: "extensions/owner-a/templates/WORKFLOW.md",
    destinations: ["extensions/owner-a/WORKFLOW.md"]
  }]
  register(registry, first, emptyHandlers())
  const before = registry.snapshot()

  const second = completeManifest("local.owner-b")
  second.schemas[3].id = "shared.collision"
  second.result_sinks[0].payload_schema = "shared.collision"
  const handlers = completeHandlers(second)
  assertRegistryError(
    () => register(registry, second, handlers, ownerContext("local.owner-b")),
    "contribution.registry.duplicate_identifier"
  )
  assert.strictEqual(registry.snapshot(), before)
  assert.equal(registry.getActionProvider(second.action_providers[0].id), undefined)
})

test("enforces the agent singleton even when the declared agent identifiers differ", () => {
  const registry = new ContributionRegistry()
  register(registry, completeManifest())
  const before = registry.snapshot()
  const second = completeManifest("local.owner-b")

  assert.notEqual(second.agent_provider.id, completeManifest().agent_provider.id)
  assertRegistryError(
    () => register(registry, second, completeHandlers(second), ownerContext("local.owner-b")),
    "contribution.registry.agent_provider_conflict"
  )
  assert.strictEqual(registry.snapshot(), before)
})

test("constructs a frozen disposable before the commit seam and publishes nothing when commit fails", () => {
  let pending
  const registry = new ContributionRegistry({
    beforeCommit(value) {
      pending = value
      assert.equal(Object.isFrozen(value.disposable), true)
      assertDeepFrozen(value.snapshot)
      throw new Error("injected commit failure")
    }
  })
  const before = registry.snapshot()

  assertRegistryError(() => register(registry, completeManifest()), "contribution.registry.commit_failed")
  assert.ok(pending)
  assert.strictEqual(registry.snapshot(), before)
  assert.equal(registry.getActionProvider("owner.a.action"), undefined)
})

test("snapshots caller manifests, handler Maps, and callable handler members", async () => {
  const registry = new ContributionRegistry()
  const manifest = completeManifest()
  let result = "original"
  const actionHandler = {
    id: manifest.action_providers[0].id,
    sourceId: manifest.owner.id,
    execute: () => result
  }
  const handlers = completeHandlers(manifest)
  handlers.actionProviders.set(manifest.action_providers[0].id, actionHandler)
  const actionId = manifest.action_providers[0].id
  register(registry, manifest, handlers)

  manifest.owner.id = "local.mutated"
  manifest.action_providers[0].id = "mutated.action"
  manifest.action_providers.length = 0
  handlers.actionProviders.clear()
  handlers.preflightChecks.clear()
  handlers.resultSinks.clear()
  actionHandler.execute = () => "mutated"
  result = "captured-function"

  assert.equal(registry.getActionProviderMetadata(actionId).owner.id, "local.owner-a")
  assert.equal(registry.snapshot().actionProviders[0].id, actionId)
  assert.equal(await registry.getActionProvider(actionId).execute({}), "captured-function")
})

test("preserves plain action and agent method receivers after caller method replacement", async () => {
  const manifest = completeManifest()
  const actionId = manifest.action_providers[0].id
  const agentId = manifest.agent_provider.id
  const actionHandler = {
    id: actionId,
    state: "plain-action",
    execute(input) { return `${this.state}:${input.suffix}` }
  }
  const agentHandler = {
    state: "plain-agent",
    run(input) { return `${this.state}:${input.suffix}` }
  }
  const handlers = completeHandlers(manifest)
  handlers.actionProviders.set(actionId, actionHandler)
  handlers.agentProvider = agentHandler
  const registry = new ContributionRegistry()
  register(registry, manifest, handlers)

  actionHandler.execute = () => "replacement-action"
  agentHandler.run = () => "replacement-agent"

  assert.equal(await registry.getActionProvider(actionId).execute({ suffix: "ok" }), "plain-action:ok")
  assert.equal(await registry.getAgentProvider(agentId).run({ suffix: "ok" }), "plain-agent:ok")
})

test("accepts class prototype action and agent methods while preserving their receivers", async () => {
  const manifest = completeManifest()
  const actionId = manifest.action_providers[0].id
  const agentId = manifest.agent_provider.id
  class ClassActionProvider {
    constructor(id) {
      this.id = id
      this.state = "class-action"
    }

    execute(input) { return `${this.state}:${input.suffix}` }
  }
  class ClassAgentProvider {
    constructor() { this.state = "class-agent" }

    run(input) { return `${this.state}:${input.suffix}` }
  }
  const handlers = completeHandlers(manifest)
  handlers.actionProviders.set(actionId, new ClassActionProvider(actionId))
  handlers.agentProvider = new ClassAgentProvider()
  const registry = new ContributionRegistry()
  register(registry, manifest, handlers)

  ClassActionProvider.prototype.execute = () => "replacement-class-action"
  ClassAgentProvider.prototype.run = () => "replacement-class-agent"

  assert.equal(await registry.getActionProvider(actionId).execute({ suffix: "ok" }), "class-action:ok")
  assert.equal(await registry.getAgentProvider(agentId).run({ suffix: "ok" }), "class-agent:ok")
})

test("fails closed before Object.prototype pollution can manufacture provider methods", () => {
  const originalExecute = Object.getOwnPropertyDescriptor(Object.prototype, "execute")
  const originalRun = Object.getOwnPropertyDescriptor(Object.prototype, "run")
  const originalHandler = Object.getOwnPropertyDescriptor(Object.prototype, "handler")
  const actionManifest = completeManifest()
  const actionHandlers = completeHandlers(actionManifest)
  actionHandlers.actionProviders.set(actionManifest.action_providers[0].id, {
    id: actionManifest.action_providers[0].id
  })
  const agentManifest = completeManifest()
  const agentHandlers = completeHandlers(agentManifest)
  agentHandlers.agentProvider = {}
  const validManifest = completeManifest()
  const validHandlers = completeHandlers(validManifest)
  let pollutionReads = 0
  try {
    for (const key of ["execute", "run", "handler"]) {
      Object.defineProperty(Object.prototype, key, {
        configurable: true,
        get() {
          pollutionReads += 1
          return () => "polluted"
        }
      })
    }

    assertRegistryError(
      () => register(new ContributionRegistry(), actionManifest, actionHandlers),
      "contribution.registry.manifest_invalid"
    )

    assertRegistryError(
      () => register(new ContributionRegistry(), agentManifest, agentHandlers),
      "contribution.registry.manifest_invalid"
    )
    assertRegistryError(
      () => register(new ContributionRegistry(), validManifest, validHandlers),
      "contribution.registry.manifest_invalid"
    )
  } finally {
    if (originalExecute) Object.defineProperty(Object.prototype, "execute", originalExecute)
    else delete Object.prototype.execute
    if (originalRun) Object.defineProperty(Object.prototype, "run", originalRun)
    else delete Object.prototype.run
    if (originalHandler) Object.defineProperty(Object.prototype, "handler", originalHandler)
    else delete Object.prototype.handler
  }
  assert.equal(pollutionReads, 0)
})

test("normalizes handler prototype traversal traps and cycles into fixed errors", () => {
  const manifest = completeManifest()
  const actionId = manifest.action_providers[0].id
  const forged = new ContributionRegistryError(
    "contribution.registry.reentrant_mutation",
    "forged prototype failure",
    "forged.prototype"
  )
  forged.handler = () => "secret"
  let prototypeReads = 0
  const trappedHandler = new Proxy({ id: actionId }, {
    getPrototypeOf() {
      prototypeReads += 1
      throw forged
    }
  })
  const trappedHandlers = completeHandlers(manifest)
  trappedHandlers.actionProviders.set(actionId, trappedHandler)
  let caught
  try {
    register(new ContributionRegistry(), manifest, trappedHandlers)
  } catch (error) {
    caught = error
  }
  assert.ok(caught instanceof ContributionRegistryError)
  assert.notStrictEqual(caught, forged)
  assert.equal(caught.code, "contribution.registry.handler_set_invalid")
  assert.equal(Object.prototype.hasOwnProperty.call(caught, "handler"), false)
  assert.equal(prototypeReads, 1)

  let cyclicHandler
  cyclicHandler = new Proxy({ id: actionId }, {
    getPrototypeOf() { return cyclicHandler }
  })
  const cyclicHandlers = completeHandlers(manifest)
  cyclicHandlers.actionProviders.set(actionId, cyclicHandler)
  assertRegistryError(
    () => register(new ContributionRegistry(), manifest, cyclicHandlers),
    "contribution.registry.handler_set_invalid"
  )
})

test("deep-freezes plain metadata and never serializes or stringifies handlers", () => {
  const secret = "HANDLER_SECRET_MUST_NOT_LEAK"
  const execute = () => secret
  execute.toString = () => { throw new Error(secret) }
  const manifest = completeManifest()
  const registry = new ContributionRegistry()
  register(registry, manifest, completeHandlers(manifest, { execute }))

  const snapshot = registry.snapshot()
  const metadata = registry.getActionProviderMetadata(manifest.action_providers[0].id)
  assertDeepFrozen(snapshot)
  assertDeepFrozen(metadata)
  assert.doesNotMatch(JSON.stringify(snapshot), new RegExp(secret))
  assert.doesNotMatch(JSON.stringify(metadata), new RegExp(secret))
  assert.equal(String(metadata), "[object Object]")
  assert.equal(Object.prototype.hasOwnProperty.call(metadata, "handler"), false)
})

test("keeps every runtime handler slot non-enumerable and non-serializable", () => {
  const secret = "INTERNAL_HANDLER_SECRET"
  const manifest = completeManifest()
  const handlers = completeHandlers(manifest, {
    execute: () => secret,
    preflight: () => secret,
    sink: async () => ({ ok: true, value: secret }),
    agent: { run: () => secret }
  })
  const registry = new ContributionRegistry()
  register(registry, manifest, handlers)

  const internalEntries = registry.state.ordered
  assert.equal(internalEntries.length, 9)
  for (const runtimeEntry of internalEntries) {
    const descriptor = Object.getOwnPropertyDescriptor(runtimeEntry, "handler")
    if (["action_provider", "preflight_check", "result_sink", "agent_provider"].includes(runtimeEntry.metadata.kind)) {
      assert.ok(descriptor, runtimeEntry.metadata.kind)
      assert.equal(descriptor.enumerable, false)
      assert.equal(descriptor.writable, false)
      assert.equal(descriptor.configurable, false)
      assert.equal(Object.keys(runtimeEntry).includes("handler"), false)
    } else {
      assert.equal(descriptor, undefined)
    }
    assert.doesNotMatch(JSON.stringify(runtimeEntry), new RegExp(secret))
  }
})

test("disposes contributions in reverse order exactly once", () => {
  const removed = []
  const registry = new ContributionRegistry({
    onRemove(metadata) { removed.push(`${metadata.kind}:${metadata.id}`) }
  })
  const manifest = completeManifest()
  const registration = register(registry, manifest)
  const forward = [
    ...manifest.action_providers.map((item) => `action_provider:${item.id}`),
    ...manifest.preflight_checks.map((item) => `preflight_check:${item.id}`),
    ...manifest.result_sinks.map((item) => `result_sink:${item.type}`),
    `agent_provider:${manifest.agent_provider.id}`,
    ...manifest.workflow_templates.map((item) => `workflow_template:${item.id}`),
    ...manifest.schemas.map((item) => `schema:${item.id}`)
  ]

  registration.dispose()
  registration.dispose()
  assert.deepEqual(removed, forward.reverse())
  assert.equal(registry.snapshot().schemas.length, 0)
})

test("protects a replacement registration from a stale disposable", async () => {
  const registry = new ContributionRegistry()
  const manifest = completeManifest()
  const oldRegistration = register(registry, manifest, completeHandlers(manifest, { execute: () => "old" }))
  oldRegistration.dispose()
  const newRegistration = register(registry, manifest, completeHandlers(manifest, { execute: () => "new" }))

  oldRegistration.dispose()
  assert.equal(await registry.getActionProvider(manifest.action_providers[0].id).execute({}), "new")
  newRegistration.dispose()
  assert.equal(registry.getActionProvider(manifest.action_providers[0].id), undefined)
})

test("protects a published registration from an unpublished stale disposable token", async () => {
  let commitAttempts = 0
  let unpublished
  const registry = new ContributionRegistry({
    beforeCommit({ disposable }) {
      commitAttempts += 1
      if (commitAttempts === 1) {
        unpublished = disposable
        throw new Error("fail the first publication")
      }
    }
  })
  const manifest = completeManifest()
  assertRegistryError(
    () => register(registry, manifest, completeHandlers(manifest, { execute: () => "unpublished" })),
    "contribution.registry.commit_failed"
  )
  assert.ok(unpublished)

  const live = register(registry, manifest, completeHandlers(manifest, { execute: () => "published" }))
  unpublished.dispose()
  assert.equal(await registry.getActionProvider(manifest.action_providers[0].id).execute({}), "published")
  live.dispose()
})

test("copies Array subclasses without invoking map, iteration, or Symbol.species", () => {
  let trapCalls = 0
  class HostileArray extends Array {
    static get [Symbol.species]() { trapCalls += 1; throw new Error("species trap") }
    map() { trapCalls += 1; throw new Error("map trap") }
    flatMap() { trapCalls += 1; throw new Error("flatMap trap") }
    [Symbol.iterator]() { trapCalls += 1; throw new Error("iterator trap") }
  }

  const manifest = completeManifest()
  for (const key of ["action_providers", "preflight_checks", "result_sinks", "workflow_templates", "schemas"]) {
    manifest[key] = new HostileArray(...manifest[key])
  }
  manifest.action_providers[0].error_codes = new HostileArray(...manifest.action_providers[0].error_codes)
  manifest.agent_provider.capabilities = new HostileArray(...manifest.agent_provider.capabilities)
  manifest.workflow_templates[0].destinations = new HostileArray(...manifest.workflow_templates[0].destinations)

  register(new ContributionRegistry(), manifest, completeHandlers(manifest))
  assert.equal(trapCalls, 0)
})

test("uses the captured Map iterator next intrinsic after its prototype is overridden", () => {
  const iteratorPrototype = Object.getPrototypeOf(new Map().entries())
  const originalDescriptor = Object.getOwnPropertyDescriptor(iteratorPrototype, "next")
  let trapCalls = 0
  try {
    Object.defineProperty(iteratorPrototype, "next", {
      ...originalDescriptor,
      value() {
        trapCalls += 1
        throw new Error("dynamic Map iterator next must not run")
      }
    })
    const manifest = completeManifest()
    register(new ContributionRegistry(), manifest, completeHandlers(manifest))
  } finally {
    Object.defineProperty(iteratorPrototype, "next", originalDescriptor)
  }
  assert.equal(trapCalls, 0)
})

test("does not consult inherited array indexes when an own manifest entry is absent", () => {
  let inheritedReads = 0
  const manifest = completeManifest()
  const sparse = []
  sparse.length = 1
  Object.setPrototypeOf(sparse, Object.create(Array.prototype, {
    0: { get() { inheritedReads += 1; throw new Error("prototype index trap") } }
  }))
  manifest.action_providers = sparse

  assertRegistryError(
    () => register(new ContributionRegistry(), manifest, completeHandlers(completeManifest())),
    "contribution.registry.manifest_invalid"
  )
  assert.equal(inheritedReads, 0)
})

test("rejects an agent declaration inherited from Object.prototype before registration", () => {
  const originalAgent = Object.getOwnPropertyDescriptor(Object.prototype, "agent_provider")
  const pollutedAgent = {
    id: "polluted.agent",
    contract_version: "polluted.agent.contract/v1",
    capabilities: ["polluted.chat"]
  }
  const manifest = emptyManifest()
  const handlers = { ...emptyHandlers(), agentProvider: { run: () => "polluted" } }
  const registry = new ContributionRegistry()
  const before = registry.snapshot()
  try {
    Object.defineProperty(Object.prototype, "agent_provider", {
      value: pollutedAgent,
      enumerable: false,
      configurable: true,
      writable: true
    })
    assertRegistryError(
      () => register(registry, manifest, handlers, ownerContext("local.owner-a")),
      "contribution.registry.manifest_invalid"
    )
  } finally {
    if (originalAgent) Object.defineProperty(Object.prototype, "agent_provider", originalAgent)
    else delete Object.prototype.agent_provider
  }

  assert.strictEqual(registry.snapshot(), before)
  assert.equal(registry.getAgentProvider("polluted.agent"), undefined)
  assert.equal(Object.isFrozen(pollutedAgent), false)
})

test("ignores agent, schema, constructor, and toJSON pollution injected by a manifest getter", () => {
  const originalAgent = Object.getOwnPropertyDescriptor(Object.prototype, "agent_provider")
  const originalSchemas = Object.getOwnPropertyDescriptor(Object.prototype, "schemas")
  const originalConstructor = Object.getOwnPropertyDescriptor(Object.prototype, "constructor")
  const originalToJSON = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON")
  const manifest = emptyManifest()
  const owner = manifest.owner
  delete manifest.schemas
  const handlers = { ...emptyHandlers(), agentProvider: { run: () => "polluted" } }
  const registry = new ContributionRegistry()
  const before = registry.snapshot()
  let getterReads = 0
  let constructorReads = 0
  let toJSONReads = 0
  Object.defineProperty(manifest, "owner", {
    enumerable: true,
    configurable: true,
    get() {
      getterReads += 1
      Object.defineProperty(Object.prototype, "agent_provider", {
        value: {
          id: "polluted.late-agent",
          contract_version: "polluted.late-agent.contract/v1",
          capabilities: ["polluted.late-chat"]
        },
        enumerable: false,
        configurable: true
      })
      Object.defineProperty(Object.prototype, "schemas", {
        value: [],
        enumerable: false,
        configurable: true
      })
      Object.defineProperty(Object.prototype, "constructor", {
        enumerable: false,
        configurable: true,
        get() { constructorReads += 1; throw new Error("polluted constructor") }
      })
      Object.defineProperty(Object.prototype, "toJSON", {
        enumerable: false,
        configurable: true,
        get() { toJSONReads += 1; throw new Error("polluted toJSON") }
      })
      return owner
    }
  })

  try {
    assertRegistryError(
      () => register(registry, manifest, handlers, ownerContext("local.owner-a")),
      "contribution.registry.manifest_invalid"
    )
  } finally {
    if (originalAgent) Object.defineProperty(Object.prototype, "agent_provider", originalAgent)
    else delete Object.prototype.agent_provider
    if (originalSchemas) Object.defineProperty(Object.prototype, "schemas", originalSchemas)
    else delete Object.prototype.schemas
    if (originalConstructor) Object.defineProperty(Object.prototype, "constructor", originalConstructor)
    else delete Object.prototype.constructor
    if (originalToJSON) Object.defineProperty(Object.prototype, "toJSON", originalToJSON)
    else delete Object.prototype.toJSON
  }

  assert.equal(getterReads, 1)
  assert.equal(constructorReads, 0)
  assert.equal(toJSONReads, 0)
  assert.strictEqual(registry.snapshot(), before)
  assert.equal(registry.getAgentProvider("polluted.late-agent"), undefined)
})

test("rejects late Array.prototype map replacement before validating schema paths", () => {
  const originalMap = Object.getOwnPropertyDescriptor(Array.prototype, "map")
  const manifest = emptyManifest()
  const unsafeSchemaId = "owner.a.schema.unsafe"
  const unsafeSchemas = [{ id: unsafeSchemaId, path: "../outside-owner.json" }]
  const registry = new ContributionRegistry()
  const before = registry.snapshot()
  let caught
  let registration
  Object.defineProperty(manifest, "schemas", {
    enumerable: true,
    configurable: true,
    get() {
      Object.defineProperty(Array.prototype, "map", {
        ...originalMap,
        value() { return [] }
      })
      return unsafeSchemas
    }
  })

  try {
    try {
      registration = register(registry, manifest, emptyHandlers())
    } catch (error) {
      caught = error
    }
  } finally {
    Object.defineProperty(Array.prototype, "map", originalMap)
  }
  const afterAttempt = registry.snapshot()
  registration?.dispose()

  assertRegistryError(() => { throw caught }, "contribution.registry.manifest_invalid")
  assert.strictEqual(afterAttempt, before)
  assert.equal(registry.getSchemaMetadata(unsafeSchemaId), undefined)
})

test("rejects late Array.prototype flatMap replacement before validating workflow paths", () => {
  const originalFlatMap = Object.getOwnPropertyDescriptor(Array.prototype, "flatMap")
  const manifest = emptyManifest()
  const unsafeTemplateId = "owner.a.template.unsafe"
  manifest.workflow_templates = [{
    id: unsafeTemplateId,
    source: "../outside-owner/WORKFLOW.md",
    destinations: ["extensions/owner-a/WORKFLOW.md"]
  }]
  const schemas = manifest.schemas
  const registry = new ContributionRegistry()
  const before = registry.snapshot()
  let caught
  let registration
  Object.defineProperty(manifest, "schemas", {
    enumerable: true,
    configurable: true,
    get() {
      Object.defineProperty(Array.prototype, "flatMap", {
        ...originalFlatMap,
        value() { return [] }
      })
      return schemas
    }
  })

  try {
    try {
      registration = register(registry, manifest, emptyHandlers())
    } catch (error) {
      caught = error
    }
  } finally {
    Object.defineProperty(Array.prototype, "flatMap", originalFlatMap)
  }
  const afterAttempt = registry.snapshot()
  registration?.dispose()

  assertRegistryError(() => { throw caught }, "contribution.registry.manifest_invalid")
  assert.strictEqual(afterAttempt, before)
  assert.equal(registry.getWorkflowTemplateMetadata(unsafeTemplateId), undefined)
})

test("rejects late replacement of every non-object validator primordial prototype", () => {
  const cases = [
    [Function.prototype, "call"],
    [Map.prototype, "get"],
    [Set.prototype, "has"],
    [String.prototype, "includes"],
    [RegExp.prototype, "exec"]
  ]

  for (const [prototype, key] of cases) {
    const original = Object.getOwnPropertyDescriptor(prototype, key)
    const originalMethod = original.value
    const manifest = emptyManifest()
    const schemas = manifest.schemas
    const registry = new ContributionRegistry()
    const before = registry.snapshot()
    let caught
    let registration
    Object.defineProperty(manifest, "schemas", {
      enumerable: true,
      configurable: true,
      get() {
        Object.defineProperty(prototype, key, {
          ...original,
          value(...args) { return Reflect.apply(originalMethod, this, args) }
        })
        return schemas
      }
    })

    try {
      try {
        registration = register(registry, manifest, emptyHandlers())
      } catch (error) {
        caught = error
      }
    } finally {
      Object.defineProperty(prototype, key, original)
    }
    const afterAttempt = registry.snapshot()
    registration?.dispose()

    assertRegistryError(() => { throw caught }, "contribution.registry.manifest_invalid")
    assert.strictEqual(afterAttempt, before)
  }
})

test("uses captured calls, array appends, and Symbol after hostile handler getters", async () => {
  const originalCall = Object.getOwnPropertyDescriptor(Function.prototype, "call")
  const originalPush = Object.getOwnPropertyDescriptor(Array.prototype, "push")
  const originalSymbol = Object.getOwnPropertyDescriptor(globalThis, "Symbol")
  const manifest = completeManifest()
  const handlers = completeHandlers(manifest)
  const action = handlers.actionProviders.get(manifest.action_providers[0].id)
  const execute = action.execute
  let executeReads = 0
  Object.defineProperty(action, "execute", {
    enumerable: true,
    configurable: true,
    get() {
      executeReads += 1
      Object.defineProperty(Function.prototype, "call", {
        ...originalCall,
        value() { throw new Error("dynamic Function.prototype.call must not run") }
      })
      Object.defineProperty(Array.prototype, "push", {
        ...originalPush,
        value() { throw new Error("dynamic Array.prototype.push must not run") }
      })
      Object.defineProperty(globalThis, "Symbol", {
        ...originalSymbol,
        value() { throw new Error("dynamic global Symbol must not run") }
      })
      return execute
    }
  })
  const registry = new ContributionRegistry()
  let registration
  let caught

  try {
    try {
      registration = register(registry, manifest, handlers)
    } catch (error) {
      caught = error
    }
  } finally {
    Object.defineProperty(Function.prototype, "call", originalCall)
    Object.defineProperty(Array.prototype, "push", originalPush)
    Object.defineProperty(globalThis, "Symbol", originalSymbol)
  }

  assert.ifError(caught)
  assert.ok(registration)
  assert.equal(executeReads, 1)
  assert.equal(await registry.getActionProvider(manifest.action_providers[0].id).execute({}), "action-result")
})

test("does not iterate an allowlist after a hostile handler ownKeys trap", () => {
  const iteratorKey = Symbol.iterator
  const originalIterator = Object.getOwnPropertyDescriptor(Array.prototype, iteratorKey)
  const manifest = completeManifest()
  const target = completeHandlers(manifest)
  const handlers = new Proxy(target, {
    ownKeys(value) {
      Object.defineProperty(Array.prototype, iteratorKey, {
        ...originalIterator,
        value() { throw new Error("dynamic Array iterator must not run") }
      })
      return Reflect.ownKeys(value)
    }
  })
  const registry = new ContributionRegistry()
  let registration
  let caught

  try {
    try {
      registration = register(registry, manifest, handlers)
    } catch (error) {
      caught = error
    }
  } finally {
    Object.defineProperty(Array.prototype, iteratorKey, originalIterator)
  }

  assert.ifError(caught)
  assert.ok(registration)
  assert.equal(registry.snapshot().actionProviders.length, 1)
})

test("uses the captured Map size getter after a hostile handler property read", () => {
  const originalSize = Object.getOwnPropertyDescriptor(Map.prototype, "size")
  const manifest = completeManifest()
  const target = completeHandlers(manifest)
  const actionProviders = target.actionProviders
  Object.defineProperty(target, "actionProviders", {
    enumerable: true,
    configurable: true,
    get() {
      Object.defineProperty(Map.prototype, "size", {
        ...originalSize,
        get() { return 0 }
      })
      return actionProviders
    }
  })
  const registry = new ContributionRegistry()
  let registration
  let caught

  try {
    try {
      registration = register(registry, manifest, target)
    } catch (error) {
      caught = error
    }
  } finally {
    Object.defineProperty(Map.prototype, "size", originalSize)
  }

  assert.ifError(caught)
  assert.ok(registration)
  assert.equal(registry.snapshot().actionProviders.length, 1)
})

test("rejects registry state and lifecycle pollution injected by a handler getter", () => {
  const originalAgentId = Object.getOwnPropertyDescriptor(Object.prototype, "agentId")
  const originalBeforeCommit = Object.getOwnPropertyDescriptor(Object.prototype, "beforeCommit")
  const originalOnRemove = Object.getOwnPropertyDescriptor(Object.prototype, "onRemove")
  const manifest = completeManifest()
  const handlers = completeHandlers(manifest)
  const action = handlers.actionProviders.get(manifest.action_providers[0].id)
  const execute = action.execute
  let pollutedHookCalls = 0
  Object.defineProperty(action, "execute", {
    enumerable: true,
    configurable: true,
    get() {
      Object.defineProperty(Object.prototype, "agentId", {
        configurable: true,
        value: "polluted.agent"
      })
      for (const key of ["beforeCommit", "onRemove"]) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          value() { pollutedHookCalls += 1 }
        })
      }
      return execute
    }
  })
  const registry = new ContributionRegistry()
  const before = registry.snapshot()
  let caught

  try {
    try {
      register(registry, manifest, handlers)
    } catch (error) {
      caught = error
    }
  } finally {
    if (originalAgentId) Object.defineProperty(Object.prototype, "agentId", originalAgentId)
    else delete Object.prototype.agentId
    if (originalBeforeCommit) Object.defineProperty(Object.prototype, "beforeCommit", originalBeforeCommit)
    else delete Object.prototype.beforeCommit
    if (originalOnRemove) Object.defineProperty(Object.prototype, "onRemove", originalOnRemove)
    else delete Object.prototype.onRemove
  }

  assert.ok(caught instanceof ContributionRegistryError)
  assert.equal(caught.code, "contribution.registry.handler_set_invalid")
  assert.equal(pollutedHookCalls, 0)
  assert.strictEqual(registry.snapshot(), before)
})

test("keeps pre-existing snapshots and caught errors inert while rejecting late Object.prototype pollution", () => {
  const originalToJSON = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON")
  const coercionKey = Symbol.toPrimitive
  const originalCoercion = Object.getOwnPropertyDescriptor(Object.prototype, coercionKey)
  let pending
  const registry = new ContributionRegistry({
    beforeCommit(value) { pending = value }
  })
  const publishedManifest = completeManifest()
  const live = register(registry, publishedManifest, completeHandlers(publishedManifest))
  const before = registry.snapshot()
  const metadata = registry.getActionProviderMetadata(publishedManifest.action_providers[0].id)
  const provider = registry.getActionProvider(publishedManifest.action_providers[0].id)
  const manifest = completeManifest()
  const handlers = completeHandlers(manifest)
  const action = handlers.actionProviders.get(manifest.action_providers[0].id)
  const execute = action.execute
  let pollutedToJSONCalls = 0
  let pollutedCoercionCalls = 0
  let caught
  let serializedPublicValues
  let coercedRegistry
  let coercedError
  Object.defineProperty(action, "execute", {
    enumerable: true,
    configurable: true,
    get() {
      Object.defineProperty(Object.prototype, "toJSON", {
        configurable: true,
        value() {
          pollutedToJSONCalls += 1
          return "HANDLER_SECRET_MUST_NOT_LEAK"
        }
      })
      Object.defineProperty(Object.prototype, coercionKey, {
        configurable: true,
        value() {
          pollutedCoercionCalls += 1
          return "HANDLER_COERCION_SECRET_MUST_NOT_LEAK"
        }
      })
      return execute
    }
  })

  try {
    try {
      register(registry, manifest, handlers)
    } catch (error) {
      caught = error
      serializedPublicValues = [registry, before, metadata, provider, provider.execute, pending, live, live.dispose, error]
        .map((value) => JSON.stringify(value))
      coercedRegistry = String(registry)
      coercedError = String(error)
    }
  } finally {
    if (originalToJSON) Object.defineProperty(Object.prototype, "toJSON", originalToJSON)
    else delete Object.prototype.toJSON
    if (originalCoercion) Object.defineProperty(Object.prototype, coercionKey, originalCoercion)
    else delete Object.prototype[coercionKey]
  }

  assert.ok(caught instanceof ContributionRegistryError)
  assert.equal(caught.code, "contribution.registry.handler_set_invalid")
  assert.match(caught.message, /^Contribution handler modified the object runtime\.$/)
  assert.match(coercedError, /^ContributionRegistryError: /)
  assert.equal(coercedRegistry, "[object Object]")
  for (const serialized of serializedPublicValues) {
    assert.equal(
      serialized === undefined || !serialized.includes("HANDLER_SECRET_MUST_NOT_LEAK"),
      true
    )
  }
  assert.equal(pollutedToJSONCalls, 0)
  assert.equal(pollutedCoercionCalls, 0)
  assert.strictEqual(registry.snapshot(), before)
  assert.ok(registry instanceof ContributionRegistry)
  for (const publicValue of [registry, before, metadata, provider, provider.execute, pending, live, live.dispose]) {
    assert.equal(Object.prototype.isPrototypeOf(publicValue), false)
  }
  const resumed = register(registry, emptyManifest("local.owner-b"), emptyHandlers(), ownerContext("local.owner-b"))
  resumed.dispose()
  assert.equal(registry.snapshot().actionProviders.length, before.actionProviders.length)
  assert.equal(registry.getActionProvider(publishedManifest.action_providers[0].id), provider)
  live.dispose()
})

test("keeps native Error compatibility without consulting active Object.prototype hooks", () => {
  const originalToJSON = Object.getOwnPropertyDescriptor(Object.prototype, "toJSON")
  const originalThen = Object.getOwnPropertyDescriptor(Object.prototype, "then")
  const coercionKey = Symbol.toPrimitive
  const originalCoercion = Object.getOwnPropertyDescriptor(Object.prototype, coercionKey)
  const inspectionKey = Symbol.for("nodejs.util.inspect.custom")
  const originalInspection = Object.getOwnPropertyDescriptor(Object.prototype, inspectionKey)
  const manifest = completeManifest()
  const handlers = completeHandlers(manifest)
  const action = handlers.actionProviders.get(manifest.action_providers[0].id)
  const execute = action.execute
  let pollutedToJSONCalls = 0
  let pollutedCoercionCalls = 0
  let pollutedLookupCalls = 0
  let caught
  let serializedError
  let coercedError
  let inheritedThen
  let inheritedInspection
  Object.defineProperty(action, "execute", {
    enumerable: true,
    configurable: true,
    get() {
      Object.defineProperty(Object.prototype, "toJSON", {
        configurable: true,
        value() {
          pollutedToJSONCalls += 1
          return "ERROR_JSON_SECRET_MUST_NOT_LEAK"
        }
      })
      Object.defineProperty(Object.prototype, coercionKey, {
        configurable: true,
        value() {
          pollutedCoercionCalls += 1
          return "ERROR_COERCION_SECRET_MUST_NOT_LEAK"
        }
      })
      for (const key of ["then", inspectionKey]) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          get() {
            pollutedLookupCalls += 1
            throw new Error("dynamic Object.prototype lookup must not run")
          }
        })
      }
      return execute
    }
  })

  try {
    try {
      register(new ContributionRegistry(), manifest, handlers)
    } catch (error) {
      caught = error
      serializedError = JSON.stringify(error)
      coercedError = String(error)
      inheritedThen = error.then
      inheritedInspection = error[inspectionKey]
    }
  } finally {
    if (originalToJSON) Object.defineProperty(Object.prototype, "toJSON", originalToJSON)
    else delete Object.prototype.toJSON
    if (originalThen) Object.defineProperty(Object.prototype, "then", originalThen)
    else delete Object.prototype.then
    if (originalCoercion) Object.defineProperty(Object.prototype, coercionKey, originalCoercion)
    else delete Object.prototype[coercionKey]
    if (originalInspection) Object.defineProperty(Object.prototype, inspectionKey, originalInspection)
    else delete Object.prototype[inspectionKey]
  }

  assert.ok(caught instanceof ContributionRegistryError)
  assert.ok(caught instanceof Error)
  assert.equal(Object.isFrozen(caught), true)
  assert.equal(caught.code, "contribution.registry.handler_set_invalid")
  assert.equal(caught.message, "Contribution handler modified the object runtime.")
  assert.match(coercedError, /^ContributionRegistryError: Contribution handler modified the object runtime\.$/)
  assert.doesNotMatch(serializedError, /ERROR_JSON_SECRET_MUST_NOT_LEAK/)
  assert.equal(inheritedThen, undefined)
  assert.equal(inheritedInspection, undefined)
  assert.equal(pollutedToJSONCalls, 0)
  assert.equal(pollutedCoercionCalls, 0)
  assert.equal(pollutedLookupCalls, 0)
})

test("rejects every late Object.prototype descriptor mutation and keeps prior snapshots inert", () => {
  const coercionKey = Symbol.toPrimitive
  const originalCoercion = Object.getOwnPropertyDescriptor(Object.prototype, coercionKey)
  const manifest = completeManifest()
  const handlers = completeHandlers(manifest)
  const action = handlers.actionProviders.get(manifest.action_providers[0].id)
  const execute = action.execute
  const registry = new ContributionRegistry()
  const before = registry.snapshot()
  let pollutedCoercionCalls = 0
  let caught
  let registration
  let coercedSnapshot
  Object.defineProperty(action, "execute", {
    enumerable: true,
    configurable: true,
    get() {
      Object.defineProperty(Object.prototype, coercionKey, {
        configurable: true,
        value() {
          pollutedCoercionCalls += 1
          return "HANDLER_COERCION_SECRET_MUST_NOT_LEAK"
        }
      })
      return execute
    }
  })

  try {
    try {
      registration = register(registry, manifest, handlers)
    } catch (error) {
      caught = error
    }
    coercedSnapshot = String(before)
  } finally {
    if (originalCoercion) Object.defineProperty(Object.prototype, coercionKey, originalCoercion)
    else delete Object.prototype[coercionKey]
  }
  const afterAttempt = registry.snapshot()
  registration?.dispose()

  assert.ok(caught instanceof ContributionRegistryError)
  assert.equal(caught.code, "contribution.registry.handler_set_invalid")
  assert.equal(coercedSnapshot, "[object Object]")
  assert.equal(pollutedCoercionCalls, 0)
  assert.strictEqual(afterAttempt, before)
})

test("reads manifest and callable handler accessors exactly once", () => {
  const source = completeManifest()
  let actionArrayReads = 0
  let actionIdReads = 0
  let executeReads = 0
  let runReads = 0
  const action = source.action_providers[0]
  Object.defineProperty(action, "id", {
    enumerable: true,
    configurable: true,
    get() { actionIdReads += 1; return "owner.a.action" }
  })
  Object.defineProperty(source, "action_providers", {
    enumerable: true,
    configurable: true,
    get() { actionArrayReads += 1; return [action] }
  })
  const handlers = completeHandlers(completeManifest())
  const actionHandler = handlers.actionProviders.get("owner.a.action")
  const execute = actionHandler.execute
  Object.defineProperty(actionHandler, "execute", {
    enumerable: true,
    configurable: true,
    get() { executeReads += 1; return execute }
  })
  const agent = {}
  Object.defineProperty(agent, "run", {
    enumerable: true,
    get() { runReads += 1; return () => "agent" }
  })
  handlers.agentProvider = agent

  register(new ContributionRegistry(), source, handlers)
  assert.equal(actionArrayReads, 1)
  assert.equal(actionIdReads, 1)
  assert.equal(executeReads, 1)
  assert.equal(runReads, 1)
})

test("captures each manifest property before later accessors mutate the source", () => {
  const source = completeManifest()
  const originalAction = source.action_providers[0]
  let schemas = source.schemas
  Object.defineProperty(source, "schemas", {
    enumerable: true,
    configurable: true,
    get() {
      originalAction.id = "mutated.after.capture"
      originalAction.handler = () => "secret"
      return schemas
    }
  })
  const registry = new ContributionRegistry()
  register(registry, source, completeHandlers(completeManifest()))

  const metadata = registry.getActionProviderMetadata("owner.a.action")
  assert.equal(metadata.id, "owner.a.action")
  assert.equal(Object.prototype.hasOwnProperty.call(metadata.declaration, "handler"), false)
})

test("replaces forged public registry errors from untrusted getters with fresh fixed errors", () => {
  const source = completeManifest()
  const forged = new ContributionRegistryError(
    "contribution.registry.reentrant_mutation",
    `forged ${"界".repeat(300)}`,
    "forged"
  )
  forged.handler = () => "secret"
  Object.defineProperty(source, "owner", {
    enumerable: true,
    get() { throw forged }
  })

  let caught
  try {
    register(
      new ContributionRegistry(),
      source,
      completeHandlers(completeManifest()),
      ownerContext("local.owner-a")
    )
  } catch (error) {
    caught = error
  }
  assert.ok(caught instanceof ContributionRegistryError)
  assert.notStrictEqual(caught, forged)
  assert.equal(caught.code, "contribution.registry.manifest_invalid")
  assert.equal(Object.prototype.hasOwnProperty.call(caught, "handler"), false)
  assert.doesNotMatch(caught.message, /secret|forged|界/)

  const revoked = Proxy.revocable({}, {})
  revoked.revoke()
  const revokedSource = completeManifest()
  Object.defineProperty(revokedSource, "owner", {
    enumerable: true,
    get() { throw revoked.proxy }
  })
  assertRegistryError(
    () => register(
      new ContributionRegistry(),
      revokedSource,
      completeHandlers(completeManifest()),
      ownerContext("local.owner-a")
    ),
    "contribution.registry.manifest_invalid"
  )

  const revokedHandler = Proxy.revocable({}, {})
  revokedHandler.revoke()
  const handlerManifest = completeManifest()
  const handlerSet = completeHandlers(handlerManifest)
  const hostileAction = { id: handlerManifest.action_providers[0].id }
  Object.defineProperty(hostileAction, "execute", {
    enumerable: true,
    get() { throw revokedHandler.proxy }
  })
  handlerSet.actionProviders.set(handlerManifest.action_providers[0].id, hostileAction)
  assertRegistryError(
    () => register(new ContributionRegistry(), handlerManifest, handlerSet),
    "contribution.registry.handler_set_invalid"
  )
})

test("sanitizes and UTF-8 bounds manifest diagnostics and duplicate echoes", () => {
  const hostile = `bad\u0000\n${"界".repeat(300)}`
  const invalid = completeManifest()
  invalid[hostile] = true
  assertRegistryError(
    () => register(new ContributionRegistry(), invalid, completeHandlers(invalid)),
    "contribution.registry.manifest_invalid"
  )

  const registry = new ContributionRegistry()
  const longId = `x${"y".repeat(199)}`
  const first = emptyManifest()
  first.workflow_templates = [{
    id: longId,
    source: "extensions/owner-a/templates/WORKFLOW.md",
    destinations: ["extensions/owner-a/WORKFLOW.md"]
  }]
  register(registry, first, emptyHandlers())
  const second = emptyManifest("local.owner-b")
  second.workflow_templates = [{
    id: longId,
    source: "extensions/owner-b/templates/WORKFLOW.md",
    destinations: ["extensions/owner-b/WORKFLOW.md"]
  }]
  assertRegistryError(
    () => register(registry, second, emptyHandlers(), ownerContext("local.owner-b")),
    "contribution.registry.duplicate_identifier"
  )
})

test("blocks nested registration before untrusted reads and releases the mutation guard after failure", () => {
  const registry = new ContributionRegistry()
  const outer = completeManifest()
  Object.defineProperty(outer, "owner", {
    enumerable: true,
    get() {
      register(registry, emptyManifest("local.owner-b"), emptyHandlers(), ownerContext("local.owner-b"))
      return { id: "local.owner-a", version: "1.0.0" }
    }
  })
  const before = registry.snapshot()

  assertRegistryError(
    () => register(
      registry,
      outer,
      completeHandlers(completeManifest()),
      ownerContext("local.owner-a")
    ),
    "contribution.registry.reentrant_mutation"
  )
  assert.strictEqual(registry.snapshot(), before)
  register(registry, completeManifest(), completeHandlers(completeManifest()))
  assert.equal(registry.snapshot().actionProviders.length, 1)
})

test("blocks live disposal from a getter without consuming the disposable and releases the guard", () => {
  const registry = new ContributionRegistry()
  const first = completeManifest()
  const live = register(registry, first)
  const before = registry.snapshot()
  const outer = emptyManifest("local.owner-b")
  Object.defineProperty(outer, "owner", {
    enumerable: true,
    get() {
      live.dispose()
      return { id: "local.owner-b", version: "1.0.0" }
    }
  })

  assertRegistryError(
    () => register(registry, outer, emptyHandlers(), ownerContext("local.owner-b")),
    "contribution.registry.reentrant_mutation"
  )
  assert.strictEqual(registry.snapshot(), before)
  live.dispose()
  assert.equal(registry.snapshot().actionProviders.length, 0)
  register(registry, emptyManifest("local.owner-b"), emptyHandlers(), ownerContext("local.owner-b"))
})

test("runs an instance manifest policy on the frozen validated snapshot before reading handlers", () => {
  const sentinel = new Error("incompatible registry range")
  let policySnapshot
  let handlerReads = 0
  const registry = new ContributionRegistry({
    manifestPolicy(manifest) {
      policySnapshot = manifest
      assertDeepFrozen(manifest)
      assert.equal(Object.getPrototypeOf(manifest), null)
      assert.equal(Object.getPrototypeOf(manifest.owner), null)
      assert.equal(Object.getPrototypeOf(manifest.registry_api), null)
      assert.equal(Object.getPrototypeOf(manifest.action_providers[0]), null)
      throw sentinel
    }
  })
  const handlers = {}
  for (const key of ["actionProviders", "preflightChecks", "resultSinks", "agentProvider"]) {
    Object.defineProperty(handlers, key, {
      enumerable: true,
      get() { handlerReads += 1; return key === "agentProvider" ? { run() {} } : new Map() }
    })
  }
  const before = registry.snapshot()

  assert.throws(() => register(registry, completeManifest(), handlers), (error) => error === sentinel)
  assert.ok(policySnapshot)
  assert.equal(handlerReads, 0)
  assert.strictEqual(registry.snapshot(), before)
})
