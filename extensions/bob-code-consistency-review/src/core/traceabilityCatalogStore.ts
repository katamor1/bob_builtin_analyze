import { createHash, randomUUID } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { resolveWorkspacePathForKind } from "./fileSystem"
import { decodeTextBuffer } from "./textEncoding"
import { renderTraceabilityGateReport, validateTraceabilityCatalog, type TraceabilityCatalog, type TraceabilityItem, type TraceabilityValidationReport } from "./traceabilityCatalog"

export const DEFAULT_TRACEABILITY_CATALOG_PATH = ".bob-trace/traceability-catalog.json"
export const DEFAULT_TRACEABILITY_GATE_REPORT_PATH = ".bob-trace/gate-report.md"

export type ReadTraceabilityCatalogResult =
  | { status: "ok"; catalog: TraceabilityCatalog; catalogPath: string; created: boolean; revision: string | null }
  | { status: "error"; catalogPath: string; errors: string[] }

export type WriteTraceabilityCatalogResult =
  | { status: "ok"; catalogPath: string; backupPath?: string; revision: string }
  | { status: "error"; catalogPath: string; errors: string[]; code?: "stale_revision" }

export type ValidateAndWriteTraceabilityGateReportResult =
  | { status: "ok"; catalogPath: string; reportPath: string; report: TraceabilityValidationReport; markdown: string; revision: string | null }
  | { status: "error"; catalogPath: string; reportPath: string; errors: string[]; code?: "stale_revision" }

const catalogPathTails = new Map<string, Promise<void>>()

export async function readTraceabilityCatalog(input: {
  workspaceRoot: string
  catalogPath?: string
  textEncoding?: string
}): Promise<ReadTraceabilityCatalogResult> {
  const catalogPath = resolveCatalogPath(input.workspaceRoot, input.catalogPath)
  return readCatalogSnapshot(catalogPath, input.textEncoding)
}

export async function writeTraceabilityCatalog(input: {
  workspaceRoot: string
  catalogPath?: string
  catalog: TraceabilityCatalog
  backupExisting?: boolean
  expectedRevision?: string | null
}): Promise<WriteTraceabilityCatalogResult> {
  const catalogPath = resolveCatalogPath(input.workspaceRoot, input.catalogPath)
  return withCatalogPathLock(catalogPath, async () => {
    try {
      const existingBytes = await readOptionalFile(catalogPath)
      const currentRevision = existingBytes ? contentRevision(existingBytes) : null
      if (input.expectedRevision !== undefined && input.expectedRevision !== currentRevision) {
        return staleCatalogWrite(catalogPath, input.expectedRevision, currentRevision)
      }

      let backupPath: string | undefined
      if (input.backupExisting && existingBytes) {
        backupPath = uniqueBackupPath(catalogPath)
        await fs.writeFile(backupPath, existingBytes)
      }
      const bytes = Buffer.from(`${JSON.stringify(normalizeCatalog(input.catalog), null, 2)}\n`, "utf8")
      await atomicReplaceFile(catalogPath, bytes)
      return { status: "ok", catalogPath, backupPath, revision: contentRevision(bytes) }
    } catch (error) {
      return {
        status: "error",
        catalogPath,
        errors: [`traceability catalog write failed: ${error instanceof Error ? error.message : String(error)}`]
      }
    }
  })
}

export async function validateAndWriteTraceabilityGateReport(input: {
  workspaceRoot: string
  catalogPath?: string
  reportPath?: string
  textEncoding?: string
  expectedRevision?: string | null
}): Promise<ValidateAndWriteTraceabilityGateReportResult> {
  const catalogPath = resolveCatalogPath(input.workspaceRoot, input.catalogPath)
  const reportPath = resolveWorkspacePathForKind(input.workspaceRoot, input.reportPath ?? DEFAULT_TRACEABILITY_GATE_REPORT_PATH, "traceability-gate-report")
  return withCatalogPathLock(catalogPath, async () => {
    const read = await readCatalogSnapshot(catalogPath, input.textEncoding)
    if (read.status === "error") return { status: "error", catalogPath, reportPath, errors: read.errors }
    if (input.expectedRevision !== undefined && input.expectedRevision !== read.revision) {
      return {
        status: "error",
        code: "stale_revision",
        catalogPath,
        reportPath,
        errors: [staleRevisionMessage(input.expectedRevision, read.revision)]
      }
    }

    const report = validateTraceabilityCatalog(read.catalog)
    const markdown = renderTraceabilityGateReport(report)
    try {
      await atomicReplaceFile(reportPath, Buffer.from(markdown, "utf8"))
      return { status: "ok", catalogPath, reportPath, report, markdown, revision: read.revision }
    } catch (error) {
      return {
        status: "error",
        catalogPath,
        reportPath,
        errors: [`traceability gate report write failed: ${error instanceof Error ? error.message : String(error)}`]
      }
    }
  })
}

export function emptyTraceabilityCatalog(): TraceabilityCatalog {
  return {
    schema_version: 1,
    documents: [],
    domains: [],
    items: [],
    links: [],
    decisions: []
  }
}

export function resolveCatalogPath(workspaceRoot: string, catalogPath = DEFAULT_TRACEABILITY_CATALOG_PATH): string {
  return resolveWorkspacePathForKind(workspaceRoot, catalogPath, "traceability-catalog")
}

function normalizeCatalog(value: unknown): TraceabilityCatalog {
  const record = isRecord(value) ? value : {}
  const maybeWrapped = isRecord(record.catalog) ? record.catalog : record
  const catalog = maybeWrapped as Partial<TraceabilityCatalog>
  return {
    schema_version: 1,
    documents: Array.isArray(catalog.documents) ? catalog.documents : [],
    domains: Array.isArray(catalog.domains) ? catalog.domains : [],
    items: Array.isArray(catalog.items) ? catalog.items.map(normalizeCatalogItem) : [],
    links: Array.isArray(catalog.links) ? catalog.links : [],
    decisions: Array.isArray(catalog.decisions) ? catalog.decisions : []
  }
}

function normalizeCatalogItem(item: TraceabilityItem): TraceabilityItem {
  const sequence = sequenceFromTraceabilityId(item.id ?? item.proposed_id)
  return sequence === undefined ? item : { ...item, sequence }
}

function sequenceFromTraceabilityId(id: string | null | undefined): number | undefined {
  if (!id) return undefined
  const match = id.match(/-(\d{4})$/)
  if (!match) return undefined
  const sequence = Number(match[1])
  return Number.isInteger(sequence) && sequence > 0 ? sequence : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function timestampForFileName(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

async function readCatalogSnapshot(catalogPath: string, textEncoding = "utf8"): Promise<ReadTraceabilityCatalogResult> {
  let bytes: Buffer | undefined
  try {
    bytes = await readOptionalFile(catalogPath)
  } catch (error) {
    return {
      status: "error",
      catalogPath,
      errors: [`traceability catalog read failed: ${error instanceof Error ? error.message : String(error)}`]
    }
  }
  if (!bytes) {
    return { status: "ok", catalog: emptyTraceabilityCatalog(), catalogPath, created: true, revision: null }
  }
  try {
    const parsed = JSON.parse(decodeTextBuffer(bytes, textEncoding)) as unknown
    return {
      status: "ok",
      catalog: normalizeCatalog(parsed),
      catalogPath,
      created: false,
      revision: contentRevision(bytes)
    }
  } catch (error) {
    return {
      status: "error",
      catalogPath,
      errors: [`traceability catalog JSON parse failed: ${error instanceof Error ? error.message : String(error)}`]
    }
  }
}

async function readOptionalFile(filePath: string): Promise<Buffer | undefined> {
  try {
    return await fs.readFile(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

function contentRevision(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`
}

function uniqueBackupPath(catalogPath: string): string {
  return `${catalogPath}.bak-${timestampForFileName(new Date())}-${randomUUID().replace(/-/g, "").slice(0, 12)}`
}

async function atomicReplaceFile(filePath: string, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    await fs.writeFile(tempPath, bytes)
    await renameWithTransientRetry(tempPath, filePath)
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function renameWithTransientRetry(source: string, target: string): Promise<void> {
  const delaysMs = [10, 50, 100]
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(source, target)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (!(["EPERM", "EACCES", "EBUSY"].includes(code ?? "")) || attempt >= delaysMs.length) throw error
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]))
    }
  }
}

async function withCatalogPathLock<T>(catalogPath: string, operation: () => Promise<T>): Promise<T> {
  const key = await canonicalLockKey(catalogPath)
  const prior = catalogPathTails.get(key) ?? Promise.resolve()
  const owner = prior.then(operation, operation)
  const tail = owner.then(() => undefined, () => undefined)
  catalogPathTails.set(key, tail)
  void tail.then(() => {
    if (catalogPathTails.get(key) === tail) catalogPathTails.delete(key)
  })
  return owner
}

async function canonicalLockKey(catalogPath: string): Promise<string> {
  const resolved = path.resolve(catalogPath)
  let current = resolved
  const missingSuffix: string[] = []
  while (true) {
    try {
      const realAncestor = await fs.realpath(current)
      return normalizeLockKey(path.resolve(realAncestor, ...missingSuffix))
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error
      const parent = path.dirname(current)
      if (parent === current) return normalizeLockKey(resolved)
      missingSuffix.unshift(path.basename(current))
      current = parent
    }
  }
}

function normalizeLockKey(value: string): string {
  const normalized = path.normalize(value)
  return process.platform === "win32" ? normalized.toLocaleLowerCase() : normalized
}

function staleCatalogWrite(
  catalogPath: string,
  expectedRevision: string | null,
  currentRevision: string | null
): WriteTraceabilityCatalogResult {
  return {
    status: "error",
    code: "stale_revision",
    catalogPath,
    errors: [staleRevisionMessage(expectedRevision, currentRevision)]
  }
}

function staleRevisionMessage(expectedRevision: string | null, currentRevision: string | null): string {
  return `traceability catalog stale revision (expected ${expectedRevision ?? "missing"}, current ${currentRevision ?? "missing"}); refresh and retry`
}
