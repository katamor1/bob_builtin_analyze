import { canonicalJsonBytes } from "./canonicalJson"
import {
  createWorkflowContractV2Diagnostic,
  type WorkflowContractV2Diagnostic
} from "./diagnostics"
import { parseStrictJson } from "./packageLoaderInput"
import type { Sha256Digest } from "./providerContract"
import { firstWorkflowLockDifference, workflowLockBytesEqual } from "./workflowLockComparison"
import { generateWorkflowPackageLockFromSnapshot } from "./workflowLockGeneration"
import {
  decodeWorkflowPackageLock,
  WORKFLOW_COMPILER_CONTRACT_VERSION,
  WORKFLOW_COMPILER_POLICY_VERSIONS,
  type WorkflowPackageLock
} from "./workflowLockShape"
import {
  snapshotWorkflowLockGenerationInput,
  workflowLockFileByPath,
  WorkflowLockRawPackageEvidenceError,
  type GenerateWorkflowPackageLockInput,
  type VerifyWorkflowPackageLockInput,
  type WorkflowPackageLockBobInput
} from "./workflowLockSnapshot"

export {
  WORKFLOW_COMPILER_CONTRACT_VERSION,
  WORKFLOW_COMPILER_POLICY_VERSIONS,
  type GenerateWorkflowPackageLockInput,
  type VerifyWorkflowPackageLockInput,
  type WorkflowPackageLockBobInput
}

export type VerifyWorkflowPackageLockResult =
  | {
      readonly ok: true
      readonly lock: WorkflowPackageLock
      readonly lockfileDigest: Sha256Digest
      readonly diagnostics: readonly []
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly [WorkflowContractV2Diagnostic]
    }

const BufferConstructor = Buffer
const bufferFrom = Buffer.from
const objectFreeze = Object.freeze
const reflectApply = Reflect.apply
const EMPTY_DIAGNOSTICS = objectFreeze([]) as readonly []

export function generateWorkflowPackageLock(
  input: GenerateWorkflowPackageLockInput
): WorkflowPackageLock {
  return generateWorkflowPackageLockFromSnapshot(
    snapshotWorkflowLockGenerationInput(input)
  )
}

export function encodeWorkflowPackageLock(lock: WorkflowPackageLock): Buffer {
  const decoded = decodeWorkflowPackageLock(lock)
  return reflectApply(bufferFrom, BufferConstructor, [canonicalJsonBytes(decoded)]) as Buffer
}

export function verifyWorkflowPackageLock(
  input: VerifyWorkflowPackageLockInput
): VerifyWorkflowPackageLockResult {
  let snapshot: ReturnType<typeof snapshotWorkflowLockGenerationInput>
  try {
    snapshot = snapshotWorkflowLockGenerationInput(input)
  } catch (error) {
    if (error instanceof WorkflowLockRawPackageEvidenceError) return mismatch("")
    throw error
  }

  const lockFile = workflowLockFileByPath(snapshot.rawPackage, "workflow.lock.json")
  if (lockFile === undefined) return mismatch("")
  const expected = generateWorkflowPackageLockFromSnapshot(snapshot)

  let parsed: unknown
  try {
    parsed = parseStrictJson(lockFile.bytes, "Workflow package lock")
  } catch {
    return mismatch("")
  }

  const pointer = firstWorkflowLockDifference(parsed, expected)
  if (pointer !== undefined) return mismatch(pointer)

  let decoded: WorkflowPackageLock
  try {
    decoded = decodeWorkflowPackageLock(parsed)
  } catch {
    return mismatch("")
  }
  const canonical = encodeWorkflowPackageLock(decoded)
  if (!workflowLockBytesEqual(lockFile.bytes, canonical)) return mismatch("")

  return objectFreeze({
    ok: true as const,
    lock: decoded,
    lockfileDigest: lockFile.digest,
    diagnostics: EMPTY_DIAGNOSTICS
  })
}

function mismatch(pointer: string): VerifyWorkflowPackageLockResult {
  const diagnostic = createWorkflowContractV2Diagnostic({
    code: "WF2_LOCK_MISMATCH",
    severity: "error",
    message: "Workflow package lock does not match the compiled package evidence.",
    location: objectFreeze({ path: "workflow.lock.json", pointer })
  })
  return objectFreeze({
    ok: false as const,
    diagnostics: objectFreeze([diagnostic]) as readonly [WorkflowContractV2Diagnostic]
  })
}
