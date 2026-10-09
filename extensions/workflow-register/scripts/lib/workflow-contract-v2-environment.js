"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")
const { types: utilTypes } = require("node:util")

const { canonicalJsonBytes: canonicalJsonBytesCaptured } = require("../../out/core/contractV2/canonicalJson.js")
const { snapshotBobContractProfile: snapshotBobContractProfileCaptured } = require("../../out/core/contractV2/bobProfile.js")
const { createAuditedWorkflowCompilerEnvironment: createAuditedWorkflowCompilerEnvironmentCaptured } = require("../../out/core/contractV2/index.js")
const { parseStrictJson: parseStrictJsonCaptured } = require("../../out/core/contractV2/packageLoaderInput.js")
const { ActionRegistry: ActionRegistryConstructor } = require("../../out/core/actionRegistry.js")

const CATALOG_SCHEMA_VERSION = "workflow-provider-catalog-source/v1"
const COLLECTIONS_SCHEMA_VERSION = "workflow-contract-v2-collections/v1"
const MAX_CONTROL_BYTES = 8 * 1024 * 1024
const MAX_REPOSITORY_PATH_BYTES = 1024
const NEWLINE = Buffer.from("\n", "utf8")
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u
const WINDOWS_FORBIDDEN_PATTERN = /[<>:"|?*]/u
const PORTABLE_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/u
const WINDOWS_RESERVED_DEVICE_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const arrayPush = Array.prototype.push
const bufferByteLength = Buffer.byteLength.bind(Buffer)
const bufferConcat = Buffer.concat
const bufferAlloc = Buffer.alloc
const bufferFrom = Buffer.from
const bufferSubarray = Buffer.prototype.subarray
const NumberConstructor = Number
const bufferEquals = Buffer.prototype.equals
const BigIntConstructor = BigInt
const BufferConstructor = Buffer
const numberIsSafeInteger = Number.isSafeInteger
const numberToString = Number.prototype.toString
const objectCreate = Object.create
const objectDefineProperty = Object.defineProperty
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectKeys = Object.keys
const objectPrototype = Object.prototype
const pathIsAbsolute = path.isAbsolute
const pathJoin = path.join
const pathRelative = path.relative
const pathResolve = path.resolve
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const regexpExec = RegExp.prototype.exec
const stringEndsWith = String.prototype.endsWith
const stringIncludes = String.prototype.includes
const stringNormalize = String.prototype.normalize
const stringSplit = String.prototype.split
const stringStartsWith = String.prototype.startsWith
const stringToLowerCase = String.prototype.toLowerCase
const fsLstat = fs.lstat
const fsOpen = fs.open
const fsRealpath = fs.realpath
const workflowProviderRegistryRegister = ActionRegistryConstructor.prototype.registerWorkflowProviderContract
const workflowProviderRegistrySnapshot = ActionRegistryConstructor.prototype.snapshotWorkflowProviderCatalog

const ENVIRONMENT_INPUT_FIELDS = objectFreeze(["repositoryRoot", "providerCatalogPath"])
const COLLECTION_INPUT_FIELDS = objectFreeze(["repositoryRoot", "collectionsPath"])
const CATALOG_FIELDS = objectFreeze(["schemaVersion", "providers"])
const COLLECTION_LIST_FIELDS = objectFreeze(["schemaVersion", "collections"])
const PROVIDER_FIELDS = objectFreeze([
  "id", "version", "inputSchema", "output", "errorSchema",
  "sideEffect", "idempotency", "requiredCapabilities"
])

async function createWorkflowContractV2EvidenceEnvironment(input) {
  const request = snapshotExactRecord(input, ENVIRONMENT_INPUT_FIELDS, "Workflow evidence environment input")
  const repositoryRoot = await canonicalRepositoryRoot(request.repositoryRoot)
  const document = await readCanonicalJsonFile(
    repositoryRoot,
    request.providerCatalogPath,
    "Workflow provider catalog"
  )
  const root = snapshotExactRecord(document, CATALOG_FIELDS, "Workflow provider catalog")
  if (root.schemaVersion !== CATALOG_SCHEMA_VERSION) {
    throw new TypeError("Workflow provider catalog schema version is invalid.")
  }
  const providers = snapshotDenseArray(root.providers, 256, "Workflow provider catalog providers")
  const registry = new ActionRegistryConstructor()
  for (let index = 0; index < providers.length; index += 1) {
    const provider = snapshotExactRecord(
      providers[index],
      PROVIDER_FIELDS,
      "Workflow provider catalog provider"
    )
    reflectApply(workflowProviderRegistryRegister, registry, [{
      sourceId: "workflow-contract-v2-manifest",
      contract: {
        id: provider.id,
        version: provider.version,
        inputSchema: provider.inputSchema,
        output: provider.output,
        errorSchema: provider.errorSchema,
        sideEffect: provider.sideEffect,
        idempotency: provider.idempotency,
        requiredCapabilities: provider.requiredCapabilities,
        dispatch() {
          throw new Error("Compile-only workflow provider dispatch is unavailable.")
        }
      }
    }])
  }
  return createAuditedWorkflowCompilerEnvironmentCaptured({
    purpose: "evidence",
    providerCatalog: reflectApply(workflowProviderRegistrySnapshot, registry, []),
    bobProfile: snapshotBobContractProfileCaptured({ registerSource() {} })
  })
}

async function readWorkflowContractV2Collections(input) {
  const request = snapshotExactRecord(input, COLLECTION_INPUT_FIELDS, "Workflow collections input")
  const repositoryRoot = await canonicalRepositoryRoot(request.repositoryRoot)
  const document = await readCanonicalJsonFile(
    repositoryRoot,
    request.collectionsPath,
    "Workflow collection list"
  )
  const root = snapshotExactRecord(document, COLLECTION_LIST_FIELDS, "Workflow collection list")
  if (root.schemaVersion !== COLLECTIONS_SCHEMA_VERSION) {
    throw new TypeError("Workflow collection list schema version is invalid.")
  }
  const values = snapshotDenseArray(root.collections, 256, "Workflow collection list collections")
  const collections = []
  for (let index = 0; index < values.length; index += 1) {
    reflectApply(arrayPush, collections, [
      repositoryRelativePath(values[index], "Workflow collection path")
    ])
  }
  return objectFreeze(collections)
}

async function readCanonicalJsonFile(repositoryRoot, repositoryRelativeFile, label) {
  const relative = repositoryRelativePath(repositoryRelativeFile, `${label} path`)
  const beforePath = await inspectDirectRepositoryPath(repositoryRoot, relative, "file", label)
  const lexical = beforePath.path
  const before = beforePath.stat
  if (before.size > BigIntConstructor(MAX_CONTROL_BYTES)) throw new TypeError(`${label} is too large.`)
  const physicalBefore = await fsRealpath(lexical)
  assertPhysicalContainment(repositoryRoot, physicalBefore, `${label} path`)

  const handle = await fsOpen(physicalBefore, "r")
  let bytes
  try {
    const openedBefore = await handle.stat({ bigint: true })
    if (!sameFileSnapshot(before, openedBefore)) throw new TypeError(`${label} changed while it was being opened.`)
    if (!openedBefore.isFile() || openedBefore.size > BigIntConstructor(MAX_CONTROL_BYTES)) {
      throw new TypeError(`${label} must be a bounded regular file.`)
    }
    const expectedBytes = NumberConstructor(openedBefore.size)
    const buffer = reflectApply(bufferAlloc, BufferConstructor, [expectedBytes + 1])
    let length = 0
    while (length < buffer.byteLength) {
      const result = await handle.read(buffer, length, buffer.byteLength - length, length)
      if (!numberIsSafeInteger(result.bytesRead) || result.bytesRead < 0 || result.bytesRead > buffer.byteLength - length) {
        throw new TypeError(`${label} changed while it was being read.`)
      }
      if (result.bytesRead === 0) break
      length += result.bytesRead
    }
    if (length !== expectedBytes) throw new TypeError(`${label} changed while it was being read.`)
    bytes = reflectApply(bufferFrom, BufferConstructor, [reflectApply(bufferSubarray, buffer, [0, length])])
    const openedAfter = await handle.stat({ bigint: true })
    if (!sameFileSnapshot(openedBefore, openedAfter) || BigIntConstructor(bytes.byteLength) !== openedBefore.size) {
      throw new TypeError(`${label} changed while it was being read.`)
    }
  } finally {
    await handle.close()
  }

  const [afterPath, physicalAfter] = await Promise.all([
    inspectDirectRepositoryPath(repositoryRoot, relative, "file", label),
    fsRealpath(lexical)
  ])
  if (!sameFileSnapshot(before, afterPath.stat) || physicalAfter !== physicalBefore) {
    throw new TypeError(`${label} changed while it was being read.`)
  }

  const parsed = parseStrictJsonCaptured(bytes, label)
  const canonical = reflectApply(bufferConcat, BufferConstructor, [[
    canonicalJsonBytesCaptured(parsed),
    NEWLINE
  ]])
  if (!reflectApply(bufferEquals, bytes, [canonical])) {
    throw new TypeError(`${label} must contain canonical JSON followed by one LF.`)
  }
  return parsed
}

async function canonicalRepositoryRoot(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("Repository root is required.")
  }
  const lexical = pathResolve(value)
  const before = await fsLstat(lexical, { bigint: true })
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw new TypeError("Repository root must be a direct directory, not a symbolic link.")
  }
  const physical = await fsRealpath(lexical)
  const after = await fsLstat(lexical, { bigint: true })
  if (!after.isDirectory() || after.isSymbolicLink() || !sameNodeIdentity(before, after)) {
    throw new TypeError("Repository root changed while it was being resolved.")
  }
  return physical
}

async function inspectDirectRepositoryPath(repositoryRoot, relative, expectedKind, label) {
  const canonical = repositoryRelativePath(relative, `${label} path`)
  const segments = reflectApply(stringSplit, canonical, ["/"])
  let current = repositoryRoot
  let stat
  for (let index = 0; index < segments.length; index += 1) {
    current = pathJoin(current, segments[index])
    stat = await fsLstat(current, { bigint: true })
    if (stat.isSymbolicLink()) {
      throw new TypeError(`${label} path must not contain symbolic-link components.`)
    }
    const final = index === segments.length - 1
    if (!final && !stat.isDirectory()) {
      throw new TypeError(`${label} parent path must contain directories only.`)
    }
    if (final && expectedKind === "file" && !stat.isFile()) {
      throw new TypeError(`${label} must be a direct regular file.`)
    }
    if (final && expectedKind === "directory" && !stat.isDirectory()) {
      throw new TypeError(`${label} must be a direct directory.`)
    }
  }
  return objectFreeze({ path: current, stat })
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
  if (
    typeof value !== "string"
    || value.length === 0
    || bufferByteLength(value, "utf8") > MAX_REPOSITORY_PATH_BYTES
  ) throw new TypeError(`${label} is invalid.`)
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
    if (!segment || segment === "." || segment === "..") {
      throw new TypeError(`${label} contains an invalid segment.`)
    }
    assertPortableSegment(segment, label)
  }
  return value
}

function portablePathKey(value) {
  const normalized = reflectApply(stringNormalize, value, ["NFC"])
  return reflectApply(stringToLowerCase, normalized, [])
}

function assertPortableSegment(segment, label) {
  if (
    reflectApply(regexpExec, PORTABLE_SEGMENT_PATTERN, [segment]) === null
    || reflectApply(regexpExec, CONTROL_PATTERN, [segment]) !== null
    || reflectApply(regexpExec, WINDOWS_FORBIDDEN_PATTERN, [segment]) !== null
    || reflectApply(regexpExec, WINDOWS_RESERVED_DEVICE_PATTERN, [segment]) !== null
    || reflectApply(stringEndsWith, segment, ["."])
    || reflectApply(stringEndsWith, segment, [" "])
  ) throw new TypeError(`${label} contains a non-portable segment.`)
}

function snapshotExactRecord(value, fields, label) {
  const snapshot = snapshotRecord(value, label)
  const keys = objectKeys(snapshot)
  if (keys.length !== fields.length) throw new TypeError(`${label} contains an unknown field.`)
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    if (!objectHasOwn(snapshot, field)) throw new TypeError(`${label}.${field} is required.`)
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (!contains(fields, keys[index])) throw new TypeError(`${label} contains an unknown field.`)
  }
  return snapshot
}

function snapshotRecord(value, label) {
  if (value === null || typeof value !== "object" || isProxy(value)) {
    throw new TypeError(`${label} must be an ordinary non-proxy record.`)
  }
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) {
    throw new TypeError(`${label} must be an ordinary record.`)
  }
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  const snapshot = objectCreate(null)
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string") throw new TypeError(`${label} contains an unsupported key.`)
    const descriptor = descriptorEntry(descriptors, key)
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError(`${label}.${key} must be an enumerable own data property.`)
    objectDefineProperty(snapshot, key, {
      configurable: false,
      enumerable: true,
      value: descriptor.value,
      writable: false
    })
  }
  return objectFreeze(snapshot)
}

function snapshotDenseArray(value, maximum, label) {
  if (isProxy(value) || !arrayIsArray(value) || objectGetPrototypeOf(value) !== arrayPrototype) {
    throw new TypeError(`${label} must be a bounded dense ordinary array.`)
  }
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const length = descriptorEntry(descriptors, "length")?.value
  if (
    typeof length !== "number"
    || !numberIsSafeInteger(length)
    || length < 0
    || length > maximum
    || reflectOwnKeys(descriptors).length !== length + 1
  ) throw new TypeError(`${label} must be a bounded dense ordinary array.`)
  const values = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptorEntry(descriptors, numberAsString(index))
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError(`${label} must contain own data items.`)
    objectDefineProperty(values, numberAsString(index), {
      configurable: true,
      enumerable: true,
      value: descriptor.value,
      writable: true
    })
  }
  return objectFreeze(values)
}

function descriptorEntry(descriptors, key) {
  const holder = objectGetOwnPropertyDescriptor(descriptors, key)
  return holder !== undefined && objectHasOwn(holder, "value") ? holder.value : undefined
}

function sameFileSnapshot(left, right) {
  return sameNodeIdentity(left, right)
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
}

function sameNodeIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
}

function contains(values, value) {
  for (let index = 0; index < values.length; index += 1) if (values[index] === value) return true
  return false
}

function numberAsString(value) {
  return reflectApply(numberToString, value, [])
}

module.exports = {
  CATALOG_SCHEMA_VERSION,
  COLLECTIONS_SCHEMA_VERSION,
  canonicalRepositoryRoot,
  createWorkflowContractV2EvidenceEnvironment,
  inspectDirectRepositoryPath,
  portablePathKey,
  readCanonicalJsonFile,
  readWorkflowContractV2Collections,
  repositoryRelativePath,
  resolveWithinRepository
}
