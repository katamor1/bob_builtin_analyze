"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const {
  PROCESSING_BUDGET_CATEGORY_IDS,
  PROCESSING_BUDGET_REPORT_SCHEMA_VERSION
} = require("../out")

const schema = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "schema", "processing-budget-report.v1.schema.json"),
  "utf8"
))

test("processing report schema version and category universe match runtime", () => {
  assert.equal(schema.properties.schema_version.const, PROCESSING_BUDGET_REPORT_SCHEMA_VERSION)
  assert.deepEqual(schema.$defs.category.enum, [...PROCESSING_BUDGET_CATEGORY_IDS])
  assert.equal(schema.properties.issues.maxItems, 1024)
  assert.equal(schema.additionalProperties, false)
})

test("schema requires coverage, ledger, and issue evidence for every report", () => {
  assert.deepEqual(schema.required, [
    "schema_version",
    "producer",
    "operation_id",
    "input_sha256",
    "outcome",
    "coverage_status",
    "ledger",
    "issues"
  ])
  assert.equal(schema.$defs.ledger.properties.categories.minItems, PROCESSING_BUDGET_CATEGORY_IDS.length)
  assert.equal(schema.$defs.ledger.properties.categories.maxItems, PROCESSING_BUDGET_CATEGORY_IDS.length)
})
