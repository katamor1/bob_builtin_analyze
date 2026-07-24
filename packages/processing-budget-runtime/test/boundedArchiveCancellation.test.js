"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const { FakeLedger, buildZip, entry } = require("./helpers/boundedDocumentFixtures")
const { __test, preflightOoxmlArchive } = require("../runtime/bounded-document-runtime")

function docxArchive(extraEntries = 0) {
  return buildZip([
    entry("[Content_Types].xml", "<Types/>", 0),
    entry("word/document.xml", "<document/>", 0),
    ...Array.from({ length: extraEntries }, (_, index) => entry(`word/item-${index}.xml`, `<item>${index}</item>`, 0))
  ], __test.crc32)
}

function expectUserCancellation(originalReason) {
  return (error) => error?.code === "processing_cancelled"
    && error.kind === "user"
    && error.original_reason === originalReason
}

test("a pre-cancelled OOXML preflight clones no bytes and reserves nothing", () => {
  const ledger = new FakeLedger()
  const controller = new AbortController()
  const reason = new Error("cancelled before archive preflight")
  controller.abort(reason)

  assert.throws(
    () => preflightOoxmlArchive({
      archiveBytes: docxArchive(),
      target: "cancelled-docx",
      ledger,
      expectedKind: "docx",
      signal: controller.signal
    }),
    expectUserCancellation(reason)
  )
  assert.deepEqual(ledger.events, [])
})

test("OOXML preflight observes cancellation during entry processing and releases reservations", () => {
  const ledger = new FakeLedger()
  const reason = new Error("cancelled during archive preflight")
  let reads = 0
  const signal = {
    get aborted() {
      reads += 1
      return reads >= 12
    },
    reason
  }

  assert.throws(
    () => preflightOoxmlArchive({
      archiveBytes: docxArchive(24),
      target: "mid-cancelled-docx",
      ledger,
      expectedKind: "docx",
      signal
    }),
    expectUserCancellation(reason)
  )
  assert.ok(reads >= 12)
  assert.ok(ledger.events.some((event) => event[0] === "reserve"))
  assert.equal(ledger.reserved, 0)
  assert.ok(ledger.events.some((event) => event[0] === "release"))
})
