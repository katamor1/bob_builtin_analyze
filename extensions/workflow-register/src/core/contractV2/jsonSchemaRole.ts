import { types as utilTypes } from "node:util"

import { canonicalJsonDigest } from "./canonicalJson"
import {
  inspectLocalJsonSchemaViewInstancePointer,
  type CompiledLocalJsonSchemaView
} from "./jsonSchemaCatalog"
import { cloneAndFreezeJsonValue, type JsonValue } from "./jsonValue"

export type LocalJsonSchemaManualFieldContract =
  | { readonly id: string; readonly required: boolean; readonly kind: "string" | "number" | "boolean" }
  | { readonly id: string; readonly required: boolean; readonly kind: "select"; readonly options: readonly string[] }
  | { readonly id: "decision"; readonly required: true; readonly kind: "approval" }

export type ValidateLocalJsonSchemaManualContractResult =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly reason: "closed-object" | "properties" | "required" | "field-type" | "field-options" | "approval"
      readonly fieldIndex?: number
    }

declare const localJsonSchemaRoleBrand: unique symbol
export interface LocalJsonSchemaRoleHandle {
  readonly [localJsonSchemaRoleBrand]: true
}

interface LocalJsonSchemaRoleState {
  readonly compiled: CompiledLocalJsonSchemaView
  readonly root: Readonly<Record<string, JsonValue>>
}

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const arrayPush = Array.prototype.push
const numberIsSafeInteger = Number.isSafeInteger
const numberToString = Number.prototype.toString
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectKeys = Object.keys
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<object, LocalJsonSchemaRoleState>,
  key: object
) => LocalJsonSchemaRoleState | undefined
const weakMapHas = Function.prototype.call.bind(WeakMap.prototype.has) as (
  map: WeakMap<object, LocalJsonSchemaRoleState>,
  key: object
) => boolean
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<object, LocalJsonSchemaRoleState>,
  key: object,
  value: LocalJsonSchemaRoleState
) => WeakMap<object, LocalJsonSchemaRoleState>
const CREATE_FIELDS = objectFreeze(["compiled", "schema"] as const)
const VALIDATE_FIELDS = objectFreeze(["role", "fields"] as const)
const FIELD_BASE_FIELDS = objectFreeze(["id", "required", "kind"] as const)
const FIELD_SELECT_FIELDS = objectFreeze(["id", "required", "kind", "options"] as const)
const states = new WeakMap<object, LocalJsonSchemaRoleState>()
const SUCCESS = objectFreeze({ ok: true as const })

export function createLocalJsonSchemaRoleHandle(input: {
  readonly compiled: CompiledLocalJsonSchemaView
  readonly schema: unknown
}): LocalJsonSchemaRoleHandle {
  const snapshot = snapshotExactRecord(input, CREATE_FIELDS, "Local JSON Schema role input")
  const compiled = snapshot.compiled as CompiledLocalJsonSchemaView
  inspectLocalJsonSchemaViewInstancePointer({ compiled, pointer: "" })
  const schema = cloneAndFreezeJsonValue(snapshot.schema)
  if (!isJsonObject(schema)) throw new TypeError("Local JSON Schema role root must be an object schema.")
  const rootId = compiled.evidence.rootId
  const evidence = findEvidence(compiled.evidence.schemas, rootId)
  if (
    evidence === undefined
    || canonicalJsonDigest(schema) !== evidence.schemaDigest
    || schema.$id !== rootId
  ) throw new TypeError("Local JSON Schema role evidence does not match the compiled root.")

  const handle = objectFreeze({}) as LocalJsonSchemaRoleHandle
  weakMapSet(states, handle, objectFreeze({ compiled, root: schema }))
  return handle
}

export function validateLocalJsonSchemaManualContract(input: {
  readonly role: LocalJsonSchemaRoleHandle
  readonly fields: readonly LocalJsonSchemaManualFieldContract[]
}): ValidateLocalJsonSchemaManualContractResult {
  const snapshot = snapshotExactRecord(input, VALIDATE_FIELDS, "Local JSON Schema manual contract input")
  const role = snapshot.role
  if (typeof role !== "object" || role === null || isProxy(role) || !weakMapHas(states, role)) {
    throw new TypeError("Local JSON Schema role handle is invalid.")
  }
  const state = weakMapGet(states, role)
  if (state === undefined) throw new TypeError("Local JSON Schema role state is unavailable.")
  const fields = snapshotFields(snapshot.fields)
  const root = state.root
  if (root.type !== "object" || root.additionalProperties !== false) return failure("closed-object")
  if (!isJsonObject(root.properties)) return failure("properties")

  const propertyKeys = objectKeys(root.properties)
  const expectedKeys: string[] = []
  for (let index = 0; index < fields.length; index += 1) push(expectedKeys, fields[index].id)
  sortText(propertyKeys)
  sortText(expectedKeys)
  if (!sameStrings(propertyKeys, expectedKeys)) return failure("properties")

  const required = readStringArray(root.required)
  const expectedRequired: string[] = []
  for (let index = 0; index < fields.length; index += 1) {
    if (fields[index].required) push(expectedRequired, fields[index].id)
  }
  sortText(required)
  sortText(expectedRequired)
  if (!sameStrings(required, expectedRequired)) return failure("required")

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    const property = root.properties[field.id]
    if (!isJsonObject(property)) return failure("field-type", index)
    if (field.kind === "approval") {
      if (property.type !== "string" || !sameStrings(readStringArray(property.enum), ["approved", "rejected"])) {
        return failure("approval", index)
      }
      continue
    }
    if (field.kind === "select") {
      if (property.type !== "string" || !sameStrings(readStringArray(property.enum), field.options)) {
        return failure("field-options", index)
      }
      continue
    }
    if (property.type !== field.kind) return failure("field-type", index)
  }
  return SUCCESS
}

function snapshotFields(value: unknown): readonly LocalJsonSchemaManualFieldContract[] {
  if (isProxy(value) || !arrayIsArray(value) || objectGetPrototypeOf(value) !== arrayPrototype) {
    throw new TypeError("Local JSON Schema manual fields must be a dense ordinary array.")
  }
  const descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  const length = descriptors.length?.value
  if (typeof length !== "number" || !numberIsSafeInteger(length) || length < 0 || length > 128) {
    throw new TypeError("Local JSON Schema manual fields have an invalid length.")
  }
  if (reflectOwnKeys(descriptors).length !== length + 1) {
    throw new TypeError("Local JSON Schema manual fields must be dense and contain no extra properties.")
  }
  const result: LocalJsonSchemaManualFieldContract[] = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[numberAsString(index)]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError("Local JSON Schema manual fields must contain own data items.")
    const baseSnapshot = snapshotRecord(descriptor.value, "Local JSON Schema manual field")
    const fields = baseSnapshot.kind === "select" ? FIELD_SELECT_FIELDS : FIELD_BASE_FIELDS
    assertExactKeys(baseSnapshot, fields, "Local JSON Schema manual field")
    if (typeof baseSnapshot.id !== "string" || baseSnapshot.id.length === 0 || typeof baseSnapshot.required !== "boolean") {
      throw new TypeError("Local JSON Schema manual field identity is invalid.")
    }
    if (
      baseSnapshot.kind !== "string"
      && baseSnapshot.kind !== "number"
      && baseSnapshot.kind !== "boolean"
      && baseSnapshot.kind !== "select"
      && baseSnapshot.kind !== "approval"
    ) throw new TypeError("Local JSON Schema manual field kind is invalid.")
    if (baseSnapshot.kind === "approval" && (baseSnapshot.id !== "decision" || baseSnapshot.required !== true)) {
      throw new TypeError("Local JSON Schema approval field is invalid.")
    }
    if (baseSnapshot.kind === "select") {
      const options = readRequiredStringArray(baseSnapshot.options)
      push(result, objectFreeze({
        id: baseSnapshot.id,
        required: baseSnapshot.required,
        kind: "select" as const,
        options
      }))
    } else {
      push(result, objectFreeze({
        id: baseSnapshot.id,
        required: baseSnapshot.required,
        kind: baseSnapshot.kind
      }) as LocalJsonSchemaManualFieldContract)
    }
  }
  return objectFreeze(result)
}

function snapshotExactRecord<const Fields extends readonly string[]>(
  value: unknown,
  fields: Fields,
  label: string
): Readonly<Record<Fields[number], unknown>> {
  const snapshot = snapshotRecord(value, label)
  assertExactKeys(snapshot, fields, label)
  return snapshot as Readonly<Record<Fields[number], unknown>>
}

function snapshotRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError(`${label} must be an ordinary non-proxy record.`)
  }
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) throw new TypeError(`${label} must be an ordinary record.`)
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string") throw new TypeError(`${label} contains an unsupported key.`)
    const descriptor = descriptors[key]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError(`${label}.${key} must be an enumerable own data property.`)
    result[key] = descriptor.value
  }
  return objectFreeze(result)
}

function assertExactKeys(value: Readonly<Record<string, unknown>>, fields: readonly string[], label: string): void {
  const keys = objectKeys(value)
  if (keys.length !== fields.length) throw new TypeError(`${label} contains an unknown field.`)
  for (let index = 0; index < keys.length; index += 1) {
    if (!contains(fields, keys[index])) throw new TypeError(`${label} contains an unknown field.`)
  }
}

function readRequiredStringArray(value: unknown): readonly string[] {
  const values = snapshotStringArray(value)
  if (values === undefined) {
    throw new TypeError("Local JSON Schema select options must be a dense ordinary string array.")
  }
  return objectFreeze(values)
}

function readStringArray(value: unknown): string[] {
  return snapshotStringArray(value) ?? []
}

function snapshotStringArray(value: unknown): string[] | undefined {
  if (isProxy(value) || !arrayIsArray(value) || objectGetPrototypeOf(value) !== arrayPrototype) return undefined
  let descriptors: PropertyDescriptorMap
  try {
    descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  } catch {
    return undefined
  }
  const length = descriptors.length?.value
  if (
    typeof length !== "number"
    || !numberIsSafeInteger(length)
    || length < 0
    || length > 256
    || reflectOwnKeys(descriptors).length !== length + 1
  ) return undefined
  const result: string[] = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[numberAsString(index)]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
      || typeof descriptor.value !== "string"
    ) return undefined
    push(result, descriptor.value)
  }
  return result
}

function isJsonObject(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return value !== null && typeof value === "object" && !arrayIsArray(value)
}

function findEvidence(
  values: readonly { readonly id: string; readonly schemaDigest: string }[],
  id: string
): { readonly id: string; readonly schemaDigest: string } | undefined {
  for (let index = 0; index < values.length; index += 1) if (values[index].id === id) return values[index]
  return undefined
}

function failure(
  reason: Exclude<ValidateLocalJsonSchemaManualContractResult, { readonly ok: true }>["reason"],
  fieldIndex?: number
): ValidateLocalJsonSchemaManualContractResult {
  return fieldIndex === undefined
    ? objectFreeze({ ok: false as const, reason })
    : objectFreeze({ ok: false as const, reason, fieldIndex })
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false
  return true
}

function sortText(values: string[]): void {
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index]
    let insertion = index
    while (insertion > 0 && values[insertion - 1] > value) {
      values[insertion] = values[insertion - 1]
      insertion -= 1
    }
    values[insertion] = value
  }
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === value) return true
  return false
}

function numberAsString(value: number): string {
  return reflectApply(numberToString, value, []) as string
}

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}
