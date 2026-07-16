const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  allocateContextSectionIds,
  allocatePromptSectionIds,
  allocateRuleIds,
  allocateStableIds
} = require("../out/ruleAuthoring/ruleIdAllocator")
const { DEFAULT_CHECKLIST } = require("../out/projectRules/defaults")

test("allocateRuleIds starts at PRJ-0001 and preserves request order", () => {
  assert.deepEqual(allocateRuleIds([], 3), ["PRJ-0001", "PRJ-0002", "PRJ-0003"])
})

test("allocateRuleIds advances from the maximum existing ID without filling holes", () => {
  const existingIds = ["PRJ-0004", "PRJ-0001", "PRJ-0007"]

  const allocated = allocateRuleIds(existingIds, 3)

  assert.deepEqual(allocated, ["PRJ-0008", "PRJ-0009", "PRJ-0010"])
  assert.deepEqual(existingIds, ["PRJ-0004", "PRJ-0001", "PRJ-0007"])
})

test("typed section allocators use independent CTX and PRM namespaces", () => {
  assert.deepEqual(
    allocateContextSectionIds(["CTX-0001", "CTX-0003"], 2),
    ["CTX-0004", "CTX-0005"]
  )
  assert.deepEqual(
    allocatePromptSectionIds(["PRM-0099"], 2),
    ["PRM-0100", "PRM-0101"]
  )
  assert.deepEqual(allocateStableIds("CTX", [], 1), ["CTX-0001"])
})

test("allocators reject malformed IDs reserved by the requested namespace", () => {
  const invalidRuleIds = [
    "PRJ-0000",
    "PRJ-000",
    "PRJ-10000",
    "PRJ-00A1",
    " PRJ-0001",
    "PRJ-0001 "
  ]

  for (const invalidId of invalidRuleIds) {
    assert.throws(() => allocateRuleIds([invalidId], 1), /existing.*PRJ/i)
  }
})

test("allocators coexist with legacy IDs", () => {
  const standardRuleIds = DEFAULT_CHECKLIST.rules.map(({ id }) => id)

  assert.deepEqual(allocateRuleIds(standardRuleIds, 1), ["PRJ-0001"])
  assert.deepEqual(
    allocateRuleIds([...standardRuleIds, "PRJ-0004"], 2),
    ["PRJ-0005", "PRJ-0006"]
  )
  assert.deepEqual(allocateContextSectionIds(["legacy"], 1), ["CTX-0001"])
  assert.deepEqual(allocatePromptSectionIds(["legacy"], 1), ["PRM-0001"])
})

test("allocators reject IDs from a different stable namespace", () => {
  assert.throws(() => allocateRuleIds(["CTX-0009"], 1), /wrong.*namespace|namespace.*CTX/i)
  assert.throws(() => allocateRuleIds(["PRM-0009"], 1), /wrong.*namespace|namespace.*PRM/i)
  assert.throws(() => allocateContextSectionIds(["PRJ-0009"], 1), /wrong.*namespace|namespace.*PRJ/i)
  assert.throws(() => allocatePromptSectionIds(["CTX-0009"], 1), /wrong.*namespace|namespace.*CTX/i)
})

test("allocators reject duplicate existing IDs before allocation", () => {
  assert.throws(
    () => allocateRuleIds(["PRJ-0001", "PRJ-0001"], 1),
    /duplicate.*PRJ/i
  )
  assert.throws(
    () => allocateContextSectionIds(["CTX-0002", "CTX-0002"], 1),
    /duplicate.*CTX/i
  )
  assert.throws(
    () => allocateRuleIds(["RT-001", "RT-001"], 1),
    /duplicate.*PRJ/i
  )
})

test("allocators return an empty range for zero and reject unsafe allocation counts", () => {
  assert.deepEqual(allocateRuleIds(["RT-001"], 0), [])
  assert.deepEqual(allocateContextSectionIds([], 0), [])
  assert.deepEqual(allocatePromptSectionIds([], 0), [])

  for (const count of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10_000]) {
    assert.throws(() => allocateRuleIds([], count), /count/i)
  }

  assert.throws(() => allocateRuleIds([], "1"), /count/i)
})

test("allocators fail before returning a partial range on namespace overflow", () => {
  assert.deepEqual(allocateRuleIds(["PRJ-9998"], 1), ["PRJ-9999"])
  assert.throws(() => allocateRuleIds(["PRJ-9998"], 2), /PRJ.*overflow/i)
  assert.throws(() => allocateContextSectionIds(["CTX-9999"], 1), /CTX.*overflow/i)
  assert.throws(() => allocatePromptSectionIds(["PRM-9997"], 3), /PRM.*overflow/i)
})

test("generic allocation rejects an unknown namespace at runtime", () => {
  assert.throws(() => allocateStableIds("CAND", [], 1), /namespace/i)
})
