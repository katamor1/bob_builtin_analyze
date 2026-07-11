const assert = require("node:assert/strict")
const fs = require("node:fs")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const vscodeState = {
  executedCommands: [],
  executeCommand: async () => undefined,
  workspaceFolders: []
}

const vscode = {
  commands: {
    executeCommand: async (...args) => {
      vscodeState.executedCommands.push(args)
      return vscodeState.executeCommand(...args)
    }
  },
  window: {
    showErrorMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showQuickPick: async (items) => items[0],
    showWarningMessage: async () => undefined
  },
  workspace: {
    get isTrusted() { return true },
    get workspaceFolders() { return vscodeState.workspaceFolders }
  }
}

function loadWithVscode(modulePaths) {
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return modulePaths.map((modulePath) => {
      const resolved = require.resolve(modulePath)
      delete require.cache[resolved]
      return require(resolved)
    })
  } finally {
    Module._load = originalLoad
  }
}

const [runnerModule, commandModule, runControlModule] = loadWithVscode([
  "../out/bobWorkflowRunner.js",
  "../out/workflowRunCommands.js",
  "../out/commands/runControl.js"
])

const { BobWorkflowEngineRunner, StepRuntime } = runnerModule
const { WorkflowRunCommandService } = commandModule
const { resumePausedRun } = runControlModule
const { BobWorkflowGateRegistry } = require("../out/bobWorkflowGateRegistry")
const { ReviewAcceptanceCoordinator } = require("../out/reviewAcceptanceCoordinator")
const { ActionRegistry } = require("../out/core/actionRegistry")
const { FileRunControlStore } = require("../out/core/runControlStore")
const { FileRunStateStore } = require("../out/core/runStateStore")
const { createDefaultResultSinkRegistry } = require("../out/core/resultSinkRegistry")
const { WorkflowEngine } = require("../out/core/engine")
const { reviewTaskRegistry } = require("../out/reviewTaskRegistry")

function tempRoot(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

function commandStep(id, provider = `sample.${id}`) {
  return {
    id,
    title: id,
    type: "command",
    action: { provider },
    resultKey: `${id}Result`
  }
}

function coreWorkflow(root, id, steps, overrides = {}) {
  return {
    id: `workflow-register.${id}`,
    name: id,
    label: id,
    description: `${id} lifecycle test`,
    schemaVersion: "workflow-register/v1",
    workflowRoot: root,
    inputs: {},
    guardrails: {},
    stepReview: {
      enabled: false,
      pauseAfter: "none",
      requireAcceptBeforeNext: false,
      allowRetry: true,
      allowEditBeforeRetry: true,
      preserveAttempts: true
    },
    stepExecution: { mode: "engineSteps", allowOutOfOrder: false, showInBob: true },
    engineSteps: steps,
    ...overrides
  }
}

function bobDefinition(workflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    label: workflow.label,
    menuLabel: workflow.label,
    description: workflow.description,
    prompt: "",
    promptWithoutTodo: "",
    commandArgs: [],
    mode: "agent",
    permissions: [],
    autoApprovalEnabled: true,
    workspaceRequired: false,
    hidden: false,
    todoEnabled: true,
    todoRequired: false,
    todoSource: "",
    todoAsSteps: true,
    stepCompletion: "auto",
    stepMessage: "none",
    stepExecution: workflow.stepExecution,
    stepsById: Object.fromEntries(workflow.engineSteps.map((step) => [step.id, {
      id: step.id,
      prompt: "",
      commandArgs: [],
      sendResult: false,
      required: true,
      completeOnSuccess: true,
      runAgent: false,
      includeState: [],
      maxResultBytes: 1024,
      stateRequired: false,
      captureResult: false,
      resultCommandArgs: []
    }])),
    todos: workflow.engineSteps.map((step) => ({ id: step.id, text: step.title, raw: `${step.id}: ${step.title}` })),
    inputs: {},
    guardrails: workflow.guardrails ?? {},
    workflowRoot: workflow.workflowRoot,
    file: { fsPath: path.join(workflow.workflowRoot, "WORKFLOW.md") },
    core: workflow
  }
}

function createRunner(t, workflow, registerActions) {
  const actions = new ActionRegistry()
  registerActions(actions)
  const runStore = new FileRunStateStore({ workspaceRoot: workflow.workflowRoot, engineVersion: "gate-test" })
  const gateRegistry = new BobWorkflowGateRegistry()
  const stepRuntime = new StepRuntime()
  const runner = new BobWorkflowEngineRunner({
    definition: bobDefinition(workflow),
    coreWorkflow: workflow,
    actionRegistry: actions,
    resultSinks: () => createDefaultResultSinkRegistry({
      workspaceRoot: workflow.workflowRoot,
      executeCommand: async () => undefined
    }),
    runStore: () => runStore,
    taskSnapshotStore: () => undefined,
    preflightChecks: () => ({ bazaarRepository: async () => true }),
    stepRuntime,
    inputsProvider: async () => ({}),
    gateRegistry
  })
  return { gateRegistry, runStore, runner, stepRuntime }
}

async function waitForRunStatus(runStore, status, timeoutMs = 10_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    const run = (await runStore.listRuns()).find((candidate) => candidate.status === status)
    if (run) return run
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Bob workflow did not reach ${status} within ${timeoutMs}ms.`)
}

async function waitFor(predicate, timeoutMs = 5_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`Condition was not met within ${timeoutMs}ms.`)
}

function trackSettlement(promise) {
  const state = { settled: false, resolutions: 0, rejections: 0 }
  void promise.then(
    () => {
      state.settled = true
      state.resolutions += 1
    },
    () => {
      state.settled = true
      state.rejections += 1
    }
  )
  return state
}

async function abortExecution(registry, root, runId, execution) {
  if (typeof registry.abortPending === "function") {
    registry.abortPending(root, runId, "test cleanup")
  }
  await Promise.race([
    execution.catch(() => false),
    new Promise((resolve) => setTimeout(resolve, 250))
  ])
}

test("Bob runner remains pending when the engine returns held", async (t) => {
  const root = tempRoot(t, "workflow-register-bob-held-")
  const step = commandStep("collect")
  const workflow = coreWorkflow(root, "bob-held", [step], {
    guardrails: {
      requireApproval: [{ id: "approve-collect", when: "provider == 'sample.collect'" }]
    }
  })
  const { gateRegistry, runStore, runner } = createRunner(t, workflow, (actions) => {
    actions.register({ id: "sample.collect", execute: async () => "context" })
  })
  const execution = runner.runEngineStep("collect", 0, {
    sendMessage: async () => undefined,
    setStepComplete: () => undefined
  })
  const settlement = trackSettlement(execution)
  const held = await waitForRunStatus(runStore, "held")

  try {
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(settlement.settled, false)
    assert.deepEqual(gateRegistry.pendingForRun(root, held.runId), {
      workspaceRoot: root,
      runId: held.runId,
      stepId: "collect",
      ownerStepId: "collect",
      status: "held"
    })
    const rejected = assert.rejects(execution, /terminal held abort/)
    assert.equal(gateRegistry.abortPending(root, held.runId, "terminal held abort"), true)
    await rejected
  } finally {
    await abortExecution(gateRegistry, root, held.runId, execution)
  }
})

test("Bob runner remains pending at a branch checkpoint", async (t) => {
  const root = tempRoot(t, "workflow-register-bob-checkpoint-")
  const step = {
    ...commandStep("loop"),
    transition: {
      decisions: [{ id: "retry", when: { stateKey: "loopResult", equals: "retry" }, goto: "loop", loop: "retry-loop" }],
      default: "next"
    }
  }
  const workflow = coreWorkflow(root, "bob-checkpoint", [step], {
    branching: {
      enabled: true,
      loops: [{ id: "retry-loop", entryStep: "loop", maxIterations: 0, extensionSize: 1 }]
    }
  })
  const { gateRegistry, runStore, runner } = createRunner(t, workflow, (actions) => {
    actions.register({ id: "sample.loop", execute: async () => "retry" })
  })
  const execution = runner.runEngineStep("loop", 0, {
    sendMessage: async () => undefined,
    setStepComplete: () => undefined
  })
  const settlement = trackSettlement(execution)
  const checkpointed = await waitForRunStatus(runStore, "checkpoint")

  try {
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(settlement.settled, false)
    assert.equal(gateRegistry.pendingForRun(root, checkpointed.runId).status, "checkpoint")
  } finally {
    await abortExecution(gateRegistry, root, checkpointed.runId, execution)
  }
})

test("Bob runner keeps the completed owner step pending when a pause points at the next step", async (t) => {
  const root = tempRoot(t, "workflow-register-bob-paused-")
  const first = commandStep("first")
  const second = commandStep("second")
  const workflow = coreWorkflow(root, "bob-paused", [first, second])
  const controlStore = new FileRunControlStore({ workspaceRoot: root })
  const { gateRegistry, runStore, runner } = createRunner(t, workflow, (actions) => {
    actions.register({
      id: "sample.first",
      execute: async ({ runId }) => {
        await controlStore.requestPause({ runId, requestedBy: "test" })
        return "first"
      }
    })
    actions.register({ id: "sample.second", execute: async () => "second" })
  })
  const execution = runner.runEngineStep("first", 0, {
    sendMessage: async () => undefined,
    setStepComplete: () => undefined
  })
  const settlement = trackSettlement(execution)
  const paused = await waitForRunStatus(runStore, "paused")

  try {
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(settlement.settled, false)
    assert.equal(paused.steps[0].status, "completed")
    assert.equal(paused.currentStep, "second")
    assert.deepEqual(gateRegistry.pendingForRun(root, paused.runId), {
      workspaceRoot: root,
      runId: paused.runId,
      stepId: "second",
      ownerStepId: "first",
      status: "paused"
    })
  } finally {
    await abortExecution(gateRegistry, root, paused.runId, execution)
  }
})

test("StepRuntime manual hold remains the only pending primitive for a manual Bob step", async (t) => {
  const root = tempRoot(t, "workflow-register-bob-manual-")
  const step = { id: "manual", title: "manual", type: "manual" }
  const workflow = coreWorkflow(root, "bob-manual", [step])
  const { gateRegistry, runner, stepRuntime } = createRunner(t, workflow, () => undefined)
  let completed = 0
  const execution = runner.runEngineStep("manual", 0, {
    sendMessage: async () => undefined,
    setStepComplete: () => { completed += 1 }
  })
  await waitFor(() => stepRuntime.list().length === 1)
  const active = stepRuntime.list()[0]

  assert.equal(gateRegistry.isPending(root, active.runId, "manual"), false)
  assert.match(await stepRuntime.completeStepByKey(active.key), /Completed:/)
  assert.equal(await execution, true)
  assert.equal(completed, 1)
})

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

function createCommandService(root, workflow, engine, gateRegistry = new BobWorkflowGateRegistry(), providedRunStore) {
  const runStore = providedRunStore ?? new FileRunStateStore({ workspaceRoot: root, engineVersion: "gate-command-test" })
  const coordinator = new ReviewAcceptanceCoordinator()
  const runtimeFactory = {
    createRunStore: () => runStore,
    createEngine: () => engine
  }
  const service = new WorkflowRunCommandService({
    coreWorkflows: new Map([[workflow.id, workflow]]),
    runtimeFactory,
    ensureWorkflowsLoaded: async () => undefined,
    workflowRootCandidates: async () => [markerRoot(root)],
    activeSteps: () => [],
    showManualStepPanel: async () => undefined,
    gateRegistry,
    coordinateGateDecision: (workspaceRoot, runId, operation) => coordinator.coordinate(workspaceRoot, runId, operation)
  })
  return { gateRegistry, runStore, service }
}

async function saveRunWithStatus(runStore, workflow, status, currentStep, stepStatuses) {
  const run = await runStore.createRun(workflow, {})
  run.status = status
  run.currentStep = currentStep
  for (const [stepId, stepStatus] of Object.entries(stepStatuses)) {
    const step = run.steps.find((candidate) => candidate.id === stepId)
    step.status = stepStatus
  }
  await runStore.saveRun(run)
  return run
}

async function saveCheckpointedRun(runStore, workflow, checkpointId) {
  const run = await saveRunWithStatus(runStore, workflow, "checkpoint", "target", {
    source: "completed",
    target: "pending"
  })
  run.branching = {
    loops: {
      loop: {
        loopId: "loop",
        count: 1,
        allowed: 1,
        maxIterations: 1,
        extensionSize: 1,
        checkpointCount: 1
      }
    },
    history: [],
    checkpoint: {
      id: checkpointId,
      loopId: "loop",
      fromStepId: "source",
      toStepId: "target",
      decisionId: "retry",
      count: 1,
      allowed: 1,
      extensionSize: 1,
      message: checkpointId,
      createdAt: new Date().toISOString()
    }
  }
  await runStore.saveRun(run)
  return run
}

function createCheckpointEngine(root, runStore) {
  return new WorkflowEngine({
    actions: new ActionRegistry(),
    resultSinks: createDefaultResultSinkRegistry({ workspaceRoot: root, executeCommand: async () => undefined }),
    runStore
  })
}

test("duplicate retry commands rebind one live Promise and resolve it only after durable completion", async (t) => {
  const root = tempRoot(t, "workflow-register-gate-retry-")
  const workflow = coreWorkflow(root, "gate-retry", [commandStep("source"), commandStep("target")])
  let retryCalls = 0
  let releaseFirst
  const firstReleased = new Promise((resolve) => { releaseFirst = resolve })
  let phase = "gate"
  let runStore
  const retryOptions = []
  const engine = {
    retryCurrentStep: async (runId, _workflow, options) => {
      retryCalls += 1
      retryOptions.push(options)
      if (phase === "gate") await firstReleased
      const run = await runStore.loadRun(runId)
      if (phase === "gate") {
        run.steps[0].status = "completed"
        run.steps[1].status = "held"
        run.status = "held"
        run.currentStep = "target"
      } else {
        run.steps[1].status = "completed"
        run.status = "completed"
        run.currentStep = undefined
      }
      await runStore.saveRun(run)
      return run
    }
  }
  const context = createCommandService(root, workflow, engine)
  runStore = context.runStore
  const run = await saveRunWithStatus(runStore, workflow, "reviewing", "source", { source: "reviewing", target: "pending" })
  const gate = context.gateRegistry.waitForDecision({
    workspaceRoot: root,
    runId: run.runId,
    stepId: "source",
    ownerStepId: "source",
    status: "reviewing"
  })
  const settlement = trackSettlement(gate)

  const first = context.service.retryCurrentStep(run.runId)
  const duplicate = context.service.retryCurrentStep(run.runId)
  try {
    await waitFor(() => retryCalls > 0)
    assert.equal(retryCalls, 1)
    releaseFirst()
    const [firstResult, duplicateResult] = await Promise.all([first, duplicate])
    assert.equal(firstResult.status, "held")
    assert.equal(duplicateResult.status, "held")
    assert.equal(retryOptions[0].executionMode, "singleStep")
    assert.equal(settlement.settled, false)
    assert.deepEqual(context.gateRegistry.pendingForRun(root, run.runId), {
      workspaceRoot: root,
      runId: run.runId,
      stepId: "target",
      ownerStepId: "source",
      status: "held"
    })

    phase = "complete"
    await context.service.retryCurrentStep(run.runId)
    assert.equal(await gate, true)
    assert.deepEqual(settlement, { settled: true, resolutions: 1, rejections: 0 })
    assert.equal(retryCalls, 2)
  } finally {
    releaseFirst()
    await Promise.allSettled([first, duplicate])
    if (typeof context.gateRegistry.abortPending === "function") {
      context.gateRegistry.abortPending(root, run.runId, "test cleanup")
    } else {
      context.gateRegistry.abort(root, run.runId, "source", "test cleanup")
      context.gateRegistry.abort(root, run.runId, "target", "test cleanup")
    }
    await gate.catch(() => undefined)
  }
})

test("live held resume executes only the Bob-visible owner step", async (t) => {
  const root = tempRoot(t, "workflow-register-gate-held-resume-")
  const workflow = coreWorkflow(root, "gate-held-resume", [commandStep("source"), commandStep("target")], {
    guardrails: {
      requireApproval: [{ id: "approve-source", when: "provider == 'sample.source'" }]
    }
  })
  const actions = new ActionRegistry()
  let sourceCalls = 0
  let targetCalls = 0
  actions.register({ id: "sample.source", execute: async () => { sourceCalls += 1; return "source" } })
  actions.register({ id: "sample.target", execute: async () => { targetCalls += 1; return "target" } })
  const runStore = new FileRunStateStore({ workspaceRoot: root, engineVersion: "gate-held-resume-test" })
  const createEngine = () => new WorkflowEngine({
    actions,
    resultSinks: createDefaultResultSinkRegistry({ workspaceRoot: root, executeCommand: async () => undefined }),
    runStore
  })
  const held = await createEngine().runWorkflow(workflow, {})
  assert.equal(held.status, "held")
  const gateRegistry = new BobWorkflowGateRegistry()
  const gate = gateRegistry.waitForDecision({
    workspaceRoot: root,
    runId: held.runId,
    stepId: "source",
    ownerStepId: "source",
    status: "held"
  })
  const coordinator = new ReviewAcceptanceCoordinator()
  const service = new WorkflowRunCommandService({
    coreWorkflows: new Map([[workflow.id, workflow]]),
    runtimeFactory: { createRunStore: () => runStore, createEngine },
    ensureWorkflowsLoaded: async () => undefined,
    workflowRootCandidates: async () => [markerRoot(root)],
    activeSteps: () => [],
    showManualStepPanel: async () => undefined,
    gateRegistry,
    coordinateGateDecision: (workspaceRoot, runId, operation) => coordinator.coordinate(workspaceRoot, runId, operation)
  })

  const result = await service.resumeRun(held.runId)

  assert.equal(result.status, "running")
  assert.equal(result.steps[0].status, "completed")
  assert.equal(result.steps[1].status, "pending")
  assert.equal(sourceCalls, 1)
  assert.equal(targetCalls, 0)
  assert.equal(await gate, true)
})

test("checkpoint approval is single-flight, durable before accept, and leaves next-step execution to Bob", async (t) => {
  const root = tempRoot(t, "workflow-register-gate-checkpoint-approve-")
  const workflow = coreWorkflow(root, "gate-checkpoint-approve", [commandStep("source"), commandStep("target")])
  let approveCalls = 0
  let resumeCalls = 0
  let releaseApprove
  const approveReleased = new Promise((resolve) => { releaseApprove = resolve })
  let runStore
  const engine = {
    approveBranchCheckpoint: async (runId) => {
      approveCalls += 1
      await approveReleased
      const run = await runStore.loadRun(runId)
      run.status = "running"
      run.currentStep = "target"
      delete run.branching.checkpoint
      await runStore.saveRun(run)
      return run
    },
    resumeRun: async () => {
      resumeCalls += 1
      throw new Error("checkpoint approval must not resume the target step")
    }
  }
  const context = createCommandService(root, workflow, engine)
  runStore = context.runStore
  const run = await saveRunWithStatus(runStore, workflow, "checkpoint", "target", { source: "completed", target: "pending" })
  run.branching = {
    loops: { loop: { loopId: "loop", count: 1, allowed: 1, maxIterations: 1, extensionSize: 1, checkpointCount: 1 } },
    history: [],
    checkpoint: { id: "checkpoint", loopId: "loop", fromStepId: "source", toStepId: "target", decisionId: "retry", count: 1, allowed: 1, extensionSize: 1, message: "approve", createdAt: new Date().toISOString() }
  }
  await runStore.saveRun(run)
  const gate = context.gateRegistry.waitForDecision({ workspaceRoot: root, runId: run.runId, stepId: "target", ownerStepId: "source", status: "checkpoint" })
  const durableStatus = gate.then(
    async () => (await runStore.loadRun(run.runId)).status,
    () => "aborted"
  )

  const first = context.service.approveBranchCheckpoint(run.runId)
  const duplicate = context.service.approveBranchCheckpoint(run.runId)
  try {
    await waitFor(() => approveCalls > 0)
    assert.equal(approveCalls, 1)
    releaseApprove()
    const results = await Promise.all([first, duplicate])

    assert.equal(results[0].status, "running")
    assert.equal(results[1].status, "running")
    assert.equal(await durableStatus, "running")
    assert.equal(resumeCalls, 0)
    assert.equal(context.gateRegistry.pendingForRun(root, run.runId), undefined)
  } finally {
    releaseApprove()
    await Promise.allSettled([first, duplicate])
    if (typeof context.gateRegistry.abortPending === "function") {
      context.gateRegistry.abortPending(root, run.runId, "test cleanup")
    } else {
      context.gateRegistry.abort(root, run.runId, "source", "test cleanup")
    }
    await gate.catch(() => undefined)
  }
})

test("checkpoint abort durably fails the run before rejecting the live gate with a stable error", async (t) => {
  const root = tempRoot(t, "workflow-register-gate-checkpoint-abort-")
  const workflow = coreWorkflow(root, "gate-checkpoint-abort", [commandStep("source"), commandStep("target")])
  let runStore
  let receivedReason
  const engine = {
    abortBranchCheckpoint: async (runId, reason) => {
      receivedReason = reason
      const run = await runStore.loadRun(runId)
      run.status = "failed"
      run.error = reason
      await runStore.saveRun(run)
      return run
    }
  }
  const context = createCommandService(root, workflow, engine)
  runStore = context.runStore
  const run = await saveRunWithStatus(runStore, workflow, "checkpoint", "target", { source: "completed", target: "pending" })
  const gate = context.gateRegistry.waitForDecision({ workspaceRoot: root, runId: run.runId, stepId: "target", ownerStepId: "source", status: "checkpoint" })
  const rejected = assert.rejects(gate, /Bob workflow run aborted at branch checkpoint\./)

  try {
    const result = await context.service.abortBranchCheckpoint(run.runId)

    assert.equal(receivedReason, "Bob workflow run aborted at branch checkpoint.")
    await rejected
    assert.equal(result.status, "failed")
    assert.equal((await runStore.loadRun(run.runId)).error, receivedReason)
    assert.equal(context.gateRegistry.pendingForRun(root, run.runId), undefined)
  } finally {
    if (typeof context.gateRegistry.abortPending === "function") {
      context.gateRegistry.abortPending(root, run.runId, "Bob workflow run aborted at branch checkpoint.")
    } else {
      context.gateRegistry.abort(root, run.runId, "source", "Bob workflow run aborted at branch checkpoint.")
    }
    await rejected
  }
})

test("sequential checkpoint approval reuses one durable decision and rejects a later abort", async (t) => {
  const root = tempRoot(t, "workflow-register-gate-checkpoint-sequential-approve-")
  const workflow = coreWorkflow(root, "gate-checkpoint-sequential-approve", [commandStep("source"), commandStep("target")])
  const runStore = new FileRunStateStore({ workspaceRoot: root, engineVersion: "checkpoint-decision-test" })
  const engine = createCheckpointEngine(root, runStore)
  const context = createCommandService(root, workflow, engine, new BobWorkflowGateRegistry(), runStore)
  const run = await saveCheckpointedRun(runStore, workflow, "checkpoint-sequential-approve")
  const gate = context.gateRegistry.waitForDecision({
    workspaceRoot: root,
    runId: run.runId,
    stepId: "target",
    ownerStepId: "source",
    status: "checkpoint"
  })

  const first = await context.service.approveBranchCheckpoint(run.runId)
  assert.equal(await gate, true)
  const firstPersisted = await runStore.loadRun(run.runId)
  const firstLoop = { ...firstPersisted.branching.loops.loop }

  const duplicate = await context.service.approveBranchCheckpoint(run.runId)
  const duplicatePersisted = await runStore.loadRun(run.runId)

  assert.equal(first.status, "running")
  assert.equal(duplicate.status, "running")
  assert.deepEqual(duplicatePersisted.branching.loops.loop, firstLoop)
  assert.equal(Array.isArray(duplicatePersisted.branching.checkpointDecisions), true)
  assert.equal(duplicatePersisted.branching.checkpointDecisions.length, 1)
  assert.deepEqual(duplicatePersisted.branching.checkpointDecisions[0], firstPersisted.branching.checkpointDecisions[0])
  assert.deepEqual(duplicatePersisted.branching.checkpointDecisions[0], {
    checkpointId: "checkpoint-sequential-approve",
    outcome: "approved",
    loopId: "loop",
    ownerStepId: "source",
    targetStepId: "target",
    transitionDecisionId: "retry",
    decidedAt: duplicatePersisted.branching.checkpointDecisions[0].decidedAt
  })
  assert.match(duplicatePersisted.branching.checkpointDecisions[0].decidedAt, /^\d{4}-\d{2}-\d{2}T/)
  await assert.rejects(
    context.service.abortBranchCheckpoint(run.runId),
    /already approved|conflicting checkpoint decision/i
  )
})

test("sequential checkpoint abort reuses one durable decision and rejects a later approval", async (t) => {
  const root = tempRoot(t, "workflow-register-gate-checkpoint-sequential-abort-")
  const workflow = coreWorkflow(root, "gate-checkpoint-sequential-abort", [commandStep("source"), commandStep("target")])
  const runStore = new FileRunStateStore({ workspaceRoot: root, engineVersion: "checkpoint-decision-test" })
  const engine = createCheckpointEngine(root, runStore)
  const context = createCommandService(root, workflow, engine, new BobWorkflowGateRegistry(), runStore)
  const run = await saveCheckpointedRun(runStore, workflow, "checkpoint-sequential-abort")
  const gate = context.gateRegistry.waitForDecision({
    workspaceRoot: root,
    runId: run.runId,
    stepId: "target",
    ownerStepId: "source",
    status: "checkpoint"
  })
  const gateRejected = assert.rejects(gate, /Bob workflow run aborted at branch checkpoint\./)

  const first = await context.service.abortBranchCheckpoint(run.runId)
  await gateRejected
  const firstPersisted = await runStore.loadRun(run.runId)
  const firstLoop = { ...firstPersisted.branching.loops.loop }

  const duplicate = await context.service.abortBranchCheckpoint(run.runId)
  const duplicatePersisted = await runStore.loadRun(run.runId)

  assert.equal(first.status, "failed")
  assert.equal(duplicate.status, "failed")
  assert.deepEqual(duplicatePersisted.branching.loops.loop, firstLoop)
  assert.equal(Array.isArray(duplicatePersisted.branching.checkpointDecisions), true)
  assert.equal(duplicatePersisted.branching.checkpointDecisions.length, 1)
  assert.deepEqual(duplicatePersisted.branching.checkpointDecisions[0], firstPersisted.branching.checkpointDecisions[0])
  assert.deepEqual(duplicatePersisted.branching.checkpointDecisions[0], {
    checkpointId: "checkpoint-sequential-abort",
    outcome: "aborted",
    loopId: "loop",
    ownerStepId: "source",
    targetStepId: "target",
    transitionDecisionId: "retry",
    decidedAt: duplicatePersisted.branching.checkpointDecisions[0].decidedAt,
    reason: "Bob workflow run aborted at branch checkpoint."
  })
  assert.match(duplicatePersisted.branching.checkpointDecisions[0].decidedAt, /^\d{4}-\d{2}-\d{2}T/)
  await assert.rejects(
    context.service.approveBranchCheckpoint(run.runId),
    /already aborted|conflicting checkpoint decision/i
  )
})

test("live pause resume releases a completed owner without running the next step", async (t) => {
  const root = tempRoot(t, "workflow-register-gate-pause-live-")
  const workflow = coreWorkflow(root, "gate-pause-live", [commandStep("source"), commandStep("target")])
  let resumeCalls = 0
  let runStore
  const engine = {
    resumeRun: async (runId) => {
      resumeCalls += 1
      const run = await runStore.loadRun(runId)
      run.status = "completed"
      run.currentStep = undefined
      run.steps[1].status = "completed"
      await runStore.saveRun(run)
      return run
    }
  }
  const context = createCommandService(root, workflow, engine)
  runStore = context.runStore
  const run = await saveRunWithStatus(context.runStore, workflow, "paused", "target", { source: "completed", target: "pending" })
  const controlStore = new FileRunControlStore({ workspaceRoot: root })
  await controlStore.requestPause({ runId: run.runId, requestedBy: "test" })
  const gate = context.gateRegistry.waitForDecision({ workspaceRoot: root, runId: run.runId, stepId: "target", ownerStepId: "source", status: "paused" })

  try {
    const result = await context.service.resumeRun(run.runId)

    assert.equal(resumeCalls, 0)
    assert.equal(result.status, "running")
    assert.equal(result.currentStep, "target")
    assert.equal(await gate, true)
    assert.equal(await controlStore.isPauseRequested(run.runId), false)
  } finally {
    if (typeof context.gateRegistry.abortPending === "function") {
      context.gateRegistry.abortPending(root, run.runId, "test cleanup")
    } else {
      context.gateRegistry.abort(root, run.runId, "source", "test cleanup")
    }
    await gate.catch(() => undefined)
  }
})

test("pause resume keeps the standalone engine path when there is no live Bob gate", async (t) => {
  const root = tempRoot(t, "workflow-register-gate-pause-standalone-")
  const workflow = coreWorkflow(root, "gate-pause-standalone", [commandStep("source")])
  let resumeCalls = 0
  let runStore
  const resumeOptions = []
  const engine = {
    resumeRun: async (runId, options) => {
      resumeCalls += 1
      resumeOptions.push(options)
      const run = await runStore.loadRun(runId)
      run.status = "completed"
      run.currentStep = undefined
      run.steps[0].status = "completed"
      await runStore.saveRun(run)
      return run
    }
  }
  const context = createCommandService(root, workflow, engine)
  runStore = context.runStore
  const run = await saveRunWithStatus(runStore, workflow, "paused", "source", { source: "pending" })
  reviewTaskRegistry.registerTask(run.runId, "source", { setStepComplete: () => undefined })

  const result = await context.service.resumeRun(run.runId)

  assert.equal(result.status, "completed")
  assert.equal(resumeCalls, 1)
  assert.equal(resumeOptions[0].executionMode, undefined)
})

test("resumePausedRun delegates before clearing pause state so the service owns the decision", async (t) => {
  const root = tempRoot(t, "workflow-register-run-control-pause-")
  fs.mkdirSync(path.join(root, ".bob"), { recursive: true })
  const workflow = coreWorkflow(root, "run-control-pause", [commandStep("source")])
  const runStore = new FileRunStateStore({ workspaceRoot: root })
  const run = await saveRunWithStatus(runStore, workflow, "paused", "source", { source: "pending" })
  const controlStore = new FileRunControlStore({ workspaceRoot: root })
  await controlStore.requestPause({ runId: run.runId, requestedBy: "test" })
  vscodeState.workspaceFolders = [{ name: "workspace", uri: { fsPath: root } }]
  let delegatedControl
  vscodeState.executeCommand = async (command, runId) => {
    assert.equal(command, "workflowRegister.resumeRun")
    assert.equal(runId, run.runId)
    delegatedControl = await controlStore.loadControl(runId)
    return "delegated"
  }

  try {
    assert.equal(await resumePausedRun({ showMarkdownReport: async () => undefined }, run.runId), "delegated")
    assert.ok(delegatedControl.pauseRequestedAt)
    assert.equal(delegatedControl.clearedAt, undefined)
  } finally {
    vscodeState.executeCommand = async () => undefined
    vscodeState.workspaceFolders = []
  }
})

test("disposing the service-owned registry rejects held, checkpoint, and paused gates", async () => {
  const registry = new BobWorkflowGateRegistry()
  const gates = ["held", "checkpoint", "paused"].map((status) => registry.waitForDecision({
    workspaceRoot: "C:\\workspace",
    runId: `run-${status}`,
    stepId: status,
    ownerStepId: status,
    status
  }))
  const rejected = gates.map((gate) => assert.rejects(gate, /disposed/i))

  registry.dispose()

  await Promise.all(rejected)
  for (const status of ["held", "checkpoint", "paused"]) {
    assert.equal(registry.pendingForRun("C:\\workspace", `run-${status}`), undefined)
  }
})
