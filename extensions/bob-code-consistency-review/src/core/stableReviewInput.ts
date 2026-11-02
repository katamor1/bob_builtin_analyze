import { constants, type BigIntStats } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import {
  assertDocumentNotCancelled,
  assertProcessingOperation,
  BoundedDocumentError, remainingDeadlineMilliseconds, type SharedAbsoluteDeadline,
  type ProcessingOperation,
  type ProcessingBudgetReservation
} from "../sharedProcessingBudgetRuntime"
import { decodeTextBuffer } from "./textEncoding"

export interface StableReviewTextInput {
  readonly filePath: string
  readonly maximumBytes: number
  readonly textEncoding: string
  readonly signal?: AbortSignal
  readonly deadline?: SharedAbsoluteDeadline
}

export function readStableReviewInputText(input: StableReviewTextInput & { operation: ProcessingOperation }): Promise<string> {
  return readStableText(input, "review-input", input.operation)
}

export function readStableDiffFixtureText(input: StableReviewTextInput & { operation?: ProcessingOperation }): Promise<string> {
  return readStableText(input, "diff-fixture", input.operation)
}

const identityFields = ["dev", "ino", "size", "mtimeNs", "ctimeNs", "mode"] as const
function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return identityFields.every(field => left[field] === right[field])
}

async function readStableText(input: StableReviewTextInput, kind: "review-input" | "diff-fixture", operation?: ProcessingOperation): Promise<string> {
  if (operation !== undefined) assertProcessingOperation(operation)
  if (!input || typeof input.filePath !== "string" || !path.isAbsolute(input.filePath)
    || !Number.isSafeInteger(input.maximumBytes) || input.maximumBytes < 0 || typeof input.textEncoding !== "string"
    || (input.signal && operation?.signal && input.signal !== operation.signal)) {
    throw new BoundedDocumentError("bounded_document_input_invalid", { phase: "input" })
  }
  if (input.deadline !== undefined) {
    remainingDeadlineMilliseconds(input.deadline, 0)
    if (!operation || Object.getOwnPropertyDescriptor(input.deadline, "expires_at_monotonic_ms")?.value !== operation.deadline.expires_at_monotonic_ms) throw new BoundedDocumentError("bounded_document_input_invalid")
  }
  const signal = operation?.signal ?? input.signal
  const check = (): void => assertDocumentNotCancelled(signal)
  const verifyStat = (stat: BigIntStats): number => {
    if (!stat.isFile() || stat.size < 0n) throw new BoundedDocumentError("bounded_document_source_invalid", { phase: "open" })
    if (stat.size > BigInt(input.maximumBytes)) {
      const label = kind === "review-input" ? "review-input.yaml exceeded maxDocumentBytes" : "diff fixture exceeded maxBytes"
      throw new Error(`${label} (${stat.size} > ${input.maximumBytes})`)
    }
    if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new BoundedDocumentError("bounded_document_source_invalid", { phase: "open" })
    return Number(stat.size)
  }
  check()
  let handle: fs.FileHandle | undefined
  let reservation: ProcessingBudgetReservation | undefined
  let bytes: Buffer | undefined
  let failed = false, failure: unknown
  try {
    const namedBefore = await fs.lstat(input.filePath, { bigint: true })
    check()
    verifyStat(namedBefore)
    handle = await fs.open(input.filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
    check()
    const before = await handle.stat({ bigint: true })
    check()
    const size = verifyStat(before)
    if (!sameIdentity(namedBefore, before)) throw new BoundedDocumentError("bounded_document_source_changed", { phase: "verify" })
    reservation = kind === "review-input" ? operation?.reserve("total_operation_input_bytes", size) : undefined
    bytes = Buffer.alloc(size)
    let offset = 0
    while (offset < size) {
      check()
      const result = await handle.read(bytes, offset, size - offset, offset)
      check()
      if (!Number.isSafeInteger(result.bytesRead) || result.bytesRead <= 0 || result.bytesRead > size - offset) {
        throw new BoundedDocumentError("bounded_document_read_failed", { phase: "read" })
      }
      offset += result.bytesRead
    }
    const after = await handle.stat({ bigint: true })
    check()
    const namedAfter = await fs.lstat(input.filePath, { bigint: true })
    check()
    if (!after.isFile() || !namedAfter.isFile() || !sameIdentity(before, after) || !sameIdentity(before, namedAfter)) {
      throw new BoundedDocumentError("bounded_document_source_changed", { phase: "verify" })
    }
  } catch (error) { failed = true; failure = error }
  if (handle) {
    try { await handle.close() } catch (error) { if (!failed) { failed = true; failure = error } }
  }
  if (failed) {
    reservation?.release()
    check()
    throw failure
  }
  try { check(); reservation?.commit() } catch (error) { reservation?.release(); throw error }
  const text = decodeTextBuffer(bytes!, input.textEncoding)
  check()
  return text
}
