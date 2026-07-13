import { createHash } from "crypto"
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
  ["workflow.artifactHydration", "workflow-register/artifact-hydration/v1"]
])

export interface WorkflowRunRetentionInventorySnapshot {
  inventory: WorkflowRunRetentionInventoryItem[]
  referenceGraphComplete: boolean
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
  captures: Map<string, Buffer>
  topLevelEntries: Set<string>
}

interface TreeAccumulator {
  bytes: number
  complete: boolean
  records: unknown[]
  captures: Map<string, Buffer>
  topLevelEntries: Set<string>
}

interface DirectFileRead {
  bytes: number
  complete: boolean
  contentHash: string
  captured?: Buffer
}

export async function inspectWorkflowRunRetentionInventory(
  workspaceRoot: string
): Promise<WorkflowRunRetentionInventorySnapshot> {
  const root = await fs.realpath(path.resolve(workspaceRoot))
  const runsRoot = path.join(root, ...RUNS_ROOT_SEGMENTS)
  let rootStat: BigIntStats
  try {
    rootStat = await fs.lstat(runsRoot, { bigint: true })
  } catch (error) {
    if (isMissingPathError(error)) {
      if (await missingRunsRootIsSafe(root)) return { inventory: [], referenceGraphComplete: true }
      return unsafeRootSnapshot(runsRoot, root, undefined)
    }
    return unsafeRootSnapshot(runsRoot, root, undefined)
  }

  if (rootStat.isSymbolicLink() || !rootStat.isDirectory() || !(await isDirectContainedPath(root, runsRoot))) {
    return unsafeRootSnapshot(runsRoot, root, rootStat)
  }

  let names: string[]
  try {
    names = (await fs.readdir(runsRoot)).sort(compareText)
  } catch {
    return unsafeRootSnapshot(runsRoot, root, rootStat)
  }

  const entries: InternalInventoryEntry[] = []
  for (const rawEntryName of names) {
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
      entries.push(await inspectRunDirectory(root, entryPath, rawEntryName, entryStat))
      continue
    }
    entries.push(await inspectUnsafeEntry(root, entryPath, rawEntryName, entryStat))
  }

  const rootStable = await sameDirectDirectory(root, runsRoot, rootStat)
  if (!rootStable) {
    for (const entry of entries) {
      entry.item.measurementComplete = false
      entry.item.pathContained = false
      entry.provenanceComplete = false
    }
    if (entries.length === 0) entries.push(unsafeInventoryEntry("runs-root-changed", emptyUnsafeMeasurement("runs-root-changed"), rootStat))
  }

  const referenceGraphComplete = rootStable && entries.every((entry) => entry.provenanceComplete)
  const references = collectSourceRunReferences(entries.flatMap((entry) => entry.run ? [entry.run] : []))
  const inventory = entries.map((entry) => ({
    ...entry.item,
    referencedBy: references.get(entry.rawEntryName) ?? [],
    referenceGraphComplete
  })).sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || compareText(left.runId, right.runId))
  return { inventory, referenceGraphComplete }
}

async function inspectRunDirectory(
  root: string,
  directory: string,
  runId: string,
  directoryStat: BigIntStats
): Promise<InternalInventoryEntry> {
  const measurement = await measureDirectDirectoryTree(root, directory, directoryStat)
  const rawRun = measurement.captures.get("run.json")
  const rawRetention = measurement.captures.get("retention.json")
  const runEntryPresent = measurement.topLevelEntries.has("run.json")
  const retentionEntryPresent = measurement.topLevelEntries.has("retention.json")
  let run: WorkflowRunState | undefined
  let inspectionStatus: WorkflowRunRetentionInspectionStatus = runEntryPresent ? "invalid" : "missing"
  let status: WorkflowRunRetentionStatus = "unknown"
  let updatedAt = timestampFromStat(directoryStat)
  let readOnly = true
  if (rawRun) {
    try {
      const decoded = decodeWorkflowRunState(JSON.parse(rawRun.toString("utf8")), runId)
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
  if (rawRetention) {
    const decoded = decodeWorkflowRunRetentionMetadata(rawRetention.toString("utf8"))
    pinned = decoded.status === "valid" ? decoded.metadata.pinned : true
  } else if (retentionEntryPresent) {
    pinned = true
  }

  const revision = rawRun ? hashBytes(rawRun) : hashText(`missing-run.json\0${measurement.treeFingerprint}`)
  const retentionRevision = rawRetention ? hashBytes(rawRetention) : retentionEntryPresent ? "unsafe" : "missing"
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
  entryStat: BigIntStats
): Promise<InternalInventoryEntry> {
  let measurement: PhysicalTreeMeasurement
  if (
    entryStat.isDirectory()
    && !entryStat.isSymbolicLink()
    && await isDirectContainedPath(root, entryPath)
  ) {
    measurement = await measureDirectDirectoryTree(root, entryPath, entryStat)
  } else if (
    entryStat.isFile()
    && !entryStat.isSymbolicLink()
    && await isDirectContainedPath(root, entryPath)
  ) {
    const direct = await readDirectFile(root, entryPath, entryStat, false)
    measurement = {
      bytes: direct.bytes,
      complete: direct.complete,
      treeFingerprint: hashText(stableJson(["file", identityFromStat(entryStat), direct.bytes, direct.contentHash, direct.complete])),
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
  rootStat: BigIntStats | undefined
): Promise<WorkflowRunRetentionInventorySnapshot> {
  let entry: InternalInventoryEntry
  if (rootStat) entry = await inspectUnsafeEntry(root, runsRoot, "runs-root", rootStat)
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
  directoryStat: BigIntStats
): Promise<PhysicalTreeMeasurement> {
  const accumulator: TreeAccumulator = {
    bytes: 0,
    complete: true,
    records: [],
    captures: new Map(),
    topLevelEntries: new Set()
  }
  await walkDirectDirectory(root, directory, directoryStat, [], accumulator)
  return {
    bytes: accumulator.bytes,
    complete: accumulator.complete,
    treeFingerprint: hashText(stableJson(accumulator.records)),
    captures: accumulator.captures,
    topLevelEntries: accumulator.topLevelEntries
  }
}

async function walkDirectDirectory(
  root: string,
  directory: string,
  directoryStat: BigIntStats,
  segments: string[],
  accumulator: TreeAccumulator
): Promise<void> {
  accumulator.records.push(["directory", segments, identityFromStat(directoryStat)])
  let names: string[]
  try {
    names = (await fs.readdir(directory)).sort(compareText)
  } catch {
    accumulator.complete = false
    accumulator.records.push(["directory-unreadable", segments])
    return
  }
  for (const name of names) {
    const childSegments = [...segments, name]
    if (segments.length === 0) accumulator.topLevelEntries.add(name)
    const target = path.join(directory, name)
    let stat: BigIntStats
    try {
      stat = await fs.lstat(target, { bigint: true })
    } catch {
      accumulator.complete = false
      accumulator.records.push(["entry-unreadable", childSegments])
      continue
    }
    if (stat.isSymbolicLink()) {
      accumulator.complete = false
      accumulator.records.push(["symlink", childSegments, identityFromStat(stat)])
      continue
    }
    if (stat.isDirectory()) {
      if (!(await isDirectContainedPath(root, target))) {
        accumulator.complete = false
        accumulator.records.push(["directory-alias", childSegments, identityFromStat(stat)])
        continue
      }
      await walkDirectDirectory(root, target, stat, childSegments, accumulator)
      if (!(await sameDirectDirectory(root, target, stat))) accumulator.complete = false
      continue
    }
    if (stat.isFile()) {
      if (!(await isDirectContainedPath(root, target))) {
        accumulator.complete = false
        accumulator.records.push(["file-alias", childSegments, identityFromStat(stat), safeStatSize(stat)])
        continue
      }
      const capture = segments.length === 0 && CAPTURED_FILES.has(name)
      const direct = await readDirectFile(root, target, stat, capture)
      accumulator.bytes = safeAdd(accumulator.bytes, direct.bytes)
      if (!direct.complete) accumulator.complete = false
      accumulator.records.push([
        "file",
        childSegments,
        identityFromStat(stat),
        direct.bytes,
        direct.contentHash,
        direct.complete
      ])
      if (capture && direct.captured) accumulator.captures.set(name, direct.captured)
      continue
    }
    accumulator.complete = false
    accumulator.records.push(["unsupported", childSegments, identityFromStat(stat)])
  }
  if (!(await sameDirectDirectory(root, directory, directoryStat))) accumulator.complete = false
}

async function readDirectFile(
  root: string,
  filePath: string,
  initialStat: BigIntStats,
  capture: boolean
): Promise<DirectFileRead> {
  const fallbackBytes = safeStatSize(initialStat)
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    handle = await fs.open(filePath, constants.O_RDONLY | noFollow)
    const handleStat = await handle.stat({ bigint: true })
    if (!handleStat.isFile() || !sameStableVersion(initialStat, handleStat)) {
      return { bytes: fallbackBytes, complete: false, contentHash: hashText("identity-changed") }
    }
    const contentHash = createHash("sha256")
    const chunks: Buffer[] = []
    let bytes = 0
    const buffer = Buffer.allocUnsafe(64 * 1024)
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null)
      if (bytesRead === 0) break
      const chunk = buffer.subarray(0, bytesRead)
      contentHash.update(chunk)
      if (capture) chunks.push(Buffer.from(chunk))
      bytes = safeAdd(bytes, bytesRead)
    }
    const current = await fs.lstat(filePath, { bigint: true })
    const complete = current.isFile()
      && !current.isSymbolicLink()
      && sameStableVersion(initialStat, current)
      && BigInt(bytes) === initialStat.size
      && await isDirectContainedPath(root, filePath)
    return {
      bytes,
      complete,
      contentHash: `sha256:${contentHash.digest("hex")}`,
      captured: capture ? Buffer.concat(chunks) : undefined
    }
  } catch {
    return { bytes: fallbackBytes, complete: false, contentHash: hashText("unreadable") }
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

function collectSourceRunReferences(runs: readonly WorkflowRunState[]): Map<string, string[]> {
  const references = new Map<string, Set<string>>()
  for (const run of runs) {
    for (const raw of Object.values(run.state)) {
      for (const sourceRunId of sourceRunIdsFromValue(raw)) {
        if (sourceRunId === run.runId) continue
        const referrers = references.get(sourceRunId) ?? new Set<string>()
        referrers.add(run.runId)
        references.set(sourceRunId, referrers)
      }
    }
  }
  return new Map([...references].map(([runId, referrers]) => [runId, [...referrers].sort(compareText)]))
}

function sourceRunIdsFromValue(value: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return []
  }
  const output = new Set<string>()
  const visit = (current: unknown, depth: number, seen: Set<unknown>): void => {
    if (!current || typeof current !== "object" || depth > 8 || seen.has(current)) return
    seen.add(current)
    if (Array.isArray(current)) {
      current.forEach((item) => visit(item, depth + 1, seen))
      return
    }
    const record = current as Record<string, unknown>
    if (typeof record.sourceRunId === "string" && isSafeRunId(record.sourceRunId)) output.add(record.sourceRunId)
    Object.values(record).forEach((item) => visit(item, depth + 1, seen))
  }
  visit(parsed, 0, new Set())
  return [...output]
}

function storedProvenanceComplete(run: WorkflowRunState): boolean {
  for (const [stateKey, expectedSchema] of PROVENANCE_SCHEMAS) {
    const raw = run.state[stateKey]
    if (raw === undefined) continue
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      return false
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const record = value as Record<string, unknown>
    if (record.schemaVersion !== expectedSchema || typeof record.sourceRunId !== "string" || !isSafeRunId(record.sourceRunId)) {
      return false
    }
    if (stateKey !== "workflow.artifactHydration") continue
    if (!Array.isArray(record.hydrated)) return false
    for (const rawEntry of record.hydrated) {
      if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) return false
      const sourceRunId = (rawEntry as Record<string, unknown>).sourceRunId
      if (typeof sourceRunId !== "string" || !isSafeRunId(sourceRunId)) return false
    }
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
