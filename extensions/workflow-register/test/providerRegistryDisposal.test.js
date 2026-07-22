"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")

const { disposeResourcesInOrder } = require("../out/core/disposeResources")
const {
  ProviderRegistryApiError,
  ProviderRegistryHost
} = require("../out/api/providerRegistryApi")

function manifest() {
  return {
    schema_version: "workflow-contributions/v1",
    owner: { id: "local.owner-a", version: "1.0.0" },
    registry_api: { min: "provider-registry/v1", max: "provider-registry/v1" },
    action_providers: [],
    preflight_checks: [],
    result_sinks: [],
    workflow_templates: [{
      id: "owner-a.template",
      source: "extensions/owner-a/templates/WORKFLOW.md",
      destinations: ["extensions/owner-a/WORKFLOW.md"]
    }],
    workflow_claims: [],
    workflow_exclusions: [],
    external_commands: [],
    schemas: []
  }
}

function context() {
  return {
    expectedOwner: { id: "local.owner-a", version: "1.0.0" },
    ownerDirectory: "extensions/owner-a"
  }
}

function handlers() {
  return {
    actionProviders: new Map(),
    preflightChecks: new Map(),
    resultSinks: new Map()
  }
}

test("service-style disposal reaches provider cleanup after an earlier resource throws", () => {
  const events = []
  const earlierFailure = new Error("watcher disposal failed")
  const host = new ProviderRegistryHost({
    onRemove() {
      events.push("provider")
    }
  })
  host.api.registerContributionSet(manifest(), context(), handlers())

  const result = disposeResourcesInOrder([
    {
      label: "watcher",
      propagate: true,
      dispose() {
        events.push("watcher")
        throw earlierFailure
      }
    },
    {
      label: "provider registry",
      propagate: false,
      dispose() {
        host.dispose()
      }
    },
    {
      label: "later cleanup",
      propagate: false,
      dispose() {
        events.push("later")
      }
    }
  ])

  assert.deepEqual(events, ["watcher", "provider", "later"])
  assert.equal(result.failures.length, 1)
  assert.equal(result.failures[0].label, "watcher")
  assert.equal(result.hasPropagatedError, true)
  assert.strictEqual(result.firstPropagatedError, earlierFailure)
  assert.equal(host.snapshot().workflowTemplates.length, 0)
  assert.throws(
    () => host.api.registerContributionSet(manifest(), context(), handlers()),
    (error) => error instanceof ProviderRegistryApiError
      && error.code === "provider.registry.host_disposed"
  )
})
