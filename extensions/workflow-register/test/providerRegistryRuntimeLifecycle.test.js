"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { ProviderRegistryHost } = require("../out/api/providerRegistryApi")
const { ActionRegistry } = require("../out/core/actionRegistry")
const { createLiveAgentProvider } = require("../out/core/agentProvider")
const { WorkflowEngine } = require("../out/core/engine")
const { createPreflightCheckResolver, evaluatePreflight } = require("../out/core/engine/preflight")
const { ResultSinkRegistry } = require("../out/core/resultSinkRegistry")
const { FileRunStateStore } = require("../out/core/runStateStore")

function manifest(version) {
  return {
    schema_version: "workflow-contributions/v1",
    owner: { id: "local.runtime-owner", version },
    registry_api: { min: "provider-registry/v1", max: "provider-registry/v1" },
    action_providers: [{
      id: "runtime.action",
      contract_version: "runtime.action/v1",
      input_schema: "runtime.action.input",
      output_schema: "runtime.action.output",
      error_codes: ["runtime.action.failed"]
    }],
    preflight_checks: [{
      id: "runtime.preflight",
      contract_version: "runtime.preflight/v1",
      result_schema: "runtime.preflight.result"
    }],
    result_sinks: [{
      type: "runtime.sink",
      contract_version: "runtime.sink/v1",
      payload_schema: "runtime.sink.payload"
    }],
    agent_provider: {
      id: "runtime.agent",
      contract_version: "runtime.agent/v1",
      capabilities: ["workflow-step"]
    },
    workflow_templates: [],
    schemas: [
      { id: "runtime.action.input", path: "extensions/runtime-owner/schema/action-input.json" },
      { id: "runtime.action.output", path: "extensions/runtime-owner/schema/action-output.json" },
      { id: "runtime.preflight.result", path: "extensions/runtime-owner/schema/preflight-result.json" },
      { id: "runtime.sink.payload", path: "extensions/runtime-owner/schema/sink-payload.json" }
    ]
  }
}

function context(version) {
  return {
    expectedOwner: { id: "local.runtime-owner", version },
    ownerDirectory: "extensions/runtime-owner"
  }
}

function handlers(label, calls) {
  return {
    actionProviders: new Map([["runtime.action", {
      id: "runtime.action",
      sourceId: "local.runtime-owner",
      execute: async () => {
        calls.push(`${label}:action`)
        return label
      }
    }]]),
    preflightChecks: new Map([["runtime.preflight", async () => {
      calls.push(`${label}:preflight`)
      return true
    }]]),
    resultSinks: new Map([["runtime.sink", async () => {
      calls.push(`${label}:sink`)
      return { ok: true, value: label }
    }]]),
    agentProvider: {
      run: async () => {
        calls.push(`${label}:agent`)
        return label
      }
    }
  }
}

test("runtime views stay live across disposal, re-registration, and a stale disposable", async () => {
  const calls = []
  const host = new ProviderRegistryHost()
  const runtime = host.runtimeResolver
  const actions = new ActionRegistry({ contributionResolver: runtime })
  const preflight = createPreflightCheckResolver({}, runtime)
  const sinks = new ResultSinkRegistry({ contributionResolver: runtime })
  const agent = createLiveAgentProvider(() => runtime.getAgentProvider())
  const first = host.api.registerContributionSet(manifest("1.0.0"), context("1.0.0"), handlers("first", calls))

  assert.equal((await actions.execute("runtime.action", { args: {}, inputs: {} })).value, "first")
  assert.equal(await preflight.getPreflightCheck("runtime.preflight")?.({ workflow: {}, run: {}, checkId: "runtime.preflight" }), true)
  assert.equal((await sinks.write({ type: "runtime.sink", contractVersion: "runtime.sink/v1", payload: {} }, {
    workflowId: "runtime.workflow", runId: "run-1", stepId: "sink", text: "value"
  })).value, "first")
  assert.equal(await agent.run({ workflowId: "runtime.workflow", runId: "run-1", stepId: "agent", prompt: "", inputs: {}, state: {} }), "first")

  first.dispose()
  assert.equal((await actions.execute("runtime.action", { args: {}, inputs: {} })).ok, false)
  assert.equal(preflight.getPreflightCheck("runtime.preflight"), undefined)
  assert.equal((await sinks.write({ type: "runtime.sink", contractVersion: "runtime.sink/v1", payload: {} }, {
    workflowId: "runtime.workflow", runId: "run-2", stepId: "sink", text: "value"
  })).ok, false)
  await assert.rejects(
    () => agent.run({ workflowId: "runtime.workflow", runId: "run-2", stepId: "agent", prompt: "", inputs: {}, state: {} }),
    /Agent provider is required/
  )

  const second = host.api.registerContributionSet(manifest("2.0.0"), context("2.0.0"), handlers("second", calls))
  first.dispose()
  assert.equal((await actions.execute("runtime.action", { args: {}, inputs: {} })).value, "second")
  assert.equal(await preflight.getPreflightCheck("runtime.preflight")?.({ workflow: {}, run: {}, checkId: "runtime.preflight" }), true)
  assert.equal((await sinks.write({ type: "runtime.sink", contractVersion: "runtime.sink/v1", payload: {} }, {
    workflowId: "runtime.workflow", runId: "run-3", stepId: "sink", text: "value"
  })).value, "second")
  assert.equal(await agent.run({ workflowId: "runtime.workflow", runId: "run-3", stepId: "agent", prompt: "", inputs: {}, state: {} }), "second")
  second.dispose()

  assert.deepEqual(calls, [
    "first:action", "first:preflight", "first:sink", "first:agent",
    "second:action", "second:preflight", "second:sink", "second:agent"
  ])
})

test("an engine created before registration resolves every execution against current providers", async () => {
  const calls = []
  const host = new ProviderRegistryHost()
  const runtime = host.runtimeResolver
  const actions = new ActionRegistry({ contributionResolver: runtime })
  const sinks = new ResultSinkRegistry({ contributionResolver: runtime })
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-provider-runtime-"))
  const engine = new WorkflowEngine({
    actions,
    resultSinks: sinks,
    runStore: new FileRunStateStore({ workspaceRoot }),
    preflightCheckResolver: createPreflightCheckResolver({}, runtime),
    strictPreflightChecks: true,
    agentProvider: createLiveAgentProvider(() => runtime.getAgentProvider())
  })
  const workflow = {
    id: "workflow-register.provider-runtime",
    name: "provider-runtime",
    label: "Provider Runtime",
    schemaVersion: "workflow-register/v1",
    inputs: {},
    requires: {},
    preflight: [{ id: "runtime-ready", checks: ["runtime.preflight"], required: true, failurePolicy: "stop" }],
    guardrails: { allowedCommands: ["runtime.action"] },
    engineSteps: [
      { id: "action", title: "Action", type: "command", action: { provider: "runtime.action" }, resultKey: "actionResult" },
      { id: "agent", title: "Agent", type: "agent", prompt: "Run live provider.", resultKey: "agentResult" },
      {
        id: "sink",
        title: "Sink",
        type: "result",
        result: {
          source: "literal",
          text: "runtime payload",
          sinks: [{ type: "runtime.sink", contractVersion: "runtime.sink/v1", payload: { source: "test" } }]
        }
      }
    ]
  }

  const first = host.api.registerContributionSet(manifest("1.0.0"), context("1.0.0"), handlers("first", calls))
  const firstRun = await engine.runWorkflow(workflow, {})
  assert.equal(firstRun.status, "completed")

  first.dispose()
  const disposedRun = await engine.runWorkflow(workflow, {})
  assert.equal(disposedRun.status, "failed")
  assert.match(disposedRun.error, /Unsupported preflight check: runtime\.preflight/)

  const second = host.api.registerContributionSet(manifest("2.0.0"), context("2.0.0"), handlers("second", calls))
  first.dispose()
  const secondRun = await engine.runWorkflow(workflow, {})
  assert.equal(secondRun.status, "completed")
  second.dispose()

  assert.deepEqual(calls, [
    "first:preflight", "first:action", "first:agent", "first:sink",
    "second:preflight", "second:action", "second:agent", "second:sink"
  ])
})

test("atomic contributions stay ahead of legacy fallbacks without reviving ownerless custom sinks", async () => {
  const calls = []
  const host = new ProviderRegistryHost()
  const runtime = host.runtimeResolver
  const actions = new ActionRegistry({ contributionResolver: runtime })
  actions.register({
    id: "runtime.action",
    sourceId: "legacy.local",
    execute: async () => "local-action"
  })
  const preflight = createPreflightCheckResolver({
    "runtime.preflight": async () => "local-preflight"
  }, runtime)
  const sinks = new ResultSinkRegistry({ contributionResolver: runtime })
  sinks.register("runtime.sink", async () => ({ ok: true, value: "local-sink" }))
  const agent = createLiveAgentProvider(() => runtime.getAgentProvider() ?? {
    run: async () => "legacy-agent"
  })
  const registration = host.api.registerContributionSet(
    manifest("1.0.0"),
    context("1.0.0"),
    handlers("atomic", calls)
  )

  assert.equal((await actions.execute("runtime.action", { args: {}, inputs: {} })).value, "atomic")
  assert.equal(await preflight.getPreflightCheck("runtime.preflight")?.({ workflow: {}, run: {}, checkId: "runtime.preflight" }), true)
  assert.equal((await sinks.write({ type: "runtime.sink", contractVersion: "runtime.sink/v1", payload: {} }, {
    workflowId: "runtime.workflow", runId: "run-local", stepId: "sink", text: "value"
  })).value, "atomic")
  assert.equal(await agent.run({ workflowId: "runtime.workflow", runId: "run-local", stepId: "agent", prompt: "", inputs: {}, state: {} }), "atomic")

  registration.dispose()
  assert.equal((await actions.execute("runtime.action", { args: {}, inputs: {} })).value, "local-action")
  assert.equal(await preflight.getPreflightCheck("runtime.preflight")?.({ workflow: {}, run: {}, checkId: "runtime.preflight" }), "local-preflight")
  assert.deepEqual(await sinks.write({ type: "runtime.sink", contractVersion: "runtime.sink/v1", payload: {} }, {
    workflowId: "runtime.workflow", runId: "run-local-2", stepId: "sink", text: "value"
  }), { ok: false, error: "Unsupported result sink: runtime.sink" })
  assert.equal(await agent.run({ workflowId: "runtime.workflow", runId: "run-local-2", stepId: "agent", prompt: "", inputs: {}, state: {} }), "legacy-agent")
  assert.deepEqual(calls, ["atomic:action", "atomic:preflight", "atomic:sink", "atomic:agent"])
})

test("atomic result sinks reject a workflow contract version mismatch before calling the handler", async () => {
  const calls = []
  const host = new ProviderRegistryHost()
  const sinks = new ResultSinkRegistry({ contributionResolver: host.runtimeResolver })
  const registration = host.api.registerContributionSet(
    manifest("1.0.0"),
    context("1.0.0"),
    handlers("atomic", calls)
  )

  const result = await sinks.write({
    type: "runtime.sink",
    contractVersion: "runtime.sink/v2",
    payload: {}
  }, {
    workflowId: "runtime.workflow",
    runId: "run-contract-mismatch",
    stepId: "sink",
    text: "value"
  })

  assert.deepEqual(result, {
    ok: false,
    error: "Result sink contract version mismatch for 'runtime.sink': received 'runtime.sink/v2', expected 'runtime.sink/v1'."
  })
  assert.deepEqual(calls, [])
  registration.dispose()
})

test("a plain preflight check may use the resolver method name as its contribution id", async () => {
  const result = await evaluatePreflight({
    workflow: {
      requires: {},
      preflight: [{
        id: "method-name-collision",
        checks: ["getPreflightCheck"],
        required: true,
        failurePolicy: "stop"
      }]
    },
    run: {},
    preflightChecks: {
      getPreflightCheck: (input) => input.checkId === "getPreflightCheck"
    },
    strictPreflightChecks: true
  })

  assert.deepEqual(result, { errors: [], warnings: [] })
})
