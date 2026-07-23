"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  buildReviewPackage,
  computeManagedReviewPackageBytes
} = require("../out/core/reviewPackageBuilder")
const { ProcessingBudgetLedger } = require("../out/sharedProcessingBudgetRuntime")

function fixture(workspace, outDir, budgetLedger, limits = {}) {
  return {
    workspaceRoot: workspace,
    outDir,
    reviewInput: {
      schema_version: 1,
      review: {
        id: "REVIEW-PACKAGE-BUDGET",
        title: "Package budget",
        change_type: "bugfix",
        purpose: "budget verification",
        base: "base",
        head: "head",
        vcs: "git"
      },
      artifacts: { requirements: [] },
      review_focus: ["requirement-code-consistency"]
    },
    diff: {
      vcs: "git",
      vcsRoot: workspace,
      base: "base",
      head: "head",
      files: [],
      unifiedDiff: "",
      warnings: []
    },
    documents: {
      documents: [],
      excerptsMarkdown: "",
      evidence: [],
      warnings: []
    },
    codeAnalysis: {
      changedSymbols: [],
      functions: [],
      defines: [],
      globals: [],
      callGraph: [],
      rtForbiddenCandidates: [],
      codeSlices: [],
      evidence: [],
      summaryMarkdown: "",
      warnings: []
    },
    traceability: { rows: [], warnings: [], markdown: "" },
    limits,
    budgetLedger
  }
}

function category(ledger, name) {
  return ledger.snapshot().categories.find((entry) => entry.category === name)
}

function managedOutputs(outDir) {
  return fs.existsSync(outDir) ? fs.readdirSync(outDir).sort() : []
}

test("rejects an undersized mandatory Bob-input budget and removes managed outputs", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "bob-package-mandatory-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const outDir = path.join(workspace, "review-package")
  const ledger = new ProcessingBudgetLedger({
    limits: {
      single_document_bytes: 0,
      total_document_bytes: 0,
      raw_diff_bytes: 0,
      document_excerpt_bytes: 0,
      bob_input_bytes: 700,
      total_operation_input_bytes: 700
    }
  })

  await assert.rejects(
    () => buildReviewPackage(fixture(workspace, outDir, ledger, { maxBobInputBytes: 700 })),
    (error) => error?.code === "processing_budget_exceeded"
      && error.details?.constrainedCategory === "bob_input_bytes"
      && error.details?.limit === 700
  )
  assert.deepEqual(managedOutputs(outDir), [])
  assert.equal(category(ledger, "bob_input_bytes").committed, 0)
})

test("rolls back Bob-input reservation and cleans files when managed artifacts exceed their cap", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "bob-package-managed-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const outDir = path.join(workspace, "review-package")
  const ledger = new ProcessingBudgetLedger({
    limits: { managed_artifact_bytes: 1024 }
  })

  await assert.rejects(
    () => buildReviewPackage(fixture(workspace, outDir, ledger)),
    (error) => error?.code === "processing_budget_exceeded"
      && error.details?.constrainedCategory === "managed_artifact_bytes"
      && error.details?.limit === 1024
  )
  assert.deepEqual(managedOutputs(outDir), [])
  assert.equal(category(ledger, "bob_input_bytes").committed, 0)
  assert.equal(category(ledger, "bob_input_bytes").reserved, 0)
  assert.equal(category(ledger, "managed_artifact_bytes").committed, 0)
})

test("commits exact Bob-input and managed-package bytes after successful generation", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "bob-package-commit-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const outDir = path.join(workspace, "review-package")
  const ledger = new ProcessingBudgetLedger()

  await buildReviewPackage(fixture(workspace, outDir, ledger))
  const managedBytes = await computeManagedReviewPackageBytes(outDir)
  const bobBytes = fs.statSync(path.join(outDir, "bob-input.md")).size
  assert.equal(category(ledger, "managed_artifact_bytes").committed, managedBytes)
  assert.equal(category(ledger, "bob_input_bytes").committed, bobBytes)
})
