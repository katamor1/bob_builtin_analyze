import { splitDocumentChunk } from "../documentChunk"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "../ruleAuthoringLimits"
import type { DocumentChunkV1, RuleSourceExtractionStatus } from "../ruleAuthoringTypes"
import { assertDocumentNotCancelled, assertParsedXlsxWorkbookWithinBudget, type XlsxWorkbookInspection } from "../../sharedProcessingBudgetRuntime"

type ExcelFileModule = typeof import("read-excel-file/node")

export interface XlsxExtractionContext {
  sourceId: string
  maxChunkBytes: number
  signal?: AbortSignal
  workbookInspection?: XlsxWorkbookInspection
}

export interface XlsxExtractionResult {
  chunks: DocumentChunkV1[]
  status: RuleSourceExtractionStatus
  warnings: string[]
  extractor: { id: string; version: string }
}

const XLSX_EXTRACTOR = Object.freeze({ id: "xlsx-read-excel-rows", version: "1" })

let excelFileModulePromise: Promise<ExcelFileModule> | undefined

export async function extractXlsx(
  workbookBuffer: Buffer,
  context: XlsxExtractionContext
): Promise<XlsxExtractionResult> {
  assertDocumentNotCancelled(context.signal)
  const maxChunkBytes = boundedPositiveLimit(
    context.maxChunkBytes,
    DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes,
    "XLSX chunk byte limit"
  )
  const readExcelFile = await loadExcelFile()
  assertDocumentNotCancelled(context.signal)
  const workbook = await readExcelFile.default(workbookBuffer)
  assertDocumentNotCancelled(context.signal)
  if (context.workbookInspection) assertParsedXlsxWorkbookWithinBudget(workbook, context.workbookInspection)
  const chunks: DocumentChunkV1[] = []

  for (const sheet of workbook) {
    for (const [rowIndex, row] of sheet.data.entries()) {
      const nonEmptyColumns: number[] = []
      for (const [columnIndex, cell] of row.entries()) {
        if (isNonEmptyCell(cell)) nonEmptyColumns.push(columnIndex)
      }
      if (nonEmptyColumns.length === 0) continue

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

  assertDocumentNotCancelled(context.signal)
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
