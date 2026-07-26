const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "src", relativePath), "utf8")
}

test("public workflow schema type includes Contract v2 without a run-state cast", () => {
  const schema = source("core/modelSchema.ts")
  const runState = source("core/engine/runState.ts")
  assert.match(
    schema,
    /export type WorkflowSchemaVersion\s*=\s*"legacy"\s*\|\s*"workflow-register\/v1"\s*\|\s*"workflow-register\/v2"/
  )
  assert.match(runState, /const run: WorkflowRunState = \{/)
  assert.doesNotMatch(runState, /as unknown as WorkflowRunState/)
})
