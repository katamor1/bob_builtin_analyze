import { PROCESSING_BUDGET_ABSOLUTE_MAXIMA } from "./generatedProcessingBudgetDefinition"
import type { ProcessingBudgetLedger } from "./processingBudgetLedger"

declare const require: (id: string) => unknown

export type OoxmlDocumentKind = "docx" | "xlsx"

export interface BoundedDocumentIdentity {
  readonly device: string
  readonly inode: string
  readonly size: string
  readonly modified_ns: string
  readonly changed_ns: string
}

export interface BoundedDocumentSnapshot {
  readonly path: string
  readonly byteLength: number
  readonly sha256: string
  readonly identity: BoundedDocumentIdentity
  copyBytes(): Uint8Array
  assertCurrent(): Promise<void>
}

export interface BoundedDocumentReadInput {
  readonly filePath: string
  readonly rootPath?: string
  readonly target: string
  readonly ledger: ProcessingBudgetLedger
  readonly maximumFileBytes?: number
}

export interface OoxmlArchiveEntryRecord {
  readonly name: string
  readonly directory: boolean
  readonly compression_method: number
  readonly compressed_bytes: number
  readonly expanded_bytes: number
  readonly crc32: string
}

export interface OoxmlArchiveSnapshot {
  readonly documentKind: OoxmlDocumentKind
  readonly entryCount: number
  readonly expandedBytes: number
  readonly entries: readonly OoxmlArchiveEntryRecord[]
  copyEntry(name: string): Uint8Array | undefined
}

export interface OoxmlArchivePreflightInput {
  readonly archiveBytes: Uint8Array
  readonly target: string
  readonly ledger: ProcessingBudgetLedger
  readonly expectedKind?: OoxmlDocumentKind
  readonly maximumEntries?: number
  readonly maximumEntryBytes?: number
  readonly maximumExpandedBytes?: number
}

interface BoundedDocumentRuntimeEngine {
  readBoundedDocumentFile(input: {
    readonly filePath: string
    readonly rootPath?: string
    readonly target: string
    readonly ledger: ProcessingBudgetLedger
    readonly maximumFileBytes: number
  }): Promise<BoundedDocumentSnapshot>
  preflightOoxmlArchive(input: {
    readonly archiveBytes: Uint8Array
    readonly target: string
    readonly ledger: ProcessingBudgetLedger
    readonly expectedKind?: OoxmlDocumentKind
    readonly maximumEntries?: number
    readonly maximumEntryBytes: number
    readonly maximumExpandedBytes: number
  }): OoxmlArchiveSnapshot
}

const runtime = require("./bounded-document-runtime.js") as BoundedDocumentRuntimeEngine

export const DEFAULT_MAX_OOXML_ARCHIVE_ENTRIES = 5_000 as const
export const ABSOLUTE_MAX_OOXML_ARCHIVE_ENTRIES = 100_000 as const

export function readBoundedDocumentFile(input: BoundedDocumentReadInput): Promise<BoundedDocumentSnapshot> {
  return runtime.readBoundedDocumentFile({
    filePath: input.filePath,
    rootPath: input.rootPath,
    target: input.target,
    ledger: input.ledger,
    maximumFileBytes: boundedMaximum(
      input.maximumFileBytes,
      PROCESSING_BUDGET_ABSOLUTE_MAXIMA.single_document_bytes
    )
  })
}

export function preflightOoxmlArchive(input: OoxmlArchivePreflightInput): OoxmlArchiveSnapshot {
  return runtime.preflightOoxmlArchive({
    archiveBytes: input.archiveBytes,
    target: input.target,
    ledger: input.ledger,
    expectedKind: input.expectedKind,
    maximumEntries: input.maximumEntries,
    maximumEntryBytes: boundedMaximum(
      input.maximumEntryBytes,
      PROCESSING_BUDGET_ABSOLUTE_MAXIMA.single_document_bytes
    ),
    maximumExpandedBytes: boundedMaximum(
      input.maximumExpandedBytes,
      PROCESSING_BUDGET_ABSOLUTE_MAXIMA.total_document_bytes
    )
  })
}

function boundedMaximum(value: number | undefined, absoluteMaximum: number): number {
  if (value === undefined) return absoluteMaximum
  if (!Number.isSafeInteger(value) || value <= 0) return value
  return Math.min(value, absoluteMaximum)
}
