import * as path from "node:path"
import YAML from "yaml"
import { readBobOutputText } from "../core/bobOutputSource"
import { pathExists, readTextFile, resolveWorkspacePathForKind } from "../core/fileSystem"
import {
  createEmptyTriageDecisions,
  decisionRecordFromLegacy,
  mergeTriageDecisionPatches,
  parseTriageDecisions,
  rebaseTriageDecisions,
  serializeTriageDecisions
} from "./triageDecisions"
import { replaceTriageFilesAtomically } from "./triageFileTransaction"
import { buildTriageProjections } from "./triageProjection"
import {
  buildTriageSource,
  hashTriageSourceText,
  parseTriageSource,
  serializeTriageSource
} from "./triageSource"
import type {
  HumanTriageResult,
  HumanTriageWorkspaceState,
  TriageDecisionsV1,
  TriageSourceV1
} from "./triageTypes"

const SOURCE_FILE = "triage-source.yaml"
const DECISIONS_FILE = "triage-decisions.yaml"
const LEGACY_RESULT_FILE = "triage-result.yaml"
const MIGRATION_REPORT_FILE = "migration-report.md"
const workspaceLocks = new Map<string, Promise<void>>()

export async function regenerateHumanTriageWorkspace(input: {
  workspaceRoot: string
  packageDir: string
  bobOutputPath: string
  outDir: string
  now?: Date
}): Promise<HumanTriageResult> {
  const outDir = resolveWorkspacePathForKind(input.workspaceRoot, input.outDir, "human-triage-output")
  return withWorkspaceLock(outDir, async () => regenerateUnlocked({ ...input, outDir }))
}

export async function loadHumanTriageWorkspace(input: {
  workspaceRoot: string
  outDir: string
}): Promise<HumanTriageWorkspaceState> {
  const outDir = resolveWorkspacePathForKind(input.workspaceRoot, input.outDir, "human-triage-output")
  return loadWorkspaceAt(outDir)
}

export async function saveHumanTriageDecisions(input: {
  workspaceRoot: string
  outDir: string
  expectedSourceSha256: string
  expectedDecisionRevision: number
  items: unknown[]
  now?: Date
}): Promise<HumanTriageWorkspaceState> {
  const outDir = resolveWorkspacePathForKind(input.workspaceRoot, input.outDir, "human-triage-output")
  return withWorkspaceLock(outDir, async () => {
    const sourcePath = path.join(outDir, SOURCE_FILE)
    const decisionsPath = path.join(outDir, DECISIONS_FILE)
    if (!(await pathExists(sourcePath)) || !(await pathExists(decisionsPath))) {
      throw new Error("triage source or decisions are missing; generate triage before saving")
    }
    const sourceText = await readTextFile(sourcePath)
    const source = parseTriageSource(sourceText)
    const sourceSha256 = hashTriageSourceText(sourceText)
    const current = parseTriageDecisions(await readTextFile(decisionsPath))
    const now = input.now ?? new Date()
    const next = mergeTriageDecisionPatches({
      source,
      current,
      currentSourceSha256: sourceSha256,
      expectedSourceSha256: input.expectedSourceSha256,
      expectedDecisionRevision: input.expectedDecisionRevision,
      patches: input.items,
      updatedAt: now.toISOString()
    })
    const projection = buildTriageProjections(source, next)
    await replaceTriageFilesAtomically(outDir, {
      [DECISIONS_FILE]: serializeTriageDecisions(next),
      ...projection.files
    }, now)
    return loadWorkspaceAt(outDir)
  })
}

async function regenerateUnlocked(input: {
  workspaceRoot: string
  packageDir: string
  bobOutputPath: string
  outDir: string
  now?: Date
}): Promise<HumanTriageResult> {
  const loaded = await readBobOutputText(input)
  if (!loaded.ok) return triageError(input.outDir, loaded.error)
  const now = input.now ?? new Date()

  let bobOutput: unknown
  try {
    bobOutput = YAML.parse(loaded.text)
  } catch (error) {
    return triageError(input.outDir, `Invalid YAML (${loaded.sourcePath}): ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    const source = buildTriageSource({
      bobOutput,
      bobOutputSha256: hashTriageSourceText(loaded.text),
      generatedAt: now.toISOString()
    })
    const sourceText = serializeTriageSource(source)
    const sourceSha256 = hashTriageSourceText(sourceText)
    const prepared = await prepareDecisions(input.outDir, source, sourceSha256, now)
    const projection = buildTriageProjections(source, prepared.decisions)
    const transactionFiles = {
      [SOURCE_FILE]: sourceText,
      [DECISIONS_FILE]: serializeTriageDecisions(prepared.decisions),
      ...projection.files,
      [MIGRATION_REPORT_FILE]: renderMigrationReport(prepared)
    }
    await replaceTriageFilesAtomically(input.outDir, transactionFiles, now)
    return {
      status: "ok",
      outDir: input.outDir,
      itemCount: source.items.length,
      bobOutputPath: loaded.sourcePath,
      sourcePath: path.join(input.outDir, SOURCE_FILE),
      decisionsPath: path.join(input.outDir, DECISIONS_FILE),
      sourceSha256,
      decisionRevision: prepared.decisions.decision_revision,
      warnings: prepared.warnings
    }
  } catch (error) {
    return triageError(input.outDir, error instanceof Error ? error.message : String(error))
  }
}

async function prepareDecisions(
  outDir: string,
  source: TriageSourceV1,
  sourceSha256: string,
  now: Date
): Promise<PreparedDecisions> {
  const decisionsPath = path.join(outDir, DECISIONS_FILE)
  if (await pathExists(decisionsPath)) {
    const current = parseTriageDecisions(await readTextFile(decisionsPath))
    const rebased = rebaseTriageDecisions({
      source,
      current,
      sourceSha256,
      updatedAt: now.toISOString()
    })
    return {
      decisions: rebased.decisions,
      migratedSourceIds: [],
      unmatchedSourceIds: rebased.droppedSourceIds,
      warnings: rebased.droppedSourceIds.map((sourceId) => `Dropped stale triage decision: ${sourceId}`),
      migrationStatus: rebased.droppedSourceIds.length > 0 ? "rebased" : "not_required"
    }
  }

  const legacyPath = path.join(outDir, LEGACY_RESULT_FILE)
  if (await pathExists(legacyPath)) return migrateLegacyDecisions(legacyPath, source, sourceSha256, now)

  return {
    decisions: createEmptyTriageDecisions({
      reviewId: source.review_id,
      sourceSha256,
      updatedAt: now.toISOString()
    }),
    migratedSourceIds: [],
    unmatchedSourceIds: [],
    warnings: [],
    migrationStatus: "not_required"
  }
}

async function migrateLegacyDecisions(
  legacyPath: string,
  source: TriageSourceV1,
  sourceSha256: string,
  now: Date
): Promise<PreparedDecisions> {
  const parsed = objectRecord(YAML.parse(await readTextFile(legacyPath)), "legacy triage-result")
  const legacyItems = Array.isArray(parsed.items) ? parsed.items : []
  const sourceIds = new Set(source.items.map((item) => item.source_id))
  const decisions = createEmptyTriageDecisions({
    reviewId: source.review_id,
    sourceSha256,
    updatedAt: now.toISOString()
  })
  const triagedBy = optionalString(parsed.triaged_by)
  const triagedAt = optionalString(parsed.triaged_at)
  if (triagedBy) decisions.triaged_by = triagedBy
  if (triagedAt) decisions.triaged_at = triagedAt

  const migratedSourceIds: string[] = []
  const unmatchedSourceIds: string[] = []
  for (const value of legacyItems) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const legacy = value as Record<string, unknown>
    const sourceId = optionalString(legacy.source_id)
    if (!sourceId) continue
    if (!sourceIds.has(sourceId)) {
      unmatchedSourceIds.push(sourceId)
      continue
    }
    const decision = decisionRecordFromLegacy(legacy)
    if (Object.keys(decision).length === 0) continue
    decisions.items[sourceId] = decision
    migratedSourceIds.push(sourceId)
  }
  if (migratedSourceIds.length > 0) decisions.decision_revision = 1
  return {
    decisions,
    migratedSourceIds,
    unmatchedSourceIds,
    warnings: unmatchedSourceIds.map((sourceId) => `Legacy triage item no longer exists: ${sourceId}`),
    migrationStatus: "migrated"
  }
}

async function loadWorkspaceAt(outDir: string): Promise<HumanTriageWorkspaceState> {
  const sourcePath = path.join(outDir, SOURCE_FILE)
  const decisionsPath = path.join(outDir, DECISIONS_FILE)
  if (!(await pathExists(sourcePath)) || !(await pathExists(decisionsPath))) {
    return {
      outDir,
      sourcePath,
      decisionsPath,
      reviewId: "",
      sourceSha256: "",
      decisionRevision: 0,
      items: [],
      issues: []
    }
  }

  const sourceText = await readTextFile(sourcePath)
  const source = parseTriageSource(sourceText)
  const sourceSha256 = hashTriageSourceText(sourceText)
  const decisions = parseTriageDecisions(await readTextFile(decisionsPath))
  const issues: string[] = []
  if (decisions.review_id !== source.review_id) {
    issues.push(`TRIAGE_SOURCE_CHANGED: review_id mismatch (${decisions.review_id} != ${source.review_id})`)
  }
  if (decisions.source_sha256 !== sourceSha256) {
    issues.push("TRIAGE_SOURCE_CHANGED: triage-decisions.yaml does not match triage-source.yaml")
  }
  const projection = buildTriageProjections(source, decisions)
  return {
    outDir,
    sourcePath,
    decisionsPath,
    reviewId: source.review_id,
    sourceSha256,
    decisionRevision: decisions.decision_revision,
    items: projection.items,
    issues
  }
}

function renderMigrationReport(input: PreparedDecisions): string {
  const lines = [
    "# Human Triage migration report",
    "",
    `- status: ${input.migrationStatus}`,
    `- migrated_items: ${input.migratedSourceIds.length}`,
    `- unmatched_or_dropped_items: ${input.unmatchedSourceIds.length}`,
    ""
  ]
  if (input.migratedSourceIds.length > 0) {
    lines.push("## Migrated source IDs", "", ...input.migratedSourceIds.map((sourceId) => `- ${sourceId}`), "")
  }
  if (input.unmatchedSourceIds.length > 0) {
    lines.push("## Unmatched or dropped source IDs", "", ...input.unmatchedSourceIds.map((sourceId) => `- ${sourceId}`), "")
  }
  return `${lines.join("\n")}\n`
}

function triageError(outDir: string, message: string): HumanTriageResult {
  return { status: "error", outDir, itemCount: 0, message, errors: [message] }
}

interface PreparedDecisions {
  decisions: TriageDecisionsV1
  migratedSourceIds: string[]
  unmatchedSourceIds: string[]
  warnings: string[]
  migrationStatus: "not_required" | "migrated" | "rebased"
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

async function withWorkspaceLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = workspaceLocks.get(key) ?? Promise.resolve()
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => { release = resolve })
  const tail = previous.then(() => gate)
  workspaceLocks.set(key, tail)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (workspaceLocks.get(key) === tail) workspaceLocks.delete(key)
  }
}
