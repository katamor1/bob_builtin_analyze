import { createDocumentLedger, readBoundedDocumentFile, fingerprintBoundedDocumentFile, withValidatedOoxmlParserInput, loadXlsxCodec } from "../sharedProcessingBudgetRuntime"
import { normalizeReviewProcessingLimits, type ReviewProcessingLimits } from "./limits"
import { decodeTextBuffer } from "./textEncoding"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { relativePosix, resolveWorkspacePathStrict } from "./fileSystem"
import type { ArtifactKind, ReviewInputArtifactDraft } from "./reviewInputBuilder"

type ExcelFileModule = typeof import("read-excel-file/node")

export type ReviewInputDiscoveryOptions = {
  docsRoot?: string
  maxFiles?: number
  maxIdsPerFile?: number
  textEncoding?: string
  limits?: Partial<ReviewProcessingLimits>
}

export type ReviewInputDocumentCandidate = ReviewInputArtifactDraft & {
  label: string
  description?: string
}

export type ReviewInputDiscoveryResult = {
  documents: ReviewInputDocumentCandidate[]
  warnings: string[]
}

const DOCUMENT_EXTENSIONS = new Set([".md", ".markdown", ".docx", ".xlsx"])
const SKIPPED_DIRECTORY_NAMES = new Set(["node_modules", ".git", ".bzr", ".bob-review", ".bob-trace", "out", "dist"])
const KNOWN_ID_PATTERN = /\b(?:REQ|BD|DD|TC|QA|RV|ERR|ISSUE|TICKET|LEDGER)(?:[-_][A-Za-z0-9]+)+\b/g
let excelFileModulePromise: Promise<ExcelFileModule> | undefined

export async function discoverReviewInputCandidates(workspaceRoot: string, options: ReviewInputDiscoveryOptions = {}): Promise<ReviewInputDiscoveryResult> {
  const warnings: string[] = []
  const root = resolveWorkspacePathStrict(workspaceRoot, options.docsRoot ?? "docs", "docsRoot")
  const limits = normalizeReviewProcessingLimits(options.limits)
  const maxFiles = options.maxFiles ?? 200
  const maxIdsPerFile = options.maxIdsPerFile ?? 20

  let files: string[] = []
  try {
    files = await walkDocumentFiles(root, maxFiles)
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      warnings.push(`docs root does not exist: ${root}`)
      return { documents: [], warnings }
    }
    throw error
  }

  const documents: ReviewInputDocumentCandidate[] = []
  for (const filePath of files) {
    const relativePath = relativePosix(workspaceRoot, filePath)
    const kind = inferArtifactKind(relativePath)
    const extension = path.extname(filePath).toLowerCase()
    try {
      if (extension === ".md" || extension === ".markdown") {
        documents.push(await discoverMarkdownCandidate(filePath, relativePath, kind, options.textEncoding ?? "auto", maxIdsPerFile, workspaceRoot, limits))
      } else if (extension === ".xlsx") {
        documents.push(await discoverXlsxCandidate(filePath, relativePath, kind, maxIdsPerFile, workspaceRoot, limits))
      } else {
        documents.push({ kind, path: relativePath, label: relativePath, description: `${kind}; ID 抽出は未実施` })
      }
    } catch (error) {
      warnings.push(`failed to discover ${relativePath}: ${error instanceof Error ? error.message : String(error)}`)
      documents.push({ kind, path: relativePath, label: relativePath, description: kind })
    }
  }

  return { documents, warnings }
}

async function walkDocumentFiles(root: string, maxFiles: number): Promise<string[]> {
  const result: string[] = []
  const pending = [root]
  while (pending.length > 0 && result.length < maxFiles) {
    const current = pending.shift() as string
    const entries = await fs.readdir(current, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !SKIPPED_DIRECTORY_NAMES.has(entry.name)) pending.push(fullPath)
        continue
      }
      if (entry.isFile() && DOCUMENT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) result.push(fullPath)
      if (result.length >= maxFiles) break
    }
  }
  return result
}

async function discoverMarkdownCandidate(filePath: string, relativePath: string, kind: ArtifactKind, textEncoding: string, maxIds: number, workspaceRoot: string, limits: ReviewProcessingLimits): Promise<ReviewInputDocumentCandidate> {
  const snapshot = await readBoundedDocumentFile(documentRequest(filePath, workspaceRoot, limits))
  const markdown = decodeTextBuffer(snapshot.copyBytes(), textEncoding)
  const ids = uniqueMatches(markdown, maxIds)
  const selectorKey = kind === "test_spec" ? "cases" : "sections"
  return {
    kind,
    path: relativePath,
    [selectorKey]: ids.length > 0 ? ids : undefined,
    label: relativePath,
    description: descriptionText(kind, ids)
  }
}

async function discoverXlsxCandidate(filePath: string, relativePath: string, kind: ArtifactKind, maxIds: number, workspaceRoot: string, limits: ReviewProcessingLimits): Promise<ReviewInputDocumentCandidate> {
  const request = documentRequest(filePath, workspaceRoot, limits)
  const expectedFingerprint = await fingerprintBoundedDocumentFile({ filePath, rootPath: request.rootPath, maximumFileBytes: limits.maxDocumentBytes })
  return withValidatedOoxmlParserInput({ ...request, expectedFingerprint, documentKind: "xlsx", structuralLimits: { maxEntries: 5000, maxExpandedBytes: 250 * 1048576 }, loadXlsxCodec }, async ({ parserInput }) => {
    const readExcelFile = await loadExcelFile()
    const workbook = await readExcelFile.default(parserInput)
    const ids: string[] = []
    const sheetNames = workbook.map((sheet) => sheet.sheet)
    for (const sheet of workbook) {
      for (const row of sheet.data.slice(0, 80)) {
        ids.push(...uniqueMatches(row.map(cellText).join(" "), maxIds - ids.length))
        if (ids.length >= maxIds) break
      }
      if (ids.length >= maxIds) break
    }

    return {
      kind,
      path: relativePath,
      sheets: sheetNames.length > 0 ? sheetNames : undefined,
      rows: ids.length > 0 ? ids : undefined,
      label: relativePath,
      description: descriptionText(kind, ids.length > 0 ? ids : sheetNames)
    }
  })
}

function documentRequest(filePath: string, workspaceRoot: string, limits: ReviewProcessingLimits) {
  return { filePath, rootPath: path.resolve(workspaceRoot), maximumFileBytes: limits.maxDocumentBytes, target: "discovery", ledger: createDocumentLedger(limits.maxDocumentBytes) }
}

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return ""
  if (cell instanceof Date) return cell.toISOString()
  return String(cell).trim()
}

function inferArtifactKind(relativePath: string): ArtifactKind {
  const lower = relativePath.toLowerCase()
  if (/requirement|requirements|req|要求/.test(lower)) return "requirements"
  if (/basic|bd|基本/.test(lower)) return "basic_design"
  if (/detail|detailed|dd|詳細/.test(lower)) return "detailed_design"
  if (/test|tc|試験|テスト/.test(lower)) return "test_spec"
  if (/qa|q-a|質問|回答|qa表/.test(lower)) return "ledgers"
  if (/review|rv|レビュー|指摘/.test(lower)) return "tickets"
  if (/ledger|table|error|err|台帳/.test(lower)) return "ledgers"
  if (/ticket|issue|bug|redmine/.test(lower)) return "tickets"
  return "requirements"
}

function uniqueMatches(text: string, maxItems: number): string[] {
  if (maxItems <= 0) return []
  const result: string[] = []
  for (const match of text.matchAll(KNOWN_ID_PATTERN)) {
    const id = match[0]
    if (!result.includes(id)) result.push(id)
    if (result.length >= maxItems) break
  }
  return result
}

function descriptionText(kind: ArtifactKind, ids: string[]): string {
  if (ids.length === 0) return `${kind}; ID 候補なし`
  return `${kind}; ${ids.slice(0, 4).join(", ")}${ids.length > 4 ? " ..." : ""}`
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error
}

function loadExcelFile(): Promise<ExcelFileModule> {
  excelFileModulePromise ??= import("read-excel-file/node")
  return excelFileModulePromise
}
