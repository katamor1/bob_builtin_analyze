import type { JsonValue } from "./jsonValue"
import { freezeEvidence } from "./workflowLockIntrinsics"
import type {
  LockedProviderBinding,
  LockedProviderOutput,
  LockedProviderSchemaEvidence
} from "./workflowLockContract"
import {
  bytes,
  digest,
  enumValue,
  exactSemver,
  identifier,
  identifierArray,
  record,
  schemaPath,
  semverRange
} from "./workflowLockValidation"

const PROVIDER_FIELDS = [
  "id", "requestedVersion", "exactVersion", "contractDigest", "inputSchema",
  "output", "errorSchema", "sideEffect", "idempotency", "requiredCapabilities"
] as const

export function providers(values: readonly JsonValue[]): readonly LockedProviderBinding[] {
  const result: LockedProviderBinding[] = []
  for (let index = 0; index < values.length; index += 1) {
    const label = `Workflow package lock.providers[${index}]`
    const value = record(values[index], PROVIDER_FIELDS, label)
    const id = identifier(value.id, `${label}.id`)
    if (index > 0 && result[index - 1].id >= id) {
      throw new TypeError("Workflow package lock.providers must be sorted and duplicate-free by id.")
    }
    const sideEffect = enumValue(value.sideEffect, ["none", "workspace-write", "external"], `${label}.sideEffect`)
    const requiredCapabilities = identifierArray(value.requiredCapabilities, 128, `${label}.requiredCapabilities`)
    reservedCapabilities(sideEffect, requiredCapabilities, label)
    result.push(freezeEvidence({
      id,
      requestedVersion: semverRange(value.requestedVersion, `${label}.requestedVersion`),
      exactVersion: exactSemver(value.exactVersion, `${label}.exactVersion`),
      contractDigest: digest(value.contractDigest, `${label}.contractDigest`),
      inputSchema: providerSchema(value.inputSchema, `${label}.inputSchema`),
      output: providerOutput(value.output, `${label}.output`),
      errorSchema: providerSchema(value.errorSchema, `${label}.errorSchema`),
      sideEffect,
      idempotency: enumValue(value.idempotency, ["idempotent", "key-required", "non-idempotent"], `${label}.idempotency`),
      requiredCapabilities
    }))
  }
  return freezeEvidence(result)
}

function providerSchema(value: JsonValue, label: string): LockedProviderSchemaEvidence {
  const item = record(value, ["id", "bytes", "digest"], label)
  return freezeEvidence({
    id: schemaPath(item.id, `${label}.id`),
    bytes: bytes(item.bytes, 4_194_304, `${label}.bytes`),
    digest: digest(item.digest, `${label}.digest`)
  })
}

function providerOutput(value: JsonValue, label: string): LockedProviderOutput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record.`)
  }
  const kind = (value as Record<string, JsonValue>).kind
  if (kind === "unit") {
    record(value, ["kind"], label)
    return freezeEvidence({ kind: "unit" as const })
  }
  if (kind === "value") {
    const item = record(value, ["kind", "schema"], label)
    return freezeEvidence({ kind: "value" as const, schema: providerSchema(item.schema, `${label}.schema`) })
  }
  throw new TypeError(`${label}.kind is invalid.`)
}

function reservedCapabilities(
  sideEffect: LockedProviderBinding["sideEffect"],
  requiredCapabilities: readonly string[],
  label: string
): void {
  const workspace = requiredCapabilities.includes("workflow.effect.workspace-write")
  const external = requiredCapabilities.includes("workflow.effect.external")
  const valid = sideEffect === "none"
    ? !workspace && !external
    : sideEffect === "workspace-write"
      ? workspace && !external
      : external && !workspace
  if (!valid) throw new TypeError(`${label}.requiredCapabilities does not match sideEffect.`)
}
