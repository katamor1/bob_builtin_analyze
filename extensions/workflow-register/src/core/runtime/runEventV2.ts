import { TextDecoder, types as utilTypes } from "node:util"
import type { WorkflowRunStateV2 } from "../model"
import {
  CANONICAL_JSON_V1_VERSION,
  canonicalizeJsonV1,
  hashCanonicalJsonV1
} from "./canonicalJsonV1"
import { decodeWorkflowRunStateV2 } from "./runStateV2"

export const WORKFLOW_RUN_EVENT_V2_SCHEMA_VERSION = "workflow-register/run-event/v2" as const
export const RUN_EVENT_V2_SCHEMA_VERSION = WORKFLOW_RUN_EVENT_V2_SCHEMA_VERSION

export const RUN_EVENT_KIND_V2_VALUES: readonly RunEventKindV2[] = Object.freeze([
  "run.created",
  "run.imported",
  "stream.cutover",
  "run.transitioned",
  "attempt.started",
  "attempt.retry-started",
  "attempt.completed",
  "attempt.failed",
  "effect.intent-recorded",
  "effect.succeeded",
  "effect.failed",
  "effect.cancelled",
  "effect.in-doubt",
  "effect.reconciled",
  "artifact.committed",
  "approval.recorded",
  "budget.exhausted",
  "cancel.requested",
  "run.forked"
])

export type RunEventKindV2 =
  | "run.created"
  | "run.imported"
  | "stream.cutover"
  | "run.transitioned"
  | "attempt.started"
  | "attempt.retry-started"
  | "attempt.completed"
  | "attempt.failed"
  | "effect.intent-recorded"
  | "effect.succeeded"
  | "effect.failed"
  | "effect.cancelled"
  | "effect.in-doubt"
  | "effect.reconciled"
  | "artifact.committed"
  | "approval.recorded"
  | "budget.exhausted"
  | "cancel.requested"
  | "run.forked"

export type RunEventFailureCategory =
  | "malformed"
  | "unknown-schema"
  | "unknown-canonicalization"
  | "sequence"
  | "ancestry"
  | "state-hash"
  | "event-hash"
  | "run-id"
  | "transition-evidence"

export interface WorkflowActorV2 {
  id: string
  kind: string
}

export interface WorkflowRunTransitionEvidenceV2 {
  sourceRunHash: string
  sourceEventHash?: string
  sourceSchemaVersion: string
  upgradedSourceStateHash: string
  importerVersion: string
}

export type WorkflowRunEventEvidenceV2 = Record<string, unknown>

export interface WorkflowRunEventV2 {
  schemaVersion: typeof WORKFLOW_RUN_EVENT_V2_SCHEMA_VERSION
  canonicalizationVersion: typeof CANONICAL_JSON_V1_VERSION
  sequence: number
  eventId: string
  runId: string
  kind: RunEventKindV2
  occurredAt: string
  actor: WorkflowActorV2
  correlationId?: string
  causationEventId?: string
  previousEventHash?: string
  previousStateHash?: string
  stateHash: string
  projectionHash: string
  state: WorkflowRunStateV2
  evidence: WorkflowRunEventEvidenceV2
  hash: string
}

export type WorkflowRunEventV2Draft = Omit<
  WorkflowRunEventV2,
  "schemaVersion" | "canonicalizationVersion" | "stateHash" | "hash"
> & {
  schemaVersion?: typeof WORKFLOW_RUN_EVENT_V2_SCHEMA_VERSION
  canonicalizationVersion?: typeof CANONICAL_JSON_V1_VERSION
  stateHash?: string
  hash?: string
}

export interface DecodedWorkflowRunEventV2Line {
  event: WorkflowRunEventV2
  exactLine: Buffer
}

const ENVELOPE_FIELDS = new Set([
  "schemaVersion",
  "canonicalizationVersion",
  "sequence",
  "eventId",
  "runId",
  "kind",
  "occurredAt",
  "actor",
  "correlationId",
  "causationEventId",
  "previousEventHash",
  "previousStateHash",
  "stateHash",
  "projectionHash",
  "state",
  "evidence",
  "hash"
])

const ACTOR_FIELDS = new Set(["id", "kind"])
const TRANSITION_EVIDENCE_FIELDS = new Set([
  "sourceRunHash",
  "sourceEventHash",
  "sourceSchemaVersion",
  "upgradedSourceStateHash",
  "importerVersion"
])
const EVENT_KINDS = new Set<string>(RUN_EVENT_KIND_V2_VALUES)
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true })

export class RunEventV2CodecError extends Error {
  constructor(
    readonly category: RunEventFailureCategory,
    message: string
  ) {
    super(message)
    this.name = "RunEventV2CodecError"
  }
}

export function encodeWorkflowRunEventV2(input: WorkflowRunEventV2Draft): Buffer {
  let trusted: unknown
  try {
    trusted = JSON.parse(canonicalizeJsonV1(input).subarray(0, -1).toString("utf8"))
  } catch (error) {
    throw asCodecError(error, "malformed", "Run-event/v2 input is invalid")
  }
  const event = decodeEventRecord(trusted, true)
  return canonicalizeJsonV1(event)
}

export function decodeWorkflowRunEventV2Line(bytes: Buffer): DecodedWorkflowRunEventV2Line {
  const exactLine = copyExactLine(bytes)
  let value: unknown
  try {
    value = JSON.parse(UTF8_DECODER.decode(exactLine.subarray(0, -1)))
  } catch (error) {
    throw new RunEventV2CodecError("malformed", `Run event line is not valid UTF-8 JSON: ${formatError(error)}`)
  }
  const record = requiredRecord(value, "Run-event/v2 line", "malformed")
  decodeSchemaVersion(record.schemaVersion)
  decodeCanonicalizationVersion(record.canonicalizationVersion)
  let canonical: Buffer
  try {
    canonical = canonicalizeJsonV1(record)
  } catch (error) {
    throw asCodecError(error, "malformed", "Run-event/v2 line is not canonical JSON")
  }
  if (!canonical.equals(exactLine)) {
    throw new RunEventV2CodecError(
      "malformed",
      "Run-event/v2 line bytes do not match canonical-json/v1 exactly."
    )
  }
  return { event: decodeEventRecord(record, false), exactLine }
}

function decodeEventRecord(value: unknown, encoding: boolean): WorkflowRunEventV2 {
  const record = requiredRecord(value, "Run-event/v2 envelope", "malformed")
  assertAllowedFields(record, ENVELOPE_FIELDS, "Run-event/v2 envelope", "malformed")
  const schemaVersion = record.schemaVersion === undefined && encoding
    ? WORKFLOW_RUN_EVENT_V2_SCHEMA_VERSION
    : decodeSchemaVersion(record.schemaVersion)
  const canonicalizationVersion = record.canonicalizationVersion === undefined && encoding
    ? CANONICAL_JSON_V1_VERSION
    : decodeCanonicalizationVersion(record.canonicalizationVersion)
  const sequence = requiredPositiveInteger(record.sequence, "sequence")
  const eventId = requiredStableString(record.eventId, "eventId")
  const runId = requiredStableString(record.runId, "runId")
  const kind = decodeEventKind(record.kind)
  const occurredAt = requiredCanonicalTimestamp(record.occurredAt)
  const actor = decodeActor(record.actor)
  const correlationId = optionalStableString(record.correlationId, "correlationId")
  const causationEventId = optionalStableString(record.causationEventId, "causationEventId")
  const previousEventHash = optionalHash(record.previousEventHash, "previousEventHash", "malformed")
  const previousStateHash = optionalHash(record.previousStateHash, "previousStateHash", "malformed")
  const projectionHash = requiredHash(record.projectionHash, "projectionHash", "malformed")
  let state: WorkflowRunStateV2
  try {
    state = decodeWorkflowRunStateV2(record.state)
  } catch (error) {
    throw asCodecError(error, "malformed", "Run-event/v2 state is invalid")
  }
  if (state.runId !== runId) {
    throw new RunEventV2CodecError(
      "run-id",
      `Run-event/v2 state runId '${state.runId}' does not match envelope runId '${runId}'.`
    )
  }
  const evidence = requiredRecord(record.evidence, "Run-event/v2 evidence", "malformed")
  validateAncestryShape(kind, sequence, previousEventHash, previousStateHash)

  const calculatedStateHash = hashCanonicalJsonV1(state)
  if (record.stateHash !== undefined) {
    const stateHash = requiredHash(record.stateHash, "stateHash", "state-hash")
    if (stateHash !== calculatedStateHash) {
      throw new RunEventV2CodecError(
        "state-hash",
        `Run-event/v2 stateHash '${stateHash}' does not match the complete decoded state.`
      )
    }
  } else if (!encoding) {
    throw new RunEventV2CodecError("state-hash", "Run-event/v2 field 'stateHash' is required.")
  }

  validateTransitionEvidence(kind, evidence, calculatedStateHash)
  const withoutHash = {
    schemaVersion,
    canonicalizationVersion,
    sequence,
    eventId,
    runId,
    kind,
    occurredAt,
    actor,
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(causationEventId === undefined ? {} : { causationEventId }),
    ...(previousEventHash === undefined ? {} : { previousEventHash }),
    ...(previousStateHash === undefined ? {} : { previousStateHash }),
    stateHash: calculatedStateHash,
    projectionHash,
    state,
    evidence
  }
  const calculatedHash = hashCanonicalJsonV1(withoutHash)
  if (record.hash !== undefined) {
    const hash = requiredHash(record.hash, "hash", "event-hash")
    if (hash !== calculatedHash) {
      throw new RunEventV2CodecError(
        "event-hash",
        `Run-event/v2 event hash '${hash}' does not match its canonical envelope.`
      )
    }
  } else if (!encoding) {
    throw new RunEventV2CodecError("event-hash", "Run-event/v2 field 'hash' is required.")
  }
  return { ...withoutHash, hash: calculatedHash }
}

function copyExactLine(value: unknown): Buffer {
  if (utilTypes.isProxy(value) || !Buffer.isBuffer(value)) {
    throw new RunEventV2CodecError("malformed", "Run event line must be a Buffer.")
  }
  const bytes = Buffer.from(value)
  if (
    bytes.length <= 1
    || bytes[bytes.length - 1] !== 0x0a
    || bytes.indexOf(0x0a) !== bytes.length - 1
  ) {
    throw new RunEventV2CodecError(
      "malformed",
      "Run event input must contain exactly one non-empty LF-terminated line."
    )
  }
  return bytes
}

function decodeSchemaVersion(value: unknown): WorkflowRunEventV2["schemaVersion"] {
  if (value === WORKFLOW_RUN_EVENT_V2_SCHEMA_VERSION) return value
  if (typeof value !== "string" || value.length === 0) {
    throw new RunEventV2CodecError("malformed", "Run event field 'schemaVersion' must be a non-empty string.")
  }
  throw new RunEventV2CodecError("unknown-schema", `Unknown run event schema '${value}'.`)
}

function decodeCanonicalizationVersion(value: unknown): WorkflowRunEventV2["canonicalizationVersion"] {
  if (value === CANONICAL_JSON_V1_VERSION) return value
  if (typeof value !== "string" || value.length === 0) {
    throw new RunEventV2CodecError(
      "malformed",
      "Run-event/v2 field 'canonicalizationVersion' must be a non-empty string."
    )
  }
  throw new RunEventV2CodecError(
    "unknown-canonicalization",
    `Unknown run event canonicalization '${value}'.`
  )
}

function decodeEventKind(value: unknown): RunEventKindV2 {
  if (typeof value !== "string" || !EVENT_KINDS.has(value)) {
    throw new RunEventV2CodecError("malformed", `Run-event/v2 has unsupported kind '${String(value)}'.`)
  }
  return value as RunEventKindV2
}

function decodeActor(value: unknown): WorkflowActorV2 {
  const record = requiredRecord(value, "Run-event/v2 actor", "malformed")
  assertAllowedFields(record, ACTOR_FIELDS, "Run-event/v2 actor", "malformed")
  return {
    id: requiredStableString(record.id, "actor.id"),
    kind: requiredTrimmedString(record.kind, "actor.kind", "malformed")
  }
}

function validateAncestryShape(
  kind: RunEventKindV2,
  sequence: number,
  previousEventHash: string | undefined,
  previousStateHash: string | undefined
): void {
  switch (kind) {
    case "run.created":
    case "run.imported":
      if (sequence !== 1) {
        throw new RunEventV2CodecError(
          "sequence",
          `Run-event/v2 ${kind} must use sequence 1.`
        )
      }
      if (previousEventHash !== undefined || previousStateHash !== undefined) {
        throw new RunEventV2CodecError(
          "ancestry",
          `Run-event/v2 ${kind} must omit previousEventHash and previousStateHash.`
        )
      }
      return
    case "stream.cutover":
      if (sequence <= 1 || previousEventHash === undefined || previousStateHash !== undefined) {
        throw new RunEventV2CodecError(
          "ancestry",
          "Run-event/v2 stream.cutover must follow a v1 event and omit previousStateHash."
        )
      }
      return
    case "run.transitioned":
    case "attempt.started":
    case "attempt.retry-started":
    case "attempt.completed":
    case "attempt.failed":
    case "effect.intent-recorded":
    case "effect.succeeded":
    case "effect.failed":
    case "effect.cancelled":
    case "effect.in-doubt":
    case "effect.reconciled":
    case "artifact.committed":
    case "approval.recorded":
    case "budget.exhausted":
    case "cancel.requested":
    case "run.forked":
      if (previousEventHash === undefined || previousStateHash === undefined) {
        throw new RunEventV2CodecError(
          "ancestry",
          `Run-event/v2 ${kind} requires previousEventHash and previousStateHash.`
        )
      }
      return
    default:
      return assertNever(kind)
  }
}

function validateTransitionEvidence(
  kind: RunEventKindV2,
  evidence: Record<string, unknown>,
  stateHash: string
): void {
  if (kind !== "run.imported" && kind !== "stream.cutover") return
  assertAllowedFields(
    evidence,
    TRANSITION_EVIDENCE_FIELDS,
    `Run-event/v2 ${kind} evidence`,
    "transition-evidence"
  )
  requiredHash(evidence.sourceRunHash, "evidence.sourceRunHash", "transition-evidence")
  optionalHash(
    evidence.sourceEventHash,
    "evidence.sourceEventHash",
    "transition-evidence"
  )
  requiredTrimmedString(
    evidence.sourceSchemaVersion,
    "evidence.sourceSchemaVersion",
    "transition-evidence"
  )
  const upgradedSourceStateHash = requiredHash(
    evidence.upgradedSourceStateHash,
    "evidence.upgradedSourceStateHash",
    "transition-evidence"
  )
  if (upgradedSourceStateHash !== stateHash) {
    throw new RunEventV2CodecError(
      "transition-evidence",
      "Run-event/v2 transition evidence upgradedSourceStateHash does not match the decoded state."
    )
  }
  requiredTrimmedString(evidence.importerVersion, "evidence.importerVersion", "transition-evidence")
}

function requiredRecord(
  value: unknown,
  label: string,
  category: RunEventFailureCategory
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new RunEventV2CodecError(category, `${label} must be a plain object.`)
  }
  return value as Record<string, unknown>
}

function assertAllowedFields(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
  category: RunEventFailureCategory
): void {
  for (const field of Object.keys(record)) {
    if (!allowed.has(field)) {
      throw new RunEventV2CodecError(category, `${label} has unknown field '${field}'.`)
    }
  }
}

function requiredStableString(value: unknown, field: string): string {
  const decoded = requiredTrimmedString(value, field, "malformed")
  if (/\r|\n|\0/u.test(decoded)) {
    throw new RunEventV2CodecError("malformed", `Run-event/v2 field '${field}' is not a stable identifier.`)
  }
  return decoded
}

function optionalStableString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  return requiredStableString(value, field)
}

function requiredTrimmedString(
  value: unknown,
  field: string,
  category: RunEventFailureCategory
): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new RunEventV2CodecError(
      category,
      `Run-event/v2 field '${field}' must be a non-empty string without surrounding whitespace.`
    )
  }
  return value
}

function requiredCanonicalTimestamp(value: unknown): string {
  const timestamp = requiredTrimmedString(value, "occurredAt", "malformed")
  let canonical: string
  try {
    canonical = new Date(timestamp).toISOString()
  } catch {
    throw new RunEventV2CodecError("malformed", "Run-event/v2 field 'occurredAt' must be canonical UTC ISO.")
  }
  if (canonical !== timestamp) {
    throw new RunEventV2CodecError("malformed", "Run-event/v2 field 'occurredAt' must be canonical UTC ISO.")
  }
  return timestamp
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new RunEventV2CodecError("malformed", `Run-event/v2 field '${field}' must be a positive safe integer.`)
  }
  return Number(value)
}

function requiredHash(
  value: unknown,
  field: string,
  category: RunEventFailureCategory
): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new RunEventV2CodecError(category, `Run-event/v2 field '${field}' must be a lowercase SHA-256 hash.`)
  }
  return value
}

function optionalHash(
  value: unknown,
  field: string,
  category: RunEventFailureCategory
): string | undefined {
  return value === undefined ? undefined : requiredHash(value, field, category)
}

function asCodecError(
  error: unknown,
  category: RunEventFailureCategory,
  prefix: string
): RunEventV2CodecError {
  if (error instanceof RunEventV2CodecError) return error
  return new RunEventV2CodecError(category, `${prefix}: ${formatError(error)}`)
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function assertNever(value: never): never {
  throw new RunEventV2CodecError("malformed", `Unhandled run-event/v2 kind '${String(value)}'.`)
}
