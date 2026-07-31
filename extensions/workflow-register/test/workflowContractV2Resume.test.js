const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const sourceRoot = path.join(__dirname, "..", "src")
function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), "utf8")
}

function before(text, left, right) {
  const leftIndex = text.indexOf(left)
  const rightIndex = text.indexOf(right)
  assert.ok(leftIndex >= 0, `missing source marker: ${left}`)
  assert.ok(rightIndex >= 0, `missing source marker: ${right}`)
  assert.ok(leftIndex < rightIndex, `${left} must precede ${right}`)
}

test("the product entrypoint acquires an explicit generation without reading current.json", () => {
  const entrypoint = source("workflowContractV2Entrypoint.ts")
  assert.match(entrypoint, /acquireGeneration\(input: CompileWorkflowContractV2GenerationInput\)/)
  const start = entrypoint.indexOf("async acquireGeneration")
  const end = entrypoint.indexOf("invalidateSlot", start)
  const implementation = entrypoint.slice(start, end)
  assert.match(implementation, /loadGeneration/)
  assert.match(implementation, /await acquire/)
  assert.doesNotMatch(implementation, /loadCurrent|acquireCurrent/)
})

test("recorded-generation recovery verifies every persisted binding before adopting the lease", () => {
  const recovery = source("core/contractV2/runPlanRecovery.ts")
  assert.match(recovery, /decodeWorkflowContractV2RunPlanProvenance/)
  before(recovery, "decodeWorkflowContractV2RunPlanProvenance", "acquireGeneration")
  before(recovery, "acquireGeneration", "assertWorkflowContractV2RunPlanProvenanceMatchesLease")
  before(recovery, "assertWorkflowContractV2RunPlanProvenanceMatchesLease", "adoptWorkflowContractV2RunPlanLease")
  assert.match(recovery, /generation: provenance\.generation/)
  assert.match(recovery, /expectedPackageDigest: provenance\.packageDigest/)
  assert.match(recovery, /lease\.release\(\)/)
  assert.doesNotMatch(recovery, /current\.json|compileCurrent|acquireCurrent/)
})

test("recovered lease acquisition happens under run single-flight and the cross-process run lock", () => {
  const coordinator = source("core/engine/runExecutionCoordinator.ts")
  assert.match(coordinator, /coordinateWorkflowContractV2RunRecovery/)
  const recovery = coordinator.indexOf("coordinateWorkflowContractV2RunRecovery")
  const lock = coordinator.indexOf("runStore.withRunLock", recovery)
  const prepare = coordinator.indexOf("recoverPlanLease", recovery)
  const requireLease = coordinator.indexOf("requireWorkflowContractV2RunPlanLeaseForExecution", prepare)
  assert.ok(recovery >= 0 && lock > recovery && prepare > recovery && requireLease > prepare)
})

test("runtime recovery classifies durable status before recorded-generation acquisition", () => {
  const runtime = source("workflowRuntimeFactory.ts")
  assert.match(runtime, /classifyWorkflowContractV2RunRecovery/)
  const recoveryMethod = runtime.indexOf("async resumeWorkflowContractV2Run")
  const classification = runtime.indexOf("classifyWorkflowContractV2RunRecovery(run)", recoveryMethod)
  const acquire = runtime.indexOf("recoverWorkflowContractV2ProductRunPlan", recoveryMethod)
  assert.ok(recoveryMethod >= 0 && classification > recoveryMethod && acquire > classification)
  assert.match(runtime, /classification\.kind !== "resume"/)
})

test("resume commands branch on persisted Contract v2 provenance before current workflow lookup", () => {
  const commands = source("workflowRunCommands.ts")
  const method = commands.indexOf("private async resumeOrRetryRunOnce")
  const v2 = commands.indexOf("run.planProvenance", method)
  const recovery = commands.indexOf("resumeWorkflowContractV2Run", v2)
  const currentWorkflow = commands.indexOf("this.options.coreWorkflows.get", method)
  assert.ok(method >= 0 && v2 > method && recovery > v2)
  assert.ok(currentWorkflow < 0 || recovery < currentWorkflow)
})

test("full Contract v2 continuation starts from the durable currentStep rather than a current definition", () => {
  const executor = source("core/contractV2/compiledRunExecutor.ts")
  assert.match(executor, /options\.executionMode !== "singleStep"/)
  assert.match(executor, /run\.currentStep/)
  assert.match(executor, /findCompiledStepIndex\(plan\.workflow\.steps, run\.currentStep\)/)
  assert.doesNotMatch(executor, /current\.json|compileCurrent|acquireCurrent/)
})
