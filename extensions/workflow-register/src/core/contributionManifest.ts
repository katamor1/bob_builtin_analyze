import { types } from "node:util"
import * as path from "node:path"
import { parse as parseSemver } from "semver"

export interface ContributionOwner { readonly id: string; readonly version: string }
export interface InstalledContributionOwner extends ContributionOwner { readonly extensionRoot: string }
export type ProviderProvenanceContext = InstalledContributionOwner
export interface ContributionRegistryApiRange { readonly min: string; readonly max: string }
export interface ProviderContribution { readonly id: string; readonly contract_version: string }
export interface ResultSinkContribution { readonly type: string; readonly contract_version: string }
export interface FileContribution { readonly id: string; readonly path: string }
export interface WorkflowContributionManifest {
  readonly schema_version: "workflow-contributions/v1"
  readonly owner: ContributionOwner
  readonly registry_api: ContributionRegistryApiRange
  readonly action_providers: readonly ProviderContribution[]
  readonly preflight_checks: readonly ProviderContribution[]
  readonly result_sinks: readonly ResultSinkContribution[]
  readonly agent_provider?: ProviderContribution
  readonly workflow_templates: readonly FileContribution[]
  readonly schemas: readonly FileContribution[]
}

export type ContributionErrorCode =
  | "contribution.manifest.invalid" | "contribution.provenance.invalid" | "contribution.handlers.invalid"
  | "contribution.registry.duplicate_owner" | "contribution.registry.duplicate_identifier"
  | "contribution.registry.agent_conflict" | "contribution.registry.reentrant_mutation" | "contribution.registry.commit_failed"
  | "provider.registry.range_malformed" | "provider.registry.version_incompatible" | "provider.registry.host_disposed"

export class ContributionRegistrationError extends Error {
  readonly code: ContributionErrorCode
  constructor(code: ContributionErrorCode) {
    super("Workflow contribution registration was rejected.")
    this.name = "ContributionRegistrationError"
    this.code = code
  }
}

const isProxy = types.isProxy
const ownKeys = Reflect.ownKeys, getDescriptor = Object.getOwnPropertyDescriptor, getPrototype = Object.getPrototypeOf
const freeze = Object.freeze, create = Object.create, define = Object.defineProperty
const hasOwn = Object.hasOwn, objectPrototype = Object.prototype, arrayPrototype = Array.prototype
const isArray = Array.isArray, byteLength = Buffer.byteLength.bind(Buffer)
const ID = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const OWNER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*\.[A-Za-z0-9][A-Za-z0-9_-]*$/u
const CONTRACT = /^([A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*)\/v([1-9][0-9]*)$/u
const RANGE = /^provider-registry\/v([1-9][0-9]*)$/u
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u
const ROOT_FIELDS = ["schema_version", "owner", "registry_api", "action_providers", "preflight_checks", "result_sinks", "workflow_templates", "schemas"] as const
const MANIFEST = "contribution.manifest.invalid" as const
const PROVENANCE = "contribution.provenance.invalid" as const
export function rejectContribution(code: ContributionErrorCode): never { throw new ContributionRegistrationError(code) }

/** Descriptor-only shallow reader shared by the manifest and handler boundaries. */
export function readContributionRecord(value: unknown, required: readonly string[], optional: readonly string[], code: ContributionErrorCode): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || isProxy(value) || isArray(value)) rejectContribution(code)
  const proto = getPrototype(value)
  if (proto !== objectPrototype && proto !== null) rejectContribution(code)
  const keys = ownKeys(value)
  if (keys.length < required.length || keys.length > required.length + optional.length) rejectContribution(code)
  const result = create(null) as Record<string, unknown>
  for (const key of keys) {
    if (typeof key !== "string" || (!required.includes(key) && !optional.includes(key))) rejectContribution(code)
    const d = getDescriptor(value, key)
    if (!d || !hasOwn(d, "value") || d.enumerable !== true) rejectContribution(code)
    define(result, key, { value: d.value, enumerable: true })
  }
  for (const key of required) if (!hasOwn(result, key)) rejectContribution(code)
  return freeze(result)
}

/** Bounded data-only snapshot; no property value is obtained through a getter. */
function snapshotData(input: unknown, code: ContributionErrorCode): unknown {
  let nodes = 0, totalBytes = 0
  const ancestors = new WeakSet<object>()
  const text = (value: string) => {
    const bytes = byteLength(value, "utf8")
    if (bytes > 4096 || (totalBytes += bytes) > 4_194_304) rejectContribution(code)
    return value
  }
  const visit = (value: unknown, depth: number): unknown => {
    if (++nodes > 50_000 || depth > 32) rejectContribution(code)
    if (typeof value === "string") return text(value)
    if (value === null || typeof value === "boolean") return value
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value !== "object" || value === null || isProxy(value) || ancestors.has(value)) rejectContribution(code)
    ancestors.add(value)
    const keys = ownKeys(value), proto = getPrototype(value)
    if (keys.length > 20_001) rejectContribution(code)
    let result: unknown
    if (isArray(value)) {
      if (proto !== arrayPrototype) rejectContribution(code)
      const length = getDescriptor(value, "length")?.value as unknown
      if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > 20_000 || keys.length !== length + 1) rejectContribution(code)
      const array: unknown[] = []
      for (let i = 0; i < length; i++) {
        const d = getDescriptor(value, String(i))
        if (!d || !hasOwn(d, "value") || d.enumerable !== true) rejectContribution(code)
        array.push(visit(d.value, depth + 1))
      }
      result = freeze(array)
    } else {
      if (proto !== objectPrototype && proto !== null) rejectContribution(code)
      const record = create(null) as Record<string, unknown>
      for (const key of keys) {
        if (typeof key !== "string") rejectContribution(code)
        text(key)
        const d = getDescriptor(value, key)
        if (!d || !hasOwn(d, "value") || d.enumerable !== true) rejectContribution(code)
        define(record, key, { value: visit(d.value, depth + 1), enumerable: true })
      }
      result = freeze(record)
    }
    ancestors.delete(value)
    return result
  }
  return visit(input, 0)
}

function exactVersion(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 256) return false
  const parsed = parseSemver(value, { loose: false })
  return parsed !== null && parsed.version + (parsed.build.length ? "+" + parsed.build.join(".") : "") === value
}
function validId(value: unknown): value is string { return typeof value === "string" && value.length >= 1 && value.length <= 128 && ID.test(value) }
function relativePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && byteLength(value) <= 4096 && value.normalize("NFC") === value
    && !CONTROL.test(value) && !value.includes("\\") && !value.includes(":") && !value.startsWith("/")
    && value.split("/").every(part => part !== "" && part !== "." && part !== "..")
}
export function readInstalledContributionOwner(value: unknown): InstalledContributionOwner {
  const record = readContributionRecord(value, ["id", "version", "extensionRoot"], [], PROVENANCE)
  if (typeof record.id !== "string" || byteLength(record.id) > 255 || !OWNER_ID.test(record.id) || !exactVersion(record.version)
    || typeof record.extensionRoot !== "string" || byteLength(record.extensionRoot) > 4096 || CONTROL.test(record.extensionRoot) || !path.isAbsolute(record.extensionRoot)) rejectContribution(PROVENANCE)
  return freeze({ id: record.id, version: record.version, extensionRoot: record.extensionRoot })
}
export function parseContributionRegistryRange(value: unknown): Readonly<{ min: bigint; max: bigint }> {
  const code = "provider.registry.range_malformed" as const
  const record = readContributionRecord(value, ["min", "max"], [], code)
  const read = (raw: unknown): bigint => {
    if (typeof raw !== "string" || raw.length > 64) rejectContribution(code)
    const match = RANGE.exec(raw)
    if (!match) rejectContribution(code)
    return BigInt(match[1])
  }
  const min = read(record.min), max = read(record.max)
  if (min > max) rejectContribution(code)
  return freeze({ min, max })
}

export function validateContributionManifest(value: unknown, installedValue: InstalledContributionOwner): Readonly<WorkflowContributionManifest> {
  const installed = readInstalledContributionOwner(installedValue)
  const data = snapshotData(value, MANIFEST)
  const root = readContributionRecord(data, ROOT_FIELDS, ["agent_provider"], MANIFEST)
  if (root.schema_version !== "workflow-contributions/v1") rejectContribution(MANIFEST)
  const owner = readContributionRecord(root.owner, ["id", "version"], [], MANIFEST)
  if (typeof owner.id !== "string" || byteLength(owner.id) > 255 || !OWNER_ID.test(owner.id) || !exactVersion(owner.version)) rejectContribution(MANIFEST)
  if (owner.id !== installed.id || owner.version !== installed.version) rejectContribution(PROVENANCE)
  parseContributionRegistryRange(root.registry_api)
  const ids = new Set<string>(), versions = new Set<string>()
  const declaration = (raw: unknown, key: "id" | "type", isFile: boolean) => {
    const r = readContributionRecord(raw, [key, isFile ? "path" : "contract_version"], [], MANIFEST)
    const id = r[key]
    if (!validId(id) || ids.has(id)) rejectContribution(MANIFEST)
    ids.add(id)
    if (isFile) { if (!relativePath(r.path)) rejectContribution(MANIFEST) }
    else {
      const version = r.contract_version
      if (typeof version !== "string" || version.length > 256 || !CONTRACT.test(version) || versions.has(version)) rejectContribution(MANIFEST)
      versions.add(version)
    }
  }
  for (const [name, key, file] of [
    ["action_providers", "id", false], ["preflight_checks", "id", false], ["result_sinks", "type", false],
    ["workflow_templates", "id", true], ["schemas", "id", true]
  ] as const) {
    const list = root[name]
    if (!isArray(list)) rejectContribution(MANIFEST)
    for (const item of list) declaration(item, key, file)
  }
  if (hasOwn(root, "agent_provider")) declaration(root.agent_provider, "id", false)
  return data as Readonly<WorkflowContributionManifest>
}
