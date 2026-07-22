"use strict"

const assert = require("node:assert/strict")
const Module = require("node:module")
const { test } = require("node:test")

const ACTION_IDS = [
  "bobCodeConsistency.initializeWorkspace",
  "bobCodeConsistency.createReviewInput",
  "bobCodeConsistency.prepareAiReviewInputDraft",
  "bobCodeConsistency.applyAiReviewInputDraft",
  "bobCodeConsistency.prepareAiTraceabilityDraft",
  "bobCodeConsistency.captureAiTraceabilityDraft",
  "bobCodeConsistency.applyAiTraceabilityDraft",
  "bobCodeConsistency.openTraceabilityPrep",
  "bobCodeConsistency.validateTraceabilityCatalog",
  "bobCodeConsistency.createReviewInputFromTraceability",
  "bobCodeConsistency.repairReviewInput",
  "bobCodeConsistency.explainReviewInputDiagnostics",
  "bobCodeConsistency.preprocess",
  "bobCodeConsistency.captureBobOutput",
  "bobCodeConsistency.validateOutput",
  "bobCodeConsistency.triage"
]

const INSTALLED_PROVENANCE = Object.freeze({
  expectedOwner: Object.freeze({ id: "local.bob-code-consistency-review", version: "0.1.0" }),
  ownerDirectory: "extensions/bob-code-consistency-review"
})

function loadRegistrationModule(vscode) {
  const target = require.resolve("../out/workflowProviderRegistration")
  const originalLoad = Module._load
  delete require.cache[target]
  Module._load = function(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(target)
  } finally {
    Module._load = originalLoad
  }
}

function workflowInput() {
  return {
    args: {},
    inputs: {},
    state: {},
    workflowId: "workflow",
    workflowRoot: "/workspace",
    runId: "run",
    stepId: "step"
  }
}

test("registers all sixteen handlers in one negotiated contribution set", async () => {
  const events = []
  let captured
  const registration = { dispose() {} }
  const api = {
    apiVersion: "provider-registry/v1",
    negotiateProviderRegistry(range) {
      events.push("negotiate")
      assert.deepEqual(range, { min: "provider-registry/v1", max: "provider-registry/v1" })
      return "provider-registry/v1"
    },
    registerContributionSet(manifest, provenance, handlers) {
      events.push("register")
      captured = { manifest, provenance, handlers }
      return registration
    },
    registerActionProvider() {
      assert.fail("legacy registration must not be called")
    }
  }
  const vscode = {
    extensions: {
      getExtension: () => ({ isActive: true, exports: api })
    }
  }
  const module = loadRegistrationModule(vscode)
  const calls = []
  const handlerImplementations = Object.fromEntries(ACTION_IDS.map((id) => [
    id.slice("bobCodeConsistency.".length),
    async () => {
      calls.push(id)
      return id
    }
  ]))

  const result = await module.registerWorkflowProviders(handlerImplementations, INSTALLED_PROVENANCE)

  assert.deepEqual(events, ["negotiate", "register"])
  assert.equal(result.registered, true)
  assert.equal(result.api, api)
  assert.deepEqual(result.registrations, [registration])
  assert.deepEqual(captured.provenance, {
    expectedOwner: { id: "local.bob-code-consistency-review", version: "0.1.0" },
    ownerDirectory: "extensions/bob-code-consistency-review"
  })
  assert.deepEqual([...captured.handlers.actionProviders.keys()], ACTION_IDS)
  assert.equal(captured.handlers.preflightChecks.size, 0)
  assert.equal(captured.handlers.resultSinks.size, 0)
  assert.equal(captured.handlers.agentProvider, undefined)

  for (const id of ACTION_IDS) {
    const provider = captured.handlers.actionProviders.get(id)
    assert.equal(provider.id, id)
    assert.equal(await provider.execute(workflowInput()), id)
  }
  assert.deepEqual(calls, ACTION_IDS)
})

test("negotiation failure happens before atomic registration", async () => {
  let registrationCalls = 0
  const api = {
    apiVersion: "provider-registry/v1",
    negotiateProviderRegistry() {
      throw new Error("incompatible provider registry")
    },
    registerContributionSet() {
      registrationCalls += 1
      return { dispose() {} }
    }
  }
  const vscode = {
    extensions: {
      getExtension: () => ({ isActive: true, exports: api })
    }
  }
  const module = loadRegistrationModule(vscode)
  const handlers = Object.fromEntries(ACTION_IDS.map((id) => [id.slice("bobCodeConsistency.".length), async () => id]))

  await assert.rejects(() => module.registerWorkflowProviders(handlers, INSTALLED_PROVENANCE), /incompatible provider registry/)
  assert.equal(registrationCalls, 0)
})

test("rejects a host whose advertised API version is not exact v1 before registration", async () => {
  let negotiationCalls = 0
  let registrationCalls = 0
  const api = {
    apiVersion: "provider-registry/v2",
    negotiateProviderRegistry() {
      negotiationCalls += 1
      return "provider-registry/v1"
    },
    registerContributionSet() {
      registrationCalls += 1
      return { dispose() {} }
    }
  }
  const vscode = {
    extensions: {
      getExtension: () => ({ isActive: true, exports: api })
    }
  }
  const module = loadRegistrationModule(vscode)
  const handlers = Object.fromEntries(ACTION_IDS.map((id) => [id.slice("bobCodeConsistency.".length), async () => id]))

  const result = await module.registerWorkflowProviders(handlers, INSTALLED_PROVENANCE)

  assert.deepEqual(result, { registered: false, registrations: [] })
  assert.equal(negotiationCalls, 0)
  assert.equal(registrationCalls, 0)
})

test("rejects an unexpected negotiation result before atomic registration", async () => {
  let registrationCalls = 0
  const api = {
    apiVersion: "provider-registry/v1",
    negotiateProviderRegistry() {
      return "provider-registry/v2"
    },
    registerContributionSet() {
      registrationCalls += 1
      return { dispose() {} }
    }
  }
  const vscode = {
    extensions: {
      getExtension: () => ({ isActive: true, exports: api })
    }
  }
  const module = loadRegistrationModule(vscode)
  const handlers = Object.fromEntries(ACTION_IDS.map((id) => [id.slice("bobCodeConsistency.".length), async () => id]))

  await assert.rejects(
    () => module.registerWorkflowProviders(handlers, INSTALLED_PROVENANCE),
    /negotiation returned an unexpected version/
  )
  assert.equal(registrationCalls, 0)
})

test("rejects missing, extra, and non-callable command handlers before registration", async () => {
  const validHandlers = Object.fromEntries(ACTION_IDS.map((id) => [
    id.slice("bobCodeConsistency.".length),
    async () => id
  ]))
  const invalidHandlerSets = [
    Object.fromEntries(Object.entries(validHandlers).slice(1)),
    { ...validHandlers, unexpected: async () => "unexpected" },
    { ...validHandlers, initializeWorkspace: "not callable" }
  ]

  for (const handlers of invalidHandlerSets) {
    let registrationCalls = 0
    const api = {
      apiVersion: "provider-registry/v1",
      negotiateProviderRegistry() {
        return "provider-registry/v1"
      },
      registerContributionSet() {
        registrationCalls += 1
        return { dispose() {} }
      }
    }
    const vscode = {
      extensions: {
        getExtension: () => ({ isActive: true, exports: api })
      }
    }
    const module = loadRegistrationModule(vscode)

    await assert.rejects(
      () => module.registerWorkflowProviders(handlers, INSTALLED_PROVENANCE),
      /workflow handler set is invalid/
    )
    assert.equal(registrationCalls, 0)
  }
})

test("binds registry validation to installed extension id and version", async () => {
  const handlers = Object.fromEntries(ACTION_IDS.map((id) => [
    id.slice("bobCodeConsistency.".length),
    async () => id
  ]))
  const mismatchedInstalledIdentities = [
    { expectedOwner: { id: "local.other-install", version: "0.1.0" }, ownerDirectory: INSTALLED_PROVENANCE.ownerDirectory },
    { expectedOwner: { id: INSTALLED_PROVENANCE.expectedOwner.id, version: "9.9.9" }, ownerDirectory: INSTALLED_PROVENANCE.ownerDirectory }
  ]

  for (const provenance of mismatchedInstalledIdentities) {
    let successfulRegistrations = 0
    const api = {
      apiVersion: "provider-registry/v1",
      negotiateProviderRegistry() {
        return "provider-registry/v1"
      },
      registerContributionSet(manifest, actualProvenance) {
        if (
          manifest.owner.id !== actualProvenance.expectedOwner.id
          || manifest.owner.version !== actualProvenance.expectedOwner.version
        ) {
          throw new Error("installed extension identity does not match contribution manifest")
        }
        successfulRegistrations += 1
        return { dispose() {} }
      }
    }
    const vscode = {
      extensions: {
        getExtension: () => ({ isActive: true, exports: api })
      }
    }
    const module = loadRegistrationModule(vscode)

    await assert.rejects(
      () => module.registerWorkflowProviders(handlers, provenance),
      /installed extension identity does not match contribution manifest/
    )
    assert.equal(successfulRegistrations, 0)
  }
})
