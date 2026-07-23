import { decodeWorkflowPackagePointer } from "./packagePointer"
import {
  OWNER_MAX_BYTES,
  OWNER_SCHEMA_VERSION,
  POINTER_MAX_BYTES,
  WORKFLOW_PACKAGE_V2_LOAD_LIMITS,
  type LoadCurrentWorkflowPackageInput,
  type LoadWorkflowPackageCandidateInput,
  type LoadWorkflowPackageGenerationInput,
  type LoadWorkflowPackageResult,
  type RawWorkflowPackage,
  type RawWorkflowPackageFile,
  type WorkflowPackageCandidate
} from "./packageLoaderContract"
import {
  digest,
  fileSystemValue,
  identifier,
  ownershipToken,
  parseStrictJson,
  snapshotCandidate,
  snapshotRecord,
  stagingName
} from "./packageLoaderInput"
import {
  assertDirectoryChain,
  assertDirectoryKind,
  readStableControlFile,
  safeLstat,
  safeRealpath
} from "./packageLoaderIo"
import { loadCandidateSnapshot } from "./packageLoaderSnapshot"
import { objectHasOwn } from "./packageLoaderIntrinsics"
import { requireWorkflowPackageRootState } from "./packageRoot"

export {
  WORKFLOW_PACKAGE_V2_LOAD_LIMITS,
  type LoadCurrentWorkflowPackageInput,
  type LoadWorkflowPackageCandidateInput,
  type LoadWorkflowPackageGenerationInput,
  type LoadWorkflowPackageResult,
  type RawWorkflowPackage,
  type RawWorkflowPackageFile,
  type WorkflowPackageCandidate
}

const CURRENT_REQUIRED = ["fileSystem", "collectionRoot", "workflowId"] as const
const GENERATION_REQUIRED = ["fileSystem", "collectionRoot", "workflowId", "generation"] as const
const CANDIDATE_REQUIRED = ["fileSystem", "collectionRoot", "workflowId", "candidate"] as const
const EXPECTED_OPTIONAL = ["expectedPackageDigest"] as const

export async function loadCurrentWorkflowPackage(input: unknown): Promise<LoadWorkflowPackageResult> {
  const snapshot = snapshotRecord(
    input,
    CURRENT_REQUIRED,
    [],
    "Current workflow package load input"
  )
  const fileSystem = fileSystemValue(snapshot.fileSystem)
  const workflowId = identifier(
    snapshot.workflowId,
    "Current workflow package load input.workflowId"
  )
  const state = requireWorkflowPackageRootState(snapshot.collectionRoot, fileSystem)
  const slotPhysical = await assertDirectoryChain(fileSystem, state.hostRoot, [[workflowId]])
  const pointerSnapshot = await readStableControlFile(
    fileSystem,
    state.hostRoot,
    [workflowId, "current.json"],
    POINTER_MAX_BYTES,
    "current pointer",
    slotPhysical
  )
  const pointer = decodeWorkflowPackagePointer({
    workflowId,
    pointer: parseStrictJson(pointerSnapshot.bytes, "Current workflow package pointer")
  })
  return loadCandidateSnapshot(fileSystem, state.hostRoot, workflowId, {
    publication: "published",
    generation: pointer.generation,
    expectedPackageDigest: pointer.packageDigest,
    baseSegments: [workflowId, "versions", pointer.generation]
  })
}

export async function loadWorkflowPackageGeneration(input: unknown): Promise<LoadWorkflowPackageResult> {
  const snapshot = snapshotRecord(
    input,
    GENERATION_REQUIRED,
    EXPECTED_OPTIONAL,
    "Workflow package generation load input"
  )
  const fileSystem = fileSystemValue(snapshot.fileSystem)
  const workflowId = identifier(
    snapshot.workflowId,
    "Workflow package generation load input.workflowId"
  )
  const generation = digest(
    snapshot.generation,
    "Workflow package generation load input.generation"
  )
  const expectedPackageDigest = objectHasOwn(snapshot, "expectedPackageDigest")
    ? digest(
        snapshot.expectedPackageDigest,
        "Workflow package generation load input.expectedPackageDigest"
      )
    : undefined
  if (expectedPackageDigest !== undefined && expectedPackageDigest !== generation) {
    throw new TypeError("Expected package digest does not match the requested generation.")
  }
  const state = requireWorkflowPackageRootState(snapshot.collectionRoot, fileSystem)
  return loadCandidateSnapshot(fileSystem, state.hostRoot, workflowId, {
    publication: "published",
    generation,
    expectedPackageDigest,
    baseSegments: [workflowId, "versions", generation]
  })
}

export async function loadWorkflowPackageCandidate(input: unknown): Promise<LoadWorkflowPackageResult> {
  const snapshot = snapshotRecord(
    input,
    CANDIDATE_REQUIRED,
    EXPECTED_OPTIONAL,
    "Workflow package candidate load input"
  )
  const fileSystem = fileSystemValue(snapshot.fileSystem)
  const workflowId = identifier(
    snapshot.workflowId,
    "Workflow package candidate load input.workflowId"
  )
  const state = requireWorkflowPackageRootState(snapshot.collectionRoot, fileSystem)
  const expectedPackageDigest = objectHasOwn(snapshot, "expectedPackageDigest")
    ? digest(
        snapshot.expectedPackageDigest,
        "Workflow package candidate load input.expectedPackageDigest"
      )
    : undefined
  const candidate = snapshotCandidate(snapshot.candidate)
  if (candidate.kind === "published") {
    const generation = digest(
      candidate.generation,
      "Published workflow package candidate.generation"
    )
    if (expectedPackageDigest !== undefined && expectedPackageDigest !== generation) {
      throw new TypeError("Expected package digest does not match the published generation.")
    }
    return loadCandidateSnapshot(fileSystem, state.hostRoot, workflowId, {
      publication: "published",
      generation,
      expectedPackageDigest,
      baseSegments: [workflowId, "versions", generation]
    })
  }

  const name = stagingName(candidate.name)
  const token = ownershipToken(candidate.ownershipToken)
  const stagingBase = [workflowId, "versions", name] as const
  const stagingPhysical = await assertDirectoryChain(fileSystem, state.hostRoot, [
    [workflowId],
    [workflowId, "versions"],
    stagingBase
  ])
  const ownerSnapshot = await readStableControlFile(
    fileSystem,
    state.hostRoot,
    [...stagingBase, "owner.json"],
    OWNER_MAX_BYTES,
    "staging owner",
    stagingPhysical
  )
  const owner = snapshotRecord(
    parseStrictJson(ownerSnapshot.bytes, "Workflow package staging owner"),
    ["schemaVersion", "ownershipToken"],
    [],
    "Workflow package staging owner"
  )
  if (owner.schemaVersion !== OWNER_SCHEMA_VERSION) {
    throw new TypeError("Workflow package staging owner schemaVersion is invalid.")
  }
  if (ownershipToken(owner.ownershipToken) !== token) {
    throw new Error("Workflow package staging ownership token does not match.")
  }

  const stagingStat = await safeLstat(
    fileSystem,
    state.hostRoot,
    stagingBase,
    "staging directory"
  )
  assertDirectoryKind(stagingStat.kind, "staging directory")
  const loaded = await loadCandidateSnapshot(fileSystem, state.hostRoot, workflowId, {
    publication: "staging",
    generation: name,
    expectedPackageDigest,
    baseSegments: [...stagingBase, "package"]
  })

  const afterStagingStat = await safeLstat(
    fileSystem,
    state.hostRoot,
    stagingBase,
    "staging directory"
  )
  const afterStagingPhysical = await safeRealpath(
    fileSystem,
    state.hostRoot,
    stagingBase,
    "staging directory"
  )
  if (
    afterStagingStat.kind !== "directory"
    || afterStagingStat.identity !== stagingStat.identity
    || afterStagingPhysical !== stagingPhysical
  ) throw new Error("Workflow package staging authorization directory changed during package load.")

  const afterOwnerSnapshot = await readStableControlFile(
    fileSystem,
    state.hostRoot,
    [...stagingBase, "owner.json"],
    OWNER_MAX_BYTES,
    "staging owner",
    stagingPhysical
  )
  if (
    afterOwnerSnapshot.identity !== ownerSnapshot.identity
    || afterOwnerSnapshot.physical !== ownerSnapshot.physical
    || !equalBytes(afterOwnerSnapshot.bytes, ownerSnapshot.bytes)
  ) throw new Error("Workflow package staging owner changed during package load.")
  const afterOwner = snapshotRecord(
    parseStrictJson(afterOwnerSnapshot.bytes, "Workflow package staging owner"),
    ["schemaVersion", "ownershipToken"],
    [],
    "Workflow package staging owner"
  )
  if (
    afterOwner.schemaVersion !== OWNER_SCHEMA_VERSION
    || ownershipToken(afterOwner.ownershipToken) !== token
  ) throw new Error("Workflow package staging ownership authorization changed during package load.")

  return loaded
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}
