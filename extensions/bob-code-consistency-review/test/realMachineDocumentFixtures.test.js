const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const YAML = require("yaml")

const { extractDocuments } = require("../out/analyzers/documentExtractor")

const repoRoot = path.resolve(__dirname, "..", "..", "..")
const generatorPath = path.join(
  repoRoot,
  "tools",
  "real-machine-test-environment",
  "document-fixtures",
  "Generate-InputDocumentFixtures.js"
)
const workspaceCommon = path.join(
  repoRoot,
  "docs",
  "workflows",
  "code-consistency-review",
  "examples",
  "ai-verification-matrix",
  "fixtures",
  "workspace-common"
)

test("real-machine DOCX/XLSX fixtures produce evidence while PDF stays unreferenced", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bob-real-machine-docs-"))
  const workspace = path.join(root, "workspace")
  try {
    fs.cpSync(workspaceCommon, workspace, { recursive: true })
    const output = path.join(workspace, "docs", "input-documents")
    const reviewInputPath = path.join(workspace, "review-input.yaml")
    const generated = childProcess.spawnSync(process.execPath, [
      generatorPath,
      "--profile", "consistency-ai-matrix",
      "--output", output,
      "--review-input", reviewInputPath
    ], {
      cwd: repoRoot,
      encoding: "utf8"
    })
    assert.equal(generated.status, 0, generated.stdout + generated.stderr)

    const reviewInputText = fs.readFileSync(reviewInputPath, "utf8")
    assert.doesNotMatch(reviewInputText, /supplemental-reference\.pdf/)
    const reviewInput = YAML.parse(reviewInputText)
    const result = await extractDocuments(reviewInput, { workspaceRoot: workspace })

    const evidenceIds = result.evidence.map((entry) => entry.evidence_id)
    assert.equal(new Set(evidenceIds).size, evidenceIds.length)
    for (const marker of [
      "REQ-DOC-001",
      "REQ-DOC-002",
      "BD-DOC-001",
      "TC-DOC-001",
      "TC-DOC-002"
    ]) {
      assert.match(result.excerptsMarkdown, new RegExp(marker))
    }
    assert.match(result.excerptsMarkdown, /Design ID\s*\|\s*Requirement\s*\|\s*Implementation/)
    assert.match(result.excerptsMarkdown, /Test ID\s*\|\s*Condition\s*\|\s*Expected/)
    assert.equal(
      result.documents.some((document) => document.path.endsWith("supplemental-reference.pdf")),
      false
    )
    assert.equal(
      result.documents.some((document) => document.path.endsWith("requirements-and-design.docx")),
      true
    )
    assert.equal(
      result.documents.some((document) => document.path.endsWith("verification-matrix.xlsx")),
      true
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
