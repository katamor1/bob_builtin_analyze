import * as fs from "node:fs/promises"
import {
  assertProcessingBudgetReportAllowsHandoff,
  validateProcessingBudgetReport,
  type SharedProcessingBudgetReport
} from "../sharedProcessingBudgetReport"
import { processingBudgetReportPath } from "./processingBudgetCoverage"

const MAX_PROCESSING_BUDGET_REPORT_BYTES = 4 * 1024 * 1024

export async function removeStaleProcessingBudgetReport(outDir: string): Promise<void> {
  const reportPath = processingBudgetReportPath(outDir)
  try {
    const stat = await fs.lstat(reportPath)
    if (stat.isSymbolicLink() || stat.isFile()) {
      await fs.unlink(reportPath)
      return
    }
    throw new Error("processing budget report path must be a regular file")
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
}

export async function loadAndAssertCompleteProcessingBudgetReport(
  outDir: string
): Promise<Readonly<{ reportPath: string; report: SharedProcessingBudgetReport }>> {
  const reportPath = processingBudgetReportPath(outDir)
  const stat = await fs.lstat(reportPath)
  if (stat.isSymbolicLink() || !stat.isFile() || !Number.isSafeInteger(stat.size)
    || stat.size < 1 || stat.size > MAX_PROCESSING_BUDGET_REPORT_BYTES) {
    throw new Error("processing budget report is unavailable, unsafe, or oversized")
  }
  const bytes = await fs.readFile(reportPath)
  if (bytes.length !== stat.size) throw new Error("processing budget report changed while reading")
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.toString("utf8"))
  } catch {
    throw new Error("processing budget report is not valid JSON")
  }
  const report = validateProcessingBudgetReport(parsed)
  assertProcessingBudgetReportAllowsHandoff(report)
  return Object.freeze({ reportPath, report })
}
