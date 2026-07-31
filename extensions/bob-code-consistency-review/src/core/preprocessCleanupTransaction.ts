import { randomUUID } from "node:crypto"
import { constants as fsConstants, type BigIntStats } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import {
  processingBudgetReportPath
} from "./processingBudgetCoverage"
import {
  processingBudgetReportBindingPath,
  removeStaleProcessingBudgetReport
} from "./processingBudgetReportGuard"
import { cleanManagedReviewPackageOutputs } from "./reviewPackageCoverageGuard"
import {
  readVerifiedReviewPackage,
  type VerifiedReviewPackageSnapshot
} from "./verifiedReviewPackage"

const MAX_PROCESSING_BUDGET_REPORT_BYTES = 4 * 1024 * 1024
const MAX_PROCESSING_BUDGET_BINDING_BYTES = 4 * 1024

interface PreprocessOutputsSnapshot {
  readonly packageSnapshot?: VerifiedReviewPackageSnapshot
  readonly reportBytes?: Uint8Array
  readonly bindingBytes?: Uint8Array
}

/**
 * Removes the prior managed preprocess outputs as one rollback-capable
 * boundary. If cancellation or cleanup failure is observed after deletion has
 * started, every safely captured prior byte is restored and the binding is
 * installed last so a half-restored package never becomes handoff-eligible.
 */
export async function cleanPreprocessOutputsWithRollback(
  outDirInput: string,
  signal: AbortSignal | undefined
): Promise<void> {
  const outDir = path.resolve(outDirInput)
  throwIfCancelled(signal)
  const snapshot = await capturePreprocessOutputs(outDir, signal)
  throwIfCancelled(signal)

  try {
    await removeStaleProcessingBudgetReport(outDir)
    throwIfCancelled(signal)
    await cleanManagedReviewPackageOutputs(outDir)
    throwIfCancelled(signal)
  } catch (error) {
    try {
      await restorePreprocessOutputs(outDir, snapshot)
    } catch (restoreError) {
      throw new AggregateError(
        [error, restoreError],
        "Preprocess output cleanup failed and the prior outputs could not be restored."
      )
    }
    throw error
  }
}

async function capturePreprocessOutputs(
  outDir: string,
  signal: AbortSignal | undefined
): Promise<PreprocessOutputsSnapshot> {
  const reportPath = processingBudgetReportPath(outDir)
  const bindingPath = processingBudgetReportBindingPath(outDir)
  const packageSnapshot = await readOptionalPackageSnapshot(outDir, signal)
  throwIfCancelled(signal)
  const reportBytes = await readOptionalStableFile(
    reportPath,
    MAX_PROCESSING_BUDGET_REPORT_BYTES,
    "processing budget report",
    signal
  )
  throwIfCancelled(signal)
  const bindingBytes = await readOptionalStableFile(
    bindingPath,
    MAX_PROCESSING_BUDGET_BINDING_BYTES,
    "processing budget report binding",
    signal
  )
  throwIfCancelled(signal)
  return Object.freeze({
    ...(packageSnapshot === undefined ? {} : { packageSnapshot }),
    ...(reportBytes === undefined ? {} : { reportBytes }),
    ...(bindingBytes === undefined ? {} : { bindingBytes })
  })
}

async function restorePreprocessOutputs(
  outDir: string,
  snapshot: PreprocessOutputsSnapshot
): Promise<void> {
  await removeStaleProcessingBudgetReport(outDir)
  await cleanManagedReviewPackageOutputs(outDir)

  if (snapshot.packageSnapshot) {
    await fs.mkdir(outDir, { recursive: true, mode: 0o700 })
    for (const file of snapshot.packageSnapshot.files) {
      const destination = path.join(outDir, ...file.relativePath.split("/"))
      await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 })
      await fs.writeFile(destination, file.copyBytes(), { flag: "wx", mode: 0o600 })
    }
    const restored = await readVerifiedReviewPackage(outDir)
    if (restored.contentHash !== snapshot.packageSnapshot.contentHash
      || restored.fileCount !== snapshot.packageSnapshot.fileCount
      || restored.totalBytes !== snapshot.packageSnapshot.totalBytes) {
      throw new Error("Restored review package does not match the captured package bytes.")
    }
  }

  if (snapshot.reportBytes) {
    await replaceBytesAtomically(processingBudgetReportPath(outDir), snapshot.reportBytes)
  }
  if (snapshot.bindingBytes) {
    await replaceBytesAtomically(processingBudgetReportBindingPath(outDir), snapshot.bindingBytes)
  }
}

async function readOptionalPackageSnapshot(
  outDir: string,
  signal: AbortSignal | undefined
): Promise<VerifiedReviewPackageSnapshot | undefined> {
  throwIfCancelled(signal)
  try {
    const snapshot = await readVerifiedReviewPackage(outDir, signal)
    throwIfCancelled(signal)
    return snapshot
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

async function readOptionalStableFile(
  filePath: string,
  maximumBytes: number,
  label: string,
  signal: AbortSignal | undefined
): Promise<Uint8Array | undefined> {
  throwIfCancelled(signal)
  let pathBefore: BigIntStats
  try {
    pathBefore = await fs.lstat(filePath, { bigint: true })
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
  throwIfCancelled(signal)
  assertSafeSnapshotFile(pathBefore, maximumBytes, label)
  const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0
  const handle = await fs.open(filePath, fsConstants.O_RDONLY | noFollow)
  try {
    throwIfCancelled(signal)
    const openedBefore = await handle.stat({ bigint: true })
    throwIfCancelled(signal)
    assertSameSnapshotFile(pathBefore, openedBefore, maximumBytes, label)
    const size = Number(openedBefore.size)
    const bytes = Buffer.alloc(size)
    let offset = 0
    while (offset < size) {
      throwIfCancelled(signal)
      const { bytesRead } = await handle.read(bytes, offset, size - offset, offset)
      throwIfCancelled(signal)
      if (bytesRead === 0) throw new Error(`${label} ended before its opened size`)
      offset += bytesRead
    }
    const openedAfter = await handle.stat({ bigint: true })
    throwIfCancelled(signal)
    assertSameSnapshotFile(openedBefore, openedAfter, maximumBytes, label)
    const pathAfter = await fs.lstat(filePath, { bigint: true })
    throwIfCancelled(signal)
    assertSameSnapshotFile(pathAfter, openedAfter, maximumBytes, label)
    return Uint8Array.from(bytes)
  } finally {
    await handle.close()
  }
}

async function replaceBytesAtomically(filePath: string, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.restore.tmp`
  )
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(temporaryPath, "wx", 0o600)
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = undefined
    await fs.rename(temporaryPath, filePath)
  } catch (error) {
    if (handle) {
      try { await handle.close() } catch {}
    }
    try { await fs.rm(temporaryPath, { force: true }) } catch {}
    throw error
  }
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw Object.assign(new Error("Preprocess cleanup was cancelled."), {
    code: "processing_cancelled",
    kind: "user"
  })
}

function assertSafeSnapshotFile(stat: BigIntStats, maximumBytes: number, label: string): void {
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1n
    || stat.size < 0n || stat.size > BigInt(maximumBytes)) {
    throw new Error(`${label} is unavailable, unsafe, hard-linked, or oversized`)
  }
}

function assertSameSnapshotFile(
  expected: BigIntStats,
  observed: BigIntStats,
  maximumBytes: number,
  label: string
): void {
  assertSafeSnapshotFile(expected, maximumBytes, label)
  assertSafeSnapshotFile(observed, maximumBytes, label)
  if (expected.dev !== observed.dev
    || expected.ino !== observed.ino
    || expected.size !== observed.size
    || expected.mtimeNs !== observed.mtimeNs
    || expected.ctimeNs !== observed.ctimeNs
    || expected.mode !== observed.mode) {
    throw new Error(`${label} changed identity or content metadata while capturing cleanup rollback state`)
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT"
}
