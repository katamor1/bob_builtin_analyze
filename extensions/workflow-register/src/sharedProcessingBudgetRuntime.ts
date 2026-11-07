import * as fs from "node:fs"
import * as path from "node:path"
import { createHash } from "node:crypto"
import type * as Runtime from "../../../packages/processing-budget-runtime/out/pathPolicy"

const compiledNames = ["pathPolicy.d.ts", "pathPolicy.js", "pathPolicy.js.map"] as const
const runtimeNames = ["MAX_PUBLIC_PATH_UTF8_BYTES", "PathPolicyError", "canonicalizePhysicalPathSync", "isPortablePathContained", "normalizeWorkspaceRelativePath", "resolvePhysicalContainedPath", "resolvePhysicalContainedPathSync", "selectDeepestPhysicalRoot"] as const
function buildRequired(): never { throw new Error("Processing path runtime build required; run npm ci and npm run compile in this extension and the shared package.") }
function noAlias(file: string): void {
  const absolute = path.resolve(file), root = path.parse(absolute).root
  let current = root
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    if (fs.lstatSync(current).isSymbolicLink()) buildRequired()
  }
}
function loadPathRuntime(): typeof Runtime {
  try {
    const directory = path.join(__dirname, "shared-processing-budget-runtime")
    noAlias(directory)
    const names = fs.readdirSync(directory).sort()
    if (names.some(name => name !== "manifest.json" && !(compiledNames as readonly string[]).includes(name))
      || !names.includes("pathPolicy.js") || !names.includes("manifest.json")) buildRequired()
    for (const name of names) {
      const file = path.join(directory, name)
      noAlias(file)
      if (!fs.statSync(file).isFile()) buildRequired()
    }
    const manifest: unknown = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"))
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) buildRequired()
    const data = manifest as { schemaVersion?: unknown; profile?: unknown; sourceInputDigest?: unknown; payload?: unknown }
    if (JSON.stringify(Object.keys(data).sort()) !== JSON.stringify(["payload", "profile", "schemaVersion", "sourceInputDigest"])
      || data.schemaVersion !== "bob-builtin-analyze/processing-runtime-path-copy/v1" || data.profile !== "path-only"
      || typeof data.sourceInputDigest !== "string" || !/^[a-f0-9]{64}$/.test(data.sourceInputDigest)
      || !Array.isArray(data.payload) || data.payload.length !== 3) buildRequired()
    for (let index = 0; index < compiledNames.length; index++) {
      const row: unknown = data.payload[index]
      if (!row || typeof row !== "object" || Array.isArray(row)) buildRequired()
      const item = row as { path?: unknown; bytes?: unknown; sha256?: unknown }
      if (JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(["bytes", "path", "sha256"])
        || item.path !== compiledNames[index] || typeof item.bytes !== "number" || !Number.isSafeInteger(item.bytes) || item.bytes <= 0
        || typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256)) buildRequired()
      if (names.includes(compiledNames[index])) {
        const bytes = fs.readFileSync(path.join(directory, compiledNames[index]))
        if (bytes.length !== item.bytes || createHash("sha256").update(bytes).digest("hex") !== item.sha256) buildRequired()
      }
    }
    const raw: unknown = require(path.join(directory, "pathPolicy.js"))
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || JSON.stringify(Object.keys(raw).sort()) !== JSON.stringify([...runtimeNames].sort())) buildRequired()
    const api = raw as typeof Runtime
    if (api.MAX_PUBLIC_PATH_UTF8_BYTES !== 4096) buildRequired()
    for (const name of runtimeNames) if (name !== "MAX_PUBLIC_PATH_UTF8_BYTES" && typeof api[name] !== "function") buildRequired()
    return api
  } catch { return buildRequired() }
}
const runtime = loadPathRuntime()
export const MAX_PUBLIC_PATH_UTF8_BYTES = runtime.MAX_PUBLIC_PATH_UTF8_BYTES
export const PathPolicyError = runtime.PathPolicyError
export const normalizeWorkspaceRelativePath = runtime.normalizeWorkspaceRelativePath
export const isPortablePathContained = runtime.isPortablePathContained
export const canonicalizePhysicalPathSync = runtime.canonicalizePhysicalPathSync
export const resolvePhysicalContainedPathSync = runtime.resolvePhysicalContainedPathSync
export const resolvePhysicalContainedPath = runtime.resolvePhysicalContainedPath
export const selectDeepestPhysicalRoot = runtime.selectDeepestPhysicalRoot
export type SharedPhysicalContainedPath = Runtime.PhysicalContainedPath
export type SharedCanonicalPhysicalPath = Runtime.CanonicalPhysicalPath
export type SharedCanonicalizePhysicalPathOptions = Runtime.CanonicalizePhysicalPathOptions
export type SharedResolvePhysicalContainedPathInput = Runtime.ResolvePhysicalContainedPathInput
export type SharedPhysicalPathExpectedType = Runtime.PhysicalPathExpectedType
export type SharedPortablePathPlatform = Runtime.PortablePathPlatform
export type SharedPathPolicyError = Runtime.SharedPathPolicyError
