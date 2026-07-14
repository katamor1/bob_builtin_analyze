import * as path from "node:path"
import {
  runExternalProcess,
  type ExternalProcessOptions,
  type ExternalProcessResult
} from "../../bazaar/externalProcessRunner"
import { splitDocumentChunk } from "../documentChunk"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "../ruleAuthoringLimits"
import type { DocumentChunkV1, RuleSourceExtractionStatus } from "../ruleAuthoringTypes"

export type PdfProcessRunner = (options: ExternalProcessOptions) => Promise<ExternalProcessResult>

export interface PdfExtractionOptions {
  sourceId: string
  command?: string
  timeoutMs?: number
  maxOutputBytes?: number
  maxChunkBytes?: number
  signal?: AbortSignal
  runner?: PdfProcessRunner
}

export interface PdfExtractionResult {
  chunks: DocumentChunkV1[]
  status: RuleSourceExtractionStatus
  warnings: string[]
  extractor: { id: string; version: string }
}

export const PDF_LOW_TEXT_DENSITY_CHARACTERS = 32

const DEFAULT_PDF_TIMEOUT_MS = 120_000
const PDF_EXTRACTOR = Object.freeze({ id: "pdf-pdftotext-layout", version: "1" })

export async function extractPdf(
  filePath: string,
  options: PdfExtractionOptions
): Promise<PdfExtractionResult> {
  const absolutePath = path.resolve(filePath)
  const runner = options.runner ?? runExternalProcess
  const maxOutputBytes = boundedPositiveLimit(
    options.maxOutputBytes ?? DEFAULT_RULE_AUTHORING_LIMITS.maxPdfOutputBytes,
    DEFAULT_RULE_AUTHORING_LIMITS.maxPdfOutputBytes,
    "PDF output byte limit"
  )
  const maxChunkBytes = boundedPositiveLimit(
    options.maxChunkBytes ?? DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes,
    DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes,
    "PDF chunk byte limit"
  )
  let result: ExternalProcessResult
  try {
    result = await runner({
      command: options.command ?? "pdftotext",
      args: ["-layout", "-enc", "UTF-8", absolutePath, "-"],
      cwd: path.dirname(absolutePath),
      maxBufferBytes: maxOutputBytes,
      timeoutMs: options.timeoutMs ?? DEFAULT_PDF_TIMEOUT_MS,
      allowedExitCodes: [0],
      signal: options.signal
    })
  } catch (error) {
    return blockedPdfResult(mapProcessFailure(error))
  }

  const pages = result.stdout.toString("utf8").split("\f")
  if (pages.length > 0 && pages.at(-1)?.trim() === "") pages.pop()
  if (pages.every((page) => page.trim().length === 0)) {
    return {
      chunks: [],
      status: "requires_ocr",
      warnings: ["ocr_required"],
      extractor: { ...PDF_EXTRACTOR }
    }
  }

  const chunks = pages.flatMap((text, index) => splitDocumentChunk({
    sourceId: options.sourceId,
    mediaType: "pdf",
    kind: "page",
    locator: { page: index + 1 },
    text,
    flags: text.trim().length === 0 ? ["empty_page"] : []
  }, maxChunkBytes))
  const nonWhitespaceCharacters = pages.join("").replace(/\s/g, "").length
  const warnings = nonWhitespaceCharacters < PDF_LOW_TEXT_DENSITY_CHARACTERS
    ? ["low_text_density"]
    : []

  return {
    chunks,
    status: "success",
    warnings,
    extractor: { ...PDF_EXTRACTOR }
  }
}

function boundedPositiveLimit(value: number, ceiling: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`)
  return Math.min(value, ceiling)
}

function blockedPdfResult(warning: string): PdfExtractionResult {
  return {
    chunks: [],
    status: "blocked",
    warnings: [warning],
    extractor: { ...PDF_EXTRACTOR }
  }
}

function mapProcessFailure(error: unknown): string {
  const kind = typeof error === "object" && error !== null && "kind" in error
    ? (error as { kind?: unknown }).kind
    : undefined
  if (kind === "timeout") return "pdf_timeout"
  if (kind === "cancelled") return "pdf_cancelled"
  if (kind === "bufferExceeded") return "pdf_output_overflow"
  if (kind === "spawnFailure") return "pdf_unavailable"
  if (kind === "nonZeroExit") return "pdf_extraction_failed"
  return "pdf_extraction_failed"
}
