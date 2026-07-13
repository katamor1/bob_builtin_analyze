import * as fs from "node:fs/promises"
import type { RuleAuthoringLimits } from "../ruleAuthoringLimits"

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const CENTRAL_DIRECTORY_ENTRY_SIGNATURE = 0x02014b50
const ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE = 0x07064b50
const ZIP64_EXTRA_FIELD_ID = 0x0001
const END_OF_CENTRAL_DIRECTORY_BYTES = 22
const MAX_ZIP_COMMENT_BYTES = 0xffff
const ZIP64_LOCATOR_BYTES = 20
const CENTRAL_DIRECTORY_ENTRY_BYTES = 46
const MAX_CENTRAL_DIRECTORY_BYTES = 32 * 1024 * 1024
const MAX_OOXML_ENTRIES = 5_000
const MAX_OOXML_DECLARED_UNCOMPRESSED_BYTES = 250 * 1024 * 1024
const ZIP64_UINT16_MARKER = 0xffff
const ZIP64_UINT32_MARKER = 0xffffffff
const ENCRYPTION_FLAGS = 0x0001 | 0x0040 | 0x2000
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:/

export type OoxmlDocumentKind = "docx" | "xlsx"

export type OoxmlPreflightLimits = Pick<
  RuleAuthoringLimits,
  "maxOoxmlEntries" | "maxOoxmlDeclaredUncompressedBytes"
>

export interface OoxmlPreflightResult {
  entryCount: number
  declaredUncompressedBytes: number
  entryNames: string[]
  documentKind: OoxmlDocumentKind
}

interface EffectiveOoxmlLimits {
  maxEntries: number
  maxDeclaredUncompressedBytes: number
}

interface EndOfCentralDirectory {
  offset: number
  diskNumber: number
  centralDirectoryDisk: number
  entriesOnDisk: number
  entryCount: number
  centralDirectorySize: number
  centralDirectoryOffset: number
}

export async function preflightOoxmlArchive(
  filePath: string,
  limits: OoxmlPreflightLimits
): Promise<OoxmlPreflightResult> {
  const effectiveLimits = effectiveOoxmlLimits(limits)
  const file = await fs.open(filePath, "r")
  try {
    const stats = await file.stat()
    if (!stats.isFile()) throw new Error(`OOXML source must be a regular file: ${filePath}`)
    if (!Number.isSafeInteger(stats.size) || stats.size < END_OF_CENTRAL_DIRECTORY_BYTES) {
      throw new Error("OOXML ZIP end-of-central-directory record is missing")
    }

    const tailLength = Math.min(
      stats.size,
      END_OF_CENTRAL_DIRECTORY_BYTES + MAX_ZIP_COMMENT_BYTES + ZIP64_LOCATOR_BYTES
    )
    const tailOffset = stats.size - tailLength
    const tail = await readExactly(file, tailLength, tailOffset, "OOXML ZIP tail")
    const end = readEndOfCentralDirectory(tail, tailOffset, stats.size)
    assertZip32EndRecord(end, tail, tailOffset)

    if (end.entryCount > effectiveLimits.maxEntries) {
      throw new Error(
        `OOXML ZIP entry count ${end.entryCount} exceeds limit ${effectiveLimits.maxEntries}`
      )
    }
    if (end.centralDirectorySize > MAX_CENTRAL_DIRECTORY_BYTES) {
      throw new Error(
        `OOXML ZIP central directory exceeds bounded ${MAX_CENTRAL_DIRECTORY_BYTES}-byte reader limit`
      )
    }
    if (end.centralDirectorySize < end.entryCount * CENTRAL_DIRECTORY_ENTRY_BYTES) {
      throw new Error("OOXML ZIP central directory is truncated for its declared entry count")
    }

    const centralDirectoryEnd = end.centralDirectoryOffset + end.centralDirectorySize
    if (
      !Number.isSafeInteger(centralDirectoryEnd) ||
      end.centralDirectoryOffset < 0 ||
      centralDirectoryEnd !== end.offset
    ) {
      throw new Error("OOXML ZIP central-directory range must end immediately before EOCD")
    }

    const centralDirectory = await readExactly(
      file,
      end.centralDirectorySize,
      end.centralDirectoryOffset,
      "OOXML ZIP central directory"
    )
    return parseCentralDirectory(centralDirectory, end, effectiveLimits)
  } finally {
    await file.close()
  }
}

function effectiveOoxmlLimits(limits: OoxmlPreflightLimits): EffectiveOoxmlLimits {
  if (!limits || !Number.isSafeInteger(limits.maxOoxmlEntries) || limits.maxOoxmlEntries <= 0) {
    throw new Error("OOXML entry limit must be a positive safe integer")
  }
  if (
    !Number.isSafeInteger(limits.maxOoxmlDeclaredUncompressedBytes) ||
    limits.maxOoxmlDeclaredUncompressedBytes <= 0
  ) {
    throw new Error("OOXML declared uncompressed byte limit must be a positive safe integer")
  }
  return {
    maxEntries: Math.min(limits.maxOoxmlEntries, MAX_OOXML_ENTRIES),
    maxDeclaredUncompressedBytes: Math.min(
      limits.maxOoxmlDeclaredUncompressedBytes,
      MAX_OOXML_DECLARED_UNCOMPRESSED_BYTES
    )
  }
}

async function readExactly(
  file: fs.FileHandle,
  length: number,
  position: number,
  description: string
): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  let bytesRead = 0
  while (bytesRead < length) {
    const result = await file.read(buffer, bytesRead, length - bytesRead, position + bytesRead)
    if (result.bytesRead === 0) throw new Error(`${description} is truncated`)
    bytesRead += result.bytesRead
  }
  return buffer
}

function readEndOfCentralDirectory(
  tail: Buffer,
  tailOffset: number,
  fileSize: number
): EndOfCentralDirectory {
  const firstCandidateOffset = Math.max(
    0,
    fileSize - (END_OF_CENTRAL_DIRECTORY_BYTES + MAX_ZIP_COMMENT_BYTES) - tailOffset
  )
  for (
    let offset = tail.length - END_OF_CENTRAL_DIRECTORY_BYTES;
    offset >= firstCandidateOffset;
    offset -= 1
  ) {
    if (tail.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue
    const commentLength = tail.readUInt16LE(offset + 20)
    const absoluteOffset = tailOffset + offset
    if (absoluteOffset + END_OF_CENTRAL_DIRECTORY_BYTES + commentLength !== fileSize) continue
    return {
      offset: absoluteOffset,
      diskNumber: tail.readUInt16LE(offset + 4),
      centralDirectoryDisk: tail.readUInt16LE(offset + 6),
      entriesOnDisk: tail.readUInt16LE(offset + 8),
      entryCount: tail.readUInt16LE(offset + 10),
      centralDirectorySize: tail.readUInt32LE(offset + 12),
      centralDirectoryOffset: tail.readUInt32LE(offset + 16)
    }
  }
  throw new Error("OOXML ZIP end-of-central-directory record is missing or truncated")
}

function assertZip32EndRecord(
  end: EndOfCentralDirectory,
  tail: Buffer,
  tailOffset: number
): void {
  if (
    end.entriesOnDisk === ZIP64_UINT16_MARKER ||
    end.entryCount === ZIP64_UINT16_MARKER ||
    end.centralDirectorySize === ZIP64_UINT32_MARKER ||
    end.centralDirectoryOffset === ZIP64_UINT32_MARKER
  ) {
    throw new Error("OOXML ZIP64 markers are not supported")
  }

  const locatorOffset = end.offset - ZIP64_LOCATOR_BYTES - tailOffset
  if (
    locatorOffset >= 0 &&
    locatorOffset + ZIP64_LOCATOR_BYTES <= tail.length &&
    tail.readUInt32LE(locatorOffset) === ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE
  ) {
    throw new Error("OOXML ZIP64 locator is not supported")
  }

  if (
    end.diskNumber !== 0 ||
    end.centralDirectoryDisk !== 0 ||
    end.entriesOnDisk !== end.entryCount
  ) {
    throw new Error("OOXML multi-disk ZIP archives are not supported")
  }
}

function parseCentralDirectory(
  buffer: Buffer,
  end: EndOfCentralDirectory,
  limits: EffectiveOoxmlLimits
): OoxmlPreflightResult {
  const entryNames: string[] = []
  const normalizedNames = new Set<string>()
  let declaredUncompressedBytes = 0
  let offset = 0

  for (let index = 0; index < end.entryCount; index += 1) {
    assertAvailable(buffer, offset, CENTRAL_DIRECTORY_ENTRY_BYTES, `entry ${index} header`)
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY_SIGNATURE) {
      throw new Error(`OOXML ZIP central-directory entry ${index} has an invalid signature`)
    }

    const flags = buffer.readUInt16LE(offset + 8)
    const compressionMethod = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const diskNumberStart = buffer.readUInt16LE(offset + 34)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)
    const entryLength = CENTRAL_DIRECTORY_ENTRY_BYTES + fileNameLength + extraLength + commentLength
    assertAvailable(buffer, offset, entryLength, `entry ${index}`)

    const fileNameStart = offset + CENTRAL_DIRECTORY_ENTRY_BYTES
    const fileName = buffer.toString("utf8", fileNameStart, fileNameStart + fileNameLength)
    const extraStart = fileNameStart + fileNameLength
    const extra = buffer.subarray(extraStart, extraStart + extraLength)

    if (
      compressedSize === ZIP64_UINT32_MARKER ||
      uncompressedSize === ZIP64_UINT32_MARKER ||
      localHeaderOffset === ZIP64_UINT32_MARKER ||
      diskNumberStart === ZIP64_UINT16_MARKER
    ) {
      throw new Error(`OOXML ZIP64 marker is not supported for entry ${fileName || index}`)
    }
    assertNoZip64Extra(extra, fileName || String(index))
    if (diskNumberStart !== 0) {
      throw new Error(`OOXML multi-disk ZIP entry is not supported: ${fileName || index}`)
    }
    if (localHeaderOffset + 30 > end.centralDirectoryOffset) {
      throw new Error(`OOXML ZIP local-header offset is outside ZIP32 bounds: ${fileName || index}`)
    }
    if ((flags & ENCRYPTION_FLAGS) !== 0) {
      throw new Error(`OOXML ZIP contains encrypted entry: ${fileName || index}`)
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new Error(
        `OOXML ZIP entry uses unsupported compression method ${compressionMethod}: ${fileName || index}`
      )
    }

    const normalizedName = normalizeSafeEntryName(fileName)
    if (normalizedNames.has(normalizedName)) {
      throw new Error(`OOXML ZIP contains duplicate entry: ${fileName}`)
    }
    normalizedNames.add(normalizedName)
    entryNames.push(fileName)

    declaredUncompressedBytes += uncompressedSize
    if (
      !Number.isSafeInteger(declaredUncompressedBytes) ||
      declaredUncompressedBytes > limits.maxDeclaredUncompressedBytes
    ) {
      throw new Error(
        `OOXML ZIP declared uncompressed bytes ${declaredUncompressedBytes} exceed limit ${limits.maxDeclaredUncompressedBytes}`
      )
    }
    offset += entryLength
  }

  if (offset !== buffer.length) {
    throw new Error("OOXML ZIP central-directory size does not match its declared entries")
  }

  return {
    entryCount: entryNames.length,
    declaredUncompressedBytes,
    entryNames,
    documentKind: detectDocumentKind(new Set(entryNames))
  }
}

function assertAvailable(buffer: Buffer, offset: number, length: number, description: string): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > buffer.length
  ) {
    throw new Error(`OOXML ZIP central-directory ${description} is truncated`)
  }
}

function assertNoZip64Extra(extra: Buffer, entryName: string): void {
  let offset = 0
  while (offset < extra.length) {
    if (offset + 4 > extra.length) {
      throw new Error(`OOXML ZIP entry has malformed extra fields: ${entryName}`)
    }
    const headerId = extra.readUInt16LE(offset)
    const dataLength = extra.readUInt16LE(offset + 2)
    if (offset + 4 + dataLength > extra.length) {
      throw new Error(`OOXML ZIP entry has truncated extra fields: ${entryName}`)
    }
    if (headerId === ZIP64_EXTRA_FIELD_ID) {
      throw new Error(`OOXML ZIP64 extra field is not supported: ${entryName}`)
    }
    offset += 4 + dataLength
  }
}

function normalizeSafeEntryName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/")
  const pathWithoutTrailingSlash = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized
  const segments = pathWithoutTrailingSlash.split("/")
  if (
    !pathWithoutTrailingSlash ||
    CONTROL_CHARACTER.test(fileName) ||
    normalized.startsWith("/") ||
    WINDOWS_DRIVE_PATH.test(normalized) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe OOXML entry path: ${JSON.stringify(fileName)}`)
  }
  return pathWithoutTrailingSlash
}

function detectDocumentKind(entryNames: ReadonlySet<string>): OoxmlDocumentKind {
  const hasContentTypes = entryNames.has("[Content_Types].xml")
  const hasDocxSignature = hasContentTypes && entryNames.has("word/document.xml")
  const hasXlsxSignature = hasContentTypes && entryNames.has("xl/workbook.xml")
  if (hasDocxSignature === hasXlsxSignature) {
    throw new Error("OOXML ZIP must contain exactly one supported DOCX or XLSX signature")
  }
  return hasDocxSignature ? "docx" : "xlsx"
}
