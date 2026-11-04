import * as fs from "node:fs"
import * as path from "node:path"

export const MAX_PUBLIC_PATH_UTF8_BYTES = 4096
export type PortablePathPlatform = string
export type PhysicalPathExpectedType = "file" | "directory"
export interface CanonicalPhysicalPath {
  readonly path: string
  readonly existing_ancestor: string
  readonly exists: boolean
}
export interface PhysicalContainedPath {
  readonly root_path: string
  readonly path: string
  readonly relative_path: string
  readonly exists: boolean
}
export interface CanonicalizePhysicalPathOptions {
  readonly label?: string
  readonly mustExist?: boolean
  readonly rejectLinks?: boolean
  readonly expectedType?: PhysicalPathExpectedType
}
export interface ResolvePhysicalContainedPathInput {
  readonly rootPath: string
  readonly candidatePath: string
  readonly allowAbsolute?: boolean
  readonly mustExist?: boolean
  readonly expectedType?: PhysicalPathExpectedType
}
export interface SharedPathPolicyError extends Error {
  readonly code: "path_policy_invalid" | "path_policy_device" | "path_policy_drive_relative"
    | "path_policy_absolute" | "path_policy_escape" | "path_policy_symlink"
    | "path_policy_unavailable" | "path_policy_not_directory" | "path_policy_not_file"
}
export class PathPolicyError extends Error implements SharedPathPolicyError {
  readonly code: SharedPathPolicyError["code"]
  constructor(code: SharedPathPolicyError["code"], message: string) {
    super(message)
    this.name = "PathPolicyError"
    this.code = code
  }
}

type Kind = "relative" | "posix" | "drive" | "unc"
type Parsed = { readonly value: string; readonly kind: Kind; readonly segments: readonly string[] }
function fail(code: SharedPathPolicyError["code"], label = "path"): never {
  throw new PathPolicyError(code, label + " rejected by physical path policy")
}
function hasInvalidSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true
  }
  return false
}
function checkedText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum
    || Buffer.byteLength(value, "utf8") > maximum || /[\u0000-\u001f\u007f-\u009f]/u.test(value)
    || value.trim() !== value || hasInvalidSurrogate(value) || value.normalize("NFC") !== value) {
    fail("path_policy_invalid", label)
  }
  return value
}
function labelValue(value: unknown): string {
  return value === undefined ? "path" : checkedText(value, 256, "label")
}
function ownData(value: unknown, required: readonly string[], optional: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("path_policy_invalid")
  try {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) fail("path_policy_invalid")
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const allowed = new Set([...required, ...optional])
    const keys = Reflect.ownKeys(descriptors)
    if (keys.some(key => typeof key !== "string" || !allowed.has(key))
      || required.some(key => !Object.hasOwn(descriptors, key))) fail("path_policy_invalid")
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    for (const key of keys) {
      if (typeof key !== "string") fail("path_policy_invalid")
      const descriptor = descriptors[key]
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail("path_policy_invalid")
      result[key] = descriptor.value
    }
    return result
  } catch {
    return fail("path_policy_invalid")
  }
}
function optionalBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (typeof value !== "boolean") fail("path_policy_invalid")
  return value
}
function expectedType(value: unknown): PhysicalPathExpectedType | undefined {
  if (value !== undefined && value !== "file" && value !== "directory") fail("path_policy_invalid")
  return value
}
function segment(value: string, label: string): void {
  if (value === "." || value === "..") fail("path_policy_escape", label)
  if (!value || value.trim() !== value || /[<>:"|?*]/u.test(value) || value.endsWith(".")
    || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(value)) {
    fail("path_policy_invalid", label)
  }
}
function parse(value: unknown, label: string): Parsed {
  const raw = checkedText(value, MAX_PUBLIC_PATH_UTF8_BYTES, label)
  const normalized = raw.replace(/\\/gu, "/")
  if (normalized.startsWith("//?/") || normalized.startsWith("//./") || normalized.startsWith("/??/")) {
    fail("path_policy_device", label)
  }
  let kind: Kind = "relative"
  let remainder = normalized
  if (/^[a-z]:/iu.test(normalized)) {
    if (normalized[2] !== "/") fail("path_policy_drive_relative", label)
    kind = "drive"
    remainder = normalized.slice(3)
  } else if (normalized.startsWith("//")) {
    const match = /^\/\/([^/]+)\/([^/]+)(?:\/(.*))?$/u.exec(normalized)
    if (!match) fail("path_policy_invalid", label)
    segment(match[1], label)
    segment(match[2], label)
    kind = "unc"
    remainder = match[3] ?? ""
  } else if (normalized.startsWith("/")) {
    // A single backslash is a Windows root-relative path, not a POSIX absolute.
    if (raw.startsWith("\\")) fail("path_policy_absolute", label)
    kind = "posix"
    remainder = normalized.slice(1)
  }
  const segments = remainder.length === 0 && kind !== "relative" ? [] : remainder.split("/")
  for (const part of segments) segment(part, label)
  return { value: raw, kind, segments }
}

/** Validate workspace-relative syntax before normalization; absolute and .. paths fail. */
export function normalizeWorkspaceRelativePath(value: string, label?: string): string {
  const tag = labelValue(label), parsed = parse(value, tag)
  if (parsed.kind !== "relative") fail("path_policy_absolute", tag)
  return parsed.segments.join("/")
}

/** Lexical portable containment only: this does not verify filesystem identity. */
export function isPortablePathContained(root: string, target: string, platform: PortablePathPlatform = process.platform): boolean {
  try {
    if (typeof platform !== "string") return false
    const a = parse(root, "rootPath"), b = parse(target, "targetPath")
    const windows = platform === "win32" || a.kind === "drive" || a.kind === "unc" || b.kind === "drive" || b.kind === "unc"
    if (windows) {
      if (!["drive", "unc"].includes(a.kind) || a.kind !== b.kind) return false
    } else if (a.kind !== "posix" || b.kind !== "posix") return false
    const implementation = windows ? path.win32 : path.posix
    const left = implementation.normalize(a.value), right = implementation.normalize(b.value)
    const relative = implementation.relative(windows ? left.toLowerCase() : left, windows ? right.toLowerCase() : right)
    return relative === "" || (relative !== ".." && !relative.startsWith(".." + implementation.sep) && !implementation.isAbsolute(relative))
  } catch {
    return false
  }
}

function hostAbsolute(parsed: Parsed, relativeRoot?: string): string {
  if (parsed.kind === "relative") return path.resolve(relativeRoot ?? process.cwd(), ...parsed.segments)
  if (process.platform === "win32" ? parsed.kind !== "drive" && parsed.kind !== "unc" : parsed.kind !== "posix") {
    fail("path_policy_absolute")
  }
  return path.resolve(parsed.value)
}
function sameHostPath(left: string, right: string): boolean {
  const a = path.normalize(left).replace(/[\\/]+$/u, ""), b = path.normalize(right).replace(/[\\/]+$/u, "")
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b
}
function hostContained(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative))
}
function statType(stat: fs.Stats, required: PhysicalPathExpectedType | undefined, label: string): void {
  if (required === "directory" && !stat.isDirectory()) fail("path_policy_not_directory", label)
  if (required === "file" && !stat.isFile()) fail("path_policy_not_file", label)
}
function io<T>(operation: () => T, label: string): T {
  try { return operation() } catch (error) {
    if (error instanceof PathPolicyError) throw error
    return fail("path_policy_unavailable", label)
  }
}

/** Observes existing components and reconstructs ENOENT suffixes without creating them. */
export function canonicalizePhysicalPathSync(value: string, options?: CanonicalizePhysicalPathOptions): CanonicalPhysicalPath {
  const data = ownData(options === undefined ? {} : options, [], ["label", "mustExist", "rejectLinks", "expectedType"])
  const label = labelValue(data.label), mustExist = optionalBoolean(data.mustExist, true)
  const rejectLinks = optionalBoolean(data.rejectLinks, true), required = expectedType(data.expectedType)
  const absolute = hostAbsolute(parse(value, label)), parsedRoot = path.parse(absolute).root
  const parts = absolute.slice(parsedRoot.length).split(path.sep).filter(Boolean)
  let current = parsedRoot, existing = parsedRoot, physical = parsedRoot
  let previous: fs.Stats | undefined
  for (let i = -1; i < parts.length; i++) {
    if (i >= 0) {
      if (!previous?.isDirectory()) fail("path_policy_not_directory", label)
      current = path.join(current, parts[i])
    }
    let stat: fs.Stats
    try {
      stat = fs.lstatSync(current)
    } catch (error) {
      const code = error && typeof error === "object" ? Object.getOwnPropertyDescriptor(error, "code")?.value : undefined
      if (code !== "ENOENT" || i < 0 || mustExist) fail("path_policy_unavailable", label)
      if (!previous?.isDirectory()) fail("path_policy_not_directory", label)
      return Object.freeze({ path: path.join(physical, ...parts.slice(i)), existing_ancestor: physical, exists: false })
    }
    if (rejectLinks && stat.isSymbolicLink()) fail("path_policy_symlink", label)
    const real = io(() => fs.realpathSync.native(current), label)
    if (rejectLinks && !sameHostPath(current, real)) fail("path_policy_symlink", label)
    previous = stat.isSymbolicLink() ? io(() => fs.statSync(current), label) : stat
    existing = current
    physical = real
  }
  // existing is intentionally named separately from the physical observation.
  if (!sameHostPath(existing, absolute) || !previous) fail("path_policy_unavailable", label)
  statType(previous, required, label)
  return Object.freeze({ path: physical, existing_ancestor: physical, exists: true })
}

/** Resolve a governed target: both the root and every existing target component reject aliases. */
export function resolvePhysicalContainedPathSync(input: ResolvePhysicalContainedPathInput): PhysicalContainedPath {
  const data = ownData(input, ["rootPath", "candidatePath"], ["allowAbsolute", "mustExist", "expectedType"])
  const rootInput = parse(data.rootPath, "rootPath"), candidateInput = parse(data.candidatePath, "candidatePath")
  const allowAbsolute = optionalBoolean(data.allowAbsolute, true), mustExist = optionalBoolean(data.mustExist, true)
  const required = expectedType(data.expectedType)
  if (!allowAbsolute && candidateInput.kind !== "relative") fail("path_policy_absolute", "candidatePath")
  const root = hostAbsolute(rootInput), target = hostAbsolute(candidateInput, root)
  if (!hostContained(root, target)) fail("path_policy_escape", "candidatePath")
  const actualRoot = canonicalizePhysicalPathSync(root, { label: "rootPath", expectedType: "directory" })
  const actual = canonicalizePhysicalPathSync(target, { label: "candidatePath", mustExist, ...(required ? { expectedType: required } : {}) })
  if (!hostContained(actualRoot.path, actual.path) || !hostContained(actualRoot.path, actual.existing_ancestor)) {
    fail("path_policy_escape", "candidatePath")
  }
  return Object.freeze({ root_path: actualRoot.path, path: actual.path, relative_path: path.relative(actualRoot.path, actual.path).split(path.sep).join("/") || ".", exists: actual.exists })
}
export async function resolvePhysicalContainedPath(input: ResolvePhysicalContainedPathInput): Promise<PhysicalContainedPath> {
  return resolvePhysicalContainedPathSync(input)
}

/** Follow the active file for ownership selection only; candidate roots still reject links. */
export async function selectDeepestPhysicalRoot(roots: readonly string[], filePath: string): Promise<string | undefined> {
  try {
    if (!Array.isArray(roots)) return undefined
    const file = canonicalizePhysicalPathSync(filePath, { mustExist: false, rejectLinks: false })
    const candidates: { original: string; path: string; depth: number }[] = []
    for (const original of roots) {
      try {
        const root = canonicalizePhysicalPathSync(original, { expectedType: "directory" })
        if (hostContained(root.path, file.path)) candidates.push({ original, path: root.path, depth: root.path.slice(path.parse(root.path).root.length).split(path.sep).filter(Boolean).length })
      } catch { /* An invalid candidate root conveys no ownership. */ }
    }
    candidates.sort((a, b) => b.depth - a.depth || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    return candidates[0]?.original
  } catch {
    return undefined
  }
}
