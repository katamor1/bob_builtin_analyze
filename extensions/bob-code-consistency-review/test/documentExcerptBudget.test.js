"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { extractDocuments } = require("../out/analyzers/documentExtractor")
const { ProcessingBudgetLedger } = require("../out/sharedProcessingBudgetRuntime")

async function workspace(t, content) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-excerpt-budget-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, "docs"), { recursive: true })
  await fs.writeFile(path.join(root, "docs", "requirements.md"), content, "utf8")
  return root
}

function input() {
  return {
    schema_version: 1,
    review: {
      id: "REVIEW-EXCERPT-BUDGET",
      title: "Excerpt budget",
      change_type: "bugfix",
      purpose: "budget",
      base: "base",
      head: "head",
      vcs: "git"
    },
    artifacts: {
      requirements: [{ path: "docs/requirements.md", sections: ["REQ-EXCERPT-001"] }]
    },
    review_focus: ["requirement-code-consistency"]
  }
}

function committed(ledger, category) {
  return ledger.snapshot().categories.find((entry) => entry.category === category).committed
}

test("uses the shared ledger's document-excerpt limit and commits the retained bytes", async (t) => {
  const root = await workspace(t, `# REQ-EXCERPT-001\n\nREQ-EXCERPT-001 ${"context ".repeat(100)}\n`)
  const ledger = new ProcessingBudgetLedger({
    limits: {
      document_excerpt_bytes: 180,
      bob_input_bytes: 180
    }
  })

  const result = await extractDocuments(input(), {
    workspaceRoot: root,
    limits: {
      maxDocumentBytes: 4096,
      maxExcerptBytesPerDocument: 2048,
      maxBobInputBytes: 2048
    },
    budgetLedger: ledger
  })

  const retainedBytes = Buffer.byteLength(result.excerptsMarkdown, "utf8")
  assert.ok(retainedBytes <= 180)
  assert.equal(committed(ledger, "document_excerpt_bytes"), retainedBytes)
  assert.ok(result.warnings.some((warning) => /document excerpts|aggregate maxBobInputBytes/i.test(warning)))
})

test("shares total-operation input consumption between raw diff, document bytes, and excerpts", async (t) => {
  const root = await workspace(t, "# REQ-EXCERPT-001\n\nREQ-EXCERPT-001 shared budget\n")
  const ledger = new ProcessingBudgetLedger({
    limits: {
      single_document_bytes: 100,
      total_document_bytes: 100,
      raw_diff_bytes: 100,
      document_excerpt_bytes: 100,
      bob_input_bytes: 0,
      total_operation_input_bytes: 120
    }
  })
  ledger.reserve("raw_diff_bytes", 70).commit()

  await assert.rejects(
    () => extractDocuments(input(), {
      workspaceRoot: root,
      limits: {
        maxDocumentBytes: 100,
        maxExcerptBytesPerDocument: 100,
        maxBobInputBytes: 100
      },
      budgetLedger: ledger
    }),
    (error) => error?.code === "processing_budget_exceeded"
      && error.details?.constrainedCategory === "total_operation_input_bytes"
      && error.details?.limit === 120
  )
})
