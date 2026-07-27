import * as path from "node:path"
import {
  ProcessingBudgetLedger,
  assertParsedXlsxWorkbookWithinBudget,
  commitXlsxWorkbookBudget,
  preflightOoxmlArchive,
  readBoundedDocumentFile,
  type SharedProcessingBudgetLedger,
  type SharedWorkbookBudgetCancellation
} from "../../sharedProcessingBudgetRuntime"
import { splitDocumentChunk } from "../documentChunk"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "../ruleAuthoringLimits"
import type { DocumentChunkV1, RuleSourceExtractionStatus } from "../ruleAuthoringTypes"

type ExcelFileModule = typeof import("read-excel-file/node")

export interface XlsxExtractionContext {
  sourceId: string
  maxChunkBytes: number
  maxFileBytes?: number
  maxArchiveEntries?: number
  maxExpandedBytes?: number
  budgetLedger?: SharedProcessingBudgetLedger
  signal?: SharedWorkbookBudgetCancellation
}

export interface XlsxExtractionResult {
  chunks: DocumentChunkV1[]
  status: RuleSourceExtractionStatus
  warnings: string[]
  extractor: { id: string; version: string }
}

const XLSX_EXTRACTOR = Object.freeze({ id: "xlsx-read-excel-rows", version: "2" })

let excelFileModulePromise: Promise<ExcelFileModule> | undefined

export async function extractXlsx(
  filePath: string,
  context: XlsxExtractionContext
): Promise<XlsxExtractionResult> {
  throwIfCancelled(context.signal)
  const maxChunkBytes = boundedPositiveLimit(
    context.maxChunkBytes,
    DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes,
    "XLSX chunk byte limit"
  )
  const maxFileBytes = boundedOptionalLimit(
    context.maxFileBytes,
    DEFAULT_RULE_AUTHORING_LIMITS.maxSourceBytes,
    "XLSX source byte limit"
  )
  const maxArchiveEntries = boundedOptionalLimit(
    context.maxArchiveEntries,
    DEFAULT_RULE_AUTHORING_LIMITS.maxOoxmlEntries,
    "XLSX archive entry limit"
  )
  const maxExpandedBytes = boundedOptionalLimit(
    context.maxExpandedBytes,
    DEFAULT_RULE_AUTHORING_LIMITS.maxOoxmlDeclaredUncompressedBytes,
    "XLSX expanded byte limit"
  )
  const absolutePath = path.resolve(filePath)
  const readLedger = new ProcessingBudgetLedger({
    limits: {
      single_document_bytes: maxFileBytes,
      total_document_bytes: maxExpandedBytes,
      total_operation_input_bytes: maxExpandedBytes
    }
  })
  const snapshot = await readBoundedDocumentFile({
    filePath: absolutePath,
    rootPath: path.dirname(absolutePath),
    target: documentTarget(context.sourceId),
    ledger: readLedger,
    maximumFileBytes: maxFileBytes
  })
  throwIfCancelled(context.signal)
  const archive = preflightOoxmlArchive({
    archiveBytes: snapshot.copyBytes(),
    target: archiveTarget(context.sourceId),
    ledger: context.budgetLedger ?? readLedger,
    expectedKind: "xlsx",
    maximumEntries: maxArchiveEntries,
    maximumEntryBytes: maxFileBytes,
    maximumExpandedBytes: maxExpandedBytes
  })

  const budgetLedger = context.budgetLedger ?? readLedger
  const inspection = commitXlsxWorkbookBudget({
    ledger: budgetLedger,
    workbookTarget: workbookTarget(context.sourceId),
    archive,
    signal: context.signal,
    sheetTarget: (_sheet, sheetIndex) => sheetTarget(context.sourceId, sheetIndex)
  })
  throwIfCancelled(context.signal)
  const readExcelFile = await loadExcelFile()
  const workbook = await readExcelFile.default(Buffer.from(snapshot.copyBytes()))
  assertParsedXlsxWorkbookWithinBudget(inspection, workbook)
  const prepared = workbook.map((sheet) => ({
    sheet,
    rows: sheet.data.map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ row }) => row.some(isNonEmptyCell))
  }))
  const chunks: DocumentChunkV1[] = []

  for (const { sheet, rows } of prepared) {
    throwIfCancelled(context.signal)
    for (const { row, rowIndex } of rows) {
      throwIfCancelled(context.signal)
      const nonEmptyColumns: number[] = []
      for (const [columnIndex, cell] of row.entries()) {
        if (isNonEmptyCell(cell)) nonEmptyColumns.push(columnIndex)
      }
      const firstColumn = nonEmptyColumns[0]
      const lastColumn = nonEmptyColumns.at(-1) ?? firstColumn
      const excelRow = rowIndex + 1
      const text = row.slice(firstColumn, lastColumn + 1).map(cellText).join("\t")
      chunks.push(...splitDocumentChunk({
        sourceId: context.sourceId,
        mediaType: "xlsx",
        kind: "row",
        locator: {
          sheet: sheet.sheet,
          row: excelRow,
          cell_range: `${columnName(firstColumn)}${excelRow}:${columnName(lastColumn)}${excelRow}`
        },
        title: sheet.sheet,
        text
      }, maxChunkBytes))
    }
  }

  await snapshot.assertCurrent()
  return {
    chunks,
    status: "success",
    warnings: [],
    extractor: { ...XLSX_EXTRACTOR }
  }
}

function boundedPositiveLimit(value: number, ceiling: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`)
  return Math.min(value, ceiling)
}

function boundedOptionalLimit(value: number | undefined, ceiling: number, label: string): number {
  return value === undefined ? ceiling : boundedPositiveLimit(value, ceiling, label)
}

function documentTarget(sourceId: string): string {
  return `xlsx:source:${boundedSourceId(sourceId)}`
}

function archiveTarget(sourceId: string): string {
  return `xlsx:archive:${boundedSourceId(sourceId)}`
}

function boundedSourceId(sourceId: string): string {
  return /^[A-Za-z0-9._-]{1,96}$/.test(sourceId) ? sourceId : "untrusted-source"
}

function workbookTarget(sourceId: string): string {
  return `xlsx:workbook:${boundedSourceId(sourceId)}`
}

function sheetTarget(sourceId: string, sheetIndex: number): string {
  return `${workbookTarget(sourceId)}:sheet:${sheetIndex}`
}

function throwIfCancelled(signal: SharedWorkbookBudgetCancellation | undefined): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new Error("XLSX enumeration was cancelled")
}

function isNonEmptyCell(value: unknown): boolean {
  return value !== null && value !== undefined && (typeof value !== "string" || value.length > 0)
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString()
  return String(value).replace(/[\t\r\n]+/g, " ")
}

function columnName(zeroBasedColumn: number): string {
  let column = zeroBasedColumn + 1
  let output = ""
  while (column > 0) {
    const remainder = (column - 1) % 26
    output = String.fromCharCode(65 + remainder) + output
    column = Math.floor((column - 1) / 26)
  }
  return output
}

function loadExcelFile(): Promise<ExcelFileModule> {
  excelFileModulePromise ??= import("read-excel-file/node")
  return excelFileModulePromise
}
