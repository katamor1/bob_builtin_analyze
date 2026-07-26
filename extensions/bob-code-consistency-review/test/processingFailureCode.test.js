"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
  failureFromProcessingError
} = require("../out/core/processingBudgetCoverage")

test("syntactically valid failure codes over 256 UTF-8 bytes fall back", () => {
  assert.equal(
    failureFromProcessingError({ code: "a".repeat(257) }).code,
    "processing_failed"
  )
})

test("bounded failure codes remain unchanged", () => {
  assert.equal(
    failureFromProcessingError({ code: "document_extraction_failed" }).code,
    "document_extraction_failed"
  )
})
