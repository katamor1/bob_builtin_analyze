import {
  ARTIFACT_HYDRATION_STATE_KEY
} from "./artifacts/stateHydration"
import {
  ARTIFACT_REUSE_STATE_KEY
} from "./artifacts/seedRun"
import {
  TASK_SNAPSHOT_IMPORT_STATE_KEY
} from "./artifacts/taskSnapshotImport"
import type { RunStepState, WorkflowRunState } from "./model"

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

export interface WorkflowRunProvenanceProjection {
  sourceRunId?: string
  startStepId?: string
  reusedStepIds: string[]
  hydratedStateKeys: string[]
  artifactIds: string[]
  definitionMismatchAllowed: boolean
  taskSnapshotImportCount: number
  taskSnapshotImportedAt?: string
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
  const reusedStepIds = unique(reuse?.reusedStepIds ?? [])
  const reusedStepSet = new Set(reusedStepIds)
  const hydrationEntries = hydration?.hydrated ?? []
  const snapshotEntries = taskSnapshotImport?.imported ?? []
  const sourceRunId = reuse?.sourceRunId ?? hydration?.sourceRunId

  return {
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
  return Array.isArray(value) ? unique(value.filter(isNonEmptyString)) : []
}

function optionalString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value : undefined
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (!isNonEmptyString(value) || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}
