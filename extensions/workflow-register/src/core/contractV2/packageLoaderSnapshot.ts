import { createHash } from "node:crypto"

import { canonicalJsonDigest } from "./canonicalJson"
import type { WorkflowPackageFileSystem } from "./packageFileSystem"
import {
  PROMPT_FILE_PATTERN,
  SCHEMA_FILE_PATTERN,
  WORKFLOW_PACKAGE_V2_LOAD_LIMITS,
  type CandidateTarget,
  type DirectorySnapshot,
  type FileMetadata,
  type RawWorkflowPackage,
  type RawWorkflowPackageFile
} from "./packageLoaderContract"
import {
  assertDirectoryChain,
  assertDirectoryKind,
  assertDirectorySnapshotsUnchanged,
  readStableOpenedFile,
  safeIsWithin,
  safeLstat,
  safeReadDirectory,
  safeRealpath,
  snapshotDirectoryNames
} from "./packageLoaderIo"
import {
  bufferByteLength,
  compareText,
  normalizeContainmentRoot,
  numberIsSafeInteger,
  objectFreeze,
  pushValue,
  reflectBoolean,
  reflectString,
  sortValues,
  stringIncludes,
  stringNormalize,
  stringStartsWith,
  stringToLowerCase,
  testPattern,
  Uint8ArrayConstructor
} from "./packageLoaderIntrinsics"
import type { Sha256Digest } from "./providerContract"

const PATH_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u

export async function loadCandidateSnapshot(
  fileSystem: WorkflowPackageFileSystem<unknown>,
  hostRoot: unknown,
  workflowId: string,
  target: CandidateTarget
): Promise<RawWorkflowPackage> {
  const componentPaths: string[][] = []
  for (let index = 1; index <= target.baseSegments.length; index += 1) {
    pushValue(componentPaths, target.baseSegments.slice(0, index))
  }

  let basePhysical: string
  try {
    basePhysical = await assertDirectoryChain(fileSystem, hostRoot, componentPaths)
  } catch (error) {
    if (
      target.publication === "published"
      && error instanceof Error
      && /missing|unavailable/i.test(error.message)
    ) throw new Error("Workflow package generation digest directory is missing or unavailable.")
    throw error
  }

  const directorySnapshots: DirectorySnapshot[] = []
  const metadata: FileMetadata[] = []
  await enumerateDirectory(
    fileSystem,
    hostRoot,
    target.baseSegments,
    [],
    basePhysical,
    directorySnapshots,
    metadata
  )

  if (metadata.length > WORKFLOW_PACKAGE_V2_LOAD_LIMITS.maxFiles) {
    throw new Error("Workflow package file count exceeds the 512-file limit.")
  }
  detectPathAliases(metadata)
  classifyAndValidateMetadata(metadata)
  requireCoreFiles(metadata)
  enforceMetadataLimits(metadata)

  sortValues(metadata, (left, right) => compareText(left.path, right.path))
  const files: RawWorkflowPackageFile[] = []
  for (let index = 0; index < metadata.length; index += 1) {
    pushValue(files, await readStablePackageFile(fileSystem, hostRoot, metadata[index]))
  }
  await assertDirectorySnapshotsUnchanged(fileSystem, hostRoot, directorySnapshots)

  const packageDigest = digestPackageManifest(files)
  if (target.publication === "published" && packageDigest !== target.generation) {
    throw new Error("Workflow package generation digest does not match its directory name.")
  }
  if (
    target.expectedPackageDigest !== undefined
    && packageDigest !== target.expectedPackageDigest
  ) throw new Error("Workflow package digest does not match the expected package digest.")

  return objectFreeze({
    publication: target.publication,
    workflowId,
    generation: target.publication === "published" ? target.generation : packageDigest,
    packageDigest,
    files: objectFreeze(files)
  })
}

async function enumerateDirectory(
  fileSystem: WorkflowPackageFileSystem<unknown>,
  hostRoot: unknown,
  baseSegments: readonly string[],
  relativeSegments: readonly string[],
  basePhysical: string,
  directorySnapshots: DirectorySnapshot[],
  metadata: FileMetadata[]
): Promise<void> {
  if (relativeSegments.length > WORKFLOW_PACKAGE_V2_LOAD_LIMITS.maxDepth) {
    throw new Error("Workflow package depth exceeds the maximum depth of 3.")
  }
  const fullSegments = [...baseSegments, ...relativeSegments]
  const stat = await safeLstat(fileSystem, hostRoot, fullSegments, "workflow package directory")
  assertDirectoryKind(stat.kind, relativeSegments.join("/") || "generation root")
  const physical = normalizeContainmentRoot(
    await safeRealpath(fileSystem, hostRoot, fullSegments, "workflow package directory")
  )
  if (!safeIsWithin(fileSystem, basePhysical, physical)) {
    throw new Error("Workflow package directory escapes physical containment.")
  }
  const maximumEntries = WORKFLOW_PACKAGE_V2_LOAD_LIMITS.maxFiles
    - metadata.length
    + (relativeSegments.length === 0 ? 2 : 0)
  const sortedNames = snapshotDirectoryNames(
    await safeReadDirectory(fileSystem, hostRoot, fullSegments),
    relativeSegments.join("/") || "generation root",
    maximumEntries
  )
  pushValue(directorySnapshots, objectFreeze({
    segments: objectFreeze([...fullSegments]),
    names: sortedNames,
    identity: stat.identity,
    physical
  }))

  for (let index = 0; index < sortedNames.length; index += 1) {
    const name = sortedNames[index]
    validatePathComponent(name)
    const childRelative = [...relativeSegments, name]
    if (childRelative.length > WORKFLOW_PACKAGE_V2_LOAD_LIMITS.maxDepth) {
      throw new Error("Workflow package depth exceeds the maximum depth of 3.")
    }
    const childFull = [...baseSegments, ...childRelative]
    const childStat = await safeLstat(fileSystem, hostRoot, childFull, "workflow package entry")
    if (childStat.kind === "symbolic-link") {
      throw new Error("Workflow package symbolic links are not allowed.")
    }
    if (childStat.kind !== "directory" && childStat.kind !== "file") {
      throw new Error("Workflow package entries must be regular files or allowed directories.")
    }
    const childPhysical = normalizeContainmentRoot(
      await safeRealpath(fileSystem, hostRoot, childFull, "workflow package entry")
    )
    if (!safeIsWithin(fileSystem, basePhysical, childPhysical)) {
      throw new Error("Workflow package entry escapes physical containment.")
    }
    if (childStat.kind === "directory") {
      if (relativeSegments.length === 0 && name !== "prompts" && name !== "schemas") {
        throw new Error("Workflow package contains an unexpected directory.")
      }
      await enumerateDirectory(
        fileSystem,
        hostRoot,
        baseSegments,
        childRelative,
        basePhysical,
        directorySnapshots,
        metadata
      )
      continue
    }
    const logicalPath = childRelative.join("/")
    pushValue(metadata, objectFreeze({
      path: logicalPath,
      segments: objectFreeze(childFull),
      stat: childStat,
      physical: childPhysical,
      kind: provisionalKind(logicalPath)
    }))
    if (metadata.length > WORKFLOW_PACKAGE_V2_LOAD_LIMITS.maxFiles) {
      throw new Error("Workflow package file count exceeds the 512-file limit.")
    }
  }
}

function provisionalKind(path: string): FileMetadata["kind"] {
  if (path === "workflow.yaml") return "workflow"
  if (path === "workflow.lock.json") return "lock"
  if (reflectBoolean(stringStartsWith, path, "prompts/")) return "prompt"
  return "schema"
}

function detectPathAliases(metadata: readonly FileMetadata[]): void {
  const exact = new Set<string>()
  const normalized = new Map<string, string>()
  const folded = new Map<string, string>()
  for (let index = 0; index < metadata.length; index += 1) {
    const path = metadata[index].path
    if (exact.has(path)) throw new Error("Workflow package contains a duplicate logical path.")
    exact.add(path)

    const nfc = reflectString(stringNormalize, path, "NFC")
    const priorNormalized = normalized.get(nfc)
    if (priorNormalized !== undefined && priorNormalized !== path) {
      throw new Error("Workflow package contains a Unicode-normalization duplicate path.")
    }
    normalized.set(nfc, path)

    const caseFolded = reflectString(stringToLowerCase, nfc)
    const priorFolded = folded.get(caseFolded)
    if (priorFolded !== undefined && priorFolded !== path) {
      throw new Error("Workflow package contains a case-fold duplicate path.")
    }
    folded.set(caseFolded, path)
  }
}

function classifyAndValidateMetadata(metadata: readonly FileMetadata[]): void {
  for (let index = 0; index < metadata.length; index += 1) {
    const item = metadata[index]
    if (bufferByteLength(item.path, "utf8") > WORKFLOW_PACKAGE_V2_LOAD_LIMITS.maxLogicalPathBytes) {
      throw new Error("Workflow package logical path exceeds 240 UTF-8 bytes.")
    }
    if (item.path === "workflow.yaml" || item.path === "workflow.lock.json") continue
    if (testPattern(PROMPT_FILE_PATTERN, item.path)) continue
    if (testPattern(SCHEMA_FILE_PATTERN, item.path)) continue
    throw new Error("Workflow package contains an unexpected file or invalid logical path.")
  }
}

function requireCoreFiles(metadata: readonly FileMetadata[]): void {
  let workflow = 0
  let lock = 0
  for (let index = 0; index < metadata.length; index += 1) {
    if (metadata[index].path === "workflow.yaml") workflow += 1
    if (metadata[index].path === "workflow.lock.json") lock += 1
  }
  if (workflow !== 1 || lock !== 1) {
    throw new Error("Workflow package layout requires exactly workflow.yaml and workflow.lock.json.")
  }
}

function enforceMetadataLimits(metadata: readonly FileMetadata[]): void {
  let total = 0
  for (let index = 0; index < metadata.length; index += 1) {
    const size = metadata[index].stat.size
    if (!numberIsSafeInteger(size) || size < 1) {
      throw new Error(`Workflow package file ${metadata[index].path} has an invalid byte size.`)
    }
    total += size
    if (!numberIsSafeInteger(total) || total > WORKFLOW_PACKAGE_V2_LOAD_LIMITS.maxTotalBytes) {
      throw new Error("Workflow package total bytes exceed the 33,554,432-byte limit.")
    }
  }
  for (let index = 0; index < metadata.length; index += 1) {
    const item = metadata[index]
    const maximum = item.kind === "workflow"
      ? WORKFLOW_PACKAGE_V2_LOAD_LIMITS.maxWorkflowBytes
      : item.kind === "lock"
      ? WORKFLOW_PACKAGE_V2_LOAD_LIMITS.maxLockBytes
      : item.kind === "prompt"
      ? WORKFLOW_PACKAGE_V2_LOAD_LIMITS.maxPromptBytes
      : WORKFLOW_PACKAGE_V2_LOAD_LIMITS.maxSchemaBytes
    if (item.stat.size > maximum) {
      throw new Error(`Workflow package file ${item.path} exceeds its byte-size limit.`)
    }
  }
}

async function readStablePackageFile(
  fileSystem: WorkflowPackageFileSystem<unknown>,
  hostRoot: unknown,
  metadata: FileMetadata
): Promise<RawWorkflowPackageFile> {
  const snapshot = await readStableOpenedFile(
    fileSystem,
    hostRoot,
    metadata.segments,
    metadata.stat,
    normalizeContainmentRoot(metadata.physical),
    "workflow package file",
    normalizeContainmentRoot(metadata.physical)
  )
  const bytes = snapshot.bytes
  return objectFreeze({
    path: metadata.path,
    bytes,
    byteLength: bytes.byteLength,
    digest: digestBytes(bytes)
  })
}

function validatePathComponent(name: string): void {
  if (
    name.length === 0
    || name === "."
    || name === ".."
    || reflectBoolean(stringIncludes, name, "/")
    || reflectBoolean(stringIncludes, name, "\\")
    || testPattern(PATH_CONTROL_PATTERN, name)
  ) throw new Error("Workflow package path contains an invalid component.")
}

function digestBytes(bytes: Uint8Array): Sha256Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Sha256Digest
}

function digestPackageManifest(files: readonly RawWorkflowPackageFile[]): Sha256Digest {
  const entries: { readonly path: string; readonly digest: Sha256Digest }[] = []
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    pushValue(entries, objectFreeze({ path: file.path, digest: file.digest }))
  }
  return canonicalJsonDigest(objectFreeze({ files: objectFreeze(entries) })) as Sha256Digest
}
