import { validRange as validSemverRange, parse as parseSemver } from "semver"

import type { JsonObject, JsonValue } from "./jsonValue"
import type { Sha256Digest } from "./providerContract"
import { freezeEvidence } from "./workflowLockIntrinsics"

const ID = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const PROMPT = /^prompts\/[A-Za-z0-9._-]+\.md$/u
const SCHEMA = /^schemas\/[A-Za-z0-9._-]+\.json$/u
const DIGEST = /^sha256:[0-9a-f]{64}$/u
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u

export function record(value: JsonValue, fields: readonly string[], label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record.`)
  }
  const keys = Object.keys(value)
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    throw new TypeError(`${label} contains an unknown field.`)
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) throw new TypeError(`${label}.${field} is required.`)
  }
  return value as JsonObject
}

export function array(value: JsonValue, maximum: number, label: string): readonly JsonValue[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`)
  if (value.length > maximum) throw new TypeError(`${label} has an invalid length.`)
  return value
}

export function identifier(value: JsonValue, label: string): string {
  if (typeof value !== "string" || value.length > 128 || !ID.test(value)) {
    throw new TypeError(`${label} is invalid.`)
  }
  return value
}

export function identifierArray(value: JsonValue, maximum: number, label: string): readonly string[] {
  const values = array(value, maximum, label)
  const result: string[] = []
  for (let index = 0; index < values.length; index += 1) {
    const item = identifier(values[index], `${label}[${index}]`)
    if (index > 0 && result[index - 1] >= item) {
      throw new TypeError(`${label} must be sorted and duplicate-free.`)
    }
    result.push(item)
  }
  return freezeEvidence(result)
}

export function digest(value: JsonValue, label: string): Sha256Digest {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    throw new TypeError(`${label} is not a canonical sha256 digest.`)
  }
  return value as Sha256Digest
}

export function bytes(value: JsonValue, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${label} is outside the allowed byte range.`)
  }
  return value
}

export function packagePath(value: JsonValue, kind: "prompt" | "schema", label: string): string {
  const pattern = kind === "prompt" ? PROMPT : SCHEMA
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 240 || !pattern.test(value)) {
    throw new TypeError(`${label} is invalid.`)
  }
  return value
}

export function schemaPath(value: JsonValue, label: string): string {
  return packagePath(value, "schema", label)
}

export function enumValue<const Values extends readonly string[]>(
  value: JsonValue,
  allowed: Values,
  label: string
): Values[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new TypeError(`${label} is invalid.`)
  return value as Values[number]
}

export function semverRange(value: JsonValue, label: string): string {
  if (
    typeof value !== "string" || value.length < 1 || value.length > 256
    || CONTROL.test(value) || validSemverRange(value, { loose: false }) === null
  ) throw new TypeError(`${label} is invalid.`)
  return value
}

export function exactSemver(value: JsonValue, label: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 256 || CONTROL.test(value)) {
    throw new TypeError(`${label} is invalid.`)
  }
  const parsed = parseSemver(value, { loose: false })
  if (parsed === null) throw new TypeError(`${label} is invalid.`)
  const canonical = `${parsed.version}${parsed.build.length > 0 ? `+${parsed.build.join(".")}` : ""}`
  if (canonical !== value) throw new TypeError(`${label} is not canonical.`)
  return value
}
