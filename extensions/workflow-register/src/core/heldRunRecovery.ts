import type { CoreWorkflowDefinition, EngineStep, WorkflowRunState } from "./model"

export type HeldRunRecoveryKind =
  | "not-held"
  | "connected"
  | "detached-resumable"
  | "detached-artifact-recoverable"
  | "blocked"

export type HeldRunRecoveryActionId =
  | "none"
  | "open-manual-step"
  | "resume-saved-state"
  | "review-artifacts"
  | "review-task-snapshot"
  | "open-diagnostics"

export interface HeldRunRecoveryAction {
  id: HeldRunRecoveryActionId
  label: string
}

export interface HeldRunRecoveryEvidence {
  liveTaskAvailable: boolean
  activeManualStepAvailable: boolean
  workflowLoaded: boolean
  definitionCompatible: boolean
  artifactManifestAvailable: boolean
  taskSnapshotAvailable: boolean
  missingRequiredStateKeys: string[]
}

export interface HeldRunRecoveryAssessment {
  kind: HeldRunRecoveryKind
  runId: string
  stepId?: string
  nextStepId?: string
  title: string
  explanation: string
  primaryAction: HeldRunRecoveryAction
  blockers: string[]
  evidence: HeldRunRecoveryEvidence
}

export interface ClassifyHeldRunRecoveryInput {
  run: WorkflowRunState
  workflow?: CoreWorkflowDefinition
  liveTaskAvailable: boolean
  activeManualStepAvailable: boolean
  artifactManifestAvailable: boolean
  taskSnapshotAvailable: boolean
}

export const HELD_RECOVERY_STATE_KEY = "workflow.heldRecovery"

export interface HeldRunRecoveryProvenanceV1 {
  schemaVersion: "workflow-register/held-recovery/v1"
  kind: "saved-state"
  runId: string
  stepId: string
  nextStepId?: string
  recoveredAt: string
  source: "operation-hub"
}

export interface CreateHeldRunRecoveryProvenanceInput {
  runId: string
  stepId: string
  nextStepId?: string
  recoveredAt: string
  source: "operation-hub"
}

export function createHeldRunRecoveryProvenance(input: CreateHeldRunRecoveryProvenanceInput): HeldRunRecoveryProvenanceV1 {
  return {
    schemaVersion: "workflow-register/held-recovery/v1",
    kind: "saved-state",
    runId: input.runId,
    stepId: input.stepId,
    nextStepId: input.nextStepId,
    recoveredAt: input.recoveredAt,
    source: input.source
  }
}

export function buildHeldRunRecoveryPreview(
  run: WorkflowRunState,
  assessment: HeldRunRecoveryAssessment
): string[] {
  const stateKeys = Object.keys(run.state).sort()
  return [
    `- runId: ${run.runId}`,
    `- workflow: ${run.workflowId}`,
    `- current status: ${run.status}`,
    `- held step to complete: ${assessment.stepId ?? "none"}`,
    `- next step: ${assessment.nextStepId ?? "workflow completion"}`,
    `- persisted state keys: ${stateKeys.length > 0 ? stateKeys.join(", ") : "none"}`,
    "- state values, form values, snapshot text and artifact text are not shown."
  ]
}

const ACTIONS: Record<HeldRunRecoveryActionId, HeldRunRecoveryAction> = {
  none: { id: "none", label: "No recovery action" },
  "open-manual-step": { id: "open-manual-step", label: "Open manual step" },
  "resume-saved-state": { id: "resume-saved-state", label: "Resume from saved state" },
  "review-artifacts": { id: "review-artifacts", label: "Review reusable artifacts" },
  "review-task-snapshot": { id: "review-task-snapshot", label: "Review task snapshot" },
  "open-diagnostics": { id: "open-diagnostics", label: "Open diagnostics" }
}

export function classifyHeldRunRecovery(input: ClassifyHeldRunRecoveryInput): HeldRunRecoveryAssessment {
  const { run, workflow } = input
  const runStep = run.currentStep
    ? run.steps.find((step) => step.id === run.currentStep && step.status === "held")
    : undefined
  const workflowStep = run.currentStep
    ? workflow?.engineSteps.find((step) => step.id === run.currentStep)
    : undefined
  const workflowCurrentIndex = workflowStep
    ? workflow?.engineSteps.findIndex((step) => step.id === workflowStep.id) ?? -1
    : -1
  const nextWorkflowStep = workflowCurrentIndex >= 0
    ? workflow?.engineSteps[workflowCurrentIndex + 1]
    : undefined
  const missingRequiredStateKeys = uniqueStrings([
    ...(workflowStep ? requiredStateKeysMissing(workflowStep, run.state) : []),
    ...(nextWorkflowStep ? requiredStateKeysMissing(nextWorkflowStep, run.state) : [])
  ])
  const definitionCompatible = Boolean(workflow && definitionMatches(run, workflow) && stepOrderMatches(run, workflow))
  const evidence: HeldRunRecoveryEvidence = {
    liveTaskAvailable: input.liveTaskAvailable,
    activeManualStepAvailable: input.activeManualStepAvailable,
    workflowLoaded: Boolean(workflow),
    definitionCompatible,
    artifactManifestAvailable: input.artifactManifestAvailable,
    taskSnapshotAvailable: input.taskSnapshotAvailable,
    missingRequiredStateKeys
  }

  if (run.status !== "held") {
    return assessment({
      kind: "not-held",
      run,
      evidence,
      title: "Run is not waiting at a held step",
      explanation: "Detached held-step recovery is available only while the persisted run status is held.",
      primaryAction: ACTIONS.none
    })
  }

  if (runStep && (input.liveTaskAvailable || input.activeManualStepAvailable)) {
    return assessment({
      kind: "connected",
      run,
      stepId: runStep.id,
      evidence,
      title: "Held step is connected",
      explanation: "A live Bob task or manual-step handle is available. Continue through the existing manual-step flow.",
      primaryAction: ACTIONS["open-manual-step"]
    })
  }

  const blockers: string[] = []
  if (!workflow) blockers.push(`Workflow definition is not loaded for '${run.workflowId}'.`)
  if (!runStep) blockers.push(`Current held step '${run.currentStep ?? "none"}' is missing from the persisted run.`)
  if (workflow && !workflowStep) blockers.push(`Current held step '${run.currentStep ?? "none"}' is missing from the workflow definition.`)
  if (workflow && !definitionMatches(run, workflow)) blockers.push("Workflow definition does not match the definition used by this run.")
  if (workflow && !stepOrderMatches(run, workflow)) blockers.push("Workflow step order or identifiers are incompatible with the persisted run.")
  if (missingRequiredStateKeys.length > 0) {
    blockers.push(`Required workflow state is missing: ${missingRequiredStateKeys.join(", ")}.`)
  }
  if (workflowStep?.type === "manual") blockers.push(...manualCompletionBlockers(workflowStep, run.state))

  if (blockers.length > 0) {
    if (input.artifactManifestAvailable) {
      return assessment({
        kind: "detached-artifact-recoverable",
        run,
        stepId: runStep?.id,
        evidence,
        blockers,
        title: "Held run requires artifact recovery",
        explanation: "Direct saved-state recovery is blocked, but a reusable artifact manifest is available for review.",
        primaryAction: ACTIONS["review-artifacts"]
      })
    }
    if (input.taskSnapshotAvailable) {
      return assessment({
        kind: "detached-artifact-recoverable",
        run,
        stepId: runStep?.id,
        evidence,
        blockers,
        title: "Held run requires task-snapshot recovery",
        explanation: "Direct saved-state recovery is blocked, but a task snapshot is available for preview and selective import.",
        primaryAction: ACTIONS["review-task-snapshot"]
      })
    }
    return assessment({
      kind: "blocked",
      run,
      stepId: runStep?.id,
      evidence,
      blockers,
      title: "Held run recovery is blocked",
      explanation: "The run cannot be resumed safely until the diagnostics are resolved or compatible recovery evidence is supplied.",
      primaryAction: ACTIONS["open-diagnostics"]
    })
  }

  const currentIndex = workflow?.engineSteps.findIndex((step) => step.id === runStep?.id) ?? -1
  const nextStepId = currentIndex >= 0 ? workflow?.engineSteps[currentIndex + 1]?.id : undefined
  return assessment({
    kind: "detached-resumable",
    run,
    stepId: runStep?.id,
    nextStepId,
    evidence,
    title: "Held run can resume from saved state",
    explanation: "The persisted definition, step order and required state are compatible. Explicit confirmation is required before completing the detached held step.",
    primaryAction: ACTIONS["resume-saved-state"]
  })
}

function assessment(input: Omit<HeldRunRecoveryAssessment, "runId" | "blockers"> & {
  run: WorkflowRunState
  blockers?: string[]
}): HeldRunRecoveryAssessment {
  return {
    kind: input.kind,
    runId: input.run.runId,
    stepId: input.stepId,
    nextStepId: input.nextStepId,
    title: input.title,
    explanation: input.explanation,
    primaryAction: { ...input.primaryAction },
    blockers: [...(input.blockers ?? [])],
    evidence: {
      ...input.evidence,
      missingRequiredStateKeys: [...input.evidence.missingRequiredStateKeys]
    }
  }
}

function definitionMatches(run: WorkflowRunState, workflow: CoreWorkflowDefinition): boolean {
  if (!run.workflowDefinitionHash || !workflow.definitionHash) return true
  return run.workflowDefinitionHash === workflow.definitionHash
}

function stepOrderMatches(run: WorkflowRunState, workflow: CoreWorkflowDefinition): boolean {
  const currentIndex = run.currentStep ? run.steps.findIndex((step) => step.id === run.currentStep) : -1
  if (currentIndex < 0) return false
  for (let index = 0; index <= currentIndex; index += 1) {
    if (run.steps[index]?.id !== workflow.engineSteps[index]?.id) return false
  }
  return true
}

function manualCompletionBlockers(
  step: Extract<EngineStep, { type: "manual" }>,
  state: Record<string, string>
): string[] {
  const blockers: string[] = []
  if (step.form?.resultKey) {
    const raw = state[step.form.resultKey]
    const value = raw === undefined ? undefined : parseStateValue(raw)
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      blockers.push(`Persisted manual form result '${step.form.resultKey}' is unavailable.`)
    } else {
      const record = value as Record<string, unknown>
      for (const field of step.form.fields.filter((candidate) => candidate.required)) {
        if (!manualFieldValuePresent(record[field.id])) {
          blockers.push(`Required manual form field '${field.id}' is unavailable in '${step.form.resultKey}'.`)
        }
      }
    }
  }
  if (step.approval?.resultKey) {
    const raw = state[step.approval.resultKey]
    const value = raw === undefined ? undefined : parseStateValue(raw)
    const decision = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).decision
      : undefined
    if (decision !== "approved" && decision !== "rejected") {
      blockers.push(`Persisted manual approval result '${step.approval.resultKey}' is unavailable.`)
    }
  }
  return blockers
}

function parseStateValue(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function manualFieldValuePresent(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === "string") return value.trim().length > 0
  return true
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

function requiredStateKeysMissing(step: EngineStep, state: Record<string, string>): string[] {
  if (!step.stateRequired) return []
  const seen = new Set<string>()
  const missing: string[] = []
  for (const key of step.includeState ?? []) {
    if (!key || seen.has(key)) continue
    seen.add(key)
    const value = state[key]
    if (value === undefined || value.trim().length === 0) missing.push(key)
  }
  return missing
}
