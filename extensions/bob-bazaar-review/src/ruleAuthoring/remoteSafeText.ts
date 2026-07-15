import { URL } from "node:url"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "./ruleAuthoringLimits"

const MAX_RAW_DISPLAY_BYTES = DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes
const MAX_HTTP_URL_NESTING = 4
const MAX_HTTP_URL_TOKENS = 1_024
const MAX_COMBINING_MARK_LOOKBEHIND = 32
const EMOJI_SEQUENCE_MARK = /^[\ufe0e\ufe0f\u20e3]$/u
const SAFE_SYMBOL_STATUS_PAIRS: ReadonlySet<string> = new Set([
  "○/×",
  "◯/×",
  "〇/×",
  "△/○",
  "✓/✕",
  "✅/❌",
  "×/÷",
  "→/←",
  "★/☆"
])

export function sanitizeRemoteSafeText(value: unknown, maxBytes: number): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_RAW_DISPLAY_BYTES) {
    throw new Error("Remote-safe display byte limit is invalid")
  }
  const text = typeof value === "string" ? value : String(value ?? "")
  if (
    text.length > MAX_RAW_DISPLAY_BYTES ||
    Buffer.byteLength(text, "utf8") > MAX_RAW_DISPLAY_BYTES
  ) {
    return truncateUtf8("[REDACTED_OVERSIZE]", maxBytes)
  }
  const pathRedacted = redactPathsPreservingHttpUrls(
    text,
    0,
    { remainingHttpTokens: MAX_HTTP_URL_TOKENS },
    false
  )
  const secretRedacted = pathRedacted
    .replace(/\b(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED_SECRET]")
    .replace(/\b(api[_-]?key|access[_-]?token|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED_SECRET]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_SECRET]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, " ")
  return truncateUtf8(secretRedacted, maxBytes)
}

function redactPathsPreservingHttpUrls(
  value: string,
  depth: number,
  budget: { remainingHttpTokens: number },
  inUrlSuffix: boolean
): string {
  if (depth >= MAX_HTTP_URL_NESTING || budget.remainingHttpTokens <= 0) {
    return redactLocalPaths(value, !inUrlSuffix)
  }

  const httpUrlPattern = inUrlSuffix
    ? /(?<![A-Za-z0-9+.\-])https?:\/\/[^\s&;#]+/giu
    : /(?<![A-Za-z0-9+.\-])https?:\/\/\S+/giu
  let output = ""
  let cursor = 0
  for (const match of value.matchAll(httpUrlPattern)) {
    if (match.index === undefined) continue
    if (budget.remainingHttpTokens <= 0) {
      output += redactLocalPaths(value.slice(cursor), !inUrlSuffix)
      return output
    }
    output += redactLocalPaths(value.slice(cursor, match.index), !inUrlSuffix)
    budget.remainingHttpTokens -= 1
    output += redactHttpUrlToken(match[0], depth, budget)
    cursor = match.index + match[0].length
  }
  return output + redactLocalPaths(value.slice(cursor), !inUrlSuffix)
}

function redactHttpUrlToken(
  candidate: string,
  depth: number,
  budget: { remainingHttpTokens: number }
): string {
  const queryOffset = candidate.indexOf("?")
  const fragmentOffset = candidate.indexOf("#")
  const suffixOffsets = [queryOffset, fragmentOffset].filter((offset) => offset >= 0)
  const suffixOffset = suffixOffsets.length > 0 ? Math.min(...suffixOffsets) : candidate.length
  const protectedPrefix = candidate.slice(0, suffixOffset)
  if (!isValidHttpUrlPrefix(protectedPrefix)) return redactLocalPaths(candidate, false)
  if (suffixOffset === candidate.length) return candidate
  return protectedPrefix + redactPathsPreservingHttpUrls(
    candidate.slice(suffixOffset),
    depth + 1,
    budget,
    true
  )
}

function isValidHttpUrlPrefix(value: string): boolean {
  const scheme = /^https?:\/\//iu.exec(value)
  if (!scheme || value.includes("\\")) return false
  const authorityAndPath = value.slice(scheme[0].length)
  if (!authorityAndPath || /^[\\/?#]/u.test(authorityAndPath)) return false
  const authorityEnd = authorityAndPath.search(/[/?#]/u)
  const authority = authorityEnd >= 0
    ? authorityAndPath.slice(0, authorityEnd)
    : authorityAndPath
  if (!authority || authority === "." || authority === "..") return false
  try {
    const parsed = new URL(value)
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0
  } catch {
    return false
  }
}

function redactLocalPaths(value: string, allowSymbolStatusPairs: boolean): string {
  return value
    .replace(/\bfile:(?:[\\/]+|[A-Za-z]:[\\/])[^\s&#;?]*/giu, "[REDACTED_PATH]")
    .replace(
      /(^|[^\p{L}\p{N}+.\-])((?:\\\\|\/\/)[^\s&#;?]+)/gu,
      "$1[REDACTED_PATH]"
    )
    .replace(/\b[A-Za-z]:(?:[\\/]|(?=[^\s&#;?]))[^\s&#;?]*/gu, "[REDACTED_PATH]")
    .replace(
      /(^|[^\p{L}\p{N}._~+%\\/-])([\\/](?![\\/\s&#;?])[^\s&#;?]*)/gu,
      (
        match: string,
        prefix: string,
        rootPath: string,
        offset: number,
        input: string
      ) => redactRootPathCandidate(
        match,
        prefix,
        rootPath,
        offset,
        input,
        allowSymbolStatusPairs
      )
    )
}

function redactRootPathCandidate(
  match: string,
  prefix: string,
  rootPath: string,
  offset: number,
  input: string,
  allowSymbolStatusPairs: boolean
): string {
  const body = rootPath.slice(1)
  const markContinuesWord = isWordCombiningMarkContinuation(input, offset, prefix, rootPath)
  const isSymbolStatusPair = (
    allowSymbolStatusPairs &&
    rootPath.startsWith("/") &&
    SAFE_SYMBOL_STATUS_PAIRS.has(match)
  )
  if (markContinuesWord || (!/[\\/]/u.test(body) && isSymbolStatusPair)) return match
  return `${prefix}[REDACTED_PATH]`
}

function isWordCombiningMarkContinuation(
  value: string,
  offset: number,
  prefix: string,
  rootPath: string
): boolean {
  if (!rootPath.startsWith("/") || !/^\p{M}$/u.test(prefix) || EMOJI_SEQUENCE_MARK.test(prefix)) {
    return false
  }
  let cursor = offset
  for (let examined = 0; examined < MAX_COMBINING_MARK_LOOKBEHIND; examined += 1) {
    const candidate = codePointBefore(value, cursor)
    if (!candidate || EMOJI_SEQUENCE_MARK.test(candidate)) return false
    if (!/^\p{M}$/u.test(candidate)) return /^[\p{L}\p{N}]$/u.test(candidate)
    cursor -= candidate.length
  }
  return false
}

function codePointBefore(value: string, offset: number): string {
  if (offset <= 0) return ""
  const finalCodeUnit = value.charCodeAt(offset - 1)
  if (finalCodeUnit >= 0xdc00 && finalCodeUnit <= 0xdfff && offset >= 2) {
    const precedingCodeUnit = value.charCodeAt(offset - 2)
    if (precedingCodeUnit >= 0xd800 && precedingCodeUnit <= 0xdbff) {
      return value.slice(offset - 2, offset)
    }
  }
  return value.slice(offset - 1, offset)
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value
  const ellipsis = "…"
  const contentLimit = Math.max(0, maxBytes - Buffer.byteLength(ellipsis, "utf8"))
  let output = ""
  let bytes = 0
  for (const codePoint of value) {
    const codePointBytes = Buffer.byteLength(codePoint, "utf8")
    if (bytes + codePointBytes > contentLimit) break
    output += codePoint
    bytes += codePointBytes
  }
  return maxBytes >= Buffer.byteLength(ellipsis, "utf8") ? `${output}${ellipsis}` : output
}
