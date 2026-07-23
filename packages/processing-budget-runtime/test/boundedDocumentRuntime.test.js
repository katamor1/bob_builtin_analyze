"use strict"

const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const runtime = require("../runtime/bounded-document-runtime")
const { FakeLedger, buildZip, entry } = require("./helpers/boundedDocumentFixtures")
const { crc32 } = runtime.__test

async function temporaryDirectory(t, prefix = "bounded-document-") {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  return directory
}

function docx(overrides = {}) {
  return buildZip([
    entry("[Content_Types].xml", "types", 0, overrides.contentTypes),
    entry("word/document.xml", "document", overrides.method ?? 8, overrides.document)
  ], crc32)
}

function xlsx() {
  return buildZip([
    entry("[Content_Types].xml", "types", 8),
    entry("xl/workbook.xml", "workbook", 8)
  ], crc32)
}

test("bounded read reserves before I/O, commits exact bytes, and owns returned content", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "rules.docx")
  await fs.writeFile(filePath, "abc終端")
  const ledger = new FakeLedger()
  let reservedBeforeRead = false
  const snapshot = await runtime.readBoundedDocumentFile({
    filePath,
    rootPath: directory,
    target: "document:rules.docx",
    ledger,
    maximumFileBytes: 1024
  }, {
    afterReserve() { reservedBeforeRead = ledger.events[0]?.[0] === "reserve" }
  })

  assert.equal(reservedBeforeRead, true)
  assert.equal(snapshot.byteLength, Buffer.byteLength("abc終端"))
  assert.equal(snapshot.sha256, crypto.createHash("sha256").update("abc終端").digest("hex"))
  const copy = snapshot.copyBytes()
  copy[0] = 0
  assert.equal(Buffer.from(snapshot.copyBytes()).toString("utf8"), "abc終端")
  assert.deepEqual(ledger.events.map((event) => event[0]), ["reserve", "commit"])
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.identity), true)
})

test("bounded read releases reservations on growth and short reads", async (t) => {
  const directory = await temporaryDirectory(t)
  for (const mode of ["grow", "shrink"]) {
    const filePath = path.join(directory, `${mode}.docx`)
    await fs.writeFile(filePath, Buffer.alloc(64, 0x61))
    const ledger = new FakeLedger()
    await assert.rejects(
      runtime.readBoundedDocumentFile({ filePath, rootPath: directory, target: mode, ledger, maximumFileBytes: 1024 }, {
        async afterReserve() {
          if (mode === "grow") await fs.appendFile(filePath, "x")
          else await fs.truncate(filePath, 8)
        }
      }),
      (error) => ["bounded_document_grew", "bounded_document_short_read", "bounded_document_identity_changed"].includes(error?.code)
    )
    assert.equal(ledger.committed, 0)
    assert.equal(ledger.reserved, 0)
    assert.deepEqual(ledger.events.map((event) => event[0]), ["reserve", "release"])
  }
})

test("bounded read preserves budget errors and rejects oversize files before allocation", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "large.docx")
  await fs.writeFile(filePath, "abc")
  const ledger = new FakeLedger({ perTarget: 2 })
  await assert.rejects(
    runtime.readBoundedDocumentFile({ filePath, rootPath: directory, target: "budget", ledger, maximumFileBytes: 1024 }),
    (error) => error?.code === "processing_budget_exceeded"
  )
  assert.equal(ledger.events.length, 0)
  await assert.rejects(
    runtime.readBoundedDocumentFile({ filePath, rootPath: directory, target: "hard-cap", ledger: new FakeLedger(), maximumFileBytes: 2 }),
    (error) => error?.code === "processing_budget_exceeded"
  )
})

test("bounded read rejects symlink, containment escape, and later named-path replacement", async (t) => {
  const root = await temporaryDirectory(t, "bounded-root-")
  const outside = await temporaryDirectory(t, "bounded-outside-")
  const outsideFile = path.join(outside, "outside.docx")
  await fs.writeFile(outsideFile, "outside")
  const linked = path.join(root, "linked.docx")
  try {
    await fs.symlink(outsideFile, linked)
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error?.code)) {
      t.skip("symlink creation is unavailable")
      return
    }
    throw error
  }
  await assert.rejects(
    runtime.readBoundedDocumentFile({ filePath: linked, rootPath: root, target: "link", ledger: new FakeLedger() }),
    (error) => error?.code === "bounded_document_symlink"
  )
  await assert.rejects(
    runtime.readBoundedDocumentFile({ filePath: outsideFile, rootPath: root, target: "escape", ledger: new FakeLedger() }),
    (error) => error?.code === "bounded_document_escape"
  )

  const current = path.join(root, "current.docx")
  await fs.writeFile(current, "current")
  const snapshot = await runtime.readBoundedDocumentFile({ filePath: current, rootPath: root, target: "current", ledger: new FakeLedger() })
  const replacement = path.join(root, "replacement.docx")
  await fs.writeFile(replacement, "replacement")
  await fs.rename(replacement, current)
  await assert.rejects(snapshot.assertCurrent(), (error) => error?.code === "bounded_document_identity_changed")
})

test("valid stored DOCX and deflated XLSX commit actual expanded bytes", () => {
  for (const [kind, archive] of [["docx", docx()], ["xlsx", xlsx()]]) {
    const ledger = new FakeLedger({ perTarget: 1024, total: 4096 })
    const result = runtime.preflightOoxmlArchive({
      archiveBytes: archive,
      target: kind,
      ledger,
      expectedKind: kind,
      maximumEntries: 10,
      maximumEntryBytes: 1024,
      maximumExpandedBytes: 4096
    })
    assert.equal(result.documentKind, kind)
    assert.equal(ledger.committed, result.expandedBytes)
    assert.equal(ledger.reserved, 0)
    assert.ok(result.entries.every((record) => record.crc32.length === 8 && Object.isFrozen(record)))
  }
})

test("OOXML preflight rejects excessive entries and duplicate canonical names before reservations", () => {
  const excessive = new FakeLedger()
  assert.throws(
    () => runtime.preflightOoxmlArchive({ archiveBytes: docx(), target: "entries", ledger: excessive, expectedKind: "docx", maximumEntries: 1 }),
    (error) => error?.code === "archive_entry_count_exceeded"
  )
  assert.equal(excessive.events.length, 0)

  const duplicate = buildZip([
    entry("[Content_Types].xml", "types", 0),
    entry("word/", "", 0),
    entry("word", "", 0),
    entry("word/document.xml", "document", 0)
  ], crc32)
  const duplicateLedger = new FakeLedger()
  assert.throws(
    () => runtime.preflightOoxmlArchive({ archiveBytes: duplicate, target: "duplicate", ledger: duplicateLedger, expectedKind: "docx" }),
    (error) => error?.code === "archive_duplicate_entry"
  )
  assert.equal(duplicateLedger.events.length, 0)
})

test("OOXML preflight releases open reservations for entry, aggregate, CRC, and expansion failures", () => {
  const cases = [
    {
      archive: docx({ contentTypes: { declaredUncompressedSize: 5 } }),
      ledger: new FakeLedger({ perTarget: 4, total: 100 }),
      codes: ["processing_budget_exceeded"]
    },
    {
      archive: docx(),
      ledger: new FakeLedger({ perTarget: 100, total: 6 }),
      codes: ["processing_budget_exceeded"]
    },
    {
      archive: docx({ document: { crc32: 0x12345678 } }),
      ledger: new FakeLedger({ perTarget: 1024, total: 4096 }),
      codes: ["archive_crc_mismatch"]
    },
    {
      archive: docx({ document: { declaredUncompressedSize: 1 } }),
      ledger: new FakeLedger({ perTarget: 1024, total: 4096 }),
      codes: ["archive_inflate_failed", "archive_expanded_size_mismatch"]
    }
  ]
  for (const item of cases) {
    assert.throws(
      () => runtime.preflightOoxmlArchive({ archiveBytes: item.archive, target: "failure", ledger: item.ledger, expectedKind: "docx" }),
      (error) => item.codes.includes(error?.code)
    )
    assert.equal(item.ledger.committed, 0)
    assert.equal(item.ledger.reserved, 0)
  }
})

test("OOXML preflight rejects ZIP64 extras, missing or ambiguous roots, and kind mismatch without commits", () => {
  const zip64 = Buffer.alloc(4)
  zip64.writeUInt16LE(0x0001, 0)
  const invalid = [
    [docx({ contentTypes: { extra: zip64 } }), ["archive_zip64_unsupported"], "docx"],
    [buildZip([entry("[Content_Types].xml", "types", 0)], crc32), ["ooxml_kind_invalid"], undefined],
    [buildZip([entry("[Content_Types].xml", "types", 0), entry("word/document.xml", "x", 0), entry("xl/workbook.xml", "x", 0)], crc32), ["ooxml_kind_invalid"], undefined],
    [docx(), ["ooxml_kind_mismatch"], "xlsx"]
  ]
  for (const [archive, codes, expectedKind] of invalid) {
    const ledger = new FakeLedger()
    assert.throws(
      () => runtime.preflightOoxmlArchive({ archiveBytes: archive, target: "invalid", ledger, expectedKind }),
      (error) => codes.includes(error?.code)
    )
    assert.equal(ledger.committed, 0)
    assert.equal(ledger.reserved, 0)
  }
})

test("OOXML snapshots own archive bytes and expose copy-only frozen results", () => {
  const archive = docx()
  const result = runtime.preflightOoxmlArchive({ archiveBytes: archive, target: "copy", ledger: new FakeLedger(), expectedKind: "docx" })
  archive.fill(0)
  const copy = result.copyEntry("word/document.xml")
  copy[0] = 0
  assert.equal(Buffer.from(result.copyEntry("word/document.xml")).toString(), "document")
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.entries), true)
})
