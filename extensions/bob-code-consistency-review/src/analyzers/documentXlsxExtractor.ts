import { toPosixPath } from "../core/fileSystem"
import {
  assertParsedXlsxWorkbookWithinBudget,
  commitXlsxWorkbookBudget,
  type SharedOoxmlArchiveSnapshot,
  type SharedProcessingBudgetLedger,
  type SharedWorkbookBudgetCancellation
} from "../sharedProcessingBudgetRuntime"
import type { ReviewProcessingLimits } from "../core/limits"
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

let excelFileModulePromise: Promise<ExcelFileModule> | undefined

export async function extractXlsxChunks(
  documentBytes: Uint8Array,
  displayPath: string,
  item: ArtifactRef,
  evidenceType: string,
  selectors: string[],
  warnings: string[],
  limits: ReviewProcessingLimits,
  budget: {
    ledger: SharedProcessingBudgetLedger
    workbookTarget: string
    archive: SharedOoxmlArchiveSnapshot
    signal?: SharedWorkbookBudgetCancellation
  }
): Promise<ExtractedChunk[]> {
  void warnings
  void limits
  const inspection = commitXlsxWorkbookBudget({
    ledger: budget.ledger,
    workbookTarget: budget.workbookTarget,
    archive: budget.archive,
    signal: budget.signal,
    rowsToBudget: (sheet) => Math.max(0, sheet.rows - 1)
  })
  throwIfCancelled(budget.signal)
  const readExcelFile = await loadExcelFile()
  const workbook = await readExcelFile.default(Buffer.from(documentBytes))
  assertParsedXlsxWorkbookWithinBudget(inspection, workbook)
  const sheetsByName = new Map(workbook.map((sheet) => [sheet.sheet, sheet] as const))
  const sheetNames = workbook.map((sheet) => sheet.sheet)
  const selectedNames = item.sheets && item.sheets.length > 0 ? item.sheets : sheetNames
  const prepared = selectedNames.flatMap((sheetName, selectedIndex) => {
    const sheet = sheetsByName.get(sheetName)
    if (!sheet) return []
    const rows = normalizeSheetRows(sheet)
    return [{ sheetName, selectedIndex, rows, headers: rows[0]?.map(cellText) ?? [], dataRows: rows.slice(1) }]
  })
  const chunks: ExtractedChunk[] = []

  for (const { sheetName, rows, headers, dataRows } of prepared) {
    throwIfCancelled(budget.signal)
    for (let index = 1; index <= dataRows.length; index += 1) {
      throwIfCancelled(budget.signal)
      const row = rows[index].map(cellText)
      if (row.every((cell) => !cell)) continue
      const rowText = [sheetName, ...row].join(" ")
      const rowId = firstKnownId(rowText) ?? `${sheetName}!${index + 1}`
      const table = rowsToMarkdown([headers, row])
      chunks.push({
        evidenceType,
        ref: rowId,
        title: sheetName,
        location: `${sheetName}!${index + 1}`,
        text: table
      })
    }
  }

  return matchingChunks(chunks, selectors)
}

function throwIfCancelled(signal: SharedWorkbookBudgetCancellation | undefined): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new Error("XLSX enumeration was cancelled")
}

function normalizeSheetRows(sheet: ExcelSheet): unknown[][] {
  return sheet.data.filter((row) => row.some((cell) => cellText(cell).length > 0))
}

function loadExcelFile(): Promise<ExcelFileModule> {
  excelFileModulePromise ??= import("read-excel-file/node")
  return excelFileModulePromise
}
