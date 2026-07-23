export interface WorkbookBudgetReservation {
  commit(actualAmount?: number): void
  release(): void
}

export interface WorkbookBudgetLedger {
  reserveForTarget(
    category: "sheets_per_workbook" | "rows_per_sheet",
    target: string,
    amount: number
  ): WorkbookBudgetReservation
}

export interface WorkbookBudgetSheet {
  readonly target: string
  readonly rows: number
}

export interface WorkbookBudgetCancellation {
  readonly aborted: boolean
  readonly reason?: unknown
}

export interface WorkbookBudgetInput {
  readonly ledger: WorkbookBudgetLedger
  readonly workbookTarget: string
  readonly sheets: readonly WorkbookBudgetSheet[]
  readonly signal?: WorkbookBudgetCancellation
}

export interface WorkbookBudgetCommit {
  readonly sheetCount: number
  readonly rowCount: number
}

export function commitWorkbookBudget(input: WorkbookBudgetInput): WorkbookBudgetCommit {
  const reservations: WorkbookBudgetReservation[] = []
  let rowCount = 0
  try {
    throwIfCancelled(input.signal)
    const sheetCount = input.sheets.length
    if (!Number.isSafeInteger(sheetCount)) {
      throw new Error("workbook sheet count must be a non-negative safe integer")
    }
    reservations.push(input.ledger.reserveForTarget("sheets_per_workbook", input.workbookTarget, sheetCount))

    for (const sheet of input.sheets) {
      throwIfCancelled(input.signal)
      const target = sheet.target
      const rows = sheet.rows
      throwIfCancelled(input.signal)
      if (!Number.isSafeInteger(rows) || rows < 0) {
        throw new Error("workbook sheet rows must be a non-negative safe integer")
      }
      if (rows > Number.MAX_SAFE_INTEGER - rowCount) {
        throw new Error("workbook row total must be a non-negative safe integer")
      }
      rowCount += rows
      reservations.push(input.ledger.reserveForTarget("rows_per_sheet", target, rows))
    }

    throwIfCancelled(input.signal)
    for (const reservation of reservations) reservation.commit()
    return Object.freeze({ sheetCount, rowCount })
  } catch (error) {
    for (let index = reservations.length - 1; index >= 0; index -= 1) {
      try {
        reservations[index].release()
      } catch {
        // Preserve the first failure. Successful reservations are reversible;
        // a finalized reservation can only indicate an internal invariant failure.
      }
    }
    throw error
  }
}

function throwIfCancelled(signal: WorkbookBudgetCancellation | undefined): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new Error("workbook enumeration was cancelled")
}
