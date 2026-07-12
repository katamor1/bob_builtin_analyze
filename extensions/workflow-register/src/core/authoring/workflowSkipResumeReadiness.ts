import { createHash } from "crypto"
import { WorkflowArtifactDefinition } from "../model"
import { WorkflowAuthoringModel, WorkflowAuthoringStep, normalizeId } from "./workflowAuthoringModel"

export type WorkflowSkipResumeCandidateSource = "step" | "form" | "approval"
export type WorkflowSkipResumeCandidateStatus = "proposed" | "ready" | "conflict"

export interface WorkflowSkipResumeReadinessCandidate {
  candidateId: string
  stepId: string
  stepTitle: string
  stepType: WorkflowAuthoringStep["type"]
  resultKey: string
  source: WorkflowSkipResumeCandidateSource
  status: WorkflowSkipResumeCandidateStatus
  proposedArtifact: WorkflowArtifactDefinition
  existingArtifact?: WorkflowArtifactDefinition
  message?: string
}

export interface WorkflowSkipResumeReadinessUnavailableOutput {
  stepId: string
  stepTitle: string
  code: "agent-result-key-missing" | "result-file-sink-missing"
  message: string
}

export interface WorkflowSkipResumeReadinessPlan {
  fileBoundBefore: boolean
  fileBoundAfter: true
  candidates: WorkflowSkipResumeReadinessCandidate[]
  selectedCandidateIds: string[]
  unavailable: WorkflowSkipResumeReadinessUnavailableOutput[]
  warnings: string[]
  errors: string[]
  diff: string
  fingerprint: string
}

export interface WorkflowSkipResumeReadinessApplyResult {
  model: WorkflowAuthoringModel
  plan: WorkflowSkipResumeReadinessPlan
  addedArtifacts: WorkflowArtifactDefinition[]
}

interface OutputProducer {
  candidateId: string
  stepId: string
  stepTitle: string
  stepType: WorkflowAuthoringStep["type"]
  resultKey: string
  source: WorkflowSkipResumeCandidateSource
  proposedArtifact: WorkflowArtifactDefinition
}

export function planWorkflowSkipResumeReadiness(
  model: WorkflowAuthoringModel,
  selectedCandidateIds?: readonly string[]
): WorkflowSkipResumeReadinessPlan {
  const unavailable = unavailableOutputs(model)
  const outputs = reusableOutputs(model)
  const outputIds = frequencyMap(outputs.map((output) => output.resultKey))
  const artifactsById = groupArtifactsById(model.artifacts)
  const warnings: string[] = []
  const errors = unavailable.map((item) => item.message)

  const duplicateArtifactIds = [...artifactsById.entries()]
    .filter(([, artifacts]) => artifacts.length > 1)
    .map(([artifactId]) => artifactId)
  for (const artifactId of duplicateArtifactIds) {
    errors.push(`Artifact id '${artifactId}' is duplicated; resolve the definitions before applying skip resume readiness.`)
  }

  const candidates = outputs.map((output): WorkflowSkipResumeReadinessCandidate => {
    if ((outputIds.get(output.resultKey) ?? 0) > 1) {
      const message = `Result key '${output.resultKey}' is produced more than once and cannot map to one artifact id.`
      errors.push(message)
      return { ...output, status: "conflict", message }
    }

    const sameId = artifactsById.get(output.resultKey) ?? []
    if (sameId.length === 0) return { ...output, status: "proposed" }
    if (sameId.length > 1) {
      const message = `Artifact id '${output.resultKey}' has multiple definitions and cannot be updated automatically.`
      return { ...output, status: "conflict", message }
    }

    const existing = sameId[0]
    if (existing.producedBy !== output.stepId) {
      const message = `Artifact id '${output.resultKey}' is already owned by step '${existing.producedBy ?? "(none)"}', not '${output.stepId}'.`
      errors.push(message)
      return { ...output, status: "conflict", existingArtifact: cloneArtifact(existing), message }
    }
    if (!isRunScopedArtifactPath(existing.path)) {
      const message = `Artifact '${output.resultKey}' for step '${output.stepId}' is not run-scoped and will not be overwritten automatically.`
      errors.push(message)
      return { ...output, status: "conflict", existingArtifact: cloneArtifact(existing), message }
    }
    if (existing.schema && existing.schema !== output.proposedArtifact.schema) {
      warnings.push(`Artifact '${output.resultKey}' keeps existing schema '${existing.schema}' instead of proposed '${output.proposedArtifact.schema}'.`)
    }
    return { ...output, status: "ready", existingArtifact: cloneArtifact(existing) }
  })

  const candidateIds = new Set(candidates.map((candidate) => candidate.candidateId))
  const selected = selectedCandidateIds === undefined
    ? candidates.filter((candidate) => candidate.status !== "conflict").map((candidate) => candidate.candidateId)
    : uniqueInOrder(selectedCandidateIds)
  for (const selectedId of selected) {
    if (!candidateIds.has(selectedId)) errors.push(`Unknown skip resume readiness candidate '${selectedId}'. Preview the workflow again.`)
  }
  for (const candidate of candidates) {
    if (candidate.status === "conflict" && selected.includes(candidate.candidateId)) {
      errors.push(candidate.message ?? `Candidate '${candidate.candidateId}' has an unresolved artifact conflict.`)
    }
  }

  const fileBoundBefore = model.skipResume?.fileBound === true
  const normalizedErrors = uniqueSorted(errors)
  const normalizedWarnings = uniqueSorted(warnings)
  const selectedKnown = selected.filter((candidateId) => candidateIds.has(candidateId))
  const fingerprint = readinessFingerprint(model, selectedKnown)
  const plan: WorkflowSkipResumeReadinessPlan = {
    fileBoundBefore,
    fileBoundAfter: true,
    candidates,
    selectedCandidateIds: selectedKnown,
    unavailable,
    warnings: normalizedWarnings,
    errors: normalizedErrors,
    diff: "",
    fingerprint
  }
  plan.diff = formatWorkflowSkipResumeReadinessDiff(plan)
  return plan
}

export function applyWorkflowSkipResumeReadiness(
  model: WorkflowAuthoringModel,
  selectedCandidateIds: readonly string[],
  expectedFingerprint: string
): WorkflowSkipResumeReadinessApplyResult {
  const plan = planWorkflowSkipResumeReadiness(model, selectedCandidateIds)
  if (plan.fingerprint !== expectedFingerprint) {
    throw new Error("Workflow model changed after the readiness preview; preview again before applying changes.")
  }
  if (plan.errors.length > 0) {
    throw new Error(`Workflow skip resume readiness cannot be applied: ${plan.errors.join(" ")}`)
  }

  const selected = new Set(plan.selectedCandidateIds)
  const addedArtifacts = plan.candidates
    .filter((candidate) => selected.has(candidate.candidateId) && candidate.status === "proposed")
    .map((candidate) => cloneArtifact(candidate.proposedArtifact))
  const next = structuredClone(model)
  next.skipResume = { fileBound: true }
  next.artifacts = [...next.artifacts, ...addedArtifacts.map(cloneArtifact)]
  return { model: next, plan, addedArtifacts }
}

export function formatWorkflowSkipResumeReadinessDiff(plan: WorkflowSkipResumeReadinessPlan): string {
  const lines: string[] = []
  lines.push(`${plan.fileBoundBefore ? "=" : "+"} x-skipResume.fileBound: true`)
  const selected = new Set(plan.selectedCandidateIds)
  for (const candidate of plan.candidates) {
    const marker = candidate.status === "conflict" ? "!" : selected.has(candidate.candidateId) ? (candidate.status === "ready" ? "=" : "+") : "-"
    const artifact = candidate.existingArtifact ?? candidate.proposedArtifact
    lines.push(`${marker} artifact ${artifact.id} (producedBy ${candidate.stepId}) -> ${artifact.path} [${artifact.schema ?? "schema unspecified"}]`)
  }
  for (const item of plan.unavailable) lines.push(`! step ${item.stepId}: ${item.message}`)
  for (const warning of plan.warnings) lines.push(`~ ${warning}`)
  for (const error of plan.errors) lines.push(`! ${error}`)
  return lines.join("\n")
}

export function readinessFingerprint(model: WorkflowAuthoringModel, selectedCandidateIds: readonly string[]): string {
  const payload = canonicalJson({ model, selectedCandidateIds: [...selectedCandidateIds].sort(compareText) })
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`
}

function reusableOutputs(model: WorkflowAuthoringModel): OutputProducer[] {
  const outputs: OutputProducer[] = []
  for (const step of model.steps) {
    if ((step.type === "command" || step.type === "agent") && step.resultKey?.trim()) {
      outputs.push(outputProducer(step, step.resultKey.trim(), "step"))
    }
    if (step.type === "manual") {
      if (step.form?.resultKey?.trim()) outputs.push(outputProducer(step, step.form.resultKey.trim(), "form"))
      if (step.approval?.resultKey?.trim()) outputs.push(outputProducer(step, step.approval.resultKey.trim(), "approval"))
    }
  }
  return outputs
}

function outputProducer(
  step: WorkflowAuthoringStep,
  resultKey: string,
  source: WorkflowSkipResumeCandidateSource
): OutputProducer {
  const schema = step.type === "agent" ? "text/markdown" : "application/json"
  const extension = step.type === "agent" ? "md" : "json"
  const stepSegment = safePathSegment(step.id, "step")
  const resultSegment = safePathSegment(resultKey, "result")
  return {
    candidateId: candidateId(step.id, source, resultKey),
    stepId: step.id,
    stepTitle: step.title,
    stepType: step.type,
    resultKey,
    source,
    proposedArtifact: {
      id: resultKey,
      producedBy: step.id,
      path: `.bob/workflows/runs/{{run.id}}/artifacts/${stepSegment}/${resultSegment}.${extension}`,
      schema
    }
  }
}

function unavailableOutputs(model: WorkflowAuthoringModel): WorkflowSkipResumeReadinessUnavailableOutput[] {
  const unavailable: WorkflowSkipResumeReadinessUnavailableOutput[] = []
  for (const step of model.steps) {
    if (step.type === "agent" && !step.resultKey?.trim()) {
      unavailable.push({
        stepId: step.id,
        stepTitle: step.title,
        code: "agent-result-key-missing",
        message: `Agent step '${step.id}' has no resultKey and cannot be made file-bound automatically.`
      })
    }
    if (step.type === "result" && !step.result.sinks.some((sink) => sink.type === "file")) {
      unavailable.push({
        stepId: step.id,
        stepTitle: step.title,
        code: "result-file-sink-missing",
        message: `Result step '${step.id}' has no file sink and is not skip-resume ready.`
      })
    }
  }
  return unavailable
}

function candidateId(stepId: string, source: WorkflowSkipResumeCandidateSource, resultKey: string): string {
  return `${encodeURIComponent(stepId)}::${source}::${encodeURIComponent(resultKey)}`
}

function groupArtifactsById(artifacts: readonly WorkflowArtifactDefinition[]): Map<string, WorkflowArtifactDefinition[]> {
  const grouped = new Map<string, WorkflowArtifactDefinition[]>()
  for (const artifact of artifacts) {
    const items = grouped.get(artifact.id) ?? []
    items.push(artifact)
    grouped.set(artifact.id, items)
  }
  return grouped
}

function frequencyMap(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

function cloneArtifact(artifact: WorkflowArtifactDefinition): WorkflowArtifactDefinition {
  return { id: artifact.id, producedBy: artifact.producedBy, path: artifact.path, schema: artifact.schema }
}

function isRunScopedArtifactPath(value: string): boolean {
  return /\{\{\s*(?:run\.id|runId)\s*\}\}/.test(value)
}

function safePathSegment(value: string, fallback: string): string {
  return normalizeId(value) || fallback
}

function uniqueInOrder(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    unique.push(value)
  }
  return unique
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort(compareText)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => [key, canonicalJson((value as Record<string, unknown>)[key])])
  )
}
