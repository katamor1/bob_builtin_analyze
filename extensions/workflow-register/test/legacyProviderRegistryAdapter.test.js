"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const adapterModulePath = path.resolve(__dirname, "../out/api/legacyContributionAdapter.js")

function loadAdapterModule() {
  assert.ok(
    fs.existsSync(adapterModulePath),
    "legacy provider registry adapter module must exist"
  )
  delete require.cache[adapterModulePath]
  return require(adapterModulePath)
}

function createAdapter(options) {
  const { createLegacyContributionAdapter } = loadAdapterModule()
  assert.equal(typeof createLegacyContributionAdapter, "function")
  const adapter = createLegacyContributionAdapter(options)
  assert.equal(typeof adapter?.registerLegacyContributionSet, "function")
  return adapter
}

function emptyManifest(ownerId = "local.legacy-a", version = "1.0.0") {
  return {
    schema_version: "workflow-contributions/v1",
    owner: { id: ownerId, version },
    registry_api: { min: "provider-registry/v1", max: "provider-registry/v1" },
    action_providers: [],
    preflight_checks: [],
    result_sinks: [],
    workflow_templates: [],
    workflow_claims: [],
    workflow_exclusions: [],
    external_commands: [],
    schemas: []
  }
}

function actionManifest({
  ownerId = "local.legacy-a",
  version = "1.0.0",
  actionIds = ["legacy.action"],
  schemaPrefix = "legacy-a"
} = {}) {
  const manifest = emptyManifest(ownerId, version)
  for (let index = 0; index < actionIds.length; index += 1) {
    const id = actionIds[index]
    const schemaId = `${schemaPrefix}.action-${index + 1}`
    manifest.action_providers.push({
      id,
      contract_version: `${schemaPrefix}.action-${index + 1}/v1`,
      input_schema: `${schemaId}.input`,
      output_schema: `${schemaId}.output`,
      error_codes: []
    })
    manifest.schemas.push(
      {
        id: `${schemaId}.input`,
        path: `extensions/${ownerId.split(".")[1]}/schema/action-${index + 1}-input.json`
      },
      {
        id: `${schemaId}.output`,
        path: `extensions/${ownerId.split(".")[1]}/schema/action-${index + 1}-output.json`
      }
    )
  }
  return manifest
}

function provenance(ownerId = "local.legacy-a", version = "1.0.0") {
  return {
    expectedOwner: { id: ownerId, version },
    ownerDirectory: `extensions/${ownerId.split(".")[1]}`
  }
}

function emptyHandlers() {
  return {
    actionProviders: new Map(),
    preflightChecks: new Map(),
    resultSinks: new Map()
  }
}

function actionHandlers(manifest, label = "legacy") {
  return {
    actionProviders: new Map(manifest.action_providers.map((declaration) => [
      declaration.id,
      {
        id: declaration.id,
        sourceId: manifest.owner.id,
        execute: async () => label
      }
    ])),
    preflightChecks: new Map(),
    resultSinks: new Map()
  }
}

function fakeApi(overrides = {}) {
  const calls = {
    negotiate: [],
    register: []
  }
  const registration = overrides.registration ?? { dispose() {} }
  return {
    calls,
    registration,
    api: {
      apiVersion: "provider-registry/v1",
      negotiateProviderRegistry(range) {
        calls.negotiate.push(range)
        if (overrides.negotiateError) throw overrides.negotiateError
        return overrides.negotiatedVersion ?? "provider-registry/v1"
      },
      registerContributionSet(manifest, actualProvenance, handlers) {
        calls.register.push({ manifest, provenance: actualProvenance, handlers })
        if (overrides.registerError) throw overrides.registerError
        return registration
      }
    }
  }
}

test("publishes the fixed one-release deprecation policy", () => {
  const { LEGACY_CONTRIBUTION_ADAPTER_POLICY } = loadAdapterModule()

  assert.deepEqual(LEGACY_CONTRIBUTION_ADAPTER_POLICY, {
    deprecatedIn: "0.1.0",
    removeIn: "0.2.0",
    replacement: "provider-registry/v1"
  })
})

test("allows only host versions inside the configured deprecation window", () => {
  const cases = [
    { hostVersion: "0.0.9", allowed: false },
    { hostVersion: "0.1.0-beta.1", allowed: false },
    { hostVersion: "0.1.0", allowed: true },
    { hostVersion: "0.1.0+build.7", allowed: true },
    { hostVersion: "0.1.1-alpha.1", allowed: true },
    { hostVersion: "0.1.999", allowed: true },
    { hostVersion: "0.2.0-rc.1", allowed: true },
    { hostVersion: "0.2.0", allowed: false },
    { hostVersion: "0.2.0+build.1", allowed: false },
    { hostVersion: "0.2.1", allowed: false },
    { hostVersion: "invalid", allowed: false }
  ]

  for (const { hostVersion, allowed } of cases) {
    const host = fakeApi()
    const diagnostics = []
    const adapter = createAdapter({
      api: host.api,
      hostVersion,
      reportDiagnostic: (message) => diagnostics.push(message)
    })
    const operation = () => adapter.registerLegacyContributionSet(
      emptyManifest(),
      provenance(),
      emptyHandlers()
    )

    if (allowed) {
      assert.strictEqual(operation(), host.registration, hostVersion)
      assert.equal(host.calls.register.length, 1, hostVersion)
      assert.equal(diagnostics.length, 1, hostVersion)
    } else {
      assert.throws(operation, /legacy|adapter|version|removed|available/i, hostVersion)
      assert.equal(host.calls.negotiate.length, 0, hostVersion)
      assert.equal(host.calls.register.length, 0, hostVersion)
      assert.equal(diagnostics.length, 0, hostVersion)
    }
  }
})

test("rejects ownerless, versionless, and malformed calls before handlers or registry mutation", () => {
  const validManifest = emptyManifest()
  const validProvenance = provenance()
  const invalidCalls = [
    [undefined, validProvenance],
    [{ ...validManifest, owner: undefined }, validProvenance],
    [{ ...validManifest, owner: { version: "1.0.0" } }, validProvenance],
    [{ ...validManifest, owner: { id: "local.legacy-a" } }, validProvenance],
    [validManifest, undefined],
    [validManifest, { ownerDirectory: "extensions/legacy-a" }],
    [validManifest, {
      expectedOwner: { version: "1.0.0" },
      ownerDirectory: "extensions/legacy-a"
    }],
    [validManifest, {
      expectedOwner: { id: "local.legacy-a" },
      ownerDirectory: "extensions/legacy-a"
    }],
    [validManifest, {
      expectedOwner: { id: "local.legacy-a", version: "1.0.0" }
    }]
  ]

  for (const [manifest, actualProvenance] of invalidCalls) {
    const host = fakeApi()
    const diagnostics = []
    let handlerReads = 0
    const hostileHandlers = {}
    for (const key of ["actionProviders", "preflightChecks", "resultSinks"]) {
      Object.defineProperty(hostileHandlers, key, {
        enumerable: true,
        get() {
          handlerReads += 1
          throw new Error("handler must not be read")
        }
      })
    }
    const adapter = createAdapter({
      api: host.api,
      hostVersion: "0.1.0",
      reportDiagnostic: (message) => diagnostics.push(message)
    })

    assert.throws(
      () => adapter.registerLegacyContributionSet(manifest, actualProvenance, hostileHandlers),
      /legacy|manifest|owner|version|provenance|argument/i
    )
    assert.equal(handlerReads, 0)
    assert.equal(host.calls.negotiate.length, 0)
    assert.equal(host.calls.register.length, 0)
    assert.equal(diagnostics.length, 0)
  }
})

test("requires an exact provider-registry v1 negotiation result before registration", () => {
  const negotiationFailure = new Error("negotiation failed")
  for (const host of [
    fakeApi({ negotiatedVersion: "provider-registry/v2" }),
    fakeApi({ negotiateError: negotiationFailure })
  ]) {
    const diagnostics = []
    const adapter = createAdapter({
      api: host.api,
      hostVersion: "0.1.0",
      reportDiagnostic: (message) => diagnostics.push(message)
    })
    const operation = () => adapter.registerLegacyContributionSet(
      emptyManifest(),
      provenance(),
      emptyHandlers()
    )

    if (host.api.negotiateProviderRegistry === undefined) assert.fail("unreachable")
    assert.throws(operation)
    assert.equal(host.calls.negotiate.length, 1)
    assert.equal(host.calls.register.length, 0)
    assert.equal(diagnostics.length, 0)
  }
})

test("publishes no partial state when a late handler is invalid", () => {
  const { ProviderRegistryHost } = require("../out/api/providerRegistryApi")
  const host = new ProviderRegistryHost()
  const manifest = actionManifest({
    actionIds: ["legacy.first", "legacy.second"]
  })
  const handlers = actionHandlers(manifest)
  handlers.actionProviders.set("legacy.second", {
    id: "legacy.second",
    sourceId: manifest.owner.id,
    execute: 42
  })
  const diagnostics = []
  const adapter = createAdapter({
    api: host.api,
    hostVersion: "0.1.0",
    reportDiagnostic: (message) => diagnostics.push(message)
  })
  const before = host.snapshot()

  assert.throws(
    () => adapter.registerLegacyContributionSet(manifest, provenance(), handlers),
    (error) => error?.code === "contribution.registry.handler_mismatch"
  )
  assert.strictEqual(host.snapshot(), before)
  assert.equal(host.trackedRegistrationCount(), 0)
  assert.equal(diagnostics.length, 0)
})

test("shares the native v1 namespace and rejects duplicate identifiers without replacement", () => {
  const { ProviderRegistryHost } = require("../out/api/providerRegistryApi")
  const host = new ProviderRegistryHost()
  const nativeManifest = actionManifest({
    ownerId: "local.native-owner",
    actionIds: ["shared.action"],
    schemaPrefix: "native-owner"
  })
  const nativeRegistration = host.api.registerContributionSet(
    nativeManifest,
    provenance("local.native-owner"),
    actionHandlers(nativeManifest, "native")
  )
  const legacyManifest = actionManifest({
    ownerId: "local.legacy-a",
    actionIds: ["shared.action"],
    schemaPrefix: "legacy-a"
  })
  const diagnostics = []
  const adapter = createAdapter({
    api: host.api,
    hostVersion: "0.1.0",
    reportDiagnostic: (message) => diagnostics.push(message)
  })
  const before = host.snapshot()

  assert.throws(
    () => adapter.registerLegacyContributionSet(
      legacyManifest,
      provenance(),
      actionHandlers(legacyManifest, "legacy")
    ),
    (error) => error?.code === "contribution.registry.duplicate_identifier"
  )
  assert.strictEqual(host.snapshot(), before)
  assert.equal(host.trackedRegistrationCount(), 1)
  assert.equal(diagnostics.length, 0)
  nativeRegistration.dispose()
})

test("returns an idempotent stale-safe disposable from the shared registry", () => {
  const { ProviderRegistryHost } = require("../out/api/providerRegistryApi")
  const host = new ProviderRegistryHost()
  const manifest = actionManifest()
  const adapter = createAdapter({
    api: host.api,
    hostVersion: "0.1.0",
    reportDiagnostic: () => undefined
  })
  const first = adapter.registerLegacyContributionSet(
    manifest,
    provenance(),
    actionHandlers(manifest, "first")
  )

  assert.equal(typeof first.dispose, "function")
  assert.equal(host.snapshot().actionProviders.length, 1)
  first.dispose()
  first.dispose()
  assert.equal(host.snapshot().actionProviders.length, 0)

  const second = adapter.registerLegacyContributionSet(
    manifest,
    provenance(),
    actionHandlers(manifest, "second")
  )
  first.dispose()
  assert.equal(host.snapshot().actionProviders.length, 1)
  assert.equal(host.trackedRegistrationCount(), 1)
  second.dispose()
  assert.equal(host.snapshot().actionProviders.length, 0)
  assert.equal(host.trackedRegistrationCount(), 0)
})

test("emits one fixed bounded diagnostic only after successful registration without metadata echo", () => {
  const events = []
  const diagnostics = []
  const host = fakeApi({
    registration: { dispose() {} }
  })
  const originalRegister = host.api.registerContributionSet
  host.api.registerContributionSet = (...args) => {
    events.push("register")
    return originalRegister(...args)
  }
  const adapter = createAdapter({
    api: host.api,
    hostVersion: "0.1.0",
    reportDiagnostic(message) {
      events.push("diagnostic")
      diagnostics.push(message)
    }
  })
  const privateManifest = actionManifest({
    ownerId: "local.private-owner",
    version: "9.8.7",
    actionIds: ["private.secret-action"],
    schemaPrefix: "private-owner"
  })

  adapter.registerLegacyContributionSet(
    privateManifest,
    provenance("local.private-owner", "9.8.7"),
    actionHandlers(privateManifest)
  )
  adapter.registerLegacyContributionSet(
    emptyManifest("local.other-owner", "7.6.5"),
    provenance("local.other-owner", "7.6.5"),
    emptyHandlers()
  )

  assert.deepEqual(events, ["register", "diagnostic", "register"])
  assert.equal(diagnostics.length, 1)
  assert.equal(typeof diagnostics[0], "string")
  assert.ok(Buffer.byteLength(diagnostics[0], "utf8") <= 256)
  assert.match(diagnostics[0], /deprecated|legacy/i)
  assert.match(diagnostics[0], /0\.2\.0/)
  for (const secret of [
    "local.private-owner",
    "9.8.7",
    "private.secret-action",
    "local.other-owner",
    "7.6.5"
  ]) {
    assert.doesNotMatch(diagnostics[0], new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
})

test("contains diagnostic callback failures after successful registration", () => {
  const events = []
  let disposed = false
  const registration = {
    dispose() {
      disposed = true
    }
  }
  const host = fakeApi({ registration })
  const originalRegister = host.api.registerContributionSet
  host.api.registerContributionSet = (...args) => {
    events.push("register")
    return originalRegister(...args)
  }
  const adapter = createAdapter({
    api: host.api,
    hostVersion: "0.1.0",
    reportDiagnostic() {
      events.push("diagnostic")
      throw new Error("diagnostic sink failed")
    }
  })

  let actual
  assert.doesNotThrow(() => {
    actual = adapter.registerLegacyContributionSet(
      emptyManifest(),
      provenance(),
      emptyHandlers()
    )
  })
  assert.strictEqual(actual, registration)
  assert.deepEqual(events, ["register", "diagnostic"])
  assert.equal(host.calls.register.length, 1)
  actual.dispose()
  assert.equal(disposed, true)
})

test("host shutdown removes adapter sets before built-ins, continues after failure, and closes late use", () => {
  const removed = []
  const removalFailure = new Error("middle removal failed")
  const { ProviderRegistryHost, ProviderRegistryApiError } = require("../out/api/providerRegistryApi")
  const host = new ProviderRegistryHost({
    onRemove(metadata) {
      if (metadata.kind !== "action_provider") return
      removed.push(metadata.id)
      if (metadata.id === "legacy.middle") throw removalFailure
    }
  })
  const builtInManifest = actionManifest({
    ownerId: "local.native-owner",
    actionIds: ["native.built-in"],
    schemaPrefix: "native-owner"
  })
  host.api.registerContributionSet(
    builtInManifest,
    provenance("local.native-owner"),
    actionHandlers(builtInManifest, "built-in")
  )
  const adapter = createAdapter({
    api: host.api,
    hostVersion: "0.1.0",
    reportDiagnostic: () => undefined
  })
  for (const id of ["legacy.first", "legacy.middle", "legacy.last"]) {
    const manifest = actionManifest({
      actionIds: [id],
      schemaPrefix: id.replaceAll(".", "-")
    })
    adapter.registerLegacyContributionSet(manifest, provenance(), actionHandlers(manifest, id))
  }

  assert.throws(() => host.dispose(), (error) => error === removalFailure)
  assert.deepEqual(removed, [
    "legacy.last",
    "legacy.middle",
    "legacy.first",
    "native.built-in"
  ])
  assert.equal(host.snapshot().actionProviders.length, 0)
  assert.throws(
    () => adapter.registerLegacyContributionSet(emptyManifest(), provenance(), emptyHandlers()),
    (error) => error instanceof ProviderRegistryApiError
      && error.code === "provider.registry.host_disposed"
  )
})
