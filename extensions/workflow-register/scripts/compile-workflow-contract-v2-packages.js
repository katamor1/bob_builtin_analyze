#!/usr/bin/env node
"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")

const {
  compileWorkflowPackage: compileWorkflowPackageCaptured
} = require("../out/core/contractV2/index.js")
const {
  createCompiledWorkflowPlanManifest: createCompiledWorkflowPlanManifestCaptured,
  createCompiledWorkflowPlanManifestPackage: createCompiledWorkflowPlanManifestPackageCaptured,
  encodeCompiledWorkflowPlanManifest: encodeCompiledWorkflowPlanManifestCaptured
} = require("../out/core/contractV2/compiledPlanManifest.js")
const {
  createNodeWorkflowPackageFileSystem: createNodeWorkflowPackageFileSystemCaptured
} = require("../out/core/contractV2/packageFileSystemNode.js")
const {
  loadCurrentWorkflowPackage: loadCurrentWorkflowPackageCaptured
} = require("../out/core/contractV2/packageLoader.js")
const {
  createWorkflowPackageRoot: createWorkflowPackageRootCaptured
} = require("../out/core/contractV2/packageRoot.js")
const {
  canonicalRepositoryRoot,
  createWorkflowContractV2EvidenceEnvironment,
  inspectDirectRepositoryPath,
  portablePathKey,
  readWorkflowContractV2Collections,
  repositoryRelativePath
} = require("./lib/workflow-contract-v2-environment.js")

const SLOT_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const arrayPush = Array.prototype.push
const dateNow = Date.now
const objectCreate = Object.create
const objectFreeze = Object.freeze
const pathDirname = path.dirname
const pathIsAbsolute = path.isAbsolute
const pathJoin = path.join
const pathRelative = path.relative
const pathResolve = path.resolve
const reflectApply = Reflect.apply
const regexpExec = RegExp.prototype.exec
const stringJoin = Array.prototype.join
const stringStartsWith = String.prototype.startsWith
const fsLstat = fs.lstat
const fsMkdir = fs.mkdir
const fsReaddir = fs.readdir
const fsRealpath = fs.realpath
const fsRename = fs.rename
const fsRm = fs.rm
const fsOpen = fs.open

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv)
  const repositoryRoot = await canonicalRepositoryRoot(options.root)
  const requestedCollections = options.collectionsFile === undefined
    ? options.collections
    : await readWorkflowContractV2Collections({
        repositoryRoot,
        collectionsPath: options.collectionsFile
      })
  const collections = normalizeCollections(requestedCollections)
  const environment = await createWorkflowContractV2EvidenceEnvironment({
    repositoryRoot,
    providerCatalogPath: options.providerCatalog
  })
  const fileSystem = createNodeWorkflowPackageFileSystemCaptured()
  const packages = []
  const physicalCollections = objectCreate(null)

  for (let collectionIndex = 0; collectionIndex < collections.length; collectionIndex += 1) {
    const collection = collections[collectionIndex]
    const physicalRoot = await assertPhysicalCollection(repositoryRoot, collection)
    const physicalKey = portablePathKey(physicalRoot)
    if (physicalCollections[physicalKey] !== undefined) {
      throw new TypeError("Workflow collection roots resolve to the same physical location.")
    }
    physicalCollections[physicalKey] = collection
    const collectionRoot = createWorkflowPackageRootCaptured(fileSystem, physicalRoot)
    const slots = await discoverCurrentSlots(physicalRoot)
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex]
      const rawPackage = await loadCurrentWorkflowPackageCaptured({
        fileSystem,
        collectionRoot,
        workflowId: slot
      })
      const compiled = compileWorkflowPackageCaptured({ rawPackage, environment })
      if (!compiled.ok) {
        const codes = []
        for (let index = 0; index < compiled.diagnostics.length; index += 1) {
          reflectApply(arrayPush, codes, [compiled.diagnostics[index].code])
        }
        throw new Error(
          `Workflow package compilation failed for ${collection}/${slot}: ${reflectApply(stringJoin, codes, [","])}`
        )
      }
      reflectApply(arrayPush, packages, [createCompiledWorkflowPlanManifestPackageCaptured({
        collection,
        slot,
        generation: rawPackage.generation,
        handle: compiled.handle
      })])
    }
  }

  const manifest = createCompiledWorkflowPlanManifestCaptured({ packages })
  const bytes = encodeCompiledWorkflowPlanManifestCaptured(manifest)
  await writeManifest(options.manifest, bytes)
  return manifest
}

function parseArguments(argv) {
  const result = {
    root: undefined,
    collections: [],
    collectionsFile: undefined,
    providerCatalog: undefined,
    manifest: undefined
  }
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]
    const value = argv[index + 1]
    if (option === "--root") {
      if (result.root !== undefined) throw new TypeError("--root may be specified only once.")
      result.root = requireArgument(option, value)
      index += 1
    } else if (option === "--collection") {
      reflectApply(arrayPush, result.collections, [
        repositoryRelativePath(requireArgument(option, value), "Workflow collection path")
      ])
      index += 1
    } else if (option === "--collections") {
      if (result.collectionsFile !== undefined) throw new TypeError("--collections may be specified only once.")
      result.collectionsFile = repositoryRelativePath(
        requireArgument(option, value),
        "Workflow collections file path"
      )
      index += 1
    } else if (option === "--provider-catalog") {
      if (result.providerCatalog !== undefined) {
        throw new TypeError("--provider-catalog may be specified only once.")
      }
      result.providerCatalog = repositoryRelativePath(
        requireArgument(option, value),
        "Workflow provider catalog path"
      )
      index += 1
    } else if (option === "--manifest") {
      if (result.manifest !== undefined) throw new TypeError("--manifest may be specified only once.")
      result.manifest = requireArgument(option, value)
      index += 1
    } else {
      throw new TypeError(`Unknown workflow Contract v2 manifest option: ${option}`)
    }
  }
  if (!result.root) throw new TypeError("--root is required.")
  if (!result.providerCatalog) throw new TypeError("--provider-catalog is required.")
  if (!result.manifest) throw new TypeError("--manifest is required.")
  if ((result.collectionsFile === undefined) === (result.collections.length === 0)) {
    throw new TypeError("Specify repeated --collection values or exactly one --collections file.")
  }
  return objectFreeze({
    root: result.root,
    collections: objectFreeze(result.collections.slice()),
    collectionsFile: result.collectionsFile,
    providerCatalog: result.providerCatalog,
    manifest: result.manifest
  })
}

function normalizeCollections(values) {
  const entries = []
  for (let index = 0; index < values.length; index += 1) {
    const value = repositoryRelativePath(values[index], "Workflow collection path")
    reflectApply(arrayPush, entries, [{ value, key: portablePathKey(value) }])
  }
  insertionSort(entries, (left, right) => left.value < right.value ? -1 : left.value > right.value ? 1 : 0)
  for (let index = 0; index < entries.length; index += 1) {
    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previous = entries[previousIndex]
      const current = entries[index]
      if (current.key === previous.key) {
        throw new TypeError("Workflow collection roots must be unique across supported filesystems.")
      }
      if (
        reflectApply(stringStartsWith, current.key, [`${previous.key}/`])
        || reflectApply(stringStartsWith, previous.key, [`${current.key}/`])
      ) {
        throw new TypeError("Workflow collection roots must not overlap across supported filesystems.")
      }
    }
  }
  const result = []
  for (let index = 0; index < entries.length; index += 1) {
    reflectApply(arrayPush, result, [entries[index].value])
  }
  return objectFreeze(result)
}

async function assertPhysicalCollection(repositoryRoot, collection) {
  const beforePath = await inspectDirectRepositoryPath(
    repositoryRoot,
    collection,
    "directory",
    "Workflow collection root"
  )
  const physicalRoot = await fsRealpath(beforePath.path)
  const afterPath = await inspectDirectRepositoryPath(
    repositoryRoot,
    collection,
    "directory",
    "Workflow collection root"
  )
  if (
    beforePath.stat.dev !== afterPath.stat.dev
    || beforePath.stat.ino !== afterPath.stat.ino
    || beforePath.stat.mode !== afterPath.stat.mode
  ) throw new TypeError("Workflow collection root changed while it was being resolved.")
  const physicalAfter = await fsRealpath(afterPath.path)
  if (physicalAfter !== physicalRoot) {
    throw new TypeError("Workflow collection root changed while it was being resolved.")
  }
  const relative = pathRelative(repositoryRoot, physicalRoot)
  if (
    relative === ""
    || relative === "."
    || pathIsAbsolute(relative)
    || relative === ".."
    || reflectApply(stringStartsWith, relative, [`..${path.sep}`])
  ) {
    throw new TypeError("Workflow collection physical root escapes or names the repository root.")
  }
  return physicalRoot
}

async function discoverCurrentSlots(collectionRoot) {
  const entries = await fsReaddir(collectionRoot, { withFileTypes: true })
  const slots = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const pointer = pathJoin(collectionRoot, entry.name, "current.json")
    let stat
    try {
      stat = await fsLstat(pointer)
    } catch (error) {
      if (error && error.code === "ENOENT") continue
      throw error
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new TypeError("Workflow package current pointer must be a direct regular file.")
    }
    reflectApply(arrayPush, slots, [entry.name])
  }
  return normalizeSlotNames(slots)
}

function normalizeSlotNames(values) {
  const result = []
  const identities = objectCreate(null)
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (
      typeof value !== "string"
      || value.length > 128
      || reflectApply(regexpExec, SLOT_PATTERN, [value]) === null
    ) throw new TypeError("Workflow package slot id is invalid.")
    repositoryRelativePath(value, "Workflow package slot id")
    const key = portablePathKey(value)
    if (identities[key] !== undefined) {
      throw new TypeError("Workflow package slot ids contain a cross-platform alias.")
    }
    identities[key] = value
    reflectApply(arrayPush, result, [value])
  }
  insertionSort(result, (left, right) => left < right ? -1 : left > right ? 1 : 0)
  return objectFreeze(result)
}

async function writeManifest(target, bytes) {
  const output = pathResolve(target)
  await fsMkdir(pathDirname(output), { recursive: true })
  const temporary = `${output}.tmp-${process.pid}-${reflectApply(dateNow, Date, [])}`
  let handle
  let identity
  try {
    handle = await fsOpen(temporary, "wx")
    identity = await handle.stat({ bigint: true })
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = undefined
    await fsRename(temporary, output)
  } catch (error) {
    if (handle !== undefined) await handle.close().catch(() => undefined)
    if (identity !== undefined) {
      const current = await fsLstat(temporary, { bigint: true }).catch(() => undefined)
      if (current !== undefined && current.dev === identity.dev && current.ino === identity.ino && !current.isSymbolicLink()) {
        await fsRm(temporary, { force: true }).catch(() => undefined)
      }
    }
    throw error
  }
}
function requireArgument(option, value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || reflectApply(stringStartsWith, value, ["--"])
  ) throw new TypeError(`${option} requires a value.`)
  return value
}

function insertionSort(values, compare) {
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index]
    let insertion = index
    while (insertion > 0 && compare(values[insertion - 1], value) > 0) {
      values[insertion] = values[insertion - 1]
      insertion -= 1
    }
    values[insertion] = value
  }
}

if (require.main === module) {
  main().then(
    (manifest) => process.stdout.write(`Compiled ${manifest.packages.length} workflow package(s).\n`),
    (error) => {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`Workflow Contract v2 manifest failed: ${message}\n`)
      process.exitCode = 1
    }
  )
}

module.exports = {
  assertPhysicalCollection,
  discoverCurrentSlots,
  main,
  normalizeCollections,
  normalizeSlotNames,
  parseArguments
}
