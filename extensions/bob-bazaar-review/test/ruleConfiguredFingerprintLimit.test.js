"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const sourceHash = require("../out/ruleAuthoring/ruleSourceHash")
const { DEFAULT_RULE_AUTHORING_LIMITS } = require("../out/ruleAuthoring/ruleAuthoringLimits")
const { extractRuleDocuments } = require("../out/ruleAuthoring/extraction/documentExtractor")

test("batch extraction passes the effective maxSourceBytes to every fingerprint read", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bob-configured-fingerprint-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "small.doc")
  await fs.writeFile(filePath, "abc")

  const original = sourceHash.fingerprintSource
  const observed = []
  sourceHash.fingerprintSource = async (candidate, options) => {
    observed.push(options?.maximumBytes)
    return original(candidate, options)
  }
  t.after(() => { sourceHash.fingerprintSource = original })

  const result = await extractRuleDocuments(
    [{ filePath }],
    undefined,
    {
      ...DEFAULT_RULE_AUTHORING_LIMITS,
      maxSourceBytes: 4,
      maxAggregateSourceBytes: 4
    }
  )

  assert.equal(result.documents[0].status, "requires_conversion")
  assert.deepEqual(observed, [4, 4])
})
