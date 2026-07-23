import { createHash } from "node:crypto"
import * as path from "node:path"
import { resolveWorkspacePathStrict, toPosixPath } from "../core/fileSystem"
import { decodeTextBuffer } from "../core/textEncoding"
import { normalizeReviewProcessingLimits, truncateUtf8Text, type ReviewProcessingLimits } from "../core/limits"
import type { DocumentExtractionResult, EvidenceRef } from "../core/documentTypes"
import type { ReviewInput } from "../core/reviewTypes"
import {
  DEFAULT_PROCESSING_BUDGET_PROFILE,
  ProcessingBudgetLedger,
  preflightOoxmlArchive,
  readBoundedDocumentFile,
  type SharedBoundedDocumentSnapshot,
  type SharedOoxmlArchiveSnapshot,
  type SharedProcessingBudgetLedger,
  type SharedProcessingBudgetLimits,
  type SharedWorkbookBudgetCancellation
} from "../sharedProcessingBudgetRuntime"
import { extractDocxChunks } from "./documentDocxExtractor"
import type { ArtifactRef, ExtractedChunk } from "./documentExtractionCommon"
import { extractMarkdownChunks } from "./documentMarkdownExtractor"
import { extractXlsxChunks } from "./documentXlsxExtractor"

type DocumentMeta = DocumentExtractionResult["documents"][number]

const ARTIFACT_TYPES: Record<string, { evidenceType: string; prefix: string; documentPrefix: string }> = {
  requirements: { evidenceType: "requirement", prefix: "REQ", documentPrefix: "REQ" },
  basic_design: { evidenceType: "basic_design", prefix: "BD", documentPrefix: "BD" },
  detailed_design: { evidenceType: "detailed_design", prefix: "DD", documentPrefix: "DD" },
  test_spec: { evidenceType: "test_spec", prefix: "TC", documentPrefix: "TC" },
  ledgers: { evidenceType: "ledger", prefix: "LEDGER", documentPrefix: "LEDGER" },
  tickets: { evidenceType: "ticket", prefix: "TICKET", documentPrefix: "TICKET" }
}
const AGGREGATE_EXCERPT_SUFFIX = "\n\n[truncated: aggregate maxBobInputBytes]\n"

export interface DocumentExtractionOptions {
  workspaceRoot: string
  textEncoding?: string
  limits?: Partial<ReviewProcessingLimits>
  processingBudgetLimits?: Readonly<Partial<SharedProcessingBudgetLimits>>
  signal?: SharedWorkbookBudgetCancellation
}

export async function extractDocuments(reviewInput: ReviewInput, options: DocumentExtractionOptions): Promise<DocumentExtractionResult> {
  const documents: DocumentMeta[] = []
  const evidence: EvidenceRef[] = []
  const excerpts: string[] = []
  const warnings: string[] = []
  const counters = new Map<string, number>()
  throwIfCancelled(options.signal)
  const limits = normalizeReviewProcessingLimits(options.limits)
  const ledger = documentLedger(limits, options.processingBudgetLimits)
  const documentCount = countSelectedDocuments(reviewInput)
  ledger.reserve("document_count", documentCount).commit()
  let excerptMarkdownBytes = 0
  let aggregateBudgetExhausted = false

  for (const [artifactType, value] of Object.entries(reviewInput.artifacts)) {
    throwIfCancelled(options.signal)
    const typeInfo = ARTIFACT_TYPES[artifactType] ?? { evidenceType: artifactType, prefix: artifactType.toUpperCase(), documentPrefix: artifactType.toUpperCase() }
    if (!Array.isArray(value)) {
      warnings.push(`artifact ${artifactType} is not an array; skipped`)
      continue
    }

    for (const item of value as ArtifactRef[]) {
      throwIfCancelled(options.signal)
      if (aggregateBudgetExhausted) break
      if (!item.path) {
        warnings.push(`artifact ${artifactType} has no path; skipped`)
        continue
      }

      const documentId = `DOC-${typeInfo.documentPrefix}-${String(documents.length + 1).padStart(4, "0")}`
      const selectors = selectorList(item)
      let chunks: ExtractedChunk[] = []
      try {
        const filePath = resolveWorkspacePathStrict(options.workspaceRoot, item.path, "artifact path")
        chunks = await extractFileChunks(
          filePath,
          options.workspaceRoot,
          item,
          typeInfo.evidenceType,
          selectors,
          warnings,
          limits,
          ledger,
          options.signal,
          options.textEncoding
        )
      } catch (error) {
        if (options.signal?.aborted) throw cancellationReason(options.signal)
        if (isResourceControlError(error)) throw error
        warnings.push(`failed to extract ${item.path}: ${error instanceof Error ? error.message : String(error)}`)
      }

      throwIfCancelled(options.signal)
      if (chunks.length === 0) warnings.push(`no matching excerpt found in ${item.path}`)

      const document: DocumentMeta = {
        document_id: documentId,
        path: toPosixPath(item.path),
        type: artifactType,
        version: item.version,
        updated_at: item.updated_at,
        sections: []
      }

      for (const chunk of chunks) {
        const limitedChunk = limitChunkText(chunk, item.path, warnings, limits)
        const evidenceId = nextEvidenceId(typeInfo.prefix, counters)
        const separatorBytes = excerpts.length > 0 ? Buffer.byteLength("\n", "utf8") : 0
        const remainingBytes = Math.max(0, limits.maxBobInputBytes - excerptMarkdownBytes - separatorBytes)
        const aggregateFit = fitExcerptWithinAggregateBudget(
          evidenceId,
          item.path,
          item.version,
          typeInfo.evidenceType,
          limitedChunk,
          remainingBytes
        )
        if (!aggregateFit) {
          warnings.push(`document excerpts exhausted aggregate maxBobInputBytes (${limits.maxBobInputBytes}); remaining excerpts skipped.`)
          aggregateBudgetExhausted = true
          break
        }
        if (aggregateFit.truncated) {
          warnings.push(`${toPosixPath(item.path)} ${chunk.ref} exceeded aggregate maxBobInputBytes (${limits.maxBobInputBytes}); excerpt truncated and remaining excerpts skipped.`)
          aggregateBudgetExhausted = true
        }

        const evidenceRef: EvidenceRef = {
          evidence_id: evidenceId,
          type: typeInfo.evidenceType,
          ref: aggregateFit.chunk.ref,
          document_id: documentId,
          source: toPosixPath(item.path),
          version: item.version,
          location: aggregateFit.chunk.location,
          text: aggregateFit.chunk.text
        }
        evidence.push(evidenceRef)
        document.sections.push({ id: aggregateFit.chunk.ref, title: aggregateFit.chunk.title, evidence_id: evidenceId, location: aggregateFit.chunk.location })
        excerpts.push(aggregateFit.markdown)
        excerptMarkdownBytes += separatorBytes + Buffer.byteLength(aggregateFit.markdown, "utf8")
        if (aggregateBudgetExhausted) break
      }

      documents.push(document)
    }

    if (aggregateBudgetExhausted) break
  }

  return { documents, excerptsMarkdown: excerpts.join("\n"), evidence, warnings }
}

function selectorList(item: ArtifactRef): string[] {
  return [...(item.sections ?? []), ...(item.cases ?? []), ...(item.rows ?? [])].map((selector) => selector.trim()).filter(Boolean)
}

async function extractFileChunks(
  filePath: string,
  workspaceRoot: string,
  item: ArtifactRef,
  evidenceType: string,
  selectors: string[],
  warnings: string[],
  limits: ReviewProcessingLimits,
  ledger: SharedProcessingBudgetLedger,
  signal: SharedWorkbookBudgetCancellation | undefined,
  textEncoding = "auto"
): Promise<ExtractedChunk[]> {
  const extension = path.extname(filePath).toLowerCase()
  if (extension !== ".md" && extension !== ".markdown" && extension !== ".docx" && extension !== ".xlsx") {
    throw new Error(`unsupported document extension: ${extension || "(none)"}`)
  }

  throwIfCancelled(signal)
  const snapshot: SharedBoundedDocumentSnapshot = await readBoundedDocumentFile({
    filePath,
    rootPath: workspaceRoot,
    target: documentTarget(filePath),
    ledger,
    maximumFileBytes: limits.maxDocumentBytes
  })
  throwIfCancelled(signal)
  const documentBytes = snapshot.copyBytes()
  let chunks: ExtractedChunk[]

  if (extension === ".md" || extension === ".markdown") {
    chunks = extractMarkdownChunks(decodeTextBuffer(Buffer.from(documentBytes), textEncoding), evidenceType, selectors)
  } else if (extension === ".docx") {
    preflightArchive(snapshot, ledger, filePath, "docx", limits)
    throwIfCancelled(signal)
    chunks = await extractDocxChunks(documentBytes, evidenceType, selectors)
  } else {
    const archive = preflightArchive(snapshot, ledger, filePath, "xlsx", limits)
    throwIfCancelled(signal)
    chunks = await extractXlsxChunks(
      documentBytes,
      filePath,
      item,
      evidenceType,
      selectors,
      warnings,
      limits,
      { ledger, workbookTarget: workbookTarget(filePath), archive, signal }
    )
  }

  throwIfCancelled(signal)
  await snapshot.assertCurrent()
  throwIfCancelled(signal)
  return chunks
}

function countSelectedDocuments(reviewInput: ReviewInput): number {
  let count = 0
  for (const value of Object.values(reviewInput.artifacts)) {
    if (!Array.isArray(value)) continue
    for (const item of value as ArtifactRef[]) if (item.path) count += 1
  }
  return count
}

function documentLedger(
  limits: ReviewProcessingLimits,
  overrides: Readonly<Partial<SharedProcessingBudgetLimits>> | undefined
): SharedProcessingBudgetLedger {
  const totalDocumentBytes = overrides?.total_document_bytes ?? Math.max(
    limits.maxDocumentBytes,
    DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_document_bytes
  )
  const totalOperationInputBytes = overrides?.total_operation_input_bytes ?? Math.max(
    totalDocumentBytes,
    DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_operation_input_bytes
  )
  return new ProcessingBudgetLedger({
    limits: {
      ...overrides,
      single_document_bytes: limits.maxDocumentBytes,
      sheets_per_workbook: limits.maxWorkbookSheets,
      rows_per_sheet: limits.maxRowsPerSheet,
      total_document_bytes: totalDocumentBytes,
      total_operation_input_bytes: totalOperationInputBytes
    }
  })
}

function preflightArchive(
  snapshot: SharedBoundedDocumentSnapshot,
  ledger: SharedProcessingBudgetLedger,
  filePath: string,
  kind: "docx" | "xlsx",
  limits: ReviewProcessingLimits
): SharedOoxmlArchiveSnapshot {
  return preflightOoxmlArchive({
    archiveBytes: snapshot.copyBytes(),
    target: archiveTarget(filePath),
    ledger,
    expectedKind: kind,
    maximumArchiveBytes: limits.maxDocumentBytes,
    maximumEntryBytes: limits.maxDocumentBytes,
    maximumExpandedBytes: ledger.profile.limits.total_document_bytes
  })
}

function documentTarget(filePath: string): string {
  return `consistency:document:${pathDigest(filePath)}`
}

function archiveTarget(filePath: string): string {
  return `consistency:archive:${pathDigest(filePath)}`
}

function workbookTarget(filePath: string): string {
  return `consistency:workbook:${pathDigest(filePath)}`
}

function pathDigest(filePath: string): string {
  return createHash("sha256").update(path.resolve(filePath), "utf8").digest("hex").slice(0, 24)
}

function isResourceControlError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false
  const code = (error as { code?: unknown }).code
  const constrainedCategory = "details" in error && typeof (error as { details?: unknown }).details === "object"
    && (error as { details?: { constrainedCategory?: unknown } }).details !== null
    ? (error as { details: { constrainedCategory?: unknown } }).details.constrainedCategory
    : undefined
  return typeof code === "string" && (
    (code.startsWith("processing_budget_") && constrainedCategory !== "single_document_bytes")
    || code === "ooxml_kind_mismatch"
    || code.startsWith("bounded_document_")
    || code.startsWith("archive_")
    || code.startsWith("xlsx_")
  )
}

function throwIfCancelled(signal: SharedWorkbookBudgetCancellation | undefined): void {
  if (signal?.aborted) throw cancellationReason(signal)
}

function cancellationReason(signal: SharedWorkbookBudgetCancellation): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("document extraction was cancelled")
}

function limitChunkText(chunk: ExtractedChunk, sourcePath: string, warnings: string[], limits: ReviewProcessingLimits): ExtractedChunk {
  const suffix = "\n\n[truncated: maxExcerptBytesPerDocument]\n"
  const limited = truncateUtf8Text(chunk.text, limits.maxExcerptBytesPerDocument, suffix)
  if (!limited.truncated) return chunk
  warnings.push(`${toPosixPath(sourcePath)} ${chunk.ref} exceeded maxExcerptBytesPerDocument (${limited.originalBytes} > ${limits.maxExcerptBytesPerDocument}); excerpt truncated.`)
  return { ...chunk, text: limited.text }
}

function fitExcerptWithinAggregateBudget(
  evidenceId: string,
  sourcePath: string,
  version: string | undefined,
  evidenceType: string,
  chunk: ExtractedChunk,
  remainingBytes: number
): { chunk: ExtractedChunk; markdown: string; truncated: boolean } | undefined {
  const fullMarkdown = renderExcerpt(evidenceId, sourcePath, version, evidenceType, chunk)
  if (Buffer.byteLength(fullMarkdown, "utf8") <= remainingBytes) {
    return { chunk, markdown: fullMarkdown, truncated: false }
  }

  const emptyChunk = { ...chunk, text: "" }
  const emptyMarkdown = renderExcerpt(evidenceId, sourcePath, version, evidenceType, emptyChunk)
  const fixedBytes = Buffer.byteLength(emptyMarkdown, "utf8")
  if (fixedBytes > remainingBytes) return undefined

  const textBudget = Math.max(0, remainingBytes - fixedBytes)
  const limitedText = truncateUtf8Text(chunk.text, textBudget, AGGREGATE_EXCERPT_SUFFIX).text
  const limitedChunk = { ...chunk, text: limitedText }
  const markdown = renderExcerpt(evidenceId, sourcePath, version, evidenceType, limitedChunk)
  return { chunk: limitedChunk, markdown, truncated: true }
}

function nextEvidenceId(prefix: string, counters: Map<string, number>): string {
  const next = (counters.get(prefix) ?? 0) + 1
  counters.set(prefix, next)
  return `${prefix}-${String(next).padStart(4, "0")}`
}

function renderExcerpt(evidenceId: string, sourcePath: string, version: string | undefined, evidenceType: string, chunk: ExtractedChunk): string {
  return [
    `## ${evidenceId}`,
    "",
    `- document: ${toPosixPath(sourcePath)}`,
    `- version: ${version ?? "unknown"}`,
    `- ref: ${chunk.ref}`,
    `- type: ${evidenceType}`,
    chunk.location ? `- location: ${chunk.location}` : undefined,
    "",
    chunk.text,
    ""
  ].filter((line): line is string => line !== undefined).join("\n")
}
