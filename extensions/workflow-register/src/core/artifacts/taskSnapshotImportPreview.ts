import { createHash } from "crypto"
import type {
  CoreWorkflowDefinition,
  EngineStep,
  WorkflowArtifactDefinition,
  WorkflowRunState
} from "../model"
import { renderArtifactPath } from "../engine/templateRenderer"
import type { TaskSnapshotPayload, TaskSnapshotStore } from "../taskSnapshots"
import { snapshotMatchesRun } from "../taskSnapshots"
import { sha256Text, stableJson } from "./artifactManifest"

export type TaskSnapshotImportExtractionSource = "lastAssistantText" | "taskExport"

export interface TaskSnapshotImportPreviewIssue {
  severity: "error" | "warning" | "info"
  message: string
  artifactId?: string
  stepId?: string
}

export interface TaskSnapshotImportExistingFile {
  exists: boolean
  changed: boolean
  bytes?: number
  sha256?: string
}

export interface TaskSnapshotImportPreviewCandidate {
  artifactId: string
  stateKey: string
  stepId: string
  stepTitle: string
  snapshotCreatedAt: string
  snapshotReason: string
  extractionSource: TaskSnapshotImportExtractionSource
  text: string
  path: string
  schema?: string
  bytes: number
  sha256: string
  truncated: boolean
  omittedMessageCount?: number
  redactionPossible: boolean
  existing: TaskSnapshotImportExistingFile
  diff: string
  defaultSelected: boolean
  issues: TaskSnapshotImportPreviewIssue[]
}

export interface TaskSnapshotArtifactImportPreview {
  ok: boolean
  previewDigest: string
  candidates: TaskSnapshotImportPreviewCandidate[]
  issues: TaskSnapshotImportPreviewIssue[]
}

export interface PreviewArtifactsFromTaskSnapshotsInput {
  workflow: CoreWorkflowDefinition
  run: WorkflowRunState
  snapshotStore: TaskSnapshotStore
  readFile?: (relativePath: string) => Promise<string | undefined> | string | undefined
  maxDiffBytes?: number
  overwriteState?: boolean
}

export async function previewArtifactsFromTaskSnapshots(
  input: PreviewArtifactsFromTaskSnapshotsInput
): Promise<TaskSnapshotArtifactImportPreview> {
  const issues: TaskSnapshotImportPreviewIssue[] = []
  const candidates: TaskSnapshotImportPreviewCandidate[] = []
  const artifactCandidates = (input.workflow.artifacts ?? []).filter((artifact) => artifact.producedBy)
  if (artifactCandidates.length === 0) {
    issues.push(warning("Workflow has no produced artifacts to import from task snapshots."))
  }

  for (const artifact of artifactCandidates) {
    const step = input.workflow.engineSteps.find((candidate) => candidate.id === artifact.producedBy)
    if (!step) {
      issues.push(warning(`Artifact '${artifact.id}' references unknown producing step '${artifact.producedBy}'.`, artifact.id, artifact.producedBy))
      continue
    }
    const stateKey = outputStateKeyForArtifact(step, artifact)
    if (!stateKey) {
      issues.push(warning(`Artifact '${artifact.id}' is not tied to an output state key for step '${step.id}'.`, artifact.id, step.id))
      continue
    }
    const snapshot = await input.snapshotStore.findLatestSnapshot(input.run.runId, (candidate) => (
      snapshotMatchesRun(candidate, input.workflow, input.run, step) && Boolean(snapshotImportText(candidate)?.text.trim())
    ))
    if (!snapshot) {
      issues.push(warning(`No task snapshot text found for artifact '${artifact.id}' from step '${step.id}'.`, artifact.id, step.id))
      continue
    }
    const extracted = snapshotImportText(snapshot)
    if (!extracted?.text.trim()) {
      issues.push(warning(`Task snapshot for artifact '${artifact.id}' has no importable text.`, artifact.id, step.id))
      continue
    }
    const renderedPath = renderArtifactPath(artifact, {
      inputs: input.run.inputs,
      state: input.run.state,
      run: input.run,
      workflow: input.workflow,
      step
    })
    if (renderedPath.includes("{{")) {
      issues.push(error(`Artifact '${artifact.id}' path still contains unresolved template placeholders.`, artifact.id, step.id))
      continue
    }
    if (!isWorkspaceRelativePath(renderedPath)) {
      issues.push(error(`Artifact '${artifact.id}' path is not a workspace-relative safe path.`, artifact.id, step.id))
      continue
    }

    const candidateIssues: TaskSnapshotImportPreviewIssue[] = []
    const existingText = input.readFile ? await Promise.resolve(input.readFile(renderedPath)) : undefined
    const existing = existingFile(existingText, extracted.text)
    const truncated = snapshot.truncated === true
    const redactionPossible = extracted.text.includes("[REDACTED]")
    if (truncated) candidateIssues.push(warning(`Task snapshot for artifact '${artifact.id}' is truncated and is not selected by default.`, artifact.id, step.id))
    if (redactionPossible) candidateIssues.push(warning(`Task snapshot for artifact '${artifact.id}' may contain redacted content and is not selected by default.`, artifact.id, step.id))
    if (existing.changed) candidateIssues.push(info(`Artifact '${artifact.id}' would overwrite an existing file and is not selected by default.`, artifact.id, step.id))
    if (!input.overwriteState && input.run.state[stateKey] !== undefined) {
      candidateIssues.push(info(`State key '${stateKey}' already exists and is not selected by default.`, artifact.id, step.id))
    }
    issues.push(...candidateIssues)

    candidates.push({
      artifactId: artifact.id,
      stateKey,
      stepId: step.id,
      stepTitle: step.title,
      snapshotCreatedAt: snapshot.createdAt,
      snapshotReason: snapshot.reason,
      extractionSource: extracted.source,
      text: extracted.text,
      path: renderedPath,
      schema: artifact.schema,
      bytes: Buffer.byteLength(extracted.text, "utf8"),
      sha256: `sha256:${sha256Text(extracted.text)}`,
      truncated,
      omittedMessageCount: snapshot.omittedMessageCount,
      redactionPossible,
      existing,
      diff: existing.changed ? boundedDiff(existingText ?? "", extracted.text, renderedPath, input.maxDiffBytes ?? 16_384) : "",
      defaultSelected: !truncated && !redactionPossible && !existing.changed && (input.overwriteState || input.run.state[stateKey] === undefined),
      issues: candidateIssues
    })
  }

  const previewDigest = `sha256:${sha256Text(stableJson({
    workflowId: input.workflow.id,
    workflowDefinitionHash: input.workflow.definitionHash,
    runId: input.run.runId,
    candidates: candidates.map((candidate) => ({
      artifactId: candidate.artifactId,
      stateKey: candidate.stateKey,
      stepId: candidate.stepId,
      snapshotCreatedAt: candidate.snapshotCreatedAt,
      snapshotReason: candidate.snapshotReason,
      extractionSource: candidate.extractionSource,
      path: candidate.path,
      schema: candidate.schema,
      bytes: candidate.bytes,
      sha256: candidate.sha256,
      truncated: candidate.truncated,
      omittedMessageCount: candidate.omittedMessageCount,
      redactionPossible: candidate.redactionPossible,
      existing: candidate.existing
    }))
  }))}`

  return {
    ok: candidates.length > 0 && !issues.some((issue) => issue.severity === "error"),
    previewDigest,
    candidates,
    issues
  }
}

export function snapshotImportText(snapshot: TaskSnapshotPayload): { text: string; source: TaskSnapshotImportExtractionSource } | undefined {
  if (snapshot.lastAssistantText?.trim()) return { text: snapshot.lastAssistantText, source: "lastAssistantText" }
  const exported = textFromTaskExport(snapshot.taskExport)
  return exported?.trim() ? { text: exported, source: "taskExport" } : undefined
}

export function outputStateKeyForArtifact(step: EngineStep, artifact: WorkflowArtifactDefinition): string | undefined {
  if (step.type === "manual") {
    if (step.form?.resultKey === artifact.id) return step.form.resultKey
    if (step.approval?.resultKey === artifact.id) return step.approval.resultKey
    return undefined
  }
  if ("resultKey" in step && step.resultKey === artifact.id) return step.resultKey
  if (step.type === "result" && step.result.source === "state" && step.result.stateKey === artifact.id) return step.result.stateKey
  return undefined
}

export function isWorkspaceRelativeArtifactPath(value: string): boolean {
  return isWorkspaceRelativePath(value)
}

function existingFile(existingText: string | undefined, nextText: string): TaskSnapshotImportExistingFile {
  if (existingText === undefined) return { exists: false, changed: false }
  return {
    exists: true,
    changed: existingText !== nextText,
    bytes: Buffer.byteLength(existingText, "utf8"),
    sha256: `sha256:${sha256Text(existingText)}`
  }
}

function boundedDiff(before: string, after: string, filePath: string, maxBytes: number): string {
  const beforeLines = before.replace(/\r\n/g, "\n").split("\n")
  const afterLines = after.replace(/\r\n/g, "\n").split("\n")
  const lines = [`--- existing/${filePath}`, `+++ snapshot/${filePath}`]
  const count = Math.max(beforeLines.length, afterLines.length)
  for (let index = 0; index < count; index += 1) {
    const left = beforeLines[index]
    const right = afterLines[index]
    if (left === right && left !== undefined) lines.push(` ${left}`)
    else {
      if (left !== undefined) lines.push(`-${left}`)
      if (right !== undefined) lines.push(`+${right}`)
    }
  }
  return truncateUtf8(`${lines.join("\n")}\n`, Math.max(1, maxBytes))
}

function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, "utf8")
  if (bytes.byteLength <= maxBytes) return value
  const suffix = Buffer.from("\n... [diff truncated]\n", "utf8")
  if (maxBytes <= suffix.byteLength) return suffix.subarray(0, maxBytes).toString("utf8")
  let prefix = bytes.subarray(0, maxBytes - suffix.byteLength).toString("utf8")
  while (Buffer.byteLength(prefix, "utf8") > maxBytes - suffix.byteLength) prefix = prefix.slice(0, -1)
  return `${prefix}${suffix.toString("utf8")}`
}

function textFromTaskExport(value: unknown, depth = 0): string | undefined {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object" || depth > 6) return undefined
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const found = textFromTaskExport(value[index], depth + 1)
      if (found?.trim()) return found
    }
    return undefined
  }
  const record = value as Record<string, unknown>
  for (const key of ["result", "jsonText", "artifactText", "resultText", "text", "content", "output", "message", "lastAssistantText"]) {
    const found = textFromTaskExport(record[key], depth + 1)
    if (found?.trim()) return found
  }
  return undefined
}

function isWorkspaceRelativePath(value: string): boolean {
  if (!value.trim()) return false
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\\\")) return false
  const normalized = value.replace(/\\/g, "/")
  if (normalized.split("/").some((segment) => segment === "..")) return false
  return true
}

function error(message: string, artifactId?: string, stepId?: string): TaskSnapshotImportPreviewIssue {
  return { severity: "error", message, artifactId, stepId }
}

function warning(message: string, artifactId?: string, stepId?: string): TaskSnapshotImportPreviewIssue {
  return { severity: "warning", message, artifactId, stepId }
}

function info(message: string, artifactId?: string, stepId?: string): TaskSnapshotImportPreviewIssue {
  return { severity: "info", message, artifactId, stepId }
}
