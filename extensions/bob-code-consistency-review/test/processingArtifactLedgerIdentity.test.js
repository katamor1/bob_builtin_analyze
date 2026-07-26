"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
  computeProcessingOperationInputSha
} = require("../out/core/processingOperationInput")

const reviewInput = {
  schema_version: 1,
  review: {
    id: "review-1",
    title: "Review",
    change_type: "bugfix",
    purpose: "verify",
    base: "a",
    head: "b"
  },
  artifacts: {},
  review_focus: ["correctness"]
}

const limits = {
  maxDocumentBytes: 1024,
  maxWorkbookSheets: 1,
  maxRowsPerSheet: 1,
  maxExcerptBytesPerDocument: 128,
  maxRawDiffBytes: 128,
  maxBobInputBytes: 128
}

function ledger(overrides = {}) {
  return {
    ledger: {
      schema_version: 1,
      ledger_id: "bob-evidence-scope",
      source_revision: "a..b",
      artifacts: []
    },
    path: ".bob-review/artifact-ledger.json",
    warnings: [],
    fresh: 0,
    stale: 0,
    missing: 0,
    ...overrides
  }
}

function identity(materialized) {
  return computeProcessingOperationInputSha({
    reviewInput,
    configuration: { textEncoding: "utf8" },
    limits,
    materialized
  })
}

test("upstream artifact-ledger warnings change processing identity", () => {
  assert.notEqual(
    identity({ upstreamArtifactLedger: ledger() }),
    identity({ upstreamArtifactLedger: ledger({ warnings: ["artifact ledger ignored: invalid JSON"] }) })
  )
})

test("final artifact-ledger reconciliation changes processing identity", () => {
  assert.notEqual(
    identity({ finalArtifactLedger: ledger() }),
    identity({ finalArtifactLedger: ledger({ missing: 1 }) })
  )
})
