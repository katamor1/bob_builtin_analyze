"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")

const { canonicalJsonBytes } = require("../../out/core/contractV2/canonicalJson.js")
const { snapshotBobContractProfile } = require("../../out/core/contractV2/bobProfile.js")
const { createAuditedWorkflowCompilerEnvironment } = require("../../out/core/contractV2/index.js")
const { parseStrictJson } = require("../../out/core/contractV2/packageLoaderInput.js")
const { WorkflowProviderRegistry } = require("../../out/core/contractV2/providerRegistry.js")

const CATALOG_SCHEMA_VERSION = "workflow-provider-catalog-source/v1"
const COLLECTIONS_SCHEMA_VERSION = "workflow-contract-v2-collections/v1"
const MAX_CONTROL_BYTES = 8 * 1024 * 1024
const NEWLINE = Buffer.from("\n", "utf8")
const arrayIncludes = Array.prototype.includes
const arrayIsArray = Array.isArray
const arrayPush = Array.prototype.push
const arraySome = Array.prototype.some
const bufferConcat = Buffer.concat
const bufferEquals = Buffer.prototype.equals
const objectFreeze = Object.freeze
const objectHasOwn = Object.hasOwn
const objectKeys = Object.keys
const pathResolve = path.resolve
const pathRelative = path.relative
const pathIsAbsolute = path.isAbsolute
const reflectApply = Reflect.apply
const regexpExec = RegExp.prototype.exec
const stringEndsWith = String.prototype.endsWith
const stringIncludes = String.prototype.includes
const stringNormalize = String.prototype.normalize
const stringSplit = String.prototype.split
const stringStartsWith = String.prototype.startsWith

async function createWorkflowContractV2EvidenceEnvironment(input) {
  const repositoryRoot = await canonicalRepositoryRoot(input.repositoryRoot)
  const document = await readCanonicalJsonFile(
    repositoryRoot,
    input.providerCatalogPath,
    "Workflow provider catalog"
  )
  const root = exactRecord(document, ["schemaVersion", "providers"], "Workflow provider catalog")
  if (root.schemaVersion !== CATALOG_SCHEMA_VERSION) {
    throw new TypeError("Workflow provider catalog schema version is invalid.")
  }
  const providers = denseArray(root.providers, 256, "Workflow provider catalog providers")
  const registry = new WorkflowProviderRegistry()
  for (let index = 0; index < providers.length; index += 1) {
    const provider = exactRecord(providers[index], [
      "id", "version", "inputSchema", "output", "errorSchema",
      "sideEffect", "idempotency", "requiredCapabilities"
    ], "Workflow provider catalog provider")
    registry.register({
      sourceId: "workflow-contract-v2-manifest",
      contract: {
        ...provider,
        dispatch() {
          throw new Error("Compile-only workflow provider dispatch is unavailable.")
        }
      }
    })
  }
  return createAuditedWorkflowCompilerEnvironment({
    purpose: "evidence",
    providerCatalog: registry.snapshot(),
    bobProfile: snapshotBobContractProfile({ registerSource() {} })
  })
}

async function readWorkflowContractV2Collections(input) {
  const repositoryRoot = await canonicalRepositoryRoot(input.repositoryRoot)
  const document = await readCanonicalJsonFile(
    repositoryRoot,
    input.collectionsPath,
    "Workflow collection list"
  )
  const root = exactRecord(document, ["schemaVersion", "collections"], "Workflow collection list")
  if (root.schemaVersion !== COLLECTIONS_SCHEMA_VERSION) {
    throw new TypeError("Workflow collection list schema version is invalid.")
  }
  const values = denseArray(root.collections, 256, "Workflow collection list collections")
  const collections = []
  for (let index = 0; index < values.length; index += 1) {
    reflectApply(arrayPush, collections, [repositoryRelativePath(values[index], "Workflow collection path")])
  }
  return objectFreeze(collections)
}

async function readCanonicalJsonFile(repositoryRoot, repositoryRelativeFile, label) {
  const relative = repositoryRelativePath(repositoryRelativeFile, `${label} path`)
  const lexical = resolveWithinRepository(repositoryRoot, relative)
  const stat = await fs.lstat(lexical)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new TypeError(`${label} must be a direct regular file.`)
  const absolute = await fs.realpath(lexical)
  assertPhysicalContainment(repositoryRoot, absolute, `${label} path`)
  const bytes = await fs.readFile(absolute)
  if (bytes.byteLength > MAX_CONTROL_BYTES) throw new TypeError(`${label} is too large.`)
  const parsed = parseStrictJson(bytes, label)
  const canonical = reflectApply(bufferConcat, Buffer, [[canonicalJsonBytes(parsed), NEWLINE]])
  if (!reflectApply(bufferEquals, bytes, [canonical])) {
    throw new TypeError(`${label} must contain canonical JSON followed by one LF.`)
  }
  return parsed
}

async function canonicalRepositoryRoot(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("Repository root is required.")
  }
  return fs.realpath(pathResolve(value))
}

function resolveWithinRepository(repositoryRoot, relative) {
  const segments = reflectApply(stringSplit, relative, ["/"])
  const absolute = pathResolve(repositoryRoot, ...segments)
  const fromRoot = pathRelative(repositoryRoot, absolute)
  if (
    fromRoot === ""
    || fromRoot === "."
    || pathIsAbsolute(fromRoot)
    || fromRoot === ".."
    || reflectApply(stringStartsWith, fromRoot, [`..${path.sep}`])
  ) throw new TypeError("Repository-relative path escapes or names the repository root.")
  return absolute
}

function assertPhysicalContainment(repositoryRoot, candidate, label) {
  const relative = pathRelative(repositoryRoot, candidate)
  if (
    relative === ""
    || relative === "."
    || pathIsAbsolute(relative)
    || relative === ".."
    || reflectApply(stringStartsWith, relative, [`..${path.sep}`])
  ) throw new TypeError(`${label} escapes or names the repository root.`)
}

function repositoryRelativePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) {
    throw new TypeError(`${label} is invalid.`)
  }
  if (
    reflectApply(stringStartsWith, value, ["/"])
    || reflectApply(stringEndsWith, value, ["/"])
    || reflectApply(stringIncludes, value, ["\\"])
    || reflectApply(stringNormalize, value, ["NFC"]) !== value
  ) {
    throw new TypeError(`${label} must be a canonical repository-relative POSIX path.`)
  }
  const segments = reflectApply(stringSplit, value, ["/"])
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (
      !segment
      || segment === "."
      || segment === ".."
      || reflectApply(regexpExec, /[\u0000-\u001f\u007f-\u009f]/u, [segment]) !== null
    ) {
      throw new TypeError(`${label} contains an invalid segment.`)
    }
  }
  return value
}

function exactRecord(value, fields, label) {
  if (value === null || typeof value !== "object" || arrayIsArray(value)) {
    throw new TypeError(`${label} must be a record.`)
  }
  const keys = objectKeys(value)
  if (
    keys.length !== fields.length
    || reflectApply(arraySome, keys, [(key) => !(reflectApply(arrayIncludes, fields, [key]))])
  ) {
    throw new TypeError(`${label} contains an unknown field.`)
  }
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    if (!objectHasOwn(value, field)) throw new TypeError(`${label}.${field} is required.`)
  }
  return value
}

function denseArray(value, maximum, label) {
  if (!arrayIsArray(value) || value.length > maximum || objectKeys(value).length !== value.length) {
    throw new TypeError(`${label} must be a bounded dense array.`)
  }
  return value
}

module.exports = {
  CATALOG_SCHEMA_VERSION,
  COLLECTIONS_SCHEMA_VERSION,
  createWorkflowContractV2EvidenceEnvironment,
  readCanonicalJsonFile,
  readWorkflowContractV2Collections,
  repositoryRelativePath,
  resolveWithinRepository
}
