export const DEFAULT_MAX_DIFF_BYTES = 1024 * 1024
export const MIN_MAX_DIFF_BYTES = 32 * 1024
export const MAX_MAX_DIFF_BYTES = 5 * 1024 * 1024

export const DEFAULT_MAX_ADDED_FILE_CONTENT_BYTES = 256 * 1024
export const MIN_MAX_ADDED_FILE_CONTENT_BYTES = 0
export const MAX_MAX_ADDED_FILE_CONTENT_BYTES = 2 * 1024 * 1024

export const DEFAULT_EXEC_BUFFER_BYTES = 10 * 1024 * 1024
export const MIN_EXEC_BUFFER_BYTES = 2 * 1024 * 1024
export const MAX_EXEC_BUFFER_BYTES = 20 * 1024 * 1024

export function clampMaxDiffBytes(value: unknown): number {
  return clampByteLimit(value, DEFAULT_MAX_DIFF_BYTES, MIN_MAX_DIFF_BYTES, MAX_MAX_DIFF_BYTES)
}

export function clampMaxAddedFileContentBytes(value: unknown): number {
  return clampByteLimit(value, DEFAULT_MAX_ADDED_FILE_CONTENT_BYTES, MIN_MAX_ADDED_FILE_CONTENT_BYTES, MAX_MAX_ADDED_FILE_CONTENT_BYTES)
}

export function clampExecBufferBytes(value: unknown): number {
  return clampByteLimit(value, DEFAULT_EXEC_BUFFER_BYTES, MIN_EXEC_BUFFER_BYTES, MAX_EXEC_BUFFER_BYTES)
}

export function maxBufferForDiffBytes(maxDiffBytes: unknown): number {
  return clampByteLimit(clampMaxDiffBytes(maxDiffBytes) * 2, DEFAULT_EXEC_BUFFER_BYTES, MIN_EXEC_BUFFER_BYTES, MAX_EXEC_BUFFER_BYTES)
}

function clampByteLimit(value: unknown, fallback: number, min: number, max: number): number {
  const numberValue = typeof value === "number" && Number.isFinite(value) ? value : fallback
  return Math.max(min, Math.min(max, Math.floor(numberValue)))
}

export function truncateUtf8(value: string, maxBytes: number, label = "output"): string {
  const safeLimit = typeof maxBytes === "number" && Number.isFinite(maxBytes) ? Math.max(0, Math.floor(maxBytes)) : 0
  const originalBytes = Buffer.byteLength(value, "utf8")
  if (originalBytes <= safeLimit) return value
  if (safeLimit <= 0) return ""

  const notice = `\n\n[TRUNCATED: original ${label} output was ${originalBytes} bytes, limit is ${safeLimit} bytes]`
  const boundedNotice = truncateUtf8Prefix(notice, safeLimit)
  const prefixBudget = safeLimit - Buffer.byteLength(boundedNotice, "utf8")
  return `${truncateUtf8Prefix(value, prefixBudget)}${boundedNotice}`
}

function truncateUtf8Prefix(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return ""
  const result: string[] = []
  let usedBytes = 0
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8")
    if (usedBytes + characterBytes > maxBytes) break
    result.push(character)
    usedBytes += characterBytes
  }
  return result.join("")
}
