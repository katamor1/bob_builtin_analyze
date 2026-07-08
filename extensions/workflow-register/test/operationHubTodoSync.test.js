const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSrc } = require("./helpers/sourceReader")

test("Operation Hub accept-and-run-next always starts the next step after accepting review", () => {
  const source = readSrc("commands", "stepReview.ts")

  assert.match(source, /export async function acceptAndRunNextStep/)
  assert.match(source, /return vscode\.commands\.executeCommand\("workflowRegister\.runNextStep", accepted\.run\.runId\)/)
  assert.doesNotMatch(source, /if \(accepted\.completedViaBobTask\) \{\s*return accepted\.run\s*\}/)
})

test("review acceptance reports Bob Todo completion only when setStepComplete was actually applied", () => {
  const source = readSrc("commands", "stepReview.ts")

  assert.match(source, /const completedViaBobTask = sync\.status === "synced" && sync\.appliedStepCount > 0/)
  assert.doesNotMatch(source, /const completedViaBobTask = sync\.status === "synced" && sync\.taskAvailable/)
})
