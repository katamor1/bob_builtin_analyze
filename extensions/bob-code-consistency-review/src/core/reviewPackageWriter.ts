import * as fs from "node:fs/promises"
import * as path from "node:path"
import {
  assertDocumentNotCancelled, assertProcessingOperation,
  type ProcessingOperation, type ProcessingBudgetReservation
} from "../sharedProcessingBudgetRuntime"

export const MANAGED_PACKAGE_OUTPUTS = [
  "prompts", "code-slices", "tables", "input-normalized.json", "changed-files.json",
  "changed-symbols.json", "document-index.json", "evidence-index.json", "traceability-map.json",
  "context-budget-report.json", "manifest.yaml", "change-summary.md", "diff-context.md",
  "document-excerpts.md", "traceability-map.md", "deterministic-checks.md", "bob-input.md"
] as const

export interface ManagedReviewFile { readonly relativePath: string; readonly absolutePath: string }
const directories: ReadonlySet<string> = new Set(["prompts", "code-slices", "tables"])

function managedPath(outDir: string, relativePath: string): string {
  const pieces = relativePath.split("/")
  if (pieces.some(piece => !piece || piece === "." || piece === ".." || piece.includes("\\") || piece.includes(":"))
    || !(MANAGED_PACKAGE_OUTPUTS as readonly string[]).includes(pieces[0])
    || (pieces.length > 1 && !directories.has(pieces[0]))) throw new Error("invalid managed review package path")
  const root = path.resolve(outDir), absolute = path.resolve(root, ...pieces)
  if (!absolute.startsWith(root + path.sep)) throw new Error("managed review package path escaped output directory")
  return absolute
}

async function assertNoAlias(directory: string): Promise<void> {
  const absolute = path.resolve(directory), root = path.parse(absolute).root
  let current = root
  for (const piece of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, piece)
    const stat = await fs.lstat(current)
    if (stat.isSymbolicLink()) throw new Error("managed review package path must not contain an alias")
  }
}

export async function collectManagedReviewFiles(outDir: string): Promise<ManagedReviewFile[]> {
  const files: ManagedReviewFile[] = []
  async function visit(relativePath: string): Promise<void> {
    const absolutePath = managedPath(outDir, relativePath)
    let stat
    try { stat = await fs.lstat(absolutePath) }
    catch (error) { if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return; throw error }
    if (stat.isSymbolicLink()) throw new Error("managed review package output must not be an alias")
    if (stat.isFile()) { files.push({ relativePath, absolutePath }); return }
    if (!stat.isDirectory() || !directories.has(relativePath.split("/")[0])) throw new Error("unsupported managed review package output")
    for (const name of (await fs.readdir(absolutePath)).sort()) await visit(`${relativePath}/${name}`)
  }
  await assertNoAlias(outDir)
  for (const name of MANAGED_PACKAGE_OUTPUTS) await visit(name)
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

export async function computeManagedReviewPackageBytes(outDir: string): Promise<number> {
  let bytes = 0
  for (const file of await collectManagedReviewFiles(outDir)) {
    const size = (await fs.stat(file.absolutePath)).size
    if (!Number.isSafeInteger(size) || bytes > Number.MAX_SAFE_INTEGER - size) throw new Error("invalid managed review package byte count")
    bytes += size
  }
  return bytes
}

export async function cleanManagedPackageOutputs(outDir: string): Promise<void> {
  await assertNoAlias(outDir)
  let failed = false, firstFailure: unknown
  // Settle every removal; no sibling cleanup continues after this function returns.
  for (const name of MANAGED_PACKAGE_OUTPUTS) {
    try { await fs.rm(managedPath(outDir, name), { recursive: true, force: true }) }
    catch (error) { if (!failed) { failed = true; firstFailure = error } }
  }
  if (failed) throw firstFailure
}

export interface ReviewPackageWriter {
  writeText(relativePath: string, text: string): Promise<void>
  writeJson(relativePath: string, value: unknown): Promise<void>
  measure(): Promise<number>
  commit(): void
  release(): void
}

export function createReviewPackageWriter(input: {
  outDir: string; operation: ProcessingOperation; signal?: AbortSignal
}): ReviewPackageWriter {
  assertProcessingOperation(input.operation)
  const signal = input.signal ?? input.operation.signal
  if (signal !== input.operation.signal) throw new Error("review package signal must belong to its operation")
  assertDocumentNotCancelled(signal)
  const reservations: ProcessingBudgetReservation[] = [], written = new Map<string, number>()
  let state: "open" | "committed" | "released" = "open"
  function check(): void {
    assertDocumentNotCancelled(signal)
    if (state !== "open") throw new Error("review package writer is already settled")
  }
  async function writeText(relativePath: string, text: string): Promise<void> {
    check()
    const absolute = managedPath(input.outDir, relativePath)
    if (directories.has(relativePath) || written.has(relativePath)) throw new Error("managed review package file was already written or is a directory")
    const bytes = Buffer.byteLength(text, "utf8")
    const reservation = input.operation.reserve("managed_artifact_bytes", bytes)
    reservations.push(reservation)
    await fs.mkdir(path.dirname(absolute), { recursive: true })
    await assertNoAlias(path.dirname(absolute))
    try { if ((await fs.lstat(absolute)).isSymbolicLink()) throw new Error("managed review package output must not be an alias") }
    catch (error) { if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error }
    check()
    await fs.writeFile(absolute, text, "utf8")
    check()
    written.set(relativePath, bytes)
  }
  return {
    writeText,
    writeJson: (relativePath, value) => writeText(relativePath, JSON.stringify(value, null, 2) + "\n"),
    async measure(): Promise<number> {
      check()
      const files = await collectManagedReviewFiles(input.outDir)
      if (files.length !== written.size) throw new Error("managed review package file set changed")
      let bytes = 0
      for (const file of files) {
        const size = (await fs.stat(file.absolutePath)).size
        if (written.get(file.relativePath) !== size) throw new Error("managed review package output size changed")
        bytes += size
      }
      check()
      return bytes
    },
    commit(): void { check(); for (const reservation of reservations) reservation.commit(); state = "committed" },
    release(): void {
      if (state !== "open") return
      for (const reservation of [...reservations].reverse()) reservation.release()
      state = "released"
    }
  }
}
