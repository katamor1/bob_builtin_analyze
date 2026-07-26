import { types as utilTypes } from "node:util"

import { canonicalJsonBytes } from "./canonicalJson"
import {
  requireCompiledWorkflowPlanState,
  type CompiledWorkflowPlanHandle
} from "./compiledPlan"
import type { Sha256Digest } from "./providerContract"
import { WORKFLOW_COMPILER_CONTRACT_VERSION } from "./workflowLockContract"

export const COMPILED_WORKFLOW_PLAN_MANIFEST_SCHEMA_VERSION =
  "workflow-compiled-plan-manifest/v1" as const

export interface CompiledWorkflowPlanManifestPackage {
  readonly collection: string
  readonly slot: string
  readonly generation: Sha256Digest
  readonly packageDigest: Sha256Digest
  readonly lockfileDigest: Sha256Digest
  readonly environmentDigest: Sha256Digest
  readonly planDigest: Sha256Digest
}

export interface CompiledWorkflowPlanManifest {
  readonly schemaVersion: typeof COMPILED_WORKFLOW_PLAN_MANIFEST_SCHEMA_VERSION
  readonly compilerContractVersion: typeof WORKFLOW_COMPILER_CONTRACT_VERSION
  readonly packages: readonly CompiledWorkflowPlanManifestPackage[]
}

export interface CreateCompiledWorkflowPlanManifestPackageInput {
  readonly collection: string
  readonly slot: string
  readonly generation: Sha256Digest
  readonly handle: CompiledWorkflowPlanHandle
}

export interface CreateCompiledWorkflowPlanManifestInput {
  readonly packages: readonly CompiledWorkflowPlanManifestPackage[]
}

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const bufferConcat = Buffer.concat
const bufferFrom = Buffer.from
const BufferConstructor = Buffer
const numberIsSafeInteger = Number.isSafeInteger
const objectCreate = Object.create
const objectDefineProperty = Object.defineProperty
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const regexpExec = RegExp.prototype.exec
const numberToString = Number.prototype.toString
const stringIncludes = String.prototype.includes
const stringNormalize = String.prototype.normalize
const stringSplit = String.prototype.split

const CREATE_PACKAGE_FIELDS = objectFreeze([
  "collection", "slot", "generation", "handle"
] as const)
const CREATE_MANIFEST_FIELDS = objectFreeze(["packages"] as const)
const MANIFEST_FIELDS = objectFreeze([
  "schemaVersion", "compilerContractVersion", "packages"
] as const)
const PACKAGE_FIELDS = objectFreeze([
  "collection", "slot", "generation", "packageDigest", "lockfileDigest",
  "environmentDigest", "planDigest"
] as const)
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u
const SLOT_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u
const NEWLINE = reflectApply(bufferFrom, BufferConstructor, ["\n", "utf8"]) as Buffer
const MAX_PACKAGES = 4096
const MAX_COLLECTION_BYTES = 1024

export function createCompiledWorkflowPlanManifestPackage(
  input: CreateCompiledWorkflowPlanManifestPackageInput
): CompiledWorkflowPlanManifestPackage {
  const snapshot = snapshotExactRecord(
    input,
    CREATE_PACKAGE_FIELDS,
    "Compiled workflow plan manifest package input"
  )
  const collection = repositoryRelativePath(snapshot.collection, "Manifest collection")
  const slot = identifier(snapshot.slot, "Manifest slot")
  const generation = digest(snapshot.generation, "Manifest generation")
  const handle = snapshot.handle as CompiledWorkflowPlanHandle
  const state = requireCompiledWorkflowPlanState(handle)
  if (state.publication !== "published" || state.generation !== generation) {
    throw new TypeError("Compiled workflow plan manifest package identity does not match the compiled handle.")
  }
  if (handle.plan.workflowId !== slot) {
    throw new TypeError("Compiled workflow plan manifest slot does not match the compiled workflow id.")
  }
  if (handle.plan.compilerContractVersion !== WORKFLOW_COMPILER_CONTRACT_VERSION) {
    throw new TypeError("Compiled workflow plan manifest compiler contract is invalid.")
  }
  return objectFreeze({
    collection,
    slot,
    generation,
    packageDigest: digest(handle.plan.packageDigest, "Manifest package digest"),
    lockfileDigest: digest(handle.plan.lockfileDigest, "Manifest lockfile digest"),
    environmentDigest: digest(handle.plan.environmentDigest, "Manifest environment digest"),
    planDigest: digest(handle.planDigest, "Manifest plan digest")
  })
}

export function createCompiledWorkflowPlanManifest(
  input: CreateCompiledWorkflowPlanManifestInput
): CompiledWorkflowPlanManifest {
  const snapshot = snapshotExactRecord(
    input,
    CREATE_MANIFEST_FIELDS,
    "Compiled workflow plan manifest input"
  )
  const packages = snapshotPackages(snapshot.packages)
  sortPackages(packages)
  for (let index = 1; index < packages.length; index += 1) {
    const previous = packages[index - 1]
    const current = packages[index]
    if (previous.collection === current.collection && previous.slot === current.slot) {
      throw new TypeError("Compiled workflow plan manifest contains a duplicate collection and slot pair.")
    }
  }
  return objectFreeze({
    schemaVersion: COMPILED_WORKFLOW_PLAN_MANIFEST_SCHEMA_VERSION,
    compilerContractVersion: WORKFLOW_COMPILER_CONTRACT_VERSION,
    packages: objectFreeze(packages)
  })
}

export function encodeCompiledWorkflowPlanManifest(
  value: CompiledWorkflowPlanManifest
): Buffer {
  const snapshot = snapshotExactRecord(
    value,
    MANIFEST_FIELDS,
    "Compiled workflow plan manifest"
  )
  if (snapshot.schemaVersion !== COMPILED_WORKFLOW_PLAN_MANIFEST_SCHEMA_VERSION) {
    throw new TypeError("Compiled workflow plan manifest schema version is invalid.")
  }
  if (snapshot.compilerContractVersion !== WORKFLOW_COMPILER_CONTRACT_VERSION) {
    throw new TypeError("Compiled workflow plan manifest compiler contract is invalid.")
  }
  const canonical = createCompiledWorkflowPlanManifest({
    packages: snapshot.packages as readonly CompiledWorkflowPlanManifestPackage[]
  })
  return reflectApply(bufferConcat, BufferConstructor, [[canonicalJsonBytes(canonical), NEWLINE]]) as Buffer
}

function snapshotPackages(value: unknown): CompiledWorkflowPlanManifestPackage[] {
  const values = snapshotDenseArray(value, "Compiled workflow plan manifest packages")
  if (values.length > MAX_PACKAGES) {
    throw new TypeError("Compiled workflow plan manifest contains too many packages.")
  }
  const result: CompiledWorkflowPlanManifestPackage[] = []
  for (let index = 0; index < values.length; index += 1) {
    const item = snapshotExactRecord(
      values[index],
      PACKAGE_FIELDS,
      "Compiled workflow plan manifest package"
    )
    defineArrayValue(result, index, objectFreeze({
      collection: repositoryRelativePath(item.collection, "Manifest collection"),
      slot: identifier(item.slot, "Manifest slot"),
      generation: digest(item.generation, "Manifest generation"),
      packageDigest: digest(item.packageDigest, "Manifest package digest"),
      lockfileDigest: digest(item.lockfileDigest, "Manifest lockfile digest"),
      environmentDigest: digest(item.environmentDigest, "Manifest environment digest"),
      planDigest: digest(item.planDigest, "Manifest plan digest")
    }))
  }
  return result
}

function snapshotDenseArray(value: unknown, label: string): readonly unknown[] {
  if (isProxy(value) || !arrayIsArray(value) || objectGetPrototypeOf(value) !== arrayPrototype) {
    throw new TypeError(`${label} must be a dense ordinary array.`)
  }
  const descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  const length = descriptorValue(descriptors, "length")
  if (typeof length !== "number" || !numberIsSafeInteger(length) || length < 0) {
    throw new TypeError(`${label} length is invalid.`)
  }
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== length + 1) throw new TypeError(`${label} must not contain extra properties.`)
  const result: unknown[] = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptorEntry(descriptors, numberAsString(index))
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError(`${label} must contain own data items.`)
    defineArrayValue(result, index, descriptor.value)
  }
  return objectFreeze(result)
}

function snapshotExactRecord<const Fields extends readonly string[]>(
  value: unknown,
  fields: Fields,
  label: string
): Readonly<Record<Fields[number], unknown>> {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError(`${label} must be an ordinary non-proxy record.`)
  }
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) {
    throw new TypeError(`${label} must be an ordinary record.`)
  }
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== fields.length) throw new TypeError(`${label} contains an unknown field.`)
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !contains(fields, key)) {
      throw new TypeError(`${label} contains an unknown field.`)
    }
    const descriptor = descriptorEntry(descriptors, key)
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError(`${label}.${key} must be an enumerable own data property.`)
    result[key] = descriptor.value
  }
  for (let index = 0; index < fields.length; index += 1) {
    if (!objectHasOwn(result, fields[index])) throw new TypeError(`${label}.${fields[index]} is required.`)
  }
  return objectFreeze(result) as Readonly<Record<Fields[number], unknown>>
}

function repositoryRelativePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || utf8Length(value) > MAX_COLLECTION_BYTES) {
    throw new TypeError(`${label} is invalid.`)
  }
  if (
    value[0] === "/"
    || value[value.length - 1] === "/"
    || reflectApply(stringIncludes, value, ["\\"]) as boolean
    || testPattern(CONTROL_PATTERN, value)
    || reflectApply(stringNormalize, value, ["NFC"]) !== value
  ) throw new TypeError(`${label} must be a canonical repository-relative POSIX path.`)
  const segments = reflectApply(stringSplit, value, ["/"]) as string[]
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index].length === 0 || segments[index] === "." || segments[index] === "..") {
      throw new TypeError(`${label} contains an invalid path segment.`)
    }
  }
  return value
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 128 || !testPattern(SLOT_PATTERN, value)) {
    throw new TypeError(`${label} is invalid.`)
  }
  return value
}

function digest(value: unknown, label: string): Sha256Digest {
  if (typeof value !== "string" || !testPattern(DIGEST_PATTERN, value)) {
    throw new TypeError(`${label} is not a canonical sha256 digest.`)
  }
  return value as Sha256Digest
}

function sortPackages(values: CompiledWorkflowPlanManifestPackage[]): void {
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index]
    let insertion = index
    while (insertion > 0 && comparePackages(values[insertion - 1], value) > 0) {
      values[insertion] = values[insertion - 1]
      insertion -= 1
    }
    values[insertion] = value
  }
}

function comparePackages(
  left: CompiledWorkflowPlanManifestPackage,
  right: CompiledWorkflowPlanManifestPackage
): number {
  if (left.collection !== right.collection) return left.collection < right.collection ? -1 : 1
  if (left.slot !== right.slot) return left.slot < right.slot ? -1 : 1
  return 0
}

function utf8Length(value: string): number {
  return (reflectApply(bufferFrom, BufferConstructor, [value, "utf8"]) as Buffer).byteLength
}

function testPattern(pattern: RegExp, value: string): boolean {
  return reflectApply(regexpExec, pattern, [value]) !== null
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === value) return true
  return false
}

function descriptorEntry(
  descriptors: PropertyDescriptorMap,
  key: PropertyKey
): PropertyDescriptor | undefined {
  const holder = objectGetOwnPropertyDescriptor(descriptors, key)
  return holder !== undefined && objectHasOwn(holder, "value")
    ? holder.value as PropertyDescriptor
    : undefined
}

function descriptorValue(descriptors: PropertyDescriptorMap, key: PropertyKey): unknown {
  return descriptorEntry(descriptors, key)?.value
}

function defineArrayValue<T>(values: T[], index: number, value: T): void {
  objectDefineProperty(values, numberAsString(index), {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

function numberAsString(value: number): string {
  return reflectApply(numberToString, value, []) as string
}
