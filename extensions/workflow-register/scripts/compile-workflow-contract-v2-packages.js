#!/usr/bin/env node
"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")

const {
  compileWorkflowPackage
} = require("../out/core/contractV2/index.js")
const {
  createCompiledWorkflowPlanManifest,
  createCompiledWorkflowPlanManifestPackage,
  encodeCompiledWorkflowPlanManifest
} = require("../out/core/contractV2/compiledPlanManifest.js")
const {
  createNodeWorkflowPackageFileSystem
} = require("../out/core/contractV2/packageFileSystemNode.js")
const {
  loadCurrentWorkflowPackage
} = require("../out/core/contractV2/packageLoader.js")
const {
  createWorkflowPackageRoot
} = require("../out/core/contractV2/packageRoot.js")
const {
  createWorkflowContractV2EvidenceEnvironment,
  readWorkflowContractV2Collections,
  repositoryRelativePath,
  resolveWithinRepository
} = require("./lib/workflow-contract-v2-environment.js")

const SLOT_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const regexpExec = RegExp.prototype.exec
const reflectApply = Reflect.apply

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv)
  const repositoryRoot = await fs.realpath(path.resolve(options.root))
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
  const fileSystem = createNodeWorkflowPackageFileSystem()
  const packages = []

  for (const collection of collections) {
    const lexicalRoot = resolveWithinRepository(repositoryRoot, collection)
    const physicalRoot = await assertPhysicalCollection(repositoryRoot, lexicalRoot)
    const collectionRoot = createWorkflowPackageRoot(fileSystem, physicalRoot)
    const slots = await discoverCurrentSlots(physicalRoot)
    for (const slot of slots) {
      const rawPackage = await loadCurrentWorkflowPackage({
        fileSystem,
        collectionRoot,
        workflowId: slot
      })
      const compiled = compileWorkflowPackage({ rawPackage, environment })
      if (!compiled.ok) {
        const codes = compiled.diagnostics.map((item) => item.code).join(",")
        throw new Error(`Workflow package compilation failed for ${collection}/${slot}: ${codes}`)
      }
      packages.push(createCompiledWorkflowPlanManifestPackage({
        collection,
        slot,
        generation: rawPackage.generation,
        handle: compiled.handle
      }))
    }
  }

  const manifest = createCompiledWorkflowPlanManifest({ packages })
  const bytes = encodeCompiledWorkflowPlanManifest(manifest)
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
      result.collections.push(repositoryRelativePath(requireArgument(option, value), "Workflow collection path"))
      index += 1
    } else if (option === "--collections") {
      if (result.collectionsFile !== undefined) throw new TypeError("--collections may be specified only once.")
      result.collectionsFile = repositoryRelativePath(requireArgument(option, value), "Workflow collections file path")
      index += 1
    } else if (option === "--provider-catalog") {
      if (result.providerCatalog !== undefined) throw new TypeError("--provider-catalog may be specified only once.")
      result.providerCatalog = repositoryRelativePath(requireArgument(option, value), "Workflow provider catalog path")
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
  return result
}

function normalizeCollections(values) {
  const result = values.map((value) => repositoryRelativePath(value, "Workflow collection path"))
  result.sort()
  for (let index = 0; index < result.length; index += 1) {
    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previous = result[previousIndex]
      const current = result[index]
      if (current === previous) throw new TypeError("Workflow collection roots must be unique.")
      if (current.startsWith(`${previous}/`) || previous.startsWith(`${current}/`)) {
        throw new TypeError("Workflow collection roots must not overlap.")
      }
    }
  }
  return Object.freeze(result)
}

async function assertPhysicalCollection(repositoryRoot, lexicalRoot) {
  const stat = await fs.lstat(lexicalRoot)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new TypeError("Workflow collection root must be a direct directory, not a symbolic link.")
  }
  const physicalRoot = await fs.realpath(lexicalRoot)
  const relative = path.relative(repositoryRoot, physicalRoot)
  if (
    relative === ""
    || relative === "."
    || path.isAbsolute(relative)
    || relative === ".."
    || relative.startsWith(`..${path.sep}`)
  ) {
    throw new TypeError("Workflow collection physical root escapes or names the repository root.")
  }
  return physicalRoot
}

async function discoverCurrentSlots(collectionRoot) {
  const entries = await fs.readdir(collectionRoot, { withFileTypes: true })
  entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
  const slots = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const pointer = path.join(collectionRoot, entry.name, "current.json")
    let stat
    try {
      stat = await fs.lstat(pointer)
    } catch (error) {
      if (error && error.code === "ENOENT") continue
      throw error
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new TypeError("Workflow package current pointer must be a direct regular file.")
    }
    if (entry.name.length > 128 || reflectApply(regexpExec, SLOT_PATTERN, [entry.name]) === null) {
      throw new TypeError("Workflow package slot id is invalid.")
    }
    slots.push(entry.name)
  }
  return Object.freeze(slots)
}

async function writeManifest(target, bytes) {
  const output = path.resolve(target)
  await fs.mkdir(path.dirname(output), { recursive: true })
  const temporary = `${output}.tmp-${process.pid}-${Date.now()}`
  try {
    await fs.writeFile(temporary, bytes, { flag: "wx" })
    await fs.rename(temporary, output)
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

function requireArgument(option, value) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
    throw new TypeError(`${option} requires a value.`)
  }
  return value
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
  parseArguments
}
