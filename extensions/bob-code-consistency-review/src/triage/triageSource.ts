import { createHash } from "node:crypto"
import YAML from "yaml"
import type { TriageSourceItem, TriageSourceType, TriageSourceV1 } from "./triageTypes"

export function buildTriageSource(input: {
  bobOutput: unknown
  bobOutputSha256: string
  generatedAt: string
}): TriageSourceV1 {
  const output = objectRecord(input.bobOutput, "Bob output")
  const summary = objectRecord(output.review_summary, "Bob output review_summary")
  const reviewId = requiredString(summary.review_id, "Bob output review_summary.review_id")
  const packageId = optionalString(summary.package_id, "Bob output review_summary.package_id")
  const findings = arrayValue(output.findings, "Bob output findings")
  const questions = arrayValue(output.questions, "Bob output questions")
  const seen = new Set<string>()
  const items = [
    ...findings.map((item) => sourceItem(item, "finding", seen)),
    ...questions.map((item) => sourceItem(item, "question", seen))
  ]
  return {
    schema_version: "triage-source/v1",
    review_id: reviewId,
    ...(packageId ? { package_id: packageId } : {}),
    bob_output_sha256: requiredString(input.bobOutputSha256, "bobOutputSha256"),
    generated_at: requiredString(input.generatedAt, "generatedAt"),
    items
  }
}

export function serializeTriageSource(source: TriageSourceV1): string {
  return YAML.stringify(source)
}

export function hashTriageSourceText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

export function parseTriageSource(text: string): TriageSourceV1 {
  const parsed = objectRecord(YAML.parse(text), "triage source")
  if (parsed.schema_version !== "triage-source/v1") {
    throw new Error(`Unsupported triage source schema: ${String(parsed.schema_version ?? "missing")}`)
  }
  const items = arrayValue(parsed.items, "triage source items")
  const seen = new Set<string>()
  const packageId = optionalString(parsed.package_id, "triage source package_id")
  return {
    schema_version: "triage-source/v1",
    review_id: requiredString(parsed.review_id, "triage source review_id"),
    ...(packageId ? { package_id: packageId } : {}),
    bob_output_sha256: requiredString(parsed.bob_output_sha256, "triage source bob_output_sha256"),
    generated_at: requiredString(parsed.generated_at, "triage source generated_at"),
    items: items.map((item) => parseSourceItem(item, seen))
  }
}

function sourceItem(value: unknown, sourceType: TriageSourceType, seen: Set<string>): TriageSourceItem {
  const record = objectRecord(value, `${sourceType} item`)
  const sourceId = requiredString(record.id, `${sourceType} item id`)
  assertUniqueSourceId(sourceId, seen)
  const copy = cloneRecord(record)
  delete copy.id
  return {
    ...copy,
    source_id: sourceId,
    source_type: sourceType
  }
}

function parseSourceItem(value: unknown, seen: Set<string>): TriageSourceItem {
  const record = objectRecord(value, "triage source item")
  const sourceId = requiredString(record.source_id, "triage source item source_id")
  const sourceType = record.source_type
  if (sourceType !== "finding" && sourceType !== "question") {
    throw new Error(`Invalid triage source type for ${sourceId}: ${String(sourceType ?? "missing")}`)
  }
  assertUniqueSourceId(sourceId, seen)
  return {
    ...cloneRecord(record),
    source_id: sourceId,
    source_type: sourceType
  }
}

function assertUniqueSourceId(sourceId: string, seen: Set<string>): void {
  if (seen.has(sourceId)) throw new Error(`Duplicate triage source_id: ${sourceId}`)
  seen.add(sourceId)
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value.trim()
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value !== "string") throw new Error(`${label} must be a string`)
  return value.trim() || undefined
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return cloneValue(value) as Record<string, unknown>
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cloneValue(item)]))
  }
  return value
}
