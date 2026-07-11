const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { OperationHubMutationCoordinator } = require("../out/gui/operationHubMutationCoordinator")

function loadProviderWithVscode(vscode) {
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const modulePath = require.resolve("../out/gui/operationHubProvider")
    delete require.cache[modulePath]
    return require(modulePath).OperationHubProvider
  } finally {
    Module._load = originalLoad
  }
}

function tempRunRoot(t, updatedAt = "2026-07-12T01:00:00.000Z") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-operation-hub-"))
  const runId = "shared-run"
  const runFile = path.join(root, ".bob", "workflows", "runs", runId, "run.json")
  fs.mkdirSync(path.dirname(runFile), { recursive: true })
  const run = {
    runId,
    workflowId: "workflow-register.target",
    workflowName: "Target",
    status: "failed",
    currentStep: "step",
    inputs: {},
    state: { winner: "initial" },
    steps: [{ id: "step", title: "Step", type: "command", status: "failed" }],
    createdAt: updatedAt,
    updatedAt
  }
  const bytes = `${JSON.stringify(run)}\n`
  fs.writeFileSync(runFile, bytes)
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return {
    root,
    runId,
    runFile,
    updatedAt,
    revision: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`,
    run
  }
}

function loadWorkflowRunCommandsWithVscode(vscode) {
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const modulePath = require.resolve("../out/workflowRunCommands")
    delete require.cache[modulePath]
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

function markerRoot(root) {
  return {
    root,
    name: path.basename(root),
    marker: ".bob",
    depth: "direct",
    workspaceFolderName: path.basename(root),
    workspaceFolderRoot: root
  }
}

function runCommandHarness(t) {
  const rootA = tempRunRoot(t)
  const rootB = tempRunRoot(t)
  const state = { engineRoots: [], runStoreCalls: 0, messages: [], workflowIds: [] }
  const vscode = {
    window: {
      showErrorMessage: async (message) => { state.messages.push(message) },
      showInformationMessage: async (message) => { state.messages.push(message) },
      showQuickPick: async (items) => items[0],
      showWarningMessage: async (message) => { state.messages.push(message) }
    },
    workspace: { isTrusted: true }
  }
  const { WorkflowRunCommandService } = loadWorkflowRunCommandsWithVscode(vscode)
  const workflow = {
    id: "workflow-register.target",
    name: "target",
    label: "Target",
    inputs: {},
    stepReview: { allowRetry: true },
    stepExecution: { mode: "engineSteps", allowOutOfOrder: false, showInBob: true },
    engineSteps: [{ id: "step", title: "Step", type: "command" }]
  }
  const runtimeFactory = {
    createRunStore: (root) => {
      state.runStoreCalls += 1
      const fixture = root === rootA.root ? rootA : rootB
      return {
        listRuns: async () => [fixture.run],
        loadRun: async () => fixture.run,
        saveRun: async () => undefined
      }
    },
    createEngine: (root) => {
      state.engineRoots.push(root)
      return {
        runWorkflow: async (selectedWorkflow) => {
          state.workflowIds.push(selectedWorkflow.id)
          return { ...rootB.run, status: "running" }
        },
        retryCurrentStep: async () => ({ ...rootB.run, status: "reviewing" })
      }
    }
  }
  const service = new WorkflowRunCommandService({
    coreWorkflows: new Map([[workflow.id, workflow]]),
    runtimeFactory,
    ensureWorkflowsLoaded: async () => undefined,
    workflowRootCandidates: async () => [markerRoot(rootA.root), markerRoot(rootB.root)],
    activeSteps: () => [],
    showManualStepPanel: async () => undefined,
    gateRegistry: {
      pendingForRun: () => ({ ownerStepId: "step", stepId: "step", status: "reviewing" }),
      rebind: () => undefined,
      acceptPending: () => true
    },
    coordinateGateDecision: (_workspaceRoot, _runId, _kind, operation) => operation()
  })
  return { rootA, rootB, service, state }
}

function providerHarness(t) {
  const run = tempRunRoot(t)
  const state = {
    commands: [],
    errors: [],
    warnings: [],
    executeCommand: async () => undefined
  }
  const vscode = {
    commands: {
      executeCommand: async (...args) => {
        state.commands.push(args)
        return state.executeCommand(...args)
      }
    },
    extensions: { getExtension: () => undefined },
    window: {
      showErrorMessage: async (message) => { state.errors.push(message) },
      showWarningMessage: async (message) => { state.warnings.push(message) }
    },
    workspace: {
      workspaceFolders: [{ name: "workspace", uri: { fsPath: run.root } }]
    }
  }
  const OperationHubProvider = loadProviderWithVscode(vscode)
  const provider = new OperationHubProvider({ api: { listWorkflows: () => [] }, extensionUri: {} })
  t.after(() => provider.dispose())
  return { provider, run, state }
}

function mutationMessage(run, overrides = {}) {
  return {
    type: "operationHub.action",
    action: "retryCurrentStep",
    workspaceRoot: run.root,
    runId: run.runId,
    expectedRevision: run.revision,
    ...overrides
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function runIdentity(overrides = {}) {
  return {
    actionId: "retryCurrentStep",
    workspaceRoot: "C:\\workspace-a",
    targetKind: "run",
    targetId: "run-1",
    ...overrides
  }
}

test("Operation Hub host shares one promise and underlying mutation for identical actions", async () => {
  const coordinator = new OperationHubMutationCoordinator()
  const release = deferred()
  const started = deferred()
  const result = { status: "ok" }
  let calls = 0
  const operation = async () => {
    calls += 1
    started.resolve()
    await release.promise
    return result
  }

  const first = coordinator.coordinate(runIdentity(), operation)
  const duplicate = coordinator.coordinate(runIdentity(), operation)

  assert.strictEqual(duplicate, first)
  await started.promise
  assert.equal(calls, 1)
  release.resolve()
  const [firstResult, duplicateResult] = await Promise.all([first, duplicate])
  assert.strictEqual(firstResult, result)
  assert.strictEqual(duplicateResult, result)
  assert.equal(calls, 1)
})

test("Operation Hub host serializes different mutations for the same root and run", async () => {
  const coordinator = new OperationHubMutationCoordinator()
  const releaseFirst = deferred()
  const firstStarted = deferred()
  const order = []

  const first = coordinator.coordinate(runIdentity({ actionId: "acceptCurrentStep" }), async () => {
    order.push("accept:start")
    firstStarted.resolve()
    await releaseFirst.promise
    order.push("accept:end")
    return "accepted"
  })
  await firstStarted.promise
  const second = coordinator.coordinate(runIdentity({ actionId: "runNextStep" }), async () => {
    order.push("next:start")
    return "next"
  })

  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(order, ["accept:start"])
  releaseFirst.resolve()
  assert.deepEqual(await Promise.all([first, second]), ["accepted", "next"])
  assert.deepEqual(order, ["accept:start", "accept:end", "next:start"])
})

test("Operation Hub host lets equal run ids in different roots proceed independently", async () => {
  const coordinator = new OperationHubMutationCoordinator()
  const releaseA = deferred()
  const releaseB = deferred()
  const startedA = deferred()
  const startedB = deferred()

  const first = coordinator.coordinate(runIdentity({ workspaceRoot: "C:\\workspace-a" }), async () => {
    startedA.resolve()
    await releaseA.promise
    return "a"
  })
  const second = coordinator.coordinate(runIdentity({ workspaceRoot: "C:\\workspace-b" }), async () => {
    startedB.resolve()
    await releaseB.promise
    return "b"
  })

  await Promise.all([startedA.promise, startedB.promise])
  releaseA.resolve()
  releaseB.resolve()
  assert.deepEqual(await Promise.all([first, second]), ["a", "b"])
})

test("Operation Hub host releases a failed mutation so it can be retried", async () => {
  const coordinator = new OperationHubMutationCoordinator()
  let calls = 0
  const operation = async () => {
    calls += 1
    if (calls === 1) throw new Error("transient failure")
    return "retried"
  }

  await assert.rejects(coordinator.coordinate(runIdentity(), operation), /transient failure/)
  assert.equal(await coordinator.coordinate(runIdentity(), operation), "retried")
  assert.equal(calls, 2)
})

test("Operation Hub provider coordinates duplicate structured run mutations before command dispatch", async (t) => {
  const { provider, run, state } = providerHarness(t)
  const release = deferred()
  const started = deferred()
  state.executeCommand = async () => {
    started.resolve()
    await release.promise
    return { status: "retried" }
  }

  const first = provider.handleMessage(mutationMessage(run))
  const duplicate = provider.handleMessage(mutationMessage(run))
  await started.promise
  assert.equal(state.commands.length, 1)
  assert.deepEqual(state.commands[0], [
    "workflowRegister.retryCurrentStep",
    {
      source: "operationHub",
      workspaceRoot: fs.realpathSync(run.root),
      runId: run.runId,
      expectedRevision: run.revision
    }
  ])

  release.resolve()
  await Promise.all([first, duplicate])
  assert.equal(state.commands.length, 1)
  assert.deepEqual(state.errors, [])
})

test("Operation Hub provider rejects a stale run revision before command dispatch", async (t) => {
  const { provider, run, state } = providerHarness(t)
  fs.writeFileSync(run.runFile, `${JSON.stringify({
    runId: run.runId,
    updatedAt: run.updatedAt,
    state: { winner: "external-write-with-same-timestamp" }
  })}\n`)

  await provider.handleMessage(mutationMessage(run))

  assert.equal(state.commands.length, 0)
  assert.ok(
    [...state.errors, ...state.warnings].some((message) => /refresh|更新|再読込/i.test(message)),
    `expected refresh diagnostic, got ${JSON.stringify({ errors: state.errors, warnings: state.warnings })}`
  )
})

test("Operation Hub provider rejects a Webview root that is not a current workspace candidate", async (t) => {
  const { provider, run, state } = providerHarness(t)
  const untrustedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-untrusted-root-"))
  t.after(() => fs.rmSync(untrustedRoot, { recursive: true, force: true }))

  await provider.handleMessage(mutationMessage(run, { workspaceRoot: untrustedRoot }))

  assert.equal(state.commands.length, 0)
  assert.ok(
    [...state.errors, ...state.warnings].some((message) => /workspace|refresh|更新|再読込/i.test(message)),
    `expected workspace diagnostic, got ${JSON.stringify({ errors: state.errors, warnings: state.warnings })}`
  )
})

test("workflow run commands route a structured Operation Hub target to its exact root", async (t) => {
  const { rootB, service, state } = runCommandHarness(t)

  const result = await service.retryCurrentStep({
    source: "operationHub",
    workspaceRoot: rootB.root,
    runId: rootB.runId,
    expectedRevision: rootB.revision
  })

  assert.equal(result.status, "reviewing")
  assert.deepEqual(state.engineRoots, [fs.realpathSync(rootB.root)])
})

test("workflow run commands reject stale structured revisions before run-store or engine access", async (t) => {
  const { rootB, service, state } = runCommandHarness(t)
  fs.writeFileSync(rootB.runFile, `${JSON.stringify({
    ...rootB.run,
    updatedAt: rootB.updatedAt,
    state: { winner: "external-write-with-same-timestamp" }
  })}\n`)

  await assert.rejects(
    service.retryCurrentStep({
      source: "operationHub",
      workspaceRoot: rootB.root,
      runId: rootB.runId,
      expectedRevision: rootB.revision
    }),
    /refresh|更新|再読込/i
  )
  assert.equal(state.runStoreCalls, 0)
  assert.equal(state.engineRoots.length, 0)
})

test("workflow run commands treat a structured workflow target as identity rather than a workflow id object", async (t) => {
  const { rootB, service, state } = runCommandHarness(t)

  const result = await service.runWorkflow({
    source: "operationHub",
    workspaceRoot: rootB.root,
    workflowId: "workflow-register.target"
  })

  assert.equal(result.status, "running")
  assert.deepEqual(state.engineRoots, [fs.realpathSync(rootB.root)])
  assert.deepEqual(state.workflowIds, ["workflow-register.target"])
})

test("Operation Hub model and HTML carry the host revision and root on run mutation buttons", () => {
  const { buildOperationHubModel } = require("../out/gui/operationHubModel")
  const { renderOperationHubHtml } = require("../out/gui/operationHubHtml")
  const revision = `sha256:${"a".repeat(64)}`
  const root = "C:\\workspace-a"
  const model = buildOperationHubModel({
    workspaceName: "workspace-a",
    workspaceRoots: [root],
    extensionStatus: [],
    setup: {
      bobRootPresent: true,
      workflowsPresent: true,
      runStatePresent: true,
      mcpConfigPresent: true,
      traceabilityPresent: false
    },
    workflows: [],
    runs: [{
      root,
      revision,
      run: {
        runId: "run-1",
        workflowId: "workflow-register.target",
        workflowName: "Target",
        status: "failed",
        currentStep: "step",
        inputs: {},
        state: {},
        steps: [{ id: "step", title: "Step", type: "command", status: "failed" }],
        createdAt: "2026-07-12T01:00:00.000Z",
        updatedAt: "2026-07-12T01:00:00.000Z"
      }
    }]
  })

  const retry = model.runMonitor[0].primaryActions.find((action) => action.id === "retryCurrentStep")
  assert.equal(retry.workspaceRoot, root)
  assert.equal(retry.expectedRevision, revision)
  const html = renderOperationHubHtml({ model, cspSource: "vscode-resource:", nonce: "nonce" })
  assert.match(html, /data-workspace-root="C:\\workspace-a"/)
  assert.match(html, new RegExp(`data-expected-revision="${revision}"`))
  assert.match(html, /workspaceRoot: button\.dataset\.workspaceRoot/)
  assert.match(html, /expectedRevision: button\.dataset\.expectedRevision/)
})
