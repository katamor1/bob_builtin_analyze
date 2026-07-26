import { constants as fsConstants, type BigIntStats } from "node:fs"
import * as fs from "node:fs/promises"
import { TextDecoder } from "node:util"
import {
  assertProcessingBudgetReportAllowsHandoff,
  validateProcessingBudgetReport,
  type SharedProcessingBudgetReport
} from "../sharedProcessingBudgetReport"
import { replaceTextFileAtomically } from "./atomicReplaceFile"
import { processingBudgetReportPath } from "./processingBudgetCoverage"
import {
  readVerifiedReviewPackage,
  withMaterializedVerifiedReviewPackage,
  type VerifiedReviewPackageSnapshot
} from "./verifiedReviewPackage"

const MAX_PROCESSING_BUDGET_REPORT_BYTES = 4 * 1024 * 1024
const MAX_PROCESSING_BUDGET_BINDING_BYTES = 4 * 1024
const PROCESSING_BUDGET_BINDING_SCHEMA = "processing-budget-package-binding/v1" as const
const SHA256 = /^sha256:[a-f0-9]{64}$/u

interface ProcessingBudgetPackageBinding {
  readonly schema_version: typeof PROCESSING_BUDGET_BINDING_SCHEMA
  readonly report_input_sha256: string
  readonly package_content_sha256: string
}

export interface LoadedCompleteProcessingBudgetReport {
  readonly reportPath: string
  readonly bindingPath: string
  readonly report: SharedProcessingBudgetReport
  readonly packageSnapshot: VerifiedReviewPackageSnapshot
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
  await replaceTextFileAtomically(bindingPath, `${JSON.stringify(binding, null, 2)}\n`)
  return bindingPath
}

export async function loadAndAssertCompleteProcessingBudgetReport(
  outDir: string
): Promise<LoadedCompleteProcessingBudgetReport> {
  const reportPath = processingBudgetReportPath(outDir)
  const bindingPath = processingBudgetReportBindingPath(outDir)
  const [reportValue, bindingValue, packageSnapshot] = await Promise.all([
    readBoundedJson(reportPath, MAX_PROCESSING_BUDGET_REPORT_BYTES, "processing budget report"),
    readBoundedJson(bindingPath, MAX_PROCESSING_BUDGET_BINDING_BYTES, "processing budget report binding"),
    readVerifiedReviewPackage(outDir)
  ])
  const binding = validateBinding(bindingValue)
  const report = validateProcessingBudgetReport(reportValue, {
    expected_input_sha256: binding.report_input_sha256
  })
  assertProcessingBudgetReportAllowsHandoff(report, {
    expected_input_sha256: binding.report_input_sha256
  })
  if (packageSnapshot.contentHash !== binding.package_content_sha256) {
    throw Object.assign(new Error("processing budget report binding is stale for the current review package"), {
      code: "processing_budget_report_stale"
    })
  }
  return Object.freeze({ reportPath, bindingPath, report, packageSnapshot })
}

export async function withCompleteProcessingBudgetReport<T>(
  outDir: string,
  operation: (verifiedPackageDir: string, report: SharedProcessingBudgetReport) => Promise<T>
): Promise<T> {
  const loaded = await loadAndAssertCompleteProcessingBudgetReport(outDir)
  return withMaterializedVerifiedReviewPackage(
    loaded.packageSnapshot,
    (verifiedPackageDir) => operation(verifiedPackageDir, loaded.report)
  )
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
  const pathBefore = await fs.lstat(filePath, { bigint: true })
  assertSafePathFile(pathBefore, maximumBytes, label)
  const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0
  const handle = await fs.open(filePath, fsConstants.O_RDONLY | noFollow)
  try {
    const openedBefore = await handle.stat({ bigint: true })
    assertStableOpenedFile(pathBefore, openedBefore, maximumBytes, label)
    const size = Number(openedBefore.size)
    const bytes = Buffer.alloc(size)
    let offset = 0
    while (offset < size) {
      const { bytesRead } = await handle.read(bytes, offset, size - offset, offset)
      if (bytesRead === 0) throw new Error(`${label} ended before its opened size`)
      offset += bytesRead
    }
    const openedAfter = await handle.stat({ bigint: true })
    assertStableOpenedFile(openedBefore, openedAfter, maximumBytes, label)
    const pathAfter = await fs.lstat(filePath, { bigint: true })
    assertStableOpenedFile(pathAfter, openedAfter, maximumBytes, label)

    let text: string
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
      throw new Error(`${label} is not valid UTF-8`)
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`${label} is not valid JSON`)
    }
  } finally {
    await handle.close()
  }
}

function assertSafePathFile(stat: BigIntStats, maximumBytes: number, label: string): void {
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1n
    || stat.size < 1n || stat.size > BigInt(maximumBytes)) {
    throw new Error(`${label} is unavailable, unsafe, hard-linked, or oversized`)
  }
}

function assertStableOpenedFile(
  expected: BigIntStats,
  observed: BigIntStats,
  maximumBytes: number,
  label: string
): void {
  assertSafePathFile(expected, maximumBytes, label)
  assertSafePathFile(observed, maximumBytes, label)
  if (expected.dev !== observed.dev
    || expected.ino !== observed.ino
    || expected.size !== observed.size
    || expected.mtimeNs !== observed.mtimeNs
    || expected.ctimeNs !== observed.ctimeNs
    || expected.mode !== observed.mode) {
    throw new Error(`${label} changed identity or content metadata while reading`)
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
