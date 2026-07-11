const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSrc } = require("./helpers/sourceReader")

test("Operation Hub accept-and-run-next always starts the next step after accepting review", () => {
  const source = readSrc("commands", "stepReview.ts")

  assert.match(source, /export async function acceptAndRunNextStep/)
  assert.match(source, /return vscode\.commands\.executeCommand\("workflowRegister\.runNextStep", accepted\.run\.runId\)/)
  assert.doesNotMatch(source, /if \(accepted\.completedViaBobTask\) \{\s*return accepted\.run\s*\}/)
})

test("review acceptance skips Todo completion for a live gate and awaits only the stale-gate fallback", () => {
  const source = readSrc("commands", "stepReview.ts")

  assert.match(source, /let completedViaBobTask = acceptedViaLiveGate/)
  assert.match(source, /if \(!acceptedViaLiveGate\) \{[\s\S]*const sync = await bobTaskSyncRegistry\.reconcileRun/)
  assert.match(source, /completedViaBobTask = sync\.status === "synced" && sync\.appliedStepCount > 0/)
  assert.doesNotMatch(source, /completedViaBobTask = sync\.status === "synced" && sync\.taskAvailable/)
})

test("Bob runner and Operation Hub command reconciliation await async Todo projection", () => {
  const runner = readSrc("bobWorkflowRunner.ts")
  const commands = readSrc("workflowRunCommands.ts")

  assert.match(runner, /const sync = await bobTaskSyncRegistry\.reconcileRun/)
  assert.match(commands, /const sync = await bobTaskSyncRegistry\.reconcileRun/)
})
