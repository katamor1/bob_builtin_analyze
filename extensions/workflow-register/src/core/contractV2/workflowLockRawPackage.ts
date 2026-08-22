import { canonicalJsonDigest } from "./canonicalJson"
import { preflightDenseWorkflowLockArrayLength } from "./workflowLockArrayPreflight"
import type { Sha256Digest } from "./providerContract"
import type { LockedFileEvidence } from "./workflowLockContract"
import {
  WorkflowLockRawPackageEvidenceError,
  compareWorkflowLockText,
  freezeWorkflowLockEvidence,
  snapshotDenseWorkflowLockArray,
  snapshotExactWorkflowLockRecord,
  snapshotWorkflowLockBytes,
  testWorkflowLockPattern,
  workflowLockBufferByteLength,
  workflowLockDigestBytes,
  workflowLockNumberIsSafeInteger,
  workflowLockPush,
  workflowLockSort,
  workflowLockStringSlice
} from "./workflowLockSnapshotUtilities"

export interface WorkflowLockFileSnapshot {
  readonly path: string
  readonly bytes: Uint8Array
  readonly byteLength: number
  readonly digest: Sha256Digest
}

export interface WorkflowLockRawPackageSnapshot {
  readonly publication: "published" | "staging"
  readonly workflowId: string
  readonly generation: Sha256Digest
  readonly packageDigest: Sha256Digest
  readonly files: readonly WorkflowLockFileSnapshot[]
}

export const WORKFLOW_LOCK_SCHEMA_PATH_PATTERN = /^schemas\/[A-Za-z0-9._-]+\.json$/u

const RAW_PACKAGE_FIELDS = freezeWorkflowLockEvidence([
  "publication", "workflowId", "generation", "packageDigest", "files"
] as const)
const RAW_FILE_FIELDS = freezeWorkflowLockEvidence(["path", "bytes", "byteLength", "digest"] as const)
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u
const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const PROMPT_PATH_PATTERN = /^prompts\/[A-Za-z0-9._-]+\.md$/u
const MAX_FILES = 512
const MAX_TOTAL_BYTES = 33_554_432

export { WorkflowLockRawPackageEvidenceError }

export function snapshotWorkflowLockRawPackage(value: unknown): WorkflowLockRawPackageSnapshot {
  const record = snapshotExactWorkflowLockRecord(value, RAW_PACKAGE_FIELDS, "Workflow raw package")
  if (record.publication !== "published" && record.publication !== "staging") {
    throw new TypeError("Workflow raw package publication is invalid.")
  }
  const workflowId = workflowLockIdentifier(record.workflowId, "Workflow raw package workflowId")
  const generation = workflowLockDigest(record.generation, "Workflow raw package generation")
  const packageDigest = workflowLockDigest(record.packageDigest, "Workflow raw package packageDigest")
  if (generation !== packageDigest) throw new WorkflowLockRawPackageEvidenceError()

  preflightDenseWorkflowLockArrayLength(record.files, MAX_FILES, "Workflow raw package files")
  const fileInputs = snapshotDenseWorkflowLockArray(record.files, MAX_FILES, "Workflow raw package files")
  const files: WorkflowLockFileSnapshot[] = []
  let totalBytes = 0
  for (let index = 0; index < fileInputs.length; index += 1) {
    const fileRecord = snapshotExactWorkflowLockRecord(
      fileInputs[index],
      RAW_FILE_FIELDS,
      `Workflow raw package file at index ${index}`
    )
    const path = workflowLockPackagePath(fileRecord.path)
    const maximum = path === "workflow.yaml" || path === "workflow.lock.json"
      ? 1_048_576
      : 4_194_304
    const bytes = snapshotWorkflowLockBytes(fileRecord.bytes, maximum)
    const byteLength = fileRecord.byteLength
    if (
      typeof byteLength !== "number"
      || !workflowLockNumberIsSafeInteger(byteLength)
      || byteLength !== bytes.byteLength
      || byteLength < 1
      || byteLength > maximum
    ) throw new WorkflowLockRawPackageEvidenceError()
    totalBytes += byteLength
    if (!workflowLockNumberIsSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_BYTES) {
      throw new WorkflowLockRawPackageEvidenceError()
    }
    const expectedDigest = workflowLockDigestBytes(bytes)
    if (fileRecord.digest !== expectedDigest) throw new WorkflowLockRawPackageEvidenceError()
    workflowLockPush(files, freezeWorkflowLockEvidence({
      path,
      bytes,
      byteLength,
      digest: expectedDigest
    }))
  }
  workflowLockSort(files, (left, right) => compareWorkflowLockText(left.path, right.path))
  validateRawFileSet(files)

  const manifestFiles: { readonly path: string; readonly digest: Sha256Digest }[] = []
  for (let index = 0; index < files.length; index += 1) {
    workflowLockPush(manifestFiles, freezeWorkflowLockEvidence({
      path: files[index].path,
      digest: files[index].digest
    }))
  }
  const computedPackageDigest = canonicalJsonDigest(freezeWorkflowLockEvidence({
    files: freezeWorkflowLockEvidence(manifestFiles)
  })) as Sha256Digest
  if (computedPackageDigest !== packageDigest) throw new WorkflowLockRawPackageEvidenceError()

  return freezeWorkflowLockEvidence({
    publication: record.publication,
    workflowId,
    generation,
    packageDigest,
    files: freezeWorkflowLockEvidence(files)
  })
}

export function workflowLockFileByPath(
  rawPackage: WorkflowLockRawPackageSnapshot,
  path: string
): WorkflowLockFileSnapshot | undefined {
  for (let index = 0; index < rawPackage.files.length; index += 1) {
    if (rawPackage.files[index].path === path) return rawPackage.files[index]
  }
  return undefined
}

export function workflowLockFileEvidence(
  rawPackage: WorkflowLockRawPackageSnapshot,
  kind: "prompt" | "schema"
): readonly LockedFileEvidence[] {
  const result: LockedFileEvidence[] = []
  const prefix = kind === "prompt" ? "prompts/" : "schemas/"
  const suffix = kind === "prompt" ? ".md" : ".json"
  for (let index = 0; index < rawPackage.files.length; index += 1) {
    const file = rawPackage.files[index]
    const matches = kind === "prompt"
      ? testWorkflowLockPattern(PROMPT_PATH_PATTERN, file.path)
      : testWorkflowLockPattern(WORKFLOW_LOCK_SCHEMA_PATH_PATTERN, file.path)
    if (!matches) continue
    const id = workflowLockStringSlice(file.path, prefix.length, file.path.length - suffix.length)
    workflowLockPush(result, freezeWorkflowLockEvidence({
      id,
      path: file.path,
      bytes: file.byteLength,
      digest: file.digest
    }))
  }
  workflowLockSort(result, compareFileEvidence)
  return freezeWorkflowLockEvidence(result)
}

function validateRawFileSet(files: readonly WorkflowLockFileSnapshot[]): void {
  let workflowCount = 0
  let lockCount = 0
  for (let index = 0; index < files.length; index += 1) {
    if (index > 0 && files[index - 1].path === files[index].path) {
      throw new WorkflowLockRawPackageEvidenceError()
    }
    if (files[index].path === "workflow.yaml") workflowCount += 1
    if (files[index].path === "workflow.lock.json") lockCount += 1
  }
  if (workflowCount !== 1 || lockCount !== 1) throw new WorkflowLockRawPackageEvidenceError()
}

function workflowLockPackagePath(value: unknown): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || workflowLockBufferByteLength(value, "utf8") > 240
    || !(
      value === "workflow.yaml"
      || value === "workflow.lock.json"
      || testWorkflowLockPattern(PROMPT_PATH_PATTERN, value)
      || testWorkflowLockPattern(WORKFLOW_LOCK_SCHEMA_PATH_PATTERN, value)
    )
  ) throw new TypeError("Workflow raw package file path is invalid.")
  return value
}

function workflowLockIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 128
    || !testWorkflowLockPattern(IDENTIFIER_PATTERN, value)
  ) {
    throw new TypeError(`${label} is invalid.`)
  }
  return value
}

function workflowLockDigest(value: unknown, label: string): Sha256Digest {
  if (typeof value !== "string" || !testWorkflowLockPattern(DIGEST_PATTERN, value)) {
    throw new TypeError(`${label} is not a canonical sha256 digest.`)
  }
  return value as Sha256Digest
}

function compareFileEvidence(left: LockedFileEvidence, right: LockedFileEvidence): number {
  const byId = compareWorkflowLockText(left.id, right.id)
  return byId !== 0 ? byId : compareWorkflowLockText(left.path, right.path)
}
