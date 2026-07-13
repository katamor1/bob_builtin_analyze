const assert = require("node:assert/strict")
const { test } = require("node:test")

const { DEFAULT_RULE_AUTHORING_LIMITS } = require("../out/ruleAuthoring/ruleAuthoringLimits")

test("rule authoring limits expose the approved hard defaults", () => {
  assert.deepEqual(DEFAULT_RULE_AUTHORING_LIMITS, {
    maxSourceFiles: 20,
    maxSourceBytes: 25 * 1024 * 1024,
    maxAggregateSourceBytes: 100 * 1024 * 1024,
    maxChunkBytes: 32 * 1024,
    maxSourceIndexBytes: 1024 * 1024,
    maxSelectedEvidenceBytes: 1024 * 1024,
    maxProposalBytes: 1024 * 1024,
    maxPdfOutputBytes: 32 * 1024 * 1024,
    maxOoxmlEntries: 5_000,
    maxOoxmlDeclaredUncompressedBytes: 250 * 1024 * 1024,
    maxRuleOperations: 200,
    maxProjectContextOperations: 100,
    maxPromptAddendumOperations: 100,
    maxProjectContextBytes: 256 * 1024,
    maxPromptAddendumBytes: 256 * 1024
  })
  assert.equal(Object.isFrozen(DEFAULT_RULE_AUTHORING_LIMITS), true)
})
