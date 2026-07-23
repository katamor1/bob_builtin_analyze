"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { DEFAULT_RULE_AUTHORING_LIMITS } = require("../out/ruleAuthoring/ruleAuthoringLimits")
const sourceHash = require("../out/ruleAuthoring/ruleSourceHash")

async function temporaryFiles(t, sizes) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-aggregate-budget-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  return Promise.all(sizes.map(async (size, index) => {
    const filePath = path.join(directory, `source-${index}.doc`)
    await fs.writeFile(filePath, "x".repeat(size))
    return filePath
  }))
}

test("rejects document count before fingerprinting any selected source", async (t) => {
  const files = await temporaryFiles(t, [1, 1])
  let fingerprintCalls = 0
  const original = sourceHash.fingerprintSource
  sourceHash.fingerprintSource = async (...args) => {
    fingerprintCalls += 1
    return original(...args)
  }
  t.after(() => { sourceHash.fingerprintSource = original })
  delete require.cache[require.resolve("../out/ruleAuthoring/extraction/documentExtractor")]
  const { extractRuleDocuments } = require("../out/ruleAuthoring/extraction/documentExtractor")

  await assert.rejects(
    () => extractRuleDocuments(files.map((filePath) => ({ filePath })), undefined, {
      ...DEFAULT_RULE_AUTHORING_LIMITS,
      maxSourceFiles: 1
    }),
    (error) => error.code === "processing_budget_exceeded"
      && error.details.targetCategory === "document_count"
      && error.details.constrainedCategory === "document_count"
      && error.details.limit === 1
      && error.details.observed === 2
  )
  assert.equal(fingerprintCalls, 0)
})

test("reserves aggregate document bytes before each source read", async (t) => {
  const files = await temporaryFiles(t, [3, 3])
  const { extractRuleDocuments } = require("../out/ruleAuthoring/extraction/documentExtractor")

  await assert.rejects(
    () => extractRuleDocuments(files.map((filePath) => ({ filePath })), undefined, {
      ...DEFAULT_RULE_AUTHORING_LIMITS,
      maxSourceBytes: 3,
      maxAggregateSourceBytes: 5
    }),
    (error) => error.code === "processing_budget_exceeded"
      && error.details.targetCategory === "single_document_bytes"
      && error.details.constrainedCategory === "total_document_bytes"
      && error.details.limit === 5
      && error.details.observed === 6
  )
})

test("derives the per-source cap from a lower aggregate document byte limit", async (t) => {
  const [filePath] = await temporaryFiles(t, [3])
  const { extractRuleDocuments } = require("../out/ruleAuthoring/extraction/documentExtractor")

  const result = await extractRuleDocuments([{ filePath }], undefined, {
    ...DEFAULT_RULE_AUTHORING_LIMITS,
    maxSourceBytes: 10,
    maxAggregateSourceBytes: 5
  })

  assert.equal(result.documents.length, 1)
  assert.equal(result.documents[0].status, "requires_conversion")
})
