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

test("Contract v2 retry routes through recorded-generation recovery before current workflow lookup", () => {
  const commands = source("workflowRunCommands.ts")
  const method = commands.indexOf("private async resumeOrRetryRunOnce")
  const provenance = commands.indexOf("run.planProvenance", method)
  const retry = commands.indexOf("retryWorkflowContractV2Run", provenance)
  const currentWorkflow = commands.indexOf("this.options.coreWorkflows.get", method)
  assert.ok(method >= 0 && provenance > method && retry > provenance)
  assert.ok(currentWorkflow < 0 || retry < currentWorkflow)
})

test("runtime retry saves restart preparation before compiled continuation", () => {
  const runtime = source("workflowRuntimeFactory.ts")
  const start = runtime.indexOf("async retryWorkflowContractV2Run")
  assert.ok(start >= 0)
  const section = runtime.slice(start, runtime.indexOf("createEngine", start))
  before(section, "recoverWorkflowContractV2ProductRunForRetry", "prepareWorkflowContractV2Restart")
  before(section, "prepareWorkflowContractV2Restart", "await runStore.saveRun(run)")
  before(section, "await runStore.saveRun(run)", "continueCompiledWorkflowRun")
  assert.match(section, /executionMode: "singleStep"/)
  assert.match(section, /allowOutOfOrder: true/)
})

test("a restart preparation is consumed before the next provider dispatch", () => {
  const loop = source("core/contractV2/compiledRunLoop.ts")
  before(loop, "clearWorkflowContractV2RestartPreparation", "stepState.status = \"running\"")
  before(loop, "stepState.status = \"running\"", "await input.runStore.saveRun(run)")
})
