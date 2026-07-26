"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
  canonicalSha,
  computeProcessingOperationInputSha
} = require("../out/core/processingOperationInput")

const limits = {
  maxDocumentBytes: 5 * 1024 * 1024,
  maxWorkbookSheets: 20,
  maxRowsPerSheet: 500,
  maxExcerptBytesPerDocument: 64 * 1024,
  maxRawDiffBytes: 1024 * 1024,
  maxBobInputBytes: 2 * 1024 * 1024
}

function operation(overrides = {}) {
  return {
    reviewInput: {
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
    },
    configuration: {
      textEncoding: "utf8",
      workflowRunId: "run-1"
    },
    limits,
    materialized: {
      diff: {
        vcs: "git",
        base: "a",
        head: "b",
        files: [{ path: "src/a.cpp", status: "modified" }],
        unifiedDiff: "@@ -1 +1 @@\n-old\n+new\n",
        warnings: []
      },
      documents: {
        documents: [{ document_id: "DOC-1", path: "docs/spec.md", type: "requirement", sections: [] }],
        excerptsMarkdown: "requirement text",
        evidence: [{ evidence_id: "DOC-1-001", type: "requirement", ref: "section", text: "requirement text" }],
        warnings: []
      },
      codeAnalysis: {
        changedSymbols: [],
        functions: [],
        defines: [],
        globals: [],
        callGraph: [],
        rtForbiddenCandidates: [],
        codeSlices: [{ evidence_id: "SRC-0001", file: "src/a.cpp", ref: "src/a.cpp:1", markdown: "+new", text: "new" }],
        evidence: [{ evidence_id: "SRC-0001", type: "code", ref: "src/a.cpp:1", text: "new" }],
        summaryMarkdown: "summary",
        warnings: []
      },
      contextBudgetArtifact: { schema_version: "context-budget/v1" },
      contextWarnings: [],
      traceability: { rows: [], markdown: "", warnings: [] }
    },
    ...overrides
  }
}

test("processing input SHA changes with raw diff, document, and code evidence bytes", () => {
  const baseline = computeProcessingOperationInputSha(operation())

  const changedDiff = structuredClone(operation())
  changedDiff.materialized.diff.unifiedDiff = "@@ -1 +1 @@\n-old\n+different\n"
  assert.notEqual(computeProcessingOperationInputSha(changedDiff), baseline)

  const changedDocument = structuredClone(operation())
  changedDocument.materialized.documents.evidence[0].text = "different requirement"
  assert.notEqual(computeProcessingOperationInputSha(changedDocument), baseline)

  const changedCode = structuredClone(operation())
  changedCode.materialized.codeAnalysis.evidence[0].text = "different code"
  assert.notEqual(computeProcessingOperationInputSha(changedCode), baseline)
})

test("canonical hashing is independent of object insertion order", () => {
  assert.equal(
    canonicalSha({ z: 1, a: { y: 2, b: 3 } }),
    canonicalSha({ a: { b: 3, y: 2 }, z: 1 })
  )
})

test("canonical hashing rejects accessors, hidden state, symbols, cycles, and unsafe numbers", () => {
  const accessor = {}
  Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 })
  assert.throws(() => canonicalSha(accessor), /accessor/u)

  const hidden = { visible: 1 }
  Object.defineProperty(hidden, "hidden", { enumerable: false, value: 2 })
  assert.throws(() => canonicalSha(hidden), /hidden property/u)

  const symbolState = { visible: 1 }
  symbolState[Symbol("hidden")] = 2
  assert.throws(() => canonicalSha(symbolState), /symbol property/u)

  const cycle = {}
  cycle.self = cycle
  assert.throws(() => canonicalSha(cycle), /cycle/u)
  assert.throws(() => canonicalSha({ unsafe: Number.MAX_SAFE_INTEGER + 1 }), /unsafe number/u)
})
