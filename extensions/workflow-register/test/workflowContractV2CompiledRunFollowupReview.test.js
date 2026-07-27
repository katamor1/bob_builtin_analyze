const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const sourceRoot = path.join(__dirname, "..", "src", "core", "contractV2")

function source(name) {
  return fs.readFileSync(path.join(sourceRoot, name), "utf8")
}

test("an ambiguous step save reloads durable state before any rollback", () => {
  const types = source("compiledRunTypes.ts")
  const steps = source("compiledRunSteps.ts")
  assert.match(types, /loadRun\(runId: string\): Promise<WorkflowRunState \| undefined>/)
  const save = steps.indexOf("await input.runStore.saveRun(input.run)")
  const reload = steps.indexOf("await input.runStore.loadRun(input.run.runId)", save)
  const reconcile = steps.indexOf("runMatchesCommittedStepState", reload)
  const accepted = steps.indexOf("return persisted", reconcile)
  const rollback = steps.indexOf("if (outputId !== undefined)", accepted)
  assert.ok(save >= 0 && save < reload && reload < reconcile && reconcile < accepted && accepted < rollback)
})

test("an optional failed execution advances its logical-effect ordinal before persistence", () => {
  const steps = source("compiledRunSteps.ts")
  const executor = source("compiledRunExecutor.ts")
  for (const text of [steps, executor]) {
    const assignment = text.indexOf("run.state[compiledExecutionOrdinalStateKey(step.id)] = String(executionOrdinal)")
    const save = text.indexOf("await store.saveRun(run)", assignment)
    assert.ok(assignment >= 0 && save > assignment)
  }
})

test("agent parser safety is separate from the canonical compiled output-byte limit", () => {
  const steps = source("compiledRunSteps.ts")
  assert.match(steps, /MAX_AGENT_RAW_TEXT_BYTES/)
  assert.match(steps, /bytes\.byteLength > MAX_AGENT_RAW_TEXT_BYTES/)
  assert.doesNotMatch(steps, /bytes\.byteLength > maximumBytes/)
  assert.match(steps, /canonicalJsonBytes\(validated\.value\)\.byteLength <= maximumBytes/)
})
