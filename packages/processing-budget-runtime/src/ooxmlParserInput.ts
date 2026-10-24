import { inflateRawSync } from "node:zlib"
import { BoundedDocumentError } from "./boundedDocumentError"
import { withBoundedDocumentSnapshot } from "./boundedDocumentFile"
import { assertNotAborted, invalidInput, normalizeReadInput, ownData, type BoundedDocumentReadInput, type BoundedDocumentFingerprint } from "./boundedDocumentRequest"
import { preflightOoxmlArchive, type OoxmlDocumentKind, type OoxmlPreflightEntry } from "./ooxmlPreflight"

export type { OoxmlDocumentKind } from "./ooxmlPreflight"
export interface OoxmlStructuralLimits { readonly maxEntries: number; readonly maxExpandedBytes: number }
export interface XlsxZipCodec {
  strToU8(text: string): Uint8Array
  zipSync(entries: Record<string, Uint8Array>): Uint8Array
}
export interface ValidatedOoxmlParserRequest extends BoundedDocumentReadInput {
  readonly expectedFingerprint: BoundedDocumentFingerprint
  readonly documentKind: OoxmlDocumentKind
  readonly structuralLimits: OoxmlStructuralLimits
  readonly loadXlsxCodec: () => Promise<XlsxZipCodec>
}
export interface ValidatedOoxmlParserInput {
  readonly documentKind: OoxmlDocumentKind
  readonly parserInput: Buffer
  readonly normalization: "none" | "xlsx_minimal_styles"
}

function maximum(value: unknown, hard: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) invalidInput()
  return Math.min(value, hard)
}

export async function withValidatedOoxmlParserInput<T>(value: ValidatedOoxmlParserRequest, parse: (input: ValidatedOoxmlParserInput) => Promise<T>): Promise<T> {
  const data = ownData(value, ["filePath", "rootPath", "maximumFileBytes", "target", "ledger", "expectedFingerprint", "documentKind", "structuralLimits", "loadXlsxCodec"], ["signal"])
  if (data.expectedFingerprint === undefined || (data.documentKind !== "docx" && data.documentKind !== "xlsx") || typeof data.loadXlsxCodec !== "function" || typeof parse !== "function") invalidInput()
  const limits = ownData(data.structuralLimits, ["maxEntries", "maxExpandedBytes"])
  const maxEntries = maximum(limits.maxEntries, 5000)
  const maxExpandedBytes = maximum(limits.maxExpandedBytes, 250 * 1048576)
  const input = normalizeReadInput({ filePath: data.filePath, rootPath: data.rootPath, maximumFileBytes: data.maximumFileBytes, target: data.target, ledger: data.ledger, expectedFingerprint: data.expectedFingerprint, signal: data.signal })
  const kind = data.documentKind
  const loadCodec = data.loadXlsxCodec as () => Promise<XlsxZipCodec>
  return withBoundedDocumentSnapshot(input, async ({ bytes }) => {
    let prepared: ValidatedOoxmlParserInput
    try { prepared = await prepareSnapshot(bytes, kind, { maxEntries, maxExpandedBytes }, loadCodec, input.signal) }
    catch (error) {
      if (error instanceof BoundedDocumentError) throw error
      throw new BoundedDocumentError("bounded_document_archive_invalid", { phase: "zip" })
    }
    assertNotAborted(input.signal)
    return parse(prepared)
  })
}

async function prepareSnapshot(snapshot: Buffer, expectedKind: OoxmlDocumentKind, limits: OoxmlStructuralLimits, loadCodec: () => Promise<XlsxZipCodec>, signal?: AbortSignal): Promise<ValidatedOoxmlParserInput> {
  const preflight = await preflightOoxmlArchive(snapshot, { maxOoxmlEntries: limits.maxEntries, maxOoxmlDeclaredUncompressedBytes: limits.maxExpandedBytes })
  if (preflight.documentKind !== expectedKind) throw new BoundedDocumentError("bounded_document_kind_mismatch", { phase: "zip" })
  const requiresMinimalStylesheet = expectedKind === "xlsx" && !preflight.entryNames.includes("xl/styles.xml") && !preflight.entryNames.includes("xl/sharedStrings.xml")
  if (requiresMinimalStylesheet && preflight.entryNames.includes("__proto__")) throw new BoundedDocumentError("bounded_document_archive_invalid", { phase: "zip" })
  const decodedEntries: Record<string, Uint8Array> | undefined = requiresMinimalStylesheet ? Object.create(null) as Record<string, Uint8Array> : undefined
  for (const entry of preflight.entries) {
    assertNotAborted(signal)
    const decoded = decodeEntry(snapshot, entry)
    if (decodedEntries) decodedEntries[entry.name] = decoded
  }
  if (!decodedEntries) return Object.freeze({ documentKind: preflight.documentKind, parserInput: snapshot, normalization: "none" })
  assertNotAborted(signal)
  const codec = await loadCodec()
  if (!codec || typeof codec.strToU8 !== "function" || typeof codec.zipSync !== "function") throw new BoundedDocumentError("bounded_document_archive_invalid", { phase: "zip" })
  decodedEntries["xl/styles.xml"] = codec.strToU8(MINIMAL_STYLESHEET)
  return Object.freeze({ documentKind: preflight.documentKind, parserInput: Buffer.from(codec.zipSync(decodedEntries)), normalization: "xlsx_minimal_styles" })
}

// Entry validation and stylesheet bytes below are moved from the fixed M2 owner.
function decodeEntry(snapshot: Buffer, entry: OoxmlPreflightEntry): Uint8Array {
  const compressed = snapshot.subarray(entry.dataOffset, entry.dataEnd)
  if (compressed.length !== entry.compressedSize) {
    throw new Error(`OOXML entry compressed size does not match preflight: ${entry.name}`)
  }

  let output: Buffer
  if (entry.compressionMethod === 0) {
    if (compressed.length !== entry.uncompressedSize) {
      throw new Error(`OOXML stored entry size does not match preflight: ${entry.name}`)
    }
    output = compressed
  } else {
    let inflated: { buffer: Buffer; engine: { bytesWritten: number } }
    try {
      inflated = inflateRawSync(compressed, {
        info: true,
        maxOutputLength: Math.max(1, entry.uncompressedSize)
      }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } }
    } catch (error) {
      throw new Error(
        `OOXML deflate output exceeds its declared size or is invalid: ${entry.name}`,
        { cause: error }
      )
    }
    if (inflated.engine.bytesWritten !== compressed.length) {
      throw new Error(`OOXML compressed payload was not consumed exactly: ${entry.name}`)
    }
    if (inflated.buffer.length !== entry.uncompressedSize) {
      throw new Error(`OOXML decoded size does not match preflight: ${entry.name}`)
    }
    output = inflated.buffer
  }

  assertCrc32(output, entry)
  return output
}

function assertCrc32(output: Uint8Array, entry: OoxmlPreflightEntry): void {
  let crc = 0xffffffff
  for (const byte of output) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]
  if ((crc ^ 0xffffffff) >>> 0 !== entry.crc32) {
    throw new Error(`OOXML entry CRC does not match preflight: ${entry.name}`)
  }
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

const MINIMAL_STYLESHEET = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  '<cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs>',
  '<cellXfs count="1"><xf numFmtId="0" xfId="0"/></cellXfs>',
  "</styleSheet>"
].join("")
