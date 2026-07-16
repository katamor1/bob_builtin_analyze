import {
  RuleSourceExtractionStatus,
  RuleSourceManifestV1,
  RuleSourceMediaType
} from "./ruleAuthoringTypes"

const INITIAL_SOURCE_ID_PREFIX_LENGTH = 12
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const CANONICAL_UTC_ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/
const REMOTE_SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/
const REMOTE_SAFE_WARNING_CODE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/
const SUPPORTED_MEDIA_TYPES = new Set<RuleSourceMediaType>(["docx", "xlsx", "pdf"])
const SUPPORTED_EXTRACTION_STATUSES = new Set<RuleSourceExtractionStatus>([
  "success",
  "partial",
  "blocked",
  "requires_conversion",
  "requires_ocr"
])
const MAX_LOGICAL_NAME_BYTES = 255
const MAX_REMOTE_SAFE_TOKEN_BYTES = 128
const MAX_MANIFEST_WARNINGS = 100

export interface RuleSourceManifestInputSource {
  logicalName: string
  mediaType: RuleSourceMediaType
  sha256: string
  byteSize: number
  extractionStatus: RuleSourceExtractionStatus
  extractor: { id: string; version: string }
  warnings: readonly string[]
}

export interface RuleSourceManifestInput {
  generatedAt: string
  sources: readonly RuleSourceManifestInputSource[]
}

export function assignSourceIds(sha256Values: readonly string[]): ReadonlyMap<string, string> {
  for (const sha256 of sha256Values) {
    if (!SHA256_PATTERN.test(sha256)) throw new Error(`Source SHA-256 must be 64 lowercase hexadecimal characters: ${sha256}`)
  }

  const hashes = [...new Set(sha256Values)].sort()
  const prefixLengths = new Map(hashes.map((hash) => [hash, INITIAL_SOURCE_ID_PREFIX_LENGTH]))

  while (true) {
    const hashesByPrefix = new Map<string, string[]>()
    for (const hash of hashes) {
      const prefix = hash.slice(0, prefixLengths.get(hash))
      const group = hashesByPrefix.get(prefix) ?? []
      group.push(hash)
      hashesByPrefix.set(prefix, group)
    }

    const collisions = [...hashesByPrefix.values()].filter((group) => group.length > 1)
    if (collisions.length === 0) break

    for (const group of collisions) {
      for (const hash of group) {
        const currentLength = prefixLengths.get(hash) ?? INITIAL_SOURCE_ID_PREFIX_LENGTH
        if (currentLength >= hash.length) throw new Error(`Distinct source SHA-256 values could not be disambiguated: ${hash}`)
        prefixLengths.set(hash, currentLength + 1)
      }
    }
  }

  return new Map(hashes.map((hash) => [
    hash,
    `src-${hash.slice(0, prefixLengths.get(hash))}`
  ]))
}

export function buildRuleSourceManifest(input: RuleSourceManifestInput): RuleSourceManifestV1 {
  assertCanonicalGeneratedAt(input.generatedAt)

  const seenHashes = new Set<string>()
  for (const [index, source] of input.sources.entries()) {
    if (seenHashes.has(source.sha256)) {
      throw new Error(`Rule source manifest contains duplicate SHA-256: ${source.sha256}`)
    }
    seenHashes.add(source.sha256)
    assertRemoteSafeManifestSource(source, index)
  }

  const sourceIds = assignSourceIds(input.sources.map((source) => source.sha256))
  return {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: input.generatedAt,
    sources: input.sources.map((source) => ({
      source_id: requiredSourceId(sourceIds, source.sha256),
      logical_name: source.logicalName,
      media_type: source.mediaType,
      sha256: source.sha256,
      byte_size: source.byteSize,
      extraction_status: source.extractionStatus,
      extractor: { id: source.extractor.id, version: source.extractor.version },
      warnings: [...source.warnings]
    }))
  }
}

function assertCanonicalGeneratedAt(value: string): void {
  if (
    typeof value !== "string" ||
    !CANONICAL_UTC_ISO_TIMESTAMP.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error("Rule source manifest generatedAt must be an exact canonical UTC ISO timestamp")
  }
}

function requiredSourceId(sourceIds: ReadonlyMap<string, string>, sha256: string): string {
  const sourceId = sourceIds.get(sha256)
  if (!sourceId) throw new Error(`Source ID assignment is missing SHA-256: ${sha256}`)
  return sourceId
}

function assertRemoteSafeManifestSource(source: RuleSourceManifestInputSource, index: number): void {
  const prefix = `Rule source manifest sources[${index}] requires remote-safe`
  if (!SUPPORTED_MEDIA_TYPES.has(source.mediaType)) {
    throw new Error(`${prefix} mediaType must be one of docx, xlsx, or pdf`)
  }
  if (!SUPPORTED_EXTRACTION_STATUSES.has(source.extractionStatus)) {
    throw new Error(`${prefix} extractionStatus must be a supported design status`)
  }
  if (!Number.isSafeInteger(source.byteSize) || source.byteSize < 0) {
    throw new Error(`${prefix} byteSize must be a non-negative safe integer`)
  }

  const logicalName = source.logicalName
  if (
    !logicalName ||
    logicalName.trim() !== logicalName ||
    CONTROL_CHARACTER.test(logicalName) ||
    logicalName.includes("/") ||
    logicalName.includes("\\") ||
    Buffer.byteLength(logicalName, "utf8") > MAX_LOGICAL_NAME_BYTES ||
    !logicalName.toLowerCase().endsWith(`.${source.mediaType}`)
  ) {
    throw new Error(`${prefix} logicalName containing one bounded file name, not a path or source text`)
  }

  assertRemoteSafeToken(source.extractor.id, `${prefix} extractor.id`)
  assertRemoteSafeToken(source.extractor.version, `${prefix} extractor.version`)
  if (source.warnings.length > MAX_MANIFEST_WARNINGS) {
    throw new Error(`${prefix} warnings: at most ${MAX_MANIFEST_WARNINGS} bounded warning codes are allowed`)
  }
  for (const warning of source.warnings) {
    if (
      Buffer.byteLength(warning, "utf8") > MAX_REMOTE_SAFE_TOKEN_BYTES ||
      !REMOTE_SAFE_WARNING_CODE.test(warning)
    ) {
      throw new Error(`${prefix} warnings: source text, paths, and free-form diagnostics are not allowed`)
    }
  }
}

function assertRemoteSafeToken(value: string, fieldName: string): void {
  if (
    Buffer.byteLength(value, "utf8") > MAX_REMOTE_SAFE_TOKEN_BYTES ||
    !REMOTE_SAFE_TOKEN.test(value)
  ) {
    throw new Error(`${fieldName} must be a bounded identifier, not a path or source text`)
  }
}
