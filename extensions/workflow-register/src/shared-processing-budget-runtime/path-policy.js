"use strict"

const fs = require("node:fs")
const path = require("node:path")

const MAX_PUBLIC_PATH_UTF8_BYTES = 4096
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u
const WINDOWS_RESERVED_CHARACTERS = /[<>:"|?*]/u
const WINDOWS_RESERVED_DEVICE_NAME = /^(?:con|prn|aux|nul|com(?:[1-9]|[¹²³])|lpt(?:[1-9]|[¹²³]))(?:\..*)?$/iu

class PathPolicyError extends Error {
  constructor(code, message) {
    super(message)
    this.name = "PathPolicyError"
    this.code = code
  }
}

function normalizeWorkspaceRelativePath(value, label = "path") {
  const input = checkedPathString(value, label)
  const kind = portablePathKind(input)
  if (kind === "device") throw pathError("path_policy_device", `${label} must not use a device path`)
  if (kind === "drive-relative") throw pathError("path_policy_drive_relative", `${label} must not use a drive-relative path`)
  if (kind !== "relative") throw pathError("path_policy_absolute", `${label} must be workspace-relative`)

  const normalizedSlashes = input.replace(/\\/g, "/")
  const segments = normalizedSlashes.split("/")
  if (segments.some((segment) => segment.length === 0)) {
    throw pathError("path_policy_invalid", `${label} contains an empty path component`)
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw pathError("path_policy_escape", `${label} contains dot or traversal components`)
  }
  if (segments.some((segment) => segment.trim() !== segment)) {
    throw pathError("path_policy_invalid", `${label} contains component edge whitespace`)
  }
  for (const segment of segments) assertPortableSegment(segment, label)
  const normalized = path.posix.normalize(normalizedSlashes)
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw pathError("path_policy_escape", `${label} escapes its workspace`)
  }
  return normalized
}

function isPortablePathContained(rootValue, targetValue, platform = process.platform) {
  const root = checkedPathString(rootValue, "rootPath")
  const target = checkedPathString(targetValue, "targetPath")
  const rootKind = portablePathKind(root)
  const targetKind = portablePathKind(target)
  if (rootKind === "device" || targetKind === "device") {
    throw pathError("path_policy_device", "device paths are not allowed")
  }
  if (rootKind === "drive-relative" || targetKind === "drive-relative") {
    throw pathError("path_policy_drive_relative", "drive-relative paths are not allowed")
  }

  const windows = platform === "win32" || isWindowsAbsoluteKind(rootKind) || isWindowsAbsoluteKind(targetKind)
  const implementation = windows ? path.win32 : path.posix
  if (windows) {
    if (!isWindowsAbsoluteKind(rootKind) || !isWindowsAbsoluteKind(targetKind)) return false
  } else if (rootKind !== "posix-absolute" || targetKind !== "posix-absolute") {
    return false
  }

  const normalizedRoot = implementation.normalize(root)
  const normalizedTarget = implementation.normalize(target)
  const comparableRoot = windows ? normalizedRoot.toLowerCase() : normalizedRoot
  const comparableTarget = windows ? normalizedTarget.toLowerCase() : normalizedTarget
  const relative = implementation.relative(comparableRoot, comparableTarget)
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${implementation.sep}`) && !implementation.isAbsolute(relative))
}

function canonicalizePhysicalPathSync(value, options = {}) {
  const label = options.label ?? "path"
  const input = checkedPathString(value, label)
  const absolutePath = resolveHostPathInput(input, label)
  if (options.rejectLinks !== false) rejectLinkComponentsSync(absolutePath, options.mustExist !== false)
  let realPath
  try {
    realPath = fs.realpathSync.native ? fs.realpathSync.native(absolutePath) : fs.realpathSync(absolutePath)
  } catch (error) {
    if (options.mustExist === false) {
      const ancestor = nearestExistingAncestorSync(absolutePath, options.rejectLinks !== false)
      if (!ancestor) throw pathError("path_policy_unavailable", `${options.label ?? "path"} has no existing ancestor`)
      const suffix = path.relative(ancestor.path, absolutePath)
      return Object.freeze({
        path: path.resolve(ancestor.realPath, suffix),
        existing_ancestor: ancestor.realPath,
        exists: false
      })
    }
    throw pathError("path_policy_unavailable", `${options.label ?? "path"} is unavailable`)
  }

  let stat
  try { stat = fs.statSync(realPath) } catch { throw pathError("path_policy_unavailable", `${options.label ?? "path"} is unavailable`) }
  if (options.expectedType === "directory" && !stat.isDirectory()) {
    throw pathError("path_policy_not_directory", `${options.label ?? "path"} is not a directory`)
  }
  if (options.expectedType === "file" && !stat.isFile()) {
    throw pathError("path_policy_not_file", `${options.label ?? "path"} is not a regular file`)
  }
  return Object.freeze({ path: realPath, existing_ancestor: realPath, exists: true })
}

function resolvePhysicalContainedPathSync(input) {
  if (typeof input !== "object" || input === null) throw pathError("path_policy_invalid", "contained path input must be an object")
  const rootInput = checkedPathString(input.rootPath, "rootPath")
  const root = canonicalizePhysicalPathSync(rootInput, {
    label: "rootPath",
    mustExist: true,
    rejectLinks: true,
    expectedType: "directory"
  })

  const candidateInput = checkedPathString(input.candidatePath, "candidatePath")
  const candidateKind = portablePathKind(candidateInput)
  if (candidateKind === "device") throw pathError("path_policy_device", "candidatePath must not use a device path")
  if (candidateKind === "drive-relative") throw pathError("path_policy_drive_relative", "candidatePath must not use a drive-relative path")
  let lexicalCandidate
  if (candidateKind === "relative") {
    lexicalCandidate = path.resolve(root.path, ...normalizeWorkspaceRelativePath(candidateInput, "candidatePath").split("/"))
  } else {
    if (input.allowAbsolute === false) throw pathError("path_policy_absolute", "candidatePath must be workspace-relative")
    lexicalCandidate = resolveHostAbsolutePath(candidateInput, candidateKind, "candidatePath")
  }
  if (!hostContained(root.path, lexicalCandidate)) {
    throw pathError("path_policy_escape", "candidatePath escapes rootPath")
  }

  const candidate = canonicalizePhysicalPathSync(lexicalCandidate, {
    label: "candidatePath",
    mustExist: input.mustExist !== false,
    rejectLinks: true,
    expectedType: input.expectedType
  })
  if (!hostContained(root.path, candidate.existing_ancestor) || !hostContained(root.path, candidate.path)) {
    throw pathError("path_policy_escape", "candidatePath resolves outside rootPath")
  }
  const relative = path.relative(root.path, candidate.path)
  return Object.freeze({
    root_path: root.path,
    path: candidate.path,
    relative_path: relative === "" ? "." : relative.split(path.sep).join("/"),
    exists: candidate.exists
  })
}

async function resolvePhysicalContainedPath(input) {
  return resolvePhysicalContainedPathSync(input)
}

async function selectDeepestPhysicalRoot(rootValues, filePathValue) {
  if (!Array.isArray(rootValues)) throw pathError("path_policy_invalid", "roots must be an array")
  const fileInput = checkedPathString(filePathValue, "filePath")
  const absoluteFile = resolveHostPathInput(fileInput, "filePath")
  let physicalFile
  try {
    physicalFile = fs.realpathSync.native ? fs.realpathSync.native(absoluteFile) : fs.realpathSync(absoluteFile)
  } catch {
    const ancestor = nearestExistingAncestorSync(absoluteFile, false)
    if (!ancestor) return undefined
    physicalFile = path.resolve(ancestor.realPath, path.relative(ancestor.path, absoluteFile))
  }

  const candidates = []
  for (const value of rootValues) {
    try {
      const root = canonicalizePhysicalPathSync(value, {
        label: "workspace root",
        mustExist: true,
        rejectLinks: true,
        expectedType: "directory"
      })
      if (hostContained(root.path, physicalFile)) candidates.push({ original: value, physical: root.path })
    } catch {
      // Invalid or symlinked roots are not eligible for automatic selection.
    }
  }
  candidates.sort((left, right) => physicalDepth(right.physical) - physicalDepth(left.physical)
    || compareText(left.physical, right.physical))
  return candidates[0]?.original
}

function nearestExistingAncestorSync(value, rejectLinks) {
  let current = value
  while (true) {
    try {
      if (rejectLinks) rejectLinkComponentsSync(current, true)
      const realPath = fs.realpathSync.native ? fs.realpathSync.native(current) : fs.realpathSync(current)
      return { path: current, realPath }
    } catch (error) {
      if (error instanceof PathPolicyError && error.code === "path_policy_symlink") throw error
      const parent = path.dirname(current)
      if (parent === current) return undefined
      current = parent
    }
  }
}

function rejectLinkComponentsSync(absolutePath, requireLeaf) {
  const parsed = path.parse(absolutePath)
  let current = parsed.root
  const segments = absolutePath.slice(parsed.root.length).split(path.sep).filter(Boolean)
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index])
    let stat
    try { stat = fs.lstatSync(current) } catch (error) {
      if (!requireLeaf || index < segments.length - 1) return
      throw pathError("path_policy_unavailable", "path component is unavailable")
    }
    if (stat.isSymbolicLink()) throw pathError("path_policy_symlink", "path contains a symbolic link or reparse point")
    // Junctions and other reparse aliases can surface as directories rather than
    // symbolic links. A realpath change at an existing component is therefore
    // also treated as an alias and rejected.
    let real
    try { real = fs.realpathSync.native ? fs.realpathSync.native(current) : fs.realpathSync(current) } catch {
      throw pathError("path_policy_unavailable", "path component is unavailable")
    }
    if (!sameHostPath(current, real)) throw pathError("path_policy_symlink", "path contains a symbolic link or reparse point")
  }
}

function portablePathKind(value) {
  const normalized = value.replace(/\//g, "\\")
  if (/^(?:\\\\[?.]\\|\\[?][?]\\)/u.test(normalized)) return "device"
  if (/^[A-Za-z]:(?![\\/])/u.test(value)) return "drive-relative"
  if (/^[A-Za-z]:[\\/]/u.test(value)) return "drive-absolute"
  if (/^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/u.test(value)) return "unc"
  if (value.startsWith("/")) return "posix-absolute"
  return "relative"
}

function isWindowsAbsoluteKind(kind) {
  return kind === "drive-absolute" || kind === "unc"
}

function resolveHostPathInput(value, label) {
  const kind = portablePathKind(value)
  if (kind === "device") throw pathError("path_policy_device", `${label} must not use a device path`)
  if (kind === "drive-relative") throw pathError("path_policy_drive_relative", `${label} must not use a drive-relative path`)
  if (kind === "relative") {
    return path.resolve(...normalizeWorkspaceRelativePath(value, label).split("/"))
  }
  return resolveHostAbsolutePath(value, kind, label)
}

function resolveHostAbsolutePath(value, kind, label) {
  const hostKindAllowed = process.platform === "win32"
    ? isWindowsAbsoluteKind(kind)
    : kind === "posix-absolute"
  if (!hostKindAllowed) throw pathError("path_policy_absolute", `${label} is not an absolute path for this platform`)
  assertCanonicalAbsoluteComponents(value, kind, label)
  return path.resolve(value)
}

function assertCanonicalAbsoluteComponents(value, kind, label) {
  const implementation = isWindowsAbsoluteKind(kind) ? path.win32 : path.posix
  const root = implementation.parse(value).root
  if (!root) throw pathError("path_policy_absolute", `${label} is not absolute`)
  const remainder = value.slice(root.length)
  if (remainder.length === 0) return
  const segments = remainder.split(/[\\/]/u)
  if (segments.some((segment) => segment.length === 0)) {
    throw pathError("path_policy_invalid", `${label} contains an empty path component`)
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw pathError("path_policy_escape", `${label} contains dot or traversal components`)
  }
  if (segments.some((segment) => segment.trim() !== segment)) {
    throw pathError("path_policy_invalid", `${label} contains component edge whitespace`)
  }
  for (const segment of segments) assertPortableSegment(segment, label)
}

function assertPortableSegment(segment, label) {
  if (WINDOWS_RESERVED_CHARACTERS.test(segment)) {
    throw pathError("path_policy_invalid", `${label} contains a Windows-reserved character`)
  }
  if (segment.endsWith(".")) {
    throw pathError("path_policy_invalid", `${label} contains a component ending in a period`)
  }
  if (WINDOWS_RESERVED_DEVICE_NAME.test(segment)) {
    throw pathError("path_policy_invalid", `${label} contains a Windows-reserved device name`)
  }
}

function checkedPathString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw pathError("path_policy_invalid", `${label} is empty`)
  if (Buffer.byteLength(value, "utf8") > MAX_PUBLIC_PATH_UTF8_BYTES) throw pathError("path_policy_invalid", `${label} is too long`)
  if (CONTROL_CHARACTERS.test(value)) throw pathError("path_policy_invalid", `${label} contains control characters`)
  if (value.trim() !== value) throw pathError("path_policy_invalid", `${label} contains outer whitespace`)
  if (value.normalize("NFC") !== value) throw pathError("path_policy_invalid", `${label} must use NFC normalization`)
  return value
}

function hostContained(root, target) {
  const relative = path.relative(root, target)
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function sameHostPath(left, right) {
  const normalizedLeft = path.resolve(left)
  const normalizedRight = path.resolve(right)
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight
}

function physicalDepth(value) {
  return value.split(path.sep).filter(Boolean).length
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function pathError(code, message) {
  return new PathPolicyError(code, message)
}

module.exports = Object.freeze({
  MAX_PUBLIC_PATH_UTF8_BYTES,
  PathPolicyError,
  canonicalizePhysicalPathSync,
  isPortablePathContained,
  normalizeWorkspaceRelativePath,
  resolvePhysicalContainedPath,
  resolvePhysicalContainedPathSync,
  selectDeepestPhysicalRoot
})
