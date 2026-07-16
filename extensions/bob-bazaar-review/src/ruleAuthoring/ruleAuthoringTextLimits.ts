import { DEFAULT_RULE_AUTHORING_LIMITS } from "./ruleAuthoringLimits"

export const RULE_AUTHORING_TEXT_BYTE_LIMITS = Object.freeze({
  category: 256,
  title: 512,
  description: 8_192,
  appliesWhen: 1_024,
  reviewHint: 4_096,
  rejectReason: 8_192,
  markdownHeading: 512,
  managedMarkdown: DEFAULT_RULE_AUTHORING_LIMITS.maxProjectContextBytes
})

export function hasUtf8ByteLength(
  value: unknown,
  maxBytes: number,
  options: { nonEmpty?: boolean } = {}
): value is string {
  return typeof value === "string" &&
    (options.nonEmpty !== true || value.length > 0) &&
    Buffer.byteLength(value, "utf8") <= maxBytes
}
