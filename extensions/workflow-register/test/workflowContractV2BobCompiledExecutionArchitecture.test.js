const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const root = path.join(__dirname, "..", "src")
function source(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8")
}

function before(text, left, right) {
  const a = text.indexOf(left)
  const b = text.indexOf(right)
  assert.ok(a >= 0, `missing ${left}`)
  assert.ok(b >= 0, `missing ${right}`)
  assert.ok(a < b, `${left} must precede ${right}`)
}

test("the audited Bob task probe executes immediately before compiled product execution", () => {
  const factory = source("bobWorkflowFactory.ts")
  before(factory, "const auditedTask = probeTask", "executeWorkflowContractV2BobStep({")
  assert.match(factory, /probeBobTaskCapabilities/)
  assert.doesNotMatch(factory, /runCompiledWorkflowStep/)
  assert.doesNotMatch(factory, /not enabled before R5/)
})

test("compiled Bob execution owns no legacy engine or current-package lookup", () => {
  const executor = source("workflowContractV2BobExecutor.ts")
  const product = source("workflowContractV2BobProductExecutor.ts")
  assert.match(executor, /executeCompiledWorkflowRun/)
  assert.match(executor, /continueCompiledWorkflowRun/)
  assert.doesNotMatch(executor, /WorkflowEngine|ActionRegistry|CoreWorkflowDefinition/)
  assert.doesNotMatch(executor, /current\.json|compileCurrent|acquireCurrent|WorkflowContractV2Entrypoint/)
  assert.doesNotMatch(product, /WorkflowEngine|ActionRegistry|compileCurrent|acquireCurrent/)
})

test("the process plan store leases the exact registered handle", () => {
  const store = source("core/contractV2/planStore.ts")
  const product = source("workflowContractV2BobProductExecutor.ts")
  assert.match(store, /export function acquireWorkflowPlanHandle/)
  assert.match(store, /owned\.entry\.handle !== handle/)
  assert.match(product, /acquireLease: acquireWorkflowPlanHandle/)
})

test("F7 owns task method binding after the immediate task probe", () => {
  const profile = source("core/contractV2/bobProfile.ts")
  const product = source("workflowContractV2BobProductExecutor.ts")
  assert.match(profile, /export function bindAuditedBobTaskMethod/)
  assert.match(product, /bindAuditedBobTaskMethod/)
  assert.doesNotMatch(product, /Object\.getOwnPropertyDescriptors|prototype chain/)
  assert.equal(fs.existsSync(path.join(root, "workflowContractV2BobTaskMethods.ts")), false)
})

test("compiled Bob execution is independent of the legacy Bob workflow runner", () => {
  const factory = source("bobWorkflowFactory.ts")
  const compiledStart = factory.indexOf("function buildCompiledWorkflowSteps")
  const legacyStart = factory.indexOf("function buildLegacyWorkflowSteps")
  const compiled = factory.slice(compiledStart, legacyStart)
  assert.match(compiled, /executeWorkflowContractV2BobStep/)
  assert.doesNotMatch(compiled, /runner\./)
  assert.doesNotMatch(compiled, /runEngine/)
})

test("R5 continuation reloads one durable run and leaves recorded-generation recovery to R6", () => {
  const executor = source("core/contractV2/compiledRunExecutor.ts")
  const bob = source("workflowContractV2BobExecutor.ts")
  assert.match(executor, /export async function continueCompiledWorkflowRun/)
  assert.match(executor, /await runStore\.loadRun\(runId\)/)
  assert.match(bob, /runId: existing\.runId/)
  assert.doesNotMatch(bob, /generation|current\.json|compileCurrent|acquireCurrent/)
})
