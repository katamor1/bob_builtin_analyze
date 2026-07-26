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
  assert.match(executor, /invokeCompiledWorkflowProvider/)
  assert.match(executor, /openWorkflowArtifactTransaction/)
  assert.match(executor, /evaluateWorkflowPredicate/)
  assert.doesNotMatch(executor, /ActionRegistry|WorkflowEngine|CoreWorkflowDefinition|executeAutomatedStep/)
  assert.doesNotMatch(executor, /current\.json|compileCurrent|acquireCurrent/)
})

test("the product service supplies the R4 executor instead of the pre-R4 fail stub", () => {
  const service = source("workflowRegisterService.ts")
  const runtime = source("workflowRuntimeFactory.ts")
  assert.match(service, /executeWorkflowContractV2Run/)
  assert.match(service, /contractV2RunExecutor: \(input\) => executeWorkflowContractV2Run\(input\)/)
  assert.doesNotMatch(service, /failContractV2CompiledRuntime/)
  assert.doesNotMatch(service, /runtime execution is not enabled before R4/)
  assert.match(runtime, /readonly runStore: RunStateStore/)
  assert.match(runtime, /runStore: this\.continuationRunStore/)
})

test("compiled execution persists initial state before any provider dispatch and uses R3 visibility commit", () => {
  const executor = source("core/contractV2/compiledRunExecutor.ts")
  const create = executor.indexOf("await input.runStore.createRun")
  const initialSave = executor.indexOf("await input.runStore.saveRun(run)", create)
  const invoke = executor.indexOf("invokeCompiledWorkflowProvider", initialSave)
  const transaction = executor.indexOf("commitWorkflowArtifactTransaction", invoke)
  assert.ok(create >= 0 && create < initialSave && initialSave < invoke)
  assert.ok(transaction > invoke)
})
