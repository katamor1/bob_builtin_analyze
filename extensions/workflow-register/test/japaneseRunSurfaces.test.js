const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSourceSet } = require("./helpers/sourceReader")

test("run surfaces use Japanese operator copy", () => {
  const source = readSourceSet([
    "commands/runControl.ts",
    "commands/runControlReport.ts",
    "commands/inspectRunDiagnostics.ts",
    "commands/stepReview.ts",
    "workflowRunCommands.ts"
  ])
  for (const label of [
    "現在のステップ",
    "実行を一時停止",
    "ワークフロー実行制御",
    "実行診断"
  ]) assert.match(source, new RegExp(label))
  for (const obsolete of [
    "Bob Workflow Runs",
    "Inspect Run Control",
    "Pause Workflow Run",
    "Workflow Run Control",
    "No workflow run selected"
  ]) assert.doesNotMatch(source, new RegExp(obsolete))
})
