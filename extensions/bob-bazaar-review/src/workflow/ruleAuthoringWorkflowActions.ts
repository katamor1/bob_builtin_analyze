import { createHash } from "node:crypto"
import { constants as fsConstants, type BigIntStats } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { getProjectRulesPaths } from "../projectRules/io"
import {
  loadSelectedEvidence,
  parseEvidenceSelection,
  type RuleEvidenceSelectionV1
} from "../ruleAuthoring/evidenceSelection"
import { parseManagedMarkdown } from "../ruleAuthoring/managedMarkdownSections"
import {
  loadConfirmedRuleAuthoringHandoff,
  resolveRuleAuthoringArtifactPath,
  type ConfirmedRuleAuthoringHandoff
} from "../ruleAuthoring/ruleAuthoringArtifactStore"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "../ruleAuthoring/ruleAuthoringLimits"
import { getRuleAuthoringPaths, validateRuleAuthoringId } from "../ruleAuthoring/ruleAuthoringPaths"
import {
  commitRuleAuthoringArtifactGeneration,
  readRuleAuthoringRun,
  type RuleAuthoringArtifactKey,
  type RuleAuthoringArtifacts,
  type RuleAuthoringRunV1
} from "../ruleAuthoring/ruleAuthoringRunStore"
import type { RuleApplyEvidence } from "../ruleAuthoring/ruleApplyPlan"
import { parseAndValidateRuleProposal, type RuleProposalValidationContext } from "../ruleAuthoring/ruleProposalValidation"
import {
  createRuleProposalValidationArtifact,
  loadRuleProposalTriageState,
  parseDocumentChunks,
  verifyRuleAuthoringApply,
  type RuleAuthoringApplyVerificationResult,
  type StoredProposalValidationV1
} from "../ui/ruleProposalTriageGui"
import type { WorkflowActionExecutionInput } from "./workflowRegisterBridge"

const MAX_APPROVED_CHECKLIST_BYTES = 16 * 1024 * 1024
const CALLER_RUN_ID_KEYS = ["authoringRunId", "authoring_run_id", "runId", "run_id"] as const

interface ProviderArtifactMetadata {
  id: string
  ownership: "provider"
  path: string
}

interface WorkflowMetadata {
  artifacts: ProviderArtifactMetadata[]
}

interface ResolvedAuthoringExecution {
  workspaceRoot: string
  workflowRunId: string
  authoringRunId: string
  authoringSession: { run_id: string }
  run: RuleAuthoringRunV1
}

interface RuleAuthoringWorkflowActionDependencies {
  maxSelectedEvidenceBytes: number
  loadConfirmedRuleAuthoringHandoff: typeof loadConfirmedRuleAuthoringHandoff
  readRuleAuthoringRun: typeof readRuleAuthoringRun
  commitRuleAuthoringArtifactGeneration: typeof commitRuleAuthoringArtifactGeneration
  verifyRuleAuthoringApply: typeof verifyRuleAuthoringApply
  loadRuleProposalTriageState: typeof loadRuleProposalTriageState
  createRuleProposalValidationArtifact: typeof createRuleProposalValidationArtifact
}

export interface RuleAuthoringWorkflowActionOverrides {
  maxSelectedEvidenceBytes?: number
  loadConfirmedRuleAuthoringHandoff?: typeof loadConfirmedRuleAuthoringHandoff
  readRuleAuthoringRun?: typeof readRuleAuthoringRun
  commitRuleAuthoringArtifactGeneration?: typeof commitRuleAuthoringArtifactGeneration
  verifyRuleAuthoringApply?: typeof verifyRuleAuthoringApply
  loadRuleProposalTriageState?: typeof loadRuleProposalTriageState
  createRuleProposalValidationArtifact?: typeof createRuleProposalValidationArtifact
}

export interface RuleAuthoringWorkflowActions {
  loadRuleSourceIndex: (input: WorkflowActionExecutionInput) => Promise<unknown>
  captureRuleEvidenceSelection: (input: WorkflowActionExecutionInput) => Promise<unknown>
  loadSelectedRuleEvidence: (input: WorkflowActionExecutionInput) => Promise<unknown>
  captureRuleProposal: (input: WorkflowActionExecutionInput) => Promise<unknown>
  verifyRuleAuthoringApply: (input: WorkflowActionExecutionInput) => Promise<unknown>
}

export interface RuleAuthoringWorkflowTarget {
  workspaceRoot: string
  workflowRunId: string
  runId: string
}

export function createRuleAuthoringWorkflowActions(
  overrides: RuleAuthoringWorkflowActionOverrides = {}
): RuleAuthoringWorkflowActions {
  const dependencies: RuleAuthoringWorkflowActionDependencies = {
    maxSelectedEvidenceBytes: boundedSelectedEvidenceLimit(
      overrides.maxSelectedEvidenceBytes ?? DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes
    ),
    loadConfirmedRuleAuthoringHandoff:
      overrides.loadConfirmedRuleAuthoringHandoff ?? loadConfirmedRuleAuthoringHandoff,
    readRuleAuthoringRun: overrides.readRuleAuthoringRun ?? readRuleAuthoringRun,
    commitRuleAuthoringArtifactGeneration:
      overrides.commitRuleAuthoringArtifactGeneration ?? commitRuleAuthoringArtifactGeneration,
    verifyRuleAuthoringApply: overrides.verifyRuleAuthoringApply ?? verifyRuleAuthoringApply,
    loadRuleProposalTriageState: overrides.loadRuleProposalTriageState ?? loadRuleProposalTriageState,
    createRuleProposalValidationArtifact:
      overrides.createRuleProposalValidationArtifact ?? createRuleProposalValidationArtifact
  }
  return {
    loadRuleSourceIndex: (input) => loadSourceIndexWith(dependencies, input),
    captureRuleEvidenceSelection: (input) => captureEvidenceSelectionWith(dependencies, input),
    loadSelectedRuleEvidence: (input) => loadSelectedEvidenceWith(dependencies, input),
    captureRuleProposal: (input) => captureProposalWith(dependencies, input),
    verifyRuleAuthoringApply: (input) => verifyApplyWith(dependencies, input)
  }
}

const DEFAULT_ACTIONS = createRuleAuthoringWorkflowActions()

export function loadRuleSourceIndex(input: WorkflowActionExecutionInput): Promise<unknown> {
  return DEFAULT_ACTIONS.loadRuleSourceIndex(input)
}

export function captureRuleEvidenceSelection(input: WorkflowActionExecutionInput): Promise<unknown> {
  return DEFAULT_ACTIONS.captureRuleEvidenceSelection(input)
}

export function loadSelectedRuleEvidence(input: WorkflowActionExecutionInput): Promise<unknown> {
  return DEFAULT_ACTIONS.loadSelectedRuleEvidence(input)
}

export function captureRuleProposal(input: WorkflowActionExecutionInput): Promise<unknown> {
  return DEFAULT_ACTIONS.captureRuleProposal(input)
}

export function verifyRuleAuthoringApplyAction(input: WorkflowActionExecutionInput): Promise<unknown> {
  return DEFAULT_ACTIONS.verifyRuleAuthoringApply(input)
}

export async function resolveRuleAuthoringWorkflowTarget(
  input: WorkflowActionExecutionInput
): Promise<RuleAuthoringWorkflowTarget> {
  const execution = await resolveAuthoringExecution({
    maxSelectedEvidenceBytes: DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes,
    loadConfirmedRuleAuthoringHandoff,
    readRuleAuthoringRun,
    commitRuleAuthoringArtifactGeneration,
    verifyRuleAuthoringApply,
    loadRuleProposalTriageState,
    createRuleProposalValidationArtifact
  }, input)
  return {
    workspaceRoot: execution.workspaceRoot,
    workflowRunId: execution.workflowRunId,
    runId: execution.authoringRunId
  }
}

async function loadSourceIndexWith(
  dependencies: RuleAuthoringWorkflowActionDependencies,
  input: WorkflowActionExecutionInput
): Promise<unknown> {
  const execution = await resolveAuthoringExecution(dependencies, input)
  const handoff = await confirmedHandoff(dependencies, execution)
  const artifactPath = authoritativeArtifactPath(handoff.run, "sourceIndex")
  return {
    status: "ok",
    authoringSession: execution.authoringSession,
    source_index: handoff.index,
    summary: handoff.summary,
    artifact_path: artifactPath,
    $workflow: workflowArtifacts("ruleSourceIndex", artifactPath)
  }
}

async function captureEvidenceSelectionWith(
  dependencies: RuleAuthoringWorkflowActionDependencies,
  input: WorkflowActionExecutionInput
): Promise<unknown> {
  const execution = await resolveAuthoringExecution(dependencies, input)
  const handoff = await confirmedHandoff(dependencies, execution)
  const selection = parseEvidenceSelection(textArgument(input.args), handoff.index)
  const serialized = serializeJson(selection)

  if (handoff.run.artifacts.evidenceSelection !== undefined) {
    const stored = parseEvidenceSelection(
      await readResolvedArtifact(handoff.run, "evidenceSelection", DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes),
      handoff.index
    )
    if (stableJson(stored) !== stableJson(selection)) {
      throw new Error("Rule evidence selection does not match the already captured selection")
    }
    return evidenceSelectionResult("resumed", execution, handoff.run, stored)
  }
  if (
    handoff.run.currentPhase !== "evidence_selection" ||
    handoff.run.phases.evidence_selection.status !== "in_progress"
  ) {
    throw new Error("Rule authoring run is not ready to capture evidence selection")
  }

  const next = await dependencies.commitRuleAuthoringArtifactGeneration({
    workspaceRoot: execution.workspaceRoot,
    runId: execution.authoringRunId,
    expectedUpdatedAt: handoff.run.updatedAt,
    files: { evidenceSelection: serialized },
    buildNextRun: (current, artifacts) => ({
      ...current,
      artifacts,
      updatedAt: timestampAfter(current.updatedAt)
    })
  })
  return evidenceSelectionResult("captured", execution, next, selection)
}

async function loadSelectedEvidenceWith(
  dependencies: RuleAuthoringWorkflowActionDependencies,
  input: WorkflowActionExecutionInput
): Promise<unknown> {
  const execution = await resolveAuthoringExecution(dependencies, input)
  const handoff = await confirmedHandoff(dependencies, execution)
  const selection = await loadStoredSelection(handoff)
  const evidence = loadSelectedEvidence(
    selection,
    handoff.chunks,
    dependencies.maxSelectedEvidenceBytes
  )
  const validationContext = await buildProposalValidationContext(execution, selection)

  if (handoff.run.artifacts.selectedEvidence !== undefined) {
    const stored = await readResolvedArtifact(
      handoff.run,
      "selectedEvidence",
      DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes
    )
    if (stored !== evidence) throw new Error("Stored selected evidence does not match authoritative chunks")
    return selectedEvidenceResult(
      "resumed",
      execution,
      handoff.run,
      stored,
      selection,
      validationContext
    )
  }
  if (
    handoff.run.currentPhase !== "evidence_selection" ||
    handoff.run.phases.evidence_selection.status !== "in_progress"
  ) {
    throw new Error("Rule authoring run is not ready to load selected evidence")
  }

  const next = await dependencies.commitRuleAuthoringArtifactGeneration({
    workspaceRoot: execution.workspaceRoot,
    runId: execution.authoringRunId,
    expectedUpdatedAt: handoff.run.updatedAt,
    files: { selectedEvidence: evidence },
    buildNextRun: (current, artifacts) => advanceToProposal(current, artifacts)
  })
  return selectedEvidenceResult(
    "loaded",
    execution,
    next,
    evidence,
    selection,
    validationContext
  )
}

async function captureProposalWith(
  dependencies: RuleAuthoringWorkflowActionDependencies,
  input: WorkflowActionExecutionInput
): Promise<unknown> {
  const execution = await resolveAuthoringExecution(dependencies, input)
  const raw = textArgument(input.args)
  const handoff = await confirmedHandoff(dependencies, execution)
  const evidence = await loadProposalEvidence(dependencies, handoff)
  const validationContext = await buildProposalValidationContext(execution, evidence.selection)
  const validation = parseAndValidateRuleProposal(raw, validationContext)
  if (!validation.valid) {
    return {
      status: "error",
      authoringSession: execution.authoringSession,
      issues: validation.issues
    }
  }

  const proposalArtifacts = [
    handoff.run.artifacts.ruleProposalRaw,
    handoff.run.artifacts.ruleProposal,
    handoff.run.artifacts.proposalValidation
  ]
  if (proposalArtifacts.some((value) => value !== undefined)) {
    if (proposalArtifacts.some((value) => value === undefined)) {
      throw new Error("Stored rule proposal artifact set is incomplete")
    }
    const storedRaw = await readResolvedArtifact(
      handoff.run,
      "ruleProposalRaw",
      DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes
    )
    if (storedRaw !== raw) throw new Error("Rule proposal does not match the already captured proposal")
    const state = await dependencies.loadRuleProposalTriageState({
      workspaceRoot: execution.workspaceRoot,
      runId: execution.authoringRunId
    })
    if (stableJson(state.proposal) !== stableJson(validation.proposal)) {
      throw new Error("Stored validated rule proposal does not match the captured proposal")
    }
    return proposalResult("resumed", execution, state.run)
  }
  if (
    handoff.run.currentPhase !== "proposal" ||
    handoff.run.phases.proposal.status !== "in_progress" ||
    handoff.run.artifacts.selectedEvidence === undefined
  ) {
    throw new Error("Rule authoring run is not ready to capture a proposal")
  }

  const validatedAt = timestampAfter(handoff.run.updatedAt)
  const validationArtifact = dependencies.createRuleProposalValidationArtifact(
    validation.proposal,
    validationContext,
    validatedAt,
    { run: handoff.run, evidence }
  )
  const next = await dependencies.commitRuleAuthoringArtifactGeneration({
    workspaceRoot: execution.workspaceRoot,
    runId: execution.authoringRunId,
    expectedUpdatedAt: handoff.run.updatedAt,
    files: {
      ruleProposalRaw: raw,
      ruleProposal: serializeJson(validation.proposal),
      proposalValidation: serializeJson(validationArtifact)
    },
    buildNextRun: (current, artifacts) => advanceToHumanReview(current, artifacts, validatedAt)
  })
  return proposalResult("captured", execution, next)
}

async function verifyApplyWith(
  dependencies: RuleAuthoringWorkflowActionDependencies,
  input: WorkflowActionExecutionInput
): Promise<unknown> {
  const execution = await resolveAuthoringExecution(dependencies, input)
  const verified = await dependencies.verifyRuleAuthoringApply({
    workspaceRoot: execution.workspaceRoot,
    runId: execution.authoringRunId
  })
  assertVerificationIdentity(verified, execution.authoringRunId)
  const run = await dependencies.readRuleAuthoringRun(
    getRuleAuthoringPaths(execution.workspaceRoot, execution.authoringRunId)
  )
  assertExecutionRunIdentity(run, execution.workspaceRoot, execution.authoringRunId, execution.workflowRunId)
  const artifactPath = authoritativeArtifactPath(run, "applyManifest")
  return {
    ...verified,
    authoringSession: execution.authoringSession,
    artifact_path: artifactPath,
    $workflow: workflowArtifacts("ruleApplyManifest", artifactPath)
  }
}

async function resolveAuthoringExecution(
  dependencies: RuleAuthoringWorkflowActionDependencies,
  input: WorkflowActionExecutionInput
): Promise<ResolvedAuthoringExecution> {
  if (!input || typeof input !== "object") throw new Error("Rule authoring workflow context is required")
  const workspaceRoot = requiredAbsolutePath(input.workflowRoot, "workflow root")
  const workflowRunId = requiredId(input.runId, "workflow run ID")
  const authoringSession = parseAuthoringSession(input.state?.authoringSession)
  rejectMismatchedCallerRunIds(input, authoringSession.run_id)
  const run = await dependencies.readRuleAuthoringRun(
    getRuleAuthoringPaths(workspaceRoot, authoringSession.run_id)
  )
  assertExecutionRunIdentity(run, workspaceRoot, authoringSession.run_id, workflowRunId)
  return {
    workspaceRoot,
    workflowRunId,
    authoringRunId: authoringSession.run_id,
    authoringSession,
    run
  }
}

async function confirmedHandoff(
  dependencies: RuleAuthoringWorkflowActionDependencies,
  execution: ResolvedAuthoringExecution
): Promise<ConfirmedRuleAuthoringHandoff> {
  const handoff = await dependencies.loadConfirmedRuleAuthoringHandoff({
    workspaceRoot: execution.workspaceRoot,
    runId: execution.authoringRunId
  })
  assertExecutionRunIdentity(
    handoff.run,
    execution.workspaceRoot,
    execution.authoringRunId,
    execution.workflowRunId
  )
  return handoff
}

async function loadStoredSelection(
  handoff: ConfirmedRuleAuthoringHandoff
): Promise<RuleEvidenceSelectionV1> {
  return parseEvidenceSelection(
    await readResolvedArtifact(
      handoff.run,
      "evidenceSelection",
      DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes
    ),
    handoff.index
  )
}

async function loadProposalEvidence(
  dependencies: RuleAuthoringWorkflowActionDependencies,
  handoff: ConfirmedRuleAuthoringHandoff
): Promise<RuleApplyEvidence> {
  const selection = await loadStoredSelection(handoff)
  const sourceManifestRaw = await readResolvedArtifact(
    handoff.run,
    "sourceManifest",
    DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes
  )
  const chunksRaw = await readResolvedArtifact(
    handoff.run,
    "documentChunks",
    DEFAULT_RULE_AUTHORING_LIMITS.maxAggregateSourceBytes
  )
  const sourceManifest = parseJsonObject(
    sourceManifestRaw,
    "Rule source manifest"
  ) as unknown as RuleApplyEvidence["sourceManifest"]
  const chunks = parseDocumentChunks(chunksRaw)
  const evidence: RuleApplyEvidence = { sourceManifest, selection, chunks }
  const expectedSelectedEvidence = loadSelectedEvidence(
    selection,
    chunks,
    dependencies.maxSelectedEvidenceBytes
  )
  const storedSelectedEvidence = await readResolvedArtifact(
    handoff.run,
    "selectedEvidence",
    DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes
  )
  if (storedSelectedEvidence !== expectedSelectedEvidence) {
    throw new Error("Stored selected evidence is not bound to authoritative document chunks")
  }
  return evidence
}

async function buildProposalValidationContext(
  execution: ResolvedAuthoringExecution,
  selection: RuleEvidenceSelectionV1
): Promise<RuleProposalValidationContext> {
  const paths = getProjectRulesPaths(execution.workspaceRoot)
  const checklistBytes = await readWorkspaceFileBounded(
    execution.workspaceRoot,
    paths.checklistPath,
    MAX_APPROVED_CHECKLIST_BYTES,
    false
  )
  const projectContextBytes = await readWorkspaceFileBounded(
    execution.workspaceRoot,
    paths.contextPath,
    DEFAULT_RULE_AUTHORING_LIMITS.maxProjectContextBytes,
    true
  ) ?? Buffer.alloc(0)
  const promptAddendumBytes = await readWorkspaceFileBounded(
    execution.workspaceRoot,
    paths.addendumPath,
    DEFAULT_RULE_AUTHORING_LIMITS.maxPromptAddendumBytes,
    true
  ) ?? Buffer.alloc(0)
  if (!checklistBytes) throw new Error("Approved checklist is required")
  const checklist = parseChecklist(decodeUtf8(checklistBytes, "Approved checklist"))
  const projectContext = parseManagedMarkdown(
    decodeUtf8(projectContextBytes, "Approved project context"),
    "CTX"
  )
  const promptAddendum = parseManagedMarkdown(
    decodeUtf8(promptAddendumBytes, "Approved prompt addendum"),
    "PRM"
  )
  return {
    runId: execution.authoringRunId,
    base: {
      checklistSha256: sha256(checklistBytes),
      projectContextSha256: sha256(projectContextBytes),
      promptAddendumSha256: sha256(promptAddendumBytes)
    },
    existingRuleIds: checklist.rules.map(({ id }) => id),
    existingProjectContextSectionIds: projectContext.sections.map(({ id }) => id),
    existingPromptAddendumSectionIds: promptAddendum.sections.map(({ id }) => id),
    selectedEvidence: selection.selected_chunks.map(({ source_id, chunk_id }) => ({
      source_id,
      chunk_id
    }))
  }
}

function evidenceSelectionResult(
  status: "captured" | "resumed",
  execution: ResolvedAuthoringExecution,
  run: RuleAuthoringRunV1,
  selection: RuleEvidenceSelectionV1
): unknown {
  const artifactPath = authoritativeArtifactPath(run, "evidenceSelection")
  return {
    status,
    authoringSession: execution.authoringSession,
    selected_chunk_count: selection.selected_chunks.length,
    artifact_path: artifactPath,
    $workflow: workflowArtifacts("ruleEvidenceSelection", artifactPath)
  }
}

function selectedEvidenceResult(
  status: "loaded" | "resumed",
  execution: ResolvedAuthoringExecution,
  run: RuleAuthoringRunV1,
  evidence: string,
  selection: RuleEvidenceSelectionV1,
  validationContext: RuleProposalValidationContext
): unknown {
  const artifactPath = authoritativeArtifactPath(run, "selectedEvidence")
  return {
    status,
    authoringSession: execution.authoringSession,
    selected_chunk_count: selection.selected_chunks.length,
    evidence_utf8_bytes: Buffer.byteLength(evidence, "utf8"),
    evidence,
    proposal_contract: {
      schema_version: "bob-bazaar-review/rule-proposal/v1",
      run_id: validationContext.runId,
      base: {
        checklist_sha256: validationContext.base.checklistSha256,
        project_context_sha256: validationContext.base.projectContextSha256,
        prompt_addendum_sha256: validationContext.base.promptAddendumSha256
      },
      existing_rule_ids: validationContext.existingRuleIds,
      existing_project_context_section_ids: validationContext.existingProjectContextSectionIds,
      existing_prompt_addendum_section_ids: validationContext.existingPromptAddendumSectionIds,
      selected_evidence: validationContext.selectedEvidence
    },
    artifact_path: artifactPath,
    $workflow: workflowArtifacts("ruleEvidence", artifactPath)
  }
}

function proposalResult(
  status: "captured" | "resumed",
  execution: ResolvedAuthoringExecution,
  run: RuleAuthoringRunV1
): unknown {
  const artifacts = {
    rule_proposal_raw: authoritativeArtifactPath(run, "ruleProposalRaw"),
    rule_proposal: authoritativeArtifactPath(run, "ruleProposal"),
    proposal_validation: authoritativeArtifactPath(run, "proposalValidation")
  }
  return {
    status,
    authoringSession: execution.authoringSession,
    artifacts,
    $workflow: {
      artifacts: [
        providerArtifact("ruleProposalRaw", artifacts.rule_proposal_raw),
        providerArtifact("ruleProposal", artifacts.rule_proposal),
        providerArtifact("ruleProposalValidation", artifacts.proposal_validation)
      ]
    } satisfies WorkflowMetadata
  }
}

function advanceToProposal(
  current: RuleAuthoringRunV1,
  artifacts: RuleAuthoringArtifacts
): RuleAuthoringRunV1 {
  if (
    current.currentPhase !== "evidence_selection" ||
    current.phases.evidence_selection.status !== "in_progress"
  ) {
    throw new Error("Rule authoring evidence selection phase is not in progress")
  }
  const updatedAt = timestampAfter(current.updatedAt)
  const phases = structuredClone(current.phases)
  phases.evidence_selection = {
    status: "completed",
    startedAt: phases.evidence_selection.startedAt ?? current.createdAt,
    completedAt: updatedAt
  }
  phases.proposal = { status: "in_progress", startedAt: updatedAt }
  return {
    ...current,
    currentPhase: "proposal",
    phases,
    artifacts,
    updatedAt
  }
}

function advanceToHumanReview(
  current: RuleAuthoringRunV1,
  artifacts: RuleAuthoringArtifacts,
  updatedAt: string
): RuleAuthoringRunV1 {
  if (current.currentPhase !== "proposal" || current.phases.proposal.status !== "in_progress") {
    throw new Error("Rule authoring proposal phase is not in progress")
  }
  const phases = structuredClone(current.phases)
  phases.proposal = {
    status: "completed",
    startedAt: phases.proposal.startedAt ?? current.createdAt,
    completedAt: updatedAt
  }
  phases.human_review = { status: "in_progress", startedAt: updatedAt }
  return {
    ...current,
    currentPhase: "human_review",
    phases,
    artifacts,
    updatedAt
  }
}

function parseAuthoringSession(raw: string | undefined): { run_id: string } {
  if (typeof raw !== "string") throw new Error("Workflow state.authoringSession is required")
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("Workflow state.authoringSession must be strict JSON")
  }
  if (!isPlainObject(parsed) || !hasExactKeys(parsed, ["run_id"]) || typeof parsed.run_id !== "string") {
    throw new Error("Workflow state.authoringSession has an invalid shape")
  }
  return { run_id: requiredId(parsed.run_id, "authoring run ID") }
}

function rejectMismatchedCallerRunIds(
  input: WorkflowActionExecutionInput,
  authoritativeRunId: string
): void {
  const candidates = [input.inputs, isPlainObject(input.args) ? input.args : undefined]
  for (const candidate of candidates) {
    if (!candidate) continue
    for (const key of CALLER_RUN_ID_KEYS) {
      const value = candidate[key]
      if (value !== undefined && value !== authoritativeRunId) {
        throw new Error(`Caller-supplied ${key} does not match state.authoringSession`)
      }
    }
  }
}

function assertExecutionRunIdentity(
  run: RuleAuthoringRunV1,
  workspaceRoot: string,
  authoringRunId: string,
  workflowRunId: string
): void {
  if (
    path.resolve(run.workspaceRoot) !== path.resolve(workspaceRoot) ||
    run.runId !== authoringRunId
  ) {
    throw new Error("Rule authoring run identity does not match its workflow context")
  }
  if (run.workflowRunId !== workflowRunId) {
    throw new Error("Rule authoring run is not bound to this workflow run")
  }
}

function assertVerificationIdentity(
  result: RuleAuthoringApplyVerificationResult,
  runId: string
): void {
  if (result.status !== "verified" || result.runId !== runId) {
    throw new Error("Rule authoring apply verification returned a mismatched run")
  }
}

function authoritativeArtifactPath(run: RuleAuthoringRunV1, key: RuleAuthoringArtifactKey): string {
  const absolute = resolveRuleAuthoringArtifactPath(run, key)
  const relative = path.relative(path.resolve(run.workspaceRoot), absolute)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Rule authoring ${key} artifact is outside the workspace`)
  }
  const normalized = relative.split(path.sep).join("/")
  if (run.artifacts[key] !== normalized) {
    throw new Error(`Rule authoring ${key} artifact pointer changed during resolution`)
  }
  return normalized
}

async function readResolvedArtifact(
  run: RuleAuthoringRunV1,
  key: RuleAuthoringArtifactKey,
  maxBytes: number
): Promise<string> {
  const filePath = resolveRuleAuthoringArtifactPath(run, key)
  const bytes = await readWorkspaceFileBounded(run.workspaceRoot, filePath, maxBytes, false)
  if (!bytes) throw new Error(`Rule authoring ${key} artifact is missing`)
  return decodeUtf8(bytes, `Rule authoring ${key} artifact`)
}

async function readWorkspaceFileBounded(
  workspaceRootInput: string,
  filePathInput: string,
  maxBytes: number,
  allowMissing: boolean
): Promise<Buffer | undefined> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error("Bounded read limit is invalid")
  const workspaceRoot = path.resolve(workspaceRootInput)
  const filePath = path.resolve(filePathInput)
  assertContained(workspaceRoot, filePath)
  const directory = path.dirname(filePath)
  let handle: fs.FileHandle | undefined
  try {
    const directoryBefore = await safeDirectoryIdentity(workspaceRoot, directory)
    const rootReal = await fs.realpath(workspaceRoot)
    const targetReal = await fs.realpath(filePath)
    assertContained(rootReal, targetReal)
    if (path.resolve(targetReal) !== filePath) {
      throw new Error("Rule authoring file path contains a symbolic link")
    }
    const beforePath = await fs.lstat(filePath, { bigint: true })
    if (beforePath.isSymbolicLink() || !beforePath.isFile() || beforePath.size > BigInt(maxBytes)) {
      throw new Error("Rule authoring file is not a bounded regular file")
    }
    handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    const before = await handle.stat({ bigint: true })
    if (!before.isFile() || !sameFileIdentity(beforePath, before)) {
      throw new Error("Rule authoring file changed before it was read")
    }
    const bytes = await handle.readFile()
    const after = await handle.stat({ bigint: true })
    const afterPath = await fs.lstat(filePath, { bigint: true })
    const directoryAfter = await safeDirectoryIdentity(workspaceRoot, directory)
    if (
      bytes.byteLength > maxBytes ||
      !afterPath.isFile() ||
      !sameFileIdentity(before, after) ||
      !sameFileIdentity(after, afterPath) ||
      !sameDirectoryIdentity(directoryBefore, directoryAfter)
    ) {
      throw new Error("Rule authoring file changed while it was read")
    }
    return bytes
  } catch (error) {
    if (allowMissing && isNodeError(error) && error.code === "ENOENT") return undefined
    throw error
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

async function safeDirectoryIdentity(workspaceRoot: string, directory: string): Promise<BigIntStats> {
  assertContained(workspaceRoot, directory)
  let current = workspaceRoot
  const root = await fs.lstat(current, { bigint: true })
  if (root.isSymbolicLink() || !root.isDirectory()) throw new Error("Rule authoring workspace root is unsafe")
  for (const segment of path.relative(workspaceRoot, directory).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    const stats = await fs.lstat(current, { bigint: true })
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error("Rule authoring directory is unsafe")
  }
  const [physicalRoot, physicalDirectory] = await Promise.all([
    fs.realpath(workspaceRoot),
    fs.realpath(directory)
  ])
  assertContained(physicalRoot, physicalDirectory)
  return fs.lstat(directory, { bigint: true })
}

function parseChecklist(raw: string): { rules: Array<{ id: string }> } {
  const value = parseJsonObject(raw, "Approved checklist")
  if (
    typeof value.version !== "string" ||
    typeof value.project !== "string" ||
    !Array.isArray(value.rules)
  ) {
    throw new Error("Approved checklist is malformed")
  }
  const rules = value.rules.map((rule) => {
    if (!isPlainObject(rule) || typeof rule.id !== "string" || !rule.id.trim()) {
      throw new Error("Approved checklist rule identity is malformed")
    }
    return { id: rule.id }
  })
  return { rules }
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${label} must be valid JSON`)
  }
  if (!isPlainObject(parsed)) throw new Error(`${label} must be a JSON object`)
  return parsed
}

function textArgument(value: unknown): string {
  if (!isPlainObject(value) || !hasExactKeys(value, ["text"]) || typeof value.text !== "string") {
    throw new Error("Rule authoring action args must be exactly { text: string }")
  }
  return value.text
}

function workflowArtifacts(id: string, artifactPath: string): WorkflowMetadata {
  return { artifacts: [providerArtifact(id, artifactPath)] }
}

function providerArtifact(id: string, artifactPath: string): ProviderArtifactMetadata {
  return { id, ownership: "provider", path: artifactPath }
}

function boundedSelectedEvidenceLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Selected evidence byte limit must be a positive safe integer")
  }
  return Math.min(value, DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes)
}

function requiredAbsolutePath(value: unknown, label: string): string {
  if (typeof value !== "string" || !path.isAbsolute(value) || containsControl(value)) {
    throw new Error(`Rule authoring ${label} is invalid`)
  }
  return path.resolve(value)
}

function requiredId(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Rule authoring ${label} is required`)
  return validateRuleAuthoringId(value, label)
}

function decodeUtf8(bytes: Uint8Array, label: string): string {
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`${label} must be valid UTF-8`)
  }
  if (text.charCodeAt(0) === 0xfeff) throw new Error(`${label} must not contain a BOM`)
  return text
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function timestampAfter(value: string): string {
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) throw new Error("Rule authoring run timestamp is invalid")
  return new Date(milliseconds + 1).toISOString()
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

function sameFileIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
}

function sameDirectoryIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.isDirectory() &&
    right.isDirectory() &&
    !left.isSymbolicLink() &&
    !right.isSymbolicLink() &&
    left.dev === right.dev &&
    left.ino === right.ino
}

function assertContained(root: string, target: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  if (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) return
  throw new Error("Rule authoring path escapes the workspace")
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index])
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function containsControl(value: string): boolean {
  return /[\u0000-\u001f\u007f-\u009f]/.test(value)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
