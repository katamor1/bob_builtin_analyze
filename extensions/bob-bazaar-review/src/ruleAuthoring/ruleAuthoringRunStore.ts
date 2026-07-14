import { createHash, randomBytes } from "node:crypto"
import { constants as fsConstants, readFileSync, readlinkSync } from "node:fs"
import * as fs from "node:fs/promises"
import { hostname, networkInterfaces } from "node:os"
import * as path from "node:path"
import { getRuleAuthoringPaths, RuleAuthoringPaths, validateRuleAuthoringId } from "./ruleAuthoringPaths"
import {
  RULE_AUTHORING_SCHEMA_VERSION,
  RuleAuthoringPhase,
  RuleAuthoringPhaseStatus
} from "./ruleAuthoringTypes"

const PHASE_ORDER: readonly RuleAuthoringPhase[] = [
  "sources",
  "extraction",
  "evidence_selection",
  "proposal",
  "human_review",
  "apply",
  "completed"
]
const PHASE_STATUSES = new Set<RuleAuthoringPhaseStatus>([
  "not_started",
  "in_progress",
  "completed",
  "blocked",
  "failed",
  "skipped"
])
const ARTIFACT_KEYS = [
  "sourceManifest",
  "documentChunks",
  "sourceIndex",
  "evidenceSelection",
  "selectedEvidence",
  "ruleProposalRaw",
  "ruleProposal",
  "proposalValidation",
  "proposalDecisions",
  "applyPreview",
  "applyManifest"
] as const
const TOP_LEVEL_REQUIRED_KEYS = [
  "schemaVersion",
  "workspaceRoot",
  "runId",
  "currentPhase",
  "phases",
  "artifacts",
  "warnings",
  "issues",
  "createdAt",
  "updatedAt"
] as const
const SAFE_CODE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/
const WINDOWS_RESERVED_ARTIFACT_SEGMENT = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i
const WINDOWS_FORBIDDEN_ARTIFACT_CHARACTER = /[<>:"|?*]/
const MAX_CODES = 100
const MAX_CODE_BYTES = 128
const MAX_ARTIFACT_PATH_BYTES = 1024
const MAX_ARTIFACT_PATH_SEGMENT_BYTES = 255
const MAX_RUN_FILE_BYTES = 1024 * 1024
const MAX_RUN_LOCK_RECORD_BYTES = 4096
const IGNORE_CONTENT = "/*\n!/.gitignore\n"
const RUN_WRITE_LOCKS = new Map<string, Promise<void>>()
const RUN_LOCK_SCHEMA_VERSION = "bob-bazaar-review/run-lock/v1" as const
const RUN_LOCK_CLOSED_SCHEMA_VERSION = "bob-bazaar-review/run-lock-closed/v1" as const
const RUN_LOCK_RETRY_COUNT = 200
const RUN_LOCK_RETRY_DELAY_MS = 10
const RUN_LOCK_SNAPSHOT_RETRY_COUNT = 3
const RUN_LOCK_TOKEN = /^[a-f0-9]{32}$/
const RUN_LOCK_SCOPE = /^[a-f0-9]{64}$/
const RUN_LOCK_GENERATION_WIDTH = 12
const RUN_LOCK_GENERATION_PATTERN = /^\.authoring-run\.lock\.(\d{12})$/
const RUN_LOCK_CLOSED_PATTERN = /^\.authoring-run\.lock\.(\d{12})\.closed$/
const RUN_LOCK_OWNER_PATTERN = /^\.authoring-run\.lock-owner\.([a-f0-9]{64})\.(\d+)\.([a-f0-9]{32})\.owner$/
const RUN_LOCK_OWNER_PREFIX = ".authoring-run.lock-owner."
const MAX_RUN_LOCK_GENERATIONS = 10_000
const MAX_RUN_LOCK_OWNER_FILES = 256
const MAX_RUN_DIRECTORY_ENTRIES = (MAX_RUN_LOCK_GENERATIONS * 2) + MAX_RUN_LOCK_OWNER_FILES + 128
const NON_ZERO_MAC_ADDRESS = /^(?!00:00:00:00:00:00$)[a-f0-9]{2}(?::[a-f0-9]{2}){5}$/
const RUN_LOCK_SCOPE_ID = currentRunLockScopeId()

// Generation and closure paths are immutable. Recovery only appends a closure
// tombstone, so a delayed reclaimer can never unlink a newer owner's lock.

export interface RuleAuthoringPhaseProgress {
  status: RuleAuthoringPhaseStatus
  startedAt?: string
  completedAt?: string
}

export type RuleAuthoringPhaseMap = Record<RuleAuthoringPhase, RuleAuthoringPhaseProgress>

export type RuleAuthoringArtifactKey = typeof ARTIFACT_KEYS[number]
export type RuleAuthoringArtifacts = Partial<Record<RuleAuthoringArtifactKey, string>>

export interface RuleAuthoringRunIssue {
  phase: RuleAuthoringPhase
  code: string
  retryable: boolean
  recordedAt: string
}

export interface RuleAuthoringRunV1 {
  schemaVersion: typeof RULE_AUTHORING_SCHEMA_VERSION
  workspaceRoot: string
  runId: string
  workflowRunId?: string
  currentPhase: RuleAuthoringPhase
  phases: RuleAuthoringPhaseMap
  artifacts: RuleAuthoringArtifacts
  warnings: string[]
  issues: RuleAuthoringRunIssue[]
  createdAt: string
  updatedAt: string
}

export interface CreateRuleAuthoringRunInput {
  workspaceRoot: string
  runId: string
  workflowRunId?: string
  now?: string
}

export async function createRuleAuthoringRun(
  input: CreateRuleAuthoringRunInput
): Promise<RuleAuthoringRunV1> {
  const workspaceRoot = path.resolve(input.workspaceRoot)
  const runId = validateRuleAuthoringId(input.runId, "runId")
  if (input.workflowRunId !== undefined) validateRuleAuthoringId(input.workflowRunId, "workflowRunId")
  const timestamp = canonicalTimestamp(input.now ?? new Date().toISOString(), "createdAt")
  const phases = Object.fromEntries(PHASE_ORDER.map((phase) => [
    phase,
    phase === "sources" ? { status: "in_progress", startedAt: timestamp } : { status: "not_started" }
  ])) as RuleAuthoringPhaseMap
  const run: RuleAuthoringRunV1 = {
    schemaVersion: RULE_AUTHORING_SCHEMA_VERSION,
    workspaceRoot,
    runId,
    currentPhase: "sources",
    phases,
    artifacts: {},
    warnings: [],
    issues: [],
    createdAt: timestamp,
    updatedAt: timestamp
  }
  if (input.workflowRunId !== undefined) run.workflowRunId = input.workflowRunId

  const paths = getRuleAuthoringPaths(workspaceRoot, runId)
  await ensureSafeDirectoryChain(workspaceRoot, paths.runDirectory)
  await ensureMissingOnlyIgnoreFile(workspaceRoot, paths.authoringDirectory)
  await withRunWriteLock(paths.authoringRunPath, async () => {
    await withInterprocessRunLock(paths, async () => {
      if (await pathExists(paths.authoringRunPath)) {
        throw new Error("Rule authoring run already exists")
      }
      await writeRunFile(run, paths, undefined)
    })
  })
  return run
}

export async function readRuleAuthoringRun(paths: RuleAuthoringPaths): Promise<RuleAuthoringRunV1> {
  const workspaceRoot = workspaceRootFromPaths(paths)
  const runId = validateRuleAuthoringId(path.basename(paths.runDirectory), "runId")
  const expected = getRuleAuthoringPaths(workspaceRoot, runId)
  if (path.resolve(paths.authoringRunPath) !== expected.authoringRunPath) {
    throw new Error("Rule authoring run path does not match its trusted identity")
  }
  const expectedIdentity = await assertSafeRegularFile(workspaceRoot, expected.authoringRunPath)
  let parsed: unknown
  try {
    const handle = await fs.open(
      expected.authoringRunPath,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
    )
    try {
      const openedIdentity = fileIdentityFromStats(await handle.stat())
      const currentIdentity = await regularFileIdentity(expected.authoringRunPath)
      await assertExistingDirectoryChain(workspaceRoot, expected.runDirectory)
      if (
        !sameIdentity(expectedIdentity, openedIdentity) ||
        !sameIdentity(openedIdentity, currentIdentity)
      ) {
        throw new Error("Rule authoring run file changed while it was opened")
      }
      const raw = await readBoundedUtf8(handle, MAX_RUN_FILE_BYTES, "Rule authoring run file")
      const afterIdentity = await regularFileIdentity(expected.authoringRunPath)
      await assertExistingDirectoryChain(workspaceRoot, expected.runDirectory)
      if (!sameIdentity(openedIdentity, afterIdentity)) {
        throw new Error("Rule authoring run file changed while it was read")
      }
      parsed = JSON.parse(raw)
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ELOOP") {
      throw new Error("Rule authoring run file must not be a symbolic link")
    }
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse rule authoring run JSON")
    }
    throw error
  }
  assertRuleAuthoringRun(parsed)
  if (
    path.resolve(parsed.workspaceRoot) !== workspaceRoot ||
    parsed.runId !== runId
  ) {
    throw new Error("Rule authoring run identity does not match its trusted path")
  }
  return parsed
}

export async function writeRuleAuthoringRun(
  input: RuleAuthoringRunV1,
  expectedUpdatedAt?: string
): Promise<string> {
  assertRuleAuthoringRun(input)
  const run = cloneRun(input)
  const paths = getRuleAuthoringPaths(run.workspaceRoot, run.runId)
  return withRunWriteLock(paths.authoringRunPath, async () => {
    await ensureSafeDirectoryChain(run.workspaceRoot, paths.runDirectory)
    await ensureMissingOnlyIgnoreFile(run.workspaceRoot, paths.authoringDirectory)
    return withInterprocessRunLock(paths, async () => {
      let current: RuleAuthoringRunV1 | undefined
      if (await pathExists(paths.authoringRunPath)) {
        current = await readRuleAuthoringRun(paths)
      }
      if (expectedUpdatedAt !== undefined) {
        if (!current || current.updatedAt !== expectedUpdatedAt) {
          throw new Error("Rule authoring run changed since it was loaded")
        }
      }
      if (current) {
        assertRunTransition(current, run)
        const currentProgress = run.phases[run.currentPhase]
        if (currentProgress.status === "failed" || currentProgress.status === "blocked") {
          run.artifacts = { ...current.artifacts }
        }
      }
      await writeRunFile(run, paths, current)
      return paths.authoringRunPath
    })
  })
}

export async function listIncompleteRuleAuthoringRuns(
  workspaceRoot: string
): Promise<RuleAuthoringRunV1[]> {
  const root = path.resolve(workspaceRoot)
  const probePaths = getRuleAuthoringPaths(root, "run-probe")
  const runsStat = await lstatOptional(probePaths.runsDirectory)
  if (!runsStat) return []
  if (runsStat.isSymbolicLink()) throw new Error("Rule authoring runs directory must not be a symbolic link")
  if (!runsStat.isDirectory()) throw new Error("Rule authoring runs path must be a directory")
  await assertExistingDirectoryChain(root, probePaths.runsDirectory)
  await assertPhysicalContainment(root, probePaths.runsDirectory)

  const entries = await fs.readdir(probePaths.runsDirectory, { withFileTypes: true })
  const runs: RuleAuthoringRunV1[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    let runId: string
    try {
      runId = validateRuleAuthoringId(entry.name, "runId")
    } catch {
      continue
    }
    try {
      const run = await readRuleAuthoringRun(getRuleAuthoringPaths(root, runId))
      if (run.currentPhase !== "completed") runs.push(run)
    } catch {
      // Malformed or unsafe children are available only to explicit recovery tooling.
    }
  }
  return runs.sort((left, right) => {
    const timestampOrder = Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    if (timestampOrder) return timestampOrder
    return left.runId < right.runId ? -1 : left.runId > right.runId ? 1 : 0
  })
}

export function assertRuleAuthoringRun(value: unknown): asserts value is RuleAuthoringRunV1 {
  if (!isPlainObject(value)) throw strictSchemaError()
  const allowedTopLevelKeys = new Set<string>([...TOP_LEVEL_REQUIRED_KEYS, "workflowRunId"])
  if (
    TOP_LEVEL_REQUIRED_KEYS.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !allowedTopLevelKeys.has(key))
  ) {
    throw strictSchemaError()
  }
  if (value.schemaVersion !== RULE_AUTHORING_SCHEMA_VERSION) throw strictSchemaError()
  if (typeof value.workspaceRoot !== "string" || !path.isAbsolute(value.workspaceRoot)) throw strictSchemaError()
  if (typeof value.runId !== "string") throw strictSchemaError()
  validateRuleAuthoringId(value.runId, "runId")
  if (value.workflowRunId !== undefined) {
    if (typeof value.workflowRunId !== "string") throw strictSchemaError()
    validateRuleAuthoringId(value.workflowRunId, "workflowRunId")
  }
  if (!isPhase(value.currentPhase)) throw strictSchemaError()
  assertPhaseMap(value.phases, value.currentPhase)
  assertArtifacts(value.artifacts)
  assertSafeCodes(value.warnings, "warnings")
  assertIssues(value.issues)
  const currentStatus = (value.phases as RuleAuthoringPhaseMap)[value.currentPhase].status
  if (
    (currentStatus === "failed" || currentStatus === "blocked") &&
    !(value.issues as RuleAuthoringRunIssue[]).some((issue) => issue.phase === value.currentPhase)
  ) {
    throw new Error("A failed or blocked rule authoring phase requires a matching bounded issue")
  }
  canonicalTimestamp(value.createdAt, "createdAt")
  canonicalTimestamp(value.updatedAt, "updatedAt")
  if (Date.parse(value.updatedAt) < Date.parse(value.createdAt)) throw strictSchemaError()
}

function assertPhaseMap(value: unknown, currentPhase: RuleAuthoringPhase): asserts value is RuleAuthoringPhaseMap {
  if (!isPlainObject(value) || !hasExactKeys(value, PHASE_ORDER)) throw strictSchemaError()
  const currentIndex = PHASE_ORDER.indexOf(currentPhase)
  for (const [index, phase] of PHASE_ORDER.entries()) {
    const progress = value[phase]
    if (!isPlainObject(progress)) throw strictSchemaError()
    const allowedKeys = new Set(["status", "startedAt", "completedAt"])
    if (Object.keys(progress).some((key) => !allowedKeys.has(key))) throw strictSchemaError()
    if (!PHASE_STATUSES.has(progress.status as RuleAuthoringPhaseStatus)) throw strictSchemaError()
    if (progress.startedAt !== undefined) canonicalTimestamp(progress.startedAt, `${phase}.startedAt`)
    if (progress.completedAt !== undefined) canonicalTimestamp(progress.completedAt, `${phase}.completedAt`)
    const status = progress.status as RuleAuthoringPhaseStatus
    if (index < currentIndex && status !== "completed" && status !== "skipped") throw strictSchemaError()
    if (index > currentIndex && status !== "not_started") throw strictSchemaError()
    if (index === currentIndex && status === "not_started") throw strictSchemaError()
  }
  if (currentPhase === "completed" && value.completed.status !== "completed") throw strictSchemaError()
}

function assertArtifacts(value: unknown): asserts value is RuleAuthoringArtifacts {
  if (!isPlainObject(value)) throw strictSchemaError()
  const allowed = new Set<string>(ARTIFACT_KEYS)
  for (const [key, artifactPath] of Object.entries(value)) {
    if (
      !allowed.has(key) ||
      typeof artifactPath !== "string" ||
      Buffer.byteLength(artifactPath, "utf8") > MAX_ARTIFACT_PATH_BYTES ||
      !isSafeRelativeArtifact(artifactPath)
    ) {
      throw new Error("Rule authoring artifacts require a bounded workspace-relative artifact name")
    }
  }
}

function assertIssues(value: unknown): asserts value is RuleAuthoringRunIssue[] {
  if (!Array.isArray(value) || value.length > MAX_CODES) throw strictSchemaError()
  for (const issue of value) {
    if (!isPlainObject(issue) || !hasExactKeys(issue, ["phase", "code", "retryable", "recordedAt"])) {
      throw strictSchemaError()
    }
    if (!isPhase(issue.phase) || typeof issue.retryable !== "boolean") throw strictSchemaError()
    assertSafeCode(issue.code, "issue code")
    canonicalTimestamp(issue.recordedAt, "issue.recordedAt")
  }
}

function assertSafeCodes(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length > MAX_CODES) throw strictSchemaError()
  for (const code of value) assertSafeCode(code, label)
}

function assertSafeCode(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > MAX_CODE_BYTES ||
    !SAFE_CODE.test(value)
  ) {
    throw new Error(`Rule authoring ${label} must be a bounded safe code`)
  }
}

function assertRunTransition(previous: RuleAuthoringRunV1, next: RuleAuthoringRunV1): void {
  if (previous.runId !== next.runId || path.resolve(previous.workspaceRoot) !== path.resolve(next.workspaceRoot)) {
    throw new Error("Rule authoring run identity cannot change")
  }
  if (previous.createdAt !== next.createdAt) throw new Error("Rule authoring run createdAt cannot change")
  if (Date.parse(next.updatedAt) <= Date.parse(previous.updatedAt)) {
    throw new Error("Rule authoring run updatedAt must advance")
  }
  if (PHASE_ORDER.indexOf(next.currentPhase) < PHASE_ORDER.indexOf(previous.currentPhase)) {
    throw new Error("Rule authoring run phase must not move backwards")
  }
  for (const phase of PHASE_ORDER) {
    const previousStatus = previous.phases[phase].status
    if (
      (previousStatus === "completed" || previousStatus === "skipped") &&
      next.phases[phase].status !== previousStatus
    ) {
      throw new Error("Rule authoring run phase status must not move backwards")
    }
  }
}

async function writeRunFile(
  run: RuleAuthoringRunV1,
  paths: RuleAuthoringPaths,
  previous: RuleAuthoringRunV1 | undefined
): Promise<void> {
  assertRuleAuthoringRun(run)
  const serialized = `${JSON.stringify(run, null, 2)}\n`
  if (Buffer.byteLength(serialized, "utf8") > MAX_RUN_FILE_BYTES) {
    throw new Error("Rule authoring run file exceeds its byte limit")
  }
  await assertExistingDirectoryChain(run.workspaceRoot, paths.runDirectory)
  const runDirectoryIdentity = await directoryIdentity(paths.runDirectory)
  const previousIdentity = previous ? await regularFileIdentity(paths.authoringRunPath) : undefined
  const temporaryPath = path.join(
    paths.runDirectory,
    `.authoring-run.${process.pid}.${randomBytes(8).toString("hex")}.tmp`
  )
  let handle: fs.FileHandle | undefined
  let temporaryIdentity: FileIdentity | undefined
  try {
    await assertDirectoryIdentity(paths.runDirectory, runDirectoryIdentity)
    handle = await fs.open(temporaryPath, "wx", 0o600)
    await handle.writeFile(serialized, "utf8")
    await handle.sync()
    temporaryIdentity = fileIdentityFromStats(await handle.stat())
    await handle.close()
    handle = undefined
    await assertExistingDirectoryChain(run.workspaceRoot, paths.runDirectory)
    await assertDirectoryIdentity(paths.runDirectory, runDirectoryIdentity)
    const currentTemporaryIdentity = await regularFileIdentity(temporaryPath)
    if (!sameIdentity(temporaryIdentity, currentTemporaryIdentity)) {
      throw new Error("Rule authoring run temporary file changed before rename")
    }
    const currentIdentity = await regularFileIdentity(paths.authoringRunPath)
    if (!sameIdentity(previousIdentity, currentIdentity)) {
      throw new Error("Rule authoring run changed during atomic replacement")
    }
    await fs.rename(temporaryPath, paths.authoringRunPath)
    await assertDirectoryIdentity(paths.runDirectory, runDirectoryIdentity)
    const installedIdentity = await assertSafeRegularFile(run.workspaceRoot, paths.authoringRunPath)
    if (!sameIdentity(temporaryIdentity, installedIdentity)) {
      throw new Error("Rule authoring run changed during atomic replacement")
    }
  } catch (error) {
    await handle?.close().catch(() => undefined)
    if (await directoryIdentityMatches(paths.runDirectory, runDirectoryIdentity)) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    }
    throw error
  }
}

async function ensureMissingOnlyIgnoreFile(workspaceRoot: string, authoringDirectory: string): Promise<void> {
  await ensureSafeDirectoryChain(workspaceRoot, authoringDirectory)
  const ignorePath = path.join(authoringDirectory, ".gitignore")
  const existing = await lstatOptional(ignorePath)
  if (existing) {
    if (existing.isSymbolicLink()) throw new Error("Rule authoring .gitignore must not be a symbolic link")
    if (!existing.isFile()) throw new Error("Rule authoring .gitignore must be a regular file")
    return
  }
  try {
    await fs.writeFile(ignorePath, IGNORE_CONTENT, { encoding: "utf8", flag: "wx", mode: 0o600 })
  } catch (error) {
    if (!isNodeError(error) || error.code !== "EEXIST") throw error
    const raced = await fs.lstat(ignorePath)
    if (raced.isSymbolicLink() || !raced.isFile()) {
      throw new Error("Rule authoring .gitignore must be a regular file, not a symbolic link")
    }
  }
}

async function ensureSafeDirectoryChain(workspaceRoot: string, directory: string): Promise<void> {
  const root = path.resolve(workspaceRoot)
  const target = path.resolve(directory)
  assertLexicallyContained(root, target)
  const rootStats = await fs.lstat(root)
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error("Rule authoring workspace root must be a physical directory")
  }
  const relative = path.relative(root, target)
  let current = root
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    let stats = await lstatOptional(current)
    if (!stats) {
      try {
        await fs.mkdir(current)
      } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") throw error
      }
      stats = await fs.lstat(current)
    }
    if (stats.isSymbolicLink()) throw new Error("Rule authoring path must not contain a symbolic link")
    if (!stats.isDirectory()) throw new Error("Rule authoring path parent must be a directory")
    await assertPhysicalContainment(root, current)
  }
}

async function assertSafeRegularFile(workspaceRoot: string, filePath: string): Promise<FileIdentity> {
  await assertExistingDirectoryChain(workspaceRoot, path.dirname(filePath))
  const stats = await fs.lstat(filePath)
  if (stats.isSymbolicLink()) throw new Error("Rule authoring run file must not be a symbolic link")
  if (!stats.isFile()) throw new Error("Rule authoring run path must be a regular file")
  await assertPhysicalContainment(workspaceRoot, filePath)
  const after = await fs.lstat(filePath)
  const beforeIdentity = fileIdentityFromStats(stats)
  const afterIdentity = fileIdentityFromStats(after)
  if (!after.isFile() || !sameIdentity(beforeIdentity, afterIdentity)) {
    throw new Error("Rule authoring run file changed while its path was verified")
  }
  return afterIdentity
}

async function assertExistingDirectoryChain(workspaceRoot: string, directory: string): Promise<void> {
  const root = path.resolve(workspaceRoot)
  const target = path.resolve(directory)
  assertLexicallyContained(root, target)
  let current = root
  for (const segment of path.relative(root, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    const stats = await fs.lstat(current)
    if (stats.isSymbolicLink()) throw new Error("Rule authoring path must not contain a symbolic link")
    if (!stats.isDirectory()) throw new Error("Rule authoring path parent must be a directory")
  }
  await assertPhysicalContainment(root, target)
}

async function assertPhysicalContainment(workspaceRoot: string, target: string): Promise<void> {
  const rootRealPath = await fs.realpath(path.resolve(workspaceRoot))
  const targetRealPath = await fs.realpath(target)
  if (!isContained(rootRealPath, targetRealPath)) {
    throw new Error("Rule authoring path violates physical containment")
  }
}

function assertLexicallyContained(root: string, target: string): void {
  if (!isContained(root, target)) throw new Error("Rule authoring path escapes the workspace")
}

function isContained(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

function workspaceRootFromPaths(paths: RuleAuthoringPaths): string {
  return path.resolve(paths.reviewDirectory, "..", "..")
}

function isSafeRelativeArtifact(value: string): boolean {
  if (
    !value ||
    path.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    CONTROL_CHARACTER.test(value) ||
    value.includes("\\")
  ) return false
  const normalized = path.posix.normalize(value)
  if (normalized !== value || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return false
  }
  return value.split("/").every((segment) => (
    segment.length > 0 &&
    Buffer.byteLength(segment, "utf8") <= MAX_ARTIFACT_PATH_SEGMENT_BYTES &&
    segment.trim() === segment &&
    !/[. ]$/.test(segment) &&
    !WINDOWS_FORBIDDEN_ARTIFACT_CHARACTER.test(segment) &&
    !WINDOWS_RESERVED_ARTIFACT_SEGMENT.test(segment)
  ))
}

function canonicalTimestamp(value: unknown, _label: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw strictSchemaError()
  }
  return value
}

function isPhase(value: unknown): value is RuleAuthoringPhase {
  return typeof value === "string" && (PHASE_ORDER as readonly string[]).includes(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function strictSchemaError(): Error {
  return new Error("Rule authoring run must match the strict schema")
}

function cloneRun(run: RuleAuthoringRunV1): RuleAuthoringRunV1 {
  return JSON.parse(JSON.stringify(run)) as RuleAuthoringRunV1
}

async function lstatOptional(target: string): Promise<import("node:fs").Stats | undefined> {
  try {
    return await fs.lstat(target)
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined
    throw error
  }
}

async function pathExists(target: string): Promise<boolean> {
  return (await lstatOptional(target)) !== undefined
}

interface FileIdentity { device: string; inode: string }

function fileIdentityFromStats(stats: import("node:fs").Stats): FileIdentity {
  return { device: String(stats.dev), inode: String(stats.ino) }
}

async function directoryIdentity(target: string): Promise<FileIdentity> {
  const stats = await fs.lstat(target)
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error("Rule authoring run directory must be a physical directory")
  }
  return fileIdentityFromStats(stats)
}

async function assertDirectoryIdentity(target: string, expected: FileIdentity): Promise<void> {
  const current = await directoryIdentity(target)
  if (!sameIdentity(current, expected)) {
    throw new Error("Rule authoring run directory changed during filesystem I/O")
  }
}

async function directoryIdentityMatches(target: string, expected: FileIdentity): Promise<boolean> {
  try {
    return sameIdentity(await directoryIdentity(target), expected)
  } catch {
    return false
  }
}

async function regularFileIdentity(target: string): Promise<FileIdentity | undefined> {
  const stats = await lstatOptional(target)
  if (!stats) return undefined
  if (stats.isSymbolicLink()) throw new Error("Rule authoring run file must not be a symbolic link")
  if (!stats.isFile()) throw new Error("Rule authoring run path must be a regular file")
  return fileIdentityFromStats(stats)
}

function sameIdentity(left: FileIdentity | undefined, right: FileIdentity | undefined): boolean {
  if (!left || !right) return left === right
  return left.device === right.device && left.inode === right.inode
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

async function readBoundedUtf8(
  handle: fs.FileHandle,
  maxBytes: number,
  label: string
): Promise<string> {
  const stats = await handle.stat()
  if (!stats.isFile()) throw new Error(`${label} must be a regular file`)
  if (stats.size > maxBytes) throw new Error(`${label} exceeds its byte limit`)

  const buffer = Buffer.allocUnsafe(maxBytes + 1)
  let offset = 0
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset)
    if (bytesRead === 0) break
    offset += bytesRead
  }
  if (offset > maxBytes) throw new Error(`${label} exceeds its byte limit`)
  return buffer.subarray(0, offset).toString("utf8")
}

async function withRunWriteLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = RUN_WRITE_LOCKS.get(key) ?? Promise.resolve()
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => gate)
  RUN_WRITE_LOCKS.set(key, tail)
  await previous
  try {
    return await action()
  } finally {
    release?.()
    if (RUN_WRITE_LOCKS.get(key) === tail) RUN_WRITE_LOCKS.delete(key)
  }
}

async function withInterprocessRunLock<T>(
  paths: RuleAuthoringPaths,
  action: () => Promise<T>
): Promise<T> {
  await cleanupAbandonedRunLockOwners(paths.runDirectory)
  const owner = await createRunLockOwner(paths.runDirectory)
  let acquired: RunLockGeneration | undefined
  try {
    for (let attempt = 0; attempt < RUN_LOCK_RETRY_COUNT; attempt += 1) {
      acquired = await tryAcquireRunLockGeneration(paths.runDirectory, owner)
      if (acquired) break
      if (attempt === RUN_LOCK_RETRY_COUNT - 1) {
        throw new Error("Rule authoring run is busy in another process")
      }
      await delay(RUN_LOCK_RETRY_DELAY_MS)
    }
    if (!acquired) throw new Error("Rule authoring run lock could not be acquired")

    const lockIdentity = await regularFileIdentity(acquired.lockPath)
    if (!lockIdentity || !sameIdentity(lockIdentity, owner.identity)) {
      throw new Error("Rule authoring run lock identity is invalid")
    }

    let result!: T
    let actionError: unknown
    try {
      result = await action()
    } catch (error) {
      actionError = error
    }
    let releaseError: unknown
    try {
      await closeRunLockGeneration(paths.runDirectory, acquired, owner.record)
      acquired = undefined
    } catch (error) {
      releaseError = error
    }
    if (actionError !== undefined && releaseError !== undefined) {
      throw new AggregateError([actionError, releaseError], "Rule authoring action and lock release both failed")
    }
    if (actionError !== undefined) throw actionError
    if (releaseError !== undefined) throw releaseError
    return result
  } finally {
    if (acquired) {
      await closeRunLockGeneration(paths.runDirectory, acquired, owner.record)
    }
    await fs.rm(owner.ownerPath, { force: true })
  }
}

async function cleanupAbandonedRunLockOwners(runDirectory: string): Promise<void> {
  let directoryEntries = 0
  let ownerEntries = 0
  const directory = await fs.opendir(runDirectory)
  for await (const entry of directory) {
    directoryEntries += 1
    if (directoryEntries > MAX_RUN_DIRECTORY_ENTRIES) {
      throw new Error("Rule authoring run directory entry limit was reached")
    }
    if (!entry.name.startsWith(RUN_LOCK_OWNER_PREFIX)) continue
    ownerEntries += 1
    if (ownerEntries > MAX_RUN_LOCK_OWNER_FILES) {
      throw new Error("Rule authoring run lock owner file limit was reached")
    }
    const match = RUN_LOCK_OWNER_PATTERN.exec(entry.name)
    if (!match) continue
    const ownerPath = path.join(runDirectory, entry.name)
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error("Rule authoring run lock owner must be a regular file")
    }

    const [, scopeId, pidText, token] = match
    const pid = Number(pidText)
    let remove = false
    if (scopeId === RUN_LOCK_SCOPE_ID && Number.isSafeInteger(pid) && pid > 0) {
      try {
        const record = await readRunLockRecord(ownerPath)
        remove = (
          record.scope_id === scopeId &&
          record.pid === pid &&
          record.token === token &&
          !isProcessAlive(record.pid)
        )
      } catch {
        // Malformed or partially written owners are retained and count toward the hard cap.
      }
    }
    if (remove) {
      await fs.rm(ownerPath, { force: true })
    }
  }
}

interface RunLockOwner {
  ownerPath: string
  identity: FileIdentity
  record: {
    schema_version: typeof RUN_LOCK_SCHEMA_VERSION
    pid: number
    token: string
    scope_id: string
    created_at: string
  }
}

async function createRunLockOwner(runDirectory: string): Promise<RunLockOwner> {
  const token = randomBytes(16).toString("hex")
  const ownerPath = path.join(
    runDirectory,
    `.authoring-run.lock-owner.${RUN_LOCK_SCOPE_ID}.${process.pid}.${token}.owner`
  )
  const record = {
    schema_version: RUN_LOCK_SCHEMA_VERSION,
    pid: process.pid,
    token,
    scope_id: RUN_LOCK_SCOPE_ID,
    created_at: new Date().toISOString()
  }
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(ownerPath, "wx", 0o600)
    await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8")
    await handle.sync()
    const stats = await handle.stat()
    await handle.close()
    handle = undefined
    return {
      ownerPath,
      identity: { device: String(stats.dev), inode: String(stats.ino) },
      record
    }
  } catch (error) {
    await handle?.close().catch(() => undefined)
    await fs.rm(ownerPath, { force: true }).catch(() => undefined)
    throw error
  }
}

interface RunLockGeneration {
  generation: number
  lockPath: string
  closedPath: string
  identity?: FileIdentity
}

async function tryAcquireRunLockGeneration(
  runDirectory: string,
  owner: RunLockOwner
): Promise<RunLockGeneration | undefined> {
  const generations = await readRunLockGenerations(runDirectory)
  let nextGeneration = 1
  if (generations.length > 0) {
    const latest = generations[generations.length - 1]
    const record = await readRunLockRecord(latest.lockPath)
    if (await pathExists(latest.closedPath)) {
      await assertClosedRunLockRecord(latest, record)
      nextGeneration = latest.generation + 1
    } else if (record.scope_id !== RUN_LOCK_SCOPE_ID) {
      throw new Error("Rule authoring run lock belongs to another process scope")
    } else if (isProcessAlive(record.pid)) {
      return undefined
    } else {
      await closeRunLockGeneration(runDirectory, latest, record)
      nextGeneration = latest.generation + 1
    }
  }
  if (nextGeneration > MAX_RUN_LOCK_GENERATIONS) {
    throw new Error("Rule authoring run lock generation limit was reached")
  }

  const lockPath = runLockGenerationPath(runDirectory, nextGeneration)
  try {
    await fs.link(owner.ownerPath, lockPath)
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") return undefined
    throw error
  }
  const identity = await regularFileIdentity(lockPath)
  if (!identity || !sameIdentity(identity, owner.identity)) {
    throw new Error("Rule authoring run lock identity is invalid")
  }
  await fs.rm(owner.ownerPath, { force: true }).catch(() => undefined)
  return {
    generation: nextGeneration,
    lockPath,
    closedPath: `${lockPath}.closed`,
    identity
  }
}

class RetryableRunLockSnapshotError extends Error {}

async function readRunLockGenerations(runDirectory: string): Promise<RunLockGeneration[]> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await readRunLockGenerationsOnce(runDirectory)
    } catch (error) {
      if (!(error instanceof RetryableRunLockSnapshotError) || attempt >= RUN_LOCK_SNAPSHOT_RETRY_COUNT - 1) {
        throw error
      }
      await delay(0)
    }
  }
}

async function readRunLockGenerationsOnce(runDirectory: string): Promise<RunLockGeneration[]> {
  const generationNumbers = new Set<number>()
  const closedNumbers = new Set<number>()
  let directoryEntries = 0
  const directory = await fs.opendir(runDirectory)
  for await (const entry of directory) {
    directoryEntries += 1
    if (directoryEntries > MAX_RUN_DIRECTORY_ENTRIES) {
      throw new Error("Rule authoring run directory entry limit was reached")
    }
    let match = RUN_LOCK_GENERATION_PATTERN.exec(entry.name)
    if (match) {
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error("Rule authoring run lock generation must be a regular file")
      }
      generationNumbers.add(Number(match[1]))
      if (generationNumbers.size > MAX_RUN_LOCK_GENERATIONS) {
        throw new Error("Rule authoring run lock generation limit was reached")
      }
      continue
    }
    match = RUN_LOCK_CLOSED_PATTERN.exec(entry.name)
    if (match) {
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error("Rule authoring run lock closure must be a regular file")
      }
      closedNumbers.add(Number(match[1]))
      if (closedNumbers.size > MAX_RUN_LOCK_GENERATIONS) {
        throw new Error("Rule authoring run lock closure file limit was reached")
      }
    }
  }
  const ordered = [...generationNumbers].sort((left, right) => left - right)
  for (const [index, generation] of ordered.entries()) {
    if (generation !== index + 1) {
      throw new RetryableRunLockSnapshotError("Rule authoring run lock generations must be contiguous")
    }
    if (index < ordered.length - 1 && !closedNumbers.has(generation)) {
      throw new RetryableRunLockSnapshotError("Rule authoring run lock history contains an open predecessor")
    }
  }
  for (const generation of closedNumbers) {
    if (!generationNumbers.has(generation)) {
      throw new RetryableRunLockSnapshotError("Rule authoring run lock closure has no generation")
    }
  }
  return ordered.map((generation) => {
    const lockPath = runLockGenerationPath(runDirectory, generation)
    return {
      generation,
      lockPath,
      closedPath: `${lockPath}.closed`
    }
  })
}

async function readRunLockRecord(lockPath: string): Promise<RunLockOwner["record"]> {
  let parsed: unknown
  try {
    const handle = await fs.open(lockPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    try {
      parsed = JSON.parse(await readBoundedUtf8(
        handle,
        MAX_RUN_LOCK_RECORD_BYTES,
        "Rule authoring run lock record"
      ))
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Rule authoring run lock record is invalid")
    throw error
  }
  if (!isValidRunLockRecord(parsed)) throw new Error("Rule authoring run lock record is invalid")
  return parsed
}

async function closeRunLockGeneration(
  runDirectory: string,
  lock: RunLockGeneration,
  record: RunLockOwner["record"]
): Promise<void> {
  const lockIdentity = await regularFileIdentity(lock.lockPath)
  if (!lockIdentity) throw new Error("Rule authoring run lock generation is missing")
  if (lock.identity && !sameIdentity(lockIdentity, lock.identity)) {
    throw new Error("Rule authoring run lock generation changed before closure")
  }
  const persistedRecord = await readRunLockRecord(lock.lockPath)
  if (
    persistedRecord.token !== record.token ||
    persistedRecord.pid !== record.pid ||
    persistedRecord.scope_id !== record.scope_id
  ) {
    throw new Error("Rule authoring run lock owner changed before closure")
  }

  const closureRecord = {
    schema_version: RUN_LOCK_CLOSED_SCHEMA_VERSION,
    generation: lock.generation,
    owner_token: record.token
  }
  const temporaryPath = path.join(
    runDirectory,
    `.authoring-run.lock-close.${process.pid}.${randomBytes(8).toString("hex")}.owner`
  )
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(temporaryPath, "wx", 0o600)
    await handle.writeFile(`${JSON.stringify(closureRecord)}\n`, "utf8")
    await handle.sync()
    await handle.close()
    handle = undefined
    try {
      await fs.link(temporaryPath, lock.closedPath)
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") throw error
    }
    await assertClosedRunLockRecord(lock, record)
  } finally {
    await handle?.close().catch(() => undefined)
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

async function assertClosedRunLockRecord(
  lock: RunLockGeneration,
  ownerRecord: RunLockOwner["record"]
): Promise<void> {
  let parsed: unknown
  try {
    const handle = await fs.open(lock.closedPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    try {
      parsed = JSON.parse(await readBoundedUtf8(
        handle,
        MAX_RUN_LOCK_RECORD_BYTES,
        "Rule authoring run lock closure"
      ))
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Rule authoring run lock closure is invalid")
    throw error
  }
  if (
    !isPlainObject(parsed) ||
    !hasExactKeys(parsed, ["schema_version", "generation", "owner_token"]) ||
    parsed.schema_version !== RUN_LOCK_CLOSED_SCHEMA_VERSION ||
    parsed.generation !== lock.generation ||
    parsed.owner_token !== ownerRecord.token
  ) {
    throw new Error("Rule authoring run lock closure is invalid")
  }
}

function runLockGenerationPath(runDirectory: string, generation: number): string {
  return path.join(
    runDirectory,
    `.authoring-run.lock.${String(generation).padStart(RUN_LOCK_GENERATION_WIDTH, "0")}`
  )
}

function isValidRunLockRecord(value: unknown): value is RunLockOwner["record"] {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["schema_version", "pid", "token", "scope_id", "created_at"]) &&
    value.schema_version === RUN_LOCK_SCHEMA_VERSION &&
    Number.isSafeInteger(value.pid) &&
    value.pid > 0 &&
    typeof value.token === "string" &&
    RUN_LOCK_TOKEN.test(value.token) &&
    typeof value.scope_id === "string" &&
    RUN_LOCK_SCOPE.test(value.scope_id) &&
    typeof value.created_at === "string" &&
    !Number.isNaN(Date.parse(value.created_at))
  )
}

function currentRunLockScopeId(): string {
  const parts = [process.platform, hostname()]
  if (process.platform === "linux") {
    try {
      parts.push(readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim())
      parts.push(readlinkSync("/proc/self/ns/pid"))
    } catch {
      // A per-process fallback fails closed across extension hosts when Linux
      // cannot expose a stable host/PID-namespace identity.
      parts.push(`unavailable:${process.pid}:${randomBytes(16).toString("hex")}`)
    }
  } else {
    let machineAddresses: string[] = []
    try {
      machineAddresses = [...new Set(
        Object.values(networkInterfaces())
          .flatMap((entries) => entries ?? [])
          .filter((entry) => !entry.internal)
          .map((entry) => entry.mac.toLowerCase())
          .filter((mac) => NON_ZERO_MAC_ADDRESS.test(mac))
      )].sort()
    } catch {
      // The process-specific fallback below is fail-closed.
    }
    if (machineAddresses.length > 0) {
      // Hash host-specific network identities so ordinary distinct machines
      // with the same hostname do not treat each other's host-global PIDs as local.
      parts.push(`machine-macs:${machineAddresses.join(",")}`)
    } else {
      // Without a usable host identity, recovery is deliberately limited to
      // this extension host. A later process sees a foreign scope and fails closed.
      parts.push(`unavailable:${process.pid}:${randomBytes(16).toString("hex")}`)
    }
  }
  return createHash("sha256").update(parts.join("\0"), "utf8").digest("hex")
}

function isProcessAlive(pid: number): boolean {
  // A reused PID is conservatively treated as live. This can delay recovery,
  // but never allows a newer generation to overlap the unknown process.
  if (pid === process.pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !isNodeError(error) || error.code !== "ESRCH"
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
