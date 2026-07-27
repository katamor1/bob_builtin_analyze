const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const root = path.join(__dirname, "..", "src")
function source(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8")
}

test("R5 binds a Bob task session at the first durable run save", () => {
  const executor = source("workflowContractV2BobExecutor.ts")
  const compiled = source("core/contractV2/compiledRunExecutor.ts")
  const durableSave = compiled.indexOf("await runStore.saveRun(run)")
  const notify = compiled.indexOf("notifyRunCreated(snapshot.onRunCreated, run)", durableSave)
  const loop = compiled.indexOf("return runCompiledWorkflowState", notify)
  assert.ok(durableSave >= 0 && durableSave < notify && notify < loop)
  assert.match(executor, /onRunCreated: bindSession/)
  assert.match(executor, /if \(session === undefined && !lease\.released\) lease\.release\(\)/)
})

test("R5 automatically continues only a paused live run", () => {
  const compiled = source("core/contractV2/compiledRunExecutor.ts")
  const bob = source("workflowContractV2BobExecutor.ts")
  assert.match(compiled, /if \(run\.status !== "paused"\)/)
  assert.match(compiled, /running or recovered runs require R6 reconciliation/)
  assert.match(bob, /durable\.status !== "paused" \|\| existing\.lease\.released/)
})

test("R5 detaches Bob input metadata and preserves exact subagent result text", () => {
  const product = source("workflowContractV2BobProductExecutor.ts")
  assert.match(product, /snapshotBoundedWorkflowProviderEnvelope\(source\[id\], MAX_BOB_INPUT_VALUE_BYTES\)/)
  assert.match(product, /function exactSubagentResult/)
  assert.match(product, /return descriptor\.value/)
  assert.doesNotMatch(product, /extractSubagentResult|\.trim\(\)/)
})

test("same exact handle may reuse the product executor across definition reloads", () => {
  const product = source("workflowContractV2BobProductExecutor.ts")
  assert.match(product, /WeakMap<CompiledWorkflowPlanHandle, WorkflowContractV2BobExecutor>/)
  assert.doesNotMatch(product, /record\.definition|different workflow definition/)
})

test("R5 restores committed outputs through a bounded detached snapshot", () => {
  const values = source("core/contractV2/compiledRunValues.ts")
  assert.match(values, /snapshotBoundedWorkflowProviderEnvelope\(parsed, MAX_COMMITTED_OUTPUT_BYTES\)/)
  assert.match(values, /canonicalJsonText\(bounded\) !== text/)
})
