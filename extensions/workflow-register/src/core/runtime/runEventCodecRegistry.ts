import { TextDecoder, types as utilTypes } from "node:util"
import {
  CURRENT_WORKFLOW_RUN_EVENT_SCHEMA_VERSION,
  decodeWorkflowRunEventLineV1,
  type WorkflowRunEventV1
} from "./runEventLog"
import {
  RunEventV2CodecError,
  WORKFLOW_RUN_EVENT_V2_SCHEMA_VERSION,
  decodeWorkflowRunEventV2Line,
  encodeWorkflowRunEventV2,
  type RunEventFailureCategory,
  type WorkflowRunEventV2,
  type WorkflowRunEventV2Draft
} from "./runEventV2"
import {
  CANONICAL_JSON_V1_VERSION,
  canonicalizeJsonV1,
  hashCanonicalJsonV1
} from "./canonicalJsonV1"
import { upgradeWorkflowRunStateV1 } from "./runStateV2"

export type { RunEventFailureCategory, WorkflowRunEventV2Draft } from "./runEventV2"

export type VerifiedRunEvent =
  | {
    version: "v1"
    exactLine: Buffer
    event: WorkflowRunEventV1
  }
  | {
    version: "v2"
    exactLine: Buffer
    event: WorkflowRunEventV2
  }

export interface RunEventDecodeContext {
  expectedRunId?: string
  expectedSequence: number
  previous?: VerifiedRunEvent
  lineNumber?: number
}

export type RunEventVersionInspection =
  | { schemaVersion: typeof CURRENT_WORKFLOW_RUN_EVENT_SCHEMA_VERSION }
  | {
    schemaVersion: typeof WORKFLOW_RUN_EVENT_V2_SCHEMA_VERSION
    canonicalizationVersion: typeof CANONICAL_JSON_V1_VERSION
  }

export interface VerifiedRunEventHead {
  version: "v1" | "v2"
  sequence: number
  eventHash: string
  stateHash?: string
  runId: string
}

export interface RunEventVerificationFailure {
  category: RunEventFailureCategory
  lineNumber: number
  message: string
}

export type RunEventStreamVerificationResult =
  | {
    ok: true
    events: readonly VerifiedRunEvent[]
    head?: VerifiedRunEventHead
  }
  | {
    ok: false
    failure: RunEventVerificationFailure
  }

interface InspectedLine {
  exactLine: Buffer
  record: Record<string, unknown>
  inspection: RunEventVersionInspection
}

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true })

export class RunEventCodecError extends Error {
  constructor(
    readonly category: RunEventFailureCategory,
    readonly lineNumber: number,
    message: string
  ) {
    super(message)
    this.name = "RunEventCodecError"
  }
}

export class RunEventCodecRegistry {
  static inspectVersion(bytes: Buffer): RunEventVersionInspection {
    return new RunEventCodecRegistry().inspectVersion(bytes)
  }

  static decodeLine(bytes: Buffer, context: RunEventDecodeContext): VerifiedRunEvent {
    return new RunEventCodecRegistry().decodeLine(bytes, context)
  }

  static encodeV2(input: WorkflowRunEventV2Draft): Buffer {
    return new RunEventCodecRegistry().encodeV2(input)
  }

  static verifyStream(lines: readonly Buffer[]): RunEventStreamVerificationResult {
    return new RunEventCodecRegistry().verifyStream(lines)
  }

  inspectVersion(bytes: Buffer): RunEventVersionInspection {
    return inspectLine(bytes, 1).inspection
  }

  decodeLine(bytes: Buffer, context: RunEventDecodeContext): VerifiedRunEvent {
    const decodedContext = decodeContext(context)
    const lineNumber = decodedContext.lineNumber ?? 1
    const previousRunId = decodedContext.previous?.event.runId
    if (
      decodedContext.expectedRunId !== undefined
      && previousRunId !== undefined
      && decodedContext.expectedRunId !== previousRunId
    ) {
      fail(
        "run-id",
        lineNumber,
        `Expected runId '${decodedContext.expectedRunId}' does not match the verified previous runId '${previousRunId}'.`
      )
    }
    const inspected = inspectLine(bytes, lineNumber)
    if (inspected.inspection.schemaVersion === CURRENT_WORKFLOW_RUN_EVENT_SCHEMA_VERSION) {
      if (decodedContext.previous?.version === "v2") {
        fail("ancestry", lineNumber, "A run-event/v1 record cannot follow the v2 stream boundary.")
      }
      const expectedRunId = decodedContext.expectedRunId
        ?? previousRunId
        ?? decodeInspectedRunId(inspected.record, lineNumber)
      try {
        const decoded = decodeWorkflowRunEventLineV1(inspected.exactLine, {
          expectedRunId,
          expectedSequence: decodedContext.expectedSequence,
          previous: decodedContext.previous?.version === "v1"
            ? decodedContext.previous.event
            : undefined
        })
        return { version: "v1", exactLine: decoded.exactLine, event: decoded.event }
      } catch (error) {
        throw mapV1Error(error, lineNumber)
      }
    }

    let verified: VerifiedRunEvent
    try {
      const decoded = decodeWorkflowRunEventV2Line(inspected.exactLine)
      verified = { version: "v2", exactLine: decoded.exactLine, event: decoded.event }
    } catch (error) {
      throw mapCodecError(error, lineNumber)
    }

    if (verified.event.sequence !== decodedContext.expectedSequence) {
      fail(
        "sequence",
        lineNumber,
        `Run event sequence ${verified.event.sequence} does not match expected ${decodedContext.expectedSequence}.`
      )
    }
    validateVersionBoundary(verified.event, decodedContext.previous, lineNumber)
    const expectedRunId = decodedContext.expectedRunId ?? decodedContext.previous?.event.runId
    if (expectedRunId !== undefined && verified.event.runId !== expectedRunId) {
      fail(
        "run-id",
        lineNumber,
        `Run event runId '${verified.event.runId}' does not match expected '${expectedRunId}'.`
      )
    }
    validateV2Ancestry(verified.event, decodedContext.previous, lineNumber)
    validateCutoverBoundary(verified.event, decodedContext.previous, lineNumber)
    return verified
  }

  encodeV2(input: WorkflowRunEventV2Draft): Buffer {
    try {
      return encodeWorkflowRunEventV2(input)
    } catch (error) {
      throw mapCodecError(error, 1)
    }
  }

  verifyStream(lines: readonly Buffer[]): RunEventStreamVerificationResult {
    try {
      const exactLines = decodeLineArray(lines)
      const events: VerifiedRunEvent[] = []
      const eventIds = new Set<string>()
      let previous: VerifiedRunEvent | undefined
      let runId: string | undefined
      for (let index = 0; index < exactLines.length; index += 1) {
        const lineNumber = index + 1
        const event = this.decodeLine(exactLines[index], {
          expectedRunId: runId,
          expectedSequence: lineNumber,
          previous,
          lineNumber
        })
        if (eventIds.has(event.event.eventId)) {
          fail("sequence", lineNumber, `Duplicate run event id '${event.event.eventId}'.`)
        }
        eventIds.add(event.event.eventId)
        events.push(event)
        previous = event
        runId = event.event.runId
      }
      if (previous === undefined) return { ok: true, events }
      const head: VerifiedRunEventHead = {
        version: previous.version,
        sequence: previous.event.sequence,
        eventHash: previous.event.hash,
        ...(previous.version === "v2" ? { stateHash: previous.event.stateHash } : {}),
        runId: previous.event.runId
      }
      return { ok: true, events, head }
    } catch (error) {
      const mapped = error instanceof RunEventCodecError
        ? error
        : new RunEventCodecError("malformed", 1, `Run event stream verification failed: ${formatError(error)}`)
      return {
        ok: false,
        failure: {
          category: mapped.category,
          lineNumber: mapped.lineNumber,
          message: mapped.message
        }
      }
    }
  }
}

function inspectLine(bytes: Buffer, lineNumber: number): InspectedLine {
  const exactLine = copyExactLine(bytes, lineNumber)
  let value: unknown
  try {
    value = JSON.parse(UTF8_DECODER.decode(exactLine.subarray(0, -1)))
  } catch (error) {
    fail("malformed", lineNumber, `Run event line is not valid UTF-8 JSON: ${formatError(error)}`)
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("malformed", lineNumber, "Run event line must contain one JSON object.")
  }
  const record = value as Record<string, unknown>
  const schemaVersion = record.schemaVersion
  if (schemaVersion === CURRENT_WORKFLOW_RUN_EVENT_SCHEMA_VERSION) {
    return { exactLine, record, inspection: { schemaVersion } }
  }
  if (schemaVersion === WORKFLOW_RUN_EVENT_V2_SCHEMA_VERSION) {
    const canonicalizationVersion = record.canonicalizationVersion
    if (canonicalizationVersion === CANONICAL_JSON_V1_VERSION) {
      return {
        exactLine,
        record,
        inspection: { schemaVersion, canonicalizationVersion }
      }
    }
    if (typeof canonicalizationVersion !== "string" || canonicalizationVersion.length === 0) {
      fail(
        "malformed",
        lineNumber,
        "Run-event/v2 canonicalizationVersion must be a non-empty string."
      )
    }
    fail(
      "unknown-canonicalization",
      lineNumber,
      `Unknown run event canonicalization '${canonicalizationVersion}'.`
    )
  }
  if (typeof schemaVersion !== "string" || schemaVersion.length === 0) {
    fail("malformed", lineNumber, "Run event schemaVersion must be a non-empty string.")
  }
  fail("unknown-schema", lineNumber, `Unknown run event schema '${schemaVersion}'.`)
}

function copyExactLine(value: unknown, lineNumber: number): Buffer {
  if (utilTypes.isProxy(value) || !Buffer.isBuffer(value)) {
    fail("malformed", lineNumber, "Run event line must be a Buffer.")
  }
  const bytes = Buffer.from(value)
  if (
    bytes.length <= 1
    || bytes[bytes.length - 1] !== 0x0a
    || bytes.indexOf(0x0a) !== bytes.length - 1
  ) {
    fail("malformed", lineNumber, "Run event input must contain exactly one non-empty LF-terminated line.")
  }
  return bytes
}

function decodeContext(value: unknown): RunEventDecodeContext {
  if (utilTypes.isProxy(value) || !value || typeof value !== "object" || Array.isArray(value)) {
    fail("malformed", 1, "Run event decode context must be a plain object.")
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    fail("malformed", 1, "Run event decode context must be a plain object.")
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") fail("malformed", 1, "Run event decode context cannot contain symbols.")
    const descriptor = descriptors[key]
    if (Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")) {
      fail("malformed", 1, `Run event decode context field '${key}' cannot be an accessor.`)
    }
  }
  const expectedSequence = descriptorValue(descriptors.expectedSequence)
  if (!Number.isSafeInteger(expectedSequence) || Number(expectedSequence) < 1) {
    fail("malformed", 1, "Run event decode context expectedSequence must be a positive safe integer.")
  }
  const expectedRunId = descriptorValue(descriptors.expectedRunId)
  if (expectedRunId !== undefined && (typeof expectedRunId !== "string" || expectedRunId.length === 0)) {
    fail("malformed", 1, "Run event decode context expectedRunId must be a non-empty string.")
  }
  const lineNumber = descriptorValue(descriptors.lineNumber)
  if (lineNumber !== undefined && (!Number.isSafeInteger(lineNumber) || Number(lineNumber) < 1)) {
    fail("malformed", 1, "Run event decode context lineNumber must be a positive safe integer.")
  }
  const previousValue = descriptorValue(descriptors.previous)
  const previous = previousValue === undefined
    ? undefined
    : decodePrevious(previousValue, Number(lineNumber ?? 1))
  return {
    expectedSequence: Number(expectedSequence),
    ...(expectedRunId === undefined ? {} : { expectedRunId: String(expectedRunId) }),
    ...(previous === undefined ? {} : { previous }),
    ...(lineNumber === undefined ? {} : { lineNumber: Number(lineNumber) })
  }
}

function decodePrevious(value: unknown, lineNumber: number): VerifiedRunEvent {
  if (utilTypes.isProxy(value) || !value || typeof value !== "object" || Array.isArray(value)) {
    fail("malformed", lineNumber, "Run event decode context previous event is invalid.")
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    fail("malformed", lineNumber, "Run event decode context previous event is invalid.")
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const version = descriptorValue(descriptors.version)
  const exactLineValue = descriptorValue(descriptors.exactLine)
  const eventValue = descriptorValue(descriptors.event)
  if ((version !== "v1" && version !== "v2") || utilTypes.isProxy(exactLineValue) || !Buffer.isBuffer(exactLineValue)) {
    fail("malformed", lineNumber, "Run event decode context previous event is invalid.")
  }
  let event: unknown
  try {
    event = JSON.parse(canonicalizeJsonV1(eventValue).subarray(0, -1).toString("utf8"))
  } catch (error) {
    fail("malformed", lineNumber, `Run event decode context previous event is invalid: ${formatError(error)}`)
  }
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    fail("malformed", lineNumber, "Run event decode context previous event is invalid.")
  }
  const record = event as Record<string, unknown>
  if (version === "v1" && record.schemaVersion === CURRENT_WORKFLOW_RUN_EVENT_SCHEMA_VERSION) {
    return { version, exactLine: Buffer.from(exactLineValue), event: record as unknown as WorkflowRunEventV1 }
  }
  if (version === "v2" && record.schemaVersion === WORKFLOW_RUN_EVENT_V2_SCHEMA_VERSION) {
    return { version, exactLine: Buffer.from(exactLineValue), event: record as unknown as WorkflowRunEventV2 }
  }
  fail("malformed", lineNumber, "Run event decode context previous version does not match its event schema.")
}

function descriptorValue(descriptor: PropertyDescriptor | undefined): unknown {
  if (descriptor === undefined) return undefined
  if (Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set") || !Object.hasOwn(descriptor, "value")) {
    fail("malformed", 1, "Run event decode context fields must be data properties.")
  }
  return descriptor.value
}

function decodeLineArray(value: unknown): Buffer[] {
  if (utilTypes.isProxy(value) || !Array.isArray(value)) {
    fail("malformed", 1, "Run event stream must be an array of exact line Buffers.")
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length")
  const length = lengthDescriptor?.value
  if (!Number.isSafeInteger(length) || Number(length) < 0) {
    fail("malformed", 1, "Run event stream array length is invalid.")
  }
  const result: Buffer[] = []
  for (let index = 0; index < Number(length); index += 1) {
    const descriptor = descriptors[String(index)]
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
      fail("malformed", index + 1, "Run event stream must be a dense data-property array.")
    }
    const line = descriptor.value
    if (utilTypes.isProxy(line) || !Buffer.isBuffer(line)) {
      fail("malformed", index + 1, "Run event stream entries must be Buffers.")
    }
    result.push(Buffer.from(line))
  }
  return result
}

function validateVersionBoundary(
  event: WorkflowRunEventV2,
  previous: VerifiedRunEvent | undefined,
  lineNumber: number
): void {
  if (previous === undefined) {
    if (event.kind !== "run.created" && event.kind !== "run.imported") {
      fail("ancestry", lineNumber, `Run-event/v2 ${event.kind} is not a native genesis event.`)
    }
    return
  }
  if (previous.version === "v1") {
    if (event.kind !== "stream.cutover") {
      fail("ancestry", lineNumber, "Only stream.cutover may establish v2 authority after a v1 prefix.")
    }
    return
  }
  if (event.kind === "run.created" || event.kind === "run.imported" || event.kind === "stream.cutover") {
    fail("ancestry", lineNumber, `Run-event/v2 ${event.kind} cannot appear after the v2 suffix begins.`)
  }
}

function validateV2Ancestry(
  event: WorkflowRunEventV2,
  previous: VerifiedRunEvent | undefined,
  lineNumber: number
): void {
  if (previous === undefined) return
  if (event.previousEventHash !== previous.event.hash) {
    fail("ancestry", lineNumber, "Run-event/v2 previousEventHash does not match the verified stream head.")
  }
  if (previous.version === "v2" && event.previousStateHash !== previous.event.stateHash) {
    fail("ancestry", lineNumber, "Run-event/v2 previousStateHash does not match the preceding v2 stateHash.")
  }
}

function validateCutoverBoundary(
  event: WorkflowRunEventV2,
  previous: VerifiedRunEvent | undefined,
  lineNumber: number
): void {
  if (event.kind !== "stream.cutover" || previous?.version !== "v1") return
  const evidence = event.evidence
  let upgradedSourceStateHash: string
  try {
    upgradedSourceStateHash = hashCanonicalJsonV1(upgradeWorkflowRunStateV1(previous.event.snapshot))
  } catch (error) {
    fail(
      "transition-evidence",
      lineNumber,
      `Verified v1 boundary cannot be upgraded deterministically: ${formatError(error)}`
    )
  }
  if (
    (evidence.sourceEventHash !== undefined && evidence.sourceEventHash !== previous.event.hash)
    || evidence.sourceRunHash !== previous.event.runHash
    || evidence.sourceSchemaVersion !== previous.event.snapshot.schemaVersion
    || evidence.upgradedSourceStateHash !== upgradedSourceStateHash
  ) {
    fail(
      "transition-evidence",
      lineNumber,
      "Run-event/v2 stream.cutover evidence does not match the verified v1 boundary."
    )
  }
}

function decodeInspectedRunId(record: Record<string, unknown>, lineNumber: number): string {
  if (typeof record.runId !== "string" || record.runId.length === 0) {
    fail("malformed", lineNumber, "Run event runId must be a non-empty string.")
  }
  return record.runId
}

function mapCodecError(error: unknown, lineNumber: number): RunEventCodecError {
  if (error instanceof RunEventCodecError) return error
  if (error instanceof RunEventV2CodecError) {
    return new RunEventCodecError(error.category, lineNumber, error.message)
  }
  return new RunEventCodecError("malformed", lineNumber, formatError(error))
}

function mapV1Error(error: unknown, lineNumber: number): RunEventCodecError {
  const message = formatError(error)
  if (/unsupported schemaVersion/u.test(message)) return new RunEventCodecError("unknown-schema", lineNumber, message)
  if (/run id mismatch/u.test(message)) return new RunEventCodecError("run-id", lineNumber, message)
  if (/sequence/u.test(message)) return new RunEventCodecError("sequence", lineNumber, message)
  if (/previous event hash|previous run hash/u.test(message)) {
    return new RunEventCodecError("ancestry", lineNumber, message)
  }
  if (/runHash does not match/u.test(message)) return new RunEventCodecError("state-hash", lineNumber, message)
  if (/event hash/u.test(message)) return new RunEventCodecError("event-hash", lineNumber, message)
  return new RunEventCodecError("malformed", lineNumber, message)
}

function fail(category: RunEventFailureCategory, lineNumber: number, message: string): never {
  throw new RunEventCodecError(category, lineNumber, message)
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
