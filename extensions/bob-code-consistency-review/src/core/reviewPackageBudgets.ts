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
  readonly mandatoryKeys: readonly string[]
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
  const maximumBytes = Math.min(
    configuredMaximum,
    options.ledger.profile.limits.bob_input_bytes
  )
  const mandatoryKeys = new Set(options.mandatoryKeys)
  const tokens = tokenizeTemplate(options.template)
  const mandatorySuffixBytes = minimumSuffixBytes(tokens, options.values, mandatoryKeys)
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
      retainedBytes += Buffer.byteLength(token.value, "utf8")
      continue
    }

    const value = options.values[token.key] ?? ""
    if (mandatoryKeys.has(token.key)) {
      parts.push(value)
      retainedBytes += Buffer.byteLength(value, "utf8")
      continue
    }

    const availableBytes = Math.max(
      0,
      maximumBytes - retainedBytes - mandatorySuffixBytes[index + 1]
    )
    const valueBytes = Buffer.byteLength(value, "utf8")
    if (valueBytes <= availableBytes) {
      parts.push(value)
      retainedBytes += valueBytes
      continue
    }

    truncated ||= value.length > 0
    const bounded = truncateOptionalMarkdown(value, availableBytes)
    parts.push(bounded)
    retainedBytes += Buffer.byteLength(bounded, "utf8")
  }

  const text = parts.join("")
  const originalBytes = renderTemplate(tokens, options.values).byteLength
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
  return ledger.reserve(
    "managed_artifact_bytes",
    checkedByteCount(bytes, "managed artifact bytes")
  )
}

function tokenizeTemplate(template: string): readonly TemplateToken[] {
  const tokens: TemplateToken[] = []
  const expression = /\{\{([^}]+)\}\}/g
  let offset = 0
  for (let match = expression.exec(template); match !== null; match = expression.exec(template)) {
    if (match.index > offset) {
      tokens.push(Object.freeze({ kind: "literal", value: template.slice(offset, match.index) }))
    }
    tokens.push(Object.freeze({ kind: "placeholder", key: String(match[1]).trim() }))
    offset = match.index + match[0].length
  }
  if (offset < template.length) {
    tokens.push(Object.freeze({ kind: "literal", value: template.slice(offset) }))
  }
  return Object.freeze(tokens)
}

function minimumSuffixBytes(
  tokens: readonly TemplateToken[],
  values: Readonly<Record<string, string>>,
  mandatoryKeys: ReadonlySet<string>
): readonly number[] {
  const suffix = new Array<number>(tokens.length + 1).fill(0)
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]
    const required = token.kind === "literal"
      ? Buffer.byteLength(token.value, "utf8")
      : mandatoryKeys.has(token.key)
        ? Buffer.byteLength(values[token.key] ?? "", "utf8")
        : 0
    suffix[index] = suffix[index + 1] + required
    if (!Number.isSafeInteger(suffix[index])) {
      throw new Error("Bob input mandatory byte count exceeds safe integer range")
    }
  }
  return Object.freeze(suffix)
}

function renderTemplate(
  tokens: readonly TemplateToken[],
  values: Readonly<Record<string, string>>
): { readonly text: string; readonly byteLength: number } {
  const text = tokens.map((token) => token.kind === "literal"
    ? token.value
    : values[token.key] ?? "").join("")
  return Object.freeze({ text, byteLength: Buffer.byteLength(text, "utf8") })
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
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
  return value
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
