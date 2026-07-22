import { URL as NodeUrl } from "url"
import { types as utilTypes } from "util"

const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectPrototype = Object.prototype
const reflectOwnKeys = Reflect.ownKeys
const setHas = Function.prototype.call.bind(Set.prototype.has) as (set: ReadonlySet<string>, value: unknown) => boolean
const sortArray = Function.prototype.call.bind(Array.prototype.sort) as <T>(
  values: T[],
  compare: (left: T, right: T) => number
) => T[]

export const WORKFLOW_CONTRACT_V2_DIAGNOSTIC_CODES = objectFreeze([
  "WF2_SCHEMA_VERSION_UNSUPPORTED",
  "WF2_PACKAGE_LAYOUT_INVALID",
  "WF2_UNKNOWN_OR_NOOP_FIELD",
  "WF2_LOCK_MISMATCH",
  "WF2_PROVIDER_CONTRACT_MISMATCH",
  "WF2_BOB_CAPABILITY_MISMATCH",
  "WF2_PREDICATE_INVALID",
  "WF2_PROVIDER_INPUT_INVALID",
  "WF2_PROVIDER_OUTPUT_INVALID",
  "WF2_PROVIDER_ERROR_INVALID",
  "WF2_REQUIRED_ARTIFACT_MISSING",
  "WF2_ARTIFACT_SCHEMA_INVALID"
] as const)

export type WorkflowContractV2DiagnosticCode = typeof WORKFLOW_CONTRACT_V2_DIAGNOSTIC_CODES[number]
export type WorkflowContractV2DiagnosticSeverity = "error" | "warning" | "info"

export interface WorkflowContractV2DiagnosticLocation {
  readonly path: string
  readonly pointer: string
}

export interface CreateWorkflowContractV2DiagnosticInput {
  readonly code: WorkflowContractV2DiagnosticCode
  readonly severity: WorkflowContractV2DiagnosticSeverity
  readonly message: string
  readonly location: WorkflowContractV2DiagnosticLocation
  readonly relatedLocations?: readonly WorkflowContractV2DiagnosticLocation[]
}

export interface WorkflowContractV2Diagnostic {
  readonly code: WorkflowContractV2DiagnosticCode
  readonly severity: WorkflowContractV2DiagnosticSeverity
  readonly message: string
  readonly location: WorkflowContractV2DiagnosticLocation
  readonly relatedLocations: readonly WorkflowContractV2DiagnosticLocation[]
}

const DIAGNOSTIC_CODE_SET = new Set<string>(WORKFLOW_CONTRACT_V2_DIAGNOSTIC_CODES)
const SEVERITY_ORDER: Readonly<Record<WorkflowContractV2DiagnosticSeverity, number>> = objectFreeze({
  error: 0,
  warning: 1,
  info: 2
})
const MAX_MESSAGE_CODE_POINTS = 512
const REDACTED_PATH = "<redacted-path>"
const hasOwn = Function.prototype.call.bind(Object.prototype.hasOwnProperty) as (
  value: object,
  key: PropertyKey
) => boolean
const isProxy = utilTypes.isProxy
const UrlConstructor = NodeUrl
const tokenCharacterPattern = /[\p{L}\p{N}_]/u
const controlCharacterPattern = /[\u0000-\u001f\u007f-\u009f]/u
const displayControlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g
const CREATE_INPUT_REQUIRED_FIELDS = objectFreeze(["code", "severity", "message", "location"] as const)
const CREATE_INPUT_OPTIONAL_FIELDS = objectFreeze(["relatedLocations"] as const)
const LOCATION_REQUIRED_FIELDS = objectFreeze(["path", "pointer"] as const)
const DIAGNOSTIC_REQUIRED_FIELDS = objectFreeze([
  "code",
  "severity",
  "message",
  "location",
  "relatedLocations"
] as const)
const NO_OPTIONAL_FIELDS = objectFreeze([] as const)

export function createWorkflowContractV2Diagnostic(
  input: CreateWorkflowContractV2DiagnosticInput
): WorkflowContractV2Diagnostic {
  const snapshot = snapshotExactRecord(
    input,
    "Workflow contract diagnostic input",
    CREATE_INPUT_REQUIRED_FIELDS,
    CREATE_INPUT_OPTIONAL_FIELDS
  )
  return createDiagnosticFromSnapshot(snapshot)
}

function createDiagnosticFromSnapshot(snapshot: Readonly<Record<string, unknown>>): WorkflowContractV2Diagnostic {
  const code = snapshot.code
  const severity = snapshot.severity
  const message = snapshot.message
  const locationInput = snapshot.location
  const relatedLocationsInput = hasOwn(snapshot, "relatedLocations") ? snapshot.relatedLocations : []
  if (!setHas(DIAGNOSTIC_CODE_SET, code)) {
    throw new TypeError("Workflow contract diagnostic code is not registered.")
  }
  if (severity !== "error" && severity !== "warning" && severity !== "info") {
    throw new TypeError("Workflow contract diagnostic severity is invalid.")
  }
  if (typeof message !== "string") {
    throw new TypeError("Workflow contract diagnostic message must be a string.")
  }

  const location = cloneLocation(locationInput, "Workflow contract diagnostic location")
  const relatedLocations = cloneRelatedLocations(relatedLocationsInput ?? [])
  const diagnostic: WorkflowContractV2Diagnostic = {
    code: code as WorkflowContractV2DiagnosticCode,
    severity,
    message: sanitizeMessage(message),
    location,
    relatedLocations
  }
  return objectFreeze(diagnostic)
}

export function sortWorkflowContractV2Diagnostics(
  diagnostics: readonly WorkflowContractV2Diagnostic[]
): readonly WorkflowContractV2Diagnostic[] {
  const diagnosticInputs = snapshotDenseOrdinaryArray(diagnostics, "Workflow contract diagnostics")
  const detached: WorkflowContractV2Diagnostic[] = []
  for (let index = 0; index < diagnosticInputs.length; index += 1) {
    const snapshot = snapshotExactRecord(
      diagnosticInputs[index],
      `Workflow contract diagnostic at index ${index}`,
      DIAGNOSTIC_REQUIRED_FIELDS,
      NO_OPTIONAL_FIELDS
    )
    detached[index] = createDiagnosticFromSnapshot(snapshot)
  }
  sortArray(detached, compareDiagnostics)
  return objectFreeze(detached)
}

function cloneRelatedLocations(
  relatedLocations: unknown
): readonly WorkflowContractV2DiagnosticLocation[] {
  const locationInputs = snapshotDenseOrdinaryArray(
    relatedLocations,
    "Workflow contract diagnostic related locations"
  )
  const detached: WorkflowContractV2DiagnosticLocation[] = []
  for (let index = 0; index < locationInputs.length; index += 1) {
    detached[index] = cloneLocation(
      locationInputs[index],
      `Workflow contract diagnostic related location at index ${index}`
    )
  }
  sortArray(detached, compareLocations)
  return objectFreeze(detached)
}

function cloneLocation(input: unknown, label: string): WorkflowContractV2DiagnosticLocation {
  const snapshot = snapshotExactRecord(input, label, LOCATION_REQUIRED_FIELDS, NO_OPTIONAL_FIELDS)
  const path = snapshot.path
  const pointer = snapshot.pointer
  assertPackageRelativePath(path, label)
  assertJsonPointer(pointer, label)
  return objectFreeze({ path, pointer })
}

function assertPackageRelativePath(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") throw new TypeError(`${label} path must be a string.`)
  assertValidUnicode(value, `${label} path`)
  if (
    value.length === 0
    || value.startsWith("/")
    || value.endsWith("/")
    || value.includes("\\")
    || value.includes(":")
    || controlCharacterPattern.test(value)
  ) {
    throw new TypeError(`${label} path must be a portable package-relative POSIX path.`)
  }
  const segments = value.split("/")
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new TypeError(`${label} path must not contain empty or dot segments.`)
  }
}

function assertJsonPointer(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") throw new TypeError(`${label} pointer must be a string.`)
  assertValidUnicode(value, `${label} pointer`)
  if (
    controlCharacterPattern.test(value)
    || (value.length > 0 && !value.startsWith("/"))
    || /~(?:[^01]|$)/u.test(value)
  ) {
    throw new TypeError(`${label} pointer must be an RFC 6901 JSON Pointer without control characters.`)
  }
}

function sanitizeMessage(input: string): string {
  assertValidUnicode(input, "Workflow contract diagnostic message")
  const normalized = input.replace(/\r\n?/g, "\n")
  const redacted = redactAbsolutePaths(normalized)
  const displaySafe = redacted.replace(displayControlPattern, "�")
  const codePoints = Array.from(displaySafe)
  if (codePoints.length <= MAX_MESSAGE_CODE_POINTS) return displaySafe
  return `${codePoints.slice(0, MAX_MESSAGE_CODE_POINTS - 1).join("")}…`
}

function redactAbsolutePaths(input: string): string {
  let output = ""
  let cursor = 0
  while (cursor < input.length) {
    if (isTokenBoundary(input, cursor)) {
      const scheme = readScheme(input, cursor)
      if (scheme) {
        const remoteEnd = validRemoteUrlEnd(input, cursor, scheme)
        if (remoteEnd !== undefined) {
          output += input.slice(cursor, remoteEnd)
          cursor = remoteEnd
          continue
        }
        if (isRedactableSchemePath(input, scheme)) {
          const end = redactionEnd(input, cursor)
          output += REDACTED_PATH
          cursor = end
          continue
        }
      }
      if (isAbsolutePathStart(input, cursor)) {
        const end = redactionEnd(input, cursor)
        output += REDACTED_PATH
        cursor = end
        continue
      }
    }
    output += input[cursor]
    cursor += 1
  }
  return output
}

interface SchemeMatch {
  readonly colon: number
  readonly lowerName: string
}

function readScheme(input: string, start: number): SchemeMatch | undefined {
  const first = input.charCodeAt(start)
  if (!isAsciiLetter(first)) return undefined
  let cursor = start + 1
  while (cursor < input.length) {
    const code = input.charCodeAt(cursor)
    if (code === 0x3a) {
      return { colon: cursor, lowerName: input.slice(start, cursor).toLowerCase() }
    }
    if (!isAsciiLetter(code) && !isAsciiDigit(code) && code !== 0x2b && code !== 0x2d && code !== 0x2e) {
      return undefined
    }
    cursor += 1
  }
  return undefined
}

function validRemoteUrlEnd(input: string, start: number, scheme: SchemeMatch): number | undefined {
  if (scheme.lowerName !== "http" && scheme.lowerName !== "https") return undefined
  if (input.slice(scheme.colon + 1, scheme.colon + 3) !== "//") return undefined
  const urlEnd = remoteUrlEnd(input, start)
  const raw = input.slice(start, urlEnd)
  if (
    /[\u0000-\u0020\u007f-\u009f]/u.test(raw)
    || raw.includes("\\")
    || raw.includes('"')
    || raw.includes("'")
    || raw.includes("`")
    || containsBoundaryDrivePath(raw)
  ) return undefined
  const authorityStart = scheme.colon - start + 3
  let authorityEnd = raw.length
  for (const separator of ["/", "?", "#"]) {
    const found = raw.indexOf(separator, authorityStart)
    if (found >= 0 && found < authorityEnd) authorityEnd = found
  }
  const authority = raw.slice(authorityStart, authorityEnd)
  if (authority.length === 0 || authority.includes("\\")) return undefined
  try {
    const parsed = new UrlConstructor(raw)
    if (
      parsed.protocol.toLowerCase() !== `${scheme.lowerName}:`
      || !isRealHostname(parsed.hostname)
    ) return undefined
    return urlEnd
  } catch {
    return undefined
  }
}

function remoteUrlEnd(input: string, start: number): number {
  const quote = openingQuote(input, start)
  if (quote) return closingQuoteIndex(input, start, quote) ?? lineEnd(input, start)
  let cursor = start
  while (cursor < input.length) {
    const code = input.charCodeAt(cursor)
    if (code === 0x0a || code === 0x0d || isAsciiWhitespace(code)) break
    cursor += 1
  }
  return cursor
}

function containsBoundaryDrivePath(input: string): boolean {
  for (let index = 0; index + 2 < input.length; index += 1) {
    if (
      isAsciiLetter(input.charCodeAt(index))
      && input.charCodeAt(index + 1) === 0x3a
      && input.charCodeAt(index + 2) === 0x2f
      && isTokenBoundary(input, index)
    ) return true
  }
  return false
}

function isRedactableSchemePath(input: string, scheme: SchemeMatch): boolean {
  const afterColon = scheme.colon + 1
  if (afterColon >= input.length) return false
  const next = input.charCodeAt(afterColon)
  return next !== 0x0a
    && next !== 0x0d
    && !isAsciiWhitespace(next)
    && next !== 0x22
    && next !== 0x27
    && next !== 0x60
}

function isRealHostname(input: string): boolean {
  if (input.startsWith("[") && input.endsWith("]")) return input.length > 2
  const hostname = input.endsWith(".") ? input.slice(0, -1) : input
  if (hostname.length === 0 || hostname.length > 253) return false
  const labels = hostname.split(".")
  for (const label of labels) {
    if (
      label.length === 0
      || label.length > 63
      || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/iu.test(label)
    ) return false
  }
  return true
}

function isAbsolutePathStart(input: string, start: number): boolean {
  const code = input.charCodeAt(start)
  if (isAsciiLetter(code) && input.charCodeAt(start + 1) === 0x3a) {
    const separator = input.charCodeAt(start + 2)
    return separator === 0x2f || separator === 0x5c
  }
  return code === 0x2f || code === 0x5c
}

function redactionEnd(input: string, start: number): number {
  const quote = openingQuote(input, start)
  if (quote) return closingQuoteIndex(input, start, quote) ?? lineEnd(input, start)
  return lineEnd(input, start)
}

function openingQuote(input: string, start: number): string | undefined {
  if (start === 0) return undefined
  const previous = input[start - 1]
  return previous === "'" || previous === '"' || previous === "`" ? previous : undefined
}

function closingQuoteIndex(input: string, start: number, quote: string): number | undefined {
  for (let cursor = start; cursor < input.length && input[cursor] !== "\n"; cursor += 1) {
    if (input[cursor] !== quote) continue
    let backslashes = 0
    for (let index = cursor - 1; index >= start && input[index] === "\\"; index -= 1) backslashes += 1
    if (backslashes % 2 === 0) return cursor
  }
  return undefined
}

function lineEnd(input: string, start: number): number {
  const newline = input.indexOf("\n", start)
  return newline < 0 ? input.length : newline
}

function isTokenBoundary(input: string, index: number): boolean {
  if (index === 0) return true
  const previous = previousCodePoint(input, index)
  return !tokenCharacterPattern.test(previous)
}

function previousCodePoint(input: string, index: number): string {
  const last = input.charCodeAt(index - 1)
  if (last >= 0xdc00 && last <= 0xdfff && index >= 2) {
    const first = input.charCodeAt(index - 2)
    if (first >= 0xd800 && first <= 0xdbff) return input.slice(index - 2, index)
  }
  return input[index - 1]
}

function assertValidUnicode(value: string, label: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        throw new TypeError(`${label} contains malformed Unicode.`)
      }
      index += 1
      continue
    }
    if (code >= 0xdc00 && code <= 0xdfff) throw new TypeError(`${label} contains malformed Unicode.`)
  }
}

function snapshotDenseOrdinaryArray(value: unknown, label: string): readonly unknown[] {
  if (
    typeof value !== "object"
    || value === null
    || isProxy(value)
    || !arrayIsArray(value)
    || objectGetPrototypeOf(value) !== arrayPrototype
  ) throw new TypeError(`${label} must be an ordinary array.`)

  const descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  const ownKeys = reflectOwnKeys(descriptors)
  const lengthDescriptor = descriptors.length
  if (
    !lengthDescriptor
    || !hasOwn(lengthDescriptor, "value")
    || lengthDescriptor.enumerable
    || typeof lengthDescriptor.value !== "number"
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) throw new TypeError(`${label} has an invalid length descriptor.`)
  const length = lengthDescriptor.value
  if (ownKeys.length !== length + 1) {
    throw new TypeError(`${label} must be dense and must not have extra fields.`)
  }

  const snapshot: unknown[] = []
  for (let keyIndex = 0; keyIndex < ownKeys.length; keyIndex += 1) {
    const key = ownKeys[keyIndex]
    if (key === "length") continue
    if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key)) {
      throw new TypeError(`${label} must not have symbol, hidden, or extra fields.`)
    }
    const index = Number(key)
    if (!Number.isSafeInteger(index) || index < 0 || index >= length || `${index}` !== key) {
      throw new TypeError(`${label} must not have non-index fields.`)
    }
    const descriptor = descriptors[key]
    if (!descriptor.enumerable || !hasOwn(descriptor, "value")) {
      throw new TypeError(`${label} indexes must be enumerable data properties.`)
    }
    snapshot[index] = descriptor.value
  }
  for (let index = 0; index < length; index += 1) {
    if (!hasOwn(snapshot, index)) throw new TypeError(`${label} must not be sparse.`)
  }
  return snapshot
}

function snapshotExactRecord(
  value: unknown,
  label: string,
  requiredFields: readonly string[],
  optionalFields: readonly string[]
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object"
    || value === null
    || isProxy(value)
    || arrayIsArray(value)
  ) throw new TypeError(`${label} must be an exact ordinary record.`)
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) {
    throw new TypeError(`${label} must be an exact ordinary or null-prototype record.`)
  }

  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  const snapshot = objectCreate(null) as Record<string, unknown>
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const key = keys[keyIndex]
    if (
      typeof key !== "string"
      || (!includesField(requiredFields, key) && !includesField(optionalFields, key))
    ) throw new TypeError(`${label} must not have symbol, hidden, or extra fields.`)
    const descriptor = descriptors[key]
    if (!descriptor.enumerable || !hasOwn(descriptor, "value")) {
      throw new TypeError(`${label} fields must be enumerable data properties.`)
    }
    snapshot[key] = descriptor.value
  }
  for (let index = 0; index < requiredFields.length; index += 1) {
    const field = requiredFields[index]
    if (!hasOwn(snapshot, field)) throw new TypeError(`${label} is missing required field '${field}'.`)
  }
  return snapshot
}

function includesField(fields: readonly string[], expected: string): boolean {
  for (let index = 0; index < fields.length; index += 1) {
    if (fields[index] === expected) return true
  }
  return false
}

function compareDiagnostics(left: WorkflowContractV2Diagnostic, right: WorkflowContractV2Diagnostic): number {
  return SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    || compareLocations(left.location, right.location)
    || compareCodeUnits(left.code, right.code)
    || compareCodeUnits(left.message, right.message)
    || compareLocationArrays(left.relatedLocations, right.relatedLocations)
}

function compareLocationArrays(
  left: readonly WorkflowContractV2DiagnosticLocation[],
  right: readonly WorkflowContractV2DiagnosticLocation[]
): number {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const compared = compareLocations(left[index], right[index])
    if (compared !== 0) return compared
  }
  return left.length - right.length
}

function compareLocations(
  left: WorkflowContractV2DiagnosticLocation,
  right: WorkflowContractV2DiagnosticLocation
): number {
  return compareCodeUnits(left.path, right.path) || compareCodeUnits(left.pointer, right.pointer)
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isAsciiLetter(code: number): boolean {
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)
}

function isAsciiDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39
}

function isAsciiWhitespace(code: number): boolean {
  return code === 0x09 || code === 0x0b || code === 0x0c || code === 0x20
}
