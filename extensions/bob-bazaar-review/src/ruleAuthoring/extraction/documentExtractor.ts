import * as path from "node:path"
import { DEFAULT_RULE_AUTHORING_LIMITS, type RuleAuthoringLimits } from "../ruleAuthoringLimits"
import {
  assertStableSourceFingerprint,
  fingerprintSource,
  type SourceFingerprint
} from "../ruleSourceHash"
import {
  assignSourceIds,
  buildRuleSourceManifest,
  type RuleSourceManifestInputSource
} from "../ruleSourceManifest"
import type {
  DocumentChunkV1,
  RuleSourceExtractionStatus,
  RuleSourceManifestV1,
  RuleSourceMediaType
} from "../ruleAuthoringTypes"
import { extractDocx } from "./docxExtractor"
import { preflightOoxmlArchive } from "./ooxmlPreflight"
import { extractPdf, type PdfExtractionOptions } from "./pdfExtractor"
import { extractXlsx } from "./xlsxExtractor"

type LocalDocumentMediaType = RuleSourceMediaType | "doc" | "xls"

export interface RuleDocumentExtractionRequest {
  filePath: string
  logicalName?: string
  pdf?: Omit<PdfExtractionOptions, "sourceId" | "maxChunkBytes" | "maxOutputBytes">
}

export interface DocumentExtractionResult {
  logicalName: string
  mediaType: LocalDocumentMediaType
  byteSize: number
  sha256: string
  status: RuleSourceExtractionStatus
  warnings: string[]
  extractor: { id: string; version: string }
  chunks: DocumentChunkV1[]
  shareable: boolean
  localPath: string
}

export interface RuleDocumentDuplicate {
  logical_name: string
  sha256: string
  reason: "duplicate_in_run" | "duplicate_existing_manifest"
  duplicate_of: string
}

export interface LocalSourceMapping {
  logicalName: string
  absolutePath: string
  sha256: string
  status: RuleSourceExtractionStatus | "duplicate"
}

export interface RuleDocumentDiagnostic {
  logical_name: string
  code: string
}

export interface RuleDocumentBatchResult {
  manifest: RuleSourceManifestV1
  documents: DocumentExtractionResult[]
  aiChunks: DocumentChunkV1[]
  localSourceMappings: LocalSourceMapping[]
  duplicates: RuleDocumentDuplicate[]
  diagnostics: RuleDocumentDiagnostic[]
}

interface FingerprintedRequest {
  request: RuleDocumentExtractionRequest
  absolutePath: string
  logicalName: string
  fingerprint: SourceFingerprint
}

interface PreparedRequest extends FingerprintedRequest {
  mediaType: LocalDocumentMediaType
}

interface ExtractionContext {
  limits: RuleAuthoringLimits
  sourceId?: string
  beforeFingerprint?: SourceFingerprint
}

const LEGACY_EXTRACTOR = Object.freeze({ id: "legacy-office", version: "1" })

export async function extractRuleDocument(
  request: RuleDocumentExtractionRequest
): Promise<DocumentExtractionResult> {
  return extractRuleDocumentWithContext(request, { limits: DEFAULT_RULE_AUTHORING_LIMITS })
}

async function extractRuleDocumentWithContext(
  request: RuleDocumentExtractionRequest,
  context: ExtractionContext
): Promise<DocumentExtractionResult> {
  const limits = context.limits
  const absolutePath = path.resolve(request.filePath)
  const logicalName = request.logicalName ?? path.basename(absolutePath)
  assertLogicalName(logicalName)
  const mediaType = classifySelectedPath(absolutePath, logicalName)
  const before = context.beforeFingerprint ?? await fingerprintSource(absolutePath)
  const byteSize = fingerprintByteSize(before)
  if (byteSize > limits.maxSourceBytes) {
    throw new Error(`Rule source exceeds the ${limits.maxSourceBytes}-byte per-source limit`)
  }

  const sourceId = context.sourceId ?? `src-${before.sha256.slice(0, 12)}`
  let extracted: {
    chunks: DocumentChunkV1[]
    status: RuleSourceExtractionStatus
    warnings: string[]
    extractor: { id: string; version: string }
  }

  if (mediaType === "doc" || mediaType === "xls") {
    extracted = {
      chunks: [],
      status: "requires_conversion",
      warnings: ["conversion_required"],
      extractor: { ...LEGACY_EXTRACTOR }
    }
  } else if (mediaType === "docx" || mediaType === "xlsx") {
    const preflight = await preflightOoxmlArchive(absolutePath, limits)
    if (preflight.documentKind !== mediaType) {
      throw new Error(`OOXML document kind does not match .${mediaType}`)
    }
    extracted = mediaType === "docx"
      ? await extractDocx(absolutePath, { sourceId, maxChunkBytes: limits.maxChunkBytes })
      : await extractXlsx(absolutePath, {
        sourceId,
        maxChunkBytes: limits.maxChunkBytes,
        ooxmlEntryNames: preflight.entryNames,
        ooxmlDeclaredUncompressedBytes: preflight.declaredUncompressedBytes,
        ooxmlArchiveByteLength: preflight.archiveByteLength,
        ooxmlEntries: preflight.entries
      })
  } else {
    extracted = await extractPdf(absolutePath, {
      ...request.pdf,
      sourceId,
      maxChunkBytes: limits.maxChunkBytes,
      maxOutputBytes: limits.maxPdfOutputBytes
    })
  }

  const after = await fingerprintSource(absolutePath)
  assertStableSourceFingerprint(before, after)
  const shareable = (mediaType === "docx" || mediaType === "xlsx" || mediaType === "pdf") &&
    (extracted.status === "success" || extracted.status === "partial")
  return {
    logicalName,
    mediaType,
    byteSize,
    sha256: before.sha256,
    status: extracted.status,
    warnings: [...extracted.warnings],
    extractor: { ...extracted.extractor },
    chunks: extracted.chunks,
    shareable,
    localPath: absolutePath
  }
}

export async function extractRuleDocuments(
  requests: readonly RuleDocumentExtractionRequest[],
  existingManifest: RuleSourceManifestV1 | undefined,
  limits: RuleAuthoringLimits = DEFAULT_RULE_AUTHORING_LIMITS
): Promise<RuleDocumentBatchResult> {
  if (existingManifest) assertCanonicalExistingManifest(existingManifest)
  const effectiveLimits = boundedRuleAuthoringLimits(limits)
  if (requests.length > effectiveLimits.maxSourceFiles) {
    throw new Error(`Rule source file count exceeds the ${effectiveLimits.maxSourceFiles}-file limit`)
  }

  const fingerprinted = await Promise.all(requests.map(async (request): Promise<FingerprintedRequest> => {
    const absolutePath = path.resolve(request.filePath)
    const logicalName = request.logicalName ?? path.basename(absolutePath)
    assertLogicalName(logicalName)
    const fingerprint = await fingerprintSource(absolutePath)
    const byteSize = fingerprintByteSize(fingerprint)
    if (byteSize > effectiveLimits.maxSourceBytes) {
      throw new Error(`Rule source exceeds the ${effectiveLimits.maxSourceBytes}-byte per-source limit`)
    }
    return { request, absolutePath, logicalName, fingerprint }
  }))
  const aggregateBytes = fingerprinted.reduce(
    (total, item) => total + fingerprintByteSize(item.fingerprint),
    0
  )
  if (!Number.isSafeInteger(aggregateBytes) || aggregateBytes > effectiveLimits.maxAggregateSourceBytes) {
    throw new Error(`Rule source aggregate bytes exceed the ${effectiveLimits.maxAggregateSourceBytes}-byte limit`)
  }
  const prepared: PreparedRequest[] = fingerprinted.map((item) => ({
    ...item,
    mediaType: classifySelectedPath(item.absolutePath, item.logicalName)
  }))

  const existingByHash = new Map(
    (existingManifest?.sources ?? []).map((source) => [source.sha256, source] as const)
  )
  const groups = new Map<string, PreparedRequest[]>()
  for (const item of prepared) {
    const group = groups.get(item.fingerprint.sha256) ?? []
    group.push(item)
    groups.set(item.fingerprint.sha256, group)
  }

  const canonical: PreparedRequest[] = []
  const duplicates: RuleDocumentDuplicate[] = []
  for (const [sha256, unsortedGroup] of groups) {
    const group = [...unsortedGroup].sort(comparePrepared)
    const existing = existingByHash.get(sha256)
    if (existing) {
      for (const item of group) {
        duplicates.push({
          logical_name: item.logicalName,
          sha256,
          reason: "duplicate_existing_manifest",
          duplicate_of: existing.source_id
        })
        if (isLegacyMediaType(item.mediaType)) canonical.push(item)
      }
      continue
    }
    canonical.push(group[0])
    for (const item of group.slice(1)) {
      duplicates.push({
        logical_name: item.logicalName,
        sha256,
        reason: "duplicate_in_run",
        duplicate_of: group[0].logicalName
      })
      if (isLegacyMediaType(item.mediaType)) canonical.push(item)
    }
  }
  canonical.sort(comparePrepared)
  duplicates.sort((left, right) => left.logical_name.localeCompare(right.logical_name) || left.sha256.localeCompare(right.sha256))

  const sourceIds = assignSourceIds([
    ...(existingManifest?.sources ?? []).map((source) => source.sha256),
    ...canonical.map((item) => item.fingerprint.sha256)
  ])
  const documents: DocumentExtractionResult[] = []
  for (const item of canonical) {
    const sourceId = sourceIds.get(item.fingerprint.sha256)
    if (!sourceId) throw new Error("Source ID assignment failed")
    documents.push(await extractRuleDocumentWithContext({
      ...item.request,
      filePath: item.absolutePath,
      logicalName: item.logicalName
    }, {
      limits: effectiveLimits,
      sourceId,
      beforeFingerprint: item.fingerprint
    }))
  }

  const manifestInputs: RuleSourceManifestInputSource[] = documents
    .filter((document): document is DocumentExtractionResult & { mediaType: RuleSourceMediaType } => document.shareable)
    .map((document) => ({
      logicalName: document.logicalName,
      mediaType: document.mediaType,
      sha256: document.sha256,
      byteSize: document.byteSize,
      extractionStatus: document.status,
      extractor: document.extractor,
      warnings: document.warnings
    }))
  const manifest = buildRuleSourceManifest({
    generatedAt: new Date().toISOString(),
    sources: manifestInputs
  })
  for (const source of manifest.sources) {
    const sourceId = sourceIds.get(source.sha256)
    if (!sourceId) throw new Error("Manifest source ID assignment failed")
    source.source_id = sourceId
  }

  const documentByPath = new Map(documents.map((document) => [document.localPath, document]))
  const localSourceMappings = [...prepared].sort(comparePrepared).map((item): LocalSourceMapping => {
    const document = documentByPath.get(item.absolutePath)
    return {
      logicalName: item.logicalName,
      absolutePath: item.absolutePath,
      sha256: item.fingerprint.sha256,
      status: document?.status ?? "duplicate"
    }
  })
  const diagnostics = documents.flatMap((document) => document.warnings.map((code) => ({
    logical_name: document.logicalName,
    code
  })))

  return {
    manifest,
    documents,
    aiChunks: documents.filter((document) => document.shareable).flatMap((document) => document.chunks),
    localSourceMappings,
    duplicates,
    diagnostics
  }
}

function classifyExtension(logicalName: string): LocalDocumentMediaType {
  const extension = path.extname(logicalName).toLowerCase()
  if (extension === ".docx") return "docx"
  if (extension === ".xlsx") return "xlsx"
  if (extension === ".pdf") return "pdf"
  if (extension === ".doc") return "doc"
  if (extension === ".xls") return "xls"
  throw new Error(`Unsupported rule document extension: ${extension || "none"}`)
}

function classifySelectedPath(absolutePath: string, logicalName: string): LocalDocumentMediaType {
  const selectedExtension = path.extname(path.basename(absolutePath)).toLowerCase()
  const logicalExtension = path.extname(logicalName).toLowerCase()
  const mediaType = classifyExtension(path.basename(absolutePath))
  if (logicalExtension !== selectedExtension) {
    throw new Error("Rule document logical name extension must match the selected path extension")
  }
  return mediaType
}

function isLegacyMediaType(mediaType: LocalDocumentMediaType): mediaType is "doc" | "xls" {
  return mediaType === "doc" || mediaType === "xls"
}

function assertLogicalName(logicalName: string): void {
  if (!logicalName || path.basename(logicalName) !== logicalName || logicalName.includes("\\")) {
    throw new Error("Rule document logical name must be one file name")
  }
}

function fingerprintByteSize(fingerprint: SourceFingerprint): number {
  if (!/^\d+$/.test(fingerprint.byteSize)) throw new Error("Rule source byte size fingerprint is invalid")
  const value = Number(fingerprint.byteSize)
  if (!Number.isSafeInteger(value)) throw new Error("Rule source byte size exceeds safe integer range")
  return value
}

function comparePrepared(left: PreparedRequest, right: PreparedRequest): number {
  return left.logicalName.localeCompare(right.logicalName) || left.absolutePath.localeCompare(right.absolutePath)
}

function assertCanonicalExistingManifest(manifest: RuleSourceManifestV1): void {
  try {
    if (manifest.schema_version !== "bob-bazaar-review/rule-sources/v1") throw new Error()
    const canonical = buildRuleSourceManifest({
      generatedAt: manifest.generated_at,
      sources: manifest.sources.map((source) => ({
        logicalName: source.logical_name,
        mediaType: source.media_type,
        sha256: source.sha256,
        byteSize: source.byte_size,
        extractionStatus: source.extraction_status,
        extractor: source.extractor,
        warnings: source.warnings
      }))
    })
    if (canonical.sources.some((source, index) => source.source_id !== manifest.sources[index]?.source_id)) {
      throw new Error()
    }
  } catch {
    throw new Error("Existing rule source manifest is not canonical")
  }
}

function boundedRuleAuthoringLimits(limits: RuleAuthoringLimits): RuleAuthoringLimits {
  return {
    maxSourceFiles: boundedLimit(limits.maxSourceFiles, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles, "maxSourceFiles"),
    maxSourceBytes: boundedLimit(limits.maxSourceBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceBytes, "maxSourceBytes"),
    maxAggregateSourceBytes: boundedLimit(limits.maxAggregateSourceBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxAggregateSourceBytes, "maxAggregateSourceBytes"),
    maxChunkBytes: boundedLimit(limits.maxChunkBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes, "maxChunkBytes"),
    maxSourceIndexBytes: boundedLimit(limits.maxSourceIndexBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes, "maxSourceIndexBytes"),
    maxSelectedEvidenceBytes: boundedLimit(limits.maxSelectedEvidenceBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes, "maxSelectedEvidenceBytes"),
    maxProposalBytes: boundedLimit(limits.maxProposalBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes, "maxProposalBytes"),
    maxPdfOutputBytes: boundedLimit(limits.maxPdfOutputBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxPdfOutputBytes, "maxPdfOutputBytes"),
    maxOoxmlEntries: boundedLimit(limits.maxOoxmlEntries, DEFAULT_RULE_AUTHORING_LIMITS.maxOoxmlEntries, "maxOoxmlEntries"),
    maxOoxmlDeclaredUncompressedBytes: boundedLimit(limits.maxOoxmlDeclaredUncompressedBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxOoxmlDeclaredUncompressedBytes, "maxOoxmlDeclaredUncompressedBytes"),
    maxRuleOperations: boundedLimit(limits.maxRuleOperations, DEFAULT_RULE_AUTHORING_LIMITS.maxRuleOperations, "maxRuleOperations"),
    maxProjectContextOperations: boundedLimit(limits.maxProjectContextOperations, DEFAULT_RULE_AUTHORING_LIMITS.maxProjectContextOperations, "maxProjectContextOperations"),
    maxPromptAddendumOperations: boundedLimit(limits.maxPromptAddendumOperations, DEFAULT_RULE_AUTHORING_LIMITS.maxPromptAddendumOperations, "maxPromptAddendumOperations"),
    maxProjectContextBytes: boundedLimit(limits.maxProjectContextBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxProjectContextBytes, "maxProjectContextBytes"),
    maxPromptAddendumBytes: boundedLimit(limits.maxPromptAddendumBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxPromptAddendumBytes, "maxPromptAddendumBytes")
  }
}

function boundedLimit(value: number, ceiling: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`)
  return Math.min(value, ceiling)
}
