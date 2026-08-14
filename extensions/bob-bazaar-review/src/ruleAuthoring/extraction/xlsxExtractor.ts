import * as fs from "node:fs/promises"
import { inflateRawSync } from "node:zlib"
import { splitDocumentChunk } from "../documentChunk"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "../ruleAuthoringLimits"
import type { DocumentChunkV1, RuleSourceExtractionStatus } from "../ruleAuthoringTypes"
import type { OoxmlPreflightEntry } from "./ooxmlPreflight"

type ExcelFileModule = typeof import("read-excel-file/node")
type FflateModule = typeof import("fflate")

export interface XlsxExtractionContext {
  sourceId: string
  maxChunkBytes: number
  ooxmlEntryNames?: readonly string[]
  ooxmlDeclaredUncompressedBytes?: number
  ooxmlArchiveByteLength?: number
  ooxmlEntries?: readonly OoxmlPreflightEntry[]
}

export interface XlsxExtractionResult {
  chunks: DocumentChunkV1[]
  status: RuleSourceExtractionStatus
  warnings: string[]
  extractor: { id: string; version: string }
}

const XLSX_EXTRACTOR = Object.freeze({ id: "xlsx-read-excel-rows", version: "1" })

let excelFileModulePromise: Promise<ExcelFileModule> | undefined

export async function extractXlsx(
  filePath: string,
  context: XlsxExtractionContext
): Promise<XlsxExtractionResult> {
  const maxChunkBytes = boundedPositiveLimit(
    context.maxChunkBytes,
    DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes,
    "XLSX chunk byte limit"
  )
  const workbookInput = await xlsxReadInput(filePath, context)
  const readExcelFile = await loadExcelFile()
  const workbook = await readExcelFile.default(workbookInput)
  const chunks: DocumentChunkV1[] = []

  for (const sheet of workbook) {
    for (const [rowIndex, row] of sheet.data.entries()) {
      const nonEmptyColumns: number[] = []
      for (const [columnIndex, cell] of row.entries()) {
        if (isNonEmptyCell(cell)) nonEmptyColumns.push(columnIndex)
      }
      if (nonEmptyColumns.length === 0) continue

      const firstColumn = nonEmptyColumns[0]
      const lastColumn = nonEmptyColumns.at(-1) ?? firstColumn
      const excelRow = rowIndex + 1
      const text = row.slice(firstColumn, lastColumn + 1).map(cellText).join("\t")
      chunks.push(...splitDocumentChunk({
        sourceId: context.sourceId,
        mediaType: "xlsx",
        kind: "row",
        locator: {
          sheet: sheet.sheet,
          row: excelRow,
          cell_range: `${columnName(firstColumn)}${excelRow}:${columnName(lastColumn)}${excelRow}`
        },
        title: sheet.sheet,
        text
      }, maxChunkBytes))
    }
  }

  return {
    chunks,
    status: "success",
    warnings: [],
    extractor: { ...XLSX_EXTRACTOR }
  }
}

function boundedPositiveLimit(value: number, ceiling: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`)
  return Math.min(value, ceiling)
}

function isNonEmptyCell(value: unknown): boolean {
  return value !== null && value !== undefined && (typeof value !== "string" || value.length > 0)
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString()
  return String(value).replace(/[\t\r\n]+/g, " ")
}

function columnName(zeroBasedColumn: number): string {
  let column = zeroBasedColumn + 1
  let output = ""
  while (column > 0) {
    const remainder = (column - 1) % 26
    output = String.fromCharCode(65 + remainder) + output
    column = Math.floor((column - 1) / 26)
  }
  return output
}

function loadExcelFile(): Promise<ExcelFileModule> {
  excelFileModulePromise ??= import("read-excel-file/node")
  return excelFileModulePromise
}

async function xlsxReadInput(
  filePath: string,
  context: XlsxExtractionContext
): Promise<string | Buffer> {
  const entryNames = context.ooxmlEntryNames
  if (!requiresMinimalStylesheet(entryNames)) return filePath

  assertSafeCompatibilityEntryNames(entryNames)
  const declaredByteLimit = compatibilityDeclaredByteLimit(context.ooxmlDeclaredUncompressedBytes)
  const archiveByteLength = compatibilityArchiveByteLength(context.ooxmlArchiveByteLength)
  const preflightEntries = compatibilityPreflightEntries(context.ooxmlEntries, entryNames, declaredByteLimit)
  const entries = expandPreflightEntries(
    await fs.readFile(filePath),
    archiveByteLength,
    preflightEntries
  )
  const fflate = await loadFflate()
  entries["xl/styles.xml"] = fflate.strToU8(MINIMAL_STYLESHEET)
  return Buffer.from(fflate.zipSync(entries))
}

function requiresMinimalStylesheet(entryNames: readonly string[] | undefined): entryNames is readonly string[] {
  return entryNames !== undefined &&
    !entryNames.includes("xl/styles.xml") &&
    !entryNames.includes("xl/sharedStrings.xml")
}

function loadFflate(): Promise<FflateModule> {
  return import("fflate")
}

function assertSafeCompatibilityEntryNames(entryNames: readonly string[]): void {
  if (entryNames.includes("__proto__")) throw new Error("Unsafe XLSX compatibility entry")
}

function compatibilityDeclaredByteLimit(value: number | undefined): number {
  if (
    !Number.isSafeInteger(value) ||
    value === undefined ||
    value < 0 ||
    value > DEFAULT_RULE_AUTHORING_LIMITS.maxOoxmlDeclaredUncompressedBytes
  ) {
    throw new Error("XLSX compatibility requires a valid preflight declared byte total")
  }
  return value
}

function compatibilityArchiveByteLength(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || value === undefined || value < 0) {
    throw new Error("XLSX compatibility requires a valid preflight archive byte length")
  }
  return value
}

function compatibilityPreflightEntries(
  entries: readonly OoxmlPreflightEntry[] | undefined,
  entryNames: readonly string[],
  declaredUncompressedBytes: number
): readonly OoxmlPreflightEntry[] {
  if (!Array.isArray(entries) || entries.length !== entryNames.length) {
    throw new Error("XLSX compatibility archive entries do not match preflight")
  }
  const expectedNames = new Set(entryNames)
  const seenNames = new Set<string>()
  let observedUncompressedBytes = 0
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry.name !== "string" ||
      !expectedNames.has(entry.name) ||
      seenNames.has(entry.name) ||
      !isUint16(entry.flags) ||
      (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) ||
      !isUint32(entry.crc32) ||
      !isNonNegativeSafeInteger(entry.compressedSize) ||
      !isNonNegativeSafeInteger(entry.uncompressedSize) ||
      !isNonNegativeSafeInteger(entry.localHeaderOffset) ||
      !isNonNegativeSafeInteger(entry.dataOffset) ||
      !isNonNegativeSafeInteger(entry.dataEnd) ||
      entry.dataOffset + entry.compressedSize !== entry.dataEnd
    ) {
      throw new Error("XLSX compatibility archive entries do not match preflight")
    }
    if (entry.compressionMethod === 0 && entry.compressedSize !== entry.uncompressedSize) {
      throw new Error(`XLSX compatibility stored entry size mismatch: ${entry.name}`)
    }
    observedUncompressedBytes += entry.uncompressedSize
    if (
      !Number.isSafeInteger(observedUncompressedBytes) ||
      observedUncompressedBytes > declaredUncompressedBytes
    ) {
      throw new Error("XLSX compatibility expansion exceeds preflight declared bytes")
    }
    seenNames.add(entry.name)
  }
  if (
    seenNames.size !== expectedNames.size ||
    observedUncompressedBytes !== declaredUncompressedBytes
  ) {
    throw new Error("XLSX compatibility archive metadata does not match preflight")
  }
  return entries
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff
}

function isUint16(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff
}

function expandPreflightEntries(
  archiveBytes: Buffer,
  archiveByteLength: number,
  preflightEntries: readonly OoxmlPreflightEntry[]
): Record<string, Uint8Array> {
  if (archiveBytes.length !== archiveByteLength) {
    throw new Error("XLSX compatibility archive byte length changed after preflight")
  }
  const entries: Record<string, Uint8Array> = Object.create(null)
  for (const entry of preflightEntries) entries[entry.name] = expandPreflightEntry(archiveBytes, entry)
  return entries
}

function expandPreflightEntry(
  archiveBytes: Buffer,
  entry: OoxmlPreflightEntry
): Uint8Array {
  if (entry.dataEnd > archiveBytes.length) {
    throw new Error(`XLSX compatibility entry payload is outside the preflight archive: ${entry.name}`)
  }
  const compressed = archiveBytes.subarray(entry.dataOffset, entry.dataEnd)
  if (entry.compressionMethod === 0) {
    if (compressed.length !== entry.uncompressedSize) {
      throw new Error(`XLSX compatibility stored entry size mismatch: ${entry.name}`)
    }
    const output = Uint8Array.from(compressed)
    assertCompatibilityCrc32(output, entry)
    return output
  }

  let inflated: { buffer: Buffer; engine: { bytesWritten: number } }
  try {
    inflated = inflateRawSync(compressed, {
      info: true,
      maxOutputLength: Math.max(1, entry.uncompressedSize)
    }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } }
  } catch (error) {
    throw new Error(
      `XLSX compatibility deflate output exceeds its declared size or is invalid: ${entry.name}`,
      { cause: error }
    )
  }
  if (inflated.engine.bytesWritten !== compressed.length) {
    throw new Error(`XLSX compatibility compressed payload was not consumed exactly: ${entry.name}`)
  }
  if (inflated.buffer.length !== entry.uncompressedSize) {
    throw new Error(`XLSX compatibility decoded size does not match preflight: ${entry.name}`)
  }
  const output = Uint8Array.from(inflated.buffer)
  assertCompatibilityCrc32(output, entry)
  return output
}

function assertCompatibilityCrc32(output: Uint8Array, entry: OoxmlPreflightEntry): void {
  let crc = 0xffffffff
  for (const byte of output) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]
  if ((crc ^ 0xffffffff) >>> 0 !== entry.crc32) {
    throw new Error(`XLSX compatibility entry CRC does not match preflight: ${entry.name}`)
  }
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

const MINIMAL_STYLESHEET = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  '<cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs>',
  '<cellXfs count="1"><xf numFmtId="0" xfId="0"/></cellXfs>',
  "</styleSheet>"
].join("")
