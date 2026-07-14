import { createHash } from "node:crypto"
import { URL } from "node:url"
import {
  DocumentChunkKind,
  DocumentChunkLocatorV1,
  DocumentChunkV1,
  RuleSourceExtractionStatus,
  RuleSourceManifestV1,
  RuleSourceMediaType
} from "./ruleAuthoringTypes"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "./ruleAuthoringLimits"

const INDEX_SCHEMA_VERSION = "bob-bazaar-review/rule-source-index/v1" as const
const MANIFEST_SCHEMA_VERSION = "bob-bazaar-review/rule-sources/v1" as const
const PREVIEW_MAX_BYTES = 240
const DISPLAY_FIELD_MAX_BYTES = 240
const MAX_RAW_DISPLAY_BYTES = DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes
const MAX_HEADING_PATH_PARTS = 64
const MAX_HTTP_URL_NESTING = 4
const MAX_HTTP_URL_TOKENS = 1_024
const MAX_COMBINING_MARK_LOOKBEHIND = 32
const EMOJI_SEQUENCE_MARK = /^[\ufe0e\ufe0f\u20e3]$/u
const SAFE_SYMBOL_STATUS_PAIRS: ReadonlySet<string> = new Set([
  "○/×",
  "◯/×",
  "〇/×",
  "△/○",
  "✓/✕",
  "✅/❌",
  "×/÷",
  "→/←",
  "★/☆"
])
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
        logical_name: source.logical_name,
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
  const redacted = redactSensitiveText(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
  return truncateUtf8(redacted, maxBytes)
}

function redactSensitiveText(value: string): string {
  const pathRedacted = redactPathsPreservingHttpUrls(
    value,
    0,
    { remainingHttpTokens: MAX_HTTP_URL_TOKENS },
    false
  )
  return pathRedacted
    .replace(/\b(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED_SECRET]")
    .replace(/\b(api[_-]?key|access[_-]?token|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED_SECRET]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_SECRET]")
}

function redactPathsPreservingHttpUrls(
  value: string,
  depth: number,
  budget: { remainingHttpTokens: number },
  inUrlSuffix: boolean
): string {
  if (depth >= MAX_HTTP_URL_NESTING || budget.remainingHttpTokens <= 0) {
    return redactLocalPaths(value, !inUrlSuffix)
  }

  const httpUrlPattern = inUrlSuffix
    ? /(?<![A-Za-z0-9+.\-])https?:\/\/[^\s&;#]+/giu
    : /(?<![A-Za-z0-9+.\-])https?:\/\/\S+/giu
  let output = ""
  let cursor = 0
  for (const match of value.matchAll(httpUrlPattern)) {
    if (match.index === undefined) continue
    if (budget.remainingHttpTokens <= 0) {
      output += redactLocalPaths(value.slice(cursor), !inUrlSuffix)
      return output
    }
    output += redactLocalPaths(value.slice(cursor, match.index), !inUrlSuffix)
    budget.remainingHttpTokens -= 1
    output += redactHttpUrlToken(match[0], depth, budget)
    cursor = match.index + match[0].length
  }
  return output + redactLocalPaths(value.slice(cursor), !inUrlSuffix)
}

function redactHttpUrlToken(
  candidate: string,
  depth: number,
  budget: { remainingHttpTokens: number }
): string {
  const queryOffset = candidate.indexOf("?")
  const fragmentOffset = candidate.indexOf("#")
  const suffixOffsets = [queryOffset, fragmentOffset].filter((offset) => offset >= 0)
  const suffixOffset = suffixOffsets.length > 0 ? Math.min(...suffixOffsets) : candidate.length
  const protectedPrefix = candidate.slice(0, suffixOffset)
  if (!isValidHttpUrlPrefix(protectedPrefix)) return redactLocalPaths(candidate, false)
  if (suffixOffset === candidate.length) return candidate
  return protectedPrefix + redactPathsPreservingHttpUrls(
    candidate.slice(suffixOffset),
    depth + 1,
    budget,
    true
  )
}

function isValidHttpUrlPrefix(value: string): boolean {
  const scheme = /^https?:\/\//iu.exec(value)
  if (!scheme || value.includes("\\")) return false
  const authorityAndPath = value.slice(scheme[0].length)
  if (!authorityAndPath || /^[\\/?#]/u.test(authorityAndPath)) return false
  const authorityEnd = authorityAndPath.search(/[/?#]/u)
  const authority = authorityEnd >= 0
    ? authorityAndPath.slice(0, authorityEnd)
    : authorityAndPath
  if (!authority || authority === "." || authority === "..") return false
  try {
    const parsed = new URL(value)
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0
  } catch {
    return false
  }
}

function redactLocalPaths(value: string, allowSymbolStatusPairs: boolean): string {
  return value
    .replace(/\bfile:(?:[\\/]+|[A-Za-z]:[\\/])[^\s&#;?]*/giu, "[REDACTED_PATH]")
    .replace(
      /(^|[^\p{L}\p{N}+.\-])((?:\\\\|\/\/)[^\s&#;?]+)/gu,
      "$1[REDACTED_PATH]"
    )
    .replace(/\b[A-Za-z]:(?:[\\/]|(?=[^\s&#;?]))[^\s&#;?]*/gu, "[REDACTED_PATH]")
    .replace(
      /(^|[^\p{L}\p{N}._~+%\\/-])([\\/](?![\\/\s&#;?])[^\s&#;?]*)/gu,
      (
        match: string,
        prefix: string,
        rootPath: string,
        offset: number,
        input: string
      ) => redactRootPathCandidate(
        match,
        prefix,
        rootPath,
        offset,
        input,
        allowSymbolStatusPairs
      )
    )
}

function redactRootPathCandidate(
  match: string,
  prefix: string,
  rootPath: string,
  offset: number,
  input: string,
  allowSymbolStatusPairs: boolean
): string {
  const body = rootPath.slice(1)
  const markContinuesWord = isWordCombiningMarkContinuation(input, offset, prefix, rootPath)
  const isSymbolStatusPair = (
    allowSymbolStatusPairs &&
    rootPath.startsWith("/") &&
    SAFE_SYMBOL_STATUS_PAIRS.has(match)
  )
  if (markContinuesWord || (!/[\\/]/u.test(body) && isSymbolStatusPair)) return match
  return `${prefix}[REDACTED_PATH]`
}

function isWordCombiningMarkContinuation(
  value: string,
  offset: number,
  prefix: string,
  rootPath: string
): boolean {
  if (!rootPath.startsWith("/") || !/^\p{M}$/u.test(prefix) || EMOJI_SEQUENCE_MARK.test(prefix)) {
    return false
  }
  let cursor = offset
  for (let examined = 0; examined < MAX_COMBINING_MARK_LOOKBEHIND; examined += 1) {
    const candidate = codePointBefore(value, cursor)
    if (!candidate || EMOJI_SEQUENCE_MARK.test(candidate)) return false
    if (!/^\p{M}$/u.test(candidate)) return /^[\p{L}\p{N}]$/u.test(candidate)
    cursor -= candidate.length
  }
  return false
}

function codePointBefore(value: string, offset: number): string {
  if (offset <= 0) return ""
  const finalCodeUnit = value.charCodeAt(offset - 1)
  if (finalCodeUnit >= 0xdc00 && finalCodeUnit <= 0xdfff && offset >= 2) {
    const precedingCodeUnit = value.charCodeAt(offset - 2)
    if (precedingCodeUnit >= 0xd800 && precedingCodeUnit <= 0xdbff) {
      return value.slice(offset - 2, offset)
    }
  }
  return value.slice(offset - 1, offset)
}

function isBoundedDisplayInput(value: string): boolean {
  return (
    value.length <= MAX_RAW_DISPLAY_BYTES &&
    Buffer.byteLength(value, "utf8") <= MAX_RAW_DISPLAY_BYTES
  )
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value
  const ellipsis = "…"
  const contentLimit = maxBytes - Buffer.byteLength(ellipsis, "utf8")
  let output = ""
  let bytes = 0
  for (const codePoint of value) {
    const codePointBytes = Buffer.byteLength(codePoint, "utf8")
    if (bytes + codePointBytes > contentLimit) break
    output += codePoint
    bytes += codePointBytes
  }
  return `${output}${ellipsis}`
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
