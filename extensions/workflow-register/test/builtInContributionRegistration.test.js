"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { ProviderRegistryHost } = require("../out/api/providerRegistryApi")
const { ActionRegistry } = require("../out/core/actionRegistry")
const {
  ResultSinkFileTransactionBinding,
  ResultSinkRegistry
} = require("../out/core/resultSinkRegistry")
const {
  registerWorkflowRegisterBuiltInContributions
} = require("../out/builtInContributions")

function registrationOptions(host, fileTransactions, overrides = {}) {
  return {
    api: host.api,
    installedOwner: { id: "local.workflow-register", version: "0.1.0" },
    fileTransactions,
    isWorkspaceTrusted: () => true,
    executeCommand: async (command, ...args) => ({ command, args }),
    pathExists: async (file) => file.endsWith(`${path.sep}.bob`),
    bazaarRepositoryAvailable: async () => true,
    writeFilesAtomically: async (_root, _writes, commit) => commit(),
    ...overrides
  }
}

function fileWrite(workflowRoot, runId = "run-1") {
  return {
    sink: {
      type: "file",
      path: ".bob/runs/{{run.id}}/{{step.id}}.txt"
    },
    input: {
      workflowId: "workflow-register.sample",
      workflowRoot,
      runId,
      stepId: "save",
      text: "result"
    }
  }
}

test("registers every workflow-register built-in as one atomic contribution set", async () => {
  const calls = []
  const host = new ProviderRegistryHost()
  const fileTransactions = new ResultSinkFileTransactionBinding()
  const registration = registerWorkflowRegisterBuiltInContributions(registrationOptions(host, fileTransactions, {
    executeCommand: async (command, ...args) => {
      calls.push({ command, args })
      return "ok"
    },
    pathExists: async (file) => {
      calls.push({ pathExists: file })
      return file.endsWith(`${path.sep}.bob`)
    },
    bazaarRepositoryAvailable: async (root) => {
      calls.push({ bazaarRoot: root })
      return root === "/workspace/b"
    }
  }))

  const snapshot = host.snapshot()
  assert.equal(host.trackedRegistrationCount(), 1)
  assert.deepEqual(snapshot.actionProviders.map((item) => item.id), [
    "workflowRegister.runMechanicalChecks",
    "vscode.executeCommand"
  ])
  assert.deepEqual(snapshot.preflightChecks.map((item) => item.id), [
    "workspaceOpen",
    "bobWorkspaceInitialized",
    "bazaarRepository"
  ])
  assert.deepEqual(snapshot.resultSinks.map((item) => item.id), ["command", "file"])
  assert.equal(snapshot.agentProviders.length, 0)

  const actions = new ActionRegistry({ contributionResolver: host.runtimeResolver })
  assert.equal((await actions.execute("vscode.executeCommand", {
    args: ["sample.command", 1],
    inputs: {},
    workflowRoot: "/workspace/b"
  })).value, "ok")

  const workflow = { workflowRoot: "/workspace/b" }
  const run = {}
  assert.equal(await host.runtimeResolver.getPreflightCheck("workspaceOpen")({ workflow, run, checkId: "workspaceOpen" }), true)
  assert.equal(await host.runtimeResolver.getPreflightCheck("bobWorkspaceInitialized")({ workflow, run, checkId: "bobWorkspaceInitialized" }), true)
  assert.equal(await host.runtimeResolver.getPreflightCheck("bazaarRepository")({ workflow, run, checkId: "bazaarRepository" }), true)
  assert.ok(calls.some((item) => item.pathExists === path.join("/workspace/b", ".bob")))
  assert.ok(calls.some((item) => item.bazaarRoot === "/workspace/b"))

  registration.dispose()
  assert.equal(host.trackedRegistrationCount(), 0)
  assert.equal(host.snapshot().actionProviders.length, 0)
})

test("negotiation failure happens before registration", () => {
  let registerCalls = 0
  const fileTransactions = new ResultSinkFileTransactionBinding()
  const failure = new Error("incompatible")
  const api = {
    apiVersion: "provider-registry/v1",
    negotiateProviderRegistry() {
      throw failure
    },
    registerContributionSet() {
      registerCalls += 1
      throw new Error("must not register")
    }
  }

  assert.throws(
    () => registerWorkflowRegisterBuiltInContributions({
      ...registrationOptions({ api }, fileTransactions),
      api
    }),
    (error) => error === failure
  )
  assert.equal(registerCalls, 0)
})

test("unexpected negotiation result is rejected before registration", () => {
  let registerCalls = 0
  const fileTransactions = new ResultSinkFileTransactionBinding()
  const api = {
    apiVersion: "provider-registry/v1",
    negotiateProviderRegistry() {
      return "provider-registry/v2"
    },
    registerContributionSet() {
      registerCalls += 1
      return { dispose() {} }
    }
  }

  assert.throws(
    () => registerWorkflowRegisterBuiltInContributions({
      ...registrationOptions({ api }, fileTransactions),
      api
    }),
    /negotiation returned an unexpected version/
  )
  assert.equal(registerCalls, 0)
})

test("disposal continues after a transaction binding failure and remains idempotent", () => {
  const bindingFailure = new Error("binding cleanup failed")
  let bindingDisposals = 0
  let registryDisposals = 0
  const api = {
    apiVersion: "provider-registry/v1",
    negotiateProviderRegistry() {
      return "provider-registry/v1"
    },
    registerContributionSet() {
      return {
        dispose() {
          registryDisposals += 1
        }
      }
    }
  }
  const fileTransactions = {
    bind() {
      return {
        dispose() {
          bindingDisposals += 1
          throw bindingFailure
        }
      }
    }
  }
  const registration = registerWorkflowRegisterBuiltInContributions(
    registrationOptions({ api }, fileTransactions, { api })
  )

  assert.throws(() => registration.dispose(), (error) => error === bindingFailure)
  assert.equal(bindingDisposals, 1)
  assert.equal(registryDisposals, 1)

  assert.doesNotThrow(() => registration.dispose())
  assert.equal(bindingDisposals, 1)
  assert.equal(registryDisposals, 1)
})

test("disposal aggregates transaction binding and registry failures in reverse order", () => {
  const bindingFailure = new Error("binding cleanup failed")
  const registryFailure = new Error("registry cleanup failed")
  let bindingDisposals = 0
  let registryDisposals = 0
  const api = {
    apiVersion: "provider-registry/v1",
    negotiateProviderRegistry() {
      return "provider-registry/v1"
    },
    registerContributionSet() {
      return {
        dispose() {
          registryDisposals += 1
          throw registryFailure
        }
      }
    }
  }
  const fileTransactions = {
    bind() {
      return {
        dispose() {
          bindingDisposals += 1
          throw bindingFailure
        }
      }
    }
  }
  const registration = registerWorkflowRegisterBuiltInContributions(
    registrationOptions({ api }, fileTransactions, { api })
  )

  assert.throws(
    () => registration.dispose(),
    (error) => error instanceof AggregateError
      && error.errors.length === 2
      && error.errors[0] === bindingFailure
      && error.errors[1] === registryFailure
  )
  assert.equal(bindingDisposals, 1)
  assert.equal(registryDisposals, 1)

  assert.doesNotThrow(() => registration.dispose())
  assert.equal(bindingDisposals, 1)
  assert.equal(registryDisposals, 1)
})

test("installed extension identity is independent provenance, not echoed from the manifest", () => {
  for (const installedOwner of [
    { id: "local.other-extension", version: "0.1.0" },
    { id: "local.workflow-register", version: "0.1.1" }
  ]) {
    const host = new ProviderRegistryHost()
    const fileTransactions = new ResultSinkFileTransactionBinding()
    assert.throws(
      () => registerWorkflowRegisterBuiltInContributions({
        ...registrationOptions(host, fileTransactions),
        installedOwner
      }),
      (error) => error && error.code === "contribution.registry.manifest_invalid"
    )
    assert.equal(host.snapshot().actionProviders.length, 0)
    assert.equal(host.trackedRegistrationCount(), 0)
  }
})

test("failed atomic publication leaves no live file transaction capability", async () => {
  const host = new ProviderRegistryHost({
    beforeCommit() {
      throw new Error("publication failed")
    }
  })
  const fileTransactions = new ResultSinkFileTransactionBinding()
  assert.throws(
    () => registerWorkflowRegisterBuiltInContributions(registrationOptions(host, fileTransactions)),
    (error) => error && error.code === "contribution.registry.commit_failed"
  )
  assert.equal(host.trackedRegistrationCount(), 0)
  assert.equal(host.snapshot().resultSinks.length, 0)

  const registry = new ResultSinkRegistry({
    contributionResolver: host.runtimeResolver,
    fileTransactionResolver: fileTransactions
  })
  let committed = false
  const result = await registry.writeFileTransaction([fileWrite("/workspace/a")], () => {
    committed = true
  })
  assert.equal(result.ok, false)
  assert.match(result.error, /Unsupported result sink: file/)
  assert.equal(committed, false)
})

test("every regular and transactional built-in follows the exact live contribution generation", async (t) => {
  const calls = []
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-built-ins-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const host = new ProviderRegistryHost()
  const fileTransactions = new ResultSinkFileTransactionBinding()
  const options = registrationOptions(host, fileTransactions, {
    writeFilesAtomically: async (root, writes, commit) => {
      calls.push({ root, writes })
      await commit()
    }
  })
  const registry = new ResultSinkRegistry({
    contributionResolver: host.runtimeResolver,
    fileTransactionResolver: fileTransactions
  })
  const actions = new ActionRegistry({ contributionResolver: host.runtimeResolver })
  const actionInput = { args: ["sample.command"], inputs: {}, workflowRoot: workspaceRoot }
  const sinkInput = {
    workflowId: "workflow-register.sample",
    workflowRoot: workspaceRoot,
    runId: "regular",
    stepId: "save",
    text: "result"
  }
  const commandSink = { type: "command", command: "bobBazaar.captureReviewResult" }
  const fileSink = { type: "file", path: ".bob/runs/{{run.id}}/{{step.id}}.txt" }
  const preflightInput = {
    workflow: { workflowRoot: workspaceRoot },
    run: {},
    checkId: "workspaceOpen"
  }

  const first = registerWorkflowRegisterBuiltInContributions(options)
  assert.equal((await actions.execute("vscode.executeCommand", actionInput)).ok, true)
  assert.equal(await host.runtimeResolver.getPreflightCheck("workspaceOpen")(preflightInput), true)
  assert.equal((await registry.write(commandSink, sinkInput)).ok, true)
  assert.equal((await registry.write(fileSink, sinkInput)).ok, true)
  let commits = 0
  assert.equal((await registry.writeFileTransaction([fileWrite(workspaceRoot)], () => {
    commits += 1
  })).ok, true)
  assert.equal(commits, 1)
  assert.equal(calls[0].root, workspaceRoot)

  first.dispose()
  assert.equal((await actions.execute("vscode.executeCommand", actionInput)).ok, false)
  assert.equal(host.runtimeResolver.getPreflightCheck("workspaceOpen"), undefined)
  assert.equal((await registry.write(commandSink, sinkInput)).ok, false)
  assert.equal((await registry.write(fileSink, sinkInput)).ok, false)
  assert.equal((await registry.writeFileTransaction([fileWrite(workspaceRoot, "run-2")], () => {
    commits += 1
  })).ok, false)
  assert.equal(commits, 1)

  const second = registerWorkflowRegisterBuiltInContributions(options)
  first.dispose()
  assert.equal((await actions.execute("vscode.executeCommand", actionInput)).ok, true)
  assert.equal(await host.runtimeResolver.getPreflightCheck("workspaceOpen")(preflightInput), true)
  assert.equal((await registry.write(commandSink, sinkInput)).ok, true)
  assert.equal((await registry.write(fileSink, { ...sinkInput, runId: "regular-2" })).ok, true)
  assert.equal((await registry.writeFileTransaction([fileWrite(workspaceRoot, "run-3")], () => {
    commits += 1
  })).ok, true)
  assert.equal(commits, 2)
  assert.equal(calls[1].root, workspaceRoot)
  second.dispose()
})

test("resolver-less registries retain the legacy file transaction fallback", async () => {
  const registry = new ResultSinkRegistry()
  let calls = 0
  registry.registerFileTransaction(async (_writes, commit) => {
    calls += 1
    await commit()
    return { ok: true }
  })

  let committed = false
  assert.equal((await registry.writeFileTransaction([fileWrite("/workspace/a")], () => {
    committed = true
  })).ok, true)
  assert.equal(calls, 1)
  assert.equal(committed, true)
})
