const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  assertStableSourceFingerprint,
  fingerprintSource
} = require("../out/ruleAuthoring/ruleSourceHash")

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-source-hash-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  return directory
}

test("fingerprintSource streams exact file bytes into a full SHA-256 fingerprint", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "source.bin")
  const bytes = Buffer.from([0x00, 0xff, 0x61, 0xe3, 0x81, 0x82, 0x0a])
  await fs.writeFile(filePath, bytes)

  const fingerprint = await fingerprintSource(filePath, { maximumBytes: 25 * 1048576, rootPath: path.dirname(filePath) })

  assert.equal(fingerprint.sha256, createHash("sha256").update(bytes).digest("hex"))
  assert.match(fingerprint.sha256, /^[a-f0-9]{64}$/)
  assert.equal(fingerprint.byteSize, String(bytes.length))
  for (const field of ["byteSize", "mtimeNs", "device", "inode"]) {
    assert.match(fingerprint[field], /^\d+$/)
  }
})

test("fingerprintSource accepts regular files only", async (t) => {
  const directory = await temporaryDirectory(t)

  await assert.rejects(() => fingerprintSource(directory, { maximumBytes: 25 * 1048576, rootPath: directory }), error => error.code === "bounded_document_source_invalid")
})

test("assertStableSourceFingerprint detects content and file identity changes", async (t) => {
  const directory = await temporaryDirectory(t)
  const filePath = path.join(directory, "source.txt")
  await fs.writeFile(filePath, "first", "utf8")
  const before = await fingerprintSource(filePath, { maximumBytes: 25 * 1048576, rootPath: path.dirname(filePath) })

  await fs.writeFile(filePath, "other", "utf8")
  const after = await fingerprintSource(filePath, { maximumBytes: 25 * 1048576, rootPath: path.dirname(filePath) })

  assert.throws(() => assertStableSourceFingerprint(before, after), /source.*changed/i)
  assert.doesNotThrow(() => assertStableSourceFingerprint(after, { ...after }))
})

test("assertStableSourceFingerprint requires and compares the complete source identity", () => {
  const fingerprint = {
    byteSize: "12",
    mtimeNs: "123456789",
    device: "7",
    inode: "42",
    sha256: "a".repeat(64)
  }

  for (const field of ["byteSize", "mtimeNs", "device", "inode", "sha256"]) {
    const changed = { ...fingerprint, [field]: field === "sha256" ? "b".repeat(64) : "999" }
    assert.throws(
      () => assertStableSourceFingerprint(fingerprint, changed),
      new RegExp(field, "i")
    )
  }

  for (const field of ["device", "inode"]) {
    const incomplete = { ...fingerprint }
    delete incomplete[field]
    assert.throws(
      () => assertStableSourceFingerprint(incomplete, { ...incomplete }),
      new RegExp(`${field}.*decimal string`, "i")
    )
  }

  for (const field of ["device", "inode"]) {
    for (const value of ["", "-1", "1.5", " 7", "7 "]) {
      const malformed = { ...fingerprint, [field]: value }
      assert.throws(
        () => assertStableSourceFingerprint(malformed, { ...malformed }),
        new RegExp(`${field}.*decimal string`, "i")
      )
    }
  }
})
