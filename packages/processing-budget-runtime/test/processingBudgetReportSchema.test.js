"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const {
  PROCESSING_BUDGET_CATEGORY_IDS,
  PROCESSING_BUDGET_DEFINITION_BY_ID,
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

test("schema fixes every ledger category to canonical order, scope, and unit", () => {
  const categories = schema.$defs.ledger.properties.categories
  assert.equal(categories.items, false)
  assert.equal(categories.prefixItems.length, PROCESSING_BUDGET_CATEGORY_IDS.length)

  const observed = categories.prefixItems.map((entry) => {
    const definitionName = entry.$ref.split("/").at(-1)
    const definition = schema.$defs[definitionName]
    const baseRef = definition.allOf[0].$ref
    const constants = definition.allOf[1].properties
    return {
      category: constants.category.const,
      scope: baseRef.endsWith("/targetCategory") ? "target" : "operation",
      unit: constants.unit.const
    }
  })

  assert.deepEqual(observed, PROCESSING_BUDGET_CATEGORY_IDS.map((category) => ({
    category,
    scope: PROCESSING_BUDGET_DEFINITION_BY_ID[category].scope,
    unit: PROCESSING_BUDGET_DEFINITION_BY_ID[category].unit
  })))
})
