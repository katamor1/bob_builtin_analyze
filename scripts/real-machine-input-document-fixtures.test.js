const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const repoRoot = path.resolve(__dirname, "..")
const generatorPath = path.join(
  repoRoot,
  "tools",
  "real-machine-test-environment",
  "document-fixtures",
  "Generate-InputDocumentFixtures.js"
)

const profiles = {
  "bazaar-core": {
    binaryFiles: [
      "project-review-rules.docx",
      "review-traceability-ledger.xlsx",
      "system-review-guidelines.pdf"
    ],
    expectedFile: "EXPECTED_DOCUMENT_INPUTS.md"
  },
  "consistency-ai-matrix": {
    binaryFiles: [
      "requirements-and-design.docx",
      "verification-matrix.xlsx",
      "supplemental-reference.pdf"
    ],
    expectedFile: "EXPECTED_DOCUMENT_EXTRACTION.md"
  }
}

function runGenerator(args, options = {}) {
  return childProcess.spawnSync(process.execPath, [generatorPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    ...options
  })
}

function digest(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")
}

function readJson(...parts) {
  return JSON.parse(fs.readFileSync(path.join(...parts), "utf8").replace(/^\uFEFF/, ""))
}

test("validate-only accepts both profiles without writing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bob-doc-validate-"))
  try {
    for (const profile of Object.keys(profiles)) {
      const output = path.join(root, profile)
      const result = runGenerator(["--profile", profile, "--validate-only"])
      assert.equal(result.status, 0, result.stdout + result.stderr)
      assert.match(result.stdout, new RegExp(`Document fixture profile valid: ${profile}`))
      assert.equal(fs.existsSync(output), false)
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

for (const [profile, contract] of Object.entries(profiles)) {
  test(`${profile} generation is byte-for-byte deterministic`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `bob-doc-${profile}-`))
    const first = path.join(root, "first")
    const second = path.join(root, "second")
    try {
      for (const output of [first, second]) {
        const result = runGenerator(["--profile", profile, "--output", output])
        assert.equal(result.status, 0, result.stdout + result.stderr)
      }
      for (const fileName of contract.binaryFiles) {
        assert.equal(digest(path.join(first, fileName)), digest(path.join(second, fileName)))
      }
      assert.deepEqual(
        readJson(first, "document-fixture-manifest.json"),
        readJson(second, "document-fixture-manifest.json")
      )
      assert.equal(fs.existsSync(path.join(first, contract.expectedFile)), true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
}

test("generator rejects unknown profiles and existing output directories", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bob-doc-reject-"))
  try {
    const unknown = runGenerator(["--profile", "unknown", "--validate-only"])
    assert.notEqual(unknown.status, 0)
    assert.match(unknown.stderr, /Unsupported document fixture profile: unknown/)

    const existing = runGenerator(["--profile", "bazaar-core", "--output", root])
    assert.notEqual(existing.status, 0)
    assert.match(existing.stderr, /Output directory already exists/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("content definitions contain no command/path fields and repository stores no binary fixtures", () => {
  const content = readJson(
    repoRoot,
    "tools",
    "real-machine-test-environment",
    "document-fixtures",
    "fixture-content.json"
  )
  const serialized = JSON.stringify(content)
  assert.doesNotMatch(serialized, /(?:command|outputPath|absolutePath|scriptBody)/)
  const fixtureRoot = path.join(
    repoRoot,
    "tools",
    "real-machine-test-environment",
    "document-fixtures"
  )
  const trackedSources = fs.readdirSync(fixtureRoot)
  assert.equal(trackedSources.some((name) => /\.(?:docx|xlsx|pdf)$/i.test(name)), false)
})

test("generator rejects a symbolic-link or junction output ancestor", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bob-doc-link-"))
  const real = path.join(root, "real")
  const linked = path.join(root, "linked")
  fs.mkdirSync(real)
  try {
    try {
      fs.symlinkSync(real, linked, process.platform === "win32" ? "junction" : "dir")
    } catch (error) {
      context.skip(`symbolic-link creation unavailable: ${error.code ?? error.message}`)
      return
    }
    const result = runGenerator([
      "--profile", "bazaar-core",
      "--output", path.join(linked, "documents")
    ])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /symbolic link or junction/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

const generator = require(generatorPath)

test("generated OOXML entry order and PDF pages are fixed", () => {
  const bazaarFiles = generator.buildProfileFiles("bazaar-core")
  const docx = bazaarFiles.find(({ logicalName }) => logicalName.endsWith(".docx")).bytes
  const xlsx = bazaarFiles.find(({ logicalName }) => logicalName.endsWith(".xlsx")).bytes
  const pdf = bazaarFiles.find(({ logicalName }) => logicalName.endsWith(".pdf")).bytes

  assert.deepEqual(generator.parseZipEntries(docx), [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/_rels/document.xml.rels",
    "word/styles.xml"
  ])
  assert.deepEqual(generator.parseZipEntries(xlsx), [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/worksheets/sheet1.xml",
    "xl/worksheets/sheet2.xml"
  ])
  for (const archive of [docx, xlsx]) {
    let offset = 0
    while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
      assert.equal(archive.readUInt16LE(offset + 10), 0)
      assert.equal(archive.readUInt16LE(offset + 12), 0)
      const size = archive.readUInt32LE(offset + 18)
      const nameLength = archive.readUInt16LE(offset + 26)
      const extraLength = archive.readUInt16LE(offset + 28)
      offset += 30 + nameLength + extraLength + size
    }
  }
  assert.equal(pdf.subarray(0, 8).toString("ascii"), "%PDF-1.4")
  const pdfText = pdf.toString("ascii")
  assert.match(pdfText, /\/Count 3/)
  assert.match(pdfText, /PDF-RULE-001/)
  assert.match(pdfText, /PDF-RULE-003/)
  assert.match(pdfText, /<< \/Length 0 >>\nstream\n\nendstream/)
})

test("manifest hashes and reference flags match generated bytes", () => {
  for (const profile of Object.keys(profiles)) {
    const files = generator.buildProfileFiles(profile)
    const manifest = JSON.parse(
      files.find(({ logicalName }) => logicalName === "document-fixture-manifest.json")
        .bytes.toString("utf8")
    )
    for (const record of manifest.files) {
      const file = files.find(({ logicalName }) => logicalName === record.logicalName)
      assert.equal(record.sha256, generator.sha256(file.bytes))
      assert.equal(record.byteSize, file.bytes.length)
    }
    const pdf = manifest.files.find(({ mediaType }) => mediaType === "pdf")
    if (profile === "consistency-ai-matrix") assert.equal(pdf.referencedByReviewInput, false)
  }
})

const baselineReviewInput = [
  "schema_version: 1",
  "",
  "review:",
  "  id: REVIEW-AI-MATRIX-001",
  "  title: matrix",
  "  change_type: feature",
  "  purpose: matrix",
  "  base: main",
  "  head: feature/ai-verification-matrix",
  "",
  "artifacts:",
  "  requirements:",
  "    - path: docs/requirements-ai-matrix.md",
  "      version: \"2.0\"",
  "      sections:",
  "        - REQ-OK-001",
  "  basic_design:",
  "    - path: docs/basic-design-ai-matrix.md",
  "      version: \"2.0\"",
  "  test_spec:",
  "    - path: docs/test-spec-ai-matrix.md",
  "      version: \"2.0\"",
  "      cases:",
  "        - TC-OK-010",
  "  ledgers:",
  "    - path: docs/error-ledger-ai-matrix.md",
  "      version: \"2.0\"",
  "",
  "review_focus:",
  "  - requirement-code-consistency",
  ""
].join("\n")

test("consistency profile atomically adds DOCX and XLSX without referencing PDF", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bob-doc-patch-"))
  const output = path.join(root, "documents")
  const reviewInput = path.join(root, "review-input.yaml")
  try {
    fs.writeFileSync(reviewInput, baselineReviewInput, "utf8")
    const result = runGenerator([
      "--profile", "consistency-ai-matrix",
      "--output", output,
      "--review-input", reviewInput
    ])
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const patched = fs.readFileSync(reviewInput, "utf8")
    assert.match(patched, /path: docs\/input-documents\/requirements-and-design\.docx/)
    assert.match(patched, /- REQ-DOC-001[\s\S]*- REQ-DOC-002[\s\S]*- BD-DOC-001/)
    assert.match(patched, /path: docs\/input-documents\/verification-matrix\.xlsx/)
    assert.match(patched, /sheets:\s*\n\s*- Verification/)
    assert.match(patched, /- TC-DOC-001[\s\S]*- TC-DOC-002/)
    assert.doesNotMatch(patched, /supplemental-reference\.pdf/)
    assert.match(patched, /base: main/)
    assert.match(patched, /head: feature\/ai-verification-matrix/)
    assert.match(patched, /review_focus:/)
    assert.equal(fs.existsSync(`${reviewInput}.document-fixture.tmp`), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("review-input patch rejects duplicate paths and preserves the original file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bob-doc-patch-reject-"))
  const output = path.join(root, "documents")
  const reviewInput = path.join(root, "review-input.yaml")
  const duplicate = baselineReviewInput.replace(
    "  basic_design:",
    [
      "    - path: docs/input-documents/requirements-and-design.docx",
      "      version: \"1.0\"",
      "  basic_design:"
    ].join("\n")
  )
  try {
    fs.writeFileSync(reviewInput, duplicate, "utf8")
    const result = runGenerator([
      "--profile", "consistency-ai-matrix",
      "--output", output,
      "--review-input", reviewInput
    ])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Document fixture path already exists/)
    assert.equal(fs.readFileSync(reviewInput, "utf8"), duplicate)
    assert.equal(fs.existsSync(output), false)
    assert.equal(fs.existsSync(`${reviewInput}.document-fixture.tmp`), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
