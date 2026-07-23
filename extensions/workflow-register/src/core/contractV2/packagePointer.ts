import { cloneAndFreezeJsonValue, type JsonObject } from "./jsonValue"
import type { Sha256Digest } from "./providerContract"
import { freezeEvidence } from "./workflowLockIntrinsics"

export const WORKFLOW_PACKAGE_POINTER_SCHEMA_VERSION =
  "workflow-package-pointer/v1" as const

export interface WorkflowPackagePointer {
  readonly schemaVersion: typeof WORKFLOW_PACKAGE_POINTER_SCHEMA_VERSION
  readonly workflowId: string
  readonly generation: Sha256Digest
  readonly packageDigest: Sha256Digest
}

export interface DecodeWorkflowPackagePointerInput {
  readonly workflowId: string
  readonly pointer: unknown
}

export function decodeWorkflowPackagePointer(input: unknown): WorkflowPackagePointer {
  const outer = record(cloneAndFreezeJsonValue(input), ["workflowId", "pointer"], "Workflow package pointer decoder input")
  const expectedWorkflowId = identifier(outer.workflowId, "Workflow package pointer decoder input.workflowId")
  const pointer = record(outer.pointer, ["schemaVersion", "workflowId", "generation", "packageDigest"], "Workflow package pointer")
  if (pointer.schemaVersion !== WORKFLOW_PACKAGE_POINTER_SCHEMA_VERSION) {
    throw new TypeError("Workflow package pointer.schemaVersion is invalid.")
  }
  const workflowId = identifier(pointer.workflowId, "Workflow package pointer.workflowId")
  const generation = digest(pointer.generation, "Workflow package pointer.generation")
  const packageDigest = digest(pointer.packageDigest, "Workflow package pointer.packageDigest")
  if (workflowId !== expectedWorkflowId) {
    throw new TypeError("Workflow package pointer.workflowId does not match the requested workflowId.")
  }
  if (generation !== packageDigest) {
    throw new TypeError("Workflow package pointer generation and package digest must be identical.")
  }
  return freezeEvidence({
    schemaVersion: WORKFLOW_PACKAGE_POINTER_SCHEMA_VERSION,
    workflowId,
    generation,
    packageDigest
  })
}

const ID = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const DIGEST = /^sha256:[0-9a-f]{64}$/u

function record(value: unknown, fields: readonly string[], label: string): JsonObject {
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

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 128 || !ID.test(value)) {
    throw new TypeError(`${label} is invalid.`)
  }
  return value
}

function digest(value: unknown, label: string): Sha256Digest {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    throw new TypeError(`${label} is not a canonical sha256 digest.`)
  }
  return value as Sha256Digest
}
