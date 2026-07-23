import type {
  SharedProcessingBudgetLedger,
  SharedProcessingBudgetReservation
} from "../sharedProcessingBudgetRuntime"

const BOB_INPUT_TRUNCATION_SUFFIX = "\n\n[truncated: bob_input_bytes]\n"

interface LiteralToken {
  readonly kind: "literal"
  readonly value: string
}

interface PlaceholderToken {
  readonly kind: "placeholder"
  readonly key: string
}

type TemplateToken = LiteralToken | PlaceholderToken

export interface ReserveMandatoryFirstBobInputOptions {
  readonly ledger: SharedProcessingBudgetLedger
  readonly maximumBytes: number
  readonly template: string
  readonly values: Readonly<Record<string, string>>
  /** Only these bulk Markdown placeholders may be truncated. Every other
   * placeholder is mandatory by default, including placeholders added later. */
  readonly truncatableKeys: readonly string[]
}

export interface ReservedBobInput {
  readonly text: string
  readonly originalBytes: number
  readonly retainedBytes: number
  readonly mandatoryBytes: number
  readonly truncated: boolean
  readonly reservation: SharedProcessingBudgetReservation
}

export function reserveMandatoryFirstBobInput(
  options: ReserveMandatoryFirstBobInputOptions
): ReservedBobInput {
  const configuredMaximum = checkedByteCount(options.maximumBytes, "maximumBytes")
  const maximumBytes = Math.min(configuredMaximum, options.ledger.profile.limits.bob_input_bytes)
  const tokens = tokenizeTemplate(options.template)
  const truncatableKeys = checkedTruncatableKeys(options.truncatableKeys, tokens)
  const mandatorySuffixBytes = minimumSuffixBytes(tokens, options.values, truncatableKeys)
  const mandatoryBytes = mandatorySuffixBytes[0]
  if (mandatoryBytes > maximumBytes) {
    throw processingBudgetExceeded("bob_input_bytes", maximumBytes, mandatoryBytes)
  }

  const parts: string[] = []
  let retainedBytes = 0
  let truncated = false
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.kind === "literal") {
      parts.push(token.value)
      retainedBytes = addSafe(retainedBytes, Buffer.byteLength(token.value, "utf8"), "Bob input retained bytes")
      continue
    }

    const value = options.values[token.key] ?? ""
    if (!truncatableKeys.has(token.key)) {
      parts.push(value)
      retainedBytes = addSafe(retainedBytes, Buffer.byteLength(value, "utf8"), "Bob input retained bytes")
      continue
    }

    const availableBytes = Math.max(0, maximumBytes - retainedBytes - mandatorySuffixBytes[index + 1])
    const valueBytes = Buffer.byteLength(value, "utf8")
    if (valueBytes <= availableBytes) {
      parts.push(value)
      retainedBytes = addSafe(retainedBytes, valueBytes, "Bob input retained bytes")
      continue
    }

    truncated ||= value.length > 0
    const bounded = truncateOptionalMarkdown(value, availableBytes)
    parts.push(bounded)
    retainedBytes = addSafe(retainedBytes, Buffer.byteLength(bounded, "utf8"), "Bob input retained bytes")
  }

  const text = parts.join("")
  // Count the theoretical full rendering without constructing that unbounded
  // combined string. The actual string above is guaranteed to stay within cap.
  const originalBytes = renderedTemplateByteLength(tokens, options.values)
  const actualBytes = Buffer.byteLength(text, "utf8")
  if (actualBytes !== retainedBytes || actualBytes > maximumBytes) {
    throw new Error("Bob input budget accounting invariant failed")
  }
  const reservation = options.ledger.reserve("bob_input_bytes", actualBytes)
  return Object.freeze({
    text,
    originalBytes,
    retainedBytes: actualBytes,
    mandatoryBytes,
    truncated: truncated || originalBytes > actualBytes,
    reservation
  })
}

export function reserveManagedArtifactBytes(
  ledger: SharedProcessingBudgetLedger,
  bytes: number
): SharedProcessingBudgetReservation {
  return ledger.reserve("managed_artifact_bytes", checkedByteCount(bytes, "managed artifact bytes"))
}

function tokenizeTemplate(template: string): readonly TemplateToken[] {
  const tokens: TemplateToken[] = []
  const expression = /\{\{([^}]+)\}\}/g
  let offset = 0
  for (let match = expression.exec(template); match !== null; match = expression.exec(template)) {
    if (match.index > offset) tokens.push(Object.freeze({ kind: "literal", value: template.slice(offset, match.index) }))
    const key = String(match[1]).trim()
    if (!key) throw new Error("Bob input template contains an empty placeholder")
    tokens.push(Object.freeze({ kind: "placeholder", key }))
    offset = match.index + match[0].length
  }
  if (offset < template.length) tokens.push(Object.freeze({ kind: "literal", value: template.slice(offset) }))
  return Object.freeze(tokens)
}

function checkedTruncatableKeys(
  values: readonly string[],
  tokens: readonly TemplateToken[]
): ReadonlySet<string> {
  const placeholders = new Set(tokens.flatMap((token) => token.kind === "placeholder" ? [token.key] : []))
  const output = new Set<string>()
  for (const value of values) {
    const key = value.trim()
    if (!key) throw new Error("Bob input truncatable key must not be empty")
    if (!placeholders.has(key)) throw new Error(`Bob input truncatable key is absent from the template: ${key}`)
    if (output.has(key)) throw new Error(`duplicate Bob input truncatable key: ${key}`)
    output.add(key)
  }
  return output
}

function minimumSuffixBytes(
  tokens: readonly TemplateToken[],
  values: Readonly<Record<string, string>>,
  truncatableKeys: ReadonlySet<string>
): readonly number[] {
  const suffix = new Array<number>(tokens.length + 1).fill(0)
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]
    const required = token.kind === "literal"
      ? Buffer.byteLength(token.value, "utf8")
      : truncatableKeys.has(token.key)
        ? 0
        : Buffer.byteLength(values[token.key] ?? "", "utf8")
    suffix[index] = addSafe(suffix[index + 1], required, "Bob input mandatory byte count")
  }
  return Object.freeze(suffix)
}

function renderedTemplateByteLength(
  tokens: readonly TemplateToken[],
  values: Readonly<Record<string, string>>
): number {
  let total = 0
  for (const token of tokens) {
    total = addSafe(
      total,
      Buffer.byteLength(token.kind === "literal" ? token.value : values[token.key] ?? "", "utf8"),
      "Bob input original byte count"
    )
  }
  return total
}

function truncateOptionalMarkdown(value: string, maximumBytes: number): string {
  if (maximumBytes <= 0 || value.length === 0) return ""
  const valueBytes = Buffer.byteLength(value, "utf8")
  if (valueBytes <= maximumBytes) return value
  const suffixBytes = Buffer.byteLength(BOB_INPUT_TRUNCATION_SUFFIX, "utf8")
  if (suffixBytes > maximumBytes) return ""
  const prefix = utf8Prefix(value, maximumBytes - suffixBytes)
  const lastLineFeed = prefix.lastIndexOf("\n")
  const completeLines = lastLineFeed < 0 ? "" : prefix.slice(0, lastLineFeed + 1)
  return `${completeLines}${BOB_INPUT_TRUNCATION_SUFFIX}`
}

function utf8Prefix(value: string, maximumBytes: number): string {
  if (maximumBytes <= 0) return ""
  const output: string[] = []
  let usedBytes = 0
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8")
    if (usedBytes + characterBytes > maximumBytes) break
    output.push(character)
    usedBytes += characterBytes
  }
  return output.join("")
}

function checkedByteCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`)
  return value
}

function addSafe(left: number, right: number, label: string): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || right < 0 || left > Number.MAX_SAFE_INTEGER - right) {
    throw new Error(`${label} exceeds safe integer range`)
  }
  return left + right
}

function processingBudgetExceeded(
  category: "bob_input_bytes",
  limit: number,
  observed: number
): Error & {
  readonly code: "processing_budget_exceeded"
  readonly details: Readonly<{
    targetCategory: "bob_input_bytes"
    constrainedCategory: "bob_input_bytes"
    limit: number
    observed: number
  }>
} {
  return Object.assign(
    new Error(`${category} processing budget exceeded (${observed} > ${limit})`),
    {
      code: "processing_budget_exceeded" as const,
      details: Object.freeze({
        targetCategory: category,
        constrainedCategory: category,
        limit,
        observed
      })
    }
  )
}
