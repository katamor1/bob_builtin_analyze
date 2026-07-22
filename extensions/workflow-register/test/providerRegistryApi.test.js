"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const apiModulePath = path.resolve(__dirname, "../out/api/providerRegistryApi.js")

function loadApi() {
  assert.ok(fs.existsSync(apiModulePath), "provider registry v1 API module must exist")
  delete require.cache[apiModulePath]
  return require(apiModulePath)
}

function ownerContext(ownerId = "local.owner-a", version = "1.0.0") {
  return {
    expectedOwner: { id: ownerId, version },
    ownerDirectory: `extensions/${ownerId.split(".")[1]}`
  }
}

function emptyManifest(ownerId = "local.owner-a", version = "1.0.0") {
  return {
    schema_version: "workflow-contributions/v1",
    owner: { id: ownerId, version },
    registry_api: { min: "provider-registry/v1", max: "provider-registry/v1" },
    action_providers: [],
    preflight_checks: [],
    result_sinks: [],
    workflow_templates: [],
    schemas: []
  }
}

function handlers() {
  return {
    actionProviders: new Map(),
    preflightChecks: new Map(),
    resultSinks: new Map()
  }
}

function manifestWithTemplate(ownerId = "local.owner-a", version = "1.0.0") {
  const manifest = emptyManifest(ownerId, version)
  const ownerName = ownerId.split(".")[1]
  manifest.workflow_templates.push({
    id: `${ownerName}.template`,
    source: `extensions/${ownerName}/templates/WORKFLOW.md`,
    destinations: [`extensions/${ownerName}/WORKFLOW.md`]
  })
  return manifest
}

function completeManifest() {
  const manifest = emptyManifest()
  manifest.action_providers.push({
    id: "owner.a.action",
    contract_version: "owner.a.action/v1",
    input_schema: "owner.a.schema.input",
    output_schema: "owner.a.schema.output",
    error_codes: ["owner.a.failed"]
  })
  manifest.preflight_checks.push({
    id: "owner.a.preflight",
    contract_version: "owner.a.preflight/v1",
    result_schema: "owner.a.schema.preflight"
  })
  manifest.result_sinks.push({
    type: "owner.a.sink",
    contract_version: "owner.a.sink/v1",
    payload_schema: "owner.a.schema.sink"
  })
  manifest.schemas.push(
    { id: "owner.a.schema.input", path: "extensions/owner-a/schema/input.json" },
    { id: "owner.a.schema.output", path: "extensions/owner-a/schema/output.json" },
    { id: "owner.a.schema.preflight", path: "extensions/owner-a/schema/preflight.json" },
    { id: "owner.a.schema.sink", path: "extensions/owner-a/schema/sink.json" }
  )
  return manifest
}

function completeHandlers(manifest) {
  return {
    actionProviders: new Map([[manifest.action_providers[0].id, {
      id: manifest.action_providers[0].id,
      sourceId: manifest.owner.id,
      execute: async () => "ok"
    }]]),
    preflightChecks: new Map([[manifest.preflight_checks[0].id, async () => true]]),
    resultSinks: new Map([[manifest.result_sinks[0].type, async () => ({ ok: true })]])
  }
}

function assertApiError(ProviderRegistryApiError, operation, expectedCode, expectedMessage) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof ProviderRegistryApiError)
    assert.equal(error.code, expectedCode)
    assert.equal(error.message, expectedMessage)
    return true
  })
}

test("negotiates exact and huge compatible closed ranges to the highest supported version", () => {
  const { negotiateProviderRegistry, PROVIDER_REGISTRY_API_VERSION } = loadApi()

  assert.equal(PROVIDER_REGISTRY_API_VERSION, "provider-registry/v1")
  assert.equal(negotiateProviderRegistry({
    min: "provider-registry/v1",
    max: "provider-registry/v1"
  }), "provider-registry/v1")
  assert.equal(negotiateProviderRegistry({
    min: "provider-registry/v1",
    max: "provider-registry/v999999999999999999999999999999999999999999"
  }), "provider-registry/v1")
})

test("rejects well-formed disjoint ranges with a stable typed incompatibility error", () => {
  const { negotiateProviderRegistry, ProviderRegistryApiError } = loadApi()
  const message = "Provider registry API range is incompatible with this host."

  for (const range of [
    { min: "provider-registry/v2", max: "provider-registry/v2" },
    { min: "provider-registry/v9007199254740993", max: "provider-registry/v9007199254740994" }
  ]) {
    assertApiError(
      ProviderRegistryApiError,
      () => negotiateProviderRegistry(range),
      "provider.registry.version_incompatible",
      message
    )
  }
})

test("rejects malformed, inverted, non-closed, and overlong ranges with one fixed error", () => {
  const { negotiateProviderRegistry, ProviderRegistryApiError } = loadApi()
  const message = "Provider registry API range is malformed."
  let rangeGetterReads = 0
  const malformed = [
    null,
    [],
    {},
    { min: "provider-registry/v1" },
    { min: "provider-registry/v1", max: "provider-registry/v1", extra: true },
    { min: "provider-registry/v0", max: "provider-registry/v1" },
    { min: "provider-registry/v01", max: "provider-registry/v1" },
    { min: "provider-registry/1", max: "provider-registry/v1" },
    { min: "provider-registry/v2", max: "provider-registry/v1" },
    { min: `provider-registry/v${"9".repeat(65)}`, max: `provider-registry/v${"9".repeat(65)}` }
  ]
  const accessorRange = {}
  Object.defineProperty(accessorRange, "min", {
    enumerable: true,
    get() {
      rangeGetterReads += 1
      return "provider-registry/v1"
    }
  })
  Object.defineProperty(accessorRange, "max", { enumerable: true, value: "provider-registry/v1" })
  malformed.push(accessorRange)
  let proxyTrapReads = 0
  malformed.push(new Proxy({}, {
    ownKeys() {
      proxyTrapReads += 1
      throw new ProviderRegistryApiError(
        "provider.registry.version_incompatible",
        "attacker-controlled typed error"
      )
    }
  }))

  for (const range of malformed) {
    assertApiError(
      ProviderRegistryApiError,
      () => negotiateProviderRegistry(range),
      "provider.registry.range_malformed",
      message
    )
  }
  assert.equal(rangeGetterReads, 0)
  assert.equal(proxyTrapReads, 0, "untrusted range Proxies must be rejected without invoking traps")
})

test("publishes one frozen v1 API object with only the three provider registry members", () => {
  const { ProviderRegistryHost } = loadApi()
  const host = new ProviderRegistryHost()

  assert.equal(Object.isFrozen(host.api), true)
  assert.deepEqual(Object.keys(host.api).sort(), [
    "apiVersion",
    "negotiateProviderRegistry",
    "registerContributionSet"
  ])
  assert.equal(host.api.apiVersion, "provider-registry/v1")
  assert.equal(host.api.negotiateProviderRegistry, host.api.negotiateProviderRegistry)
  assert.equal(host.api.registerContributionSet, host.api.registerContributionSet)
})

test("rejects an incompatible manifest before reading handlers or invoking the commit seam", () => {
  let handlerReads = 0
  let commitCalls = 0
  const { ProviderRegistryHost, ProviderRegistryApiError } = loadApi()
  const host = new ProviderRegistryHost({ beforeCommit: () => { commitCalls += 1 } })
  const manifest = emptyManifest()
  manifest.registry_api = { min: "provider-registry/v2", max: "provider-registry/v999" }
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
  const before = host.snapshot()

  assert.throws(
    () => host.api.registerContributionSet(manifest, ownerContext(), hostileHandlers),
    (error) => error instanceof ProviderRegistryApiError
      && error.code === "provider.registry.version_incompatible"
  )
  assert.equal(handlerReads, 0)
  assert.equal(commitCalls, 0)
  assert.strictEqual(host.snapshot(), before)
})

test("rejects invalid owner provenance before reading handlers or invoking the commit seam", () => {
  let handlerReads = 0
  let commitCalls = 0
  const { ProviderRegistryHost } = loadApi()
  const { ContributionRegistryError } = require("../out/core/contributionRegistry")
  const host = new ProviderRegistryHost({ beforeCommit: () => { commitCalls += 1 } })
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
  const before = host.snapshot()

  assert.throws(
    () => host.api.registerContributionSet(emptyManifest(), ownerContext("local.owner-a", "2.0.0"), hostileHandlers),
    (error) => error instanceof ContributionRegistryError
      && error.code === "contribution.registry.manifest_invalid"
  )
  assert.equal(handlerReads, 0)
  assert.equal(commitCalls, 0)
  assert.strictEqual(host.snapshot(), before)
})

test("one public API shares one registry and rejects a duplicate without replacing its snapshot", () => {
  const { ProviderRegistryHost } = loadApi()
  const { ContributionRegistryError } = require("../out/core/contributionRegistry")
  const host = new ProviderRegistryHost()
  const manifest = manifestWithTemplate()
  host.api.registerContributionSet(manifest, ownerContext(), handlers())
  const before = host.snapshot()

  assert.throws(
    () => host.api.registerContributionSet(manifestWithTemplate(), ownerContext(), handlers()),
    (error) => error instanceof ContributionRegistryError
      && error.code === "contribution.registry.duplicate_identifier"
  )
  assert.strictEqual(host.snapshot(), before)
  assert.equal(host.snapshot().workflowTemplates.length, 1)
})

test("manual disposal releases host tracking and supports bounded re-registration", () => {
  const { ProviderRegistryHost } = loadApi()
  const host = new ProviderRegistryHost()
  const first = host.api.registerContributionSet(
    manifestWithTemplate(),
    ownerContext(),
    handlers()
  )

  assert.equal(host.trackedRegistrationCount(), 1)
  first.dispose()
  assert.equal(host.trackedRegistrationCount(), 0)

  host.api.registerContributionSet(manifestWithTemplate(), ownerContext(), handlers())
  assert.equal(host.trackedRegistrationCount(), 1)
  host.dispose()
  assert.equal(host.trackedRegistrationCount(), 0)
})

test("a rejected reentrant manual disposal remains tracked for later host cleanup", () => {
  let firstRegistration
  let commitCalls = 0
  const { ProviderRegistryHost } = loadApi()
  const host = new ProviderRegistryHost({
    beforeCommit() {
      commitCalls += 1
      if (commitCalls === 2) firstRegistration.dispose()
    }
  })
  firstRegistration = host.api.registerContributionSet(
    manifestWithTemplate("local.owner-a"),
    ownerContext("local.owner-a"),
    handlers()
  )

  assert.equal(host.trackedRegistrationCount(), 1)
  assert.throws(() => host.api.registerContributionSet(
    manifestWithTemplate("local.owner-b"),
    ownerContext("local.owner-b"),
    handlers()
  ))
  assert.equal(host.snapshot().workflowTemplates.length, 1)
  assert.equal(host.trackedRegistrationCount(), 1)

  host.dispose()
  assert.equal(host.snapshot().workflowTemplates.length, 0)
  assert.equal(host.trackedRegistrationCount(), 0)
})

test("a late bad handler and a commit failure publish no partial state", () => {
  const { ProviderRegistryHost } = loadApi()
  const { ContributionRegistryError } = require("../out/core/contributionRegistry")

  const lateHost = new ProviderRegistryHost()
  const manifest = completeManifest()
  const badHandlers = completeHandlers(manifest)
  badHandlers.resultSinks.set(manifest.result_sinks[0].type, { invalid: true })
  const beforeBadHandler = lateHost.snapshot()
  assert.throws(
    () => lateHost.api.registerContributionSet(manifest, ownerContext(), badHandlers),
    (error) => error instanceof ContributionRegistryError
      && error.code === "contribution.registry.handler_mismatch"
  )
  assert.strictEqual(lateHost.snapshot(), beforeBadHandler)

  const commitHost = new ProviderRegistryHost({ beforeCommit: () => { throw new Error("injected") } })
  const beforeCommit = commitHost.snapshot()
  assert.throws(
    () => commitHost.api.registerContributionSet(manifestWithTemplate(), ownerContext(), handlers()),
    (error) => error instanceof ContributionRegistryError
      && error.code === "contribution.registry.commit_failed"
  )
  assert.strictEqual(commitHost.snapshot(), beforeCommit)
})

test("shutdown disposes sets in reverse registration order and continues after one disposal failure", () => {
  const removed = []
  const { ProviderRegistryHost, ProviderRegistryApiError } = loadApi()
  const host = new ProviderRegistryHost({
    onRemove(metadata) {
      removed.push(metadata.id)
      if (metadata.id === "owner-b.template") throw new Error("owner-b cleanup failed")
    }
  })
  host.api.registerContributionSet(
    manifestWithTemplate("local.owner-a"),
    ownerContext("local.owner-a"),
    handlers()
  )
  host.api.registerContributionSet(
    manifestWithTemplate("local.owner-b"),
    ownerContext("local.owner-b"),
    handlers()
  )

  assert.throws(() => host.dispose(), /owner-b cleanup failed/)
  assert.deepEqual(removed, ["owner-b.template", "owner-a.template"])
  assert.equal(host.snapshot().workflowTemplates.length, 0)
  assert.doesNotThrow(() => host.dispose())
  assertApiError(
    ProviderRegistryApiError,
    () => host.api.registerContributionSet(
      manifestWithTemplate("local.owner-c"),
      ownerContext("local.owner-c"),
      handlers()
    ),
    "provider.registry.host_disposed",
    "Provider registry host is disposed."
  )
  assert.equal(host.snapshot().workflowTemplates.length, 0)
})
