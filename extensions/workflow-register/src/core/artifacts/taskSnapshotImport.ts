import type { CoreWorkflowDefinition, WorkflowRunState } from "../model"
import type { TaskSnapshotPayload, TaskSnapshotStore } from "../taskSnapshots"
import type { WorkspaceFileTransactionWrite } from "../runtime/workspaceFileTransaction"
import {
  ARTIFACT_MANIFEST_PATH,
  buildWorkflowArtifactManifest,
  commitWorkflowArtifactManifest,
  createWorkflowArtifactManifestEntry,
  type WorkflowArtifactManifest,
  type WorkflowArtifactManifestEntry
} from "./artifactManifest"
import {
  outputStateKeyForArtifact,
  previewArtifactsFromTaskSnapshots,
  snapshotImportText
} from "./taskSnapshotImportPreview"

export const TASK_SNAPSHOT_IMPORT_STATE_KEY = "workflow.taskSnapshotImport"

export interface TaskSnapshotArtifactImportRecord {
  schemaVersion: "workflow-register/task-snapshot-import/v1"
  sourceRunId: string
  importedAt: string
  imported: TaskSnapshotArtifactImportEntry[]
}

export interface TaskSnapshotArtifactImportEntry {
  artifactId: string
  stateKey: string
  producedBy: string
  snapshotReason: string
  snapshotCreatedAt: string
  path: string
  sha256: string
  bytes: number
}

export interface TaskSnapshotArtifactImportIssue {
  severity: "error" | "warning" | "info"
  message: string
  artifactId?: string
  stepId?: string
}

export interface TaskSnapshotArtifactImportResult {
  ok: boolean
  importedCount: number
  manifest?: WorkflowArtifactManifest
  issues: TaskSnapshotArtifactImportIssue[]
  previewDigest?: string
}

export interface ImportArtifactsFromTaskSnapshotsInput {
  workflow: CoreWorkflowDefinition
  run: WorkflowRunState
  snapshotStore: TaskSnapshotStore
  writeFiles: (
    writes: WorkspaceFileTransactionWrite[],
    commitState: () => Promise<void> | void
  ) => Promise<void> | void
  persistStateRollback?: () => Promise<void> | void
  readFile?: (relativePath: string) => Promise<string | undefined> | string | undefined
  selectedArtifactIds?: readonly string[]
  expectedPreviewDigest?: string
  now?: () => string
  overwrite?: boolean
  overwriteExisting?: boolean
}

export async function importArtifactsFromTaskSnapshots(
  input: ImportArtifactsFromTaskSnapshotsInput
): Promise<TaskSnapshotArtifactImportResult> {
  const preview = await previewArtifactsFromTaskSnapshots({
    workflow: input.workflow,
    run: input.run,
    snapshotStore: input.snapshotStore,
    readFile: input.readFile,
    overwriteState: input.overwrite
  })
  const issues: TaskSnapshotArtifactImportIssue[] = [...preview.issues]
  if (input.expectedPreviewDigest && input.expectedPreviewDigest !== preview.previewDigest) {
    issues.push(error("Task snapshot import preview changed; refresh the preview before applying."))
    return { ok: false, importedCount: 0, issues, previewDigest: preview.previewDigest }
  }

  const explicitSelection = input.selectedArtifactIds !== undefined
  const selectedIds = explicitSelection
    ? new Set(input.selectedArtifactIds)
    : new Set(preview.candidates
      .filter((candidate) => candidate.defaultSelected)
      .map((candidate) => candidate.artifactId))
  if (selectedIds.size === 0) {
    issues.push(info(explicitSelection
      ? "No task snapshot artifacts were selected."
      : "No task snapshot artifacts are safe for automatic import; review and select candidates explicitly."))
    return { ok: false, importedCount: 0, issues, previewDigest: preview.previewDigest }
  }

  const entries: WorkflowArtifactManifestEntry[] = []
  const imported: TaskSnapshotArtifactImportEntry[] = []
  const stateUpdates: Record<string, string> = {}
  const fileWrites: WorkspaceFileTransactionWrite[] = []

  for (const candidate of preview.candidates) {
    if (!selectedIds.has(candidate.artifactId)) continue
    const artifact = input.workflow.artifacts.find((item) => item.id === candidate.artifactId && item.producedBy === candidate.stepId)
    const step = input.workflow.engineSteps.find((item) => item.id === candidate.stepId)
    if (!artifact || !step) {
      issues.push(error(`Task snapshot import candidate '${candidate.artifactId}' no longer matches the workflow definition.`, candidate.artifactId, candidate.stepId))
      continue
    }
    const stateKey = outputStateKeyForArtifact(step, artifact)
    if (!stateKey || stateKey !== candidate.stateKey) {
      issues.push(error(`Task snapshot import candidate '${candidate.artifactId}' no longer matches its output state key.`, candidate.artifactId, candidate.stepId))
      continue
    }
    if (!input.overwrite && input.run.state[stateKey] !== undefined) {
      issues.push(info(`State key '${stateKey}' already exists; task snapshot import skipped.`, candidate.artifactId, candidate.stepId))
      continue
    }
    if (candidate.existing.changed && !input.overwriteExisting) {
      issues.push(error(`Artifact '${candidate.artifactId}' requires explicit overwrite confirmation because the target file already has different content.`, candidate.artifactId, candidate.stepId))
      continue
    }

    fileWrites.push({ relativePath: candidate.path, text: candidate.text, encoding: "utf8" })
    stateUpdates[stateKey] = candidate.text
    const entry = createWorkflowArtifactManifestEntry({
      artifact,
      step,
      path: candidate.path,
      text: candidate.text,
      source: "task-snapshot",
      now: input.now
    })
    entries.push(entry)
    imported.push({
      artifactId: entry.id,
      stateKey,
      producedBy: entry.producedBy,
      snapshotReason: candidate.snapshotReason,
      snapshotCreatedAt: candidate.snapshotCreatedAt,
      path: entry.path,
      sha256: entry.sha256,
      bytes: entry.bytes
    })
  }

  if (entries.length === 0) {
    if (explicitSelection) {
      for (const artifactId of selectedIds) {
        if (!preview.candidates.some((candidate) => candidate.artifactId === artifactId)) {
          issues.push(warning(`Selected artifact '${artifactId}' is not available in the current task snapshot preview.`, artifactId))
        }
      }
    }
    return { ok: false, importedCount: 0, issues, previewDigest: preview.previewDigest }
  }

  const manifest = buildWorkflowArtifactManifest({ workflow: input.workflow, run: input.run, entries, now: input.now })
  const importState = JSON.stringify({
    schemaVersion: "workflow-register/task-snapshot-import/v1",
    sourceRunId: input.run.runId,
    importedAt: input.now?.() ?? new Date().toISOString(),
    imported
  } satisfies TaskSnapshotArtifactImportRecord)
  fileWrites.push({
    relativePath: ARTIFACT_MANIFEST_PATH.replace(/\{\{\s*run\.id\s*\}\}/g, input.run.runId),
    text: `${JSON.stringify(manifest, null, 2)}\n`,
    encoding: "utf8"
  })

  const stateBeforeCommit = { ...input.run.state }
  let stateCommitted = false
  try {
    await Promise.resolve(input.writeFiles(fileWrites, () => {
      Object.assign(input.run.state, stateUpdates)
      commitWorkflowArtifactManifest(input.run, manifest)
      input.run.state[TASK_SNAPSHOT_IMPORT_STATE_KEY] = importState
      stateCommitted = true
    }))
    if (!stateCommitted) throw new Error("Task snapshot file transaction did not commit run state.")
  } catch (error) {
    replaceRunState(input.run, stateBeforeCommit)
    if (stateCommitted && input.persistStateRollback) {
      try {
        await Promise.resolve(input.persistStateRollback())
      } catch (rollbackError) {
        const message = error instanceof Error ? error.message : String(error)
        const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
        throw new Error(`${message}; durable state rollback failed: ${rollbackMessage}`, { cause: error })
      }
    }
    throw error
  }
  return { ok: true, importedCount: entries.length, manifest, issues, previewDigest: preview.previewDigest }
}

export function snapshotText(snapshot: TaskSnapshotPayload): string | undefined {
  return snapshotImportText(snapshot)?.text
}

function error(message: string, artifactId?: string, stepId?: string): TaskSnapshotArtifactImportIssue {
  return { severity: "error", message, artifactId, stepId }
}

function warning(message: string, artifactId?: string, stepId?: string): TaskSnapshotArtifactImportIssue {
  return { severity: "warning", message, artifactId, stepId }
}

function info(message: string, artifactId?: string, stepId?: string): TaskSnapshotArtifactImportIssue {
  return { severity: "info", message, artifactId, stepId }
}

function replaceRunState(run: WorkflowRunState, state: Record<string, string>): void {
  for (const key of Object.keys(run.state)) delete run.state[key]
  Object.assign(run.state, state)
}
