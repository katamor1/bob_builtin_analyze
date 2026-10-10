import { types as utilTypes } from "node:util"
import { canonicalJsonBytes } from "./canonicalJson"
import { requireCompiledWorkflowPlanState, type CompiledWorkflowPlanHandle } from "./compiledPlan"
import { cloneAndFreezeJsonValue } from "./jsonValue"
import type { Sha256Digest } from "./providerContract"
import { WORKFLOW_COMPILER_CONTRACT_VERSION } from "./workflowLockContract"

const VERSION = "workflow-compiled-plan-manifest/v1" as const
export const COMPILED_WORKFLOW_PLAN_MANIFEST_SCHEMA_VERSION = VERSION
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
  readonly schemaVersion: typeof VERSION
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
const cloneJson = cloneAndFreezeJsonValue
const readState = requireCompiledWorkflowPlanState
const encodeJson = canonicalJsonBytes
const compilerVersion = WORKFLOW_COMPILER_CONTRACT_VERSION
const arrayIsArray = Array.isArray
const sort = Array.prototype.sort
const create = Object.create
const define = Object.defineProperty
const freeze = Object.freeze
const descriptor = Object.getOwnPropertyDescriptor
const hasOwn = Object.hasOwn
const keys = Reflect.ownKeys
const apply = Reflect.apply
const exec = RegExp.prototype.exec
const split = String.prototype.split
const lower = String.prototype.toLowerCase
const from = Buffer.from
const concat = Buffer.concat
const BufferClass = Buffer
const NEWLINE = apply(from, BufferClass, ["\n", "utf8"]) as Buffer
const INPUT = freeze(["collection", "slot", "generation", "handle"])
const PACKAGE = freeze(["collection", "slot", "generation", "packageDigest", "lockfileDigest", "environmentDigest", "planDigest"])
const HEADER = freeze(["schemaVersion", "compilerContractVersion", "packages"])
const DIGEST = /^sha256:[0-9a-f]{64}$/u
const SLOT = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const SEGMENT = /^[A-Za-z0-9._-]+$/u
const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu

export function createCompiledWorkflowPlanManifestPackage(input: CreateCompiledWorkflowPlanManifestPackageInput): CompiledWorkflowPlanManifestPackage {
  const value = record(input, INPUT)
  const collection = value.collection, slot = value.slot, generation = value.generation
  const handle = descriptor(input, "handle")!.value as CompiledWorkflowPlanHandle
  const state = readState(handle)
  if (state.publication !== "published" || state.generation !== generation || handle.plan.packageDigest !== generation || handle.plan.workflowId !== slot) {
    throw new TypeError("Manifest package identity does not match its compiled handle.")
  }
  if (handle.plan.compilerContractVersion !== compilerVersion) throw new TypeError("Manifest compiler contract is invalid.")
  return normalizePackage({ collection, slot, generation, packageDigest: handle.plan.packageDigest, lockfileDigest: handle.plan.lockfileDigest, environmentDigest: handle.plan.environmentDigest, planDigest: handle.planDigest })
}

export function createCompiledWorkflowPlanManifest(input: CreateCompiledWorkflowPlanManifestInput): CompiledWorkflowPlanManifest {
  const value = record(input, ["packages"])
  if (isProxy(value.packages) || !arrayIsArray(value.packages) || value.packages.length > 4096) throw new TypeError("Manifest packages must be a bounded array.")
  const values = value.packages as readonly unknown[]
  const packages: CompiledWorkflowPlanManifestPackage[] = []
  for (let i = 0; i < values.length; i += 1) {
    define(packages, `${i}`, { configurable: true, enumerable: true, writable: true, value: normalizePackage(values[i]) })
  }
  apply(sort, packages, [(a: CompiledWorkflowPlanManifestPackage, b: CompiledWorkflowPlanManifestPackage) => a.collection !== b.collection ? a.collection < b.collection ? -1 : 1 : a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0])
  const collections = create(null) as Record<string, string>, pairs = create(null) as Record<string, string>
  for (let i = 0; i < packages.length; i += 1) {
    const item = packages[i], collection = apply(lower, item.collection, []) as string
    if (collections[collection] !== undefined && collections[collection] !== item.collection) throw new TypeError("Manifest contains a cross-platform collection alias.")
    collections[collection] = item.collection
    const pair = `${collection}\n${apply(lower, item.slot, [])}`, exact = `${item.collection}\n${item.slot}`
    if (pairs[pair] !== undefined) throw new TypeError(pairs[pair] === exact ? "Manifest contains a duplicate collection and slot pair." : "Manifest contains a cross-platform collection and slot alias.")
    pairs[pair] = exact
  }
  return freeze({ schemaVersion: VERSION, compilerContractVersion: compilerVersion, packages: freeze(packages) })
}

export function encodeCompiledWorkflowPlanManifest(value: CompiledWorkflowPlanManifest): Buffer {
  const input = record(value, HEADER)
  if (input.schemaVersion !== VERSION || input.compilerContractVersion !== compilerVersion) throw new TypeError("Manifest version is invalid.")
  const canonical = createCompiledWorkflowPlanManifest({ packages: input.packages as readonly CompiledWorkflowPlanManifestPackage[] })
  return apply(concat, BufferClass, [[encodeJson(canonical), NEWLINE]]) as Buffer
}

function normalizePackage(value: unknown): CompiledWorkflowPlanManifestPackage {
  const item = record(value, PACKAGE)
  repositoryPath(item.collection)
  slotId(item.slot)
  const generation = digest(item.generation)
  for (let i = 3; i < PACKAGE.length; i += 1) digest(item[PACKAGE[i]])
  if (generation !== item.packageDigest) throw new TypeError("Manifest generation and package digest must be identical.")
  return item as unknown as CompiledWorkflowPlanManifestPackage
}
// Keep the original opaque handle identity; snapshot only its public JSON view.
function record(value: unknown, fields: readonly string[]): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || isProxy(value) || arrayIsArray(value) || keys(value).length !== fields.length) throw new TypeError("Manifest input contains an unknown field.")
  for (let i = 0; i < fields.length; i += 1) if (!hasOwn(value, fields[i])) throw new TypeError("Manifest input requires own data fields.")
  // Enforce the collection bound before the shared JSON snapshot allocates it.
  const packages = descriptor(value, "packages")
  if (packages !== undefined && hasOwn(packages, "value") && (isProxy(packages.value) || !arrayIsArray(packages.value) || packages.value.length > 4096)) throw new TypeError("Manifest packages must be a bounded array.")
  return cloneJson(value) as Readonly<Record<string, unknown>>
}
function matches(pattern: RegExp, value: string): boolean { return apply(exec, pattern, [value]) !== null }
function portable(segment: string): void {
  if (!matches(SEGMENT, segment) || matches(RESERVED, segment) || segment[segment.length - 1] === ".") throw new TypeError("Manifest path contains a non-portable segment.")
}
function repositoryPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || (apply(from, BufferClass, [value, "utf8"]) as Buffer).byteLength > 1024) throw new TypeError("Manifest collection is invalid.")
  // Every accepted portable segment is ASCII, hence already NFC.
  const segments = apply(split, value, ["/"]) as string[]
  for (let i = 0; i < segments.length; i += 1) {
    if (segments[i] === "" || segments[i] === "." || segments[i] === "..") throw new TypeError("Manifest collection must contain repository-relative segments.")
    portable(segments[i])
  }
  return value
}
function slotId(value: unknown): string {
  if (typeof value !== "string" || value.length > 128 || !matches(SLOT, value)) throw new TypeError("Manifest slot is invalid.")
  portable(value)
  return value
}
function digest(value: unknown): Sha256Digest {
  if (typeof value !== "string" || !matches(DIGEST, value)) throw new TypeError("Manifest digest is invalid.")
  return value as Sha256Digest
}