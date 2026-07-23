# Bob Review Input Document Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing `bob-bazaar-review` and `bob-code-consistency-review` real-machine test environments so `bazaar-core` and `consistency-ai-matrix` generate deterministic PDF, DOCX, and XLSX input documents without changing either extension runtime.

**Architecture:** A repository-level Node.js generator creates fixed-profile synthetic OOXML/PDF files, a content manifest, and human-readable expected-output notes. The two existing PowerShell sandbox launchers opt in through `-IncludeDocumentFixtures`; the common real-machine runner injects that switch only for the two allowlisted scenarios and runs a write-free generator validation under `-ValidateOnly`. Code-consistency uses DOCX/XLSX in `review-input.yaml`; its PDF remains present but deliberately unreferenced.

**Tech Stack:** Node.js 22 built-in modules and test runner, PowerShell 7, deterministic stored ZIP/OOXML, minimal PDF 1.4, JSON, YAML text patching, GitHub Actions Windows runner.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-07-20-bob-review-input-document-fixtures-design.md`.
- Keep the existing six scenario IDs and their execution order unchanged.
- Add document fixtures only to `bazaar-core` and `consistency-ai-matrix`.
- Do not change extension runtime code, schemas, command IDs, workflow provider IDs, runtime dependencies, or VSIX versions.
- Do not commit generated `.docx`, `.xlsx`, or `.pdf` files.
- Generate fixture bytes using Node.js built-in modules only; do not add npm dependencies.
- `bob-code-consistency-review` must reference DOCX and XLSX only; its PDF must remain unreferenced.
- `bob-bazaar-review` source documents must stay outside both `bob-managed` and `bazaar-source`.
- Poppler is optional for environment generation and required only for the operator’s Bazaar PDF extraction step.
- `-ValidateOnly` must not create binary files, output roots, or temporary patched YAML files.
- `IncludeDocumentFixtures` is runner-controlled and must not be accepted from `scenario.generator.arguments`.
- Existing launcher behavior without `-IncludeDocumentFixtures` must remain unchanged.
- Generated operator results must remain `not_run` until a human records `pass`, `fail`, or `blocked`.
- Every production change starts with a focused failing test and ends with a focused passing test and commit.

## File Map

| Path | Responsibility |
| --- | --- |
| `tools/real-machine-test-environment/document-fixtures/fixture-content.json` | Human-readable fixed document content for the two allowlisted profiles; no paths or commands |
| `tools/real-machine-test-environment/document-fixtures/Generate-InputDocumentFixtures.js` | CLI, deterministic DOCX/XLSX/PDF generation, manifest, expected notes, safe output, atomic review-input patch |
| `scripts/real-machine-input-document-fixtures.test.js` | Generator determinism, archive/PDF structure, manifest integrity, safety, and write-free validation |
| `docs/workflows/bazaar-project-rule-review/integration/launch-bob-bazaar-review-sandbox.ps1` | Optional generation into `<SandboxRoot>/input-documents` |
| `docs/workflows/code-consistency-review/integration/launch-bob-code-consistency-sandbox.ps1` | Optional generation and atomic review-input patch before the Git baseline commit |
| `extensions/bob-bazaar-review/test/integrationSandboxScript.test.js` | Bazaar launcher opt-in and backward-compatibility contracts |
| `extensions/bob-code-consistency-review/test/integrationSandboxScript.test.js` | Code-consistency launcher opt-in, sample gate, and pre-baseline ordering contracts |
| `tools/real-machine-test-environment/scenarios.json` | Two fixed `documentFixtureProfile` entries, new testcase IDs, and ten expected artifacts |
| `tools/real-machine-test-environment/lib/ScenarioManifest.ps1` | Profile/scenario allowlist and `PRA-WIN-*` testcase lookup |
| `tools/real-machine-test-environment/lib/ScenarioExecution.ps1` | `IncludeDocumentFixtures` injection and write-free generator validation |
| `tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1` | Calls generator validation for selected document profiles |
| `tools/real-machine-test-environment/checklists/bazaar-core.md` | DOCX/XLSX/PDF authoring steps and optional-Poppler result rules |
| `tools/real-machine-test-environment/checklists/consistency-ai-matrix.md` | DOCX/XLSX preprocess checks and explicit PDF non-reference checks |
| `tools/real-machine-test-environment/README-ja.md` | Operator guidance for generated input documents and Poppler boundary |
| `scripts/real-machine-test-environment.test.js` | Repository-level scenario, runner, launcher, testcase, and expected-artifact contracts |
| `extensions/bob-code-consistency-review/test/realMachineDocumentFixtures.test.js` | Generated DOCX/XLSX integration with the current extractor |
| `.github/workflows/extensions-quality.yml` | Runs both repository contract files in the Windows contract job |
| `docs/implementation/bob-review-input-document-fixtures-verification-2026-07-20.md` | Actual command and CI evidence; no manual UAT claims |

---

### Task 1: Build the deterministic two-profile document generator

**Files:**
- Create: `tools/real-machine-test-environment/document-fixtures/fixture-content.json`
- Create: `tools/real-machine-test-environment/document-fixtures/Generate-InputDocumentFixtures.js`
- Create: `scripts/real-machine-input-document-fixtures.test.js`

**Interfaces:**
- CLI: `node Generate-InputDocumentFixtures.js --profile <bazaar-core|consistency-ai-matrix> --output <new-directory>`
- Validation CLI: `node Generate-InputDocumentFixtures.js --profile <profile> --validate-only`
- Exports for tests: `buildProfileFiles(profile)`, `createStoredZip(entries)`, `parseZipEntries(buffer)`, `sha256(buffer)`
- Output is a new directory containing exactly three binary documents, `document-fixture-manifest.json`, and one expected-output Markdown file.
- `document-fixture-manifest.json` contains only portable metadata and the three binary file records.

- [ ] **Step 1: Write the failing generator contract tests**

Create `scripts/real-machine-input-document-fixtures.test.js` with these initial tests:

```js
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""))
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
        readJson(path.join(first, "document-fixture-manifest.json")),
        readJson(path.join(second, "document-fixture-manifest.json"))
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
```

- [ ] **Step 2: Run the generator tests and verify RED**

Run:

```bash
node --test scripts/real-machine-input-document-fixtures.test.js
```

Expected: FAIL because `Generate-InputDocumentFixtures.js` does not exist.

- [ ] **Step 3: Create the fixed content definition**

Create `tools/real-machine-test-environment/document-fixtures/fixture-content.json`:

```json
{
  "schemaVersion": 1,
  "profiles": {
    "bazaar-core": {
      "docx": {
        "title": "Project Review Rules",
        "sections": [
          {
            "heading": "RULE-DOC-001 Real-time path",
            "paragraphs": [
              "RULE-DOC-001 forbids console I/O, waits, and dynamic allocation in RT_CONTROL."
            ],
            "list": [
              "Check printf, SleepForIo, malloc, and free.",
              "Record file and line evidence for every violation."
            ]
          },
          {
            "heading": "RULE-DOC-002 Shared interface",
            "paragraphs": [
              "RULE-DOC-002 requires versioned field order and a single documented owner."
            ],
            "list": []
          }
        ],
        "table": [
          ["Rule ID", "Area", "Required review"],
          ["RULE-DOC-003", "Bounds", "Reject unbounded sprintf and strcpy usage"],
          ["RULE-DOC-004", "Tests", "Require negative and timeout path coverage"]
        ]
      },
      "xlsx": {
        "sheets": [
          {
            "name": "Rules",
            "rows": [
              ["Rule ID", "Owner", "Area", "Verification method", "Status"],
              ["RULE-DOC-001", "rt-team", "RT_CONTROL", "Review calls and allocation", "active"],
              ["RULE-DOC-002", "interface-team", "PlcSharedFrame", "Compare field order and owner", "active"],
              ["RULE-DOC-003", "safety-team", "String bounds", "Review fixed buffers", "active"],
              ["RULE-DOC-004", "qa-team", "Tests", "Compare negative-path coverage", "active"]
            ]
          },
          {
            "name": "Verification",
            "rows": [
              ["Rule ID", "Fixture evidence", "Expected"],
              ["RULE-DOC-001", "src/rt_control.c", "finding"],
              ["RULE-DOC-002", "src/if/plc_shared.h", "finding"],
              ["RULE-DOC-003", "src/diagnostics.c", "finding"],
              ["RULE-DOC-004", "docs/test-spec.md", "finding"]
            ]
          }
        ]
      },
      "pdf": {
        "pages": [
          [
            "System Review Guidelines",
            "PDF-RULE-001 Review real-time paths for blocking calls.",
            "PDF-RULE-002 Review shared interface ownership."
          ],
          [],
          [
            "Continuation",
            "PDF-RULE-003 Review bounds and negative-path tests."
          ]
        ]
      }
    },
    "consistency-ai-matrix": {
      "docx": {
        "title": "Requirements and Basic Design",
        "sections": [
          {
            "heading": "REQ-DOC-001 Timeout status",
            "paragraphs": [
              "REQ-DOC-001 requires ERR_TIMEOUT when the provider times out."
            ],
            "list": []
          },
          {
            "heading": "REQ-DOC-002 Fraud review",
            "paragraphs": [
              "REQ-DOC-002 requires ERR_FRAUD_REVIEW for a manual fraud hold."
            ],
            "list": []
          }
        ],
        "table": [
          ["Design ID", "Requirement", "Implementation"],
          ["BD-DOC-001", "REQ-DOC-001", "map_provider_status returns ERR_TIMEOUT"],
          ["BD-DOC-002", "REQ-DOC-002", "manual review remains an explicit branch"]
        ]
      },
      "xlsx": {
        "sheets": [
          {
            "name": "Verification",
            "rows": [
              ["Test ID", "Condition", "Expected"],
              ["TC-DOC-001", "provider timeout", "ERR_TIMEOUT"],
              ["TC-DOC-002", "fraud hold", "ERR_FRAUD_REVIEW"]
            ]
          },
          {
            "name": "Reference",
            "rows": [
              ["Reference ID", "Purpose"],
              ["REF-DOC-001", "Non-selected control sheet"]
            ]
          }
        ]
      },
      "pdf": {
        "pages": [
          [
            "Supplemental Reference",
            "PDF-CONSISTENCY-UNREFERENCED",
            "This file is intentionally absent from review-input.yaml."
          ]
        ]
      }
    }
  }
}
```

- [ ] **Step 4: Implement the generator CLI and deterministic file builders**

Create `tools/real-machine-test-environment/document-fixtures/Generate-InputDocumentFixtures.js` with the following complete interface and implementation structure:

```js
#!/usr/bin/env node
"use strict"

const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const contentPath = path.join(__dirname, "fixture-content.json")
const content = JSON.parse(fs.readFileSync(contentPath, "utf8"))
const UTF8 = "utf8"
const GENERATOR_ID = "bob-review-input-document-fixtures"
const GENERATOR_VERSION = 1

const PROFILE_FILES = Object.freeze({
  "bazaar-core": Object.freeze({
    docx: "project-review-rules.docx",
    xlsx: "review-traceability-ledger.xlsx",
    pdf: "system-review-guidelines.pdf",
    expected: "EXPECTED_DOCUMENT_INPUTS.md",
    referenced: Object.freeze({ docx: false, xlsx: false, pdf: false })
  }),
  "consistency-ai-matrix": Object.freeze({
    docx: "requirements-and-design.docx",
    xlsx: "verification-matrix.xlsx",
    pdf: "supplemental-reference.pdf",
    expected: "EXPECTED_DOCUMENT_EXTRACTION.md",
    referenced: Object.freeze({ docx: true, xlsx: true, pdf: false })
  })
})

function main(argv) {
  const args = parseArgs(argv)
  validateContent()
  const files = buildProfileFiles(args.profile)

  if (args.validateOnly) {
    if (args.output || args.reviewInput) {
      throw new Error("--validate-only cannot be combined with --output or --review-input")
    }
    validateBuiltFiles(args.profile, files)
    process.stdout.write(`Document fixture profile valid: ${args.profile}\n`)
    return
  }

  if (!args.output) throw new Error("--output is required unless --validate-only is used")
  const outputRoot = prepareNewOutputDirectory(args.output)
  try {
    writeProfileFiles(outputRoot, files)
    if (args.reviewInput) {
      if (args.profile !== "consistency-ai-matrix") {
        throw new Error("--review-input is supported only for consistency-ai-matrix")
      }
      patchReviewInputAtomic(args.reviewInput)
    }
    process.stdout.write(`Document fixtures generated: ${args.profile} -> ${outputRoot}\n`)
  } catch (error) {
    fs.rmSync(outputRoot, { recursive: true, force: true })
    throw error
  }
}

function parseArgs(argv) {
  const result = { profile: "", output: "", reviewInput: "", validateOnly: false }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === "--validate-only") {
      result.validateOnly = true
      continue
    }
    if (token === "--profile" || token === "--output" || token === "--review-input") {
      const value = argv[index + 1]
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}`)
      index += 1
      if (token === "--profile") result.profile = value
      if (token === "--output") result.output = value
      if (token === "--review-input") result.reviewInput = value
      continue
    }
    throw new Error(`Unsupported argument: ${token}`)
  }
  if (!Object.hasOwn(PROFILE_FILES, result.profile)) {
    throw new Error(`Unsupported document fixture profile: ${result.profile || "(empty)"}`)
  }
  return result
}

function validateContent() {
  if (content.schemaVersion !== 1) throw new Error("Unsupported fixture content schemaVersion")
  const actualProfiles = Object.keys(content.profiles).sort()
  const expectedProfiles = Object.keys(PROFILE_FILES).sort()
  if (JSON.stringify(actualProfiles) !== JSON.stringify(expectedProfiles)) {
    throw new Error("fixture-content.json profiles must match the fixed profile allowlist")
  }
  for (const profile of expectedProfiles) {
    const definition = content.profiles[profile]
    if (!definition?.docx?.title || !Array.isArray(definition.docx.sections)) {
      throw new Error(`${profile}.docx is invalid`)
    }
    if (!Array.isArray(definition.xlsx?.sheets) || definition.xlsx.sheets.length === 0) {
      throw new Error(`${profile}.xlsx is invalid`)
    }
    if (!Array.isArray(definition.pdf?.pages) || definition.pdf.pages.length === 0) {
      throw new Error(`${profile}.pdf is invalid`)
    }
  }
}

function buildProfileFiles(profile) {
  const names = PROFILE_FILES[profile]
  const definition = content.profiles[profile]
  const binaryFiles = [
    {
      logicalName: names.docx,
      mediaType: "docx",
      bytes: buildDocx(definition.docx),
      referencedByReviewInput: names.referenced.docx,
      expectedSelectors: collectDocxSelectors(profile),
      expectedLocators: []
    },
    {
      logicalName: names.xlsx,
      mediaType: "xlsx",
      bytes: buildXlsx(definition.xlsx),
      referencedByReviewInput: names.referenced.xlsx,
      expectedSelectors: collectXlsxSelectors(profile),
      expectedLocators: definition.xlsx.sheets.map((sheet) => sheet.name)
    },
    {
      logicalName: names.pdf,
      mediaType: "pdf",
      bytes: buildPdf(definition.pdf.pages),
      referencedByReviewInput: names.referenced.pdf,
      expectedSelectors: collectPdfSelectors(profile),
      expectedLocators: definition.pdf.pages.map((_, index) => `page:${index + 1}`)
    }
  ]
  const manifest = {
    schemaVersion: 1,
    generator: { id: GENERATOR_ID, version: GENERATOR_VERSION, profile },
    files: binaryFiles.map((file) => ({
      logicalName: file.logicalName,
      mediaType: file.mediaType,
      sha256: sha256(file.bytes),
      byteSize: file.bytes.length,
      referencedByReviewInput: file.referencedByReviewInput,
      expectedSelectors: file.expectedSelectors,
      expectedLocators: file.expectedLocators
    }))
  }
  const expectedText = profile === "bazaar-core"
    ? renderBazaarExpected(manifest)
    : renderConsistencyExpected(manifest)
  const files = [
    ...binaryFiles.map(({ logicalName, bytes }) => ({ logicalName, bytes })),
    {
      logicalName: "document-fixture-manifest.json",
      bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, UTF8)
    },
    {
      logicalName: names.expected,
      bytes: Buffer.from(expectedText, UTF8)
    }
  ]
  validateBuiltFiles(profile, files)
  return files
}

function collectDocxSelectors(profile) {
  return profile === "bazaar-core"
    ? ["RULE-DOC-001", "RULE-DOC-002", "RULE-DOC-003", "RULE-DOC-004"]
    : ["REQ-DOC-001", "REQ-DOC-002", "BD-DOC-001"]
}

function collectXlsxSelectors(profile) {
  return profile === "bazaar-core"
    ? ["RULE-DOC-001", "RULE-DOC-002", "RULE-DOC-003", "RULE-DOC-004"]
    : ["TC-DOC-001", "TC-DOC-002"]
}

function collectPdfSelectors(profile) {
  return profile === "bazaar-core"
    ? ["PDF-RULE-001", "PDF-RULE-002", "PDF-RULE-003"]
    : ["PDF-CONSISTENCY-UNREFERENCED"]
}

function validateBuiltFiles(profile, files) {
  const names = PROFILE_FILES[profile]
  const expectedNames = [
    names.docx,
    names.xlsx,
    names.pdf,
    "document-fixture-manifest.json",
    names.expected
  ]
  assertUnique(expectedNames, `${profile} output names`)
  assertUnique(files.map((file) => file.logicalName), `${profile} built file names`)
  if (JSON.stringify(files.map((file) => file.logicalName)) !== JSON.stringify(expectedNames)) {
    throw new Error(`${profile} output order does not match the fixed allowlist`)
  }
  for (const file of files) {
    assertSafeLogicalName(file.logicalName)
    if (!Buffer.isBuffer(file.bytes) || file.bytes.length === 0) {
      throw new Error(`Generated file is empty: ${file.logicalName}`)
    }
  }
  const manifest = JSON.parse(
    files.find((file) => file.logicalName === "document-fixture-manifest.json").bytes.toString(UTF8)
  )
  for (const record of manifest.files) {
    const file = files.find((item) => item.logicalName === record.logicalName)
    if (!file) throw new Error(`Manifest file is missing: ${record.logicalName}`)
    if (record.sha256 !== sha256(file.bytes) || record.byteSize !== file.bytes.length) {
      throw new Error(`Manifest hash or byteSize mismatch: ${record.logicalName}`)
    }
  }
}

function prepareNewOutputDirectory(outputPath) {
  const outputRoot = path.resolve(outputPath)
  if (fs.existsSync(outputRoot)) throw new Error(`Output directory already exists: ${outputRoot}`)
  assertNoSymbolicLinkTraversal(path.dirname(outputRoot))
  fs.mkdirSync(outputRoot, { recursive: false })
  if (fs.lstatSync(outputRoot).isSymbolicLink()) {
    throw new Error(`Output directory must not be a symbolic link or junction: ${outputRoot}`)
  }
  return outputRoot
}

function assertNoSymbolicLinkTraversal(candidate) {
  let current = path.parse(path.resolve(candidate)).root
  const relative = path.relative(current, path.resolve(candidate))
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    if (!fs.existsSync(current)) break
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`Path must not traverse a symbolic link or junction: ${current}`)
    }
  }
}

function writeProfileFiles(outputRoot, files) {
  for (const file of files) {
    const target = path.resolve(outputRoot, file.logicalName)
    if (path.dirname(target) !== outputRoot) {
      throw new Error(`Generated file escapes output root: ${file.logicalName}`)
    }
    fs.writeFileSync(target, file.bytes, { flag: "wx" })
  }
}

function buildDocx(definition) {
  const body = [
    wordParagraph(definition.title, "Heading1"),
    ...definition.sections.flatMap((section) => [
      wordParagraph(section.heading, "Heading2"),
      ...section.paragraphs.map((text) => wordParagraph(text)),
      ...section.list.map((text) => wordParagraph(`• ${text}`))
    ]),
    wordTable(definition.table),
    "<w:sectPr/>"
  ].join("")
  return createStoredZip([
    ["[Content_Types].xml", xml([
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
      "</Types>"
    ])],
    ["_rels/.rels", relationships([
      relationship("rId1", "officeDocument", "word/document.xml")
    ])],
    ["word/document.xml", xml([
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      `<w:body>${body}</w:body></w:document>`
    ])],
    ["word/_rels/document.xml.rels", relationships([
      relationship("rIdStyles", "styles", "styles.xml")
    ])],
    ["word/styles.xml", xml([
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>',
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>',
      '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>',
      "</w:styles>"
    ])]
  ])
}

function wordParagraph(text, style = "") {
  const properties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""
  return `<w:p>${properties}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

function wordTable(rows) {
  return `<w:tbl>${rows.map((row) =>
    `<w:tr>${row.map((cell) => `<w:tc>${wordParagraph(cell)}</w:tc>`).join("")}</w:tr>`
  ).join("")}</w:tbl>`
}

function buildXlsx(definition) {
  const sheetEntries = []
  const relationshipsList = []
  const sheetDeclarations = []
  const contentOverrides = []
  definition.sheets.forEach((sheet, index) => {
    const sheetNumber = index + 1
    sheetDeclarations.push(
      `<sheet name="${escapeXml(sheet.name)}" sheetId="${sheetNumber}" r:id="rId${sheetNumber}"/>`
    )
    relationshipsList.push(
      relationship(`rId${sheetNumber}`, "worksheet", `worksheets/sheet${sheetNumber}.xml`)
    )
    contentOverrides.push(
      `<Override PartName="/xl/worksheets/sheet${sheetNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    sheetEntries.push([
      `xl/worksheets/sheet${sheetNumber}.xml`,
      worksheetXml(sheet.rows)
    ])
  })
  return createStoredZip([
    ["[Content_Types].xml", xml([
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      ...contentOverrides,
      "</Types>"
    ])],
    ["_rels/.rels", relationships([
      relationship("rId1", "officeDocument", "xl/workbook.xml")
    ])],
    ["xl/workbook.xml", xml([
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ',
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      `<sheets>${sheetDeclarations.join("")}</sheets></workbook>`
    ])],
    ["xl/_rels/workbook.xml.rels", relationships(relationshipsList)],
    ...sheetEntries
  ])
}

function worksheetXml(rows) {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`
    }).join("")
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join("")
  return xml([
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<sheetData>${body}</sheetData></worksheet>`
  ])
}

function columnName(index) {
  let value = index
  let result = ""
  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }
  return result
}

function buildPdf(pages) {
  const pageObjectIds = pages.map((_, index) => 3 + index)
  const fontObjectId = 3 + pages.length
  const contentObjectIds = pages.map((_, index) => fontObjectId + 1 + index)
  const objects = []
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>"
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`
  pages.forEach((lines, index) => {
    const pageId = pageObjectIds[index]
    const contentId = contentObjectIds[index]
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`
    const stream = renderPdfPage(lines)
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`
  })
  objects[fontObjectId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"

  let output = "%PDF-1.4\n"
  const offsets = [0]
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(output, "ascii")
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(output, "ascii")
  output += `xref\n0 ${objects.length}\n`
  output += "0000000000 65535 f \n"
  for (let id = 1; id < objects.length; id += 1) {
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`
  }
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(output, "ascii")
}

function renderPdfPage(lines) {
  if (lines.length === 0) return ""
  const commands = ["BT", "/F1 12 Tf", "72 720 Td"]
  lines.forEach((line, index) => {
    if (index > 0) commands.push("0 -18 Td")
    commands.push(`(${escapePdfString(line)}) Tj`)
  })
  commands.push("ET")
  return commands.join("\n")
}

function createStoredZip(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const [name, value] of entries) {
    assertSafeArchiveEntry(name)
    const nameBytes = Buffer.from(name, UTF8)
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value, UTF8)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, nameBytes, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, ...centralParts, end])
}

function parseZipEntries(buffer) {
  const names = []
  let offset = 0
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    names.push(buffer.subarray(nameStart, nameStart + nameLength).toString(UTF8))
    offset = nameStart + nameLength + extraLength + compressedSize
  }
  return names
}

function renderBazaarExpected(manifest) {
  return [
    "# Expected document inputs",
    "",
    "- DOCX: heading, paragraph, list, and rule table for RULE-DOC-001 through RULE-DOC-004.",
    "- XLSX: Rules and Verification sheets with matching rule rows.",
    "- PDF: page 1 text, empty page 2, and page 3 text with PDF-RULE-003.",
    "- Original files must not be pre-copied into bob-managed, bazaar-source, or .bob/review/rule-authoring.",
    "- If pdftotext is unavailable, record PRA-WIN-001 as blocked with note `Poppler unavailable`.",
    "",
    "## SHA-256",
    ...manifest.files.map((file) => `- \`${file.logicalName}\`: \`${file.sha256}\``),
    ""
  ].join("\n")
}

function renderConsistencyExpected(manifest) {
  return [
    "# Expected document extraction",
    "",
    "- review-input.yaml references requirements-and-design.docx and verification-matrix.xlsx.",
    "- supplemental-reference.pdf exists but is not referenced.",
    "- Expected markers: REQ-DOC-001, REQ-DOC-002, BD-DOC-001, TC-DOC-001, TC-DOC-002.",
    "- Confirm document-index.json, document-excerpts.md, and XLSX-derived table evidence.",
    "- Confirm the PDF path is absent from review-input.yaml and extraction outputs.",
    "",
    "## SHA-256",
    ...manifest.files.map((file) => `- \`${file.logicalName}\`: \`${file.sha256}\``),
    ""
  ].join("\n")
}

function xml(parts) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${parts.join("")}`
}

function relationships(items) {
  return xml([
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    items.join(""),
    "</Relationships>"
  ])
}

function relationship(id, type, target) {
  return `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function escapePdfString(value) {
  if (!/^[\x20-\x7E]*$/.test(value)) throw new Error("PDF fixture text must remain printable ASCII")
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

function assertSafeArchiveEntry(name) {
  if (!name || path.posix.isAbsolute(name) || name.split("/").includes("..") || name.includes("\\")) {
    throw new Error(`Unsafe archive entry: ${name}`)
  }
}

function assertSafeLogicalName(name) {
  if (!name || path.basename(name) !== name || name.includes("/") || name.includes("\\")) {
    throw new Error(`Unsafe logical file name: ${name}`)
  }
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`)
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function patchReviewInputAtomic() {
  throw new Error("Review input patching is introduced in Task 2")
}

if (require.main === module) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

module.exports = {
  buildProfileFiles,
  createStoredZip,
  parseZipEntries,
  sha256
}
```

- [ ] **Step 5: Extend tests to inspect archive and PDF structure**

Append to `scripts/real-machine-input-document-fixtures.test.js`:

```js
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
```

- [ ] **Step 6: Run the generator tests and verify GREEN**

Run:

```bash
node --test scripts/real-machine-input-document-fixtures.test.js
```

Expected: all generator tests pass, with no output directories remaining after the tests.

- [ ] **Step 7: Commit**

```bash
git add \
  tools/real-machine-test-environment/document-fixtures/fixture-content.json \
  tools/real-machine-test-environment/document-fixtures/Generate-InputDocumentFixtures.js \
  scripts/real-machine-input-document-fixtures.test.js
git commit -m "feat: generate deterministic review document fixtures"
```

### Task 2: Add atomic `review-input.yaml` patching for the code-consistency profile

**Files:**
- Modify: `tools/real-machine-test-environment/document-fixtures/Generate-InputDocumentFixtures.js`
- Modify: `scripts/real-machine-input-document-fixtures.test.js`

**Interfaces:**
- `patchReviewInputAtomic(reviewInputPath)` accepts only the known `ai-verification-matrix` review input shape.
- It adds one DOCX entry under `artifacts.requirements` and one XLSX entry under `artifacts.test_spec`.
- It never adds `supplemental-reference.pdf`.
- It writes `<review-input>.document-fixture.tmp`, verifies the complete output, atomically renames it, and removes the temporary file on failure.

- [ ] **Step 1: Add failing review-input patch tests**

Append to `scripts/real-machine-input-document-fixtures.test.js`:

```js
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
```

- [ ] **Step 2: Run the focused patch tests and verify RED**

Run:

```bash
node --test --test-name-pattern="review-input|atomically" scripts/real-machine-input-document-fixtures.test.js
```

Expected: FAIL because `patchReviewInputAtomic` still throws the Task 1 checkpoint error.

- [ ] **Step 3: Implement exact-anchor validation and atomic replacement**

Replace the Task 1 checkpoint `patchReviewInputAtomic` in `Generate-InputDocumentFixtures.js` with:

```js
function patchReviewInputAtomic(reviewInputPath) {
  const absolutePath = path.resolve(reviewInputPath)
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`review-input.yaml not found: ${absolutePath}`)
  }
  assertNoSymbolicLinkTraversal(path.dirname(absolutePath))
  if (fs.lstatSync(absolutePath).isSymbolicLink()) {
    throw new Error(`review-input.yaml must not be a symbolic link: ${absolutePath}`)
  }

  const originalBytes = fs.readFileSync(absolutePath)
  const original = originalBytes.toString(UTF8)
  if (!original.includes("id: REVIEW-AI-MATRIX-001")) {
    throw new Error("review-input.yaml is not the approved ai-verification-matrix fixture")
  }
  if (!original.includes("base: main") || !original.includes("head: feature/ai-verification-matrix")) {
    throw new Error("review-input.yaml base/head do not match the approved fixture")
  }
  for (const forbidden of [
    "docs/input-documents/requirements-and-design.docx",
    "docs/input-documents/verification-matrix.xlsx"
  ]) {
    if (original.includes(forbidden)) throw new Error(`Document fixture path already exists: ${forbidden}`)
  }
  if (original.includes("supplemental-reference.pdf")) {
    throw new Error("review-input.yaml must not reference supplemental-reference.pdf")
  }

  const newline = original.includes("\r\n") ? "\r\n" : "\n"
  let normalized = original.replace(/\r\n/g, "\n")
  const basicDesignAnchor = "  basic_design:\n"
  const ledgersAnchor = "  ledgers:\n"
  assertSingleAnchor(normalized, basicDesignAnchor, "artifacts.basic_design")
  assertSingleAnchor(normalized, ledgersAnchor, "artifacts.ledgers")

  const requirementEntry = [
    "    - path: docs/input-documents/requirements-and-design.docx",
    "      version: \"1.0\"",
    "      sections:",
    "        - REQ-DOC-001",
    "        - REQ-DOC-002",
    "        - BD-DOC-001",
    ""
  ].join("\n")
  const testEntry = [
    "    - path: docs/input-documents/verification-matrix.xlsx",
    "      version: \"1.0\"",
    "      sheets:",
    "        - Verification",
    "      rows:",
    "        - TC-DOC-001",
    "        - TC-DOC-002",
    ""
  ].join("\n")

  normalized = normalized.replace(basicDesignAnchor, `${requirementEntry}${basicDesignAnchor}`)
  normalized = normalized.replace(ledgersAnchor, `${testEntry}${ledgersAnchor}`)
  const patched = newline === "\r\n" ? normalized.replace(/\n/g, "\r\n") : normalized
  validatePatchedReviewInput(original, patched)

  const temporaryPath = `${absolutePath}.document-fixture.tmp`
  if (fs.existsSync(temporaryPath)) {
    throw new Error(`Temporary review input already exists: ${temporaryPath}`)
  }
  try {
    fs.writeFileSync(temporaryPath, patched, { encoding: UTF8, flag: "wx" })
    const reread = fs.readFileSync(temporaryPath, UTF8)
    validatePatchedReviewInput(original, reread)
    fs.renameSync(temporaryPath, absolutePath)
  } finally {
    fs.rmSync(temporaryPath, { force: true })
  }
}

function assertSingleAnchor(source, anchor, label) {
  const count = source.split(anchor).length - 1
  if (count !== 1) throw new Error(`${label} anchor must occur exactly once; found ${count}`)
}

function validatePatchedReviewInput(original, patched) {
  const required = [
    "docs/input-documents/requirements-and-design.docx",
    "REQ-DOC-001",
    "REQ-DOC-002",
    "BD-DOC-001",
    "docs/input-documents/verification-matrix.xlsx",
    "TC-DOC-001",
    "TC-DOC-002"
  ]
  for (const marker of required) {
    if (patched.split(marker).length - 1 !== 1) {
      throw new Error(`Patched review input must contain exactly one ${marker}`)
    }
  }
  if (patched.includes("supplemental-reference.pdf")) {
    throw new Error("Patched review input must not reference supplemental-reference.pdf")
  }
  for (const invariant of [
    "id: REVIEW-AI-MATRIX-001",
    "base: main",
    "head: feature/ai-verification-matrix",
    "review_focus:",
    "docs/requirements-ai-matrix.md",
    "docs/test-spec-ai-matrix.md"
  ]) {
    if (!original.includes(invariant) || !patched.includes(invariant)) {
      throw new Error(`Review input invariant changed or disappeared: ${invariant}`)
    }
  }
}
```

Add `patchReviewInputAtomic` to `module.exports`.

- [ ] **Step 4: Run the full generator suite and verify GREEN**

Run:

```bash
node --test scripts/real-machine-input-document-fixtures.test.js
```

Expected: all tests pass, including duplicate rejection and original-file preservation.

- [ ] **Step 5: Commit**

```bash
git add \
  tools/real-machine-test-environment/document-fixtures/Generate-InputDocumentFixtures.js \
  scripts/real-machine-input-document-fixtures.test.js
git commit -m "feat: patch document review input atomically"
```

### Task 3: Wire document generation into both existing sandbox launchers

**Files:**
- Modify: `docs/workflows/bazaar-project-rule-review/integration/launch-bob-bazaar-review-sandbox.ps1`
- Modify: `extensions/bob-bazaar-review/test/integrationSandboxScript.test.js`
- Modify: `docs/workflows/code-consistency-review/integration/launch-bob-code-consistency-sandbox.ps1`
- Modify: `extensions/bob-code-consistency-review/test/integrationSandboxScript.test.js`

**Interfaces:**
- Both launchers expose `[switch]$IncludeDocumentFixtures`, defaulting to false.
- Bazaar output: `<SandboxRoot>/input-documents`.
- Code-consistency output: `<SandboxRoot>/workspace/docs/input-documents`.
- Code-consistency permits the switch only with `-Sample ai-verification-matrix`.
- Both launchers invoke the Node generator through a fixed argument array; no shell string or `Invoke-Expression`.
- Code-consistency generation and YAML patching occur before `git init`.

- [ ] **Step 1: Add failing static launcher contracts**

Append to `extensions/bob-bazaar-review/test/integrationSandboxScript.test.js`:

```js
test("Bazaar integration sandbox optionally creates external document inputs", () => {
  const script = fs.readFileSync(scriptPath, "utf8")

  assert.match(script, /\[switch\]\$IncludeDocumentFixtures/)
  assert.match(script, /Generate-InputDocumentFixtures\.js/)
  assert.match(script, /\$DocumentInputDir = Join-Path \$SandboxRoot "input-documents"/)
  assert.match(script, /"--profile", "bazaar-core"/)
  assert.match(script, /"--output", \$DocumentInputDir/)
  assert.match(script, /if \(\$IncludeDocumentFixtures\)/)
  assert.doesNotMatch(script, /Invoke-Expression/)
})
```

Append to `extensions/bob-code-consistency-review/test/integrationSandboxScript.test.js`:

```js
test("integration sandbox optionally seeds office documents before the Git baseline", () => {
  const script = fs.readFileSync(scriptPath, "utf8")

  assert.match(script, /\[switch\]\$IncludeDocumentFixtures/)
  assert.match(script, /IncludeDocumentFixtures requires -Sample ai-verification-matrix/)
  assert.match(script, /Generate-InputDocumentFixtures\.js/)
  assert.match(script, /"--profile", "consistency-ai-matrix"/)
  assert.match(script, /"--review-input", \(Join-Path \$WorkspaceDir "review-input\.yaml"\)/)
  const initializer = script.indexOf("function Initialize-AiVerificationMatrixWorkspace")
  const generation = script.indexOf(
    "Invoke-DocumentFixtureGenerator -RepoRoot $RepoRoot -WorkspaceDir $WorkspaceDir",
    initializer
  )
  const gitInit = script.indexOf('@("init", "-b", "main")', initializer)
  assert.ok(generation >= 0 && gitInit > generation, "document generation must occur before git init")
  assert.doesNotMatch(script, /Invoke-Expression/)
})
```

- [ ] **Step 2: Run both focused launcher tests and verify RED**

Run:

```bash
node --test \
  extensions/bob-bazaar-review/test/integrationSandboxScript.test.js \
  extensions/bob-code-consistency-review/test/integrationSandboxScript.test.js
```

Expected: FAIL because neither launcher exposes `IncludeDocumentFixtures`.

- [ ] **Step 3: Add the Bazaar opt-in switch and fixed generator invocation**

In `launch-bob-bazaar-review-sandbox.ps1`, add the parameter:

```powershell
[switch]$IncludeDocumentFixtures,
```

Keep `SkipExtensionInstall` after it so direct callers remain compatible by name.

After `Write-CodeWorkspaceFile` and before `Write-SandboxReadme`, resolve and call the generator only inside the opt-in branch:

```powershell
if ($IncludeDocumentFixtures) {
  $DocumentFixtureGenerator = Resolve-RequiredPath (
    Join-Path $RepoRoot "tools\real-machine-test-environment\document-fixtures\Generate-InputDocumentFixtures.js"
  ) "Document fixture generator"
  $DocumentInputDir = Join-Path $SandboxRoot "input-documents"
  Invoke-CheckedCommand $NodeCommand @(
    $DocumentFixtureGenerator,
    "--profile", "bazaar-core",
    "--output", $DocumentInputDir
  ) $RepoRoot
}
```

Add to the emitted sandbox summary:

```powershell
if ($IncludeDocumentFixtures) {
  Write-Host "Input documents: $(Join-Path $SandboxRoot 'input-documents')"
}
```

- [ ] **Step 4: Add the code-consistency opt-in gate and pre-baseline generation**

In `launch-bob-code-consistency-sandbox.ps1`, add the parameter:

```powershell
[switch]$IncludeDocumentFixtures,
```

Immediately after `$ErrorActionPreference = "Stop"`, reject unsupported combinations before creating directories:

```powershell
if ($IncludeDocumentFixtures -and $Sample -ne "ai-verification-matrix") {
  throw "IncludeDocumentFixtures requires -Sample ai-verification-matrix"
}
```

Add this helper after `Copy-DirectoryContents`:

```powershell
function Invoke-DocumentFixtureGenerator {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$WorkspaceDir
  )

  $NodeCommand = Resolve-CommandPath "node"
  $GeneratorPath = Resolve-RequiredPath (
    Join-Path $RepoRoot "tools\real-machine-test-environment\document-fixtures\Generate-InputDocumentFixtures.js"
  ) "Document fixture generator"
  Invoke-CheckedCommand $NodeCommand @(
    $GeneratorPath,
    "--profile", "consistency-ai-matrix",
    "--output", (Join-Path $WorkspaceDir "docs\input-documents"),
    "--review-input", (Join-Path $WorkspaceDir "review-input.yaml")
  ) $RepoRoot
}
```

Inside `Initialize-AiVerificationMatrixWorkspace`, after copying `workspace-common` and `baseline` and before `git init`, add:

```powershell
if ($IncludeDocumentFixtures) {
  Invoke-DocumentFixtureGenerator -RepoRoot $RepoRoot -WorkspaceDir $WorkspaceDir
}
```

After workspace generation, print the fixed path:

```powershell
if ($IncludeDocumentFixtures) {
  Write-Host "Input documents: $(Join-Path $WorkspaceDir 'docs\input-documents')"
}
```

- [ ] **Step 5: Run the focused launcher tests and verify GREEN**

Run:

```bash
node --test \
  extensions/bob-bazaar-review/test/integrationSandboxScript.test.js \
  extensions/bob-code-consistency-review/test/integrationSandboxScript.test.js
```

Expected: all launcher contract tests pass.

- [ ] **Step 6: Run the generator directly through the code-consistency ordering contract**

Run:

```powershell
$root = Join-Path $env:TEMP "bob-doc-launcher-contract"
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $root | Out-Null
Copy-Item `
  docs\workflows\code-consistency-review\examples\ai-verification-matrix\fixtures\workspace-common\* `
  $root -Recurse -Force
node tools\real-machine-test-environment\document-fixtures\Generate-InputDocumentFixtures.js `
  --profile consistency-ai-matrix `
  --output "$root\docs\input-documents" `
  --review-input "$root\review-input.yaml"
if (Test-Path "$root\.git") { throw "Generator must not initialize Git" }
if ((Get-Content "$root\review-input.yaml" -Raw) -match "supplemental-reference.pdf") {
  throw "PDF must not be referenced"
}
Remove-Item $root -Recurse -Force
```

Expected: exit code 0; generated files exist during the check; no `.git`; PDF absent from YAML.

- [ ] **Step 7: Commit**

```bash
git add \
  docs/workflows/bazaar-project-rule-review/integration/launch-bob-bazaar-review-sandbox.ps1 \
  extensions/bob-bazaar-review/test/integrationSandboxScript.test.js \
  docs/workflows/code-consistency-review/integration/launch-bob-code-consistency-sandbox.ps1 \
  extensions/bob-code-consistency-review/test/integrationSandboxScript.test.js
git commit -m "feat: seed document fixtures from sandbox launchers"
```

### Task 4: Connect the fixed profiles to the common real-machine environment

**Files:**
- Modify: `tools/real-machine-test-environment/scenarios.json`
- Modify: `tools/real-machine-test-environment/lib/ScenarioManifest.ps1`
- Modify: `tools/real-machine-test-environment/lib/ScenarioExecution.ps1`
- Modify: `tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1`
- Modify: `scripts/real-machine-test-environment.test.js`

**Interfaces:**
- Optional manifest property: `documentFixtureProfile`.
- Allowed mapping: `bazaar-core -> bazaar-core`, `consistency-ai-matrix -> consistency-ai-matrix`.
- `Assert-TestCaseExists` recognizes `PRA-WIN-*` in `project-rule-authoring-windows-uat.md`.
- `New-LauncherInvocation` injects `IncludeDocumentFixtures = $true` only when the property is present.
- `Invoke-DocumentFixtureProfileValidation -RepoRoot -Profile` executes only `node <fixed-generator> --profile <profile> --validate-only`.
- Common `-ValidateOnly` validates selected profiles without creating directories.

- [ ] **Step 1: Add failing repository contracts for the two fixed profiles**

In `scripts/real-machine-test-environment.test.js`, add the PRA specification:

```js
const specs = {
  BZR: read(repoRoot, "extensions", "bob-bazaar-review", "docs", "real-machine-test-spec-ja.md"),
  CCR: read(repoRoot, "extensions", "bob-code-consistency-review", "docs", "real-machine-test-spec-ja.md"),
  PRA: read(repoRoot, "extensions", "bob-bazaar-review", "docs", "project-rule-authoring-windows-uat.md")
}
```

Replace testcase-family selection with:

```js
const family = testCaseId.startsWith("BZR-")
  ? "BZR"
  : testCaseId.startsWith("CCR-")
    ? "CCR"
    : "PRA"
```

Append:

```js
test("only the approved scenarios opt into fixed document profiles", () => {
  const manifest = readJson(manifestPath)
  const mapped = manifest.scenarios
    .filter((scenario) => Object.hasOwn(scenario, "documentFixtureProfile"))
    .map(({ id, documentFixtureProfile }) => [id, documentFixtureProfile])
  assert.deepEqual(mapped, [
    ["bazaar-core", "bazaar-core"],
    ["consistency-ai-matrix", "consistency-ai-matrix"]
  ])

  const bazaar = manifest.scenarios.find(({ id }) => id === "bazaar-core")
  assert.ok(bazaar.testCases.includes("PRA-WIN-001"))
  for (const artifact of [
    "input-documents/project-review-rules.docx",
    "input-documents/review-traceability-ledger.xlsx",
    "input-documents/system-review-guidelines.pdf",
    "input-documents/document-fixture-manifest.json",
    "input-documents/EXPECTED_DOCUMENT_INPUTS.md"
  ]) assert.ok(bazaar.expectedArtifacts.includes(artifact))

  const consistency = manifest.scenarios.find(({ id }) => id === "consistency-ai-matrix")
  assert.ok(consistency.testCases.includes("CCR-RT-019"))
  assert.ok(consistency.testCases.includes("CCR-RT-020"))
  for (const artifact of [
    "workspace/docs/input-documents/requirements-and-design.docx",
    "workspace/docs/input-documents/verification-matrix.xlsx",
    "workspace/docs/input-documents/supplemental-reference.pdf",
    "workspace/docs/input-documents/document-fixture-manifest.json",
    "workspace/docs/input-documents/EXPECTED_DOCUMENT_EXTRACTION.md"
  ]) assert.ok(consistency.expectedArtifacts.includes(artifact))
})

test("runner controls document generation and validates profiles without writes", () => {
  const manifestModule = read(toolRoot, "lib", "ScenarioManifest.ps1")
  const execution = read(toolRoot, "lib", "ScenarioExecution.ps1")
  const runner = read(toolRoot, "Invoke-BobReviewTestEnvironment.ps1")

  assert.match(manifestModule, /documentFixtureProfile/)
  assert.match(manifestModule, /project-rule-authoring-windows-uat\.md/)
  assert.match(execution, /function Invoke-DocumentFixtureProfileValidation/)
  assert.match(execution, /IncludeDocumentFixtures\s*=\s*\$true/)
  assert.match(execution, /"--validate-only"/)
  assert.match(runner, /Invoke-DocumentFixtureProfileValidation/)
  assert.doesNotMatch(JSON.stringify(readJson(manifestPath)), /IncludeDocumentFixtures/)
})
```

- [ ] **Step 2: Run repository contracts and verify RED**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL because `documentFixtureProfile`, `PRA-WIN-001`, the artifacts, and validation helper are absent.

- [ ] **Step 3: Update the two scenario records without changing the six-ID order**

In `tools/real-machine-test-environment/scenarios.json`:

For `bazaar-core`, add:

```json
"documentFixtureProfile": "bazaar-core"
```

Append `PRA-WIN-001` to `testCases`, and append:

```json
"input-documents/project-review-rules.docx",
"input-documents/review-traceability-ledger.xlsx",
"input-documents/system-review-guidelines.pdf",
"input-documents/document-fixture-manifest.json",
"input-documents/EXPECTED_DOCUMENT_INPUTS.md"
```

For `consistency-ai-matrix`, add:

```json
"documentFixtureProfile": "consistency-ai-matrix"
```

Append `CCR-RT-019` and `CCR-RT-020` to `testCases`, and append:

```json
"workspace/docs/input-documents/requirements-and-design.docx",
"workspace/docs/input-documents/verification-matrix.xlsx",
"workspace/docs/input-documents/supplemental-reference.pdf",
"workspace/docs/input-documents/document-fixture-manifest.json",
"workspace/docs/input-documents/EXPECTED_DOCUMENT_EXTRACTION.md"
```

Do not edit the `groups["p0-p1"]` array or add any scenario.

- [ ] **Step 4: Add profile mapping and PRA testcase validation**

At the top of `ScenarioManifest.ps1`, add:

```powershell
$script:AllowedDocumentFixtureProfiles = [ordered]@{
  "bazaar-core" = "bazaar-core"
  "consistency-ai-matrix" = "consistency-ai-matrix"
}
```

Extend `Assert-TestCaseExists`:

```powershell
$specPath = if ($TestCaseId.StartsWith("BZR-")) {
  Join-Path $RepoRoot "extensions/bob-bazaar-review/docs/real-machine-test-spec-ja.md"
} elseif ($TestCaseId.StartsWith("CCR-")) {
  Join-Path $RepoRoot "extensions/bob-code-consistency-review/docs/real-machine-test-spec-ja.md"
} elseif ($TestCaseId.StartsWith("PRA-WIN-")) {
  Join-Path $RepoRoot "extensions/bob-bazaar-review/docs/project-rule-authoring-windows-uat.md"
} else {
  throw "Unsupported testcase prefix: $TestCaseId"
}
```

Inside each scenario validation block, add:

```powershell
if ($scenario.psobject.Properties.Name -contains "documentFixtureProfile") {
  $profile = [string]$scenario.documentFixtureProfile
  if (-not $script:AllowedDocumentFixtureProfiles.Contains([string]$scenarioId)) {
    throw "Scenario is not allowed to declare documentFixtureProfile: $scenarioId"
  }
  $expectedProfile = [string]$script:AllowedDocumentFixtureProfiles[[string]$scenarioId]
  if ($profile -ne $expectedProfile) {
    throw "documentFixtureProfile must be ${expectedProfile} for ${scenarioId}: $profile"
  }
}
```

After the scenario loop, enforce exact coverage:

```powershell
$documentProfileScenarios = @(
  $scenarios | Where-Object { $_.psobject.Properties.Name -contains "documentFixtureProfile" }
)
if ($documentProfileScenarios.Count -ne $script:AllowedDocumentFixtureProfiles.Count) {
  $errors.Add("Exactly two approved documentFixtureProfile mappings are required")
}
```

- [ ] **Step 5: Add controlled launcher injection and validation helper**

In `ScenarioExecution.ps1`, after the base launcher arguments are created, add:

```powershell
if ($Scenario.psobject.Properties.Name -contains "documentFixtureProfile") {
  $arguments.IncludeDocumentFixtures = $true
}
```

Add:

```powershell
function Invoke-DocumentFixtureProfileValidation {
  param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$Profile
  )

  if ($Profile -notin @("bazaar-core", "consistency-ai-matrix")) {
    throw "Unsupported document fixture profile: $Profile"
  }
  $generator = Assert-RepositoryRelativePath `
    $RepoRoot `
    "tools/real-machine-test-environment/document-fixtures/Generate-InputDocumentFixtures.js" `
    "DocumentFixtureGenerator" `
    -MustExist
  $node = Get-Command "node" -ErrorAction SilentlyContinue
  if (-not $node) { throw "Required command not found on PATH: node" }

  $output = @(& $node.Source $generator "--profile" $Profile "--validate-only" 2>&1 |
    ForEach-Object { [string]$_ })
  if ($LASTEXITCODE -ne 0) {
    throw "Document fixture validation failed for ${Profile}: $($output -join ' | ')"
  }
  foreach ($line in $output) { Write-Host $line }
}
```

- [ ] **Step 6: Call profile validation from the write-free runner branch**

In `Invoke-BobReviewTestEnvironment.ps1`, inside the selected-scenario `-ValidateOnly` loop, before post-seed validation, add:

```powershell
if ($validationScenario.psobject.Properties.Name -contains "documentFixtureProfile") {
  Invoke-DocumentFixtureProfileValidation `
    -RepoRoot $RepoRoot `
    -Profile ([string]$validationScenario.documentFixtureProfile)
}
```

- [ ] **Step 7: Run repository and PowerShell validation contracts**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: all repository contracts pass.

Run:

```powershell
$before = @(Get-ChildItem $env:TEMP -Filter "bob-review-real-machine-*" -ErrorAction SilentlyContinue).Count
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
$after = @(Get-ChildItem $env:TEMP -Filter "bob-review-real-machine-*" -ErrorAction SilentlyContinue).Count
if ($after -ne $before) { throw "ValidateOnly created a real-machine output root" }
```

Expected output includes:

```text
Document fixture profile valid: bazaar-core
Document fixture profile valid: consistency-ai-matrix
Manifest validation succeeded: 6 scenarios; selected=6
```

The before/after counts are equal.

- [ ] **Step 8: Commit**

```bash
git add \
  tools/real-machine-test-environment/scenarios.json \
  tools/real-machine-test-environment/lib/ScenarioManifest.ps1 \
  tools/real-machine-test-environment/lib/ScenarioExecution.ps1 \
  tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 \
  scripts/real-machine-test-environment.test.js
git commit -m "feat: enable document profiles in real-machine scenarios"
```

### Task 5: Add operator-facing document checks and Poppler boundaries

**Files:**
- Modify: `tools/real-machine-test-environment/checklists/bazaar-core.md`
- Modify: `tools/real-machine-test-environment/checklists/consistency-ai-matrix.md`
- Modify: `tools/real-machine-test-environment/README-ja.md`
- Modify: `scripts/real-machine-test-environment.test.js`

**Interfaces:**
- Bazaar checklist distinguishes environment readiness from `PRA-WIN-001` result status.
- Code-consistency checklist proves the PDF exists but is absent from YAML and extracted outputs.
- README documents fixture locations, manual hashing, Poppler optionality, and the unchanged `not_run` rule.

- [ ] **Step 1: Add failing documentation contracts**

Append to `scripts/real-machine-test-environment.test.js`:

```js
test("operator docs describe document inputs and the optional Poppler boundary", () => {
  const bazaarChecklist = read(toolRoot, "checklists", "bazaar-core.md")
  for (const pattern of [
    /input-documents/,
    /bobBazaar\.authorProjectRulesFromDocuments/,
    /project-review-rules\.docx/,
    /review-traceability-ledger\.xlsx/,
    /system-review-guidelines\.pdf/,
    /PRA-WIN-001/,
    /Poppler unavailable/,
    /blocked/,
    /bob-managed/,
    /bazaar-source/
  ]) assert.match(bazaarChecklist, pattern)

  const consistencyChecklist = read(toolRoot, "checklists", "consistency-ai-matrix.md")
  for (const pattern of [
    /requirements-and-design\.docx/,
    /verification-matrix\.xlsx/,
    /supplemental-reference\.pdf/,
    /REQ-DOC-001/,
    /REQ-DOC-002/,
    /BD-DOC-001/,
    /TC-DOC-001/,
    /TC-DOC-002/,
    /document-index\.json/,
    /document-excerpts\.md/
  ]) assert.match(consistencyChecklist, pattern)
  assert.match(consistencyChecklist, /PDF.*参照.*しない|参照対象外/)

  const readme = read(toolRoot, "README-ja.md")
  assert.match(readme, /文書fixture/)
  assert.match(readme, /pdftotext/)
  assert.match(readme, /PRA-WIN-001/)
  assert.match(readme, /not_run/)
})
```

- [ ] **Step 2: Run documentation contracts and verify RED**

Run:

```bash
node --test --test-name-pattern="operator docs" scripts/real-machine-test-environment.test.js
```

Expected: FAIL because the current checklists and README do not describe document fixtures.

- [ ] **Step 3: Extend `bazaar-core.md` with exact document operations**

Insert after the existing Shift-JIS operation:

```markdown
7. `{{SCENARIO_ROOT}}\input-documents` に `project-review-rules.docx`、`review-traceability-ledger.xlsx`、`system-review-guidelines.pdf`、manifest、期待値文書があることを確認する。
8. `document-fixture-manifest.json` の SHA-256 と `Get-FileHash -Algorithm SHA256` の結果を照合する。
9. `bobBazaar.authorProjectRulesFromDocuments` を開き、DOCX の heading／paragraph／list／table と、XLSX の `Rules`／`Verification` sheet を確認する。
10. `pdftotext` が利用可能なら PDF を選択し、page 1、empty page 2、page 3 の locator を確認して `PRA-WIN-001` を実測結果どおり `pass` または `fail` にする。
11. `pdftotext` が利用できない場合も環境は `ready` のまま扱い、`PRA-WIN-001` だけを `blocked`、notes を `Poppler unavailable` とする。
12. 選択前に原本が `bob-managed`、`bazaar-source`、`.bob/review/rule-authoring` へコピーされていないことを確認する。
```

- [ ] **Step 4: Extend `consistency-ai-matrix.md` with exact extraction checks**

Insert before the AI result step:

```markdown
3. `review-input.yaml` が `requirements-and-design.docx` と `verification-matrix.xlsx` を参照し、`supplemental-reference.pdf` を参照しないことを確認する。
4. Preprocess 後、`document-index.json` と `document-excerpts.md` に DOCX／XLSX があり、PDF path がないことを確認する。
5. `document-excerpts.md` に `REQ-DOC-001`、`REQ-DOC-002`、`BD-DOC-001`、`TC-DOC-001`、`TC-DOC-002` があることを確認する。
6. XLSX 由来の table evidence と、PDF が抽出対象外であることを確認し、`CCR-RT-019` と `CCR-RT-020` を記録する。
```

Renumber the existing AI/capture/triage steps consecutively.

- [ ] **Step 5: Add README guidance**

Add a `## PDF・Word・Excel の入力fixture` section to `README-ja.md`:

```markdown
## PDF・Word・Excel の入力fixture

`bazaar-core` は `<scenario>\input-documents` に DOCX、XLSX、text PDF を生成します。Project rule authoring では3件をfile pickerから選びます。PDF previewにはPopplerの`pdftotext`が必要ですが、Popplerが無くても環境生成とDOCX／XLSX確認は実行できます。その場合は`PRA-WIN-001`だけを`blocked`、notesを`Poppler unavailable`として記録します。

`consistency-ai-matrix` は `workspace\docs\input-documents` にDOCX、XLSX、PDFを生成します。`review-input.yaml`が参照するのはDOCXとXLSXだけです。`supplemental-reference.pdf`は配置確認用であり、現在のcode-consistency抽出対応を主張しません。

生成物のhashは次で確認します。

```powershell
Get-ChildItem <scenario-document-directory> -File |
  Get-FileHash -Algorithm SHA256 |
  Select-Object Path, Hash
```

環境生成は`operator-result.json`を自動で`pass`にせず、追加された`PRA-WIN-001`、`CCR-RT-019`、`CCR-RT-020`も初期値は`not_run`です。
```

- [ ] **Step 6: Run documentation and full repository contracts**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add \
  tools/real-machine-test-environment/checklists/bazaar-core.md \
  tools/real-machine-test-environment/checklists/consistency-ai-matrix.md \
  tools/real-machine-test-environment/README-ja.md \
  scripts/real-machine-test-environment.test.js
git commit -m "docs: add document fixture operator checks"
```

### Task 6: Verify generated DOCX/XLSX through the current code-consistency extractor

**Files:**
- Create: `extensions/bob-code-consistency-review/test/realMachineDocumentFixtures.test.js`

**Interfaces:**
- The test spawns the repository generator using the current Node executable.
- It copies the approved `ai-verification-matrix/fixtures/workspace-common` directory.
- It parses the patched YAML using the extension’s existing `yaml` dependency.
- It calls the existing `extractDocuments(reviewInput, { workspaceRoot })`.
- It verifies five markers and proves the supplemental PDF is not extracted.

- [ ] **Step 1: Write the failing extractor integration test**

Create `extensions/bob-code-consistency-review/test/realMachineDocumentFixtures.test.js`:

```js
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
```

- [ ] **Step 2: Run the focused extension test and verify RED or the first real compatibility defect**

Run:

```bash
cd extensions/bob-code-consistency-review
npm run compile
node --test test/realMachineDocumentFixtures.test.js
```

Expected before Task 1–4 implementation is present: FAIL because the generator or generated document contract is missing. After those tasks, this command is the first real extractor compatibility check; any failure must be fixed in the generator fixture bytes, not in extension runtime.

- [ ] **Step 3: Correct only generator fixture structure if the extractor exposes a compatibility defect**

Use these diagnosis rules:

```text
mammoth cannot open DOCX
  -> inspect [Content_Types].xml, _rels/.rels, word/document.xml, word/styles.xml

read-excel-file cannot open XLSX
  -> inspect workbook relationship IDs, sheet paths, inline string cells, and content-type overrides

expected marker missing
  -> keep the extension unchanged; move the marker into a heading, paragraph, or row that the existing extractor already supports

PDF appears in extraction
  -> fix review-input patching; do not add a PDF filter to extension runtime
```

Add a regression assertion to `scripts/real-machine-input-document-fixtures.test.js` for the exact generator defect before changing generator code.

- [ ] **Step 4: Run the focused integration test and full extension suite**

Run:

```bash
cd extensions/bob-code-consistency-review
npm test
```

Expected: compile succeeds and all `test/*.test.js`, including `realMachineDocumentFixtures.test.js`, pass.

- [ ] **Step 5: Commit**

```bash
git add \
  extensions/bob-code-consistency-review/test/realMachineDocumentFixtures.test.js \
  tools/real-machine-test-environment/document-fixtures/Generate-InputDocumentFixtures.js \
  scripts/real-machine-input-document-fixtures.test.js
git commit -m "test: verify generated office document extraction"
```

### Task 7: Update CI and record implementation verification

**Files:**
- Modify: `.github/workflows/extensions-quality.yml`
- Modify: `scripts/real-machine-test-environment.test.js`
- Create: `docs/implementation/bob-review-input-document-fixtures-verification-2026-07-20.md`

**Interfaces:**
- Windows job runs both repository test files in one `node --test` command.
- It continues to run write-free PowerShell `-ValidateOnly`.
- It does not install Office, LibreOffice, Poppler, or new npm packages.
- Verification documentation distinguishes automated evidence from pending operator UAT.

- [ ] **Step 1: Add the failing CI command contract**

In the existing README/CI test in `scripts/real-machine-test-environment.test.js`, replace the single-file command assertion with:

```js
assert.match(
  workflow,
  /node --test scripts\/real-machine-test-environment\.test\.js scripts\/real-machine-input-document-fixtures\.test\.js/
)
```

Add:

```js
const job = workflow.split("  real-machine-environment-contracts:")[1].split("  extension-metrics:")[0]
assert.doesNotMatch(
  job,
  /office|libreoffice|poppler|pdftotext|npm (?:ci|install)|npm\.cmd run package|vscode-test|\bbzr\b|IBM Bob/i
)
```

- [ ] **Step 2: Run the repository contract and verify RED**

Run:

```bash
node --test scripts/real-machine-test-environment.test.js
```

Expected: FAIL because CI still runs only the original repository test file.

- [ ] **Step 3: Update the Windows contract command**

In `.github/workflows/extensions-quality.yml`, change:

```yaml
- name: Verify repository contracts
  run: node --test scripts/real-machine-test-environment.test.js
```

to:

```yaml
- name: Verify repository contracts
  run: node --test scripts/real-machine-test-environment.test.js scripts/real-machine-input-document-fixtures.test.js
```

Keep the existing Node 22 setup and PowerShell `-ValidateOnly` step unchanged.

- [ ] **Step 4: Run all local executable verification**

From repository root:

```bash
node --test scripts/real-machine-test-environment.test.js scripts/real-machine-input-document-fixtures.test.js
```

Expected: all repository tests pass.

```powershell
pwsh -NoProfile -File tools\real-machine-test-environment\Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly
```

Expected: both document profiles and all six scenarios validate without writing output roots.

```bash
cd extensions/bob-bazaar-review
npm test
```

Expected: full Bazaar extension suite passes, including the launcher contract.

```bash
cd ../bob-code-consistency-review
npm test
```

Expected: full code-consistency suite passes, including generated DOCX/XLSX extraction.

- [ ] **Step 5: Perform two no-GUI launcher smoke runs only after all existing packaging and CLI prerequisites exist**

On Windows, after the three existing VSIX files and `bob2/bob-code` are present, run:

```powershell
$bazaarRoot = Join-Path $env:TEMP "bob-bazaar-document-fixture-smoke"
Remove-Item $bazaarRoot -Recurse -Force -ErrorAction SilentlyContinue
pwsh -NoProfile -File `
  docs\workflows\bazaar-project-rule-review\integration\launch-bob-bazaar-review-sandbox.ps1 `
  -SandboxRoot $bazaarRoot `
  -NoLaunch `
  -IncludeDocumentFixtures
Get-ChildItem "$bazaarRoot\input-documents" -File
```

Expected: the five Bazaar document artifacts exist and the launcher does not open VS Code.

```powershell
$consistencyRoot = Join-Path $env:TEMP "bob-consistency-document-fixture-smoke"
Remove-Item $consistencyRoot -Recurse -Force -ErrorAction SilentlyContinue
pwsh -NoProfile -File `
  docs\workflows\code-consistency-review\integration\launch-bob-code-consistency-sandbox.ps1 `
  -SandboxRoot $consistencyRoot `
  -Sample ai-verification-matrix `
  -NoLaunch `
  -IncludeDocumentFixtures
git -C "$consistencyRoot\workspace" status --porcelain
Select-String `
  -Path "$consistencyRoot\workspace\review-input.yaml" `
  -Pattern "requirements-and-design.docx|verification-matrix.xlsx|supplemental-reference.pdf"
```

Expected: Git status is empty; DOCX and XLSX paths are found; PDF path is not found.

If local VSIX/Bob prerequisites are absent, do not mark these smoke runs as passed; record them as not executed and rely only on the automated contracts.

- [ ] **Step 6: Create the verification report from actual command output**

Create `docs/implementation/bob-review-input-document-fixtures-verification-2026-07-20.md` with these exact sections:

```markdown
# Bob Review Input Document Fixtures Verification

## Scope

This record covers deterministic synthetic DOCX/XLSX/PDF generation, launcher opt-in wiring, common runner validation, and code-consistency DOCX/XLSX extraction. It does not claim Microsoft Office compatibility, Poppler PDF extraction, GUI behavior, or AI semantic review.

## Revision

Record the tested branch name and exact `git rev-parse HEAD` value.

## Automated commands

For each command, record the command, exit code, pass/fail count, and the concise final output lines:

- `node --test scripts/real-machine-test-environment.test.js scripts/real-machine-input-document-fixtures.test.js`
- `pwsh -NoProfile -File tools/real-machine-test-environment/Invoke-BobReviewTestEnvironment.ps1 -ValidateOnly`
- `npm test` in `extensions/bob-bazaar-review`
- `npm test` in `extensions/bob-code-consistency-review`

## Determinism evidence

Record the generator version, profile names, binary logical names, and SHA-256 values produced by two independent temporary generations. Do not record temporary absolute paths.

## Launcher smoke evidence

Record `pass`, `fail`, or `not executed` separately for Bazaar and code-consistency no-GUI smoke. Include only logical artifact names, Git clean status, and whether the PDF path was absent from review-input.

## Pending manual UAT

Keep these explicitly pending until measured on a Windows operator machine:

- `PRA-WIN-001` DOCX/XLSX/PDF file-picker and page locator behavior
- `CCR-RT-019` GUI/workflow DOCX extraction
- `CCR-RT-020` GUI/workflow XLSX extraction
- Poppler availability and PDF preview
- Original-document non-copy behavior after authoring interaction
- Developer Tools Console inspection
```

Replace the prose instructions in the finished document with the actual observed values. Do not include secrets, usernames, hostnames, absolute temporary paths, document text, or raw model output.

- [ ] **Step 7: Verify GitHub Actions for the final implementation commit**

After pushing the final implementation commit, inspect the PR’s `extensions-quality` workflow. Required job conclusions:

```text
Real-machine environment contracts: success
bob-bazaar-review: success
bob-code-consistency-review: success
```

A cancelled run caused by a newer push is not evidence; use the latest completed run for the final commit.

- [ ] **Step 8: Commit**

```bash
git add \
  .github/workflows/extensions-quality.yml \
  scripts/real-machine-test-environment.test.js \
  docs/implementation/bob-review-input-document-fixtures-verification-2026-07-20.md
git commit -m "ci: verify review document fixture environments"
```

## Final Review Checklist

Before requesting final review, verify every item against the diff and fresh command output:

- [ ] The scenario list is still exactly six IDs in the original order.
- [ ] Only `bazaar-core` and `consistency-ai-matrix` declare `documentFixtureProfile`.
- [ ] No generated DOCX, XLSX, or PDF is tracked by Git.
- [ ] The generator uses no npm dependency and embeds no timestamp, username, hostname, or absolute path.
- [ ] Both profiles produce deterministic SHA-256 values across two directories.
- [ ] Manifest hashes and byte sizes match all three binary files.
- [ ] Bazaar inputs are outside `bob-managed` and `bazaar-source`.
- [ ] Code-consistency YAML references DOCX/XLSX and not PDF.
- [ ] Code-consistency Git working tree is clean after launcher generation.
- [ ] `IncludeDocumentFixtures` is injected only by the common runner or explicit direct launcher use.
- [ ] `-ValidateOnly` creates no output root, binaries, or temporary YAML.
- [ ] Poppler absence does not block environment generation.
- [ ] `PRA-WIN-001`, `CCR-RT-019`, and `CCR-RT-020` remain `not_run` until a human records results.
- [ ] Existing launcher tests pass without changing the default layout.
- [ ] Repository contracts, both extension suites, and final CI jobs are green.
- [ ] Verification documentation does not claim unperformed Office, Poppler, GUI, or AI UAT.
