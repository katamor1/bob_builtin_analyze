import { createHash, type Hash } from "crypto"
import { constants, type BigIntStats } from "fs"
import * as fs from "fs/promises"
import * as path from "path"
import type { WorkflowRunState } from "../model"
import type {
  WorkflowRunDirectoryIdentity,
  WorkflowRunRetentionInspectionStatus,
  WorkflowRunRetentionInventoryItem,
  WorkflowRunRetentionStatus
} from "../retention/runRetention"
import { decodeWorkflowRunRetentionMetadata } from "../retention/runRetentionMetadata"
import { decodeWorkflowRunState } from "./runStateCodec"
import { assertSafeWorkflowRunId } from "./runStatePath"

const RUNS_ROOT_SEGMENTS = [".bob", "workflows", "runs"] as const
const RECOVERABLE_STATUSES = new Set<WorkflowRunRetentionStatus>(["running", "paused", "checkpoint", "reviewing", "held"])
const CAPTURED_FILES = new Set(["run.json", "retention.json"])
const PROVENANCE_SCHEMAS = new Map([
  ["workflow.artifactReuse", "workflow-register/artifact-reuse/v1"],
  ["workflow.artifactHydration", "workflow-register/artifact-hydration/v1"],
  ["workflow.taskSnapshotImport", "workflow-register/task-snapshot-import/v1"]
])

export interface WorkflowRunRetentionInventoryLimits {
  maxDepth: number
  maxEntries: number
  maxMetadataCaptureBytes: number
  maxFingerprintBytes: number
}

export const WORKFLOW_RUN_RETENTION_INVENTORY_LIMITS: Readonly<WorkflowRunRetentionInventoryLimits> = Object.freeze({
  maxDepth: 32,
  maxEntries: 10_000,
  maxMetadataCaptureBytes: 8 * 1024 * 1024,
  maxFingerprintBytes: 4 * 1024 * 1024
})

export interface WorkflowRunRetentionInventorySnapshot {
  inventory: WorkflowRunRetentionInventoryItem[]
  referenceGraphComplete: boolean
}

export interface WorkflowRunRetentionCandidatePhysicalEvidence {
  runId: string
  bytes: number
  revision: string
  retentionRevision: string
  journalPending: boolean
  lockPresent: boolean
  pathContained: boolean
  measurementComplete: boolean
  directoryIdentity: WorkflowRunDirectoryIdentity | null
  treeFingerprint: string
}

interface InternalInventoryEntry {
  rawEntryName: string
  run?: WorkflowRunState
  provenanceComplete: boolean
  item: WorkflowRunRetentionInventoryItem
}

interface PhysicalTreeMeasurement {
  bytes: number
  complete: boolean
  treeFingerprint: string
  captures: Map<string, StableFileCapture>
  topLevelEntries: Set<string>
}

interface TreeAccumulator {
  bytes: number
  complete: boolean
  fingerprint: Hash
  fingerprintStopped: boolean
  captures: Map<string, StableFileCapture>
  topLevelEntries: Set<string>
}

interface StableFileCapture {
  content: Buffer
  stable: boolean
}

interface CapturedFileRead {
  bytes: number
  complete: boolean
  capture?: StableFileCapture
}

interface InventoryScanBudget {
  readonly limits: WorkflowRunRetentionInventoryLimits
  entries: number
  metadataCaptureBytes: number
  fingerprintBytes: number
  entryLimitReached: boolean
  metadataCaptureLimitReached: boolean
  fingerprintLimitReached: boolean
}

interface BoundedDirectoryEntries {
  names: string[]
  complete: boolean
}

export async function inspectWorkflowRunRetentionInventory(
  workspaceRoot: string,
  requestedLimits: Partial<WorkflowRunRetentionInventoryLimits> = {}
): Promise<WorkflowRunRetentionInventorySnapshot> {
  const budget = createScanBudget(requestedLimits)
  const root = await fs.realpath(path.resolve(workspaceRoot))
  const runsRoot = path.join(root, ...RUNS_ROOT_SEGMENTS)
  let rootStat: BigIntStats
  try {
    rootStat = await fs.lstat(runsRoot, { bigint: true })
  } catch (error) {
    if (isMissingPathError(error)) {
      if (await missingRunsRootIsSafe(root)) return { inventory: [], referenceGraphComplete: true }
      return unsafeRootSnapshot(runsRoot, root, undefined, budget)
    }
    return unsafeRootSnapshot(runsRoot, root, undefined, budget)
  }

  if (rootStat.isSymbolicLink() || !rootStat.isDirectory() || !(await isDirectContainedPath(root, runsRoot))) {
    return unsafeRootSnapshot(runsRoot, root, rootStat, budget)
  }

  const rootEntries = await readBoundedDirectoryEntries(runsRoot, budget)
  if (!rootEntries.complete && rootEntries.names.length === 0 && !budget.entryLimitReached) {
    return unsafeRootSnapshot(runsRoot, root, rootStat, budget)
  }

  const entries: InternalInventoryEntry[] = []
  for (const rawEntryName of rootEntries.names) {
    const entryPath = path.join(runsRoot, rawEntryName)
    let entryStat: BigIntStats | undefined
    try {
      entryStat = await fs.lstat(entryPath, { bigint: true })
    } catch {
      entries.push(unsafeInventoryEntry(rawEntryName, emptyUnsafeMeasurement(rawEntryName), undefined))
      continue
    }
    if (
      isSafeRunId(rawEntryName)
      && entryStat.isDirectory()
      && !entryStat.isSymbolicLink()
      && await isDirectContainedPath(root, entryPath)
    ) {
      entries.push(await inspectRunDirectory(root, entryPath, rawEntryName, entryStat, budget))
      continue
    }
    entries.push(await inspectUnsafeEntry(root, entryPath, rawEntryName, entryStat, budget))
  }

  if (!rootEntries.complete) {
    entries.push(unsafeInventoryEntry("inventory-truncated", emptyUnsafeMeasurement("inventory-truncated"), undefined))
  }

  const rootStable = await sameDirectDirectory(root, runsRoot, rootStat)
  if (!rootStable || !rootEntries.complete) {
    for (const entry of entries) {
      entry.item.measurementComplete = false
      entry.item.pathContained = false
      entry.provenanceComplete = false
    }
    if (entries.length === 0) entries.push(unsafeInventoryEntry("runs-root-changed", emptyUnsafeMeasurement("runs-root-changed"), rootStat))
  }

  resolveSyntheticRunIdCollisions(entries)
  const referenceGraphComplete = rootStable
    && rootEntries.complete
    && entries.every((entry) => entry.provenanceComplete)
  const references = collectSourceRunReferences(entries.flatMap((entry) => entry.run ? [entry.run] : []))
  const inventory = entries.map((entry) => ({
    ...entry.item,
    referencedBy: references.get(entry.rawEntryName) ?? [],
    referenceGraphComplete
  })).sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || compareText(left.runId, right.runId))
  return { inventory, referenceGraphComplete }
}

export async function inspectWorkflowRunRetentionCandidatePhysicalEvidence(
  workspaceRoot: string,
  runId: string,
  requestedLimits: Partial<WorkflowRunRetentionInventoryLimits> = {}
): Promise<WorkflowRunRetentionCandidatePhysicalEvidence> {
  assertSafeWorkflowRunId(runId)
  const budget = createScanBudget(requestedLimits)
  const root = await fs.realpath(path.resolve(workspaceRoot))
  const runsRoot = path.join(root, ...RUNS_ROOT_SEGMENTS)
  let rootStat: BigIntStats
  try {
    rootStat = await fs.lstat(runsRoot, { bigint: true })
  } catch (error) {
    throw new Error("Workflow runs directory is missing or unreadable during cleanup revalidation.", { cause: error })
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory() || !(await isDirectContainedPath(root, runsRoot))) {
    throw new Error("Workflow runs directory is unsafe during cleanup revalidation.")
  }

  const directory = path.join(runsRoot, runId)
  const evidence = await inspectPhysicalDirectory(root, directory, runId, budget)
  if (!(await sameDirectDirectory(root, runsRoot, rootStat))) {
    throw new Error("Workflow runs directory changed during cleanup revalidation.")
  }
  return evidence
}

export async function inspectWorkflowRunRetentionDirectoryPhysicalEvidence(
  workspaceRoot: string,
  directory: string,
  runId: string,
  requestedLimits: Partial<WorkflowRunRetentionInventoryLimits> = {}
): Promise<WorkflowRunRetentionCandidatePhysicalEvidence> {
  assertSafeWorkflowRunId(runId)
  const root = await fs.realpath(path.resolve(workspaceRoot))
  const target = path.resolve(directory)
  if (!isContained(root, target)) {
    throw new Error(`Workflow run '${runId}' cleanup evidence path escapes the workflow workspace.`)
  }
  return inspectPhysicalDirectory(root, target, runId, createScanBudget(requestedLimits))
}

async function inspectPhysicalDirectory(
  root: string,
  directory: string,
  runId: string,
  budget: InventoryScanBudget
): Promise<WorkflowRunRetentionCandidatePhysicalEvidence> {
  let directoryStat: BigIntStats
  try {
    directoryStat = await fs.lstat(directory, { bigint: true })
  } catch (error) {
    throw new Error(`Workflow run '${runId}' directory is missing or unreadable during cleanup revalidation.`, { cause: error })
  }
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory() || !(await isDirectContainedPath(root, directory))) {
    throw new Error(`Workflow run '${runId}' directory is unsafe during cleanup revalidation.`)
  }
  const item = (await inspectRunDirectory(root, directory, runId, directoryStat, budget)).item
  return {
    runId: item.runId,
    bytes: item.bytes,
    revision: item.revision,
    retentionRevision: item.retentionRevision,
    journalPending: item.journalPending,
    lockPresent: item.lockPresent,
    pathContained: item.pathContained,
    measurementComplete: item.measurementComplete,
    directoryIdentity: item.directoryIdentity,
    treeFingerprint: item.treeFingerprint
  }
}

async function inspectRunDirectory(
  root: string,
  directory: string,
  runId: string,
  directoryStat: BigIntStats,
  budget: InventoryScanBudget
): Promise<InternalInventoryEntry> {
  const measurement = await measureDirectDirectoryTree(root, directory, directoryStat, budget)
  const rawRun = measurement.captures.get("run.json")
  const rawRetention = measurement.captures.get("retention.json")
  const runEntryPresent = measurement.topLevelEntries.has("run.json")
  const retentionEntryPresent = measurement.topLevelEntries.has("retention.json")
  let run: WorkflowRunState | undefined
  let inspectionStatus: WorkflowRunRetentionInspectionStatus = runEntryPresent ? "invalid" : "missing"
  let status: WorkflowRunRetentionStatus = "unknown"
  let updatedAt = timestampFromStat(directoryStat)
  let readOnly = true
  if (rawRun?.content) {
    try {
      const decoded = decodeWorkflowRunState(JSON.parse(rawRun.content.toString("utf8")), runId)
      if (!Number.isFinite(Date.parse(decoded.run.updatedAt))) throw new Error("invalid timestamp")
      run = decoded.run
      inspectionStatus = decoded.readOnly ? "future" : decoded.migrated ? "legacy" : "valid"
      status = decoded.run.status
      updatedAt = new Date(decoded.run.updatedAt).toISOString()
      readOnly = decoded.readOnly
    } catch {
      run = undefined
      inspectionStatus = "invalid"
    }
  }

  let pinned = false
  if (rawRetention?.content) {
    const decoded = decodeWorkflowRunRetentionMetadata(rawRetention.content.toString("utf8"))
    pinned = decoded.status === "valid" ? decoded.metadata.pinned : true
  } else if (retentionEntryPresent) {
    pinned = true
  }

  const revision = rawRun?.stable
    ? hashBytes(rawRun.content)
    : hashText(`${rawRun ? "unstable" : "missing"}-run.json\0${measurement.treeFingerprint}`)
  const retentionRevision = rawRetention?.stable
    ? hashBytes(rawRetention.content)
    : retentionEntryPresent ? "unstable" : "missing"
  const journalPending = measurement.topLevelEntries.has("run-state.journal.json")
  const item: WorkflowRunRetentionInventoryItem = {
    runId,
    status,
    updatedAt,
    bytes: measurement.bytes,
    revision,
    recoverable: RECOVERABLE_STATUSES.has(status),
    pinned,
    referencedBy: [],
    readOnly,
    journalPending,
    lockPresent: measurement.topLevelEntries.has("run.lock.json"),
    pathContained: measurement.complete,
    inspectionStatus,
    measurementComplete: measurement.complete,
    referenceGraphComplete: true,
    retentionRevision,
    directoryIdentity: identityFromStat(directoryStat),
    treeFingerprint: measurement.treeFingerprint
  }
  const provenanceComplete = run !== undefined
    && !readOnly
    && measurement.complete
    && rawRun?.stable === true
    && !journalPending
    && storedProvenanceComplete(run)
  return {
    rawEntryName: runId,
    run,
    provenanceComplete,
    item
  }
}

async function inspectUnsafeEntry(
  root: string,
  entryPath: string,
  rawEntryName: string,
  entryStat: BigIntStats,
  budget: InventoryScanBudget
): Promise<InternalInventoryEntry> {
  let measurement: PhysicalTreeMeasurement
  if (
    entryStat.isDirectory()
    && !entryStat.isSymbolicLink()
    && await isDirectContainedPath(root, entryPath)
  ) {
    measurement = await measureDirectDirectoryTree(root, entryPath, entryStat, budget)
  } else if (
    entryStat.isFile()
    && !entryStat.isSymbolicLink()
    && await isDirectContainedPath(root, entryPath)
  ) {
    const stable = await stableDirectFileMetadata(root, entryPath, entryStat)
    measurement = {
      bytes: safeStatSize(entryStat),
      complete: stable,
      treeFingerprint: hashText(stableJson(["file", stableStatRecord(entryStat), stable])),
      captures: new Map(),
      topLevelEntries: new Set()
    }
  } else {
    measurement = emptyUnsafeMeasurement(rawEntryName, entryStat)
  }
  return unsafeInventoryEntry(rawEntryName, measurement, entryStat)
}

async function unsafeRootSnapshot(
  runsRoot: string,
  root: string,
  rootStat: BigIntStats | undefined,
  budget: InventoryScanBudget
): Promise<WorkflowRunRetentionInventorySnapshot> {
  let entry: InternalInventoryEntry
  if (rootStat) entry = await inspectUnsafeEntry(root, runsRoot, "runs-root", rootStat, budget)
  else entry = unsafeInventoryEntry("runs-root", emptyUnsafeMeasurement("runs-root"), undefined)
  entry.item.referenceGraphComplete = false
  return { inventory: [entry.item], referenceGraphComplete: false }
}

function unsafeInventoryEntry(
  rawEntryName: string,
  measurement: PhysicalTreeMeasurement,
  stat: BigIntStats | undefined
): InternalInventoryEntry {
  const item: WorkflowRunRetentionInventoryItem = {
    runId: safeDisplayId(rawEntryName),
    status: "unknown",
    updatedAt: stat ? timestampFromStat(stat) : new Date(0).toISOString(),
    bytes: measurement.bytes,
    revision: hashText(`unsafe-entry\0${rawEntryName}\0${measurement.treeFingerprint}`),
    recoverable: false,
    pinned: false,
    referencedBy: [],
    readOnly: true,
    journalPending: false,
    lockPresent: false,
    pathContained: false,
    inspectionStatus: "unsafe",
    measurementComplete: measurement.complete,
    referenceGraphComplete: false,
    retentionRevision: "unavailable",
    directoryIdentity: stat?.isDirectory() ? identityFromStat(stat) : null,
    treeFingerprint: measurement.treeFingerprint
  }
  return { rawEntryName, provenanceComplete: false, item }
}

async function measureDirectDirectoryTree(
  root: string,
  directory: string,
  directoryStat: BigIntStats,
  budget: InventoryScanBudget
): Promise<PhysicalTreeMeasurement> {
  const accumulator: TreeAccumulator = {
    bytes: 0,
    complete: true,
    fingerprint: createHash("sha256"),
    fingerprintStopped: false,
    captures: new Map(),
    topLevelEntries: new Set()
  }
  await walkDirectDirectory(root, directory, directoryStat, [], accumulator, budget)
  return {
    bytes: accumulator.bytes,
    complete: accumulator.complete,
    treeFingerprint: `sha256:${accumulator.fingerprint.digest("hex")}`,
    captures: accumulator.captures,
    topLevelEntries: accumulator.topLevelEntries
  }
}

async function walkDirectDirectory(
  root: string,
  directory: string,
  directoryStat: BigIntStats,
  segments: string[],
  accumulator: TreeAccumulator,
  budget: InventoryScanBudget
): Promise<void> {
  const directoryRecord = segments.length === 0
    ? { ...identityFromStat(directoryStat), mode: directoryStat.mode.toString() }
    : stableStatRecord(directoryStat)
  if (!recordFingerprint(accumulator, budget, ["directory", segments, directoryRecord])) return
  const listing = await readBoundedDirectoryEntries(directory, budget)
  if (!listing.complete) {
    accumulator.complete = false
    recordFingerprint(accumulator, budget, ["directory-truncated-or-unreadable", segments])
  }
  for (const name of listing.names) {
    if (accumulator.fingerprintStopped) break
    const childSegments = [...segments, name]
    if (segments.length === 0) accumulator.topLevelEntries.add(name)
    const target = path.join(directory, name)
    let stat: BigIntStats
    try {
      stat = await fs.lstat(target, { bigint: true })
    } catch {
      accumulator.complete = false
      recordFingerprint(accumulator, budget, ["entry-unreadable", childSegments])
      continue
    }
    if (stat.isSymbolicLink()) {
      accumulator.complete = false
      recordFingerprint(accumulator, budget, ["symlink", childSegments, stableStatRecord(stat)])
      continue
    }
    if (stat.isDirectory()) {
      if (!(await isDirectContainedPath(root, target))) {
        accumulator.complete = false
        recordFingerprint(accumulator, budget, ["directory-alias", childSegments, stableStatRecord(stat)])
        continue
      }
      if (childSegments.length > budget.limits.maxDepth) {
        accumulator.complete = false
        recordFingerprint(accumulator, budget, ["depth-limit", childSegments, stableStatRecord(stat)])
        continue
      }
      await walkDirectDirectory(root, target, stat, childSegments, accumulator, budget)
      continue
    }
    if (stat.isFile()) {
      const fileBytes = safeStatSize(stat)
      accumulator.bytes = safeAdd(accumulator.bytes, fileBytes)
      if (!(await isDirectContainedPath(root, target))) {
        accumulator.complete = false
        recordFingerprint(accumulator, budget, ["file-alias", childSegments, stableStatRecord(stat)])
        continue
      }
      const capture = segments.length === 0 && CAPTURED_FILES.has(name)
      const metadataStable = await stableDirectFileMetadata(root, target, stat)
      if (!metadataStable) accumulator.complete = false
      if (!recordFingerprint(accumulator, budget, ["file", childSegments, stableStatRecord(stat), metadataStable])) continue
      if (!capture) continue
      const direct = await readCapturedFile(root, target, stat, budget)
      if (!direct.complete) accumulator.complete = false
      if (direct.capture) accumulator.captures.set(name, direct.capture)
      recordFingerprint(accumulator, budget, [
        "capture",
        childSegments,
        direct.complete && direct.capture?.stable
          ? hashBytes(direct.capture.content)
          : "unstable"
      ])
      continue
    }
    accumulator.complete = false
    recordFingerprint(accumulator, budget, ["unsupported", childSegments, stableStatRecord(stat)])
  }
  if (!(await sameDirectDirectory(root, directory, directoryStat))) {
    accumulator.complete = false
    recordFingerprint(accumulator, budget, ["directory-changed", segments])
  }
}

async function readCapturedFile(
  root: string,
  filePath: string,
  initialStat: BigIntStats,
  budget: InventoryScanBudget
): Promise<CapturedFileRead> {
  const fallbackBytes = safeStatSize(initialStat)
  const remainingCaptureBytes = budget.limits.maxMetadataCaptureBytes - budget.metadataCaptureBytes
  if (initialStat.size < 0n || initialStat.size > BigInt(remainingCaptureBytes)) {
    budget.metadataCaptureLimitReached = true
    return { bytes: fallbackBytes, complete: false }
  }
  const expectedBytes = Number(initialStat.size)
  budget.metadataCaptureBytes += expectedBytes
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    handle = await fs.open(filePath, constants.O_RDONLY | noFollow)
    const handleStat = await handle.stat({ bigint: true })
    if (!handleStat.isFile() || !sameStableVersion(initialStat, handleStat)) {
      return { bytes: fallbackBytes, complete: false }
    }
    const chunks: Buffer[] = []
    let bytes = 0
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, Math.max(expectedBytes, 1)))
    while (bytes < expectedBytes) {
      const length = Math.min(buffer.length, expectedBytes - bytes)
      const { bytesRead } = await handle.read(buffer, 0, length, bytes)
      if (bytesRead <= 0) break
      const chunk = buffer.subarray(0, bytesRead)
      chunks.push(Buffer.from(chunk))
      bytes = safeAdd(bytes, bytesRead)
    }
    const finalHandleStat = await handle.stat({ bigint: true })
    const current = await fs.lstat(filePath, { bigint: true })
    const complete = bytes === expectedBytes
      && finalHandleStat.isFile()
      && sameStableVersion(initialStat, finalHandleStat)
      && current.isFile()
      && !current.isSymbolicLink()
      && sameStableVersion(initialStat, current)
      && await isDirectContainedPath(root, filePath)
    const content = bytes === expectedBytes ? Buffer.concat(chunks, expectedBytes) : Buffer.concat(chunks)
    return {
      bytes: fallbackBytes,
      complete,
      capture: bytes === expectedBytes ? { content, stable: complete } : undefined
    }
  } catch {
    return { bytes: fallbackBytes, complete: false }
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

async function stableDirectFileMetadata(
  root: string,
  filePath: string,
  initialStat: BigIntStats
): Promise<boolean> {
  try {
    const current = await fs.lstat(filePath, { bigint: true })
    return current.isFile()
      && !current.isSymbolicLink()
      && sameStableVersion(initialStat, current)
      && await isDirectContainedPath(root, filePath)
  } catch {
    return false
  }
}

function collectSourceRunReferences(runs: readonly WorkflowRunState[]): Map<string, string[]> {
  const references = new Map<string, Set<string>>()
  for (const run of runs) {
    for (const [stateKey, expectedSchema] of PROVENANCE_SCHEMAS) {
      const raw = run.state[stateKey]
      if (raw === undefined) continue
      for (const sourceRunId of storedProvenanceSourceRunIds(stateKey, raw, expectedSchema) ?? []) {
        if (sourceRunId === run.runId) continue
        const referrers = references.get(sourceRunId) ?? new Set<string>()
        referrers.add(run.runId)
        references.set(sourceRunId, referrers)
      }
    }
  }
  return new Map([...references].map(([runId, referrers]) => [runId, [...referrers].sort(compareText)]))
}

function storedProvenanceSourceRunIds(
  stateKey: string,
  raw: string,
  expectedSchema: string
): string[] | undefined {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== expectedSchema || typeof record.sourceRunId !== "string" || !isSafeRunId(record.sourceRunId)) {
    return undefined
  }
  const sourceRunIds = new Set([record.sourceRunId])
  if (stateKey === "workflow.artifactHydration") {
    if (!Array.isArray(record.hydrated)) return undefined
    for (const rawEntry of record.hydrated) {
      if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) return undefined
      const sourceRunId = (rawEntry as Record<string, unknown>).sourceRunId
      if (typeof sourceRunId !== "string" || !isSafeRunId(sourceRunId)) return undefined
      sourceRunIds.add(sourceRunId)
    }
  }
  if (stateKey === "workflow.taskSnapshotImport" && !Array.isArray(record.imported)) return undefined
  return [...sourceRunIds]
}

function storedProvenanceComplete(run: WorkflowRunState): boolean {
  for (const [stateKey, expectedSchema] of PROVENANCE_SCHEMAS) {
    const raw = run.state[stateKey]
    if (raw === undefined) continue
    if (!storedProvenanceSourceRunIds(stateKey, raw, expectedSchema)) return false
  }
  return true
}

function emptyUnsafeMeasurement(rawEntryName: string, stat?: BigIntStats): PhysicalTreeMeasurement {
  return {
    bytes: 0,
    complete: false,
    treeFingerprint: hashText(stableJson(["unsafe", rawEntryName, stat ? identityFromStat(stat) : null])),
    captures: new Map(),
    topLevelEntries: new Set()
  }
}

function isSafeRunId(runId: string): boolean {
  if (runId.length > 256) return false
  try {
    assertSafeWorkflowRunId(runId)
    return true
  } catch {
    return false
  }
}

function safeDisplayId(rawEntryName: string): string {
  const printable = Array.from(rawEntryName.normalize("NFC").replace(/\p{C}/gu, "-"))
    .map((character) => /[A-Za-z0-9._-]/.test(character) ? character : "-")
    .join("")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
  const label = Array.from(printable || "unnamed").slice(0, 64).join("")
  const suffix = createHash("sha256").update(rawEntryName).digest("hex").slice(0, 12)
  return `unsafe-entry-${label}-${suffix}`
}

function resolveSyntheticRunIdCollisions(entries: InternalInventoryEntry[]): void {
  const used = new Set(entries
    .filter((entry) => entry.item.inspectionStatus !== "unsafe")
    .map((entry) => entry.item.runId))
  const unsafeEntries = entries
    .filter((entry) => entry.item.inspectionStatus === "unsafe")
    .sort((left, right) => compareText(left.rawEntryName, right.rawEntryName))
  for (const entry of unsafeEntries) {
    const base = entry.item.runId
    let resolved = base
    for (let attempt = 1; used.has(resolved); attempt += 1) {
      const suffix = `-${attempt}`
      resolved = `${base.slice(0, 256 - suffix.length)}${suffix}`
    }
    entry.item.runId = resolved
    used.add(resolved)
  }
}

function createScanBudget(requested: Partial<WorkflowRunRetentionInventoryLimits>): InventoryScanBudget {
  const limit = (name: keyof WorkflowRunRetentionInventoryLimits): number => {
    const hardLimit = WORKFLOW_RUN_RETENTION_INVENTORY_LIMITS[name]
    const value = requested[name]
    if (value === undefined) return hardLimit
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer`)
    return Math.min(value, hardLimit)
  }
  return {
    limits: {
      maxDepth: limit("maxDepth"),
      maxEntries: limit("maxEntries"),
      maxMetadataCaptureBytes: limit("maxMetadataCaptureBytes"),
      maxFingerprintBytes: limit("maxFingerprintBytes")
    },
    entries: 0,
    metadataCaptureBytes: 0,
    fingerprintBytes: 0,
    entryLimitReached: false,
    metadataCaptureLimitReached: false,
    fingerprintLimitReached: false
  }
}

async function readBoundedDirectoryEntries(
  directory: string,
  budget: InventoryScanBudget
): Promise<BoundedDirectoryEntries> {
  let handle: Awaited<ReturnType<typeof fs.opendir>> | undefined
  const names: string[] = []
  try {
    handle = await fs.opendir(directory)
    while (true) {
      const entry = await handle.read()
      if (!entry) return { names: names.sort(compareText), complete: true }
      if (budget.entries >= budget.limits.maxEntries) {
        budget.entryLimitReached = true
        return { names: names.sort(compareText), complete: false }
      }
      budget.entries += 1
      names.push(entry.name)
    }
  } catch {
    return { names: names.sort(compareText), complete: false }
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

function recordFingerprint(
  accumulator: TreeAccumulator,
  budget: InventoryScanBudget,
  record: unknown
): boolean {
  if (accumulator.fingerprintStopped) return false
  const payload = Buffer.from(stableJson(record), "utf8")
  const prefix = Buffer.from(`${payload.length}:`, "ascii")
  const recordBytes = prefix.length + payload.length
  const remaining = budget.limits.maxFingerprintBytes - budget.fingerprintBytes
  if (budget.fingerprintLimitReached || recordBytes > remaining) {
    budget.fingerprintLimitReached = true
    accumulator.fingerprintStopped = true
    accumulator.complete = false
    accumulator.fingerprint.update("inventory:fingerprint-limit")
    return false
  }
  budget.fingerprintBytes += recordBytes
  accumulator.fingerprint.update(prefix)
  accumulator.fingerprint.update(payload)
  return true
}

function stableStatRecord(stat: BigIntStats): Record<string, string> {
  return {
    dev: stat.dev.toString(),
    ino: stat.ino.toString(),
    size: stat.size.toString(),
    mtimeNs: stat.mtimeNs.toString(),
    ctimeNs: stat.ctimeNs.toString(),
    mode: stat.mode.toString()
  }
}

async function isDirectContainedPath(root: string, target: string): Promise<boolean> {
  try {
    const physical = await fs.realpath(target)
    return isContained(root, physical) && samePath(target, physical)
  } catch {
    return false
  }
}

async function missingRunsRootIsSafe(root: string): Promise<boolean> {
  let current = root
  for (const segment of RUNS_ROOT_SEGMENTS) {
    current = path.join(current, segment)
    let stat: BigIntStats
    try {
      stat = await fs.lstat(current, { bigint: true })
    } catch (error) {
      return isMissingPathError(error)
    }
    if (stat.isSymbolicLink() || !stat.isDirectory() || !(await isDirectContainedPath(root, current))) return false
  }
  return false
}

async function sameDirectDirectory(root: string, directory: string, expected: BigIntStats): Promise<boolean> {
  try {
    const current = await fs.lstat(directory, { bigint: true })
    return current.isDirectory()
      && !current.isSymbolicLink()
      && sameStableVersion(expected, current)
      && await isDirectContainedPath(root, directory)
  } catch {
    return false
  }
}

function identityFromStat(stat: BigIntStats): WorkflowRunDirectoryIdentity {
  return { dev: stat.dev.toString(), ino: stat.ino.toString() }
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function sameStableVersion(left: BigIntStats, right: BigIntStats): boolean {
  return sameIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
}

function safeStatSize(stat: BigIntStats): number {
  return stat.size <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(stat.size) : Number.MAX_SAFE_INTEGER
}

function safeAdd(left: number, right: number): number {
  const sum = left + right
  return Number.isSafeInteger(sum) ? sum : Number.MAX_SAFE_INTEGER
}

function timestampFromStat(stat: BigIntStats): string {
  const milliseconds = Number(stat.mtimeNs / 1_000_000n)
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : new Date(0).toISOString()
}

function hashBytes(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`
}

function hashText(value: string): string {
  return hashBytes(Buffer.from(value, "utf8"))
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort(compareText).map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function isContained(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string): string => process.platform === "win32"
    ? path.resolve(value).toLocaleLowerCase()
    : path.resolve(value)
  return normalize(left) === normalize(right)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isMissingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === "ENOENT" || code === "ENOTDIR"
}
