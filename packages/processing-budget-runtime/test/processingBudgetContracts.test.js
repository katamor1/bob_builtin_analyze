"use strict"

const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const { loadRuntime, packageRoot } = require("./helpers")

test("checked-in TypeScript constants and JSON schema exactly match the canonical definition", () => {
  const result = childProcess.spawnSync(
    process.execPath,
    [path.join(packageRoot, "scripts", "generate-processing-budget-contracts.js"), "--check"],
    { cwd: packageRoot, encoding: "utf8" }
  )
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})

test("profile schema contains every category and exact generated maximum", () => {
  const runtime = loadRuntime()
  const schema = JSON.parse(fs.readFileSync(
    path.join(packageRoot, "schema", "processing-budget-profile.v1.schema.json"),
    "utf8"
  ))
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.properties.limits.required, runtime.PROCESSING_BUDGET_CATEGORY_IDS)
  assert.equal(schema.properties.limits.additionalProperties, false)
  for (const definition of runtime.PROCESSING_BUDGET_DEFINITION) {
    assert.deepEqual(schema.properties.limits.properties[definition.id], {
      type: "integer",
      minimum: 0,
      maximum: definition.absoluteMaximum
    })
  }
})
