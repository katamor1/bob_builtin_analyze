"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
  canonicalSha,
  computeProcessingOperationInputSha
} = require("../out/core/processingOperationInput")

function input(estimatedTokens) {
  return {
    reviewInput: {
      schema_version: 1,
      review: {
        id: "review-fractional",
        title: "Fractional token estimate",
        change_type: "feature",
        purpose: "verify input identity",
        base: "a",
        head: "b"
      },
      artifacts: { requirements: [{ path: "docs/spec.md" }] },
      review_focus: ["requirement-code-consistency"],
      bob_options: {
        evidence_scope_rules: [{
          id: "RULE-1",
          title: "Fractional estimate",
          evaluation: "ai",
          estimated_tokens: estimatedTokens
        }]
      }
    },
    configuration: { textEncoding: "utf8" },
    limits: {
      maxDocumentBytes: 1024,
      maxWorkbookSheets: 20,
      maxRowsPerSheet: 500,
      maxExcerptBytesPerDocument: 256,
      maxRawDiffBytes: 1024,
      maxBobInputBytes: 2048
    }
  }
}

test("finite fractional values are accepted and content-bound", () => {
  assert.doesNotThrow(() => canonicalSha(0.5))
  const first = computeProcessingOperationInputSha(input(0.5))
  const second = computeProcessingOperationInputSha(input(0.75))
  assert.notEqual(first, second)
})

test("non-finite values and unsafe integers remain rejected", () => {
  assert.throws(() => canonicalSha(Number.NaN), /non-finite/u)
  assert.throws(() => canonicalSha(Number.POSITIVE_INFINITY), /non-finite/u)
  assert.throws(() => canonicalSha(Number.MAX_SAFE_INTEGER + 1), /unsafe/u)
})
