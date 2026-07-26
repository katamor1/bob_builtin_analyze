const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const sourceRoot = path.join(__dirname, "..", "src")

function source(relative) {
  return fs.readFileSync(path.join(sourceRoot, relative), "utf8")
}

test("R4 executes the compiled plan directly and never adapts it into the legacy engine", () => {
  const executor = source("core/contractV2/compiledRunExecutor.ts")
  const steps = source("core/contractV2/compiledRunSteps.ts")
  assert.match(executor, /evaluateCompiledPredicateRecord/)
  assert.match(steps, /invokeCompiledWorkflowProvider/)
  assert.match(steps, /openWorkflowArtifactTransaction/)
  assert.doesNotMatch(`${executor}\n${steps}`, /ActionRegistry|WorkflowEngine|CoreWorkflowDefinition|executeAutomatedStep/)
  assert.doesNotMatch(`${executor}\n${steps}`, /current\.json|compileCurrent|acquireCurrent/)
})

test("the product service supplies the R4 executor instead of the pre-R4 fail stub", () => {
  const service = source("workflowRegisterService.ts")
  const product = source("workflowContractV2RunExecutor.ts")
  assert.match(service, /executeWorkflowContractV2Run/)
  assert.match(service, /contractV2RunExecutor: \(input\) => executeWorkflowContractV2Run\(input\)/)
  assert.doesNotMatch(service, /failContractV2CompiledRuntime/)
  assert.doesNotMatch(service, /runtime execution is not enabled before R4/)
  assert.match(product, /new ContractV2GuardedRunStateStore/)
  assert.match(product, /executeCompiledWorkflowRun/)
  assert.match(product, /metadata\.planDigest !== handle\.planDigest/)
})

test("compiled execution persists initial state before any step and routes command artifacts through R3", () => {
  const executor = source("core/contractV2/compiledRunExecutor.ts")
  const steps = source("core/contractV2/compiledRunSteps.ts")
  const create = executor.indexOf("await runStore.createRunFromPlanLease")
  const initialSave = executor.indexOf("await runStore.saveRun(run)", create)
  const executeStep = executor.indexOf("await executeCompiledStep", initialSave)
  const invoke = steps.indexOf("await invokeCompiledWorkflowProvider")
  const transaction = steps.indexOf("await commitWorkflowArtifactTransaction", invoke)
  assert.ok(create >= 0 && create < initialSave && initialSave < executeStep)
  assert.ok(invoke >= 0 && transaction > invoke)
})
