import { randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import {
  assertProcessingBudgetReportAllowsHandoff,
  validateProcessingBudgetReport,
  type SharedProcessingBudgetReport
} from "../sharedProcessingBudgetReport"
import { processingBudgetReportPath } from "./processingBudgetCoverage"
import { computeManagedReviewPackageContentHash } from "./reviewPackageBuilder"

const MAX_PROCESSING_BUDGET_REPORT_BYTES = 4 * 1024 * 1024
const MAX_PROCESSING_BUDGET_BINDING_BYTES = 4 * 1024
const PROCESSING_BUDGET_BINDING_SCHEMA = "processing-budget-package-binding/v1" as const
const SHA256 = /^sha256:[a-f0-9]{64}$/u

interface ProcessingBudgetPackageBinding {
  readonly schema_version: typeof PROCESSING_BUDGET_BINDING_SCHEMA
  readonly report_input_sha256: string
  readonly package_content_sha256: string
}

export function processingBudgetReportBindingPath(outDir: string): string {
  return `${outDir}.processing-budget-report.binding.json`
}

export async function removeStaleProcessingBudgetReport(outDir: string): Promise<void> {
  await removeRegularFileIfPresent(processingBudgetReportPath(outDir), "processing budget report")
  await removeProcessingBudgetReportBinding(outDir)
}

export async function removeProcessingBudgetReportBinding(outDir: string): Promise<void> {
  await removeRegularFileIfPresent(processingBudgetReportBindingPath(outDir), "processing budget report binding")
}

export async function persistCompleteProcessingBudgetBinding(input: {
  readonly outDir: string
  readonly reportInputSha256: string
  readonly packageContentSha256: string
}): Promise<string> {
  const binding: ProcessingBudgetPackageBinding = Object.freeze({
    schema_version: PROCESSING_BUDGET_BINDING_SCHEMA,
    report_input_sha256: checkedSha(input.reportInputSha256, "report input SHA"),
    package_content_sha256: checkedSha(input.packageContentSha256, "package content SHA")
  })
  const bindingPath = processingBudgetReportBindingPath(input.outDir)
  await writeTextAtomic(bindingPath, `${JSON.stringify(binding, null, 2)}\n`)
  return bindingPath
}

export async function loadAndAssertCompleteProcessingBudgetReport(
  outDir: string
): Promise<Readonly<{ reportPath: string; bindingPath: string; report: SharedProcessingBudgetReport }>> {
  const reportPath = processingBudgetReportPath(outDir)
  const bindingPath = processingBudgetReportBindingPath(outDir)
  const [reportValue, bindingValue] = await Promise.all([
    readBoundedJson(reportPath, MAX_PROCESSING_BUDGET_REPORT_BYTES, "processing budget report"),
    readBoundedJson(bindingPath, MAX_PROCESSING_BUDGET_BINDING_BYTES, "processing budget report binding")
  ])
  const binding = validateBinding(bindingValue)
  const report = validateProcessingBudgetReport(reportValue, {
    expected_input_sha256: binding.report_input_sha256
  })
  assertProcessingBudgetReportAllowsHandoff(report, {
    expected_input_sha256: binding.report_input_sha256
  })
  const packageContentSha256 = await computeManagedReviewPackageContentHash(outDir)
  if (packageContentSha256 !== binding.package_content_sha256) {
    throw Object.assign(new Error("processing budget report binding is stale for the current review package"), {
      code: "processing_budget_report_stale"
    })
  }
  return Object.freeze({ reportPath, bindingPath, report })
}

function validateBinding(value: unknown): ProcessingBudgetPackageBinding {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("processing budget report binding must be an object")
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.join("\0") !== ["package_content_sha256", "report_input_sha256", "schema_version"].sort().join("\0")) {
    throw new Error("processing budget report binding has unknown or missing properties")
  }
  if (record.schema_version !== PROCESSING_BUDGET_BINDING_SCHEMA) {
    throw new Error(`processing budget report binding schema must be ${PROCESSING_BUDGET_BINDING_SCHEMA}`)
  }
  return Object.freeze({
    schema_version: PROCESSING_BUDGET_BINDING_SCHEMA,
    report_input_sha256: checkedSha(record.report_input_sha256, "report input SHA"),
    package_content_sha256: checkedSha(record.package_content_sha256, "package content SHA")
  })
}

function checkedSha(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} is invalid`)
  return value
}

async function readBoundedJson(filePath: string, maximumBytes: number, label: string): Promise<unknown> {
  const stat = await fs.lstat(filePath)
  if (stat.isSymbolicLink() || !stat.isFile() || !Number.isSafeInteger(stat.size)
    || stat.size < 1 || stat.size > maximumBytes) {
    throw new Error(`${label} is unavailable, unsafe, or oversized`)
  }
  const bytes = await fs.readFile(filePath)
  if (bytes.length !== stat.size) throw new Error(`${label} changed while reading`)
  try {
    return JSON.parse(bytes.toString("utf8"))
  } catch {
    throw new Error(`${label} is not valid JSON`)
  }
}

async function removeRegularFileIfPresent(filePath: string, label: string): Promise<void> {
  try {
    const stat = await fs.lstat(filePath)
    if (stat.isSymbolicLink() || stat.isFile()) {
      await fs.unlink(filePath)
      return
    }
    throw new Error(`${label} path must be a regular file`)
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
}

async function writeTextAtomic(filePath: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  const backupPath = `${filePath}.${process.pid}.${randomUUID()}.bak`
  let existing = false
  let backedUp = false
  try {
    try {
      const stat = await fs.lstat(filePath)
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("processing budget binding path must be a regular file")
      existing = true
    } catch (error) {
      if (!(error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT")) throw error
    }
    await fs.writeFile(temporaryPath, text, { encoding: "utf8", flag: "wx", mode: 0o600 })
    if (existing) {
      await fs.rename(filePath, backupPath)
      backedUp = true
    }
    await fs.rename(temporaryPath, filePath)
    if (backedUp) await fs.rm(backupPath, { force: true })
  } catch (error) {
    try { await fs.rm(temporaryPath, { force: true }) } catch {}
    if (backedUp) {
      try {
        await fs.rm(filePath, { force: true })
        await fs.rename(backupPath, filePath)
      } catch {}
    }
    throw error
  }
}
