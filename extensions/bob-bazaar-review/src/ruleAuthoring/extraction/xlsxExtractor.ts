import { splitDocumentChunk } from "../documentChunk"
import type { DocumentChunkV1, RuleSourceExtractionStatus } from "../ruleAuthoringTypes"

type ExcelFileModule = typeof import("read-excel-file/node")

export interface XlsxExtractionContext {
  sourceId: string
  maxChunkBytes: number
}

export interface XlsxExtractionResult {
  chunks: DocumentChunkV1[]
  status: RuleSourceExtractionStatus
  warnings: string[]
  extractor: { id: string; version: string }
}

const XLSX_EXTRACTOR = Object.freeze({ id: "read-excel-file", version: "9.2.0" })

let excelFileModulePromise: Promise<ExcelFileModule> | undefined

export async function extractXlsx(
  filePath: string,
  context: XlsxExtractionContext
): Promise<XlsxExtractionResult> {
  const readExcelFile = await loadExcelFile()
  const workbook = await readExcelFile.default(filePath)
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
      }, context.maxChunkBytes))
    }
  }

  return {
    chunks,
    status: "success",
    warnings: [],
    extractor: { ...XLSX_EXTRACTOR }
  }
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
