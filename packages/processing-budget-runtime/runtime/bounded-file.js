"use strict"

const { createHash } = require("node:crypto")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const pathPolicy = require("./path-policy")
const {
  boundedString,
  ledgerFrom,
  ownDataRecord,
  positiveSafeInteger,
  preserveTypedError,
  processingError
} = require("./errors")

const MAX_PUBLIC_PATH_UTF8_BYTES = 4_096
const MAX_TARGET_UTF8_BYTES = 256
const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024
const ABSOLUTE_MAX_FILE_BYTES = 256 * 1024 * 1024

function snapshotReadInput(input) {
  const values = ownDataRecord(
    input,
    ["filePath", "rootPath", "target", "ledger", "maximumFileBytes"],
    ["rootPath", "maximumFileBytes"],
    "bounded document read input"
  )
  return Object.freeze({
    filePath: boundedString(values.filePath, "filePath", MAX_PUBLIC_PATH_UTF8_BYTES),
    rootPath: values.rootPath === undefined ? undefined : boundedString(values.rootPath, "rootPath", MAX_PUBLIC_PATH_UTF8_BYTES),
    target: boundedString(values.target, "target", MAX_TARGET_UTF8_BYTES),
    ledger: ledgerFrom(values.ledger),
    maximumFileBytes: values.maximumFileBytes === undefined
      ? DEFAULT_MAX_FILE_BYTES
      : positiveSafeInteger(values.maximumFileBytes, "maximumFileBytes", ABSOLUTE_MAX_FILE_BYTES)
  })
}

async function readBoundedDocumentFile(input, hooks = undefined) {
  const options = snapshotReadInput(input)
  const resolved = resolveSafeDocumentPath(options.filePath, options.rootPath)
  const absolutePath = resolved.path

  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)
  let handle
  try { handle = await fsp.open(absolutePath, flags) } catch {
    throw processingError("bounded_document_unavailable", "document file is unavailable or symlinked")
  }

  let reservation
  try {
    const before = await handle.stat({ bigint: true })
    assertRegularStat(before, options.maximumFileBytes, "before read")
    const size = Number(before.size)
    reservation = options.ledger.reserveForTarget("single_document_bytes", options.target, size)
    if (hooks && typeof hooks.afterReserve === "function") await hooks.afterReserve({ absolutePath, handle, size })

    const content = Buffer.alloc(size)
    let offset = 0
    while (offset < size) {
      const result = await handle.read(content, offset, size - offset, offset)
      if (result.bytesRead === 0) throw processingError("bounded_document_short_read", "document file ended before its reserved byte count")
      offset += result.bytesRead
      if (hooks && typeof hooks.afterReadChunk === "function") await hooks.afterReadChunk({ absolutePath, handle, size, offset })
    }
    if ((await handle.read(Buffer.alloc(1), 0, 1, size)).bytesRead !== 0) {
      throw processingError("bounded_document_grew", "document file grew after its byte reservation")
    }

    const after = await handle.stat({ bigint: true })
    assertSameIdentity(before, after, "document file changed while reading")
    assertNamedPathCurrent(absolutePath, options.rootPath, after)
    reservation.commit(size)
    reservation = undefined

    const retained = Buffer.from(content)
    const identity = Object.freeze({
      device: String(after.dev),
      inode: String(after.ino),
      size: String(after.size),
      modified_ns: String(after.mtimeNs),
      changed_ns: String(after.ctimeNs)
    })
    return Object.freeze({
      path: absolutePath,
      byteLength: retained.length,
      sha256: createHash("sha256").update(retained).digest("hex"),
      identity,
      copyBytes: () => Uint8Array.from(retained),
      assertCurrent: async () => assertNamedPathCurrent(absolutePath, options.rootPath, after)
    })
  } catch (error) {
    if (reservation) try { reservation.release() } catch {}
    preserveTypedError(error, "bounded_document_read_failed", "document read failed")
  } finally {
    try { await handle.close() } catch {}
  }
}

function assertRegularStat(stat, maximumFileBytes, phase) {
  if (!stat.isFile()) throw processingError("bounded_document_not_regular", `document must be a regular file ${phase}`)
  if (stat.nlink !== undefined && stat.nlink !== 1n) throw processingError("bounded_document_linked", `document must have exactly one hard link ${phase}`)
  if (stat.size < 0n || stat.size > BigInt(Number.MAX_SAFE_INTEGER) || stat.size > BigInt(maximumFileBytes)) {
    throw processingError("processing_budget_exceeded", `document byte size exceeds the ${maximumFileBytes}-byte hard limit`, {
      constrainedCategory: "single_document_bytes",
      limit: maximumFileBytes,
      observed: stat.size <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(stat.size) : undefined
    })
  }
}

function assertSameIdentity(before, after, message) {
  if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino || before.nlink !== after.nlink
    || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
    throw processingError("bounded_document_identity_changed", message)
  }
}

function assertNamedPathCurrent(absolutePath, rootPath, openedStat) {
  const current = resolveSafeDocumentPath(absolutePath, rootPath)
  if (current.path !== absolutePath) {
    throw processingError("bounded_document_identity_changed", "document named path changed while reading")
  }
  let namedStat
  try { namedStat = fs.statSync(current.path, { bigint: true }) } catch {
    throw processingError("bounded_document_unavailable", "document path is unavailable")
  }
  assertSameIdentity(openedStat, namedStat, "document named path changed while reading")
}

function resolveSafeDocumentPath(filePath, rootPath) {
  try {
    if (rootPath === undefined) {
      return pathPolicy.canonicalizePhysicalPathSync(filePath, {
        label: "document path",
        mustExist: true,
        rejectLinks: true,
        expectedType: "file"
      })
    }
    return pathPolicy.resolvePhysicalContainedPathSync({
      rootPath,
      candidatePath: filePath,
      allowAbsolute: true,
      mustExist: true,
      expectedType: "file"
    })
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : undefined
    if (code === "path_policy_symlink") {
      throw processingError("bounded_document_symlink", "document path contains a symbolic link or reparse point")
    }
    if (code === "path_policy_escape") {
      throw processingError("bounded_document_escape", "document path escapes its containment root")
    }
    if (code === "path_policy_not_directory") {
      throw processingError("bounded_document_root_unavailable", "document containment root is not a directory")
    }
    if (code === "path_policy_not_file") {
      throw processingError("bounded_document_not_regular", "document must be a regular file")
    }
    throw processingError("bounded_document_unavailable", "document path or containment root is unavailable")
  }
}

module.exports = Object.freeze({ readBoundedDocumentFile })
