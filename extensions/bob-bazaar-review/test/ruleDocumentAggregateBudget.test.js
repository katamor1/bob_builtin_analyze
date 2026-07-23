"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { extractRuleDocuments } = require("../out/ruleAuthoring/extraction/documentExtractor")
const { DEFAULT_RULE_AUTHORING_LIMITS } = require("../out/ruleAuthoring/ruleAuthoringLimits")

async function directory(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-aggregate-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}

function expectExceeded(category, limit, observed) {
  return (error) => {
    assert.equal(error?.code, "processing_budget_exceeded")
    assert.equal(error?.details?.constrainedCategory, category)
    assert.equal(error?.details?.limit, limit)
    assert.equal(error?.details?.observed, observed)
    return true
  }
}

test("rejects document count before reading an input prefix", async (t) => {
  const root = await directory(t)
  const requests = ["a.doc", "b.doc"].map((name) => ({ filePath: path.join(root, name) }))
  await assert.rejects(
    extractRuleDocuments(requests, undefined, {
      ...DEFAULT_RULE_AUTHORING_LIMITS,
      maxSourceFiles: 1
    }),
    expectExceeded("document_count", 1, 2)
  )
})

test("rejects aggregate document bytes across separate sources", async (t) => {
  const root = await directory(t)
  const requests = []
  for (const [name, content] of [["a.doc", "abc"], ["b.doc", "def"]]) {
    const filePath = path.join(root, name)
    await fs.writeFile(filePath, content)
    requests.push({ filePath })
  }

  await assert.rejects(
    extractRuleDocuments(requests, undefined, {
      ...DEFAULT_RULE_AUTHORING_LIMITS,
      maxAggregateSourceBytes: 5
    }),
    expectExceeded("total_document_bytes", 5, 6)
  )
})

test("accepts exact document count and aggregate byte boundaries", async (t) => {
  const root = await directory(t)
  const requests = []
  for (const [name, content] of [["a.doc", "abc"], ["b.doc", "def"]]) {
    const filePath = path.join(root, name)
    await fs.writeFile(filePath, content)
    requests.push({ filePath })
  }

  const result = await extractRuleDocuments(requests, undefined, {
    ...DEFAULT_RULE_AUTHORING_LIMITS,
    maxSourceFiles: 2,
    maxAggregateSourceBytes: 6
  })
  assert.equal(result.documents.length, 2)
  assert.deepEqual(result.documents.map((document) => document.status), ["requires_conversion", "requires_conversion"])
})
