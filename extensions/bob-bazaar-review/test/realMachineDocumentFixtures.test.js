const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { createHash } = require("node:crypto")
const { test } = require("node:test")

const { extractRuleDocuments } = require("../out/ruleAuthoring/extraction/documentExtractor")

const repoRoot = path.resolve(__dirname, "..", "..", "..")
const generatorPath = path.join(
  repoRoot,
  "tools",
  "real-machine-test-environment",
  "document-fixtures",
  "Generate-InputDocumentFixtures.js"
)

test("real-machine bazaar-core DOCX and minimal XLSX retain distinct extracted rule evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bob-bazaar-real-machine-docs-"))
  const output = path.join(root, "documents")
  try {
    const generated = childProcess.spawnSync(process.execPath, [
      generatorPath,
      "--profile", "bazaar-core",
      "--output", output
    ], {
      cwd: repoRoot,
      encoding: "utf8"
    })
    assert.equal(generated.status, 0, generated.stdout + generated.stderr)

    const fixtureManifest = JSON.parse(
      fs.readFileSync(path.join(output, "document-fixture-manifest.json"), "utf8")
    )
    const recordsByType = new Map(fixtureManifest.files.map((record) => [record.mediaType, record]))
    const docxRecord = recordsByType.get("docx")
    const xlsxRecord = recordsByType.get("xlsx")
    assert.ok(docxRecord)
    assert.ok(xlsxRecord)

    const expectedRuleSelectors = [
      "RULE-DOC-001",
      "RULE-DOC-002",
      "RULE-DOC-003",
      "RULE-DOC-004"
    ]
    assert.deepEqual(docxRecord.expectedSelectors, expectedRuleSelectors)
    assert.deepEqual(xlsxRecord.expectedSelectors, expectedRuleSelectors)
    assert.deepEqual(xlsxRecord.expectedLocators, ["Rules", "Verification"])

    const beforeWorkspace = snapshotWorkspace(output)

    const batch = await extractRuleDocuments([
      { filePath: path.join(output, docxRecord.logicalName) },
      { filePath: path.join(output, xlsxRecord.logicalName) }
    ])

    const documentsByName = new Map(batch.documents.map((document) => [document.logicalName, document]))
    const sourcesByName = new Map(batch.manifest.sources.map((source) => [source.logical_name, source]))
    const docxSource = sourcesByName.get(docxRecord.logicalName)
    const xlsxSource = sourcesByName.get(xlsxRecord.logicalName)
    assert.ok(docxSource)
    assert.ok(xlsxSource)
    assert.notEqual(docxSource.source_id, xlsxSource.source_id)
    assert.notEqual(docxSource.sha256, xlsxSource.sha256)

    for (const record of [docxRecord, xlsxRecord]) {
      const document = documentsByName.get(record.logicalName)
      const source = sourcesByName.get(record.logicalName)
      assert.ok(document)
      assert.ok(source)
      assert.equal(document.status, "success")
      assert.ok(document.chunks.length > 0)
      const sourceText = batch.aiChunks
        .filter((chunk) => chunk.source_id === source.source_id)
        .map((chunk) => chunk.text)
        .join("\n")
      assert.ok(sourceText.length > 0)
      for (const selector of record.expectedSelectors) assert.match(sourceText, new RegExp(selector))
    }

    const xlsxLocators = batch.aiChunks
      .filter((chunk) => chunk.source_id === xlsxSource.source_id)
      .map((chunk) => chunk.locator.sheet)
    assert.deepEqual([...new Set(xlsxLocators)].sort(), ["Rules", "Verification"])
    for (const locator of xlsxRecord.expectedLocators) assert.ok(xlsxLocators.includes(locator))
    assert.deepEqual(snapshotWorkspace(output), beforeWorkspace)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function snapshotWorkspace(root) {
  const rootStats = fs.statSync(root, { bigint: true })
  const snapshot = [{
    path: ".",
    type: "directory",
    device: rootStats.dev.toString(10),
    inode: rootStats.ino.toString(10),
    mtimeNs: rootStats.mtimeNs.toString(10),
    ctimeNs: rootStats.ctimeNs.toString(10)
  }]
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name)
      const relativePath = path.relative(root, absolutePath).split(path.sep).join("/")
      const stats = fs.statSync(absolutePath, { bigint: true })
      if (entry.isDirectory()) {
        snapshot.push({
          path: relativePath,
          type: "directory",
          device: stats.dev.toString(10),
          inode: stats.ino.toString(10),
          mtimeNs: stats.mtimeNs.toString(10),
          ctimeNs: stats.ctimeNs.toString(10)
        })
        visit(absolutePath)
      } else {
        const bytes = fs.readFileSync(absolutePath)
        snapshot.push({
          path: relativePath,
          type: "file",
          device: stats.dev.toString(10),
          inode: stats.ino.toString(10),
          byteSize: stats.size.toString(10),
          mtimeNs: stats.mtimeNs.toString(10),
          ctimeNs: stats.ctimeNs.toString(10),
          sha256: createHash("sha256").update(bytes).digest("hex")
        })
      }
    }
  }
  visit(root)
  return snapshot.sort((left, right) => left.path.localeCompare(right.path))
}
