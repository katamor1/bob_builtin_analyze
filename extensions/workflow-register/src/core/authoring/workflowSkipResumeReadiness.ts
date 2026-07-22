import { isFileResultSink, WorkflowArtifactDefinition, WorkflowStepType } from "../model"
import { WorkflowAuthoringModel, WorkflowAuthoringStep } from "./workflowAuthoringModel"

export type SkipResumeReadinessCandidateStatus = "ready" | "existing" | "blocked"

export interface SkipResumeReadinessCandidate {
  stepId: string
  stepTitle: string
  stepType: WorkflowStepType
  resultKey: string
  artifact: WorkflowArtifactDefinition
  status: SkipResumeReadinessCandidateStatus
  selected: boolean
  issues: string[]
}

export interface SkipResumeReadinessPlan {
  candidates: SkipResumeReadinessCandidate[]
  blockingIssues: string[]
  changes: string[]
  selectedStepIds: string[]
  nextModel: WorkflowAuthoringModel
}

interface ReusableOutput {
  step: WorkflowAuthoringStep
  resultKey: string
}

const WINDOWS_RESERVED_ARTIFACT_SEGMENTS = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
])

export function planSkipResumeReadiness(
  model: WorkflowAuthoringModel,
  selectedStepIds?: readonly string[]
): SkipResumeReadinessPlan {
  const nextModel = structuredClone(model)
  const outputs = reusableOutputs(model.steps)
  const outputKeysByStep = outputKeysByStepId(outputs)
  const explicitSelection = selectedStepIds === undefined ? undefined : new Set(selectedStepIds)
  const blockingIssues: string[] = []
  const blockingIssueSet = new Set<string>()
  const changes: string[] = []

  const addBlockingIssue = (message: string): void => {
    if (blockingIssueSet.has(message)) return
    blockingIssueSet.add(message)
    blockingIssues.push(message)
  }

  validateStepReadiness(model.steps, addBlockingIssue)
  validateExistingArtifactContracts(model.artifacts, outputKeysByStep, addBlockingIssue)

  const candidates = outputs.map(({ step, resultKey }): SkipResumeReadinessCandidate => {
    const generated = generatedArtifact(step.id, resultKey)
    const sameId = model.artifacts.filter((artifact) => artifact.id === resultKey)
    const exact = sameId.filter((artifact) => artifact.producedBy === step.id)
    const issues: string[] = []
    let status: SkipResumeReadinessCandidateStatus = "ready"

    if (!isPortableArtifactPathSegment(step.id)) {
      status = "blocked"
      issues.push(`Step id '${step.id}' must be a portable artifact path segment before skip resume artifacts can be generated.`)
    }
    if (!isPortableArtifactPathSegment(resultKey)) {
      status = "blocked"
      issues.push(`ResultKey '${resultKey}' from step '${step.id}' must be a portable artifact path segment before skip resume artifacts can be generated.`)
    }

    if (exact.length > 1) {
      status = "blocked"
      issues.push(`Artifact '${resultKey}' is defined more than once for step '${step.id}'.`)
    } else if (exact.length === 1) {
      if (isRunScopedArtifactPath(exact[0].path)) {
        if (status !== "blocked") status = "existing"
      } else {
        status = "blocked"
        issues.push(`Artifact '${resultKey}' for step '${step.id}' must use a run-scoped path containing '{{run.id}}' or '{{runId}}'.`)
      }
    } else if (sameId.length > 0) {
      status = "blocked"
      const owner = sameId[0].producedBy ? `step '${sameId[0].producedBy}'` : "an artifact without producedBy"
      issues.push(`Artifact '${resultKey}' is already owned by ${owner} and conflicts with reusable output from step '${step.id}'.`)
    }

    for (const issue of issues) addBlockingIssue(issue)
    const selected = explicitSelection ? explicitSelection.has(step.id) : status !== "blocked"
    return {
      stepId: step.id,
      stepTitle: step.title,
      stepType: step.type,
      resultKey,
      artifact: exact[0] ?? generated,
      status,
      selected,
      issues
    }
  })

  if (nextModel.skipResume?.fileBound !== true) {
    nextModel.skipResume = { fileBound: true }
    changes.push("Enable x-skipResume.fileBound.")
  }

  for (const candidate of candidates) {
    if (!candidate.selected || candidate.status !== "ready") continue
    nextModel.artifacts.push(structuredClone(candidate.artifact))
    changes.push(`Add artifact '${candidate.resultKey}' for step '${candidate.stepId}'.`)
  }

  const resolvedSelectedStepIds = model.steps
    .map((step) => step.id)
    .filter((stepId, index, all) => all.indexOf(stepId) === index)
    .filter((stepId) => candidates.some((candidate) => candidate.stepId === stepId && candidate.selected))

  return { candidates, blockingIssues, changes, selectedStepIds: resolvedSelectedStepIds, nextModel }
}

function reusableOutputs(steps: readonly WorkflowAuthoringStep[]): ReusableOutput[] {
  const outputs: ReusableOutput[] = []
  for (const step of steps) {
    const keys: Array<string | undefined> = []
    if (step.type === "command" || step.type === "agent") keys.push(step.resultKey)
    if (step.type === "manual") keys.push(step.form?.resultKey, step.approval?.resultKey)
    const seen = new Set<string>()
    for (const value of keys) {
      const resultKey = value?.trim()
      if (!resultKey || seen.has(resultKey)) continue
      seen.add(resultKey)
      outputs.push({ step, resultKey })
    }
  }
  return outputs
}

function outputKeysByStepId(outputs: readonly ReusableOutput[]): Map<string, Set<string>> {
  const byStep = new Map<string, Set<string>>()
  for (const output of outputs) {
    const keys = byStep.get(output.step.id) ?? new Set<string>()
    keys.add(output.resultKey)
    byStep.set(output.step.id, keys)
  }
  return byStep
}

function validateStepReadiness(steps: readonly WorkflowAuthoringStep[], addIssue: (message: string) => void): void {
  for (const step of steps) {
    if (step.type === "agent" && !step.resultKey?.trim()) {
      addIssue(`File-bound skip resume requires agent step '${step.id}' to define a resultKey.`)
    }
    if (step.type === "result" && !step.result.sinks.some((sink) => isFileResultSink(sink) && sink.path.trim())) {
      addIssue(`File-bound skip resume requires result step '${step.id}' to define a file sink.`)
    }
  }
}

function validateExistingArtifactContracts(
  artifacts: readonly WorkflowArtifactDefinition[],
  outputKeysByStep: ReadonlyMap<string, ReadonlySet<string>>,
  addIssue: (message: string) => void
): void {
  const ids = new Set<string>()
  for (const artifact of artifacts) {
    if (ids.has(artifact.id)) addIssue(`Artifact '${artifact.id}' is defined more than once.`)
    ids.add(artifact.id)
    if (!artifact.producedBy) continue
    const resultKeys = outputKeysByStep.get(artifact.producedBy)
    if (resultKeys && !resultKeys.has(artifact.id)) {
      addIssue(`Artifact '${artifact.id}' producedBy step '${artifact.producedBy}' does not match any reusable resultKey from that step.`)
    }
  }
}

function generatedArtifact(stepId: string, resultKey: string): WorkflowArtifactDefinition {
  return {
    id: resultKey,
    producedBy: stepId,
    path: `.bob/workflows/runs/{{run.id}}/artifacts/${stepId}/${resultKey}.md`,
    schema: "text/markdown"
  }
}

function isPortableArtifactPathSegment(value: string): boolean {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) return false
  if (value.endsWith(".")) return false
  const base = value.split(".", 1)[0].toUpperCase()
  return !WINDOWS_RESERVED_ARTIFACT_SEGMENTS.has(base)
}

function isRunScopedArtifactPath(path: string): boolean {
  return /\{\{\s*(?:run\.id|runId)\s*\}\}/.test(path)
}
