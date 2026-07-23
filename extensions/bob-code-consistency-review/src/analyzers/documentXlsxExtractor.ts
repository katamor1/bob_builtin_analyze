import { toPosixPath } from "../core/fileSystem"
import type { ReviewProcessingLimits } from "../core/limits"
import {
  commitWorkbookBudget,
  type SharedProcessingBudgetLedger,
  type SharedWorkbookBudgetCancellation
} from "../sharedProcessingBudgetRuntime"
import {
  cellText,
  firstKnownId,
  matchingChunks,
  rowsToMarkdown,
  type ArtifactRef,
  type ExtractedChunk
} from "./documentExtractionCommon"

type ExcelFileModule = typeof import("read-excel-file/node")
type ExcelSheet = import("read-excel-file/node").Sheet

export interface XlsxBudgetContext {
  readonly ledger: SharedProcessingBudgetLedger
  readonly workbookTarget: string
  readonly signal?: SharedWorkbookBudgetCancellation
}

let excelFileModulePromise: Promise<ExcelFileModule> | undefined

export async function extractXlsxChunks(
  documentBytes: Uint8Array,
  displayPath: string,
  item: ArtifactRef,
  evidenceType: string,
  selectors: string[],
  warnings: string[],
  limits: ReviewProcessingLimits,
  budget: XlsxBudgetContext
): Promise<ExtractedChunk[]> {
  throwIfCancelled(budget.signal)
  const readExcelFile = await loadExcelFile()
  const workbook = await readExcelFile.default(Buffer.from(documentBytes))
  const sheetsByName = new Map(workbook.map((sheet) => [sheet.sheet, sheet] as const))
  const sheetNames = workbook.map((sheet) => sheet.sheet)
  const requestedNames = item.sheets && item.sheets.length > 0 ? item.sheets : sheetNames
  const selected = requestedNames.flatMap((sheetName, sheetIndex) => {
    const sheet = sheetsByName.get(sheetName)
    if (!sheet) return []
    const rows = normalizeSheetRows(sheet)
    if (rows.length === 0) return [{ sheet, sheetIndex, headers: [], dataRows: [] }]
    return [{ sheet, sheetIndex, headers: rows[0].map(cellText), dataRows: rows.slice(1) }]
  })

  commitWorkbookBudget({
    ledger: budget.ledger,
    workbookTarget: budget.workbookTarget,
    sheets: selected.map(({ sheetIndex, dataRows }) => ({
      target: `${budget.workbookTarget}:sheet:${sheetIndex}`,
      rows: dataRows.length
    })),
    signal: budget.signal
  })

  const chunks: ExtractedChunk[] = []
  for (const { sheet, headers, dataRows } of selected) {
    throwIfCancelled(budget.signal)
    for (let index = 0; index < dataRows.length; index += 1) {
      throwIfCancelled(budget.signal)
      const row = dataRows[index].map(cellText)
      if (row.every((cell) => !cell)) continue
      const rowText = [sheet.sheet, ...row].join(" ")
      const rowId = firstKnownId(rowText) ?? `${sheet.sheet}!${index + 2}`
      const table = rowsToMarkdown([headers, row])
      chunks.push({
        evidenceType,
        ref: rowId,
        title: sheet.sheet,
        location: `${sheet.sheet}!${index + 2}`,
        text: table
      })
    }
  }

  return matchingChunks(chunks, selectors)
}

function normalizeSheetRows(sheet: ExcelSheet): unknown[][] {
  return sheet.data.filter((row) => row.some((cell) => cellText(cell).length > 0))
}

function throwIfCancelled(signal: SharedWorkbookBudgetCancellation | undefined): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new Error("XLSX enumeration was cancelled")
}

function loadExcelFile(): Promise<ExcelFileModule> {
  excelFileModulePromise ??= import("read-excel-file/node")
  return excelFileModulePromise
}
