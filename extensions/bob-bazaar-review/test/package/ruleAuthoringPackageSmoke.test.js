const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { extensionRoot, readJson } = require("../helpers/sourceReader")
const { requiredProductionDependencyEntries } = require("../../scripts/check-vsix-policy")

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const CENTRAL_DIRECTORY_ENTRY_SIGNATURE = 0x02014b50

function readZipEntryNames(zipPath) {
  const buffer = fs.readFileSync(zipPath)
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22)
  let endOffset = -1
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      endOffset = offset
      break
    }
  }
  assert.notEqual(endOffset, -1, "VSIX must contain a ZIP32 end-of-central-directory record")

  const entryCount = buffer.readUInt16LE(endOffset + 10)
  let offset = buffer.readUInt32LE(endOffset + 16)
  const entryNames = new Set()
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), CENTRAL_DIRECTORY_ENTRY_SIGNATURE, `invalid VSIX entry ${index}`)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    entryNames.add(buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength))
    offset += 46 + fileNameLength + extraLength + commentLength
  }
  return entryNames
}

test("package smoke rejects a production lock entry missing from the install", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bob-package-smoke-"))
  try {
    fs.writeFileSync(path.join(directory, "package-lock.json"), JSON.stringify({
      packages: { "node_modules/missing-runtime": { version: "1.0.0" } }
    }))
    assert.throws(
      () => requiredProductionDependencyEntries(directory),
      /missing installed production dependency.*missing-runtime/i
    )
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test("packaged extension contains metadata and load entries for every installed production dependency", () => {
  const packageJson = readJson("package.json")
  const vsixPath = path.join(extensionRoot, `${packageJson.name}-${packageJson.version}.vsix`)
  assert.ok(fs.existsSync(vsixPath), `missing packaged extension: ${path.basename(vsixPath)}`)

  const entryNames = readZipEntryNames(vsixPath)
  for (const requiredEntry of requiredProductionDependencyEntries(extensionRoot)) {
    assert.ok(entryNames.has(requiredEntry), `packaged extension is missing runtime entry: ${requiredEntry}`)
  }
})
