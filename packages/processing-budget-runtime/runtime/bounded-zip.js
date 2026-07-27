"use strict"

const { createHash } = require("node:crypto")
const { TextDecoder } = require("node:util")
const { inflateRawSync } = require("node:zlib")
const {
  ProcessingCancellationError,
  cancellationKindFromSignal,
  cancellationOriginalReason
} = require("./deadline-cancellation")
const {
  boundedString,
  ledgerFrom,
  ownDataRecord,
  positiveSafeInteger,
  preserveTypedError,
  processingError,
  safeAdd,
  safeEcho
} = require("./errors")

const DEFAULT_MAX_ARCHIVE_ENTRIES = 5_000
const ABSOLUTE_MAX_ARCHIVE_ENTRIES = 100_000
const MAX_ENTRY_NAME_BYTES = 2_048
const MAX_CENTRAL_DIRECTORY_BYTES = 32 * 1024 * 1024
const MAX_ZIP_COMMENT_BYTES = 0xffff
const EOCD_BYTES = 22
const CENTRAL_ENTRY_BYTES = 46
const LOCAL_HEADER_BYTES = 30
const ZIP64_UINT16 = 0xffff
const ZIP64_UINT32 = 0xffffffff
const ZIP64_EXTRA_FIELD = 0x0001
const ENCRYPTION_FLAGS = 0x0001 | 0x0040 | 0x2000
const DATA_DESCRIPTOR_FLAG = 0x0008
const MAX_TARGET_UTF8_BYTES = 256
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:/

function snapshotArchiveInput(input) {
  const values = ownDataRecord(
    input,
    ["archiveBytes", "target", "ledger", "expectedKind", "maximumEntries", "maximumEntryBytes", "maximumExpandedBytes", "signal"],
    ["expectedKind", "maximumEntries", "maximumEntryBytes", "maximumExpandedBytes", "signal"],
    "OOXML archive input"
  )
  if (!(values.archiveBytes instanceof Uint8Array)) throw processingError("bounded_document_input_invalid", "archiveBytes must be a Uint8Array")
  if (values.expectedKind !== undefined && values.expectedKind !== "docx" && values.expectedKind !== "xlsx") {
    throw processingError("bounded_document_input_invalid", "expectedKind must be docx or xlsx")
  }
  if (values.signal !== undefined && (values.signal === null || typeof values.signal !== "object")) {
    throw processingError("bounded_document_input_invalid", "signal must be an object")
  }
  throwIfCancelled(values.signal)
  return Object.freeze({
    archive: Buffer.from(values.archiveBytes),
    target: boundedString(values.target, "target", MAX_TARGET_UTF8_BYTES),
    ledger: ledgerFrom(values.ledger),
    expectedKind: values.expectedKind,
    maximumEntries: values.maximumEntries === undefined
      ? DEFAULT_MAX_ARCHIVE_ENTRIES
      : positiveSafeInteger(values.maximumEntries, "maximumEntries", ABSOLUTE_MAX_ARCHIVE_ENTRIES),
    maximumEntryBytes: values.maximumEntryBytes === undefined
      ? 50 * 1024 * 1024
      : positiveSafeInteger(values.maximumEntryBytes, "maximumEntryBytes", 256 * 1024 * 1024),
    maximumExpandedBytes: values.maximumExpandedBytes === undefined
      ? 256 * 1024 * 1024
      : positiveSafeInteger(values.maximumExpandedBytes, "maximumExpandedBytes", 1024 * 1024 * 1024),
    signal: values.signal
  })
}

function preflightOoxmlArchive(input) {
  const options = snapshotArchiveInput(input)
  throwIfCancelled(options.signal)
  const entries = parseZipDirectory(options.archive, options)
  const reservations = []
  const contents = []
  let expandedBytes = 0
  try {
    for (const [index, entry] of entries.entries()) {
      throwIfCancelled(options.signal)
      if (entry.directory) continue
      if (entry.uncompressedSize > options.maximumEntryBytes) {
        throw processingError("archive_entry_too_large", `archive entry exceeds ${options.maximumEntryBytes} bytes`, {
          limit: options.maximumEntryBytes,
          observed: entry.uncompressedSize
        })
      }
      if (entry.uncompressedSize > options.maximumExpandedBytes - expandedBytes) {
        throw processingError("archive_expanded_too_large", `archive expanded bytes exceed ${options.maximumExpandedBytes}`, {
          limit: options.maximumExpandedBytes,
          observed: safeAdd(expandedBytes, entry.uncompressedSize)
        })
      }
      expandedBytes += entry.uncompressedSize
      reservations.push({
        entry,
        reservation: options.ledger.reserveForTarget("single_document_bytes", archiveEntryTarget(options.target, index), entry.uncompressedSize)
      })
    }

    for (const item of reservations) {
      throwIfCancelled(options.signal)
      const content = inflateEntry(options.archive, item.entry, options.signal)
      throwIfCancelled(options.signal)
      contents.push({ entry: item.entry, content })
    }

    const byName = new Map()
    for (const { entry, content } of contents) {
      throwIfCancelled(options.signal)
      byName.set(entry.name, content)
    }
    const documentKind = detectOoxmlKind(byName)
    if (options.expectedKind !== undefined && documentKind !== options.expectedKind) {
      throw processingError("ooxml_kind_mismatch", `OOXML archive is ${documentKind}, not ${options.expectedKind}`)
    }

    const metadataItems = []
    for (const entry of entries) {
      throwIfCancelled(options.signal)
      metadataItems.push(Object.freeze({
        name: entry.name,
        directory: entry.directory,
        compression_method: entry.method,
        compressed_bytes: entry.compressedSize,
        expanded_bytes: entry.uncompressedSize,
        crc32: entry.crc32.toString(16).padStart(8, "0")
      }))
    }
    const metadata = Object.freeze(metadataItems)

    // Do not check the signal after commit begins: all reservations are committed
    // as one synchronous finalization phase, avoiding a partially committed ledger.
    throwIfCancelled(options.signal)
    for (let index = 0; index < reservations.length; index += 1) {
      reservations[index].reservation.commit(contents[index].content.length)
      reservations[index].reservation = undefined
    }

    return Object.freeze({
      documentKind,
      entryCount: entries.length,
      expandedBytes,
      entries: metadata,
      copyEntry(name) {
        const content = byName.get(name)
        return content ? Uint8Array.from(content) : undefined
      }
    })
  } catch (error) {
    for (const item of reservations) if (item.reservation) try { item.reservation.release() } catch {}
    preserveTypedError(error, "archive_invalid", "archive validation failed")
  }
}

function parseZipDirectory(archive, options) {
  throwIfCancelled(options.signal)
  if (archive.length < EOCD_BYTES) throw processingError("archive_invalid", "ZIP end-of-central-directory record is missing")
  const endOffset = findEndOfCentralDirectory(archive, options.signal)
  const diskNumber = readUInt16(archive, endOffset + 4)
  const centralDisk = readUInt16(archive, endOffset + 6)
  const diskEntries = readUInt16(archive, endOffset + 8)
  const totalEntries = readUInt16(archive, endOffset + 10)
  const centralSize = readUInt32(archive, endOffset + 12)
  const centralOffset = readUInt32(archive, endOffset + 16)
  if (diskNumber !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) throw processingError("archive_multidisk_unsupported", "multi-disk ZIP archives are unsupported")
  if (totalEntries === ZIP64_UINT16 || centralSize === ZIP64_UINT32 || centralOffset === ZIP64_UINT32) throw processingError("archive_zip64_unsupported", "ZIP64 archives are unsupported")
  if (totalEntries > options.maximumEntries) {
    throw processingError("archive_entry_count_exceeded", `archive entry count ${totalEntries} exceeds ${options.maximumEntries}`, {
      limit: options.maximumEntries,
      observed: totalEntries
    })
  }
  if (centralSize > MAX_CENTRAL_DIRECTORY_BYTES) throw processingError("archive_directory_too_large", "ZIP central directory exceeds its bounded reader limit")
  if (!Number.isSafeInteger(centralOffset + centralSize) || centralOffset + centralSize !== endOffset) throw processingError("archive_invalid", "ZIP central-directory bounds are inconsistent")
  if (centralSize < totalEntries * CENTRAL_ENTRY_BYTES) throw processingError("archive_invalid", "ZIP central directory is truncated for its entry count")

  const decoder = new TextDecoder("utf-8", { fatal: true })
  const entries = []
  const normalizedNames = new Set()
  let offset = centralOffset
  for (let index = 0; index < totalEntries; index += 1) {
    throwIfCancelled(options.signal)
    requireBounds(archive, offset, CENTRAL_ENTRY_BYTES, "central directory entry")
    if (readUInt32(archive, offset) !== 0x02014b50) throw processingError("archive_invalid", `ZIP central-directory entry ${index} has an invalid signature`)
    const flags = readUInt16(archive, offset + 8)
    const method = readUInt16(archive, offset + 10)
    const crc32Value = readUInt32(archive, offset + 16)
    const compressedSize = readUInt32(archive, offset + 20)
    const uncompressedSize = readUInt32(archive, offset + 24)
    const nameLength = readUInt16(archive, offset + 28)
    const extraLength = readUInt16(archive, offset + 30)
    const commentLength = readUInt16(archive, offset + 32)
    const startingDisk = readUInt16(archive, offset + 34)
    const localOffset = readUInt32(archive, offset + 42)
    if (startingDisk !== 0) throw processingError("archive_multidisk_unsupported", "multi-disk ZIP entries are unsupported")
    if (compressedSize === ZIP64_UINT32 || uncompressedSize === ZIP64_UINT32 || localOffset === ZIP64_UINT32) throw processingError("archive_zip64_unsupported", "ZIP64 entries are unsupported")
    if ((flags & ENCRYPTION_FLAGS) !== 0) throw processingError("archive_encrypted", "encrypted ZIP entries are unsupported")
    if (method !== 0 && method !== 8) throw processingError("archive_method_unsupported", `ZIP compression method ${method} is unsupported`)
    if (nameLength === 0 || nameLength > MAX_ENTRY_NAME_BYTES) throw processingError("archive_entry_name_invalid", "ZIP entry name length is invalid")
    const recordLength = CENTRAL_ENTRY_BYTES + nameLength + extraLength + commentLength
    requireBounds(archive, offset, recordLength, "central directory entry")
    const nameStart = offset + CENTRAL_ENTRY_BYTES
    let name
    try { name = decoder.decode(archive.subarray(nameStart, nameStart + nameLength)) } catch {
      throw processingError("archive_entry_name_invalid", "ZIP entry name is not valid UTF-8")
    }
    assertNoZip64Extra(archive.subarray(nameStart + nameLength, nameStart + nameLength + extraLength), name, options.signal)
    const normalized = normalizeZipEntryName(name)
    if (normalizedNames.has(normalized.key)) throw processingError("archive_duplicate_entry", `ZIP entry is duplicated: ${safeEcho(name)}`)
    normalizedNames.add(normalized.key)
    const entry = parseLocalHeader(archive, {
      name,
      directory: normalized.directory,
      flags,
      method,
      crc32: crc32Value,
      compressedSize,
      uncompressedSize,
      localOffset,
      dataOffset: 0
    }, decoder, centralOffset, options.signal)
    if (entry.directory && (entry.compressedSize !== 0 || entry.uncompressedSize !== 0)) throw processingError("archive_invalid", `ZIP directory entry has content: ${safeEcho(name)}`)
    entries.push(entry)
    offset += recordLength
  }
  throwIfCancelled(options.signal)
  if (offset !== centralOffset + centralSize) throw processingError("archive_invalid", "ZIP central-directory size does not match its entries")

  const regions = entries.map((entry) => ({ entry, start: entry.localOffset, end: entry.dataOffset + entry.compressedSize })).sort((left, right) => left.start - right.start)
  if (regions.length > 0 && regions[0].start !== 0) throw processingError("archive_invalid", "unexpected bytes precede the first ZIP entry")
  for (let index = 0; index < regions.length; index += 1) {
    throwIfCancelled(options.signal)
    const region = regions[index]
    const boundary = index + 1 < regions.length ? regions[index + 1].start : centralOffset
    if (boundary < region.end) throw processingError("archive_invalid", "ZIP entries overlap")
    validateLocalEntryGap(archive, region.entry, region.end, boundary)
  }
  throwIfCancelled(options.signal)
  return entries
}

function assertNoZip64Extra(extra, entryName, signal) {
  let offset = 0
  while (offset < extra.length) {
    throwIfCancelled(signal)
    if (offset + 4 > extra.length) throw processingError("archive_invalid", `ZIP entry has malformed extra fields: ${safeEcho(entryName)}`)
    const header = extra.readUInt16LE(offset)
    const length = extra.readUInt16LE(offset + 2)
    if (offset + 4 + length > extra.length) throw processingError("archive_invalid", `ZIP entry has truncated extra fields: ${safeEcho(entryName)}`)
    if (header === ZIP64_EXTRA_FIELD) throw processingError("archive_zip64_unsupported", `ZIP64 extra field is unsupported: ${safeEcho(entryName)}`)
    offset += 4 + length
  }
}

function normalizeZipEntryName(name) {
  if (!name || Buffer.byteLength(name, "utf8") > MAX_ENTRY_NAME_BYTES || name.startsWith("/") || WINDOWS_DRIVE_PATH.test(name)
    || name.includes("\\") || CONTROL_CHARACTERS.test(name) || name.normalize("NFC") !== name) {
    throw processingError("archive_entry_name_invalid", `ZIP entry name is unsafe: ${safeEcho(name)}`)
  }
  const directory = name.endsWith("/")
  const body = directory ? name.slice(0, -1) : name
  if (!body || body.includes("//") || body.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw processingError("archive_entry_name_invalid", `ZIP entry name is unsafe: ${safeEcho(name)}`)
  }
  return { key: body, directory }
}

function parseLocalHeader(archive, central, decoder, centralOffset, signal) {
  throwIfCancelled(signal)
  requireBounds(archive, central.localOffset, LOCAL_HEADER_BYTES, "local ZIP entry")
  if (readUInt32(archive, central.localOffset) !== 0x04034b50) throw processingError("archive_invalid", "local ZIP entry signature is invalid")
  const flags = readUInt16(archive, central.localOffset + 6)
  const method = readUInt16(archive, central.localOffset + 8)
  const crc = readUInt32(archive, central.localOffset + 14)
  const compressedSize = readUInt32(archive, central.localOffset + 18)
  const uncompressedSize = readUInt32(archive, central.localOffset + 22)
  const nameLength = readUInt16(archive, central.localOffset + 26)
  const extraLength = readUInt16(archive, central.localOffset + 28)
  requireBounds(archive, central.localOffset, LOCAL_HEADER_BYTES + nameLength + extraLength, "local ZIP entry")
  const nameStart = central.localOffset + LOCAL_HEADER_BYTES
  let name
  try { name = decoder.decode(archive.subarray(nameStart, nameStart + nameLength)) } catch {
    throw processingError("archive_entry_name_invalid", "local ZIP entry name is not valid UTF-8")
  }
  assertNoZip64Extra(archive.subarray(nameStart + nameLength, nameStart + nameLength + extraLength), name, signal)
  if (name !== central.name || flags !== central.flags || method !== central.method) throw processingError("archive_invalid", "local and central ZIP metadata disagree")
  const descriptor = (flags & DATA_DESCRIPTOR_FLAG) !== 0
  if ((!descriptor && (crc !== central.crc32 || compressedSize !== central.compressedSize || uncompressedSize !== central.uncompressedSize))
    || (descriptor && ((crc !== 0 && crc !== central.crc32) || (compressedSize !== 0 && compressedSize !== central.compressedSize) || (uncompressedSize !== 0 && uncompressedSize !== central.uncompressedSize)))) {
    throw processingError("archive_invalid", "local and central ZIP sizes or checksum disagree")
  }
  const dataOffset = central.localOffset + LOCAL_HEADER_BYTES + nameLength + extraLength
  if (!Number.isSafeInteger(dataOffset + central.compressedSize) || dataOffset + central.compressedSize > centralOffset) throw processingError("archive_invalid", "local ZIP entry data is truncated")
  return { ...central, dataOffset }
}

function validateLocalEntryGap(archive, entry, dataEnd, boundary) {
  const gap = boundary - dataEnd
  if ((entry.flags & DATA_DESCRIPTOR_FLAG) === 0) {
    if (gap !== 0) throw processingError("archive_invalid", "unexpected bytes follow a bounded ZIP entry")
    return
  }
  if (gap !== 12 && gap !== 16) throw processingError("archive_invalid", "ZIP data descriptor bounds are invalid")
  const signature = gap === 16
  if (signature && readUInt32(archive, dataEnd) !== 0x08074b50) throw processingError("archive_invalid", "ZIP data descriptor signature is invalid")
  const offset = dataEnd + (signature ? 4 : 0)
  if (readUInt32(archive, offset) !== entry.crc32 || readUInt32(archive, offset + 4) !== entry.compressedSize || readUInt32(archive, offset + 8) !== entry.uncompressedSize) {
    throw processingError("archive_invalid", "ZIP data descriptor disagrees with the central directory")
  }
}

function inflateEntry(archive, entry, signal) {
  throwIfCancelled(signal)
  const compressed = archive.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize)
  let content
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.uncompressedSize) throw processingError("archive_invalid", "stored ZIP entry sizes disagree")
    content = Buffer.from(compressed)
  } else {
    try { content = inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.uncompressedSize + 1) }) } catch {
      throw processingError("archive_inflate_failed", `ZIP entry cannot be inflated within its declared bound: ${safeEcho(entry.name)}`)
    }
  }
  throwIfCancelled(signal)
  if (content.length !== entry.uncompressedSize) throw processingError("archive_expanded_size_mismatch", `ZIP entry expanded size disagrees with its header: ${safeEcho(entry.name)}`)
  if (crc32(content, signal) !== entry.crc32) throw processingError("archive_crc_mismatch", `ZIP entry checksum disagrees with its header: ${safeEcho(entry.name)}`)
  return content
}

function detectOoxmlKind(entries) {
  const contentTypes = entries.get("[Content_Types].xml")
  if (!contentTypes || contentTypes.length === 0) throw processingError("ooxml_required_entry_missing", "OOXML archive lacks its content-types metadata")
  const docx = entries.has("word/document.xml")
  const xlsx = entries.has("xl/workbook.xml")
  if (docx === xlsx) throw processingError("ooxml_kind_invalid", "OOXML archive must contain exactly one DOCX or XLSX root document")
  return docx ? "docx" : "xlsx"
}

function archiveEntryTarget(target, index) {
  return `archive:${createHash("sha256").update(target, "utf8").digest("hex").slice(0, 16)}:${index}`
}

function findEndOfCentralDirectory(archive, signal) {
  const minimum = Math.max(0, archive.length - MAX_ZIP_COMMENT_BYTES - EOCD_BYTES)
  for (let offset = archive.length - EOCD_BYTES; offset >= minimum; offset -= 1) {
    if ((offset & 0x3ff) === 0) throwIfCancelled(signal)
    if (readUInt32(archive, offset) === 0x06054b50 && offset + EOCD_BYTES + readUInt16(archive, offset + 20) === archive.length) return offset
  }
  throw processingError("archive_invalid", "ZIP end-of-central-directory record is missing or has trailing bytes")
}

function requireBounds(buffer, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset > buffer.length - length) throw processingError("archive_invalid", `${label} is truncated`)
}
function readUInt16(buffer, offset) { requireBounds(buffer, offset, 2, "ZIP integer"); return buffer.readUInt16LE(offset) }
function readUInt32(buffer, offset) { requireBounds(buffer, offset, 4, "ZIP integer"); return buffer.readUInt32LE(offset) }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < table.length; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()
function crc32(content, signal) {
  let value = 0xffffffff
  for (let index = 0; index < content.length; index += 1) {
    if ((index & 0xffff) === 0) throwIfCancelled(signal)
    value = CRC_TABLE[(value ^ content[index]) & 0xff] ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}

function throwIfCancelled(signal) {
  if (!signal?.aborted) return
  const kind = cancellationKindFromSignal(signal) ?? "user"
  const originalReason = cancellationOriginalReason(signal)
  const reason = signal.reason
  if (
    reason instanceof ProcessingCancellationError &&
    reason.kind === kind &&
    reason.original_reason === originalReason
  ) {
    throw reason
  }
  throw new ProcessingCancellationError(kind, originalReason)
}

module.exports = Object.freeze({
  ABSOLUTE_MAX_ARCHIVE_ENTRIES,
  DEFAULT_MAX_ARCHIVE_ENTRIES,
  MAX_CENTRAL_DIRECTORY_BYTES,
  MAX_ENTRY_NAME_BYTES,
  preflightOoxmlArchive,
  __test: Object.freeze({ crc32, parseZipDirectory })
})
