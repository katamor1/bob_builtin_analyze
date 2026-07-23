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

export interface SharedProcessingBudgetProfileOverrides {
  readonly limits?: Readonly<Partial<{
    single_document_bytes: number
    total_document_bytes: number
    total_operation_input_bytes: number
  }>>
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

export const ProcessingBudgetLedger = runtime.ProcessingBudgetLedger
export const readBoundedDocumentFile = runtime.readBoundedDocumentFile
export const preflightOoxmlArchive = runtime.preflightOoxmlArchive
