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

test("an ambiguous initial save is reloaded and bound before the original error escapes", () => {
  const executor = source("core/contractV2/compiledRunExecutor.ts")
  before(executor, "await runStore.saveRun(run)", "reconcileInitialRunSave")
  before(executor, "reconcileInitialRunSave", "notifyRunCreated(snapshot.onRunCreated, reconciled)")
  before(executor, "notifyRunCreated(snapshot.onRunCreated, reconciled)", "throw error")
})

test("all callbacks for one Bob task are serialized before lease acquisition", () => {
  const executor = source("workflowContractV2BobExecutor.ts")
  assert.match(executor, /coordinateBobTaskOperation/)
  before(executor, "coordinateBobTaskOperation", "this.options.acquireLease")
  assert.match(executor, /WeakMap<object, Promise<void>>/)
})

test("Bob callbacks drive the recorded compiled route instead of assuming lexical order", () => {
  const executor = source("workflowContractV2BobExecutor.ts")
  assert.match(executor, /driveRecordedBobRoute/)
  assert.match(executor, /findCompiledStepIndex/)
  assert.match(executor, /targetIndex > requestedIndex/)
  assert.match(executor, /stepId: targetStep\.id/)
})

test("the successful F7 probe immediately captures every required task method identity", () => {
  const factory = source("bobWorkflowFactory.ts")
  const product = source("workflowContractV2BobProductExecutor.ts")
  const probeStart = factory.indexOf("function probeCompiledTask")
  assert.ok(probeStart >= 0, "missing compiled Bob probe")
  const probe = factory.slice(probeStart)
  before(probe, "probeBobTaskCapabilities", "captureAuditedBobTaskBinding")
  const compiledStep = factory.slice(factory.indexOf("function buildCompiledWorkflowSteps"), probeStart)
  before(compiledStep, "const auditedTask = probeCompiledTask", "executeWorkflowContractV2BobStep({")
  assert.match(product, /auditedBobTaskMethod/)
  assert.doesNotMatch(product, /bindAuditedBobTaskMethod/)
})
