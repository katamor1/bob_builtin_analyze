"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { extractDocuments } = require("../out/analyzers/documentExtractor")

function workspace(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bob-document-budget-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, "docs"), { recursive: true })
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(root, "docs", name), bytes)
  return root
}

function input(paths) {
  return {
    schema_version: 1,
    review: { id: "REVIEW-BUDGET", title: "budget", change_type: "bugfix", purpose: "budget", base: "a", head: "b" },
    artifacts: { requirements: paths.map((file) => ({ path: `docs/${file}` })) },
    review_focus: ["requirement-code-consistency"]
  }
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

test("fails closed when document count exceeds the operation profile", async (t) => {
  const root = workspace(t, { "a.md": "a", "b.md": "b" })
  await assert.rejects(
    extractDocuments(input(["a.md", "b.md"]), {
      workspaceRoot: root,
      budgetProfile: { limits: { document_count: 1 } }
    }),
    expectExceeded("document_count", 1, 2)
  )
})

test("fails closed when aggregate document bytes exceed the operation profile", async (t) => {
  const root = workspace(t, { "a.md": "abc", "b.md": "def" })
  await assert.rejects(
    extractDocuments(input(["a.md", "b.md"]), {
      workspaceRoot: root,
      budgetProfile: {
        limits: {
          document_count: 2,
          total_document_bytes: 5,
          total_operation_input_bytes: 5
        }
      }
    }),
    expectExceeded("total_document_bytes", 5, 6)
  )
})

test("accepts exact document count and byte boundaries", async (t) => {
  const root = workspace(t, { "a.md": "abc", "b.md": "def" })
  const result = await extractDocuments(input(["a.md", "b.md"]), {
    workspaceRoot: root,
    budgetProfile: {
      limits: {
        document_count: 2,
        total_document_bytes: 6,
        total_operation_input_bytes: 6
      }
    }
  })
  assert.equal(result.documents.length, 2)
})

test("keeps ordinary document failures as warnings", async (t) => {
  const root = workspace(t, {})
  const result = await extractDocuments(input(["missing.md"]), { workspaceRoot: root })
  assert.equal(result.documents.length, 1)
  assert.ok(result.warnings.some((warning) => /failed to extract.*missing\.md/i.test(warning)))
})
