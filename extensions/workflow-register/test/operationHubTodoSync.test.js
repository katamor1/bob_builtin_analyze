const assert = require("node:assert/strict")
const fs = require("node:fs")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const { readSrc } = require("./helpers/sourceReader")

function loadStepReview(workspaceRoot) {
  const modulePath = require.resolve("../out/commands/stepReview.js")
  delete require.cache[modulePath]
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") {
      return {
        commands: { executeCommand: async () => undefined },
        Uri: { file: (fsPath) => ({ fsPath }) },
        window: {
          showInformationMessage: async () => undefined,
          showQuickPick: async () => undefined,
          showWarningMessage: async () => undefined
        },
        workspace: {
          workspaceFolders: [{ name: "workspace", uri: { fsPath: workspaceRoot } }]
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

function reviewingWorkflow() {
  return {
    id: "workflow-register.concurrent-review",
    name: "concurrent-review",
    label: "Concurrent Review",
    schemaVersion: "workflow-register/v1",
    inputs: {},
    engineSteps: [{ id: "review", title: "Review", type: "command" }]
  }
}

function synchronizeConcurrentReviewLoads(t, FileRunStateStore, targetRunId) {
  const originalListRuns = FileRunStateStore.prototype.listRuns
  const originalLoadRun = FileRunStateStore.prototype.loadRun
  let listed = 0
  let listsReleased = false
  let releaseLists
  const listsReady = new Promise((resolve) => { releaseLists = resolve })
  let loaded = 0
  let releaseLoads
  const loadsReady = new Promise((resolve) => { releaseLoads = resolve })

  FileRunStateStore.prototype.listRuns = async function synchronizedListRuns() {
    const runs = await originalListRuns.call(this)
    listed += 1
    if (listed === 2) {
      listsReleased = true
      releaseLists()
    }
    await listsReady
    return runs
  }
  FileRunStateStore.prototype.loadRun = async function synchronizedLoadRun(runId) {
    const loadedRun = await originalLoadRun.call(this, runId)
    if (runId === targetRunId && listsReleased) {
      loaded += 1
      if (loaded === 2) releaseLoads()
      await loadsReady
    }
    return loadedRun
  }
  t.after(() => {
    FileRunStateStore.prototype.listRuns = originalListRuns
    FileRunStateStore.prototype.loadRun = originalLoadRun
  })
}

test("Operation Hub accept-and-run-next always starts the next step after accepting review", () => {
  const source = readSrc("commands", "stepReview.ts")

  assert.match(source, /export async function acceptAndRunNextStep/)
  assert.match(source, /return vscode\.commands\.executeCommand\("workflowRegister\.runNextStep", accepted\.run\.runId\)/)
  assert.doesNotMatch(source, /if \(accepted\.completedViaBobTask\) \{\s*return accepted\.run\s*\}/)
})

test("review acceptance skips Todo completion for a live gate and awaits only the stale-gate fallback", () => {
  const source = readSrc("commands", "stepReview.ts")

  assert.match(source, /let completedViaBobTask = acceptedViaLiveGate/)
  assert.match(source, /if \(gateDecision === "missing" \|\| gateDecision === "aborted"\) \{[\s\S]*const sync = await bobTaskSyncRegistry\.reconcileRun/)
  assert.match(source, /completedViaBobTask = sync\.status === "synced" && sync\.appliedStepCount > 0/)
  assert.doesNotMatch(source, /completedViaBobTask = sync\.status === "synced" && sync\.taskAvailable/)
})

test("concurrent review acceptance never falls back after the live gate was already settled", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-double-accept-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  fs.mkdirSync(path.join(workspaceRoot, ".bob"), { recursive: true })
  const { BobWorkflowGateRegistry } = require("../out/bobWorkflowGateRegistry")
  const { FileRunStateStore } = require("../out/core/runStateStore")
  const { reviewTaskRegistry } = require("../out/reviewTaskRegistry")
  const runStore = new FileRunStateStore({ workspaceRoot })
  const run = await runStore.createRun(reviewingWorkflow(), {})
  run.status = "reviewing"
  run.currentStep = "review"
  run.steps[0].status = "reviewing"
  await runStore.saveRun(run)

  let setStepCompleteCalls = 0
  reviewTaskRegistry.registerTask(run.runId, "review", {
    setStepComplete: () => { setStepCompleteCalls += 1 }
  })
  const gateRegistry = new BobWorkflowGateRegistry()
  const gate = gateRegistry.waitForDecision({ runId: run.runId, stepId: "review", status: "reviewing" })

  synchronizeConcurrentReviewLoads(t, FileRunStateStore, run.runId)

  const decisions = []
  const options = {
    showMarkdownReport: async () => undefined,
    acceptBobWorkflowGate: (runId, stepId) => {
      const decision = gateRegistry.accept(runId, stepId)
      decisions.push(decision)
      return decision
    }
  }
  const { acceptCurrentStep } = loadStepReview(workspaceRoot)

  const results = await Promise.all([
    acceptCurrentStep(options, run.runId, { silent: true }),
    acceptCurrentStep(options, run.runId, { silent: true })
  ])

  assert.equal(await gate, true)
  assert.equal(setStepCompleteCalls, 0)
  assert.deepEqual(decisions, ["accepted"])
  assert.equal(results[0], results[1])

  const reopened = await runStore.loadRun(run.runId)
  reopened.status = "reviewing"
  reopened.currentStep = "review"
  reopened.steps[0].status = "reviewing"
  await runStore.saveRun(reopened)
  const freshGate = gateRegistry.waitForDecision({ runId: run.runId, stepId: "review", status: "reviewing" })

  await acceptCurrentStep(options, run.runId, { silent: true })

  assert.equal(await freshGate, true)
  assert.equal(setStepCompleteCalls, 0)
  assert.deepEqual(decisions, ["accepted", "accepted"])
})

test("concurrent review acceptance after an aborted live gate shares exactly one legacy reconciliation", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-aborted-accept-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  fs.mkdirSync(path.join(workspaceRoot, ".bob"), { recursive: true })
  const { BobWorkflowGateRegistry } = require("../out/bobWorkflowGateRegistry")
  const { FileRunStateStore } = require("../out/core/runStateStore")
  const { reviewTaskRegistry } = require("../out/reviewTaskRegistry")
  const runStore = new FileRunStateStore({ workspaceRoot })
  const workflow = reviewingWorkflow()
  workflow.id = "workflow-register.aborted-review"
  workflow.name = "aborted-review"
  const run = await runStore.createRun(workflow, {})
  run.status = "reviewing"
  run.currentStep = "review"
  run.steps[0].status = "reviewing"
  await runStore.saveRun(run)

  let setStepCompleteCalls = 0
  let setStepCompleteFinished = false
  reviewTaskRegistry.registerTask(run.runId, "review", {
    setStepComplete: async () => {
      setStepCompleteCalls += 1
      await new Promise((resolve) => setImmediate(resolve))
      setStepCompleteFinished = true
    }
  })
  const gateRegistry = new BobWorkflowGateRegistry()
  const gate = gateRegistry.waitForDecision({ runId: run.runId, stepId: "review", status: "reviewing" })
  const rejected = assert.rejects(gate, /terminal review failure/)
  assert.equal(gateRegistry.abort(run.runId, "review", "terminal review failure"), true)
  await rejected

  synchronizeConcurrentReviewLoads(t, FileRunStateStore, run.runId)

  const decisions = []
  const { acceptCurrentStep } = loadStepReview(workspaceRoot)
  const options = {
    showMarkdownReport: async () => undefined,
    acceptBobWorkflowGate: (runId, stepId) => {
      const decision = gateRegistry.accept(runId, stepId)
      decisions.push(decision)
      return decision
    }
  }
  const results = await Promise.all([
    acceptCurrentStep(options, run.runId, { silent: true }),
    acceptCurrentStep(options, run.runId, { silent: true })
  ])

  assert.equal(setStepCompleteCalls, 1)
  assert.equal(setStepCompleteFinished, true)
  assert.deepEqual(decisions, ["aborted"])
  assert.equal(results[0], results[1])
  assert.equal(gateRegistry.isPending(run.runId, "review"), false)
})

test("concurrent review acceptance without a live gate shares exactly one legacy reconciliation", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-missing-accept-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  fs.mkdirSync(path.join(workspaceRoot, ".bob"), { recursive: true })
  const { FileRunStateStore } = require("../out/core/runStateStore")
  const { reviewTaskRegistry } = require("../out/reviewTaskRegistry")
  const runStore = new FileRunStateStore({ workspaceRoot })
  const workflow = reviewingWorkflow()
  workflow.id = "workflow-register.missing-review"
  workflow.name = "missing-review"
  const run = await runStore.createRun(workflow, {})
  run.status = "reviewing"
  run.currentStep = "review"
  run.steps[0].status = "reviewing"
  await runStore.saveRun(run)

  let setStepCompleteCalls = 0
  let setStepCompleteFinished = false
  reviewTaskRegistry.registerTask(run.runId, "review", {
    setStepComplete: async () => {
      setStepCompleteCalls += 1
      await new Promise((resolve) => setImmediate(resolve))
      setStepCompleteFinished = true
    }
  })
  synchronizeConcurrentReviewLoads(t, FileRunStateStore, run.runId)

  const decisions = []
  const { acceptCurrentStep } = loadStepReview(workspaceRoot)
  const options = {
    showMarkdownReport: async () => undefined,
    acceptBobWorkflowGate: () => {
      decisions.push("missing")
      return "missing"
    }
  }
  const results = await Promise.all([
    acceptCurrentStep(options, run.runId, { silent: true }),
    acceptCurrentStep(options, run.runId, { silent: true })
  ])

  assert.equal(setStepCompleteCalls, 1)
  assert.equal(setStepCompleteFinished, true)
  assert.deepEqual(decisions, ["missing"])
  assert.equal(results[0], results[1])
})

test("failed single-flight review acceptance is removed so a later retry can proceed", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-accept-retry-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  fs.mkdirSync(path.join(workspaceRoot, ".bob"), { recursive: true })
  const { FileRunStateStore } = require("../out/core/runStateStore")
  const runStore = new FileRunStateStore({ workspaceRoot })
  const workflow = reviewingWorkflow()
  workflow.id = "workflow-register.accept-retry"
  workflow.name = "accept-retry"
  const run = await runStore.createRun(workflow, {})
  run.status = "reviewing"
  run.currentStep = "review"
  run.steps[0].status = "reviewing"
  await runStore.saveRun(run)

  synchronizeConcurrentReviewLoads(t, FileRunStateStore, run.runId)
  const originalSaveRun = FileRunStateStore.prototype.saveRun
  let acceptedSaveCalls = 0
  FileRunStateStore.prototype.saveRun = async function failFirstAcceptedSave(candidate) {
    if (candidate.runId === run.runId && candidate.steps[0]?.status === "completed") {
      acceptedSaveCalls += 1
      if (acceptedSaveCalls === 1) throw new Error("accepted save failed")
    }
    return originalSaveRun.call(this, candidate)
  }
  t.after(() => { FileRunStateStore.prototype.saveRun = originalSaveRun })

  const { acceptCurrentStep } = loadStepReview(workspaceRoot)
  const options = {
    showMarkdownReport: async () => undefined,
    acceptBobWorkflowGate: () => "missing"
  }
  const failed = await Promise.allSettled([
    acceptCurrentStep(options, run.runId, { silent: true }),
    acceptCurrentStep(options, run.runId, { silent: true })
  ])

  assert.deepEqual(failed.map((result) => result.status), ["rejected", "rejected"])
  assert.deepEqual(failed.map((result) => result.reason?.message), ["accepted save failed", "accepted save failed"])
  assert.equal(acceptedSaveCalls, 1)

  const retried = await acceptCurrentStep(options, run.runId, { silent: true })
  assert.notEqual(typeof retried, "string")
  assert.equal(retried.status, "completed")
})

test("Bob runner and Operation Hub command reconciliation await async Todo projection", () => {
  const runner = readSrc("bobWorkflowRunner.ts")
  const commands = readSrc("workflowRunCommands.ts")

  assert.match(runner, /const sync = await bobTaskSyncRegistry\.reconcileRun/)
  assert.match(commands, /const sync = await bobTaskSyncRegistry\.reconcileRun/)
})
