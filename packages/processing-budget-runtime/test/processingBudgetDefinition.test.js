"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")
const { loadRuntime } = require("./helpers")

const MiB = 1_048_576
const EXPECTED_TABLE = Object.freeze([
  ["single_document_bytes", "target", "bytes", 5 * MiB, 50 * MiB, "total_document_bytes"],
  ["total_document_bytes", "operation", "bytes", 32 * MiB, 256 * MiB, "total_operation_input_bytes"],
  ["document_count", "operation", "count", 128, 1_024, null],
  ["sheets_per_workbook", "target", "count", 20, 100, "total_sheets"],
  ["total_sheets", "operation", "count", 100, 1_000, null],
  ["rows_per_sheet", "target", "count", 500, 5_000, "total_rows"],
  ["total_rows", "operation", "count", 25_000, 250_000, null],
  ["changed_files", "operation", "count", 5_000, 20_000, null],
  ["raw_diff_bytes", "operation", "bytes", 1 * MiB, 10 * MiB, "total_operation_input_bytes"],
  ["document_excerpt_bytes", "operation", "bytes", 2 * MiB, 8 * MiB, "total_operation_input_bytes"],
  ["bob_input_bytes", "operation", "bytes", 2 * MiB, 8 * MiB, "total_operation_input_bytes"],
  ["managed_artifact_bytes", "operation", "bytes", 16 * MiB, 64 * MiB, null],
  ["total_operation_input_bytes", "operation", "bytes", 64 * MiB, 256 * MiB, null]
])

test("exports the exact ordered 13-category default and absolute table", () => {
  const runtime = loadRuntime()
  assert.equal(runtime.MEBIBYTE_BYTES, MiB)
  assert.deepEqual(
    runtime.PROCESSING_BUDGET_DEFINITION.map((entry) => [
      entry.id,
      entry.scope,
      entry.unit,
      entry.defaultLimit,
      entry.absoluteMaximum,
      entry.aggregateInto ?? null
    ]),
    EXPECTED_TABLE
  )
  assert.deepEqual(runtime.PROCESSING_BUDGET_CATEGORY_IDS, EXPECTED_TABLE.map(([id]) => id))
  assert.deepEqual(
    runtime.PROCESSING_BUDGET_TARGET_CATEGORY_IDS,
    EXPECTED_TABLE.filter(([, scope]) => scope === "target").map(([id]) => id)
  )
  assert.deepEqual(
    runtime.PROCESSING_BUDGET_OPERATION_CATEGORY_IDS,
    EXPECTED_TABLE.filter(([, scope]) => scope === "operation").map(([id]) => id)
  )
  assert.deepEqual(
    Object.entries(runtime.DEFAULT_PROCESSING_BUDGET_PROFILE.limits),
    EXPECTED_TABLE.map(([id, , , defaultLimit]) => [id, defaultLimit])
  )
  assert.deepEqual(
    Object.entries(runtime.ABSOLUTE_PROCESSING_BUDGET_PROFILE.limits),
    EXPECTED_TABLE.map(([id, , , , absoluteMaximum]) => [id, absoluteMaximum])
  )
  assert.equal(runtime.PROCESSING_BUDGET_MANIFEST_MAXIMA, runtime.PROCESSING_BUDGET_ABSOLUTE_MAXIMA)
  assert.deepEqual(
    runtime.normalizeProcessingBudgetProfile(runtime.ABSOLUTE_PROCESSING_BUDGET_PROFILE),
    runtime.ABSOLUTE_PROCESSING_BUDGET_PROFILE
  )
})

test("exports deeply immutable definitions and normalized profiles", () => {
  const runtime = loadRuntime()
  assert.equal(Object.isFrozen(runtime.PROCESSING_BUDGET_DEFINITION), true)
  assert.equal(runtime.PROCESSING_BUDGET_DEFINITION.every(Object.isFrozen), true)
  assert.equal(Object.isFrozen(runtime.DEFAULT_PROCESSING_BUDGET_PROFILE), true)
  assert.equal(Object.isFrozen(runtime.DEFAULT_PROCESSING_BUDGET_PROFILE.limits), true)
  assert.throws(() => {
    runtime.DEFAULT_PROCESSING_BUDGET_PROFILE.limits.raw_diff_bytes = 1
  }, TypeError)

  const input = { limits: { raw_diff_bytes: 2 * MiB } }
  const profile = runtime.normalizeProcessingBudgetProfile(input)
  assert.equal(profile.limits.raw_diff_bytes, 2 * MiB)
  assert.equal(profile.limits.bob_input_bytes, 2 * MiB)
  assert.deepEqual(input, { limits: { raw_diff_bytes: 2 * MiB } })
  assert.equal(Object.isFrozen(profile), true)
  assert.equal(Object.isFrozen(profile.limits), true)
})

test("rejects malformed, unknown, non-finite, unsafe, fractional, negative, and excessive profile limits", () => {
  const runtime = loadRuntime()
  const invalid = [
    null,
    [],
    { unknown: true },
    { schema_version: "processing-budget-profile/v2" },
    { limits: null },
    { limits: { unknown_category: 1 } },
    { limits: { raw_diff_bytes: Number.NaN } },
    { limits: { raw_diff_bytes: Number.POSITIVE_INFINITY } },
    { limits: { raw_diff_bytes: Number.MAX_SAFE_INTEGER + 1 } },
    { limits: { raw_diff_bytes: 1.5 } },
    { limits: { raw_diff_bytes: -1 } },
    { limits: { raw_diff_bytes: 10 * MiB + 1 } }
  ]
  for (const value of invalid) {
    assert.throws(() => runtime.normalizeProcessingBudgetProfile(value), (error) => {
      assert.equal(error instanceof runtime.ProcessingBudgetError, true)
      assert.equal(error.code, "processing_budget_profile_invalid")
      return true
    })
  }
  for (const definition of runtime.PROCESSING_BUDGET_DEFINITION) {
    assert.throws(
      () => runtime.normalizeProcessingBudgetProfile({ limits: { [definition.id]: definition.absoluteMaximum + 1 } }),
      (error) => error instanceof runtime.ProcessingBudgetError
        && error.code === "processing_budget_profile_invalid",
      `${definition.id} must reject absolute maximum plus one`
    )
  }
})

test("rejects profiles whose local limits exceed their aggregate limits", () => {
  const runtime = loadRuntime()
  const invalid = [
    { limits: { single_document_bytes: 40 * MiB, total_document_bytes: 32 * MiB } },
    { limits: { total_document_bytes: 65 * MiB, total_operation_input_bytes: 64 * MiB } },
    { limits: { sheets_per_workbook: 101, total_sheets: 100 } },
    { limits: { rows_per_sheet: 25_001, total_rows: 25_000 } }
  ]
  for (const value of invalid) {
    assert.throws(
      () => runtime.normalizeProcessingBudgetProfile(value),
      (error) => error instanceof runtime.ProcessingBudgetError
        && error.code === "processing_budget_profile_invalid"
    )
  }
})

test("snapshots own data without invoking inherited or accessor-backed profile values", () => {
  const runtime = loadRuntime()
  let getterCalls = 0
  const accessor = {}
  Object.defineProperty(accessor, "limits", {
    enumerable: true,
    get() {
      getterCalls += 1
      return {}
    }
  })
  assert.throws(
    () => runtime.normalizeProcessingBudgetProfile(accessor),
    (error) => error instanceof runtime.ProcessingBudgetError
      && error.code === "processing_budget_profile_invalid"
  )
  assert.equal(getterCalls, 0)

  const inherited = Object.create({ limits: { raw_diff_bytes: 1 } })
  assert.throws(
    () => runtime.normalizeProcessingBudgetProfile(inherited),
    (error) => error instanceof runtime.ProcessingBudgetError
      && error.code === "processing_budget_profile_invalid"
  )
})
