import { createHash } from "node:crypto"
import type { BigIntStats } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { BoundedDocumentError, type BoundedDocumentErrorCode } from "./boundedDocumentError"
import { assertNotAborted, normalizeReadInput, type BoundedDocumentFingerprint, type BoundedDocumentReadInput } from "./boundedDocumentRequest"
import type { ProcessingBudgetReservation } from "./processingBudgetLedger"

function changed(): never { throw new BoundedDocumentError("bounded_document_source_changed", { phase: "verify" }) }
async function fileOperation<T>(operation: () => Promise<T>, code: BoundedDocumentErrorCode = "bounded_document_read_failed"): Promise<T> {
  try { return await operation() } catch (error) {
    if (error instanceof BoundedDocumentError) throw error
    throw new BoundedDocumentError(code)
  }
}
function within(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)
}
async function rejectLinks(filePath: string): Promise<void> {
  const parsed = path.parse(filePath)
  let current = parsed.root
  for (const part of filePath.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    const stat = await fs.lstat(current)
    if (stat.isSymbolicLink()) throw new BoundedDocumentError("bounded_document_source_invalid")
  }
}
function asFingerprint(stat: BigIntStats, sha256: string): BoundedDocumentFingerprint {
  return Object.freeze({ byteSize: stat.size.toString(), mtimeNs: stat.mtimeNs.toString(), device: stat.dev.toString(), inode: stat.ino.toString(), sha256 })
}
function sameStat(before: BigIntStats, after: BigIntStats): void {
  if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs) changed()
}
function expectedMatches(expected: BoundedDocumentFingerprint, actual: BoundedDocumentFingerprint): void {
  for (const key of ["byteSize", "mtimeNs", "device", "inode", "sha256"] as const) if (expected[key] !== actual[key]) changed()
}
async function sourcePath(input: BoundedDocumentReadInput, rootIdentity?: BigIntStats): Promise<{ root: string, stat: BigIntStats }> {
  if (!within(input.rootPath, input.filePath)) throw new BoundedDocumentError("bounded_document_source_invalid")
  await rejectLinks(input.rootPath)
  await rejectLinks(input.filePath)
  const rootStat = await fs.lstat(input.rootPath, { bigint: true })
  if (!rootStat.isDirectory()) throw new BoundedDocumentError("bounded_document_source_invalid")
  if (rootIdentity && (rootIdentity.dev !== rootStat.dev || rootIdentity.ino !== rootStat.ino)) changed()
  const root = await fs.realpath(input.rootPath)
  if (!within(root, await fs.realpath(input.filePath))) throw new BoundedDocumentError("bounded_document_source_invalid")
  return { root, stat: rootStat }
}
async function readExactly(file: fs.FileHandle, buffer: Buffer, position = 0): Promise<void> {
  let offset = 0
  while (offset < buffer.length) {
    const read = await file.read(buffer, offset, buffer.length - offset, position + offset)
    if (!Number.isSafeInteger(read.bytesRead) || read.bytesRead <= 0 || read.bytesRead > buffer.length - offset) throw new BoundedDocumentError("bounded_document_read_failed", { phase: "read" })
    offset += read.bytesRead
  }
}
async function verify(file: fs.FileHandle, input: BoundedDocumentReadInput, before: BigIntStats, initial: BoundedDocumentFingerprint, root: { root: string, stat: BigIntStats }): Promise<void> {
  assertNotAborted(input.signal)
  sameStat(before, await file.stat({ bigint: true }))
  const hash = createHash("sha256")
  const chunk = Buffer.alloc(Math.min(65536, Number(before.size)))
  for (let offset = 0; offset < Number(before.size); offset += chunk.length) {
    assertNotAborted(input.signal)
    const view = chunk.subarray(0, Math.min(chunk.length, Number(before.size) - offset))
    await readExactly(file, view, offset)
    hash.update(view)
  }
  sameStat(before, await file.stat({ bigint: true }))
  if (hash.digest("hex") !== initial.sha256) changed()
  const currentRoot = await sourcePath(input, root.stat)
  if (currentRoot.root !== root.root) changed()
  sameStat(before, await fs.lstat(input.filePath, { bigint: true }))
  assertNotAborted(input.signal)
}

export async function withBoundedDocumentSnapshot<T>(value: BoundedDocumentReadInput, consume: (snapshot: { bytes: Buffer, fingerprint: BoundedDocumentFingerprint }) => Promise<T>): Promise<T> {
  const input = normalizeReadInput(value)
  if (typeof consume !== "function") throw new BoundedDocumentError("bounded_document_input_invalid")
  assertNotAborted(input.signal)
  let file: fs.FileHandle | undefined
  let reservation: ProcessingBudgetReservation | undefined
  let failed = false
  let primary: unknown
  let result: T | undefined
  let byteLength = 0
  try {
    const root = await fileOperation(() => sourcePath(input), "bounded_document_source_invalid")
    file = await fileOperation(() => fs.open(input.filePath, "r"), "bounded_document_source_invalid")
    const before = await fileOperation(() => file!.stat({ bigint: true }))
    if (!before.isFile() || before.size < 0n || before.size > BigInt(input.maximumFileBytes)) throw new BoundedDocumentError("bounded_document_source_invalid", { phase: "read", limit: input.maximumFileBytes })
    sameStat(before, await fileOperation(() => fs.lstat(input.filePath, { bigint: true })))
    if (input.expectedFingerprint) {
      expectedMatches(input.expectedFingerprint, asFingerprint(before, input.expectedFingerprint.sha256))
    }
    byteLength = Number(before.size)
    reservation = input.ledger.reserveForTarget("single_document_bytes", input.target, byteLength)
    assertNotAborted(input.signal)
    const bytes = Buffer.alloc(byteLength)
    await fileOperation(() => readExactly(file!, bytes))
    const fingerprint = asFingerprint(before, createHash("sha256").update(bytes).digest("hex"))
    sameStat(before, await fileOperation(() => file!.stat({ bigint: true })))
    if (input.expectedFingerprint) expectedMatches(input.expectedFingerprint, fingerprint)
    assertNotAborted(input.signal)
    result = await consume({ bytes, fingerprint })
    await fileOperation(() => verify(file!, input, before, fingerprint, root))
  } catch (error) { failed = true; primary = error }
  finally {
    if (file) {
      try { await file.close() } catch {
        if (!failed) { failed = true; primary = new BoundedDocumentError("bounded_document_cleanup_failed", { phase: "close" }) }
      }
    }
    if (!failed) {
      try { assertNotAborted(input.signal) } catch (error) { failed = true; primary = error }
    }
    if (failed && reservation) {
      try { reservation.release() } catch { /* Preserve the first failure; the real ledger finalizes atomically. */ }
    }
  }
  if (failed) throw primary
  try { reservation!.commit(byteLength) } catch (error) {
    try { reservation!.release() } catch { /* Retain the commit failure. */ }
    throw error
  }
  return result as T
}
