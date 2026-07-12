#!/usr/bin/env node
"use strict"

const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const REQUIRED_TRIAGE_UAT_ARTIFACTS = Object.freeze([
  ".bob-review/bob-output/bob-output.yaml",
  ".bob-review/human-triage/accepted-findings.md",
  ".bob-review/human-triage/follow-up-actions.md",
  ".bob-review/human-triage/investigation-items.md",
  ".bob-review/human-triage/migration-report.md",
  ".bob-review/human-triage/questions-to-author.md",
  ".bob-review/human-triage/rejected-findings.md",
  ".bob-review/human-triage/triage-decisions.yaml",
  ".bob-review/human-triage/triage-result.yaml",
  ".bob-review/human-triage/triage-source.yaml"
])

function buildTriageUatEvidenceManifest(input) {
  const workspaceRoot = requiredDirectory(input?.workspaceRoot, "workspaceRoot")
  const testedCommitSha = commitSha(input?.testedCommitSha, "testedCommitSha")
  const vsixBuildCommitSha = commitSha(input?.vsixBuildCommitSha, "vsixBuildCommitSha")
  const generatedAt = isoTimestamp(input?.generatedAt ?? new Date().toISOString(), "generatedAt")
  const missingRequired = []
  const artifacts = []

  for (const relativePath of REQUIRED_TRIAGE_UAT_ARTIFACTS) {
    const artifact = readArtifact(workspaceRoot, relativePath)
    if (artifact) artifacts.push(artifact)
    else missingRequired.push(relativePath)
  }

  for (const relativePath of backupArtifactPaths(workspaceRoot)) {
    const artifact = readArtifact(workspaceRoot, relativePath)
    if (artifact) artifacts.push(artifact)
  }

  artifacts.sort((left, right) => left.path.localeCompare(right.path, "en"))
  const commitMatch = testedCommitSha === vsixBuildCommitSha

  return {
    schema_version: "triage-uat-evidence-manifest/v1",
    generated_at: generatedAt,
    workspace_name: path.basename(workspaceRoot) || "workspace",
    tested_commit_sha: testedCommitSha,
    vsix_build_commit_sha: vsixBuildCommitSha,
    commit_match: commitMatch,
    status: commitMatch && missingRequired.length === 0 ? "complete" : "incomplete",
    missing_required: missingRequired,
    artifacts
  }
}

function writeTriageUatEvidenceManifest(input) {
  const outputPath = requiredString(input?.outputPath, "outputPath")
  const manifest = buildTriageUatEvidenceManifest(input)
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true })
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  return manifest
}

function backupArtifactPaths(workspaceRoot) {
  const triageDirectory = workspacePath(workspaceRoot, ".bob-review/human-triage")
  let entries
  try {
    entries = fs.readdirSync(triageDirectory, { withFileTypes: true })
  } catch (error) {
    if (error && error.code === "ENOENT") return []
    throw error
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.includes(".bak-"))
    .map((entry) => `.bob-review/human-triage/${entry.name}`)
    .filter((relativePath) => !REQUIRED_TRIAGE_UAT_ARTIFACTS.includes(relativePath))
    .sort((left, right) => left.localeCompare(right, "en"))
}

function readArtifact(workspaceRoot, relativePath) {
  const filePath = workspacePath(workspaceRoot, relativePath)
  let stats
  try {
    stats = fs.lstatSync(filePath)
  } catch (error) {
    if (error && error.code === "ENOENT") return undefined
    throw error
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`UAT artifact must be a regular file: ${relativePath}`)
  }
  const bytes = fs.readFileSync(filePath)
  return {
    path: relativePath.replace(/\\/g, "/"),
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex")
  }
}

function workspacePath(workspaceRoot, relativePath) {
  const resolvedRoot = path.resolve(workspaceRoot)
  const resolvedPath = path.resolve(resolvedRoot, ...relativePath.split("/"))
  const relative = path.relative(resolvedRoot, resolvedPath)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`UAT artifact escapes workspace: ${relativePath}`)
  }
  return resolvedPath
}

function requiredDirectory(value, label) {
  const directory = path.resolve(requiredString(value, label))
  let stats
  try {
    stats = fs.statSync(directory)
  } catch (error) {
    if (error && error.code === "ENOENT") throw new Error(`${label} does not exist: ${directory}`)
    throw error
  }
  if (!stats.isDirectory()) throw new Error(`${label} must be a directory: ${directory}`)
  return directory
}

function commitSha(value, label) {
  const normalized = requiredString(value, label).toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`${label} must be a 40-character hexadecimal commit SHA`)
  }
  return normalized
}

function isoTimestamp(value, label) {
  const normalized = requiredString(value, label)
  const parsed = new Date(normalized)
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be an ISO-8601 timestamp`)
  return parsed.toISOString()
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value.trim()
}

function parseArguments(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === "--help" || key === "-h") return { help: true }
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`)
    const value = argv[index + 1]
    if (typeof value !== "string" || value.startsWith("--")) throw new Error(`Missing value for ${key}`)
    index += 1
    if (key === "--workspace") result.workspaceRoot = value
    else if (key === "--tested-commit") result.testedCommitSha = value
    else if (key === "--vsix-commit") result.vsixBuildCommitSha = value
    else if (key === "--output") result.outputPath = value
    else if (key === "--generated-at") result.generatedAt = value
    else throw new Error(`Unknown argument: ${key}`)
  }
  return result
}

function usage() {
  return [
    "Usage:",
    "  node scripts/triage-uat-evidence.js --workspace <path> --tested-commit <sha> --vsix-commit <sha> --output <manifest.json> [--generated-at <iso>]",
    "",
    "The manifest is written even when required artifacts are missing or commit SHAs differ.",
    "Exit code 0 means complete; exit code 2 means incomplete; exit code 1 means invalid input."
  ].join("\n")
}

function runCli(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv)
    if (options.help) {
      process.stdout.write(`${usage()}\n`)
      return 0
    }
    const manifest = writeTriageUatEvidenceManifest(options)
    process.stdout.write(
      `Wrote ${path.resolve(options.outputPath)}: status=${manifest.status}, artifacts=${manifest.artifacts.length}, missing=${manifest.missing_required.length}, commit_match=${manifest.commit_match}\n`
    )
    return manifest.status === "complete" ? 0 : 2
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`)
    return 1
  }
}

module.exports = {
  REQUIRED_TRIAGE_UAT_ARTIFACTS,
  buildTriageUatEvidenceManifest,
  parseArguments,
  runCli,
  writeTriageUatEvidenceManifest
}

if (require.main === module) process.exitCode = runCli()
