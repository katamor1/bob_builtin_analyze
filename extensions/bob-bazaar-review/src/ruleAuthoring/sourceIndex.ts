import { createHash } from "node:crypto"
import {
  DocumentChunkKind,
  DocumentChunkLocatorV1,
  DocumentChunkV1,
  RuleSourceExtractionStatus,
  RuleSourceManifestV1,
  RuleSourceMediaType
} from "./ruleAuthoringTypes"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "./ruleAuthoringLimits"
import { sanitizeRemoteSafeText } from "./remoteSafeText"

const INDEX_SCHEMA_VERSION = "bob-bazaar-review/rule-source-index/v1" as const
const MANIFEST_SCHEMA_VERSION = "bob-bazaar-review/rule-sources/v1" as const
const PREVIEW_MAX_BYTES = 240
const DISPLAY_FIELD_MAX_BYTES = 240
const LOGICAL_NAME_MAX_BYTES = 255
const MAX_RAW_DISPLAY_BYTES = DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes
const MAX_HEADING_PATH_PARTS = 64
const MAX_INDEX_CHUNKS = Math.floor(DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes / 128)
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SOURCE_ID_PATTERN = /^src-([a-f0-9]{12,64})$/
const CHUNK_ID_PATTERN = /^chunk-[a-f0-9]{64}$/
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/

export interface RuleSourceIndexChunkV1 {
  chunk_id: string
  kind: DocumentChunkKind
  locator: DocumentChunkLocatorV1
  title?: string
  preview: string
  text_sha256: string
  text_byte_size: number
}

export interface RuleSourceIndexSourceV1 {
  source_id: string
  logical_name: string
  media_type: RuleSourceMediaType
  sha256: string
  byte_size: number
  extraction_status: RuleSourceExtractionStatus
  chunks: RuleSourceIndexChunkV1[]
}

export interface RuleSourceIndexV1 {
  schema_version: typeof INDEX_SCHEMA_VERSION
  generated_at: string
  sources: RuleSourceIndexSourceV1[]
}

export function buildRuleSourceIndex(
  manifest: RuleSourceManifestV1,
  chunks: readonly DocumentChunkV1[],
  limitBytes: number
): RuleSourceIndexV1 {
  assertPositiveByteLimit(limitBytes)
  const effectiveLimitBytes = Math.min(limitBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes)
  if (
    !isPlainObject(manifest) ||
    manifest.schema_version !== MANIFEST_SCHEMA_VERSION ||
    !Array.isArray(manifest.sources)
  ) {
    throw new Error("Rule source index manifest has an invalid schema version")
  }
  if (manifest.sources.length > DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles) {
    throw new Error("Rule source index source count exceeds its limit")
  }
  if (!Array.isArray(chunks) || chunks.length > MAX_INDEX_CHUNKS) {
    throw new Error("Rule source index chunk count exceeds its limit")
  }

  const sourcesById = new Map<string, RuleSourceManifestV1["sources"][number]>()
  const sourceHashes = new Set<string>()
  for (const source of manifest.sources) {
    assertManifestSource(source)
    if (sourcesById.has(source.source_id) || sourceHashes.has(source.sha256)) {
      throw new Error("Rule source index manifest contains duplicate source identity")
    }
    sourcesById.set(source.source_id, source)
    sourceHashes.add(source.sha256)
  }

  const chunksBySource = new Map<string, RuleSourceIndexChunkV1[]>()
  const chunkIds = new Set<string>()
  for (const [position, chunk] of chunks.entries()) {
    const source = sourcesById.get(chunk.source_id)
    if (!source) throw invalidChunk(position)
    if (chunkIds.has(chunk.chunk_id)) throw invalidChunk(position)
    chunkIds.add(chunk.chunk_id)
    const indexedChunk = buildIndexedChunk(chunk, position)
    const sourceChunks = chunksBySource.get(source.source_id) ?? []
    sourceChunks.push(indexedChunk)
    chunksBySource.set(source.source_id, sourceChunks)
  }

  const index: RuleSourceIndexV1 = {
    schema_version: INDEX_SCHEMA_VERSION,
    generated_at: assertGeneratedAt(manifest.generated_at),
    sources: [...sourcesById.values()]
      .sort((left, right) => compareText(left.source_id, right.source_id))
      .map((source) => ({
        source_id: source.source_id,
        logical_name: sanitizeRemoteSafeText(source.logical_name, LOGICAL_NAME_MAX_BYTES),
        media_type: source.media_type,
        sha256: source.sha256,
        byte_size: source.byte_size,
        extraction_status: source.extraction_status,
        chunks: (chunksBySource.get(source.source_id) ?? [])
          .sort((left, right) => compareText(left.chunk_id, right.chunk_id))
      }))
  }

  if (Buffer.byteLength(serializeRuleSourceIndex(index), "utf8") > effectiveLimitBytes) {
    throw new Error("Rule source index exceeds its byte limit")
  }
  return index
}

export function serializeRuleSourceIndex(index: RuleSourceIndexV1): string {
  return `${JSON.stringify(index, null, 2)}\n`
}

function buildIndexedChunk(chunk: DocumentChunkV1, position: number): RuleSourceIndexChunkV1 {
  if (
    chunk.schema_version !== "bob-bazaar-review/document-chunk/v1" ||
    !CHUNK_ID_PATTERN.test(chunk.chunk_id) ||
    !SHA256_PATTERN.test(chunk.text_sha256) ||
    typeof chunk.text !== "string" ||
    !isBoundedDisplayInput(chunk.text) ||
    sha256(chunk.text) !== chunk.text_sha256 ||
    !isChunkKind(chunk.kind) ||
    !isPlainObject(chunk.locator)
  ) {
    throw invalidChunk(position)
  }

  const indexed: RuleSourceIndexChunkV1 = {
    chunk_id: chunk.chunk_id,
    kind: chunk.kind,
    locator: sanitizeLocator(chunk.locator, position),
    preview: boundedDisplayText(chunk.text, PREVIEW_MAX_BYTES),
    text_sha256: chunk.text_sha256,
    text_byte_size: Buffer.byteLength(chunk.text, "utf8")
  }
  if (chunk.title !== undefined) {
    if (typeof chunk.title !== "string" || !isBoundedDisplayInput(chunk.title)) throw invalidChunk(position)
    indexed.title = boundedDisplayText(chunk.title, DISPLAY_FIELD_MAX_BYTES)
  }
  return indexed
}

function sanitizeLocator(locator: DocumentChunkLocatorV1, position: number): DocumentChunkLocatorV1 {
  const allowedKeys = new Set([
    "heading_path",
    "block_index",
    "table_index",
    "sheet",
    "row",
    "cell_range",
    "page",
    "part_index"
  ])
  if (Object.keys(locator).some((key) => !allowedKeys.has(key))) throw invalidChunk(position)

  const output: DocumentChunkLocatorV1 = {}
  if (locator.heading_path !== undefined) {
    if (
      !Array.isArray(locator.heading_path) ||
      locator.heading_path.length > MAX_HEADING_PATH_PARTS ||
      locator.heading_path.some((part) => typeof part !== "string" || !isBoundedDisplayInput(part))
    ) {
      throw invalidChunk(position)
    }
    output.heading_path = locator.heading_path.map((part) => boundedDisplayText(part, DISPLAY_FIELD_MAX_BYTES))
  }
  copySafeInteger(locator, output, "block_index", position)
  copySafeInteger(locator, output, "table_index", position)
  if (locator.sheet !== undefined) {
    if (typeof locator.sheet !== "string" || !isBoundedDisplayInput(locator.sheet)) throw invalidChunk(position)
    output.sheet = boundedDisplayText(locator.sheet, DISPLAY_FIELD_MAX_BYTES)
  }
  copySafeInteger(locator, output, "row", position)
  if (locator.cell_range !== undefined) {
    if (typeof locator.cell_range !== "string" || !isBoundedDisplayInput(locator.cell_range)) {
      throw invalidChunk(position)
    }
    output.cell_range = boundedDisplayText(locator.cell_range, DISPLAY_FIELD_MAX_BYTES)
  }
  copySafeInteger(locator, output, "page", position)
  copySafeInteger(locator, output, "part_index", position)
  return output
}

function copySafeInteger(
  input: DocumentChunkLocatorV1,
  output: DocumentChunkLocatorV1,
  key: "block_index" | "table_index" | "row" | "page" | "part_index",
  position: number
): void {
  const value = input[key]
  if (value === undefined) return
  if (!Number.isSafeInteger(value) || value < 0) throw invalidChunk(position)
  Object.assign(output, { [key]: value })
}

function assertManifestSource(source: RuleSourceManifestV1["sources"][number]): void {
  const match = typeof source.source_id === "string" ? SOURCE_ID_PATTERN.exec(source.source_id) : null
  if (
    !match ||
    !SHA256_PATTERN.test(source.sha256) ||
    !source.sha256.startsWith(match[1]) ||
    !isLogicalName(source.logical_name) ||
    !Number.isSafeInteger(source.byte_size) ||
    source.byte_size < 0 ||
    !isMediaType(source.media_type) ||
    !isExtractionStatus(source.extraction_status)
  ) {
    throw new Error("Rule source index manifest contains invalid source metadata")
  }
}

function assertGeneratedAt(value: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error("Rule source index manifest has invalid generated timestamp")
  }
  return value
}

function isLogicalName(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !CONTROL_CHARACTER.test(value) &&
    Buffer.byteLength(value, "utf8") <= 255
  )
}

function isMediaType(value: string): value is RuleSourceMediaType {
  return value === "docx" || value === "xlsx" || value === "pdf"
}

function isExtractionStatus(value: string): value is RuleSourceExtractionStatus {
  return (
    value === "success" ||
    value === "partial" ||
    value === "blocked" ||
    value === "requires_conversion" ||
    value === "requires_ocr"
  )
}

function isChunkKind(value: string): value is DocumentChunkKind {
  return (
    value === "heading" ||
    value === "paragraph" ||
    value === "list" ||
    value === "table" ||
    value === "row" ||
    value === "page"
  )
}

function boundedDisplayText(value: string, maxBytes: number): string {
  if (!isBoundedDisplayInput(value)) throw new Error("Rule source index display field exceeds its byte limit")
  return sanitizeRemoteSafeText(value, maxBytes)
}

function isBoundedDisplayInput(value: string): boolean {
  return (
    value.length <= MAX_RAW_DISPLAY_BYTES &&
    Buffer.byteLength(value, "utf8") <= MAX_RAW_DISPLAY_BYTES
  )
}

function assertPositiveByteLimit(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Rule source index byte limit must be a positive safe integer")
  }
}

function invalidChunk(position: number): Error {
  return new Error(`Rule source index chunk at position ${position} is invalid or inconsistent`)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}
