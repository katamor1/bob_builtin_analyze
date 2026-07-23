"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")
const { FakeLedger } = require("./helpers/boundedDocumentFixtures")

const engine = require("../runtime/bounded-document-runtime")

test("OOXML preflight rejects compressed archive bytes above the input cap before reservations", () => {
  const ledger = new FakeLedger()
  assert.throws(
    () => engine.preflightOoxmlArchive({
      archiveBytes: new Uint8Array(3),
      target: "oversized-archive",
      ledger,
      maximumArchiveBytes: 2
    }),
    (error) => error?.code === "processing_budget_exceeded" && error?.details?.observed === 3
  )
  assert.equal(ledger.events.length, 0)
})
