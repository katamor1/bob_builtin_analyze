const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readJson, readSourceSet } = require("./helpers/sourceReader")

test("workflow operation surfaces use approved Japanese-first labels", () => {
  const source = readSourceSet([
    "gui/operationHubHtml.ts",
    "gui/operationHubModel.ts",
    "gui/operationHubProvider.ts"
  ])
  const packageJson = readJson("package.json")
  const visibleMetadata = JSON.stringify({
    displayName: packageJson.displayName,
    description: packageJson.description,
    commands: packageJson.contributes.commands,
    views: packageJson.contributes.views
  })

  for (const required of [
    "Bob 操作センター",
    "実行状況",
    "ワークフロー一覧",
    "セットアップ"
  ]) {
    assert.match(`${source}\n${visibleMetadata}`, new RegExp(required))
  }

  for (const obsolete of ["Bob Operation Hub", "Run Monitor", "Bob Workflow Runs"]) {
    assert.doesNotMatch(`${source}\n${visibleMetadata}`, new RegExp(obsolete))
  }
})
