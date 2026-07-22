import { WorkflowDiagnostic, validateWorkflowText } from "../workflowValidator"
import { WorkflowAuthoringModel } from "./workflowAuthoringModel"
import { serializeAuthoringModelToMarkdown } from "./workflowAuthoringSerializer"
import {
  SkipResumeReadinessCandidate,
  planSkipResumeReadiness
} from "./workflowSkipResumeReadiness"

export interface SkipResumeReadinessValidationContext {
  sourceId: string
}

export interface SkipResumeReadinessPreview {
  ok: boolean
  candidates: SkipResumeReadinessCandidate[]
  blockingIssues: string[]
  changes: string[]
  selectedStepIds: string[]
  beforeMarkdown: string
  afterMarkdown: string
  filePath: string
  diagnostics: WorkflowDiagnostic[]
  nextModel: WorkflowAuthoringModel
}

export interface SkipResumeReadinessApplyResult extends SkipResumeReadinessPreview {
  model?: WorkflowAuthoringModel
}

export function buildSkipResumeReadinessPreview(
  model: WorkflowAuthoringModel,
  selectedStepIds: readonly string[] | undefined,
  context: SkipResumeReadinessValidationContext
): SkipResumeReadinessPreview {
  const plan = planSkipResumeReadiness(model, selectedStepIds)
  const before = serializeAuthoringModelToMarkdown(model)
  const after = serializeAuthoringModelToMarkdown(plan.nextModel)
  const validation = validateWorkflowText({
    sourceId: context.sourceId,
    filePath: after.filePath,
    text: after.markdown,
    strict: true
  })
  const ok = plan.blockingIssues.length === 0 && validation.ok
  return {
    ok,
    candidates: plan.candidates,
    blockingIssues: plan.blockingIssues,
    changes: plan.changes,
    selectedStepIds: plan.selectedStepIds,
    beforeMarkdown: before.markdown,
    afterMarkdown: after.markdown,
    filePath: after.filePath,
    diagnostics: validation.diagnostics,
    nextModel: plan.nextModel
  }
}

export function applySkipResumeReadiness(
  model: WorkflowAuthoringModel,
  selectedStepIds: readonly string[],
  context: SkipResumeReadinessValidationContext
): SkipResumeReadinessApplyResult {
  const preview = buildSkipResumeReadinessPreview(model, selectedStepIds, context)
  return {
    ...preview,
    model: preview.ok ? structuredClone(preview.nextModel) : undefined
  }
}
