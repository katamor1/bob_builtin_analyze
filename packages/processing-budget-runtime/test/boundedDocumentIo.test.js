"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { FakeLedger, buildZip, entry } = require("./helpers/boundedDocumentFixtures")

function loadApi() {
  delete require.cache[require.resolve("../out")]
  return require("../out")
}

test("public facade reads immutable snapshots and clamps caller-raised hard caps", async (t) => {
  const api = loadApi()
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "processing-budget-io-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "input.docx")
  await fs.writeFile(filePath, "bounded")
  const ledger = new FakeLedger()
  const snapshot = await api.readBoundedDocumentFile({
    filePath,
    rootPath: directory,
    target: "fixture",
    ledger,
    maximumFileBytes: Number.MAX_SAFE_INTEGER
  })
  assert.equal(Buffer.from(snapshot.copyBytes()).toString(), "bounded")
  assert.equal(snapshot.sha256.length, 64)
  await snapshot.assertCurrent()
  assert.deepEqual(ledger.events.map((event) => event[0]), ["reserve", "commit"])
})

test("public facade preflights OOXML and debits actual expansion", () => {
  const api = loadApi()
  const engine = require("../runtime/bounded-document-runtime")
  const archive = buildZip([
    entry("[Content_Types].xml", "types", 0),
    entry("word/document.xml", "document", 8)
  ], engine.__test.crc32)
  const ledger = new FakeLedger()
  const result = api.preflightOoxmlArchive({
    archiveBytes: archive,
    target: "fixture-docx",
    ledger,
    expectedKind: "docx",
    maximumEntryBytes: Number.MAX_SAFE_INTEGER,
    maximumExpandedBytes: Number.MAX_SAFE_INTEGER
  })
  assert.equal(result.documentKind, "docx")
  assert.equal(Buffer.from(result.copyEntry("word/document.xml")).toString(), "document")
  assert.equal(ledger.committed, result.expandedBytes)
})
