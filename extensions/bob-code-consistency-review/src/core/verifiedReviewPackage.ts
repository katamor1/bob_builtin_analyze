import { createHash } from "node:crypto"
import { constants as fsConstants, type BigIntStats } from "node:fs"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { PROCESSING_BUDGET_ABSOLUTE_MAXIMA } from "../sharedProcessingBudgetRuntime"

const MAX_MANAGED_FILES = 10_000
const MAX_MANAGED_BYTES = PROCESSING_BUDGET_ABSOLUTE_MAXIMA.managed_artifact_bytes
const MANAGED_PACKAGE_OUTPUTS = Object.freeze([
  "prompts",
  "code-slices",
  "tables",
  "input-normalized.json",
  "changed-files.json",
  "changed-symbols.json",
  "document-index.json",
  "evidence-index.json",
  "traceability-map.json",
  "context-budget-report.json",
  "manifest.yaml",
  "change-summary.md",
  "diff-context.md",
  "document-excerpts.md",
  "traceability-map.md",
  "deterministic-checks.md",
  "bob-input.md"
])

interface VerifiedManagedFile {
  readonly relativePath: string
  readonly byteLength: number
  copyBytes(): Uint8Array
}

export interface VerifiedReviewPackageSnapshot {
  readonly packageDir: string
  readonly contentHash: string
  readonly fileCount: number
  readonly totalBytes: number
  readonly files: readonly VerifiedManagedFile[]
}

export async function readVerifiedReviewPackage(packageDirInput: string): Promise<VerifiedReviewPackageSnapshot> {
  const packageDir = path.resolve(packageDirInput)
  const root = await fs.lstat(packageDir, { bigint: true })
  if (root.isSymbolicLink() || !root.isDirectory()) {
    throw new Error("review package root must be a physical directory")
  }

  const files: Array<{ relativePath: string; bytes: Buffer }> = []
  let totalBytes = 0
  for (const managedPath of MANAGED_PACKAGE_OUTPUTS) {
    await collectManagedFiles(packageDir, managedPath, files, () => totalBytes, (value) => { totalBytes = value })
  }
  files.sort((left, right) => compareCodePoints(left.relativePath, right.relativePath))

  const hash = createHash("sha256")
  const snapshots = files.map((file): VerifiedManagedFile => {
    hash.update(file.relativePath)
    hash.update("\0")
    hash.update(String(file.bytes.length))
    hash.update("\0")
    hash.update(file.bytes)
    hash.update("\0")
    const retained = Buffer.from(file.bytes)
    return Object.freeze({
      relativePath: file.relativePath,
      byteLength: retained.length,
      copyBytes: (): Uint8Array => Uint8Array.from(retained)
    })
  })

  return Object.freeze({
    packageDir,
    contentHash: `sha256:${hash.digest("hex")}`,
    fileCount: snapshots.length,
    totalBytes,
    files: Object.freeze(snapshots)
  })
}

export async function withMaterializedVerifiedReviewPackage<T>(
  snapshot: VerifiedReviewPackageSnapshot,
  operation: (verifiedPackageDir: string) => Promise<T>
): Promise<T> {
  const verifiedPackageDir = await fs.mkdtemp(path.join(os.tmpdir(), "bob-verified-review-"))
  try {
    await fs.chmod(verifiedPackageDir, 0o700)
    for (const file of snapshot.files) {
      const destination = path.join(verifiedPackageDir, ...file.relativePath.split("/"))
      await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 })
      await fs.writeFile(destination, file.copyBytes(), { flag: "wx", mode: 0o400 })
    }

    const materializedBefore = await readVerifiedReviewPackage(verifiedPackageDir)
    assertSnapshotMatches(snapshot, materializedBefore)

    let result: T | undefined
    let operationError: unknown
    try {
      result = await operation(verifiedPackageDir)
    } catch (error) {
      operationError = error
    }

    let verificationError: unknown
    try {
      const materializedAfter = await readVerifiedReviewPackage(verifiedPackageDir)
      assertSnapshotMatches(snapshot, materializedAfter)
    } catch (error) {
      verificationError = error
    }

    if (operationError !== undefined && verificationError !== undefined) {
      throw new AggregateError(
        [operationError, verificationError],
        "verified review package changed while the consuming operation was running"
      )
    }
    if (operationError !== undefined) throw operationError
    if (verificationError !== undefined) throw verificationError
    return result as T
  } finally {
    await fs.rm(verifiedPackageDir, { recursive: true, force: true })
  }
}

function assertSnapshotMatches(
  expected: VerifiedReviewPackageSnapshot,
  observed: VerifiedReviewPackageSnapshot
): void {
  if (observed.contentHash !== expected.contentHash
    || observed.fileCount !== expected.fileCount
    || observed.totalBytes !== expected.totalBytes) {
    throw Object.assign(new Error("materialized review package snapshot does not match verified bytes"), {
      code: "processing_budget_report_stale"
    })
  }
}

async function collectManagedFiles(
  packageDir: string,
  relativePath: string,
  target: Array<{ relativePath: string; bytes: Buffer }>,
  getTotalBytes: () => number,
  setTotalBytes: (value: number) => void
): Promise<void> {
  if (target.length > MAX_MANAGED_FILES) throw new Error(`review package exceeds ${MAX_MANAGED_FILES} managed files`)
  const absolutePath = path.join(packageDir, ...relativePath.split("/"))
  let stat: BigIntStats
  try {
    stat = await fs.lstat(absolutePath, { bigint: true })
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
  if (stat.isSymbolicLink()) throw new Error(`managed review package path must not be a symbolic link: ${relativePath}`)
  if (stat.isFile()) {
    const bytes = await readStableManagedFile(absolutePath, stat, MAX_MANAGED_BYTES - getTotalBytes(), relativePath)
    const nextTotal = safeAdd(getTotalBytes(), bytes.length, "managed review package bytes")
    if (nextTotal > MAX_MANAGED_BYTES) throw new Error(`managed review package exceeds ${MAX_MANAGED_BYTES} bytes`)
    setTotalBytes(nextTotal)
    target.push({ relativePath, bytes })
    if (target.length > MAX_MANAGED_FILES) throw new Error(`review package exceeds ${MAX_MANAGED_FILES} managed files`)
    return
  }
  if (!stat.isDirectory()) throw new Error(`managed review package path has unsupported type: ${relativePath}`)
  const entries = await fs.readdir(absolutePath, { withFileTypes: true })
  entries.sort((left, right) => compareCodePoints(left.name, right.name))
  for (const entry of entries) {
    validateRelativeSegment(entry.name)
    await collectManagedFiles(
      packageDir,
      `${relativePath}/${entry.name}`,
      target,
      getTotalBytes,
      setTotalBytes
    )
  }
}

async function readStableManagedFile(
  filePath: string,
  pathBefore: BigIntStats,
  remainingBytes: number,
  relativePath: string
): Promise<Buffer> {
  assertSafeManagedFile(pathBefore, remainingBytes, relativePath)
  const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0
  const handle = await fs.open(filePath, fsConstants.O_RDONLY | noFollow)
  try {
    const openedBefore = await handle.stat({ bigint: true })
    assertSameManagedFile(pathBefore, openedBefore, remainingBytes, relativePath)
    const size = Number(openedBefore.size)
    const bytes = Buffer.alloc(size)
    let offset = 0
    while (offset < size) {
      const { bytesRead } = await handle.read(bytes, offset, size - offset, offset)
      if (bytesRead === 0) throw new Error(`managed review package file ended early: ${relativePath}`)
      offset += bytesRead
    }
    const openedAfter = await handle.stat({ bigint: true })
    assertSameManagedFile(openedBefore, openedAfter, remainingBytes, relativePath)
    const pathAfter = await fs.lstat(filePath, { bigint: true })
    assertSameManagedFile(pathAfter, openedAfter, remainingBytes, relativePath)
    return bytes
  } finally {
    await handle.close()
  }
}

function assertSafeManagedFile(stat: BigIntStats, maximumBytes: number, relativePath: string): void {
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1n
    || stat.size < 0n || stat.size > BigInt(Math.max(0, maximumBytes))) {
    throw new Error(`managed review package file is unsafe, hard-linked, or oversized: ${relativePath}`)
  }
}

function assertSameManagedFile(
  expected: BigIntStats,
  observed: BigIntStats,
  maximumBytes: number,
  relativePath: string
): void {
  assertSafeManagedFile(expected, maximumBytes, relativePath)
  assertSafeManagedFile(observed, maximumBytes, relativePath)
  if (expected.dev !== observed.dev
    || expected.ino !== observed.ino
    || expected.size !== observed.size
    || expected.mtimeNs !== observed.mtimeNs
    || expected.ctimeNs !== observed.ctimeNs
    || expected.mode !== observed.mode) {
    throw new Error(`managed review package file changed while reading: ${relativePath}`)
  }
}

function validateRelativeSegment(value: string): void {
  if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\")
    || /[\u0000-\u001f\u007f-\u009f]/u.test(value) || value.normalize("NFC") !== value) {
    throw new Error("managed review package contains an unsafe path segment")
  }
}

function safeAdd(left: number, right: number, label: string): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0
    || right > Number.MAX_SAFE_INTEGER - left) {
    throw new Error(`${label} exceeds safe integer range`)
  }
  return left + right
}

function compareCodePoints(left: string, right: string): number {
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftCodePoint = left.codePointAt(leftIndex)
    const rightCodePoint = right.codePointAt(rightIndex)
    if (leftCodePoint === undefined || rightCodePoint === undefined) break
    if (leftCodePoint !== rightCodePoint) return leftCodePoint < rightCodePoint ? -1 : 1
    leftIndex += leftCodePoint > 0xffff ? 2 : 1
    rightIndex += rightCodePoint > 0xffff ? 2 : 1
  }
  return leftIndex < left.length ? 1 : rightIndex < right.length ? -1 : 0
}
