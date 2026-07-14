import { createHash } from "node:crypto"
import { DocumentChunkV1 } from "./ruleAuthoringTypes"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "./ruleAuthoringLimits"
import { RuleSourceIndexV1 } from "./sourceIndex"

const SELECTION_SCHEMA_VERSION = "bob-bazaar-review/rule-evidence-selection/v1" as const
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SOURCE_ID_PATTERN = /^src-[a-f0-9]{12,64}$/
const CHUNK_ID_PATTERN = /^chunk-[a-f0-9]{64}$/
const MAX_SELECTION_ITEMS = Math.floor(DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes / 128)
const MAX_INDEX_CHUNKS = Math.floor(DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes / 128)
const EVIDENCE_BOUNDARY = /<<<(?:UNTRUSTED_RULE_EVIDENCE|END_UNTRUSTED_RULE_EVIDENCE) boundary=(\d+)\b/g

export interface RuleEvidenceSelectionItemV1 {
  source_id: string
  chunk_id: string
  text_sha256: string
}

export interface RuleEvidenceSelectionV1 {
  schema_version: typeof SELECTION_SCHEMA_VERSION
  selected_chunks: RuleEvidenceSelectionItemV1[]
}

export function parseEvidenceSelection(
  raw: string,
  index: RuleSourceIndexV1
): RuleEvidenceSelectionV1 {
  if (typeof raw !== "string") throw malformedSelection()
  if (Buffer.byteLength(raw, "utf8") > DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes) {
    throw new Error("Evidence selection exceeds its byte limit")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw malformedSelection()
  }
  assertSelectionShape(parsed)

  const indexedChunks = buildIndexLookup(index)
  const seenChunkIds = new Set<string>()
  const selectedChunks: RuleEvidenceSelectionItemV1[] = []
  for (const [position, item] of parsed.selected_chunks.entries()) {
    const indexed = indexedChunks.get(item.chunk_id)
    if (
      !indexed ||
      indexed.source_id !== item.source_id ||
      indexed.text_sha256 !== item.text_sha256
    ) {
      throw mismatchedSelection(position)
    }
    if (seenChunkIds.has(item.chunk_id)) continue
    seenChunkIds.add(item.chunk_id)
    selectedChunks.push({
      source_id: item.source_id,
      chunk_id: item.chunk_id,
      text_sha256: item.text_sha256
    })
  }

  return {
    schema_version: SELECTION_SCHEMA_VERSION,
    selected_chunks: selectedChunks
  }
}

export function loadSelectedEvidence(
  selection: RuleEvidenceSelectionV1,
  chunks: readonly DocumentChunkV1[],
  limitBytes: number
): string {
  assertPositiveByteLimit(limitBytes)
  const effectiveLimitBytes = Math.min(
    limitBytes,
    DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes
  )
  assertSelectionShape(selection)
  if (!Array.isArray(chunks) || chunks.length > MAX_INDEX_CHUNKS) {
    throw new Error("Evidence source chunk count exceeds its limit")
  }

  const chunksById = new Map<string, DocumentChunkV1>()
  const duplicateChunkIds = new Set<string>()
  for (const chunk of chunks) {
    if (chunksById.has(chunk.chunk_id)) duplicateChunkIds.add(chunk.chunk_id)
    else chunksById.set(chunk.chunk_id, chunk)
  }

  const seenSelectionIds = new Set<string>()
  let selectedTextBytes = 0
  const selected: Array<{
    item: RuleEvidenceSelectionItemV1
    chunk: DocumentChunkV1
  }> = []
  for (const [position, item] of selection.selected_chunks.entries()) {
    if (seenSelectionIds.has(item.chunk_id)) throw mismatchedSelection(position)
    seenSelectionIds.add(item.chunk_id)

    const chunk = chunksById.get(item.chunk_id)
    if (
      !chunk ||
      duplicateChunkIds.has(item.chunk_id) ||
      chunk.source_id !== item.source_id ||
      chunk.text_sha256 !== item.text_sha256 ||
      typeof chunk.text !== "string"
    ) {
      throw mismatchedSelection(position)
    }
    const chunkTextBytes = Buffer.byteLength(chunk.text, "utf8")
    if (selectedTextBytes + chunkTextBytes > effectiveLimitBytes) {
      throw new Error("Selected evidence exceeds its byte limit")
    }
    if (sha256(chunk.text) !== item.text_sha256) throw mismatchedSelection(position)
    selectedTextBytes += chunkTextBytes

    selected.push({ item, chunk })
  }

  const reservedBoundaries = collectReservedBoundaries(selected.map(({ chunk }) => chunk.text))
  const blocks: string[] = []
  let totalBytes = 0
  let nextBoundary = 0
  for (const { item, chunk } of selected) {
    while (reservedBoundaries.has(String(nextBoundary))) nextBoundary += 1
    const boundary = String(nextBoundary)
    reservedBoundaries.add(boundary)
    nextBoundary += 1

    const block = [
      `<<<UNTRUSTED_RULE_EVIDENCE boundary=${boundary} source_id=${item.source_id} chunk_id=${item.chunk_id} text_sha256=${item.text_sha256}>>>`,
      chunk.text,
      `<<<END_UNTRUSTED_RULE_EVIDENCE boundary=${boundary}>>>`
    ].join("\n")
    const separatorBytes = blocks.length === 0 ? 0 : 1
    const blockBytes = Buffer.byteLength(block, "utf8")
    if (totalBytes + separatorBytes + blockBytes > effectiveLimitBytes) {
      throw new Error("Selected evidence exceeds its byte limit")
    }
    blocks.push(block)
    totalBytes += separatorBytes + blockBytes
  }
  return blocks.join("\n")
}

function assertSelectionShape(value: unknown): asserts value is RuleEvidenceSelectionV1 {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, ["schema_version", "selected_chunks"]) ||
    value.schema_version !== SELECTION_SCHEMA_VERSION ||
    !Array.isArray(value.selected_chunks) ||
    value.selected_chunks.length > MAX_SELECTION_ITEMS
  ) {
    if (isPlainObject(value) && Array.isArray(value.selected_chunks) && value.selected_chunks.length > MAX_SELECTION_ITEMS) {
      throw new Error("Evidence selection exceeds its item limit")
    }
    throw malformedSelection()
  }

  for (const item of value.selected_chunks) {
    if (
      !isPlainObject(item) ||
      !hasExactKeys(item, ["source_id", "chunk_id", "text_sha256"]) ||
      typeof item.source_id !== "string" ||
      typeof item.chunk_id !== "string" ||
      typeof item.text_sha256 !== "string" ||
      !SOURCE_ID_PATTERN.test(item.source_id) ||
      !CHUNK_ID_PATTERN.test(item.chunk_id) ||
      !SHA256_PATTERN.test(item.text_sha256)
    ) {
      throw malformedSelection()
    }
  }
}

function collectReservedBoundaries(texts: readonly string[]): Set<string> {
  const reserved = new Set<string>()
  for (const text of texts) {
    EVIDENCE_BOUNDARY.lastIndex = 0
    for (let match = EVIDENCE_BOUNDARY.exec(text); match; match = EVIDENCE_BOUNDARY.exec(text)) {
      reserved.add(match[1])
    }
  }
  return reserved
}

function buildIndexLookup(index: RuleSourceIndexV1): Map<string, {
  source_id: string
  text_sha256: string
}> {
  if (
    !isPlainObject(index) ||
    index.schema_version !== "bob-bazaar-review/rule-source-index/v1" ||
    !Array.isArray(index.sources) ||
    index.sources.length > DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles
  ) {
    throw new Error("Evidence selection source index is invalid")
  }

  const lookup = new Map<string, { source_id: string; text_sha256: string }>()
  let chunkCount = 0
  for (const source of index.sources) {
    if (!isPlainObject(source) || typeof source.source_id !== "string" || !Array.isArray(source.chunks)) {
      throw new Error("Evidence selection source index is invalid")
    }
    for (const chunk of source.chunks) {
      chunkCount += 1
      if (chunkCount > MAX_INDEX_CHUNKS) {
        throw new Error("Evidence source chunk count exceeds its limit")
      }
      if (
        !isPlainObject(chunk) ||
        typeof chunk.chunk_id !== "string" ||
        typeof chunk.text_sha256 !== "string" ||
        lookup.has(chunk.chunk_id)
      ) {
        throw new Error("Evidence selection source index is invalid")
      }
      lookup.set(chunk.chunk_id, {
        source_id: source.source_id,
        text_sha256: chunk.text_sha256
      })
    }
  }
  return lookup
}

function assertPositiveByteLimit(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Selected evidence byte limit must be a positive safe integer")
  }
}

function malformedSelection(): Error {
  return new Error("Evidence selection must match the strict versioned JSON shape")
}

function mismatchedSelection(position: number): Error {
  return new Error(`Evidence selection item at position ${position} has unknown or mismatched identifiers`)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index])
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}
