import { createHash } from "node:crypto"
import {
  DocumentChunkKind,
  DocumentChunkLocatorV1,
  DocumentChunkV1,
  RuleSourceMediaType
} from "./ruleAuthoringTypes"

const LOCATOR_KEYS: ReadonlyArray<keyof DocumentChunkLocatorV1> = [
  "heading_path",
  "block_index",
  "table_index",
  "sheet",
  "row",
  "cell_range",
  "page",
  "part_index"
]

export interface DocumentChunkInput {
  sourceId: string
  mediaType: RuleSourceMediaType
  kind: DocumentChunkKind
  locator: DocumentChunkLocatorV1
  title?: string
  text: string
  flags?: readonly string[]
}

export function buildDocumentChunkId(
  sourceId: string,
  mediaType: RuleSourceMediaType,
  kind: DocumentChunkKind,
  locator: DocumentChunkLocatorV1
): string {
  const identity = JSON.stringify([sourceId, mediaType, kind, canonicalLocator(locator)])
  return `chunk-${sha256(identity)}`
}

export function splitDocumentChunk(input: DocumentChunkInput, maxBytes: number): DocumentChunkV1[] {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("Document chunk byte limit must be a positive safe integer")
  }

  const texts = splitUtf8(input.text, maxBytes)
  const split = texts.length > 1
  return texts.map((text, partIndex) => {
    const locator = cloneLocator(input.locator)
    if (split) locator.part_index = partIndex
    const chunk: DocumentChunkV1 = {
      schema_version: "bob-bazaar-review/document-chunk/v1",
      chunk_id: buildDocumentChunkId(input.sourceId, input.mediaType, input.kind, locator),
      source_id: input.sourceId,
      kind: input.kind,
      locator,
      text,
      text_sha256: sha256(text),
      flags: [...(input.flags ?? [])]
    }
    if (input.title !== undefined) chunk.title = input.title
    return chunk
  })
}

function splitUtf8(text: string, maxBytes: number): string[] {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return [text]

  const output: string[] = []
  let currentCodePoints: string[] = []
  let currentBytes = 0
  for (const codePoint of text) {
    const codePointBytes = Buffer.byteLength(codePoint, "utf8")
    if (codePointBytes > maxBytes) {
      throw new Error(`Document chunk byte limit cannot contain one Unicode code point (${codePointBytes} bytes)`)
    }
    if (currentBytes + codePointBytes > maxBytes) {
      output.push(currentCodePoints.join(""))
      currentCodePoints = []
      currentBytes = 0
    }
    currentCodePoints.push(codePoint)
    currentBytes += codePointBytes
  }
  output.push(currentCodePoints.join(""))
  return output
}

function canonicalLocator(locator: DocumentChunkLocatorV1): DocumentChunkLocatorV1 {
  const canonical: DocumentChunkLocatorV1 = {}
  for (const key of LOCATOR_KEYS) {
    const value = locator[key]
    if (value === undefined) continue
    if (key === "heading_path") canonical.heading_path = [...(value as string[])]
    else Object.assign(canonical, { [key]: value })
  }
  return canonical
}

function cloneLocator(locator: DocumentChunkLocatorV1): DocumentChunkLocatorV1 {
  return canonicalLocator(locator)
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}
