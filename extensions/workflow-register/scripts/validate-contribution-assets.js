"use strict"

const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { TextDecoder } = require("node:util")

const {
  WORKFLOW_PACKAGE_EXPECTATION_SCHEMA_VERSION,
  validateVsixContributionPayload
} = require("./lib/vsix-contribution-payload-validator")

const MANIFEST_RELATIVE_PATH = "contracts/workflow-contributions.json"
const MAX_ASSETS = 4096
const MAX_SOURCE_BYTES = 8 * 1024 * 1024

function validatePackagedContribution({ archiveContent, expectedCatalog, ownerId }) {
  return validateVsixContributionPayload({ archiveContent, expectedCatalog, ownerId })
}

/**
 * Snapshot the exact extension-local bytes that a later VSIX check must bind.
 * This intentionally performs no Git discovery and never reads another owner.
 */
function createPackageExpectation(extensionRoot) {
  if (typeof extensionRoot !== "string" || extensionRoot.length === 0) {
    throw new Error("extension root must be a non-empty string")
  }
  const root = fs.realpathSync(extensionRoot)
  const packageBytes = readLocalFile(root, "package.json")
  const packageJson = parseUtf8Json(packageBytes, "package.json")
  if (!isRecord(packageJson)) throw new Error("package.json: root must be an object")
  const publisher = ownString(packageJson, "publisher", "package.json")
  const name = ownString(packageJson, "name", "package.json")
  const version = ownString(packageJson, "version", "package.json")
  const ownerId = `${publisher}.${name}`
  const ownerDirectory = `extensions/${name}`
  const manifestPath = `${ownerDirectory}/${MANIFEST_RELATIVE_PATH}`
  const manifestBytes = readLocalFile(root, MANIFEST_RELATIVE_PATH)
  const manifest = parseUtf8Json(manifestBytes, MANIFEST_RELATIVE_PATH)
  if (!isRecord(manifest)) throw new Error(`${MANIFEST_RELATIVE_PATH}: root must be an object`)
  const manifestOwnerDescriptor = Object.getOwnPropertyDescriptor(manifest, "owner")
  if (!manifestOwnerDescriptor || !("value" in manifestOwnerDescriptor) || !isRecord(manifestOwnerDescriptor.value)) {
    throw new Error(`${MANIFEST_RELATIVE_PATH}: owner must be an own object property`)
  }
  const manifestOwner = manifestOwnerDescriptor.value
  if (ownString(manifestOwner, "id", `${MANIFEST_RELATIVE_PATH}: owner`) !== ownerId) {
    throw new Error(`${MANIFEST_RELATIVE_PATH}: owner must equal ${ownerId}`)
  }
  if (ownString(manifestOwner, "version", `${MANIFEST_RELATIVE_PATH}: owner`) !== version) {
    throw new Error(`${MANIFEST_RELATIVE_PATH}: owner_version must equal ${version}`)
  }

  const assets = []
  for (const record of ownArray(manifest, "schemas", MANIFEST_RELATIVE_PATH)) {
    assets.push(snapshotAsset(root, ownerDirectory, "schema", record, "path"))
  }
  for (const record of ownArray(manifest, "workflow_templates", MANIFEST_RELATIVE_PATH)) {
    assets.push(snapshotAsset(root, ownerDirectory, "template", record, "source"))
  }
  if (assets.length > MAX_ASSETS) throw new Error("contribution manifest declares too many package assets")
  assets.sort((left, right) => compareCodeUnits(left.path, right.path) || compareCodeUnits(left.kind, right.kind) || compareCodeUnits(left.id, right.id))
  for (let index = 1; index < assets.length; index += 1) {
    if (assets[index - 1].path === assets[index].path) {
      throw new Error(`contribution asset path is duplicated: ${assets[index].path}`)
    }
  }

  return {
    schema_version: WORKFLOW_PACKAGE_EXPECTATION_SCHEMA_VERSION,
    owner: {
      id: ownerId,
      version,
      owner_directory: ownerDirectory,
      manifest_path: manifestPath,
      manifest_sha256: sha256(manifestBytes),
      package_path: `${ownerDirectory}/package.json`,
      package_sha256: sha256(packageBytes)
    },
    assets
  }
}

function snapshotAsset(root, ownerDirectory, kind, record, pathKey) {
  if (!isRecord(record)) throw new Error(`${kind} record must be an object`)
  const id = ownString(record, "id", `${kind} record`)
  const repositoryPath = ownString(record, pathKey, `${kind} record`)
  if (!isCanonicalRepositoryPath(repositoryPath) || !repositoryPath.startsWith(`${ownerDirectory}/`)) {
    throw new Error(`${kind} asset path is outside the extension owner: ${repositoryPath}`)
  }
  const relativePath = repositoryPath.slice(ownerDirectory.length + 1)
  const content = readLocalFile(root, relativePath)
  return { kind, id, path: repositoryPath, sha256: sha256(content) }
}

function readLocalFile(root, relativePath) {
  if (!isCanonicalRepositoryPath(relativePath)) throw new Error(`extension-local path is not canonical: ${String(relativePath)}`)
  let current = root
  for (const segment of relativePath.split("/")) {
    current = path.join(current, segment)
    const stat = fs.lstatSync(current)
    if (stat.isSymbolicLink()) throw new Error(`extension-local path is symlinked: ${relativePath}`)
  }
  const relative = path.relative(root, current)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`extension-local path escapes root: ${relativePath}`)
  }
  const stat = fs.statSync(current)
  if (!stat.isFile()) throw new Error(`extension-local path is not a file: ${relativePath}`)
  if (stat.size > MAX_SOURCE_BYTES) throw new Error(`extension-local file exceeds byte limit: ${relativePath}`)
  return fs.readFileSync(current)
}

function parseUtf8Json(content, label) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content))
  } catch {
    throw new Error(`${label}: content must be valid UTF-8 JSON`)
  }
}

function ownString(record, key, label) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key)
  if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string" || descriptor.value.length === 0) {
    throw new Error(`${label}: ${key} must be a non-empty own string property`)
  }
  return descriptor.value
}

function ownArray(record, key, label) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key)
  if (!descriptor || !("value" in descriptor) || !Array.isArray(descriptor.value)) {
    throw new Error(`${label}: ${key} must be an own array property`)
  }
  if (descriptor.value.length > MAX_ASSETS) throw new Error(`${label}: ${key} exceeds its item limit`)
  return descriptor.value.slice()
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isCanonicalRepositoryPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 2048 && value.normalize("NFC") === value &&
    !value.startsWith("/") && !value.includes("\\") && !/^[A-Za-z]:/.test(value) &&
    value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex")
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

module.exports = { createPackageExpectation, validatePackagedContribution }
