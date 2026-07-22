"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")

const WORKFLOW_PATHSPEC = ":(glob)**/WORKFLOW.md"
const CONTRIBUTION_MANIFEST_PATHSPEC = ":(glob)**/contracts/workflow-contributions.json"

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function parseNulDelimitedPaths(output) {
  if (!Buffer.isBuffer(output)) throw new Error("git ls-files output must be a Buffer")
  const paths = []
  let offset = 0
  for (let index = 0; index < output.length; index += 1) {
    if (output[index] !== 0) continue
    if (index === offset) throw new Error("git ls-files emitted an empty path")
    paths.push(output.subarray(offset, index).toString("utf8"))
    offset = index + 1
  }
  if (offset !== output.length) throw new Error("git ls-files output is not NUL-terminated")
  return paths
}

function gitTrackedPaths(repositoryRoot, pathspec) {
  const output = execFileSync("git", ["ls-files", "-z", "--", pathspec], {
    cwd: repositoryRoot,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024
  })
  return parseNulDelimitedPaths(output)
}

function normalizeWorkflowPath(value, { pathSeparator = "/" } = {}) {
  if (typeof value !== "string") throw new Error("workflow path must be a string")
  if (pathSeparator !== "/" && pathSeparator !== "\\") throw new Error("workflow path separator must be '/' or '\\'")
  const normalizedSeparators = pathSeparator === "\\" ? value.replace(/\\/g, "/") : value
  if (!normalizedSeparators || normalizedSeparators.includes("\0") || normalizedSeparators.startsWith("/") || /^[A-Za-z]:\//.test(normalizedSeparators)) {
    throw new Error(`workflow path '${value}' must be a normalized repository-relative POSIX path`)
  }
  const segments = normalizedSeparators.split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`workflow path '${value}' must be a normalized repository-relative POSIX path`)
  }
  if (segments.at(-1) !== "WORKFLOW.md") {
    throw new Error(`workflow path '${value}' must name WORKFLOW.md`)
  }
  return segments.join("/")
}

function normalizeManifestWorkflowPath(value, manifestPath) {
  if (typeof value === "string" && value.includes("\\")) {
    throw new Error(`${manifestPath}: workflow path '${value}' must be normalized with POSIX separators`)
  }
  const normalized = normalizeWorkflowPath(value)
  if (normalized !== value) {
    throw new Error(`${manifestPath}: workflow path '${value}' must be normalized with POSIX separators`)
  }
  return normalized
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

function validateTrackedRepositoryPath(repositoryRoot, repositoryPath, label) {
  if (typeof repositoryPath !== "string" || !repositoryPath || repositoryPath.includes("\0") || repositoryPath.startsWith("/") || /^[A-Za-z]:\//.test(repositoryPath)) {
    throw new Error(`${label} '${repositoryPath}' must be a normalized repository-relative POSIX path`)
  }
  const segments = repositoryPath.split("/")
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`${label} '${repositoryPath}' must be a normalized repository-relative POSIX path`)
  }
  const realRoot = fs.realpathSync(repositoryRoot)
  const candidate = path.resolve(realRoot, ...segments)
  if (!isInside(realRoot, candidate)) throw new Error(`${label} '${repositoryPath}' escapes repository root`)

  let current = realRoot
  for (const segment of segments) {
    current = path.join(current, segment)
    const entry = fs.lstatSync(current)
    if (entry.isSymbolicLink()) throw new Error(`${label} '${repositoryPath}' is symlinked`)
  }
  if (!fs.statSync(candidate).isFile()) throw new Error(`${label} '${repositoryPath}' is not a regular file`)
  if (!isInside(realRoot, fs.realpathSync(candidate))) throw new Error(`${label} '${repositoryPath}' escapes repository root`)
  return candidate
}

function validateTrackedWorkflowPath(repositoryRoot, workflowPath) {
  const normalized = normalizeWorkflowPath(workflowPath)
  validateTrackedRepositoryPath(repositoryRoot, normalized, "workflow path")
  return normalized
}

function discoverTrackedWorkflowPaths(repositoryRoot) {
  const paths = gitTrackedPaths(repositoryRoot, WORKFLOW_PATHSPEC).map((workflowPath) => validateTrackedWorkflowPath(repositoryRoot, workflowPath))
  return [...new Set(paths)].sort(comparePaths)
}

function discoverContributionManifests(repositoryRoot) {
  return gitTrackedPaths(repositoryRoot, CONTRIBUTION_MANIFEST_PATHSPEC)
    .sort(comparePaths)
    .map((manifestPath) => {
      const absolutePath = validateTrackedRepositoryPath(repositoryRoot, manifestPath, "manifest path")
      return { path: manifestPath, manifest: JSON.parse(fs.readFileSync(absolutePath, "utf8")) }
    })
}

function requireOwner(manifestPath, manifest) {
  const owner = manifest?.owner?.id
  if (typeof owner !== "string" || owner.trim() === "") throw new Error(`${manifestPath}: workflow classifications require a non-empty owner id`)
  return owner
}

function collectManifestRules(manifests) {
  const rules = new Map()
  for (const entry of manifests) {
    const manifestPath = entry?.path ?? "unknown manifest"
    const manifest = entry?.manifest
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error(`${manifestPath}: manifest must be an object`)
    const owner = requireOwner(manifestPath, manifest)
    if (!Array.isArray(manifest.workflow_claims) || !Array.isArray(manifest.workflow_exclusions)) {
      throw new Error(`${manifestPath}: workflow_claims and workflow_exclusions must be arrays`)
    }
    for (const claim of manifest.workflow_claims) {
      const workflowPath = normalizeManifestWorkflowPath(claim?.path, manifestPath)
      const role = claim?.role
      if (typeof role !== "string" || role.trim() === "") throw new Error(`${manifestPath}: claim '${workflowPath}' requires a role`)
      const pathRules = rules.get(workflowPath) ?? []
      pathRules.push({ path: workflowPath, kind: "claim", role, owner })
      rules.set(workflowPath, pathRules)
    }
    for (const exclusion of manifest.workflow_exclusions) {
      const workflowPath = normalizeManifestWorkflowPath(exclusion?.path, manifestPath)
      const reason = exclusion?.reason
      if (typeof reason !== "string" || reason.trim() === "") throw new Error(`${manifestPath}: exclusion '${workflowPath}' requires a meaningful reason`)
      const pathRules = rules.get(workflowPath) ?? []
      pathRules.push({ path: workflowPath, kind: "exclusion", reason, owner })
      rules.set(workflowPath, pathRules)
    }
  }
  return rules
}

function classifyTrackedWorkflows(repositoryRoot, workflowPaths, manifests) {
  if (!Array.isArray(workflowPaths)) throw new Error("workflow paths must be an array")
  const rules = collectManifestRules(manifests)
  const inventory = []
  const seen = new Set()
  for (const workflowPath of workflowPaths) {
    const normalized = validateTrackedWorkflowPath(repositoryRoot, workflowPath)
    if (seen.has(normalized)) throw new Error(`tracked workflow '${normalized}' was discovered more than once`)
    seen.add(normalized)
    const matches = rules.get(normalized) ?? []
    if (matches.length === 0) throw new Error(`tracked workflow '${normalized}' is unclassified`)
    if (matches.length !== 1) throw new Error(`tracked workflow '${normalized}' is classified more than once`)
    inventory.push(matches[0])
  }
  return inventory.sort((left, right) => comparePaths(left.path, right.path))
}

function createWorkflowInventory(repositoryRoot) {
  return classifyTrackedWorkflows(
    repositoryRoot,
    discoverTrackedWorkflowPaths(repositoryRoot),
    discoverContributionManifests(repositoryRoot)
  )
}

if (require.main === module) {
  const repositoryRoot = path.resolve(process.argv[2] ?? process.cwd())
  process.stdout.write(`${JSON.stringify({ workflows: createWorkflowInventory(repositoryRoot) }, null, 2)}\n`)
}

module.exports = {
  classifyTrackedWorkflows,
  createWorkflowInventory,
  discoverContributionManifests,
  discoverTrackedWorkflowPaths,
  normalizeWorkflowPath,
  parseNulDelimitedPaths,
  validateTrackedWorkflowPath
}
