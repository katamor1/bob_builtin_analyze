import type { CoreWorkflowDefinition, WorkflowRunState } from "./core/model"
import type {
  TaskSnapshotArtifactImportPreview,
  TaskSnapshotImportPreviewCandidate
} from "./core/artifacts/taskSnapshotImportPreview"

export interface TaskSnapshotImportSelectionItem {
  artifactId: string
  label: string
  description: string
  detail: string
  picked: boolean
  requiresOverwrite: boolean
}

export interface TaskSnapshotImportSelection {
  selectedArtifactIds: string[]
  overwriteExisting: boolean
}

export interface TaskSnapshotImportPromptAdapter {
  showPreview: (lines: string[]) => Promise<void> | void
  pickArtifacts: (items: TaskSnapshotImportSelectionItem[]) => Promise<string[] | undefined> | string[] | undefined
  confirmOverwrite: (count: number) => Promise<boolean> | boolean
}

export function formatTaskSnapshotImportPreviewReport(input: {
  preview: TaskSnapshotArtifactImportPreview
  run: Pick<WorkflowRunState, "runId" | "workflowId" | "status">
  workflow: Pick<CoreWorkflowDefinition, "id" | "label">
}): string[] {
  const lines = [
    `- runId: ${input.run.runId}`,
    `- run status: ${input.run.status}`,
    `- workflow: ${input.workflow.label} (${input.workflow.id})`,
    `- preview digest: ${input.preview.previewDigest}`,
    `- candidates: ${input.preview.candidates.length}`,
    "",
    "The preview is read-only. Artifact files, manifest, and run state are changed only after selection and confirmation."
  ]

  for (const candidate of input.preview.candidates) lines.push(...formatCandidate(candidate))
  if (input.preview.issues.length > 0) {
    lines.push("", "## Preview issues")
    for (const issue of input.preview.issues) {
      const scope = issue.artifactId ? `${issue.artifactId}: ` : ""
      lines.push(`- ${issue.severity}: ${scope}${issue.message}`)
    }
  }
  return lines
}

export function taskSnapshotImportSelectionItems(
  preview: TaskSnapshotArtifactImportPreview
): TaskSnapshotImportSelectionItem[] {
  return preview.candidates.map((candidate) => ({
    artifactId: candidate.artifactId,
    label: `${candidate.artifactId} — ${candidate.stepTitle}`,
    description: candidate.defaultSelected ? "selected by default" : "review required",
    detail: [
      `step=${candidate.stepId}`,
      `source=${candidate.extractionSource}`,
      `path=${candidate.path}`,
      `${candidate.bytes} bytes`,
      candidate.existing.changed ? "overwrites changed file" : candidate.existing.exists ? "existing file unchanged" : "new file",
      candidate.truncated ? "truncated" : undefined,
      candidate.redactionPossible ? "redaction possible" : undefined
    ].filter((value): value is string => Boolean(value)).join("; "),
    picked: candidate.defaultSelected,
    requiresOverwrite: candidate.existing.changed
  }))
}

export async function chooseTaskSnapshotImportSelection(input: {
  preview: TaskSnapshotArtifactImportPreview
  run: Pick<WorkflowRunState, "runId" | "workflowId" | "status">
  workflow: Pick<CoreWorkflowDefinition, "id" | "label">
  prompts: TaskSnapshotImportPromptAdapter
}): Promise<TaskSnapshotImportSelection | undefined> {
  await Promise.resolve(input.prompts.showPreview(formatTaskSnapshotImportPreviewReport(input)))
  const items = taskSnapshotImportSelectionItems(input.preview)
  const picked = await Promise.resolve(input.prompts.pickArtifacts(items))
  if (picked === undefined) return undefined
  const selectedSet = new Set(picked)
  const selectedArtifactIds = input.preview.candidates
    .filter((candidate) => selectedSet.has(candidate.artifactId))
    .map((candidate) => candidate.artifactId)
  const overwriteCount = input.preview.candidates.filter((candidate) => (
    selectedSet.has(candidate.artifactId) && candidate.existing.changed
  )).length
  if (overwriteCount > 0 && !await Promise.resolve(input.prompts.confirmOverwrite(overwriteCount))) return undefined
  return { selectedArtifactIds, overwriteExisting: overwriteCount > 0 }
}

function formatCandidate(candidate: TaskSnapshotImportPreviewCandidate): string[] {
  const existing = candidate.existing.exists
    ? candidate.existing.changed ? "changed existing file" : "existing file already matches"
    : "new file"
  const lines = [
    "",
    `## ${candidate.artifactId}`,
    `- step: ${candidate.stepTitle} (${candidate.stepId})`,
    `- state key: ${candidate.stateKey}`,
    `- snapshot: ${candidate.snapshotCreatedAt}; reason=${candidate.snapshotReason}`,
    `- extraction source: ${candidate.extractionSource}`,
    `- target: ${candidate.path}`,
    `- schema: ${candidate.schema ?? "unspecified"}`,
    `- size: ${candidate.bytes} bytes`,
    `- checksum: ${candidate.sha256}`,
    `- truncated: ${candidate.truncated ? "yes" : "no"}`,
    `- omitted messages: ${candidate.omittedMessageCount ?? 0}`,
    `- redaction possible: ${candidate.redactionPossible ? "yes" : "no"}`,
    `- target state: ${existing}`,
    `- selected by default: ${candidate.defaultSelected ? "yes" : "no"}`
  ]
  if (candidate.existing.sha256) lines.push(`- existing checksum: ${candidate.existing.sha256}`)
  for (const issue of candidate.issues) lines.push(`- ${issue.severity}: ${issue.message}`)
  if (candidate.diff) {
    const fence = markdownFenceFor(candidate.diff)
    lines.push("", `${fence}diff`, candidate.diff.trimEnd(), fence)
  }
  return lines
}

function markdownFenceFor(value: string): string {
  const longest = Math.max(0, ...Array.from(value.matchAll(/`+/g), (match) => match[0].length))
  return "`".repeat(Math.max(3, longest + 1))
}
