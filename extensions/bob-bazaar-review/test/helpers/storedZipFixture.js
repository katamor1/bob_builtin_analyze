const assert = require("node:assert/strict")

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_DIRECTORY_ENTRY_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE = 0x07064b50

function uint16(value, fieldName) {
  assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffff, `${fieldName} must fit uint16`)
  return value
}

function uint32(value, fieldName) {
  assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffffff, `${fieldName} must fit uint32`)
  return value
}

function createStoredZip(entries, options = {}) {
  const localParts = []
  const centralParts = []
  let localOffset = 0

  for (const [index, input] of entries.entries()) {
    const name = Buffer.from(input.name, "utf8")
    const data = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data ?? "", "utf8")
    const localExtra = input.localExtra ?? Buffer.alloc(0)
    const centralExtra = input.centralExtra ?? Buffer.alloc(0)
    const comment = input.comment ?? Buffer.alloc(0)
    const flags = uint16(input.flags ?? 0, `entries[${index}].flags`)
    const compressionMethod = uint16(input.compressionMethod ?? 0, `entries[${index}].compressionMethod`)
    const compressedSize = uint32(input.compressedSize ?? data.length, `entries[${index}].compressedSize`)
    const uncompressedSize = uint32(input.uncompressedSize ?? data.length, `entries[${index}].uncompressedSize`)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0)
    localHeader.writeUInt16LE(input.versionNeeded ?? 20, 4)
    localHeader.writeUInt16LE(flags, 6)
    localHeader.writeUInt16LE(compressionMethod, 8)
    localHeader.writeUInt32LE(input.crc32 ?? 0, 14)
    localHeader.writeUInt32LE(compressedSize, 18)
    localHeader.writeUInt32LE(uncompressedSize, 22)
    localHeader.writeUInt16LE(name.length, 26)
    localHeader.writeUInt16LE(localExtra.length, 28)
    localParts.push(localHeader, name, localExtra, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_ENTRY_SIGNATURE, 0)
    centralHeader.writeUInt16LE(input.versionMadeBy ?? 20, 4)
    centralHeader.writeUInt16LE(input.versionNeeded ?? 20, 6)
    centralHeader.writeUInt16LE(flags, 8)
    centralHeader.writeUInt16LE(compressionMethod, 10)
    centralHeader.writeUInt32LE(input.crc32 ?? 0, 16)
    centralHeader.writeUInt32LE(compressedSize, 20)
    centralHeader.writeUInt32LE(uncompressedSize, 24)
    centralHeader.writeUInt16LE(name.length, 28)
    centralHeader.writeUInt16LE(centralExtra.length, 30)
    centralHeader.writeUInt16LE(comment.length, 32)
    centralHeader.writeUInt16LE(input.diskNumberStart ?? 0, 34)
    centralHeader.writeUInt32LE(input.externalAttributes ?? 0, 38)
    centralHeader.writeUInt32LE(input.localHeaderOffset ?? localOffset, 42)
    centralParts.push(centralHeader, name, centralExtra, comment)

    localOffset += localHeader.length + name.length + localExtra.length + data.length
  }

  const localDirectory = Buffer.concat(localParts)
  const centralDirectory = Buffer.concat(centralParts)
  const beforeEocd = options.beforeEocd ?? (options.zip64Locator ? createZip64Locator() : Buffer.alloc(0))
  const comment = options.comment ?? Buffer.alloc(0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0)
  end.writeUInt16LE(options.diskNumber ?? 0, 4)
  end.writeUInt16LE(options.centralDirectoryDisk ?? 0, 6)
  end.writeUInt16LE(options.entriesOnDisk ?? entries.length, 8)
  end.writeUInt16LE(options.entryCount ?? entries.length, 10)
  end.writeUInt32LE(options.centralDirectorySize ?? centralDirectory.length, 12)
  end.writeUInt32LE(options.centralDirectoryOffset ?? localDirectory.length, 16)
  end.writeUInt16LE(comment.length, 20)
  return Buffer.concat([localDirectory, centralDirectory, beforeEocd, end, comment])
}

function createZip64Locator() {
  const locator = Buffer.alloc(20)
  locator.writeUInt32LE(ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE, 0)
  return locator
}

module.exports = {
  CENTRAL_DIRECTORY_ENTRY_SIGNATURE,
  END_OF_CENTRAL_DIRECTORY_SIGNATURE,
  createStoredZip
}
