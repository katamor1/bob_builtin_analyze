declare const require: (id: string) => unknown

export interface SharedProcessingBudgetReservation {
  readonly category: string
  readonly target?: string
  readonly amount: number
  commit(actual?: number): void
  release(): void
}

export interface SharedProcessingBudgetLedger {
  reserveForTarget(category: "single_document_bytes", target: string, amount: number): SharedProcessingBudgetReservation
}

export interface SharedProcessingBudgetLimits {
  readonly single_document_bytes: number
  readonly total_document_bytes: number
  readonly total_operation_input_bytes: number
}

export interface SharedProcessingBudgetProfileOverrides {
  readonly limits?: Readonly<Partial<SharedProcessingBudgetLimits>>
}

export interface SharedBoundedDocumentSnapshot {
  readonly path: string
  readonly byteLength: number
  readonly sha256: string
  readonly identity: Readonly<{
    device: string
    inode: string
    size: string
    modified_ns: string
    changed_ns: string
  }>
  copyBytes(): Uint8Array
  assertCurrent(): Promise<void>
}

export interface SharedOoxmlArchiveSnapshot {
  readonly documentKind: "docx" | "xlsx"
  readonly entryCount: number
  readonly expandedBytes: number
  readonly entries: readonly Readonly<{
    name: string
    directory: boolean
    compression_method: number
    compressed_bytes: number
    expanded_bytes: number
    crc32: string
  }>[]
  copyEntry(name: string): Uint8Array | undefined
}

interface SharedRuntimeModule {
  readonly DEFAULT_PROCESSING_BUDGET_PROFILE: Readonly<{ limits: SharedProcessingBudgetLimits }>
  readonly PROCESSING_BUDGET_ABSOLUTE_MAXIMA: SharedProcessingBudgetLimits
  readonly ProcessingBudgetLedger: new (profile?: SharedProcessingBudgetProfileOverrides) => SharedProcessingBudgetLedger
  readBoundedDocumentFile(input: {
    filePath: string
    rootPath?: string
    target: string
    ledger: SharedProcessingBudgetLedger
    maximumFileBytes?: number
  }): Promise<SharedBoundedDocumentSnapshot>
  preflightOoxmlArchive(input: {
    archiveBytes: Uint8Array
    target: string
    ledger: SharedProcessingBudgetLedger
    expectedKind?: "docx" | "xlsx"
    maximumEntries?: number
    maximumEntryBytes?: number
    maximumExpandedBytes?: number
  }): SharedOoxmlArchiveSnapshot
}

const runtime = require("./shared-processing-budget-runtime") as SharedRuntimeModule

export const DEFAULT_PROCESSING_BUDGET_PROFILE = runtime.DEFAULT_PROCESSING_BUDGET_PROFILE
export const PROCESSING_BUDGET_ABSOLUTE_MAXIMA = runtime.PROCESSING_BUDGET_ABSOLUTE_MAXIMA
export const ProcessingBudgetLedger = runtime.ProcessingBudgetLedger
export const readBoundedDocumentFile = runtime.readBoundedDocumentFile
export const preflightOoxmlArchive = runtime.preflightOoxmlArchive
