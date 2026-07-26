declare const require: (id: string) => unknown

export interface SharedProcessingBudgetReservation {
  readonly category: string
  readonly target?: string
  readonly amount: number
  commit(actual?: number): void
  release(): void
}

export type SharedOperationScopedProcessingBudgetCategory =
  | "total_document_bytes"
  | "document_count"
  | "total_sheets"
  | "total_rows"
  | "changed_files"
  | "raw_diff_bytes"
  | "document_excerpt_bytes"
  | "bob_input_bytes"
  | "managed_artifact_bytes"
  | "total_operation_input_bytes"

export type SharedTargetScopedProcessingBudgetCategory =
  | "single_document_bytes"
  | "sheets_per_workbook"
  | "rows_per_sheet"

export interface SharedProcessingBudgetLimits {
  readonly single_document_bytes: number
  readonly total_document_bytes: number
  readonly document_count: number
  readonly sheets_per_workbook: number
  readonly total_sheets: number
  readonly rows_per_sheet: number
  readonly total_rows: number
  readonly changed_files: number
  readonly raw_diff_bytes: number
  readonly document_excerpt_bytes: number
  readonly bob_input_bytes: number
  readonly managed_artifact_bytes: number
  readonly total_operation_input_bytes: number
}

export type SharedProcessingBudgetCategory = keyof SharedProcessingBudgetLimits

export interface SharedProcessingBudgetLedgerCategoryReport {
  readonly category: SharedProcessingBudgetCategory
  readonly scope: "operation" | "target"
  readonly unit: "bytes" | "count"
  readonly limit: number
  readonly committed: number
  readonly reserved: number
  readonly used: number
  readonly remaining?: number
  readonly target_count?: number
}

export interface SharedProcessingBudgetLedgerTargetReport {
  readonly category: SharedTargetScopedProcessingBudgetCategory
  readonly target: string
  readonly unit: "bytes" | "count"
  readonly limit: number
  readonly committed: number
  readonly reserved: number
  readonly used: number
  readonly remaining: number
}

export interface SharedProcessingBudgetLedgerReport {
  readonly schema_version: "processing-budget-ledger-report/v1"
  readonly categories: readonly SharedProcessingBudgetLedgerCategoryReport[]
  readonly targets: readonly SharedProcessingBudgetLedgerTargetReport[]
}

export interface SharedProcessingBudgetLedger {
  readonly profile: Readonly<{ limits: SharedProcessingBudgetLimits }>
  reserve(category: SharedOperationScopedProcessingBudgetCategory, amount: number): SharedProcessingBudgetReservation
  reserveForTarget(category: SharedTargetScopedProcessingBudgetCategory, target: string, amount: number): SharedProcessingBudgetReservation
  snapshot(): SharedProcessingBudgetLedgerReport
}

export interface SharedProcessingBudgetProfileOverrides {
  readonly limits?: Readonly<Partial<SharedProcessingBudgetLimits>>
}

export interface SharedWorkbookBudgetCancellation {
  readonly aborted: boolean
  readonly reason?: unknown
}

export interface SharedWorkbookBudgetSheet {
  readonly target: string
  readonly rows: number
}

export interface SharedWorkbookBudgetArchiveEntry {
  readonly name: string
  readonly directory: boolean
}

export interface SharedWorkbookBudgetArchive {
  readonly entries: readonly SharedWorkbookBudgetArchiveEntry[]
  copyEntry(name: string): Uint8Array | undefined
}

export interface SharedXlsxWorkbookBudgetSheet {
  readonly name: string
  readonly entryName: string
  readonly rows: number
}

export interface SharedXlsxWorkbookBudgetCommit {
  readonly sheetCount: number
  readonly rowCount: number
  readonly sheets: readonly SharedXlsxWorkbookBudgetSheet[]
}

export interface SharedParsedXlsxWorkbookSheet {
  readonly sheet: string
  readonly data: readonly (readonly unknown[])[]
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

export type SharedProcessingCancellationKind = "user" | "deadline"

export interface SharedAbsoluteDeadline {
  readonly expires_at_monotonic_ms: number
}

export interface SharedCancellationSignal {
  readonly aborted: boolean
  readonly reason?: unknown
  addEventListener?(type: "abort", listener: () => void, options?: { readonly once?: boolean }): void
  removeEventListener?(type: "abort", listener: () => void): void
}

export interface SharedCancellationScope {
  readonly deadline: SharedAbsoluteDeadline
  readonly signal: SharedCancellationSignal
  remainingMilliseconds(): number
  throwIfCancelled(): void
  dispose(): void
}

export interface SharedPhysicalContainedPath {
  readonly root_path: string
  readonly path: string
  readonly relative_path: string
  readonly exists: boolean
}

interface SharedRuntimeModule {
  readonly DEFAULT_PROCESSING_BUDGET_PROFILE: Readonly<{ limits: SharedProcessingBudgetLimits }>
  readonly PROCESSING_BUDGET_ABSOLUTE_MAXIMA: SharedProcessingBudgetLimits
  readonly ProcessingBudgetLedger: new (profile?: SharedProcessingBudgetProfileOverrides) => SharedProcessingBudgetLedger
  commitWorkbookBudget(input: {
    ledger: SharedProcessingBudgetLedger
    workbookTarget: string
    sheets: readonly SharedWorkbookBudgetSheet[]
    signal?: SharedWorkbookBudgetCancellation
  }): Readonly<{ sheetCount: number; rowCount: number }>
  commitXlsxWorkbookBudget(input: {
    ledger: SharedProcessingBudgetLedger
    workbookTarget: string
    archive: SharedWorkbookBudgetArchive
    signal?: SharedWorkbookBudgetCancellation
    sheetTarget?: (sheet: SharedXlsxWorkbookBudgetSheet, index: number) => string
    rowsToBudget?: (sheet: SharedXlsxWorkbookBudgetSheet, index: number) => number
  }): SharedXlsxWorkbookBudgetCommit
  assertParsedXlsxWorkbookWithinBudget(
    inspection: SharedXlsxWorkbookBudgetCommit,
    parsedSheets: readonly SharedParsedXlsxWorkbookSheet[]
  ): void
  readBoundedDocumentFile(input: {
    filePath: string
    rootPath?: string
    target: string
    ledger: SharedProcessingBudgetLedger
    maximumFileBytes?: number
    signal?: SharedWorkbookBudgetCancellation
  }): Promise<SharedBoundedDocumentSnapshot>
  preflightOoxmlArchive(input: {
    archiveBytes: Uint8Array
    target: string
    ledger: SharedProcessingBudgetLedger
    expectedKind?: "docx" | "xlsx"
    maximumArchiveBytes?: number
    maximumEntries?: number
    maximumEntryBytes?: number
    maximumExpandedBytes?: number
    signal?: SharedWorkbookBudgetCancellation
  }): SharedOoxmlArchiveSnapshot
  createAbsoluteDeadline(timeoutMs: number, nowMs?: number): SharedAbsoluteDeadline
  constrainAbsoluteDeadline(parent: SharedAbsoluteDeadline, timeoutMs: number, nowMs?: number): SharedAbsoluteDeadline
  remainingDeadlineMilliseconds(deadline: SharedAbsoluteDeadline, nowMs?: number): number
  createCancellationScope(input: {
    deadline: SharedAbsoluteDeadline
    signal?: SharedCancellationSignal
  }): SharedCancellationScope
  cancellationKindFromSignal(signal: SharedCancellationSignal): SharedProcessingCancellationKind | undefined
  cancellationOriginalReason(signal: SharedCancellationSignal): unknown
  normalizeWorkspaceRelativePath(value: string, label?: string): string
  isPortablePathContained(rootPath: string, targetPath: string, platform?: string): boolean
  resolvePhysicalContainedPathSync(input: {
    rootPath: string
    candidatePath: string
    allowAbsolute?: boolean
    mustExist?: boolean
    expectedType?: "file" | "directory"
  }): SharedPhysicalContainedPath
  selectDeepestPhysicalRoot(roots: readonly string[], filePath: string): Promise<string | undefined>
}

const runtime = require("./shared-processing-budget-runtime") as SharedRuntimeModule

export const DEFAULT_PROCESSING_BUDGET_PROFILE = runtime.DEFAULT_PROCESSING_BUDGET_PROFILE
export const PROCESSING_BUDGET_ABSOLUTE_MAXIMA = runtime.PROCESSING_BUDGET_ABSOLUTE_MAXIMA
export const ProcessingBudgetLedger = runtime.ProcessingBudgetLedger
export const assertParsedXlsxWorkbookWithinBudget = runtime.assertParsedXlsxWorkbookWithinBudget
export const commitWorkbookBudget = runtime.commitWorkbookBudget
export const commitXlsxWorkbookBudget = runtime.commitXlsxWorkbookBudget
export const readBoundedDocumentFile = runtime.readBoundedDocumentFile
export const preflightOoxmlArchive = runtime.preflightOoxmlArchive
export const createAbsoluteDeadline = runtime.createAbsoluteDeadline
export const constrainAbsoluteDeadline = runtime.constrainAbsoluteDeadline
export const remainingDeadlineMilliseconds = runtime.remainingDeadlineMilliseconds
export const createCancellationScope = runtime.createCancellationScope
export const cancellationKindFromSignal = runtime.cancellationKindFromSignal
export const cancellationOriginalReason = runtime.cancellationOriginalReason
export const normalizeWorkspaceRelativePath = runtime.normalizeWorkspaceRelativePath
export const isPortablePathContained = runtime.isPortablePathContained
export const resolvePhysicalContainedPathSync = runtime.resolvePhysicalContainedPathSync
export const selectDeepestPhysicalRoot = runtime.selectDeepestPhysicalRoot
