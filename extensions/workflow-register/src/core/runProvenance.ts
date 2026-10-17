import {
  ARTIFACT_HYDRATION_STATE_KEY
} from "./artifacts/stateHydration"
import {
  ARTIFACT_REUSE_STATE_KEY
} from "./artifacts/seedRun"
import {
  TASK_SNAPSHOT_IMPORT_STATE_KEY
} from "./artifacts/taskSnapshotImport"
import { HELD_RECOVERY_STATE_KEY } from "./heldRunRecovery"
import type { RunStepState, WorkflowRunState } from "./model"
import { decodeWorkflowContractV2RunPlanProvenance, type WorkflowContractV2RunPlanProvenance } from "./contractV2/runPlanProvenance"

export type WorkflowStepCompletionSource = "normal" | "reused" | "not-completed"

export interface WorkflowStepProvenanceProjection {
  stepId: string
  title: string
  runStatus: RunStepState["status"]
  completion: WorkflowStepCompletionSource
  skippedByArtifactReuse: boolean
  sourceRunId?: string
  artifactIds: string[]
  hydratedStateKeys: string[]
  artifactVerified: boolean
  importedFromTaskSnapshot: boolean
}

export interface WorkflowHeldRecoveryProjection {
  kind: "saved-state"
  runId: string
  stepId: string
  nextStepId?: string
  recoveredAt: string
  source: "operation-hub"
}

export interface WorkflowRunProvenanceProjection {
  planProvenance?: WorkflowContractV2RunPlanProvenance
  sourceRunId?: string
  startStepId?: string
  reusedStepIds: string[]
  hydratedStateKeys: string[]
  artifactIds: string[]
  definitionMismatchAllowed: boolean
  taskSnapshotImportCount: number
  taskSnapshotImportedAt?: string
  heldRecovery?: WorkflowHeldRecoveryProjection
  steps: WorkflowStepProvenanceProjection[]
}

interface ArtifactReuseRecordLike {
  sourceRunId?: string
  startStepId?: string
  reusedStepIds: string[]
  hydratedKeys: string[]
}

interface ArtifactHydrationEntryLike {
  stateKey: string
  artifactId: string
  producedBy: string
  sourceRunId?: string
}

interface ArtifactHydrationRecordLike {
  sourceRunId?: string
  hydrated: ArtifactHydrationEntryLike[]
}

interface TaskSnapshotImportEntryLike {
  artifactId: string
  stateKey?: string
  producedBy: string
}

interface TaskSnapshotImportRecordLike {
  importedAt?: string
  imported: TaskSnapshotImportEntryLike[]
}

export function projectWorkflowRunProvenance(run: WorkflowRunState): WorkflowRunProvenanceProjection {
  const reuse = parseArtifactReuse(run.state[ARTIFACT_REUSE_STATE_KEY])
  const hydration = parseArtifactHydration(run.state[ARTIFACT_HYDRATION_STATE_KEY])
  const taskSnapshotImport = parseTaskSnapshotImport(run.state[TASK_SNAPSHOT_IMPORT_STATE_KEY])
  const heldRecovery = parseHeldRecovery(run.state[HELD_RECOVERY_STATE_KEY], run.runId)
  const reusedStepIds = unique(reuse?.reusedStepIds ?? [])
  const reusedStepSet = new Set(reusedStepIds)
  const hydrationEntries = hydration?.hydrated ?? []
  const snapshotEntries = taskSnapshotImport?.imported ?? []
  const sourceRunId = reuse?.sourceRunId ?? hydration?.sourceRunId

  return {
    ...(run.workflowSchemaVersion === "workflow-register/v2"
      ? { planProvenance: decodeWorkflowContractV2RunPlanProvenance(run.planProvenance) } : {}),
    sourceRunId,
    startStepId: reuse?.startStepId,
    reusedStepIds,
    hydratedStateKeys: unique([
      ...(reuse?.hydratedKeys ?? []),
      ...hydrationEntries.map((entry) => entry.stateKey)
    ]),
    artifactIds: unique([
      ...hydrationEntries.map((entry) => entry.artifactId),
      ...snapshotEntries.map((entry) => entry.artifactId)
    ]),
    definitionMismatchAllowed: Boolean(parseRecord(run.state["workflow.definitionMismatch"])),
    taskSnapshotImportCount: snapshotEntries.length,
    taskSnapshotImportedAt: taskSnapshotImport?.importedAt,
    heldRecovery,
    steps: run.steps.map((step) => {
      const reused = reusedStepSet.has(step.id)
      const stepHydration = hydrationEntries.filter((entry) => entry.producedBy === step.id)
      const stepSnapshotImports = snapshotEntries.filter((entry) => entry.producedBy === step.id)
      return {
        stepId: step.id,
        title: step.title,
        runStatus: step.status,
        completion: reused ? "reused" : step.status === "completed" ? "normal" : "not-completed",
        skippedByArtifactReuse: reused,
        sourceRunId: reused
          ? sourceRunId
          : stepHydration.map((entry) => entry.sourceRunId).find(isNonEmptyString),
        artifactIds: unique([
          ...stepHydration.map((entry) => entry.artifactId),
          ...stepSnapshotImports.map((entry) => entry.artifactId)
        ]),
        hydratedStateKeys: unique(stepHydration.map((entry) => entry.stateKey)),
        artifactVerified: stepHydration.length > 0,
        importedFromTaskSnapshot: stepSnapshotImports.length > 0
      }
    })
  }
}

export function workflowRunProvenanceControlLines(
  provenance: WorkflowRunProvenanceProjection,
  maxItems = 20
): string[] {
  const limit = Math.max(1, Math.min(50, Math.floor(maxItems)))
  const verifiedArtifacts = unique(provenance.steps
    .filter((step) => step.artifactVerified)
    .flatMap((step) => step.artifactIds))
  const lines = [
    ...(provenance.planProvenance ? [
      `Contract v2 plan: ${safeControlToken(provenance.planProvenance.planDigest)}`,
      `Contract v2 generation: ${safeControlToken(provenance.planProvenance.generation)}`,
      boundedControlList("Contract v2 providers", provenance.planProvenance.providerExactBindings.map(binding => `${binding.id}@${binding.exactVersion}`), limit),
      `Contract v2 Bob: ${safeControlToken(provenance.planProvenance.bobProfileBinding.profile)} ${safeControlToken(provenance.planProvenance.bobProfileBinding.profileDigest)}`
    ] : []),
    provenance.sourceRunId ? `再利用元の実行: ${safeControlToken(provenance.sourceRunId)}` : undefined,
    provenance.startStepId ? `再利用開始ステップ: ${safeControlToken(provenance.startStepId)}` : undefined,
    boundedControlList("再利用したステップ", provenance.reusedStepIds, limit),
    boundedControlList("確認済みの成果物", verifiedArtifacts, limit),
    boundedControlList("復元した状態キー", provenance.hydratedStateKeys, limit),
    provenance.taskSnapshotImportCount > 0
      ? `保存済みタスクから取り込み: ${provenance.taskSnapshotImportCount}件`
      : undefined,
    provenance.definitionMismatchAllowed ? "定義の差異を許可: はい" : undefined
  ]
  return lines.filter((value): value is string => Boolean(value))
}

function boundedControlList(label: string, values: readonly string[], limit: number): string | undefined {
  const safeValues = unique(values.map(safeControlToken).filter(isNonEmptyString))
  if (safeValues.length === 0) return undefined
  const shown = safeValues.slice(0, limit)
  const remaining = safeValues.length - shown.length
  return `${label}: ${shown.join(", ")}${remaining > 0 ? `（ほか${remaining}件）` : ""}`
}

function safeControlToken(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)
}

function parseArtifactReuse(value: unknown): ArtifactReuseRecordLike | undefined {
  const record = parseRecord(value)
  if (!record) return undefined
  return {
    sourceRunId: optionalString(record.sourceRunId),
    startStepId: optionalString(record.startStepId),
    reusedStepIds: stringArray(record.reusedStepIds),
    hydratedKeys: stringArray(record.hydratedKeys)
  }
}

function parseArtifactHydration(value: unknown): ArtifactHydrationRecordLike | undefined {
  const record = parseRecord(value)
  if (!record) return undefined
  const entries = Array.isArray(record.hydrated)
    ? record.hydrated.flatMap((item) => {
      const entry = recordFromUnknown(item)
      const stateKey = optionalString(entry?.stateKey)
      const artifactId = optionalString(entry?.artifactId)
      const producedBy = optionalString(entry?.producedBy)
      if (!stateKey || !artifactId || !producedBy) return []
      return [{
        stateKey,
        artifactId,
        producedBy,
        sourceRunId: optionalString(entry?.sourceRunId)
      } satisfies ArtifactHydrationEntryLike]
    })
    : []
  return {
    sourceRunId: optionalString(record.sourceRunId),
    hydrated: entries
  }
}

function parseTaskSnapshotImport(value: unknown): TaskSnapshotImportRecordLike | undefined {
  const record = parseRecord(value)
  if (!record) return undefined
  const entries = Array.isArray(record.imported)
    ? record.imported.flatMap((item) => {
      const entry = recordFromUnknown(item)
      const artifactId = optionalString(entry?.artifactId)
      const producedBy = optionalString(entry?.producedBy)
      if (!artifactId || !producedBy) return []
      return [{
        artifactId,
        stateKey: optionalString(entry?.stateKey),
        producedBy
      } satisfies TaskSnapshotImportEntryLike]
    })
    : []
  return {
    importedAt: optionalString(record.importedAt),
    imported: entries
  }
}

function parseHeldRecovery(value: unknown, expectedRunId: string): WorkflowHeldRecoveryProjection | undefined {
  const record = parseRecord(value)
  if (!record) return undefined
  if (record.schemaVersion !== "workflow-register/held-recovery/v1") return undefined
  if (record.kind !== "saved-state" || record.source !== "operation-hub") return undefined
  const runId = optionalString(record.runId)
  const stepId = optionalString(record.stepId)
  const nextStepId = optionalString(record.nextStepId)
  const recoveredAt = optionalString(record.recoveredAt)
  if (!runId || runId !== expectedRunId || !stepId || !recoveredAt) return undefined
  return {
    kind: "saved-state",
    runId,
    stepId,
    nextStepId,
    recoveredAt,
    source: "operation-hub"
  }
}

function parseRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string") return undefined
  try {
    return recordFromUnknown(JSON.parse(value))
  } catch {
    return undefined
  }
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? unique(value.filter(isMetadataString)) : []
}

function optionalString(value: unknown): string | undefined {
  return isMetadataString(value) ? value : undefined
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isMetadataString(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= 256
    && !/[\u0000-\u001f\u007f]/.test(value)
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (!isMetadataString(value) || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}
