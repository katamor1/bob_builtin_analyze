import { normalizeReviewProcessingLimits, type ReviewProcessingLimits } from "./core/limits"
import * as fs from "node:fs"
import * as path from "node:path"
import { createHash } from "node:crypto"
import type * as Runtime from "../../../packages/processing-budget-runtime/out"
import type * as Ooxml from "../../../packages/processing-budget-runtime/out/validatedOoxml"

const modules = ["generatedProcessingBudgetDefinition", "processingBudgetError", "processingBudgetProfile", "processingBudgetLedger", "index", "boundedDocumentError", "boundedDocumentRequest", "boundedDocumentFile", "boundedDocumentIo", "ooxmlPreflight", "ooxmlParserInput", "validatedOoxml", "documentBudget", "workbookBudget"] as const
const compiledNames = modules.flatMap(name => [name + ".js", name + ".d.ts", name + ".js.map"]).sort()
const runtimeNames = modules.map(name => name + ".js")
const requiredApis = ["ProcessingBudgetLedger", "BoundedDocumentError", "readBoundedDocumentFile", "fingerprintBoundedDocumentFile", "ProcessingBudgetError", "normalizeProcessingBudgetProfile", "createDocumentOperation", "assertDocumentNotCancelled", "commitWorkbookBudget", "commitXlsxWorkbookBudget", "assertParsedXlsxWorkbookWithinBudget"] as const
function buildRequired(): never { throw new Error("Processing runtime build required; run npm ci in the shared package and this extension, then npm run compile.") }
function noAlias(file: string): void {
  const absolute = path.resolve(file), root = path.parse(absolute).root
  let current = root
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    if (fs.lstatSync(current).isSymbolicLink()) buildRequired()
  }
}
function loadCopiedRuntime(): { root: typeof Runtime; ooxml: typeof Ooxml } {
  try {
    const directory = path.join(__dirname, "shared-processing-budget-runtime")
    noAlias(directory)
    const names = fs.readdirSync(directory).sort()
    if (names.some(name => name !== "manifest.json" && !compiledNames.includes(name)) || ![...runtimeNames, "manifest.json"].every(name => names.includes(name))) buildRequired()
    for (const name of names) {
      const file = path.join(directory, name)
      noAlias(file)
      if (!fs.statSync(file).isFile()) buildRequired()
    }
    const manifest: unknown = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"))
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) buildRequired()
    const data = manifest as { schemaVersion?: unknown; sourceInputDigest?: unknown; payload?: unknown }
    if (JSON.stringify(Object.keys(data).sort()) !== JSON.stringify(["payload", "schemaVersion", "sourceInputDigest"]) || data.schemaVersion !== "bob-builtin-analyze/processing-runtime-copy/v1" || typeof data.sourceInputDigest !== "string" || !/^[0-9a-f]{64}$/.test(data.sourceInputDigest) || !Array.isArray(data.payload) || data.payload.length !== compiledNames.length) buildRequired()
    for (let index = 0; index < compiledNames.length; index++) {
      const row = data.payload[index] as { path?: unknown; bytes?: unknown; sha256?: unknown }
      if (!row || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(["bytes", "path", "sha256"]) || row.path !== compiledNames[index] || typeof row.bytes !== "number" || !Number.isSafeInteger(row.bytes) || row.bytes <= 0 || typeof row.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(row.sha256)) buildRequired()
      if (names.includes(row.path)) {
        const bytes = fs.readFileSync(path.join(directory, row.path))
        if (bytes.length !== row.bytes || createHash("sha256").update(bytes).digest("hex") !== row.sha256) buildRequired()
      }
    }
    const root = require("./shared-processing-budget-runtime") as typeof Runtime
    const ooxml = require("./shared-processing-budget-runtime/validatedOoxml") as typeof Ooxml
    if (requiredApis.some(name => typeof root[name] !== "function") || !root.DEFAULT_PROCESSING_BUDGET_PROFILE || typeof ooxml.withValidatedOoxmlParserInput !== "function") buildRequired()
    return { root, ooxml }
  } catch { return buildRequired() }
}
const copied = loadCopiedRuntime()
export const ProcessingBudgetLedger = copied.root.ProcessingBudgetLedger
export type ProcessingBudgetLedger = Runtime.ProcessingBudgetLedger
export const DEFAULT_PROCESSING_BUDGET_PROFILE = copied.root.DEFAULT_PROCESSING_BUDGET_PROFILE
export const BoundedDocumentError = copied.root.BoundedDocumentError
export const readBoundedDocumentFile = copied.root.readBoundedDocumentFile
export const fingerprintBoundedDocumentFile = copied.root.fingerprintBoundedDocumentFile
export const withValidatedOoxmlParserInput = copied.ooxml.withValidatedOoxmlParserInput
export type BoundedDocumentReadInput = Runtime.BoundedDocumentReadInput
export type BoundedDocumentFingerprint = Runtime.BoundedDocumentFingerprint
export type BoundedDocumentSnapshot = Runtime.BoundedDocumentSnapshot
export type ValidatedOoxmlParserRequest = Ooxml.ValidatedOoxmlParserRequest
export type ValidatedOoxmlParserInput = Ooxml.ValidatedOoxmlParserInput
export type OoxmlDocumentKind = Ooxml.OoxmlDocumentKind
export type OoxmlStructuralLimits = Ooxml.OoxmlStructuralLimits
export type XlsxZipCodec = Ooxml.XlsxZipCodec

export function createDocumentLedger(maximumFileBytes: number): ProcessingBudgetLedger {
  if (!Number.isSafeInteger(maximumFileBytes) || maximumFileBytes <= 0) throw new BoundedDocumentError("bounded_document_input_invalid", { phase: "input" })
  const single = Math.min(maximumFileBytes, 50 * 1048576)
  const total = Math.max(single, DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_document_bytes)
  const operation = Math.max(total, DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_operation_input_bytes)
  return new ProcessingBudgetLedger({ limits: { single_document_bytes: single, total_document_bytes: total, total_operation_input_bytes: operation } })
}

export function loadXlsxCodec(): Promise<XlsxZipCodec> {
  return import("fflate")
}

export const ProcessingBudgetError = copied.root.ProcessingBudgetError
export const normalizeProcessingBudgetProfile = copied.root.normalizeProcessingBudgetProfile
export const createDocumentOperation = copied.root.createDocumentOperation
export const assertDocumentNotCancelled = copied.root.assertDocumentNotCancelled
export const commitWorkbookBudget = copied.root.commitWorkbookBudget
export const commitXlsxWorkbookBudget = copied.root.commitXlsxWorkbookBudget
export const assertParsedXlsxWorkbookWithinBudget = copied.root.assertParsedXlsxWorkbookWithinBudget
export type SharedProcessingBudgetLimits = Runtime.ProcessingBudgetLimits
export type DocumentOperation = Runtime.DocumentOperation
export type DocumentOperationBase = Runtime.DocumentOperationBase
export type DocumentOperationInput = Runtime.DocumentOperationInput
export type DocumentSelectionRequest = Runtime.DocumentSelectionRequest
export type DocumentAdmission = Runtime.DocumentAdmission
export type DocumentOoxmlOptions = Runtime.DocumentOoxmlOptions
export type WorkbookSheetBudget = Runtime.WorkbookSheetBudget
export type WorkbookBudgetCommit = Runtime.WorkbookBudgetCommit
export type XlsxWorkbookInspection = Runtime.XlsxWorkbookInspection
export type XlsxWorkbookBudgetCommit = Runtime.XlsxWorkbookBudgetCommit
export type BudgetedOoxmlParserInput = Ooxml.BudgetedOoxmlParserInput

// Shared by direct extraction and the pipeline's pre-path admission hook.
export function createReviewDocumentProfile(limits: ReviewProcessingLimits, overrides?: Readonly<Partial<SharedProcessingBudgetLimits>>): Runtime.ProcessingBudgetProfile {
  const checked: Partial<Record<Runtime.ProcessingBudgetCategory, number>> = Object.create(null)
  function invalid(): never { throw new ProcessingBudgetError("processing_budget_profile_invalid", "review document overrides must be closed own-data limits") }
  if (overrides !== undefined) {
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) invalid()
    const prototype = Object.getPrototypeOf(overrides)
    if (prototype !== Object.prototype && prototype !== null) invalid()
    for (const key of Reflect.ownKeys(overrides)) {
      if (typeof key !== "string" || !Object.hasOwn(copied.root.PROCESSING_BUDGET_ABSOLUTE_MAXIMA, key)) invalid()
      const descriptor = Object.getOwnPropertyDescriptor(overrides, key)
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) invalid()
      const category = key as Runtime.ProcessingBudgetCategory, value: unknown = descriptor.value
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > copied.root.PROCESSING_BUDGET_ABSOLUTE_MAXIMA[category]) invalid()
      checked[category] = value
    }
  }
  const publicLimits = normalizeReviewProcessingLimits(limits)
  const totalDocument = checked.total_document_bytes ?? Math.max(publicLimits.maxDocumentBytes, DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_document_bytes)
  const totalSheets = checked.total_sheets ?? Math.max(publicLimits.maxWorkbookSheets, DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_sheets)
  const totalRows = checked.total_rows ?? Math.max(publicLimits.maxRowsPerSheet, DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_rows)
  return normalizeProcessingBudgetProfile({ limits: {
    ...checked,
    total_document_bytes: totalDocument,
    total_operation_input_bytes: checked.total_operation_input_bytes ?? Math.max(totalDocument, DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_operation_input_bytes),
    total_sheets: totalSheets, total_rows: totalRows,
    single_document_bytes: Math.min(publicLimits.maxDocumentBytes, checked.single_document_bytes ?? publicLimits.maxDocumentBytes, totalDocument),
    sheets_per_workbook: Math.min(publicLimits.maxWorkbookSheets, checked.sheets_per_workbook ?? publicLimits.maxWorkbookSheets, totalSheets),
    rows_per_sheet: Math.min(publicLimits.maxRowsPerSheet, checked.rows_per_sheet ?? publicLimits.maxRowsPerSheet, totalRows)
  } })
}

export function createReviewDocumentOperation(count: number, limits: ReviewProcessingLimits, processingBudgetLimits?: Readonly<Partial<SharedProcessingBudgetLimits>>, signal?: AbortSignal): DocumentOperation {
  assertDocumentNotCancelled(signal)
  return createDocumentOperation({ selectedDocumentCount: count, profile: createReviewDocumentProfile(limits, processingBudgetLimits), signal })
}
