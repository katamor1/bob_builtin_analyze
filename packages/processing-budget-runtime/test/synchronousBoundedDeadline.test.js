"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { createCancellationScope } = require("../runtime/deadline-cancellation")
const { readBoundedDocumentFile } = require("../runtime/bounded-file")
const { __test, preflightOoxmlArchive } = require("../runtime/bounded-document-runtime")
const { FakeLedger, buildZip, entry } = require("./helpers/boundedDocumentFixtures")

function dormantDeadlineScope(nowValue) {
  let now = nowValue
  const scope = createCancellationScope({
    deadline: Object.freeze({ expires_at_monotonic_ms: nowValue + 100 }),
    now: () => now,
    schedule: () => 1,
    cancelSchedule: () => {}
  })
  return {
    scope,
    expire: () => { now = nowValue + 101 }
  }
}

function expectDeadlineCancellation(error) {
  return error?.code === "processing_cancelled" && error.kind === "deadline"
}

test("bounded file read observes a trusted deadline synchronously between chunks", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "processing-budget-sync-file-deadline-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "input.docx")
  await fs.writeFile(filePath, Buffer.alloc(64 * 1024, 0x61))
  const ledger = new FakeLedger()
  const { scope, expire } = dormantDeadlineScope(100)
  t.after(() => scope.dispose())

  await assert.rejects(
    () => readBoundedDocumentFile({
      filePath,
      rootPath: directory,
      target: "synchronous-file-deadline",
      ledger,
      maximumFileBytes: 128 * 1024,
      signal: scope.signal
    }, {
      afterReserve: async () => expire()
    }),
    expectDeadlineCancellation
  )

  assert.deepEqual(ledger.events.map((event) => event[0]), ["reserve", "release"])
  assert.equal(ledger.committed, 0)
})

test("OOXML preflight observes a trusted deadline synchronously before further reservations", () => {
  const ledger = new FakeLedger()
  const reserveForTarget = ledger.reserveForTarget.bind(ledger)
  const { scope, expire } = dormantDeadlineScope(200)
  let reservationCount = 0
  ledger.reserveForTarget = (...args) => {
    const reservation = reserveForTarget(...args)
    reservationCount += 1
    if (reservationCount === 1) expire()
    return reservation
  }

  const archiveBytes = buildZip([
    entry("[Content_Types].xml", "<Types/>", 0),
    entry("word/document.xml", "<document/>", 0)
  ], __test.crc32)

  try {
    assert.throws(
      () => preflightOoxmlArchive({
        archiveBytes,
        target: "synchronous-ooxml-deadline",
        ledger,
        expectedKind: "docx",
        signal: scope.signal
      }),
      expectDeadlineCancellation
    )
  } finally {
    scope.dispose()
  }

  assert.equal(reservationCount, 1)
  assert.deepEqual(ledger.events.map((event) => event[0]), ["reserve", "release"])
  assert.equal(ledger.committed, 0)
})
