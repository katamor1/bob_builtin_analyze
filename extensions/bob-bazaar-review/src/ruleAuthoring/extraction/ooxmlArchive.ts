import { createHash } from "node:crypto"
import type { BigIntStats } from "node:fs"
import * as fs from "node:fs/promises"
import { inflateRawSync } from "node:zlib"
import { DEFAULT_RULE_AUTHORING_LIMITS, type RuleAuthoringLimits } from "../ruleAuthoringLimits"
import {
  assertStableSourceFingerprint,
  type SourceFingerprint
} from "../ruleSourceHash"
import {
  preflightOoxmlArchive,
  type OoxmlDocumentKind,
  type OoxmlPreflightEntry
} from "./ooxmlPreflight"

type FflateModule = typeof import("fflate")

export type OoxmlNormalization = "none" | "xlsx_minimal_styles"

export interface PreparedOoxmlInput {
  documentKind: OoxmlDocumentKind
  parserInput: Buffer
  normalization: OoxmlNormalization
}

export async function prepareOoxmlParserInput(
  filePath: string,
  expectedFingerprint: SourceFingerprint,
  expectedKind: OoxmlDocumentKind,
  limits: RuleAuthoringLimits
): Promise<PreparedOoxmlInput> {
  const file = await fs.open(filePath, "r")
  try {
    const before = await file.stat({ bigint: true })
    if (!before.isFile()) throw new Error(`OOXML source must be a regular file: ${filePath}`)
    assertStableSourceFingerprint(
      expectedFingerprint,
      fingerprintFromStats(before, expectedFingerprint.sha256)
    )
    const maxSnapshotBytes = boundedSnapshotBytes(limits)
    if (before.size > BigInt(maxSnapshotBytes)) {
      throw new Error(`OOXML source exceeds the ${maxSnapshotBytes}-byte snapshot limit`)
    }
    if (before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("OOXML source byte size exceeds safe snapshot bounds")
    }

    const snapshot = await readSnapshotExactly(file, Number(before.size))
    const sha256 = createHash("sha256").update(snapshot).digest("hex")
    const beforeFingerprint = fingerprintFromStats(before, sha256)
    assertStableSourceFingerprint(expectedFingerprint, beforeFingerprint)

    const after = await file.stat({ bigint: true })
    const afterFingerprint = fingerprintFromStats(after, sha256)
    assertStableSourceFingerprint(beforeFingerprint, afterFingerprint)
    assertStableSourceFingerprint(expectedFingerprint, afterFingerprint)

    const preflight = await preflightOoxmlArchive(snapshot, limits)
    if (preflight.documentKind !== expectedKind) {
      throw new Error(`OOXML document kind does not match .${expectedKind}`)
    }

    const requiresMinimalStylesheet = expectedKind === "xlsx" &&
      !preflight.entryNames.includes("xl/styles.xml") &&
      !preflight.entryNames.includes("xl/sharedStrings.xml")
    if (requiresMinimalStylesheet && preflight.entryNames.includes("__proto__")) {
      throw new Error("Unsafe XLSX compatibility entry")
    }
    const decodedEntries: Record<string, Uint8Array> | undefined = requiresMinimalStylesheet
      ? Object.create(null) as Record<string, Uint8Array>
      : undefined

    for (const entry of preflight.entries) {
      const decoded = decodeEntry(snapshot, entry)
      if (decodedEntries) decodedEntries[entry.name] = decoded
    }

    if (!decodedEntries) {
      return {
        documentKind: preflight.documentKind,
        parserInput: snapshot,
        normalization: "none"
      }
    }

    const fflate = await loadFflate()
    decodedEntries["xl/styles.xml"] = fflate.strToU8(MINIMAL_STYLESHEET)
    return {
      documentKind: preflight.documentKind,
      parserInput: Buffer.from(fflate.zipSync(decodedEntries)),
      normalization: "xlsx_minimal_styles"
    }
  } finally {
    await file.close()
  }
}

function boundedSnapshotBytes(limits: RuleAuthoringLimits): number {
  const value = limits?.maxSourceBytes
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("OOXML snapshot byte limit must be a positive safe integer")
  }
  return Math.min(value, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceBytes)
}

async function readSnapshotExactly(file: fs.FileHandle, length: number): Promise<Buffer> {
  const snapshot = Buffer.alloc(length)
  let offset = 0
  while (offset < snapshot.length) {
    const result = await file.read(snapshot, offset, snapshot.length - offset, offset)
    if (result.bytesRead === 0) throw new Error("OOXML snapshot is truncated while being read")
    offset += result.bytesRead
  }
  return snapshot
}

function fingerprintFromStats(
  stats: BigIntStats,
  sha256: string
): SourceFingerprint {
  return {
    byteSize: stats.size.toString(10),
    mtimeNs: stats.mtimeNs.toString(10),
    device: stats.dev.toString(10),
    inode: stats.ino.toString(10),
    sha256
  }
}

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
  return Uint8Array.from(output)
}

function assertCrc32(output: Uint8Array, entry: OoxmlPreflightEntry): void {
  let crc = 0xffffffff
  for (const byte of output) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]
  if ((crc ^ 0xffffffff) >>> 0 !== entry.crc32) {
    throw new Error(`OOXML entry CRC does not match preflight: ${entry.name}`)
  }
}

function loadFflate(): Promise<FflateModule> {
  return import("fflate")
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
