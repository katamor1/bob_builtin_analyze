import type {
  RunStatus,
  RunStepAttempt,
  RunStepState,
  StepRunStatus,
  WorkflowBranchCheckpointDecisionOutcome,
  WorkflowBranchCheckpointDecisionRecord,
  WorkflowBranchCheckpointState,
  WorkflowBranchLoopState,
  WorkflowBranchTransitionRecord,
  WorkflowRunBranchingState,
  WorkflowRunState,
  WorkflowRunStateV2,
  WorkflowSchemaVersion,
  WorkflowStepType
} from "../model"
import { canonicalizeJsonV1 } from "./canonicalJsonV1"

export const WORKFLOW_RUN_STATE_V2_SCHEMA_VERSION = "workflow-register/run-state/v2" as const
const WORKFLOW_RUN_STATE_V1_SCHEMA_VERSION = "workflow-register/run-state/v1" as const
const ARTIFACT_MANIFEST_STATE_KEY = "workflow.artifactManifest"

const V2_FIELDS = new Set([
  "schemaVersion",
  "runId",
  "workflowId",
  "workflowName",
  "workflowSchemaVersion",
  "workflowDefinitionHash",
  "engineVersion",
  "status",
  "currentStep",
  "inputs",
  "state",
  "branching",
  "steps",
  "createdAt",
  "updatedAt",
  "error"
])

const V1_FIELDS = new Set([
  ...V2_FIELDS,
  "workflowFile",
  "bobTaskSync",
  "revision",
  "projectionVersion",
  "projectionHash"
])

const STEP_FIELDS = new Set([
  "id",
  "title",
  "type",
  "status",
  "attempt",
  "attempts",
  "startedAt",
  "completedAt",
  "reviewStartedAt",
  "acceptedAt",
  "error"
])

const ATTEMPT_FIELDS = new Set([
  "attempt",
  "status",
  "startedAt",
  "completedAt",
  "reviewStartedAt",
  "acceptedAt",
  "reviewDecision",
  "reviewComment",
  "error",
  "stateSnapshot",
  "branchDecisionId",
  "branchLoopId",
  "branchFromStepId",
  "branchToStepId",
  "branchLoopCount",
  "createdAt"
])

const BRANCHING_FIELDS = new Set(["loops", "checkpoint", "checkpointDecisions", "history"])
const LOOP_FIELDS = new Set([
  "loopId",
  "count",
  "allowed",
  "maxIterations",
  "extensionSize",
  "checkpointCount",
  "lastTransitionAt"
])
const CHECKPOINT_FIELDS = new Set([
  "id",
  "loopId",
  "fromStepId",
  "toStepId",
  "decisionId",
  "count",
  "allowed",
  "extensionSize",
  "message",
  "createdAt"
])
const CHECKPOINT_DECISION_FIELDS = new Set([
  "checkpointId",
  "outcome",
  "loopId",
  "ownerStepId",
  "targetStepId",
  "transitionDecisionId",
  "decidedAt",
  "reason"
])
const TRANSITION_FIELDS = new Set([
  "id",
  "loopId",
  "decisionId",
  "fromStepId",
  "toStepId",
  "action",
  "loopCount",
  "createdAt",
  "conditionSnapshot"
])

export function decodeWorkflowRunStateV2(value: unknown): WorkflowRunStateV2 {
  const record = canonicalRecordClone(value, "Workflow run-state/v2 document")
  assertAllowedFields(record, V2_FIELDS, "Workflow run-state/v2 document")
  const schemaVersion = decodeV2SchemaVersion(record.schemaVersion)
  const decoded = decodeDomainState(record, schemaVersion)
  assertV2VersionExhaustive(decoded.schemaVersion)
  return decoded
}

export function encodeWorkflowRunStateV2(state: WorkflowRunStateV2): Buffer {
  return canonicalizeJsonV1(decodeWorkflowRunStateV2(state))
}

export function upgradeWorkflowRunStateV1(source: WorkflowRunState): WorkflowRunStateV2 {
  const record = canonicalRecordClone(source, "Workflow run-state/v1 document")
  assertAllowedFields(record, V1_FIELDS, "Workflow run-state/v1 document")
  if (record.schemaVersion !== WORKFLOW_RUN_STATE_V1_SCHEMA_VERSION) {
    throw new Error(
      `Workflow run-state/v1 field 'schemaVersion' must equal '${WORKFLOW_RUN_STATE_V1_SCHEMA_VERSION}'.`
    )
  }
  return decodeDomainState(record, WORKFLOW_RUN_STATE_V2_SCHEMA_VERSION, true)
}

function decodeDomainState(
  record: Record<string, unknown>,
  schemaVersion: WorkflowRunStateV2["schemaVersion"],
  upgrading = false
): WorkflowRunStateV2 {
  const workflowSchemaVersion = optionalWorkflowSchemaVersion(record.workflowSchemaVersion)
  const workflowDefinitionHash = optionalString(record, "workflowDefinitionHash")
  const engineVersion = optionalString(record, "engineVersion")
  const currentStep = optionalString(record, "currentStep")
  const branching = record.branching === undefined
    ? undefined
    : decodeBranching(record.branching)
  const error = optionalString(record, "error")
  const status = decodeRunStatus(record.status)
  assertRunStatusExhaustive(status)

  return {
    schemaVersion,
    runId: requiredString(record, "runId"),
    workflowId: requiredString(record, "workflowId"),
    workflowName: requiredString(record, "workflowName"),
    ...(workflowSchemaVersion === undefined ? {} : { workflowSchemaVersion }),
    ...(workflowDefinitionHash === undefined ? {} : { workflowDefinitionHash }),
    ...(engineVersion === undefined ? {} : { engineVersion }),
    status,
    ...(currentStep === undefined ? {} : { currentStep }),
    inputs: requiredRecord(record.inputs, "Workflow run-state/v2 field 'inputs'"),
    state: decodeStringRecord(record.state, "Workflow run-state/v2 field 'state'", upgrading),
    ...(branching === undefined ? {} : { branching }),
    steps: decodeSteps(record.steps),
    createdAt: requiredString(record, "createdAt"),
    updatedAt: requiredString(record, "updatedAt"),
    ...(error === undefined ? {} : { error })
  }
}

function decodeSteps(value: unknown): RunStepState[] {
  if (!Array.isArray(value)) throw new Error("Workflow run-state/v2 field 'steps' must be an array.")
  return value.map((entry, index) => {
    const label = `Workflow run-state/v2 step at index ${index}`
    const record = requiredRecord(entry, label)
    assertAllowedFields(record, STEP_FIELDS, label)
    const id = requiredString(record, "id", label)
    const type = decodeStepType(record.type, id)
    const status = decodeStepStatus(record.status, `step '${id}'`)
    assertStepTypeExhaustive(type)
    assertStepStatusExhaustive(status)
    const attempt = optionalNumber(record, "attempt", label)
    const attempts = record.attempts === undefined ? undefined : decodeAttempts(record.attempts, id)
    const startedAt = optionalString(record, "startedAt", label)
    const completedAt = optionalString(record, "completedAt", label)
    const reviewStartedAt = optionalString(record, "reviewStartedAt", label)
    const acceptedAt = optionalString(record, "acceptedAt", label)
    const error = optionalString(record, "error", label)
    return {
      id,
      title: requiredString(record, "title", label),
      type,
      status,
      ...(attempt === undefined ? {} : { attempt }),
      ...(attempts === undefined ? {} : { attempts }),
      ...(startedAt === undefined ? {} : { startedAt }),
      ...(completedAt === undefined ? {} : { completedAt }),
      ...(reviewStartedAt === undefined ? {} : { reviewStartedAt }),
      ...(acceptedAt === undefined ? {} : { acceptedAt }),
      ...(error === undefined ? {} : { error })
    }
  })
}

function decodeAttempts(value: unknown, stepId: string): RunStepAttempt[] {
  if (!Array.isArray(value)) {
    throw new Error(`Workflow run-state/v2 step '${stepId}' field 'attempts' must be an array.`)
  }
  return value.map((entry, index) => {
    const label = `Workflow run-state/v2 step '${stepId}' attempt at index ${index}`
    const record = requiredRecord(entry, label)
    assertAllowedFields(record, ATTEMPT_FIELDS, label)
    const status = decodeStepStatus(record.status, `step '${stepId}' attempt at index ${index}`)
    assertStepStatusExhaustive(status)
    const reviewDecision = optionalReviewDecision(record.reviewDecision, label)
    const stateSnapshot = record.stateSnapshot === undefined
      ? undefined
      : decodeStringRecord(record.stateSnapshot, `${label} field 'stateSnapshot'`, false)
    const startedAt = optionalString(record, "startedAt", label)
    const completedAt = optionalString(record, "completedAt", label)
    const reviewStartedAt = optionalString(record, "reviewStartedAt", label)
    const acceptedAt = optionalString(record, "acceptedAt", label)
    const reviewComment = optionalString(record, "reviewComment", label)
    const error = optionalString(record, "error", label)
    const branchDecisionId = optionalString(record, "branchDecisionId", label)
    const branchLoopId = optionalString(record, "branchLoopId", label)
    const branchFromStepId = optionalString(record, "branchFromStepId", label)
    const branchToStepId = optionalString(record, "branchToStepId", label)
    const branchLoopCount = optionalNumber(record, "branchLoopCount", label)
    return {
      attempt: requiredNumber(record, "attempt", label),
      status,
      ...(startedAt === undefined ? {} : { startedAt }),
      ...(completedAt === undefined ? {} : { completedAt }),
      ...(reviewStartedAt === undefined ? {} : { reviewStartedAt }),
      ...(acceptedAt === undefined ? {} : { acceptedAt }),
      ...(reviewDecision === undefined ? {} : { reviewDecision }),
      ...(reviewComment === undefined ? {} : { reviewComment }),
      ...(error === undefined ? {} : { error }),
      ...(stateSnapshot === undefined ? {} : { stateSnapshot }),
      ...(branchDecisionId === undefined ? {} : { branchDecisionId }),
      ...(branchLoopId === undefined ? {} : { branchLoopId }),
      ...(branchFromStepId === undefined ? {} : { branchFromStepId }),
      ...(branchToStepId === undefined ? {} : { branchToStepId }),
      ...(branchLoopCount === undefined ? {} : { branchLoopCount }),
      createdAt: requiredString(record, "createdAt", label)
    }
  })
}

function decodeBranching(value: unknown): WorkflowRunBranchingState {
  const label = "Workflow run-state/v2 field 'branching'"
  const record = requiredRecord(value, label)
  assertAllowedFields(record, BRANCHING_FIELDS, label)
  const loopsRecord = requiredRecord(record.loops, `${label} field 'loops'`)
  const loops: Record<string, WorkflowBranchLoopState> = {}
  for (const key of Object.keys(loopsRecord)) {
    defineRecordEntry(loops, key, decodeBranchLoop(loopsRecord[key], key))
  }
  const checkpoint = record.checkpoint === undefined
    ? undefined
    : decodeBranchCheckpoint(record.checkpoint)
  const checkpointDecisions = record.checkpointDecisions === undefined
    ? undefined
    : decodeCheckpointDecisions(record.checkpointDecisions)
  if (!Array.isArray(record.history)) {
    throw new Error(`${label} field 'history' must be an array.`)
  }
  const history = record.history.map(decodeBranchTransition)
  return {
    loops,
    ...(checkpoint === undefined ? {} : { checkpoint }),
    ...(checkpointDecisions === undefined ? {} : { checkpointDecisions }),
    history
  }
}

function decodeBranchLoop(value: unknown, key: string): WorkflowBranchLoopState {
  const label = `Workflow run-state/v2 branching loop '${key}'`
  const record = requiredRecord(value, label)
  assertAllowedFields(record, LOOP_FIELDS, label)
  const lastTransitionAt = optionalString(record, "lastTransitionAt", label)
  return {
    loopId: requiredString(record, "loopId", label),
    count: requiredNumber(record, "count", label),
    allowed: requiredNumber(record, "allowed", label),
    maxIterations: requiredNumber(record, "maxIterations", label),
    extensionSize: requiredNumber(record, "extensionSize", label),
    checkpointCount: requiredNumber(record, "checkpointCount", label),
    ...(lastTransitionAt === undefined ? {} : { lastTransitionAt })
  }
}

function decodeBranchCheckpoint(value: unknown): WorkflowBranchCheckpointState {
  const label = "Workflow run-state/v2 branching checkpoint"
  const record = requiredRecord(value, label)
  assertAllowedFields(record, CHECKPOINT_FIELDS, label)
  return {
    id: requiredString(record, "id", label),
    loopId: requiredString(record, "loopId", label),
    fromStepId: requiredString(record, "fromStepId", label),
    toStepId: requiredString(record, "toStepId", label),
    decisionId: requiredString(record, "decisionId", label),
    count: requiredNumber(record, "count", label),
    allowed: requiredNumber(record, "allowed", label),
    extensionSize: requiredNumber(record, "extensionSize", label),
    message: requiredString(record, "message", label),
    createdAt: requiredString(record, "createdAt", label)
  }
}

function decodeCheckpointDecisions(value: unknown): WorkflowBranchCheckpointDecisionRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("Workflow run-state/v2 branching field 'checkpointDecisions' must be an array.")
  }
  return value.map((entry, index) => {
    const label = `Workflow run-state/v2 branching checkpoint decision at index ${index}`
    const record = requiredRecord(entry, label)
    assertAllowedFields(record, CHECKPOINT_DECISION_FIELDS, label)
    const outcome = decodeCheckpointOutcome(record.outcome, label)
    assertCheckpointOutcomeExhaustive(outcome)
    const reason = optionalString(record, "reason", label)
    return {
      checkpointId: requiredString(record, "checkpointId", label),
      outcome,
      loopId: requiredString(record, "loopId", label),
      ownerStepId: requiredString(record, "ownerStepId", label),
      targetStepId: requiredString(record, "targetStepId", label),
      transitionDecisionId: requiredString(record, "transitionDecisionId", label),
      decidedAt: requiredString(record, "decidedAt", label),
      ...(reason === undefined ? {} : { reason })
    }
  })
}

function decodeBranchTransition(value: unknown, index: number): WorkflowBranchTransitionRecord {
  const label = `Workflow run-state/v2 branching transition at index ${index}`
  const record = requiredRecord(value, label)
  assertAllowedFields(record, TRANSITION_FIELDS, label)
  const action = decodeTransitionAction(record.action, label)
  assertTransitionActionExhaustive(action)
  const loopId = optionalString(record, "loopId", label)
  const toStepId = optionalString(record, "toStepId", label)
  const loopCount = optionalNumber(record, "loopCount", label)
  return {
    id: requiredString(record, "id", label),
    ...(loopId === undefined ? {} : { loopId }),
    decisionId: requiredString(record, "decisionId", label),
    fromStepId: requiredString(record, "fromStepId", label),
    ...(toStepId === undefined ? {} : { toStepId }),
    action,
    ...(loopCount === undefined ? {} : { loopCount }),
    createdAt: requiredString(record, "createdAt", label),
    ...(record.conditionSnapshot === undefined ? {} : { conditionSnapshot: record.conditionSnapshot })
  }
}

function canonicalRecordClone(value: unknown, label: string): Record<string, unknown> {
  const clone: unknown = JSON.parse(canonicalizeJsonV1(value).toString("utf8"))
  return requiredRecord(clone, label)
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function decodeStringRecord(value: unknown, label: string, omitArtifactManifest: boolean): Record<string, string> {
  const record = requiredRecord(value, label)
  const result: Record<string, string> = {}
  for (const key of Object.keys(record)) {
    if (key === ARTIFACT_MANIFEST_STATE_KEY) {
      if (omitArtifactManifest) continue
      throw new Error(`${label} contains excluded projection field '${ARTIFACT_MANIFEST_STATE_KEY}'.`)
    }
    if (typeof record[key] !== "string") throw new Error(`${label} field ${quoted(key)} must be a string.`)
    defineRecordEntry(result, key, record[key])
  }
  return result
}

function defineRecordEntry<T>(record: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(record, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

function assertAllowedFields(record: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${label} has unsupported field ${quoted(key)}.`)
  }
}

function requiredString(record: Record<string, unknown>, key: string, label = "Workflow run-state/v2"): string {
  const value = record[key]
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} field ${quoted(key)} must be a non-empty string.`)
  }
  return value
}

function optionalString(record: Record<string, unknown>, key: string, label = "Workflow run-state/v2"): string | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== "string") throw new Error(`${label} field ${quoted(key)} must be a string.`)
  return value
}

function requiredNumber(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key]
  if (typeof value !== "number") throw new Error(`${label} field ${quoted(key)} must be a number.`)
  return value
}

function optionalNumber(record: Record<string, unknown>, key: string, label: string): number | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== "number") throw new Error(`${label} field ${quoted(key)} must be a number.`)
  return value
}

function decodeV2SchemaVersion(value: unknown): WorkflowRunStateV2["schemaVersion"] {
  if (value !== WORKFLOW_RUN_STATE_V2_SCHEMA_VERSION) {
    throw new Error(
      `Workflow run-state/v2 field 'schemaVersion' must equal '${WORKFLOW_RUN_STATE_V2_SCHEMA_VERSION}'.`
    )
  }
  return value
}

function optionalWorkflowSchemaVersion(value: unknown): WorkflowSchemaVersion | undefined {
  if (value === undefined) return undefined
  if (value === "legacy" || value === "workflow-register/v1") {
    assertWorkflowSchemaVersionExhaustive(value)
    return value
  }
  throw new Error("Workflow run-state/v2 field 'workflowSchemaVersion' has an unsupported value.")
}

function decodeRunStatus(value: unknown): RunStatus {
  switch (value) {
    case "running":
    case "paused":
    case "checkpoint":
    case "reviewing":
    case "held":
    case "completed":
    case "failed":
      return value
    default:
      throw new Error("Workflow run-state/v2 field 'status' has an unsupported value.")
  }
}

function decodeStepStatus(value: unknown, label: string): StepRunStatus {
  switch (value) {
    case "pending":
    case "running":
    case "reviewing":
    case "held":
    case "completed":
    case "failed":
      return value
    default:
      throw new Error(`Workflow run-state/v2 ${label} field 'status' has an unsupported value.`)
  }
}

function decodeStepType(value: unknown, stepId: string): WorkflowStepType {
  switch (value) {
    case "command":
    case "agent":
    case "manual":
    case "result":
      return value
    default:
      throw new Error(`Workflow run-state/v2 step '${stepId}' field 'type' has an unsupported value.`)
  }
}

function optionalReviewDecision(value: unknown, label: string): RunStepAttempt["reviewDecision"] {
  if (value === undefined) return undefined
  if (value === "accepted" || value === "rejected") {
    assertReviewDecisionExhaustive(value)
    return value
  }
  throw new Error(`${label} field 'reviewDecision' has an unsupported value.`)
}

function decodeCheckpointOutcome(value: unknown, label: string): WorkflowBranchCheckpointDecisionOutcome {
  if (value === "approved" || value === "aborted") return value
  throw new Error(`${label} field 'outcome' has an unsupported value.`)
}

function decodeTransitionAction(value: unknown, label: string): WorkflowBranchTransitionRecord["action"] {
  switch (value) {
    case "next":
    case "goto":
    case "end":
    case "fail":
    case "checkpoint":
      return value
    default:
      throw new Error(`${label} field 'action' has an unsupported value.`)
  }
}

function assertV2VersionExhaustive(value: WorkflowRunStateV2["schemaVersion"]): void {
  switch (value) {
    case WORKFLOW_RUN_STATE_V2_SCHEMA_VERSION:
      return
    default:
      return assertNever(value)
  }
}

function assertWorkflowSchemaVersionExhaustive(value: WorkflowSchemaVersion): void {
  switch (value) {
    case "legacy":
    case "workflow-register/v1":
      return
    default:
      return assertNever(value)
  }
}

function assertRunStatusExhaustive(value: RunStatus): void {
  switch (value) {
    case "running":
    case "paused":
    case "checkpoint":
    case "reviewing":
    case "held":
    case "completed":
    case "failed":
      return
    default:
      return assertNever(value)
  }
}

function assertStepStatusExhaustive(value: StepRunStatus): void {
  switch (value) {
    case "pending":
    case "running":
    case "reviewing":
    case "held":
    case "completed":
    case "failed":
      return
    default:
      return assertNever(value)
  }
}

function assertStepTypeExhaustive(value: WorkflowStepType): void {
  switch (value) {
    case "command":
    case "agent":
    case "manual":
    case "result":
      return
    default:
      return assertNever(value)
  }
}

function assertReviewDecisionExhaustive(value: NonNullable<RunStepAttempt["reviewDecision"]>): void {
  switch (value) {
    case "accepted":
    case "rejected":
      return
    default:
      return assertNever(value)
  }
}

function assertCheckpointOutcomeExhaustive(value: WorkflowBranchCheckpointDecisionOutcome): void {
  switch (value) {
    case "approved":
    case "aborted":
      return
    default:
      return assertNever(value)
  }
}

function assertTransitionActionExhaustive(value: WorkflowBranchTransitionRecord["action"]): void {
  switch (value) {
    case "next":
    case "goto":
    case "end":
    case "fail":
    case "checkpoint":
      return
    default:
      return assertNever(value)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled run-state/v2 discriminant: ${String(value)}`)
}

function quoted(value: string): string {
  return JSON.stringify(value)
}
