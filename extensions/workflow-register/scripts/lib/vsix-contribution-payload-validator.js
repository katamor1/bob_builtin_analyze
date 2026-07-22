"use strict"

const { createHash } = require("node:crypto")
const { TextDecoder } = require("node:util")
const { inflateRawSync } = require("node:zlib")

const WORKFLOW_PACKAGE_EXPECTATION_SCHEMA_VERSION = "workflow-package-expectation/v1"
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 100_000
const MAX_ENTRY_NAME_BYTES = 2048
const MAX_ENTRY_UNCOMPRESSED_BYTES = 8 * 1024 * 1024
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 32 * 1024 * 1024
const MAX_EXPECTED_ASSETS = 4096
const MAX_DIAGNOSTICS = 256
const DIAGNOSTIC_BYTES = 256

function validateVsixContributionPayload(input) {
  let checked
  try {
    checked = snapshotInput(input)
  } catch {
    return validationResult([diagnostic("vsix.input_invalid", "/", "VSIX validation input metadata is invalid")])
  }

  let zip
  try {
    zip = parseZip(checked.archiveContent)
  } catch (error) {
    return validationResult([diagnostic(
      "vsix.archive_invalid",
      "/archive",
      `VSIX archive is invalid: ${safeErrorMessage(error)}`
    )])
  }
  return validatePayload(zip, checked.expected)
}

function snapshotInput(input) {
  const values = closedOwnDataRecord(input, ["archiveContent", "expectedCatalog", "ownerId"], "VSIX input")
  if (!Buffer.isBuffer(values.archiveContent)) throw new Error("archiveContent must be a Buffer")
  if (values.archiveContent.length > MAX_ARCHIVE_BYTES) throw new Error("archive exceeds byte limit")
  if (!isBoundedString(values.ownerId, 256)) throw new Error("ownerId is invalid")
  return {
    archiveContent: Buffer.from(values.archiveContent),
    expected: snapshotExpectation(values.expectedCatalog, values.ownerId)
  }
}

function snapshotExpectation(value, requestedOwnerId) {
  const expectation = closedOwnDataRecord(value, ["assets", "owner", "schema_version"], "package expectation")
  if (expectation.schema_version !== WORKFLOW_PACKAGE_EXPECTATION_SCHEMA_VERSION) {
    throw new Error("package expectation schema is unsupported")
  }
  const ownerValue = closedOwnDataRecord(expectation.owner, [
    "id",
    "manifest_path",
    "manifest_sha256",
    "owner_directory",
    "package_path",
    "package_sha256",
    "version"
  ], "package expectation owner")
  for (const key of ["id", "version", "owner_directory", "manifest_path", "package_path"]) {
    if (!isBoundedString(ownerValue[key], MAX_ENTRY_NAME_BYTES)) throw new Error(`owner ${key} is invalid`)
  }
  if (!isSha256(ownerValue.manifest_sha256) || !isSha256(ownerValue.package_sha256)) {
    throw new Error("owner digests are invalid")
  }
  if (ownerValue.id !== requestedOwnerId) throw new Error("requested owner does not match expectation")
  if (!isCanonicalRepositoryPath(ownerValue.owner_directory)) throw new Error("owner directory is not canonical")
  if (ownerValue.manifest_path !== `${ownerValue.owner_directory}/contracts/workflow-contributions.json`) {
    throw new Error("manifest path is not canonical for owner")
  }
  if (ownerValue.package_path !== `${ownerValue.owner_directory}/package.json`) {
    throw new Error("package path is not canonical for owner")
  }

  const assetValues = ownDataArray(expectation.assets, "package expectation assets", MAX_EXPECTED_ASSETS)
  const assets = []
  let previousPath
  for (const record of assetValues) {
    const asset = closedOwnDataRecord(record, ["id", "kind", "path", "sha256"], "package expectation asset")
    if (asset.kind !== "schema" && asset.kind !== "template") throw new Error("asset kind is invalid")
    if (!isBoundedString(asset.id, 256) || !isBoundedString(asset.path, MAX_ENTRY_NAME_BYTES) || !isSha256(asset.sha256)) {
      throw new Error("asset fields are invalid")
    }
    if (!isCanonicalRepositoryPath(asset.path) || !isInsideOwner(asset.path, ownerValue.owner_directory)) {
      throw new Error("asset path is outside owner")
    }
    if (previousPath !== undefined && compareCodeUnits(previousPath, asset.path) >= 0) {
      throw new Error("assets must be strictly path-sorted without duplicates")
    }
    previousPath = asset.path
    assets.push({ kind: asset.kind, id: asset.id, path: asset.path, sha256: asset.sha256 })
  }
  return {
    id: ownerValue.id,
    version: ownerValue.version,
    ownerDirectory: ownerValue.owner_directory,
    manifestPath: ownerValue.manifest_path,
    manifestSha256: ownerValue.manifest_sha256,
    packagePath: ownerValue.package_path,
    packageSha256: ownerValue.package_sha256,
    assets
  }
}

function validatePayload(zip, expected) {
  const diagnostics = []
  const packageEntryName = repositoryPathToEntry(expected.packagePath, expected.ownerDirectory)
  const manifestEntryName = repositoryPathToEntry(expected.manifestPath, expected.ownerDirectory)
  const packageBytes = zip.contents.get(packageEntryName)
  const manifestBytes = zip.contents.get(manifestEntryName)

  if (!packageBytes) {
    diagnostics.push(diagnostic("vsix.package_missing", packageEntryName, "VSIX package manifest is missing"))
  } else {
    if (sha256Content(packageBytes) !== expected.packageSha256) {
      diagnostics.push(diagnostic(
        "vsix.package_digest_mismatch",
        packageEntryName,
        `VSIX package manifest digest does not match catalog owner '${expected.id}'`
      ))
    }
    const packageJson = parseUtf8Json(packageBytes)
    if (!packageJson) {
      diagnostics.push(diagnostic("vsix.package_invalid", packageEntryName, "VSIX package manifest must contain valid UTF-8 JSON"))
    } else {
      let publisher
      let name
      let version
      try {
        const packageValues = ownDataValues(packageJson, ["publisher", "name", "version"])
        publisher = packageValues.publisher
        name = packageValues.name
        version = packageValues.version
      } catch {
        diagnostics.push(diagnostic("vsix.package_invalid", packageEntryName, "VSIX package identity fields must be own data"))
      }
      if (`${publisher}.${name}` !== expected.id || version !== expected.version) {
        diagnostics.push(diagnostic(
          "vsix.package_identity_mismatch",
          packageEntryName,
          `VSIX package identity must match catalog owner '${expected.id}@${expected.version}'`
        ))
      }
    }
  }

  if (!manifestBytes) {
    diagnostics.push(diagnostic("vsix.manifest_missing", manifestEntryName, "VSIX contribution manifest is missing"))
  } else if (sha256Content(manifestBytes) !== expected.manifestSha256) {
    diagnostics.push(diagnostic(
      "vsix.manifest_digest_mismatch",
      manifestEntryName,
      `VSIX contribution manifest digest does not match catalog owner '${expected.id}'`
    ))
  }
  if (diagnostics.length > 0) return validationResult(diagnostics)

  for (const asset of expected.assets) {
    const entryName = repositoryPathToEntry(asset.path, expected.ownerDirectory)
    const content = zip.contents.get(entryName)
    if (!content) {
      diagnostics.push(diagnostic(
        asset.kind === "schema" ? "vsix.schema_missing" : "vsix.template_missing",
        entryName,
        `VSIX declared ${asset.kind} '${asset.path}' is missing`
      ))
    } else if (sha256Content(content) !== asset.sha256) {
      diagnostics.push(diagnostic(
        "vsix.asset_digest_mismatch",
        entryName,
        `VSIX declared ${asset.kind} '${asset.path}' digest does not match the pre-package catalog`
      ))
    }
  }
  return validationResult(diagnostics)
}

function parseZip(archive) {
  if (archive.length < 22) throw new Error("end-of-central-directory record is missing")
  const endOffset = findEndOfCentralDirectory(archive)
  const diskNumber = archive.readUInt16LE(endOffset + 4)
  const centralDisk = archive.readUInt16LE(endOffset + 6)
  const diskEntries = archive.readUInt16LE(endOffset + 8)
  const totalEntries = archive.readUInt16LE(endOffset + 10)
  const centralSize = archive.readUInt32LE(endOffset + 12)
  const centralOffset = archive.readUInt32LE(endOffset + 16)
  if (diskNumber !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) throw new Error("multi-disk ZIP archives are unsupported")
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error("ZIP64 archives are unsupported")
  if (totalEntries > MAX_ARCHIVE_ENTRIES) throw new Error("archive entry count exceeds the validation limit")
  if (centralOffset + centralSize !== endOffset) throw new Error("central directory bounds are inconsistent")

  const decoder = new TextDecoder("utf-8", { fatal: true })
  const entries = new Map()
  let aggregateUncompressedSize = 0
  let offset = centralOffset
  for (let index = 0; index < totalEntries; index += 1) {
    requireBounds(archive, offset, 46, "central directory entry")
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error("central directory entry signature is invalid")
    const flags = archive.readUInt16LE(offset + 8)
    const method = archive.readUInt16LE(offset + 10)
    const crc = archive.readUInt32LE(offset + 16)
    const compressedSize = archive.readUInt32LE(offset + 20)
    const uncompressedSize = archive.readUInt32LE(offset + 24)
    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const startingDisk = archive.readUInt16LE(offset + 34)
    const localOffset = archive.readUInt32LE(offset + 42)
    if (startingDisk !== 0) throw new Error("multi-disk ZIP entry is unsupported")
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error("ZIP64 entry is unsupported")
    }
    if ((flags & (0x0001 | 0x0040 | 0x2000)) !== 0) throw new Error("encrypted ZIP entry is unsupported")
    if (method !== 0 && method !== 8) throw new Error("ZIP entry compression method is unsupported")
    if (nameLength === 0 || nameLength > MAX_ENTRY_NAME_BYTES) throw new Error("ZIP entry name length is invalid")
    if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) throw new Error("ZIP entry exceeds the uncompressed byte limit")
    aggregateUncompressedSize += uncompressedSize
    if (aggregateUncompressedSize > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      throw new Error("ZIP archive exceeds the aggregate uncompressed byte limit")
    }
    const recordLength = 46 + nameLength + extraLength + commentLength
    requireBounds(archive, offset, recordLength, "central directory entry")
    let name
    try {
      name = decoder.decode(archive.subarray(offset + 46, offset + 46 + nameLength))
    } catch {
      throw new Error("ZIP entry name is not valid UTF-8")
    }
    if (!isCanonicalZipEntryName(name)) throw new Error(`ZIP entry name '${name}' is not canonical`)
    if (entries.has(name)) throw new Error(`ZIP entry name '${name}' is duplicated`)
    const local = parseLocalHeader(archive, {
      name,
      flags,
      method,
      crc32: crc,
      compressedSize,
      uncompressedSize,
      localOffset,
      dataOffset: 0
    }, decoder, centralOffset)
    entries.set(name, local)
    offset += recordLength
  }
  if (offset !== centralOffset + centralSize) throw new Error("central directory size does not match its entries")

  const regions = [...entries.values()]
    .map((entry) => ({ entry, start: entry.localOffset, end: entry.dataOffset + entry.compressedSize }))
    .sort((left, right) => left.start - right.start)
  if (regions.length > 0 && regions[0].start !== 0) throw new Error("unexpected bytes precede the first local ZIP entry")
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index]
    const boundary = index + 1 < regions.length ? regions[index + 1].start : centralOffset
    if (boundary < region.end) throw new Error("local ZIP entries overlap")
    validateLocalEntryGap(archive, region.entry, region.end, boundary)
  }

  const contents = new Map()
  for (const entry of entries.values()) contents.set(entry.name, readEntry(archive, entry))
  return { entries, contents, aggregateUncompressedSize }
}

function validateLocalEntryGap(archive, entry, dataEnd, boundary) {
  const gap = boundary - dataEnd
  if ((entry.flags & 0x0008) === 0) {
    if (gap !== 0) throw new Error("unexpected bytes follow a bounded local ZIP entry")
    return
  }
  if (gap !== 12 && gap !== 16) throw new Error("ZIP data descriptor bounds are invalid")
  const hasSignature = gap === 16
  if (hasSignature && archive.readUInt32LE(dataEnd) !== 0x08074b50) throw new Error("ZIP data descriptor signature is invalid")
  const offset = dataEnd + (hasSignature ? 4 : 0)
  if (
    archive.readUInt32LE(offset) !== entry.crc32
    || archive.readUInt32LE(offset + 4) !== entry.compressedSize
    || archive.readUInt32LE(offset + 8) !== entry.uncompressedSize
  ) throw new Error("ZIP data descriptor disagrees with the central directory")
}

function parseLocalHeader(archive, central, decoder, centralOffset) {
  requireBounds(archive, central.localOffset, 30, "local ZIP entry")
  if (archive.readUInt32LE(central.localOffset) !== 0x04034b50) throw new Error("local ZIP entry signature is invalid")
  const flags = archive.readUInt16LE(central.localOffset + 6)
  const method = archive.readUInt16LE(central.localOffset + 8)
  const crc = archive.readUInt32LE(central.localOffset + 14)
  const compressedSize = archive.readUInt32LE(central.localOffset + 18)
  const uncompressedSize = archive.readUInt32LE(central.localOffset + 22)
  const nameLength = archive.readUInt16LE(central.localOffset + 26)
  const extraLength = archive.readUInt16LE(central.localOffset + 28)
  requireBounds(archive, central.localOffset, 30 + nameLength + extraLength, "local ZIP entry")
  let name
  try {
    name = decoder.decode(archive.subarray(central.localOffset + 30, central.localOffset + 30 + nameLength))
  } catch {
    throw new Error("local ZIP entry name is not valid UTF-8")
  }
  if (name !== central.name || flags !== central.flags || method !== central.method) {
    throw new Error("local and central ZIP entry metadata disagree")
  }
  const usesDescriptor = (flags & 0x0008) !== 0
  if ((!usesDescriptor && (crc !== central.crc32 || compressedSize !== central.compressedSize || uncompressedSize !== central.uncompressedSize))
    || (usesDescriptor && ((crc !== 0 && crc !== central.crc32)
      || (compressedSize !== 0 && compressedSize !== central.compressedSize)
      || (uncompressedSize !== 0 && uncompressedSize !== central.uncompressedSize)))) {
    throw new Error("local and central ZIP entry sizes or checksum disagree")
  }
  const dataOffset = central.localOffset + 30 + nameLength + extraLength
  if (dataOffset + central.compressedSize > centralOffset) throw new Error("local ZIP entry data is truncated")
  return { ...central, dataOffset }
}

function readEntry(archive, entry) {
  const compressed = archive.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize)
  let content
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.uncompressedSize) throw new Error("stored ZIP entry sizes disagree")
    content = Buffer.from(compressed)
  } else {
    try {
      content = inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_UNCOMPRESSED_BYTES })
    } catch {
      throw new Error("ZIP entry cannot be inflated within its output bound")
    }
  }
  if (content.length !== entry.uncompressedSize) throw new Error("inflated ZIP entry size disagrees with its header")
  if (crc32(content) !== entry.crc32) throw new Error("inflated ZIP entry checksum disagrees with its header")
  return content
}

function findEndOfCentralDirectory(archive) {
  const minimum = Math.max(0, archive.length - 0xffff - 22)
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) !== 0x06054b50) continue
    const commentLength = archive.readUInt16LE(offset + 20)
    if (offset + 22 + commentLength === archive.length) return offset
  }
  throw new Error("end-of-central-directory record is missing or has trailing bytes")
}

function requireBounds(buffer, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`${label} is truncated`)
  }
}

function isCanonicalZipEntryName(value) {
  if (
    value.length === 0
    || value.startsWith("/")
    || /^[A-Za-z]:/.test(value)
    || value.includes("\\")
    || /[\u0000-\u001f\u007f-\u009f]/.test(value)
    || value.normalize("NFC") !== value
  ) return false
  const directory = value.endsWith("/")
  const body = directory ? value.slice(0, -1) : value
  if (body.length === 0 || body.includes("//")) return false
  return body.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}

function isCanonicalRepositoryPath(value) {
  return value.length > 0
    && value.length <= MAX_ENTRY_NAME_BYTES
    && !value.startsWith("/")
    && !/^[A-Za-z]:/.test(value)
    && !value.includes("\\")
    && !value.includes("//")
    && !/[\u0000-\u001f\u007f-\u009f]/.test(value)
    && value.normalize("NFC") === value
    && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}

function repositoryPathToEntry(repositoryPath, ownerDirectory) {
  if (!isInsideOwner(repositoryPath, ownerDirectory)) throw new Error("repository path is outside owner directory")
  return `extension/${repositoryPath.slice(ownerDirectory.length + 1)}`
}

function isInsideOwner(value, ownerDirectory) {
  return value.startsWith(`${ownerDirectory}/`)
}

function parseUtf8Json(content) {
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content))
    return value && typeof value === "object" && !Array.isArray(value) ? value : undefined
  } catch {
    return undefined
  }
}

function closedOwnDataRecord(value, expectedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const ownKeys = Reflect.ownKeys(descriptors)
  if (ownKeys.some((key) => typeof key !== "string")) throw new Error(`${label} must not contain symbol fields`)
  const keys = ownKeys.sort(compareCodeUnits)
  const sortedExpected = expectedKeys.slice().sort(compareCodeUnits)
  if (keys.length !== sortedExpected.length || keys.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(`${label} must contain exactly its closed fields`)
  }
  const result = {}
  for (const key of expectedKeys) {
    const descriptor = descriptors[key]
    if (!descriptor || !("value" in descriptor)) throw new Error(`${label}.${key} must be own data`)
    result[key] = descriptor.value
  }
  return result
}

function ownDataValues(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("value must be an object")
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const result = {}
  for (const key of keys) {
    const descriptor = descriptors[key]
    if (!descriptor || !("value" in descriptor)) throw new Error(`${key} must be own data`)
    result[key] = descriptor.value
  }
  return result
}

function ownDataArray(value, label, limit) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const lengthDescriptor = descriptors.length
  if (!lengthDescriptor || !("value" in lengthDescriptor)) throw new Error(`${label}.length must be own data`)
  const length = lengthDescriptor.value
  if (!Number.isSafeInteger(length) || length < 0 || length > limit) throw new Error(`${label} exceeds its item limit`)
  const expectedKeys = ["length", ...Array.from({ length }, (_, index) => String(index))].sort(compareCodeUnits)
  const ownKeys = Reflect.ownKeys(descriptors)
  if (ownKeys.some((key) => typeof key !== "string")) throw new Error(`${label} must not contain symbol fields`)
  const keys = ownKeys.sort(compareCodeUnits)
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`${label} must be dense own data`)
  }
  const result = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)]
    if (!descriptor || !("value" in descriptor)) throw new Error(`${label}[${index}] must be own data`)
    result.push(descriptor.value)
  }
  return result
}

function isBoundedString(value, byteLimit) {
  return typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= byteLimit
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}

function sha256Content(content) {
  return createHash("sha256").update(content).digest("hex")
}

function crc32(content) {
  let value = 0xffffffff
  for (const byte of content) {
    value ^= byte
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
  }
  return (value ^ 0xffffffff) >>> 0
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : "unknown archive failure"
}

function boundedDiagnosticText(value) {
  const sanitized = String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, "�")
  if (Buffer.byteLength(sanitized, "utf8") <= DIAGNOSTIC_BYTES) return sanitized
  let result = ""
  let bytes = 0
  for (const character of sanitized) {
    const nextBytes = Buffer.byteLength(character, "utf8")
    if (bytes + nextBytes > DIAGNOSTIC_BYTES) break
    result += character
    bytes += nextBytes
  }
  return result
}

function diagnostic(code, path, message) {
  return {
    code: boundedDiagnosticText(code),
    path: boundedDiagnosticText(path),
    message: boundedDiagnosticText(message)
  }
}

function validationResult(diagnostics) {
  const sorted = diagnostics.slice().sort((left, right) => (
    compareCodeUnits(left.path, right.path)
    || compareCodeUnits(left.code, right.code)
    || compareCodeUnits(left.message, right.message)
  )).slice(0, MAX_DIAGNOSTICS)
  return { ok: sorted.length === 0, diagnostics: sorted }
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

module.exports = {
  MAX_ARCHIVE_UNCOMPRESSED_BYTES,
  MAX_ENTRY_UNCOMPRESSED_BYTES,
  WORKFLOW_PACKAGE_EXPECTATION_SCHEMA_VERSION,
  validateVsixContributionPayload
}
