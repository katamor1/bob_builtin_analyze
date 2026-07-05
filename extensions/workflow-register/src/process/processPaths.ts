import * as path from "path"

const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:[\\/]/

export function isSafeWorkspaceRelativePath(value: string): boolean {
  return validateWorkspaceRelativePath(value).ok
}

export function validateWorkspaceRelativePath(value: unknown): { ok: true; path: string } | { ok: false; reason: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, reason: "path must be a non-empty string" }
  }
  if (value.includes("\0")) {
    return { ok: false, reason: "path must not contain NUL bytes" }
  }
  const normalizedSlashes = value.replace(/\\/g, "/")
  if (
    normalizedSlashes.startsWith("/") ||
    normalizedSlashes.startsWith("//") ||
    WINDOWS_DRIVE_PREFIX.test(value) ||
    path.win32.isAbsolute(value) ||
    path.posix.isAbsolute(normalizedSlashes)
  ) {
    return { ok: false, reason: "path must be relative to the workspace" }
  }
  const segments = normalizedSlashes.split("/")
  if (segments.some((segment) => segment === "..")) {
    return { ok: false, reason: "path must not contain .. segments" }
  }
  if (segments.some((segment) => segment.trim().length === 0 || segment === ".")) {
    return { ok: false, reason: "path must not contain empty or . segments" }
  }
  const normalized = path.posix.normalize(normalizedSlashes)
  if (normalized === "." || normalized.startsWith("../") || normalized === "..") {
    return { ok: false, reason: "path must resolve inside the workspace" }
  }
  return { ok: true, path: normalized }
}

export function describeUnsafeWorkspacePath(label: string, value: unknown): string | undefined {
  const result = validateWorkspaceRelativePath(value)
  if (result.ok) return undefined
  return `${label}: unsafe workspace path (${result.reason})`
}
