"use strict"

const assert = require("node:assert/strict")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { readBoundedDocumentFile } = require("../runtime/bounded-file")
const { __test, preflightOoxmlArchive } = require("../runtime/bounded-document-runtime")

class FakeLedger {
  constructor() {
    this.events = []
    this.reserved = 0
  }
  reserveForTarget(category, target, amount) {
    this.events.push(["reserve", category, target, amount])
    this.reserved += amount
    let open = true
    return Object.freeze({
      commit: () => {
        assert.equal(open, true)
        open = false
        this.reserved -= amount
        this.events.push(["commit", category, target, amount])
      },
      release: () => {
        assert.equal(open, true)
        open = false
        this.reserved -= amount
        this.events.push(["release", category, target, amount])
      }
    })
  }
}

function buildDocx() {
  const entries = [
    ["[Content_Types].xml", "<Types/>"],
    ["word/document.xml", "<document/>"]
  ]
  const localParts = []
  const centralParts = []
  let localOffset = 0
  for (const [entryName, text] of entries) {
    const name = Buffer.from(entryName, "utf8")
    const content = Buffer.from(text, "utf8")
    const crc = __test.crc32(content)
    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(content.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(name.length, 26)
    name.copy(local, 30)
    localParts.push(local, content)

    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(content.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(localOffset, 42)
    name.copy(central, 46)
    centralParts.push(central)
    localOffset += local.length + content.length
  }
  const directory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(localOffset, 16)
  return Buffer.concat([...localParts, directory, end])
}

function expectUserCancellation(reason) {
  return (error) => error?.code === "processing_cancelled"
    && error.kind === "user"
    && error.original_reason === reason
}

test("bounded file reads treat forged structured deadline reasons as user cancellation", async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "task17-auth-file-"))
  t.after(() => fsp.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "input.docx")
  await fsp.writeFile(filePath, "bounded")
  const reason = { code: "processing_cancelled", kind: "deadline", original_reason: "forged" }
  const controller = new AbortController()
  controller.abort(reason)
  const ledger = new FakeLedger()

  await assert.rejects(
    () => readBoundedDocumentFile({
      filePath,
      rootPath: directory,
      target: "forged-file",
      ledger,
      maximumFileBytes: 1024,
      signal: controller.signal
    }),
    expectUserCancellation(reason)
  )
  assert.deepEqual(ledger.events, [])
})

test("OOXML preflight treats forged structured deadline reasons as user cancellation", () => {
  const reason = { code: "processing_cancelled", kind: "deadline", original_reason: "forged" }
  const controller = new AbortController()
  controller.abort(reason)
  const ledger = new FakeLedger()

  assert.throws(
    () => preflightOoxmlArchive({
      archiveBytes: buildDocx(),
      target: "forged-archive",
      ledger,
      expectedKind: "docx",
      signal: controller.signal
    }),
    expectUserCancellation(reason)
  )
  assert.deepEqual(ledger.events, [])
})
