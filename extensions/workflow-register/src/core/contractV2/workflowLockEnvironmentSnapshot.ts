import {
  BOB_2_0_1_CAPABILITIES,
  BOB_2_0_1_PROFILE_DIGEST,
  type BobCapabilityName,
  type BobTaskCapabilityName
} from "./bobProfile"
import { cloneAndFreezeJsonValue, type JsonObject, type JsonValue } from "./jsonValue"
import { preflightDenseWorkflowLockArrayLength } from "./workflowLockArrayPreflight"
import { bob as decodeBob } from "./workflowLockBob"
import type { LockedBobBinding, LockedProviderBinding } from "./workflowLockContract"
import { providers as decodeProviders } from "./workflowLockProvider"
import {
  WORKFLOW_LOCK_SCHEMA_PATH_PATTERN,
  workflowLockFileByPath,
  type WorkflowLockRawPackageSnapshot
} from "./workflowLockRawPackage"
import {
  compareWorkflowLockText,
  exactWorkflowLockJsonRecord,
  freezeWorkflowLockEvidence,
  normalizeWorkflowLockStringArray,
  snapshotDenseWorkflowLockArray,
  snapshotExactWorkflowLockRecord,
  testWorkflowLockPattern,
  workflowLockPush,
  workflowLockSort
} from "./workflowLockSnapshotUtilities"

export interface WorkflowPackageLockBobInput {
  readonly profile: "bob/2.0.1"
  readonly requiredCapabilities: readonly BobCapabilityName[]
  readonly taskCapabilities: readonly BobTaskCapabilityName[]
}

const PROVIDER_FIELDS = freezeWorkflowLockEvidence([
  "id", "requestedVersion", "exactVersion", "contractDigest", "inputSchema",
  "output", "errorSchema", "sideEffect", "idempotency", "requiredCapabilities"
] as const)
const BOB_FIELDS = freezeWorkflowLockEvidence(["profile", "requiredCapabilities", "taskCapabilities"] as const)

export function snapshotWorkflowLockProviders(
  value: unknown,
  rawPackage: WorkflowLockRawPackageSnapshot
): readonly LockedProviderBinding[] {
  preflightDenseWorkflowLockArrayLength(value, 256, "Workflow lock providers")
  const inputs = snapshotDenseWorkflowLockArray(value, 256, "Workflow lock providers")
  const normalized: JsonValue[] = []
  for (let index = 0; index < inputs.length; index += 1) {
    const inputRecord = snapshotExactWorkflowLockRecord(
      inputs[index],
      PROVIDER_FIELDS,
      `Workflow lock provider at index ${index}`
    )
    preflightDenseWorkflowLockArrayLength(
      inputRecord.requiredCapabilities,
      128,
      `Workflow lock provider at index ${index} requiredCapabilities`
    )
    const clone = cloneAndFreezeJsonValue(inputs[index])
    const record = exactWorkflowLockJsonRecord(
      clone,
      PROVIDER_FIELDS,
      `Workflow lock provider at index ${index}`
    )
    if (typeof record.id !== "string") throw new TypeError("Workflow lock provider id is invalid.")
    const capabilities = normalizeWorkflowLockStringArray(
      record.requiredCapabilities,
      128,
      `Workflow lock provider '${record.id}' capabilities`
    )
    workflowLockPush(normalized, freezeWorkflowLockEvidence({
      id: record.id,
      requestedVersion: record.requestedVersion,
      exactVersion: record.exactVersion,
      contractDigest: record.contractDigest,
      inputSchema: record.inputSchema,
      output: record.output,
      errorSchema: record.errorSchema,
      sideEffect: record.sideEffect,
      idempotency: record.idempotency,
      requiredCapabilities: capabilities
    }) as JsonValue)
  }
  workflowLockSort(normalized, (left, right) => compareWorkflowLockText(
    (left as JsonObject).id as string,
    (right as JsonObject).id as string
  ))
  for (let index = 1; index < normalized.length; index += 1) {
    if ((normalized[index - 1] as JsonObject).id === (normalized[index] as JsonObject).id) {
      throw new TypeError("Workflow lock providers contain a duplicate id.")
    }
  }
  const result = decodeProviders(normalized)
  for (let index = 0; index < result.length; index += 1) {
    const provider = result[index]
    assertProviderSchemaMatchesRaw(provider.inputSchema, rawPackage)
    assertProviderSchemaMatchesRaw(provider.errorSchema, rawPackage)
    if (provider.output.kind === "value") {
      assertProviderSchemaMatchesRaw(provider.output.schema, rawPackage)
    }
  }
  return result
}

export function snapshotWorkflowLockBob(value: unknown): LockedBobBinding {
  const inputRecord = snapshotExactWorkflowLockRecord(value, BOB_FIELDS, "Workflow lock Bob evidence")
  preflightDenseWorkflowLockArrayLength(
    inputRecord.requiredCapabilities,
    BOB_2_0_1_CAPABILITIES.length,
    "Workflow lock Bob requiredCapabilities"
  )
  preflightDenseWorkflowLockArrayLength(
    inputRecord.taskCapabilities,
    6,
    "Workflow lock Bob taskCapabilities"
  )
  const clone = cloneAndFreezeJsonValue(value)
  const record = exactWorkflowLockJsonRecord(clone, BOB_FIELDS, "Workflow lock Bob evidence")
  const requiredCapabilities = normalizeWorkflowLockStringArray(
    record.requiredCapabilities,
    BOB_2_0_1_CAPABILITIES.length,
    "Workflow lock Bob required capabilities"
  )
  const taskCapabilities = normalizeWorkflowLockStringArray(
    record.taskCapabilities,
    6,
    "Workflow lock Bob task capabilities"
  )
  return decodeBob(freezeWorkflowLockEvidence({
    profile: record.profile,
    extensionId: "IBM.bob-code",
    extensionVersion: "2.0.1",
    profileDigest: BOB_2_0_1_PROFILE_DIGEST,
    capabilities: BOB_2_0_1_CAPABILITIES,
    requiredCapabilities,
    taskCapabilities
  }) as JsonValue)
}

function assertProviderSchemaMatchesRaw(
  schema: { readonly id: string; readonly bytes: number; readonly digest: string },
  rawPackage: WorkflowLockRawPackageSnapshot
): void {
  const file = workflowLockFileByPath(rawPackage, schema.id)
  if (
    file === undefined
    || !testWorkflowLockPattern(WORKFLOW_LOCK_SCHEMA_PATH_PATTERN, file.path)
    || file.byteLength !== schema.bytes
    || file.digest !== schema.digest
  ) throw new TypeError("Workflow provider schema evidence does not match raw package bytes.")
}
