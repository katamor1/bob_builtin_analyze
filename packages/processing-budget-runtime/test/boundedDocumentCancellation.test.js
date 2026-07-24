"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { FakeLedger } = require("./helpers/boundedDocumentFixtures")
const { readBoundedDocumentFile } = require("../runtime/bounded-file")

test("bounded document reads observe cancellation between chunks and release their reservation", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "processing-budget-cancel-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "large.docx")
  await fs.writeFile(filePath, Buffer.alloc(64 * 1024, 0x61))
  const ledger = new FakeLedger()
  const controller = new AbortController()
  const reason = new Error("operator cancelled document read")

  await assert.rejects(
    () => readBoundedDocumentFile({
      filePath,
      rootPath: directory,
      target: "cancelled-document",
      ledger,
      maximumFileBytes: 128 * 1024,
      signal: controller.signal
    }, {
      afterReadChunk: async () => controller.abort(reason)
    }),
    (error) => error === reason
  )

  assert.deepEqual(ledger.events.map((event) => event[0]), ["reserve", "release"])
})

test("a pre-cancelled bounded document read performs no reservation", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "processing-budget-pre-cancel-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "input.docx")
  await fs.writeFile(filePath, "bounded")
  const ledger = new FakeLedger()
  const controller = new AbortController()
  const reason = new Error("cancelled before document read")
  controller.abort(reason)

  await assert.rejects(
    () => readBoundedDocumentFile({
      filePath,
      rootPath: directory,
      target: "pre-cancelled-document",
      ledger,
      maximumFileBytes: 1024,
      signal: controller.signal
    }),
    (error) => error === reason
  )
  assert.deepEqual(ledger.events, [])
})
