const assert = require("node:assert/strict")
const Module = require("node:module")
const { test } = require("node:test")

function loadBridge(vscode = { extensions: {} }) {
  const modulePath = require.resolve("../out/workflow/workflowRegisterBridge")
  delete require.cache[modulePath]
  const originalLoad = Module._load
  Module._load = function load(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

const manifest = { registry_api: { min: "provider-registry/v1", max: "provider-registry/v1" } }
const provenance = { expectedOwner: { id: "local.bob-bazaar-review", version: "0.3.0" }, ownerDirectory: "extensions/bob-bazaar-review" }
const handlers = { actionProviders: new Map(), preflightChecks: new Map(), resultSinks: new Map() }

test("provider bridge accepts only the complete provider-registry/v1 API shape", async () => {
  const validApi = {
    apiVersion: "provider-registry/v1",
    negotiateProviderRegistry: () => "provider-registry/v1",
    registerContributionSet: () => ({ dispose() {} })
  }
  const extensionFor = (exports) => ({ isActive: true, exports })
  const vscodeFor = (exports) => ({ extensions: { getExtension: () => extensionFor(exports) } })

  assert.equal(await loadBridge(vscodeFor(validApi)).getWorkflowRegisterApi(), validApi)
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    assert.equal(await loadBridge(vscodeFor({ ...validApi, apiVersion: "provider-registry/v2" })).getWorkflowRegisterApi(), undefined)
    const { negotiateProviderRegistry: _missing, ...withoutNegotiation } = validApi
    assert.equal(await loadBridge(vscodeFor(withoutNegotiation)).getWorkflowRegisterApi(), undefined)
  } finally {
    console.warn = originalWarn
  }
})

test("provider bridge never registers when negotiation throws", () => {
  const { registerNegotiatedContributionSet } = loadBridge()
  let registerCalls = 0
  const api = {
    apiVersion: "provider-registry/v1",
    negotiateProviderRegistry: () => { throw new Error("incompatible") },
    registerContributionSet: () => { registerCalls += 1 }
  }

  assert.throws(
    () => registerNegotiatedContributionSet(api, manifest, provenance, handlers),
    /incompatible/
  )
  assert.equal(registerCalls, 0)
})

test("provider bridge rejects a mismatched negotiation result before registration", () => {
  const { registerNegotiatedContributionSet } = loadBridge()
  let registerCalls = 0
  const api = {
    apiVersion: "provider-registry/v1",
    negotiateProviderRegistry: () => "provider-registry/v2",
    registerContributionSet: () => { registerCalls += 1 }
  }

  assert.throws(
    () => registerNegotiatedContributionSet(api, manifest, provenance, handlers),
    /unexpected provider registry version/
  )
  assert.equal(registerCalls, 0)
})

test("provider bridge publishes one atomic set after successful negotiation", () => {
  const { registerNegotiatedContributionSet } = loadBridge()
  const calls = []
  const registration = { dispose() {} }
  const api = {
    apiVersion: "provider-registry/v1",
    negotiateProviderRegistry: (range) => { calls.push(["negotiate", range]); return "provider-registry/v1" },
    registerContributionSet: (...args) => { calls.push(["register", ...args]); return registration }
  }

  assert.equal(registerNegotiatedContributionSet(api, manifest, provenance, handlers), registration)
  assert.deepEqual(calls, [
    ["negotiate", manifest.registry_api],
    ["register", manifest, provenance, handlers]
  ])
})
