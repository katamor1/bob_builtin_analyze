import { createHash, randomBytes } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type * as vscode from "vscode"
import { getProjectRulesPaths } from "../projectRules/io"
import { buildDocumentChunkId } from "../ruleAuthoring/documentChunk"
import { parseManagedMarkdown } from "../ruleAuthoring/managedMarkdownSections"
import { sanitizeRemoteSafeText } from "../ruleAuthoring/remoteSafeText"
import {
  buildRuleApplyPlan,
  RULE_PROPOSAL_DECISIONS_SCHEMA_VERSION,
  type RuleApplyBundle,
  type RuleApplyCandidateDecision,
  type RuleApplyEditedMarkdown,
  type RuleApplyEvidence,
  type RuleApplyPlan,
  type RuleProposalDecisionsV1
} from "../ruleAuthoring/ruleApplyPlan"
import {
  APPLY_MANIFEST_SCHEMA_VERSION,
  RULE_APPLY_TRANSACTION_SCHEMA_VERSION,
  executeRuleApplyTransaction,
  findIncompleteRuleApplyTransactions,
  recoverRuleApplyTransaction,
  type ApplyManifestV1,
  type IncompleteRuleApplyTransactionV1,
  type RuleApplyRecoveryRequest
} from "../ruleAuthoring/ruleApplyTransaction"
import { resolveRuleAuthoringArtifactPath } from "../ruleAuthoring/ruleAuthoringArtifactStore"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "../ruleAuthoring/ruleAuthoringLimits"
import { getRuleAuthoringPaths, validateRuleAuthoringId } from "../ruleAuthoring/ruleAuthoringPaths"
import {
  commitRuleAuthoringArtifactGeneration,
  readRuleAuthoringRun,
  type RuleAuthoringRunV1
} from "../ruleAuthoring/ruleAuthoringRunStore"
import type { DocumentChunkV1, RuleSourceManifestV1 } from "../ruleAuthoring/ruleAuthoringTypes"
import {
  type ProposedMarkdownOperationV1,
  type RuleProposalOperationV1,
  type RuleProposalRuleV1,
  type RuleProposalSourceRefV1,
  type RuleProposalV1,
  validateRuleProposalSchema
} from "../ruleAuthoring/ruleProposalSchema"
import {
  parseAndValidateRuleProposal,
  type RuleProposalValidationContext
} from "../ruleAuthoring/ruleProposalValidation"
import {
  renderRuleProposalTriageGuiHtml,
  type RuleProposalTriageConflictModel,
  type RuleProposalTriageGuiModel,
  type RuleProposalTriageGroupModel,
  type RuleProposalTriageOperationModel,
  type RuleProposalTriagePreviewModel,
  type RuleProposalTriageTransactionModel
} from "./ruleProposalTriageGuiHtml"

const VSCODE_RUNTIME = optionalVscode()

export const RULE_PROPOSAL_VALIDATION_ARTIFACT_SCHEMA_VERSION =
  "bob-bazaar-review/proposal-validation/v1" as const
export const RULE_APPLY_PREVIEW_SCHEMA_VERSION = "bob-bazaar-review/apply-preview/v1" as const
export const RULE_PROPOSAL_TRIAGE_MESSAGE_TYPES = Object.freeze([
  "setDecision",
  "editRule",
  "resolveConflict",
  "openEvidence",
  "previewApply",
  "applyApproved",
  "recoverTransaction",
  "close"
] as const)

export type RuleProposalTriageMessage =
  | { type: "setDecision"; candidateId: string; decision: "accept" | "reject"; rejectReason?: string }
  | { type: "editRule"; candidateId: string; rule: RuleProposalRuleV1 }
  | { type: "editRule"; candidateId: string; markdown: RuleApplyEditedMarkdown }
  | { type: "resolveConflict"; candidateId: string; conflictId: string; alternativeId: string }
  | { type: "openEvidence"; candidateId: string; sourceRefIndex: number }
  | { type: "previewApply" }
  | { type: "applyApproved" }
  | { type: "recoverTransaction"; transactionId: string; action: "rollback" | "resume" }
  | { type: "close" }

export interface RuleProposalTriageInput {
  workspaceRoot: string
  runId: string
}

export type RuleAuthoringDecisionResult =
  | { status: "applied"; runId: string; transactionId: string }
  | { status: "closed"; runId: string }

export interface RuleAuthoringApplyVerificationResult {
  status: "verified"
  runId: string
  transactionId: string
  targetCount: number
}

export interface RuleAuthoringCommittedRecoveryResult {
  status: "recovered"
  runId: string
  transactionId: string
}

export interface RuleProposalTriageState {
  run: RuleAuthoringRunV1
  proposal: RuleProposalV1
  decisions: RuleProposalDecisionsV1
  bundle: RuleApplyBundle
  evidence: RuleApplyEvidence
}

export interface StoredProposalValidationV1 {
  schema_version: typeof RULE_PROPOSAL_VALIDATION_ARTIFACT_SCHEMA_VERSION
  run_id: string
  valid: true
  issues: []
  validated_at: string
  proposal_sha256: string
  validation_context: RuleProposalValidationContext
}

interface StoredApplyPreviewV1 {
  schema_version: typeof RULE_APPLY_PREVIEW_SCHEMA_VERSION
  run_id: string
  generated_at: string
  targets: Array<{
    asset: string
    expected_pre_image: unknown
    post_image_sha256: string
  }>
  decision_summary: {
    accepted: number
    edited: number
    rejected: number
  }
}

export interface RuleProposalTriageGuiDependencies {
  createNonce: () => string
  now: () => string
  newTransactionId: () => string
  renderRuleProposalTriageGuiHtml: typeof renderRuleProposalTriageGuiHtml
  findIncompleteRuleApplyTransactions: (
    workspaceRoot: string
  ) => Promise<readonly IncompleteRuleApplyTransactionV1[]>
  recoverCommittedRuleAuthoringApply: (
    input: RuleProposalTriageInput
  ) => Promise<RuleAuthoringCommittedRecoveryResult | undefined>
  loadRuleProposalTriageState: (input: RuleProposalTriageInput) => Promise<RuleProposalTriageState>
  persistRuleProposalDecisions: (
    state: RuleProposalTriageState,
    decisions: RuleProposalDecisionsV1
  ) => Promise<RuleProposalTriageState>
  buildRuleApplyPlan: typeof buildRuleApplyPlan
  persistRuleApplyPreview: (
    state: RuleProposalTriageState,
    decisions: RuleProposalDecisionsV1,
    plan: RuleApplyPlan
  ) => Promise<RuleProposalTriageState>
  executeRuleApplyTransaction: typeof executeRuleApplyTransaction
  persistRuleApplyCompletion: (
    state: RuleProposalTriageState,
    decisions: RuleProposalDecisionsV1,
    plan: RuleApplyPlan,
    manifest: ApplyManifestV1
  ) => Promise<RuleAuthoringRunV1>
  recoverRuleApplyTransaction: (
    workspaceRoot: string,
    transactionId: string,
    request: RuleApplyRecoveryRequest
  ) => ReturnType<typeof recoverRuleApplyTransaction>
}

export interface RuleProposalTriageGuiHost {
  openRuleProposalTriageGui(
    context: vscode.ExtensionContext,
    input: RuleProposalTriageInput
  ): Promise<RuleAuthoringDecisionResult>
}

const CANDIDATE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SOURCE_ID = /^src-[a-f0-9]{12,64}$/
const CHUNK_ID = /^chunk-[a-f0-9]{64}$/
const SHA256 = /^[a-f0-9]{64}$/
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/
const MAX_REJECT_REASON_BYTES = 8_192
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024
const MAX_TRANSACTION_ENTRIES = 10_000
const APPLY_CONFIRMATION = "Apply approved project rules"
const TARGET_SPECS = Object.freeze([
  ["checklist", ".bob/review/checklist.json"],
  ["project_context", ".bob/review/project-context.md"],
  ["prompt_addendum", ".bob/review/review-prompt-addendum.md"],
  ["rule_sources", ".bob/review/rule-sources.json"],
  ["rule_provenance", ".bob/review/rule-provenance.json"]
] as const)

export function parseRuleProposalTriageMessage(value: unknown): RuleProposalTriageMessage | undefined {
  if (!isPlainObject(value) || typeof value.type !== "string") return undefined
  if (
    value.type === "setDecision" &&
    hasOnlyKeys(value, value.rejectReason === undefined
      ? ["type", "candidateId", "decision"]
      : ["type", "candidateId", "decision", "rejectReason"]) &&
    isCandidateId(value.candidateId) &&
    (value.decision === "accept" || value.decision === "reject") &&
    (value.rejectReason === undefined || isRejectReason(value.rejectReason)) &&
    !(value.decision === "accept" && value.rejectReason !== undefined)
  ) {
    return value.rejectReason === undefined
      ? { type: "setDecision", candidateId: value.candidateId, decision: value.decision }
      : {
          type: "setDecision",
          candidateId: value.candidateId,
          decision: value.decision,
          rejectReason: value.rejectReason
        }
  }
  if (
    value.type === "editRule" &&
    hasOnlyKeys(value, ["type", "candidateId", "rule"]) &&
    isCandidateId(value.candidateId) &&
    isRuleEdit(value.rule)
  ) {
    return { type: "editRule", candidateId: value.candidateId, rule: structuredClone(value.rule) }
  }
  if (
    value.type === "editRule" &&
    hasOnlyKeys(value, ["type", "candidateId", "markdown"]) &&
    isCandidateId(value.candidateId) &&
    isEditedMarkdown(value.markdown)
  ) {
    return {
      type: "editRule",
      candidateId: value.candidateId,
      markdown: structuredClone(value.markdown)
    }
  }
  if (
    value.type === "resolveConflict" &&
    hasOnlyKeys(value, ["type", "candidateId", "conflictId", "alternativeId"]) &&
    isCandidateId(value.candidateId) &&
    isCandidateId(value.conflictId) &&
    isCandidateId(value.alternativeId)
  ) {
    return {
      type: "resolveConflict",
      candidateId: value.candidateId,
      conflictId: value.conflictId,
      alternativeId: value.alternativeId
    }
  }
  if (
    value.type === "openEvidence" &&
    hasOnlyKeys(value, ["type", "candidateId", "sourceRefIndex"]) &&
    isCandidateId(value.candidateId) &&
    Number.isSafeInteger(value.sourceRefIndex) &&
    Number(value.sourceRefIndex) >= 0 &&
    Number(value.sourceRefIndex) < 64
  ) {
    return {
      type: "openEvidence",
      candidateId: value.candidateId,
      sourceRefIndex: Number(value.sourceRefIndex)
    }
  }
  if (value.type === "previewApply" && hasOnlyKeys(value, ["type"])) return { type: "previewApply" }
  if (value.type === "applyApproved" && hasOnlyKeys(value, ["type"])) return { type: "applyApproved" }
  if (
    value.type === "recoverTransaction" &&
    hasOnlyKeys(value, ["type", "transactionId", "action"]) &&
    isPortableId(value.transactionId) &&
    (value.action === "rollback" || value.action === "resume")
  ) {
    return { type: "recoverTransaction", transactionId: value.transactionId, action: value.action }
  }
  if (value.type === "close" && hasOnlyKeys(value, ["type"])) return { type: "close" }
  return undefined
}

export function createRuleProposalTriageGuiHost(
  overrides: Partial<RuleProposalTriageGuiDependencies> = {}
): RuleProposalTriageGuiHost {
  const dependencies: RuleProposalTriageGuiDependencies = {
    createNonce: () => randomBytes(16).toString("base64"),
    now: () => new Date().toISOString(),
    newTransactionId: () => `txn-${randomBytes(16).toString("hex")}`,
    renderRuleProposalTriageGuiHtml,
    findIncompleteRuleApplyTransactions,
    recoverCommittedRuleAuthoringApply,
    loadRuleProposalTriageState,
    persistRuleProposalDecisions,
    buildRuleApplyPlan,
    persistRuleApplyPreview,
    executeRuleApplyTransaction,
    persistRuleApplyCompletion,
    recoverRuleApplyTransaction,
    ...overrides
  }
  return {
    openRuleProposalTriageGui: (context, input) => openWithDependencies(dependencies, context, input)
  }
}

export function openRuleProposalTriageGui(
  context: vscode.ExtensionContext,
  input: RuleProposalTriageInput
): Promise<RuleAuthoringDecisionResult> {
  return createRuleProposalTriageGuiHost().openRuleProposalTriageGui(context, input)
}

export function createRuleProposalValidationArtifact(
  proposal: RuleProposalV1,
  context: RuleProposalValidationContext,
  validatedAt: string
): StoredProposalValidationV1 {
  const timestamp = canonicalNow(validatedAt)
  const result = parseAndValidateRuleProposal(JSON.stringify(proposal), context)
  if (!result.valid) throw new Error("Rule proposal cannot be recorded as validated")
  return {
    schema_version: RULE_PROPOSAL_VALIDATION_ARTIFACT_SCHEMA_VERSION,
    run_id: proposal.run_id,
    valid: true,
    issues: [],
    validated_at: timestamp,
    proposal_sha256: sha256(Buffer.from(JSON.stringify(result.proposal), "utf8")),
    validation_context: structuredClone(context)
  }
}

async function openWithDependencies(
  dependencies: RuleProposalTriageGuiDependencies,
  context: vscode.ExtensionContext,
  inputValue: RuleProposalTriageInput
): Promise<RuleAuthoringDecisionResult> {
  const vscodeApi = requireVscode()
  const input = normalizeTriageInput(inputValue)
  const panel = vscodeApi.window.createWebviewPanel(
    "bobBazaar.ruleProposalTriage",
    "Project Rule Proposal Triage",
    vscodeApi.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  )
  context.subscriptions.push(panel)
  const nonce = dependencies.createNonce()
  let state: RuleProposalTriageState | undefined
  let decisions = emptyDecisionOverlay(input.runId)
  let recovery: readonly IncompleteRuleApplyTransactionV1[] = []
  let preview: RuleProposalTriagePreviewModel | undefined
  let transaction: RuleProposalTriageTransactionModel | undefined
  let staleWarning = ""
  let status = "Loading the validated proposal."
  let busy = false
  let settled = false

  return new Promise<RuleAuthoringDecisionResult>((resolve, reject) => {
    const finish = (result: RuleAuthoringDecisionResult): void => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      reject(error instanceof Error ? error : new Error("Project rule triage failed"))
    }
    const render = (): void => {
      const model = state
        ? buildRuleProposalTriageModel(
            panel.webview.cspSource,
            state,
            decisions,
            recovery,
            preview,
            transaction,
            staleWarning,
            status
          )
        : recoveryModel(panel.webview.cspSource, input.runId, recovery, status)
      panel.webview.html = dependencies.renderRuleProposalTriageGuiHtml(model, nonce)
    }
    const refreshAfterRecovery = async (): Promise<void> => {
      const committed = await dependencies.recoverCommittedRuleAuthoringApply(input)
      if (committed) {
        recovery = []
        state = undefined
        transaction = {
          transactionId: committed.transactionId,
          status: "committed",
          targetCount: TARGET_SPECS.length
        }
        status = "Recovered a committed apply after interrupted completion persistence."
        render()
        finish({
          status: "applied",
          runId: committed.runId,
          transactionId: committed.transactionId
        })
        return
      }
      recovery = await dependencies.findIncompleteRuleApplyTransactions(input.workspaceRoot)
      if (recovery.length === 0) {
        state = await dependencies.loadRuleProposalTriageState(input)
        decisions = cloneDecisions(state.decisions)
        status = "Review every proposal candidate before previewing apply."
      } else {
        state = undefined
        status = "Transaction recovery is required before proposal triage can resume."
      }
      render()
    }

    panel.onDidDispose(() => finish({ status: "closed", runId: input.runId }))
    panel.webview.onDidReceiveMessage((rawMessage) => {
      if (busy || settled) return
      const message = parseRuleProposalTriageMessage(rawMessage)
      if (!message) return
      busy = true
      void (async () => {
        try {
          if (message.type === "close") {
            finish({ status: "closed", runId: input.runId })
            panel.dispose()
            return
          }
          if (message.type === "recoverTransaction") {
            const current = recovery.find(({ transaction_id }) => transaction_id === message.transactionId)
            if (!current) return
            const recovered = await dependencies.recoverRuleApplyTransaction(
              input.workspaceRoot,
              current.transaction_id,
              { action: message.action, now: canonicalNow(dependencies.now()) }
            )
            transaction = {
              transactionId: current.transaction_id,
              status: recovered.status === "committed" ? "committed" : "rolled_back",
              targetCount: "targets" in recovered && Array.isArray(recovered.targets)
                ? recovered.targets.length
                : 0
            }
            status = "The incomplete transaction was rolled back."
            await refreshAfterRecovery()
            return
          }
          if (!state || recovery.length > 0) return
          if (message.type === "setDecision") {
            requireOperation(state.proposal, message.candidateId)
            const previous = decisions.decisions[message.candidateId]
            const conflictResolutions = previous?.conflict_resolutions === undefined
              ? undefined
              : structuredClone(previous.conflict_resolutions)
            const nextDecision: RuleApplyCandidateDecision = message.decision === "accept"
              ? compactDecision({
                  decision: "accept",
                  reviewed_at: canonicalNow(dependencies.now()),
                  conflict_resolutions: conflictResolutions
                })
              : compactDecision({
                  decision: "reject",
                  reviewed_at: canonicalNow(dependencies.now()),
                  reject_reason: message.rejectReason,
                  conflict_resolutions: conflictResolutions
                })
            decisions = withDecision(decisions, message.candidateId, nextDecision)
            state = await dependencies.persistRuleProposalDecisions(state, decisions)
            preview = undefined
            staleWarning = ""
            status = "Human Triage decision saved."
            render()
            return
          }
          if (message.type === "editRule") {
            const operation = requireOperation(state.proposal, message.candidateId)
            if (operation.operation === "retire") {
              throw new SafeTriageError("This candidate does not accept an edit.")
            }
            const previous = decisions.decisions[message.candidateId]
            const common = {
              decision: "edit" as const,
              reviewed_at: canonicalNow(dependencies.now()),
              conflict_resolutions: previous?.conflict_resolutions === undefined
                ? undefined
                : structuredClone(previous.conflict_resolutions)
            }
            if (isRuleOperation(operation)) {
              if (!("rule" in message)) {
                throw new SafeTriageError("This candidate requires a rule edit.")
              }
              assertEditedRuleAgainstProposal(state.proposal, operation, message.rule)
              decisions = withDecision(decisions, message.candidateId, compactDecision({
                ...common,
                edited_rule: structuredClone(message.rule)
              }))
            } else {
              if (!("markdown" in message)) {
                throw new SafeTriageError("This candidate requires a Markdown edit.")
              }
              assertEditedMarkdownAgainstProposal(state.proposal, operation, message.markdown)
              decisions = withDecision(decisions, message.candidateId, compactDecision({
                ...common,
                edited_markdown: structuredClone(message.markdown)
              }))
            }
            state = await dependencies.persistRuleProposalDecisions(state, decisions)
            preview = undefined
            staleWarning = ""
            status = "Human edit validated and saved."
            render()
            return
          }
          if (message.type === "resolveConflict") {
            const operation = requireOperation(state.proposal, message.candidateId)
            const conflict = state.proposal.conflicts.find(({ conflict_id }) =>
              conflict_id === message.conflictId
            )
            if (
              !conflict ||
              !operation.conflict_ids.includes(conflict.conflict_id) ||
              !conflict.affected_candidate_ids.includes(operation.candidate_id) ||
              !conflict.alternatives.some(({ alternative_id }) => alternative_id === message.alternativeId)
            ) {
              throw new SafeTriageError("The conflict resolution does not match the stored proposal operation.")
            }
            const current = decisions.decisions[message.candidateId]
            if (!current) throw new SafeTriageError("Choose a candidate decision before resolving its conflict.")
            const resolutions = {
              ...(current.conflict_resolutions ?? {}),
              [message.conflictId]: message.alternativeId
            }
            decisions = withDecision(decisions, message.candidateId, {
              ...structuredClone(current),
              reviewed_at: canonicalNow(dependencies.now()),
              conflict_resolutions: resolutions
            })
            state = await dependencies.persistRuleProposalDecisions(state, decisions)
            preview = undefined
            status = "Conflict resolution saved."
            render()
            return
          }
          if (message.type === "openEvidence") {
            const operation = requireOperation(state.proposal, message.candidateId)
            const sourceRef = operation.source_refs[message.sourceRefIndex]
            if (!sourceRef) throw new SafeTriageError("The evidence reference is unavailable.")
            const evidence = resolveEvidenceRecord(state.evidence, sourceRef)
            if (Buffer.byteLength(evidence.chunk.text, "utf8") > DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes) {
              throw new SafeTriageError("The evidence excerpt exceeds the approved display limit.")
            }
            const document = await vscodeApi.workspace.openTextDocument({
              language: "markdown",
              content: [
                `# Evidence excerpt`,
                "",
                `Source: ${evidence.source.logical_name}`,
                `Locator: ${evidence.locator}`,
                "",
                evidence.chunk.text
              ].join("\n")
            })
            await vscodeApi.window.showTextDocument(document, { preview: true })
            return
          }
          if (message.type === "previewApply") {
            const prepared = await prepareFreshApply(dependencies, input, state, decisions)
            state = await dependencies.persistRuleApplyPreview(
              prepared.state,
              prepared.decisions,
              prepared.plan
            )
            decisions = prepared.decisions
            preview = previewModel(prepared.plan, decisions, canonicalNow(dependencies.now()))
            staleWarning = ""
            status = "Apply preview regenerated from the current approved bundle."
            render()
            return
          }
          const confirmation = await vscodeApi.window.showWarningMessage(
            "Apply the accepted and human-edited project rule operations to all approved assets?",
            { modal: true },
            APPLY_CONFIRMATION
          )
          if (confirmation !== APPLY_CONFIRMATION) return
          const prepared = await prepareFreshApply(dependencies, input, state, decisions)
          state = await dependencies.persistRuleApplyPreview(
            prepared.state,
            prepared.decisions,
            prepared.plan
          )
          decisions = prepared.decisions
          const transactionId = validateRuleAuthoringId(
            dependencies.newTransactionId(),
            "transactionId"
          )
          const now = canonicalNow(dependencies.now())
          const manifest = await dependencies.executeRuleApplyTransaction(prepared.plan, {
            workspaceRoot: input.workspaceRoot,
            transactionId,
            now
          })
          await dependencies.persistRuleApplyCompletion(
            state,
            decisions,
            prepared.plan,
            manifest
          )
          preview = previewModel(prepared.plan, decisions, now)
          transaction = {
            transactionId: manifest.transaction_id,
            status: "committed",
            targetCount: manifest.targets.length
          }
          status = "The project rule apply transaction committed successfully."
          render()
          finish({ status: "applied", runId: input.runId, transactionId: manifest.transaction_id })
        } catch (error) {
          const mapped = mapTriageError(error)
          staleWarning = mapped.stale ? mapped.message : staleWarning
          status = mapped.message
          render()
          if (!mapped.recoverable) await vscodeApi.window.showErrorMessage(mapped.message)
        } finally {
          busy = false
        }
      })()
    })

    void refreshAfterRecovery().catch(fail)
  })
}

async function prepareFreshApply(
  dependencies: RuleProposalTriageGuiDependencies,
  input: RuleProposalTriageInput,
  expectedState: RuleProposalTriageState,
  expectedDecisions: RuleProposalDecisionsV1
): Promise<{
  state: RuleProposalTriageState
  decisions: RuleProposalDecisionsV1
  plan: RuleApplyPlan
}> {
  const incomplete = await dependencies.findIncompleteRuleApplyTransactions(input.workspaceRoot)
  if (incomplete.length > 0) {
    throw new SafeTriageError("Transaction recovery is required before preview or apply.")
  }
  const state = await dependencies.loadRuleProposalTriageState(input)
  const decisions = cloneDecisions(expectedDecisions)
  if (
    state.proposal.run_id !== decisions.run_id ||
    state.run.artifacts?.ruleProposal !== expectedState.run.artifacts?.ruleProposal ||
    state.run.artifacts?.proposalValidation !== expectedState.run.artifacts?.proposalValidation ||
    JSON.stringify(state.proposal) !== JSON.stringify(expectedState.proposal) ||
    JSON.stringify(state.decisions) !== JSON.stringify(decisions)
  ) {
    throw new SafeTriageError("Proposal decisions no longer match the stored validated proposal.")
  }
  const plan = dependencies.buildRuleApplyPlan(
    state.bundle,
    structuredClone(state.proposal),
    decisions,
    state.evidence
  )
  return { state, decisions, plan }
}

export async function loadRuleProposalTriageState(
  inputValue: RuleProposalTriageInput
): Promise<RuleProposalTriageState> {
  const input = normalizeTriageInput(inputValue)
  const paths = getRuleAuthoringPaths(input.workspaceRoot, input.runId)
  const run = await readRuleAuthoringRun(paths)
  if (run.currentPhase !== "human_review" && run.currentPhase !== "apply" && run.currentPhase !== "completed") {
    throw new Error("Rule authoring run is not ready for Human Triage")
  }
  const proposalRaw = await readResolvedArtifact(
    run,
    "ruleProposal",
    DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes
  )
  const validationRaw = await readResolvedArtifact(
    run,
    "proposalValidation",
    DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes
  )
  const sourceManifestRaw = await readResolvedArtifact(
    run,
    "sourceManifest",
    DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes
  )
  const chunksRaw = await readResolvedArtifact(
    run,
    "documentChunks",
    DEFAULT_RULE_AUTHORING_LIMITS.maxAggregateSourceBytes
  )
  const selectionRaw = await readResolvedArtifact(
    run,
    "evidenceSelection",
    DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes
  )

  const proposalParsed = parseJsonObject(proposalRaw, "Stored rule proposal")
  const schema = validateRuleProposalSchema(proposalParsed)
  if (!schema.valid) throw new Error("Stored rule proposal is not schema-valid")
  const sourceManifest = parseJsonObject(sourceManifestRaw, "Rule source manifest") as unknown as RuleSourceManifestV1
  const chunks = parseDocumentChunks(chunksRaw)
  const selection = parseJsonObject(selectionRaw, "Evidence selection") as unknown as RuleApplyEvidence["selection"]
  const validationContext = assertStoredProposalValidation(
    parseJsonObject(validationRaw, "Proposal validation"),
    schema.proposal,
    selection
  )
  const semantic = parseAndValidateRuleProposal(JSON.stringify(schema.proposal), validationContext)
  if (!semantic.valid) {
    const codes = semantic.issues.slice(0, 8).map(({ code, path: issuePath }) =>
      `${code}@${issuePath}`).join(",")
    throw new Error(`Stored rule proposal is not semantically valid (${codes})`)
  }
  const evidence: RuleApplyEvidence = { sourceManifest, selection, chunks }

  const decisionRaw = run.artifacts.proposalDecisions === undefined
    ? undefined
    : await readResolvedArtifact(
        run,
        "proposalDecisions",
        DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes
      )
  const decisions = decisionRaw === undefined
    ? emptyDecisionOverlay(input.runId)
    : parseStoredDecisions(decisionRaw, semantic.proposal)
  const bundle = await loadCurrentRuleApplyBundle(input.workspaceRoot)
  return { run, proposal: semantic.proposal, decisions, bundle, evidence }
}

export async function persistRuleProposalDecisions(
  state: RuleProposalTriageState,
  decisionsValue: RuleProposalDecisionsV1
): Promise<RuleProposalTriageState> {
  const decisions = validateDecisionOverlayForPersistence(decisionsValue, state.proposal, false)
  const current = await currentMatchingRun(state)
  const next = await commitRuleAuthoringArtifactGeneration({
    workspaceRoot: current.workspaceRoot,
    runId: current.runId,
    expectedUpdatedAt: current.updatedAt,
    files: { proposalDecisions: serializeJson(decisions) },
    removeArtifactKeys: current.artifacts.applyPreview === undefined ? [] : ["applyPreview"],
    buildNextRun: (run, artifacts) => ({
      ...run,
      artifacts,
      updatedAt: timestampAfter(run.updatedAt)
    })
  })
  return { ...state, run: next, decisions }
}

export async function persistRuleApplyPreview(
  state: RuleProposalTriageState,
  decisionsValue: RuleProposalDecisionsV1,
  plan: RuleApplyPlan
): Promise<RuleProposalTriageState> {
  const decisions = validateDecisionOverlayForPersistence(decisionsValue, state.proposal, true)
  assertPlanMatchesState(plan, state)
  const current = await currentMatchingRun(state)
  const generatedAt = timestampAfter(current.updatedAt)
  const storedPreview = storedPreviewFromPlan(plan, decisions, generatedAt)
  const next = await commitRuleAuthoringArtifactGeneration({
    workspaceRoot: current.workspaceRoot,
    runId: current.runId,
    expectedUpdatedAt: current.updatedAt,
    files: {
      proposalDecisions: serializeJson(decisions),
      applyPreview: serializeJson(storedPreview)
    },
    buildNextRun: (run, artifacts) => ({
      ...run,
      artifacts,
      updatedAt: generatedAt
    })
  })
  return { ...state, run: next, decisions }
}

export async function persistRuleApplyCompletion(
  state: RuleProposalTriageState,
  decisionsValue: RuleProposalDecisionsV1,
  plan: RuleApplyPlan,
  manifest: ApplyManifestV1
): Promise<RuleAuthoringRunV1> {
  const decisions = validateDecisionOverlayForPersistence(decisionsValue, state.proposal, true)
  assertPlanMatchesState(plan, state)
  assertManifestMatchesPlan(manifest, plan)
  const current = await currentMatchingRun(state)
  const completionAt = timestampAfter(current.updatedAt, manifest.committed_at)
  const preview = storedPreviewFromPlan(plan, decisions, manifest.committed_at)
  return commitRuleAuthoringArtifactGeneration({
    workspaceRoot: current.workspaceRoot,
    runId: current.runId,
    expectedUpdatedAt: current.updatedAt,
    files: {
      proposalDecisions: serializeJson(decisions),
      applyPreview: serializeJson(preview),
      applyManifest: serializeJson(manifest)
    },
    buildNextRun: (run, artifacts) => completedRun(run, artifacts, completionAt)
  })
}

export async function verifyRuleAuthoringApply(
  inputValue: RuleProposalTriageInput
): Promise<RuleAuthoringApplyVerificationResult> {
  const input = normalizeTriageInput(inputValue)
  let run = await readRuleAuthoringRun(getRuleAuthoringPaths(input.workspaceRoot, input.runId))
  if (run.currentPhase !== "completed") {
    await recoverCommittedRuleAuthoringApply(input)
    run = await readRuleAuthoringRun(getRuleAuthoringPaths(input.workspaceRoot, input.runId))
  }
  if (run.currentPhase !== "completed" || run.phases.completed.status !== "completed") {
    throw new Error("Rule authoring run phase is not completed")
  }
  if (run.artifacts.applyManifest === undefined) {
    throw new Error("Rule authoring apply manifest artifact is missing")
  }
  const manifestRaw = await readResolvedArtifact(
    run,
    "applyManifest",
    DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes
  )
  const manifest = validateApplyManifest(parseJsonObject(manifestRaw, "Apply manifest"), run.runId)
  await verifyCommittedManifestForRun(run, manifest)
  return {
    status: "verified",
    runId: run.runId,
    transactionId: manifest.transaction_id,
    targetCount: manifest.targets.length
  }
}

export async function recoverCommittedRuleAuthoringApply(
  inputValue: RuleProposalTriageInput
): Promise<RuleAuthoringCommittedRecoveryResult | undefined> {
  const input = normalizeTriageInput(inputValue)
  const run = await readRuleAuthoringRun(getRuleAuthoringPaths(input.workspaceRoot, input.runId))
  if (run.currentPhase === "completed" || run.artifacts.applyManifest !== undefined) return undefined
  if (run.currentPhase !== "human_review" && run.currentPhase !== "apply") return undefined
  const committed = await findCommittedTransactionManifest(run)
  if (!committed) return undefined
  if (run.artifacts.proposalDecisions === undefined || run.artifacts.applyPreview === undefined) {
    throw new Error("Committed apply cannot be attached without its persisted decisions and preview")
  }
  await verifyCommittedManifestForRun(run, committed)
  const completionAt = timestampAfter(run.updatedAt, committed.committed_at)
  await commitRuleAuthoringArtifactGeneration({
    workspaceRoot: run.workspaceRoot,
    runId: run.runId,
    expectedUpdatedAt: run.updatedAt,
    files: { applyManifest: serializeJson(committed) },
    buildNextRun: (current, artifacts) => completedRun(current, artifacts, completionAt)
  })
  return {
    status: "recovered",
    runId: run.runId,
    transactionId: committed.transaction_id
  }
}

async function verifyCommittedManifestForRun(
  run: RuleAuthoringRunV1,
  manifest: ApplyManifestV1
): Promise<void> {
  const verifiedBytes = new Map<string, Buffer>()
  for (const [index, [asset, relativePath]] of TARGET_SPECS.entries()) {
    const target = manifest.targets[index]
    if (target.asset !== asset || target.path !== relativePath) {
      throw new Error("Rule authoring apply manifest target contract is invalid")
    }
    let bytes: Buffer
    try {
      bytes = await readWorkspaceFileBounded(
        run.workspaceRoot,
        path.join(run.workspaceRoot, ...relativePath.split("/")),
        MAX_ARTIFACT_BYTES,
        false
      ) as Buffer
    } catch {
      throw new Error("Rule authoring post-image verification failed")
    }
    if (sha256(bytes) !== target.post_image_sha256) {
      throw new Error("Rule authoring post-image verification failed")
    }
    verifiedBytes.set(asset, bytes)
  }
  verifyApprovedReferences(
    requiredBytes(verifiedBytes, "checklist"),
    requiredBytes(verifiedBytes, "project_context"),
    requiredBytes(verifiedBytes, "prompt_addendum"),
    requiredBytes(verifiedBytes, "rule_sources"),
    requiredBytes(verifiedBytes, "rule_provenance")
  )
  if (run.artifacts.sourceManifest === undefined || run.artifacts.documentChunks === undefined) {
    throw new Error("Rule authoring authoritative evidence artifacts are missing")
  }
  const authoritativeSourceManifest = parseJsonObject(
    await readResolvedArtifact(
      run,
      "sourceManifest",
      DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes
    ),
    "Authoritative rule source manifest"
  ) as unknown as RuleSourceManifestV1
  const authoritativeChunks = parseDocumentChunks(await readResolvedArtifact(
    run,
    "documentChunks",
    DEFAULT_RULE_AUTHORING_LIMITS.maxAggregateSourceBytes
  ))
  verifyCurrentRunProvenanceAgainstChunks(
    run.runId,
    manifest,
    requiredBytes(verifiedBytes, "rule_sources"),
    requiredBytes(verifiedBytes, "rule_provenance"),
    authoritativeSourceManifest,
    authoritativeChunks
  )
}

async function findCommittedTransactionManifest(
  run: RuleAuthoringRunV1
): Promise<ApplyManifestV1 | undefined> {
  const paths = getRuleAuthoringPaths(run.workspaceRoot, run.runId)
  let stats
  try {
    stats = await fs.lstat(paths.transactionsDirectory)
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined
    throw error
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error("Rule authoring transaction directory is unsafe")
  }
  await assertSafeParentChain(run.workspaceRoot, paths.transactionsDirectory)
  const entries = await fs.readdir(paths.transactionsDirectory, { withFileTypes: true })
  if (entries.length > MAX_TRANSACTION_ENTRIES) {
    throw new Error("Rule authoring transaction count exceeds its limit")
  }
  const matches: ApplyManifestV1[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !isPortableId(entry.name)) continue
    const directory = path.join(paths.transactionsDirectory, entry.name)
    const journalBytes = await readWorkspaceFileBounded(
      run.workspaceRoot,
      path.join(directory, "transaction-journal.json"),
      MAX_ARTIFACT_BYTES,
      true
    )
    if (!journalBytes) continue
    const journal = parseJsonObject(
      decodeUtf8(journalBytes, "Apply transaction journal"),
      "Apply transaction journal"
    )
    if (journal.run_id !== run.runId || journal.status !== "committed") continue
    if (
      journal.schema_version !== RULE_APPLY_TRANSACTION_SCHEMA_VERSION ||
      journal.transaction_id !== entry.name ||
      !Array.isArray(journal.targets)
    ) {
      throw new Error("Committed apply transaction journal is malformed")
    }
    const manifestBytes = await readWorkspaceFileBounded(
      run.workspaceRoot,
      path.join(directory, "apply-manifest.json"),
      DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes,
      true
    )
    if (!manifestBytes) throw new Error("Committed apply transaction manifest is missing")
    const manifest = validateApplyManifest(
      parseJsonObject(decodeUtf8(manifestBytes, "Apply manifest"), "Apply manifest"),
      run.runId
    )
    if (manifest.transaction_id !== entry.name ||
      !journalTargetsMatchManifest(journal.targets, manifest)) {
      throw new Error("Committed apply transaction does not match its manifest")
    }
    matches.push(manifest)
  }
  if (matches.length > 1) {
    throw new Error("Multiple committed apply transactions require explicit recovery")
  }
  return matches[0]
}

function journalTargetsMatchManifest(
  journalTargets: readonly unknown[],
  manifest: ApplyManifestV1
): boolean {
  return journalTargets.length === manifest.targets.length && journalTargets.every((value, index) => {
    if (!isPlainObject(value)) return false
    const target = manifest.targets[index]
    return value.asset === target.asset &&
      value.path === target.path &&
      value.state === "replaced" &&
      value.post_image_sha256 === target.post_image_sha256 &&
      stableJson(value.expected_pre_image) === stableJson(target.expected_pre_image)
  })
}

function buildRuleProposalTriageModel(
  cspSource: string,
  state: RuleProposalTriageState,
  decisions: RuleProposalDecisionsV1,
  recovery: readonly IncompleteRuleApplyTransactionV1[],
  preview: RuleProposalTriagePreviewModel | undefined,
  transaction: RuleProposalTriageTransactionModel | undefined,
  staleWarning: string,
  status: string
): RuleProposalTriageGuiModel {
  const proposal = state.proposal
  const groups: RuleProposalTriageGroupModel[] = [
    {
      asset: "rule",
      label: "Checklist rules",
      operations: proposal.operations.map((operation) =>
        operationModel(state, decisions, operation, "rule"))
    },
    {
      asset: "project_context",
      label: "Project context",
      operations: proposal.project_context_operations.map((operation) =>
        operationModel(state, decisions, operation, "project_context"))
    },
    {
      asset: "prompt_addendum",
      label: "Review prompt addendum",
      operations: proposal.prompt_addendum_operations.map((operation) =>
        operationModel(state, decisions, operation, "prompt_addendum"))
    }
  ]
  const conflicts: RuleProposalTriageConflictModel[] = proposal.conflicts.map((conflict) => ({
    conflictId: safeDisplay(conflict.conflict_id, 512),
    summary: safeDisplay(conflict.summary, 8_192),
    blocking: conflict.blocking,
    affectedCandidateIds: conflict.affected_candidate_ids.map((candidateId) =>
      safeDisplay(candidateId, 512)),
    alternatives: conflict.alternatives.map((alternative) => ({
      alternativeId: safeDisplay(alternative.alternative_id, 512),
      description: safeDisplay(alternative.description, 8_192)
    }))
  }))
  const decisionsComplete = hasEveryDecision(proposal, decisions)
  return {
    cspSource,
    runId: state.run.runId,
    groups,
    conflicts,
    decisionsComplete,
    canPreview: decisionsComplete && recovery.length === 0,
    canApply: decisionsComplete && recovery.length === 0,
    staleWarning,
    status,
    recovery: recovery.map((item) => ({
      transactionId: item.transaction_id,
      status: item.status
    })),
    preview,
    transaction
  }
}

function recoveryModel(
  cspSource: string,
  runId: string,
  recovery: readonly IncompleteRuleApplyTransactionV1[],
  status: string
): RuleProposalTriageGuiModel {
  return {
    cspSource,
    runId,
    groups: [],
    conflicts: [],
    decisionsComplete: false,
    canPreview: false,
    canApply: false,
    staleWarning: "",
    status,
    recovery: recovery.map((item) => ({ transactionId: item.transaction_id, status: item.status }))
  }
}

function operationModel(
  state: RuleProposalTriageState,
  decisions: RuleProposalDecisionsV1,
  operation: RuleProposalOperationV1 | ProposedMarkdownOperationV1,
  asset: "rule" | "project_context" | "prompt_addendum"
): RuleProposalTriageOperationModel {
  const decision = decisions.decisions[operation.candidate_id]
  const conflictById = new Map(state.proposal.conflicts.map((item) => [item.conflict_id, item]))
  const effectiveRule = isRuleOperation(operation)
    ? decision?.decision === "edit" && "edited_rule" in decision
      ? decision.edited_rule
      : operation.rule
    : undefined
  const effectiveMarkdown = !isRuleOperation(operation)
    ? decision?.decision === "edit" && "edited_markdown" in decision
      ? decision.edited_markdown
      : operation.heading !== null && operation.markdown !== null
        ? { heading: operation.heading, markdown: operation.markdown }
        : undefined
    : undefined
  return {
    candidateId: operation.candidate_id,
    operation: operation.operation,
    targetId: isRuleOperation(operation) ? operation.target_rule_id : operation.target_section_id,
    title: safeDisplay(
      isRuleOperation(operation)
        ? effectiveRule?.title ?? operation.target_rule_id ?? operation.candidate_id
        : effectiveMarkdown?.heading ?? operation.target_section_id ?? operation.candidate_id,
      8_192
    ),
    severity: isRuleOperation(operation) ? effectiveRule?.severity_on_fail ?? "" : "",
    confidence: operation.confidence,
    rationale: safeDisplay(operation.rationale, 8_192),
    sourceCount: operation.source_refs.length,
    sourceLocators: operation.source_refs.map((ref) => evidenceLocator(state.evidence, ref)),
    blockingConflictIds: operation.conflict_ids.filter((id) => conflictById.get(id)?.blocking),
    decision: decision?.decision ?? "pending",
    rejectReason: decision?.decision === "reject" ? safeDisplay(decision.reject_reason ?? "", 8_192) : "",
    existingSummary: existingOperationSummary(state.bundle, operation, asset),
    proposedSummary: proposedOperationSummary(operation, effectiveRule, effectiveMarkdown),
    editRule: effectiveRule === null || effectiveRule === undefined
      ? undefined
      : {
          category: effectiveRule.category,
          title: effectiveRule.title,
          description: effectiveRule.description,
          severityOnFail: effectiveRule.severity_on_fail,
          appliesWhen: [...effectiveRule.applies_when],
          evidenceRequired: effectiveRule.evidence_required,
          reviewHint: effectiveRule.review_hint
        },
    editHeading: effectiveMarkdown === undefined
      ? undefined
      : effectiveMarkdown.heading,
    editMarkdown: effectiveMarkdown === undefined
      ? undefined
      : effectiveMarkdown.markdown
  }
}

function evidenceLocator(evidence: RuleApplyEvidence, ref: RuleProposalSourceRefV1): string {
  return resolveEvidenceRecord(evidence, ref).locator
}

function resolveEvidenceRecord(evidence: RuleApplyEvidence, ref: RuleProposalSourceRefV1): {
  source: RuleSourceManifestV1["sources"][number]
  chunk: DocumentChunkV1
  locator: string
} {
  const source = evidence.sourceManifest.sources.find(({ source_id }) => source_id === ref.source_id)
  const chunk = evidence.chunks.find(({ chunk_id }) => chunk_id === ref.chunk_id)
  if (!source || !chunk || chunk.source_id !== source.source_id) {
    throw new SafeTriageError("The stored evidence reference is unavailable.")
  }
  const logicalName = source.logical_name.replace(/\\/g, "/").split("/").at(-1) || "source"
  const parts = [logicalName]
  const locator = chunk.locator
  if (locator.heading_path?.length) parts.push(`heading ${locator.heading_path.join(" > ")}`)
  if (locator.sheet !== undefined) parts.push(`sheet ${locator.sheet}`)
  if (locator.row !== undefined) parts.push(`row ${locator.row}`)
  if (locator.cell_range !== undefined) parts.push(`cells ${locator.cell_range}`)
  if (locator.page !== undefined) parts.push(`page ${locator.page}`)
  if (locator.block_index !== undefined) parts.push(`block ${locator.block_index}`)
  if (locator.table_index !== undefined) parts.push(`table ${locator.table_index}`)
  if (locator.part_index !== undefined) parts.push(`part ${locator.part_index}`)
  return { source: { ...source, logical_name: logicalName }, chunk, locator: safeDisplay(parts.join(" · "), 8_192) }
}

function existingOperationSummary(
  bundle: RuleApplyBundle,
  operation: RuleProposalOperationV1 | ProposedMarkdownOperationV1,
  asset: "rule" | "project_context" | "prompt_addendum"
): string {
  if (operation.operation === "add") return "No existing approved item (new addition)."
  try {
    if (asset === "rule" && isRuleOperation(operation)) {
      const current = bundle?.checklist
      if (current?.state !== "present") return "Existing approved rule is unavailable."
      const parsed = JSON.parse(decodeUtf8(current.bytes, "Approved checklist")) as unknown
      if (!isPlainObject(parsed) || !Array.isArray(parsed.rules)) {
        return "Existing approved rule is unavailable."
      }
      const rule = parsed.rules.find((value): value is Record<string, unknown> =>
        isPlainObject(value) && value.id === operation.target_rule_id)
      return rule ? approvedRuleSummary(rule) : "Existing approved rule is unavailable."
    }
    if (!isRuleOperation(operation)) {
      const current = asset === "project_context" ? bundle?.projectContext : bundle?.promptAddendum
      if (current?.state !== "present") return "Existing approved section is unavailable."
      const kind = asset === "project_context" ? "CTX" : "PRM"
      const parsed = parseManagedMarkdown(decodeUtf8(current.bytes, "Approved managed Markdown"), kind)
      const section = parsed.sections.find(({ id }) => id === operation.target_section_id)
      return section
        ? safeDisplay(`${section.heading}\n${section.markdown}`, 8_192)
        : "Existing approved section is unavailable."
    }
  } catch {
    return asset === "rule"
      ? "Existing approved rule is unavailable."
      : "Existing approved section is unavailable."
  }
  return "Existing approved item is unavailable."
}

function proposedOperationSummary(
  operation: RuleProposalOperationV1 | ProposedMarkdownOperationV1,
  effectiveRule: RuleProposalRuleV1 | null | undefined,
  effectiveMarkdown: RuleApplyEditedMarkdown | undefined
): string {
  if (operation.operation === "retire") return "Retire the existing approved item."
  if (isRuleOperation(operation)) {
    return effectiveRule
      ? approvedRuleSummary(effectiveRule)
      : "Proposed rule is unavailable."
  }
  return effectiveMarkdown
    ? safeDisplay(`${effectiveMarkdown.heading}\n${effectiveMarkdown.markdown}`, 8_192)
    : "Proposed section is unavailable."
}

function approvedRuleSummary(rule: Record<string, unknown> | RuleProposalRuleV1): string {
  const title = typeof rule.title === "string" ? rule.title : "Untitled rule"
  const severity = typeof rule.severity_on_fail === "string" ? rule.severity_on_fail : "unknown"
  const description = typeof rule.description === "string" ? rule.description : ""
  return safeDisplay(`${title}\nSeverity: ${severity}\n${description}`, 8_192)
}

function previewModel(
  plan: RuleApplyPlan,
  decisions: RuleProposalDecisionsV1,
  generatedAt: string
): RuleProposalTriagePreviewModel {
  const values = Object.values(decisions.decisions)
  return {
    targetCount: plan.targets.length,
    acceptedCount: values.filter(({ decision }) => decision === "accept").length,
    editedCount: values.filter(({ decision }) => decision === "edit").length,
    rejectedCount: values.filter(({ decision }) => decision === "reject").length,
    generatedAt
  }
}

function storedPreviewFromPlan(
  plan: RuleApplyPlan,
  decisions: RuleProposalDecisionsV1,
  generatedAt: string
): StoredApplyPreviewV1 {
  const summary = previewModel(plan, decisions, generatedAt)
  return {
    schema_version: RULE_APPLY_PREVIEW_SCHEMA_VERSION,
    run_id: plan.run_id,
    generated_at: generatedAt,
    targets: plan.targets.map((target) => ({
      asset: target.asset,
      expected_pre_image: structuredClone(target.expected_pre_image),
      post_image_sha256: target.post_image_sha256
    })),
    decision_summary: {
      accepted: summary.acceptedCount,
      edited: summary.editedCount,
      rejected: summary.rejectedCount
    }
  }
}

function assertStoredProposalValidation(
  value: unknown,
  proposal: RuleProposalV1,
  selection: RuleApplyEvidence["selection"]
): RuleProposalValidationContext {
  if (
    !isPlainObject(value) ||
    !hasOnlyKeys(value, [
      "schema_version",
      "run_id",
      "valid",
      "issues",
      "validated_at",
      "proposal_sha256",
      "validation_context"
    ]) ||
    value.schema_version !== RULE_PROPOSAL_VALIDATION_ARTIFACT_SCHEMA_VERSION ||
    value.run_id !== proposal.run_id ||
    value.valid !== true ||
    !Array.isArray(value.issues) ||
    value.issues.length !== 0 ||
    !isCanonicalTimestamp(value.validated_at) ||
    value.proposal_sha256 !== sha256(Buffer.from(JSON.stringify(proposal), "utf8")) ||
    !isPlainObject(value.validation_context) ||
    !isPlainObject(selection) ||
    !Array.isArray(selection.selected_chunks)
  ) {
    throw new Error("Stored rule proposal does not have a valid validation record")
  }
  const context = structuredClone(value.validation_context) as unknown as RuleProposalValidationContext
  const expectedEvidence = selection.selected_chunks.map((item) => ({
    source_id: item.source_id,
    chunk_id: item.chunk_id
  }))
  if (
    context.runId !== proposal.run_id ||
    JSON.stringify(context.selectedEvidence) !== JSON.stringify(expectedEvidence)
  ) {
    throw new Error("Stored rule proposal validation context is not bound to selected evidence")
  }
  return context
}

function parseStoredDecisions(raw: string, proposal: RuleProposalV1): RuleProposalDecisionsV1 {
  return validateDecisionOverlayForPersistence(
    parseJsonObject(raw, "Proposal decisions") as unknown as RuleProposalDecisionsV1,
    proposal,
    false
  )
}

function validateDecisionOverlayForPersistence(
  value: RuleProposalDecisionsV1,
  proposal: RuleProposalV1,
  requireComplete: boolean
): RuleProposalDecisionsV1 {
  if (
    !isPlainObject(value) ||
    !hasOnlyKeys(value as unknown as Record<string, unknown>, ["schema_version", "run_id", "decisions"]) ||
    value.schema_version !== RULE_PROPOSAL_DECISIONS_SCHEMA_VERSION ||
    value.run_id !== proposal.run_id ||
    !isPlainObject(value.decisions)
  ) {
    throw new Error("Proposal decision overlay is malformed")
  }
  const operations = allOperations(proposal)
  const operationById = new Map(operations.map((operation) => [operation.candidate_id, operation]))
  const entries = Object.entries(value.decisions)
  if (
    entries.some(([candidateId]) => !operationById.has(candidateId)) ||
    (requireComplete && entries.length !== operations.length)
  ) {
    throw new Error("Proposal decision overlay does not match every stored proposal operation")
  }
  const outputDecisions: Record<string, RuleApplyCandidateDecision> = {}
  for (const [candidateId, decision] of entries) {
    assertDecisionShape(decision, operationById.get(candidateId)!)
    outputDecisions[candidateId] = structuredClone(decision)
  }
  return {
    schema_version: RULE_PROPOSAL_DECISIONS_SCHEMA_VERSION,
    run_id: proposal.run_id,
    decisions: outputDecisions
  }
}

function assertDecisionShape(
  value: unknown,
  operation: RuleProposalOperationV1 | ProposedMarkdownOperationV1
): asserts value is RuleApplyCandidateDecision {
  if (!isPlainObject(value) || !isCanonicalTimestamp(value.reviewed_at)) {
    throw new Error("Proposal decision overlay is malformed")
  }
  if (value.conflict_resolutions !== undefined) {
    if (!isPlainObject(value.conflict_resolutions)) throw new Error("Proposal decision overlay is malformed")
    for (const [conflictId, alternativeId] of Object.entries(value.conflict_resolutions)) {
      if (!isCandidateId(conflictId) || !isCandidateId(alternativeId)) {
        throw new Error("Proposal decision overlay is malformed")
      }
    }
  }
  if (value.decision === "accept") {
    if (!hasOnlyKeys(value, value.conflict_resolutions === undefined
      ? ["decision", "reviewed_at"]
      : ["decision", "reviewed_at", "conflict_resolutions"])) {
      throw new Error("Proposal decision overlay is malformed")
    }
    return
  }
  if (value.decision === "reject") {
    const keys = ["decision", "reviewed_at"]
    if (value.reject_reason !== undefined) keys.push("reject_reason")
    if (value.conflict_resolutions !== undefined) keys.push("conflict_resolutions")
    if (!hasOnlyKeys(value, keys) ||
      (value.reject_reason !== undefined && !isRejectReason(value.reject_reason))) {
      throw new Error("Proposal decision overlay is malformed")
    }
    return
  }
  if (value.decision !== "edit" || operation.operation === "retire") {
    throw new Error("Proposal decision overlay is malformed")
  }
  const keys = ["decision", "reviewed_at", "conflict_resolutions"]
    .filter((key) => key !== "conflict_resolutions" || value.conflict_resolutions !== undefined)
  if (isRuleOperation(operation)) {
    keys.push("edited_rule")
    if (!hasOnlyKeys(value, keys) || !isRuleEdit(value.edited_rule)) {
      throw new Error("Proposal decision overlay is malformed")
    }
  } else {
    keys.push("edited_markdown")
    if (!hasOnlyKeys(value, keys) || !isEditedMarkdown(value.edited_markdown)) {
      throw new Error("Proposal decision overlay is malformed")
    }
  }
}

function assertEditedRuleAgainstProposal(
  proposal: RuleProposalV1,
  operation: RuleProposalOperationV1,
  editedRule: RuleProposalRuleV1
): void {
  const candidate = structuredClone(proposal)
  const target = candidate.operations.find(({ candidate_id }) => candidate_id === operation.candidate_id)
  if (!target) throw new SafeTriageError("The stored proposal operation is unavailable.")
  target.rule = structuredClone(editedRule)
  const result = validateRuleProposalSchema(candidate)
  if (!result.valid) throw new SafeTriageError("The edited rule does not match the validated rule contract.")
}

function assertEditedMarkdownAgainstProposal(
  proposal: RuleProposalV1,
  operation: ProposedMarkdownOperationV1,
  editedMarkdown: RuleApplyEditedMarkdown
): void {
  const candidate = structuredClone(proposal)
  const target = [
    ...candidate.project_context_operations,
    ...candidate.prompt_addendum_operations
  ].find(({ candidate_id }) => candidate_id === operation.candidate_id)
  if (!target) throw new SafeTriageError("The stored proposal operation is unavailable.")
  target.heading = editedMarkdown.heading
  target.markdown = editedMarkdown.markdown
  const result = validateRuleProposalSchema(candidate)
  if (
    !result.valid ||
    editedMarkdown.heading.trim().length === 0 ||
    /bob-managed-section/i.test(editedMarkdown.heading) ||
    /bob-managed-section/i.test(editedMarkdown.markdown)
  ) {
    throw new SafeTriageError("The edited Markdown does not match the validated proposal contract.")
  }
}

async function currentMatchingRun(state: RuleProposalTriageState): Promise<RuleAuthoringRunV1> {
  const current = await readRuleAuthoringRun(
    getRuleAuthoringPaths(state.run.workspaceRoot, state.run.runId)
  )
  for (const key of ["ruleProposal", "proposalValidation"] as const) {
    if (current.artifacts[key] !== state.run.artifacts[key]) {
      throw new Error("Stored validated proposal changed while Human Triage was open")
    }
  }
  if (current.currentPhase === "completed") {
    throw new Error("Completed rule authoring decisions are immutable")
  }
  if (current.artifacts.applyManifest !== undefined) {
    throw new Error("An authoring run with an apply manifest must be completed before further review")
  }
  return current
}

async function loadCurrentRuleApplyBundle(workspaceRoot: string): Promise<RuleApplyBundle> {
  const paths = getProjectRulesPaths(workspaceRoot)
  const load = async (filePath: string): Promise<RuleApplyBundle["checklist"]> => {
    const bytes = await readWorkspaceFileBounded(workspaceRoot, filePath, MAX_ARTIFACT_BYTES, true)
    return bytes === undefined ? { state: "missing" } : { state: "present", bytes }
  }
  return {
    checklist: await load(paths.checklistPath),
    projectContext: await load(paths.contextPath),
    promptAddendum: await load(paths.addendumPath),
    ruleSources: await load(paths.sourcesPath),
    ruleProvenance: await load(paths.provenancePath)
  }
}

async function readResolvedArtifact(
  run: RuleAuthoringRunV1,
  key: Parameters<typeof resolveRuleAuthoringArtifactPath>[1],
  maxBytes: number
): Promise<string> {
  const filePath = resolveRuleAuthoringArtifactPath(run, key)
  const bytes = await readWorkspaceFileBounded(run.workspaceRoot, filePath, maxBytes, false)
  if (bytes === undefined) throw new Error(`Rule authoring ${key} artifact is missing`)
  return decodeUtf8(bytes, "Rule authoring artifact")
}

async function readWorkspaceFileBounded(
  workspaceRootInput: string,
  filePathInput: string,
  maxBytes: number,
  allowMissing: boolean
): Promise<Buffer | undefined> {
  const workspaceRoot = path.resolve(workspaceRootInput)
  const filePath = path.resolve(filePathInput)
  assertContained(workspaceRoot, filePath)
  await assertSafeParentChain(workspaceRoot, path.dirname(filePath))
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    const before = await handle.stat()
    if (!before.isFile() || before.size > maxBytes) throw new Error("Rule authoring file exceeds its byte limit")
    const bytes = await handle.readFile()
    const after = await handle.stat()
    if (
      bytes.byteLength > maxBytes ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size
    ) {
      throw new Error("Rule authoring file changed while it was read")
    }
    await assertSafeParentChain(workspaceRoot, path.dirname(filePath))
    return bytes
  } catch (error) {
    if (allowMissing && isNodeError(error) && error.code === "ENOENT") return undefined
    throw error
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

async function assertSafeParentChain(workspaceRoot: string, directory: string): Promise<void> {
  const rootStats = await fs.lstat(workspaceRoot)
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new Error("Unsafe rule authoring path")
  let current = workspaceRoot
  for (const segment of path.relative(workspaceRoot, directory).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    const stats = await fs.lstat(current)
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error("Unsafe rule authoring path")
  }
  const physicalRoot = await fs.realpath(workspaceRoot)
  const physicalDirectory = await fs.realpath(directory)
  assertContained(physicalRoot, physicalDirectory)
}

function validateApplyManifest(value: unknown, runId: string): ApplyManifestV1 {
  if (
    !isPlainObject(value) ||
    !hasOnlyKeys(value, [
      "schema_version",
      "transaction_id",
      "run_id",
      "status",
      "committed_at",
      "backup_directory",
      "targets",
      "decisions",
      "retirements"
    ]) ||
    value.schema_version !== APPLY_MANIFEST_SCHEMA_VERSION ||
    value.status !== "committed" ||
    value.run_id !== runId ||
    !isPortableId(value.transaction_id) ||
    !isCanonicalTimestamp(value.committed_at) ||
    typeof value.backup_directory !== "string" ||
    value.backup_directory !== `.bob/review/rule-authoring/backups/${value.transaction_id}` ||
    !Array.isArray(value.targets) ||
    value.targets.length !== TARGET_SPECS.length ||
    !Array.isArray(value.decisions) ||
    !Array.isArray(value.retirements)
  ) {
    throw new Error("Rule authoring committed apply manifest is malformed")
  }
  for (const [index, target] of value.targets.entries()) {
    const [asset, targetPath] = TARGET_SPECS[index]
    if (
      !isPlainObject(target) ||
      !hasOnlyKeys(target, [
        "asset",
        "path",
        "expected_pre_image",
        "post_image_sha256",
        "state"
      ]) ||
      target.asset !== asset ||
      target.path !== targetPath ||
      target.state !== "replaced" ||
      !SHA256.test(String(target.post_image_sha256)) ||
      !isExpectedPreImage(target.expected_pre_image)
    ) {
      throw new Error("Rule authoring committed apply manifest target is malformed")
    }
  }
  return structuredClone(value) as unknown as ApplyManifestV1
}

function verifyApprovedReferences(
  checklistBytes: Buffer,
  contextBytes: Buffer,
  addendumBytes: Buffer,
  sourceBytes: Buffer,
  provenanceBytes: Buffer
): void {
  const checklist = parseJsonObject(decodeUtf8(checklistBytes, "Approved checklist"), "Approved checklist")
  if (!Array.isArray(checklist.rules)) throw new Error("Approved checklist is malformed")
  const ruleIds = new Set<string>()
  for (const rule of checklist.rules) {
    if (!isPlainObject(rule) || typeof rule.id !== "string" || ruleIds.has(rule.id)) {
      throw new Error("Approved checklist is malformed")
    }
    ruleIds.add(rule.id)
  }
  const context = parseManagedMarkdown(decodeUtf8(contextBytes, "Project context"), "CTX")
  const addendum = parseManagedMarkdown(decodeUtf8(addendumBytes, "Prompt addendum"), "PRM")
  const contextIds = new Set(context.sections.map(({ id }) => id))
  const addendumIds = new Set(addendum.sections.map(({ id }) => id))
  const sources = parseJsonObject(decodeUtf8(sourceBytes, "Rule sources"), "Rule sources")
  if (
    sources.schema_version !== "bob-bazaar-review/rule-sources/v1" ||
    !Array.isArray(sources.sources)
  ) throw new Error("Approved rule source manifest is malformed")
  const sourceIds = new Set<string>()
  for (const source of sources.sources) {
    if (
      !isPlainObject(source) ||
      !SOURCE_ID.test(String(source.source_id)) ||
      !SHA256.test(String(source.sha256)) ||
      sourceIds.has(String(source.source_id))
    ) throw new Error("Approved rule source manifest is malformed")
    sourceIds.add(String(source.source_id))
  }
  const provenance = parseJsonObject(
    decodeUtf8(provenanceBytes, "Rule provenance"),
    "Rule provenance"
  )
  if (
    provenance.schema_version !== "bob-bazaar-review/rule-provenance/v1" ||
    !Array.isArray(provenance.rules) ||
    !Array.isArray(provenance.markdown_sections)
  ) throw new Error("Approved rule provenance is malformed")
  const provenanceRuleIds = new Set<string>()
  for (const entry of provenance.rules) {
    if (
      !isPlainObject(entry) ||
      typeof entry.rule_id !== "string" ||
      (entry.lifecycle !== "active" && entry.lifecycle !== "retired") ||
      !Array.isArray(entry.source_refs) ||
      provenanceRuleIds.has(entry.rule_id)
    ) throw new Error("Approved rule provenance is malformed")
    provenanceRuleIds.add(entry.rule_id)
    if (entry.lifecycle === "active" && !ruleIds.has(entry.rule_id)) {
      throw new Error("Active rule provenance target is unavailable")
    }
    verifyProvenanceRefs(entry.source_refs, sourceIds)
  }
  const markdownIds = new Set<string>()
  for (const entry of provenance.markdown_sections) {
    if (
      !isPlainObject(entry) ||
      (entry.asset !== "project-context" && entry.asset !== "review-prompt-addendum") ||
      typeof entry.section_id !== "string" ||
      (entry.lifecycle !== "active" && entry.lifecycle !== "retired") ||
      !Array.isArray(entry.source_refs)
    ) throw new Error("Approved rule provenance is malformed")
    const key = `${entry.asset}:${entry.section_id}`
    if (markdownIds.has(key)) throw new Error("Approved rule provenance is malformed")
    markdownIds.add(key)
    const targets = entry.asset === "project-context" ? contextIds : addendumIds
    if (entry.lifecycle === "active" && !targets.has(entry.section_id)) {
      throw new Error("Active Markdown provenance target is unavailable")
    }
    verifyProvenanceRefs(entry.source_refs, sourceIds)
  }
}

function verifyProvenanceRefs(value: readonly unknown[], sourceIds: ReadonlySet<string>): void {
  for (const ref of value) {
    if (
      !isPlainObject(ref) ||
      !SOURCE_ID.test(String(ref.source_id)) ||
      !sourceIds.has(String(ref.source_id)) ||
      !CHUNK_ID.test(String(ref.chunk_id)) ||
      !SHA256.test(String(ref.text_sha256)) ||
      !isPlainObject(ref.locator)
    ) {
      throw new Error("Rule source and provenance references are inconsistent")
    }
  }
}

function verifyCurrentRunProvenanceAgainstChunks(
  runId: string,
  manifest: ApplyManifestV1,
  approvedSourceBytes: Buffer,
  provenanceBytes: Buffer,
  localManifest: RuleSourceManifestV1,
  chunks: readonly DocumentChunkV1[]
): void {
  const approved = parseJsonObject(
    decodeUtf8(approvedSourceBytes, "Approved rule sources"),
    "Approved rule sources"
  )
  const provenance = parseJsonObject(
    decodeUtf8(provenanceBytes, "Approved rule provenance"),
    "Approved rule provenance"
  )
  if (!Array.isArray(approved.sources) || !Array.isArray(provenance.rules) ||
    !Array.isArray(provenance.markdown_sections) || !Array.isArray(localManifest.sources)) {
    throw new Error("Rule provenance cannot be bound to authoritative evidence")
  }
  const approvedByHash = new Map<string, Record<string, unknown>>()
  for (const source of approved.sources) {
    if (!isPlainObject(source) || typeof source.sha256 !== "string" ||
      approvedByHash.has(source.sha256)) {
      throw new Error("Rule provenance cannot be bound to authoritative evidence")
    }
    approvedByHash.set(source.sha256, source)
  }
  const localById = new Map(localManifest.sources.map((source) => [source.source_id, source]))
  const authoritative = new Map<string, { locator: unknown; textSha256: string }>()
  for (const chunk of chunks) {
    const localSource = localById.get(chunk.source_id)
    if (!localSource) continue
    const approvedSource = approvedByHash.get(localSource.sha256)
    if (!approvedSource || typeof approvedSource.source_id !== "string") continue
    const mappedSourceId = approvedSource.source_id
    const mappedChunkId = mappedSourceId === chunk.source_id
      ? chunk.chunk_id
      : buildDocumentChunkId(mappedSourceId, localSource.media_type, chunk.kind, chunk.locator)
    const key = `${mappedSourceId}\u0000${mappedChunkId}`
    if (authoritative.has(key)) {
      throw new Error("Rule provenance contains an ambiguous authoritative chunk")
    }
    authoritative.set(key, {
      locator: structuredClone(chunk.locator),
      textSha256: chunk.text_sha256
    })
  }
  const currentEntries = [...provenance.rules, ...provenance.markdown_sections].filter((entry) =>
    isPlainObject(entry) && entry.last_run_id === runId)
  for (const entry of currentEntries) {
    if (!Array.isArray(entry.source_refs)) {
      throw new Error("Rule provenance cannot be bound to authoritative evidence")
    }
    for (const ref of entry.source_refs) assertAuthoritativeProvenanceRef(ref, authoritative)
  }
  for (const decision of manifest.decisions) {
    if (decision.decision === "reject") continue
    for (const ref of decision.source_refs as unknown as readonly unknown[]) {
      assertAuthoritativeProvenanceRef(ref, authoritative)
    }
  }
}

function assertAuthoritativeProvenanceRef(
  value: unknown,
  chunks: ReadonlyMap<string, { locator: unknown; textSha256: string }>
): void {
  if (!isPlainObject(value) || typeof value.source_id !== "string" ||
    typeof value.chunk_id !== "string") {
    throw new Error("Rule provenance source reference is not authoritative")
  }
  const expected = chunks.get(`${value.source_id}\u0000${value.chunk_id}`)
  if (!expected || value.text_sha256 !== expected.textSha256 ||
    stableJson(value.locator) !== stableJson(expected.locator)) {
    throw new Error("Rule provenance locator or text hash does not match authoritative document chunks")
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function parseDocumentChunks(raw: string): DocumentChunkV1[] {
  if (raw.length === 0) return []
  return raw.split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    const parsed = parseJsonObject(line, "Document chunk")
    return parsed as unknown as DocumentChunkV1
  })
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${label} is malformed`)
  }
  if (!isPlainObject(parsed)) throw new Error(`${label} is malformed`)
  return parsed
}

function normalizeTriageInput(value: RuleProposalTriageInput): RuleProposalTriageInput {
  if (!isPlainObject(value) ||
    !hasOnlyKeys(value as unknown as Record<string, unknown>, ["workspaceRoot", "runId"])) {
    throw new Error("Rule proposal triage input is malformed")
  }
  if (typeof value.workspaceRoot !== "string" || !path.isAbsolute(value.workspaceRoot)) {
    throw new Error("Rule proposal triage workspace is invalid")
  }
  return {
    workspaceRoot: path.resolve(value.workspaceRoot),
    runId: validateRuleAuthoringId(String(value.runId), "runId")
  }
}

function allOperations(
  proposal: RuleProposalV1
): Array<RuleProposalOperationV1 | ProposedMarkdownOperationV1> {
  return [
    ...proposal.operations,
    ...proposal.project_context_operations,
    ...proposal.prompt_addendum_operations
  ]
}

function requireOperation(
  proposal: RuleProposalV1,
  candidateId: string
): RuleProposalOperationV1 | ProposedMarkdownOperationV1 {
  const operation = allOperations(proposal).find(({ candidate_id }) => candidate_id === candidateId)
  if (!operation) throw new SafeTriageError("The proposal operation ID is unavailable.")
  return operation
}

function hasEveryDecision(proposal: RuleProposalV1, decisions: RuleProposalDecisionsV1): boolean {
  const operations = allOperations(proposal)
  const conflicts = new Map(proposal.conflicts.map((conflict) => [conflict.conflict_id, conflict]))
  return operations.length === Object.keys(decisions.decisions).length && operations.every((operation) => {
    const decision = decisions.decisions[operation.candidate_id]
    if (!decision) return false
    if (decision.decision === "reject") return true
    return operation.conflict_ids.every((conflictId) => {
      const conflict = conflicts.get(conflictId)
      if (!conflict?.blocking) return true
      const alternativeId = decision.conflict_resolutions?.[conflictId]
      return alternativeId !== undefined &&
        conflict.alternatives.some((alternative) => alternative.alternative_id === alternativeId)
    })
  })
}

function withDecision(
  overlay: RuleProposalDecisionsV1,
  candidateId: string,
  decision: RuleApplyCandidateDecision
): RuleProposalDecisionsV1 {
  return {
    schema_version: RULE_PROPOSAL_DECISIONS_SCHEMA_VERSION,
    run_id: overlay.run_id,
    decisions: { ...structuredClone(overlay.decisions), [candidateId]: structuredClone(decision) }
  }
}

function emptyDecisionOverlay(runId: string): RuleProposalDecisionsV1 {
  return {
    schema_version: RULE_PROPOSAL_DECISIONS_SCHEMA_VERSION,
    run_id: runId,
    decisions: {}
  }
}

function cloneDecisions(value: RuleProposalDecisionsV1): RuleProposalDecisionsV1 {
  return structuredClone(value)
}

function compactDecision<T extends RuleApplyCandidateDecision>(value: T): T {
  const output = structuredClone(value) as T & Record<string, unknown>
  for (const key of Object.keys(output)) if (output[key] === undefined) delete output[key]
  return output
}

function isRuleOperation(
  value: RuleProposalOperationV1 | ProposedMarkdownOperationV1
): value is RuleProposalOperationV1 {
  return "target_rule_id" in value
}

function isRuleEdit(value: unknown): value is RuleProposalRuleV1 {
  if (
    !isPlainObject(value) ||
    !hasOnlyKeys(value, [
      "category",
      "title",
      "description",
      "severity_on_fail",
      "applies_when",
      "evidence_required",
      "review_hint"
    ]) ||
    !boundedNonEmpty(value.category, 256) ||
    !boundedNonEmpty(value.title, 512) ||
    !boundedNonEmpty(value.description, 8_192) ||
    (value.severity_on_fail !== "error" && value.severity_on_fail !== "warning" &&
      value.severity_on_fail !== "info") ||
    !Array.isArray(value.applies_when) ||
    value.applies_when.length > 32 ||
    value.applies_when.some((item) => typeof item !== "string" || Buffer.byteLength(item, "utf8") > 1_024) ||
    typeof value.evidence_required !== "boolean" ||
    typeof value.review_hint !== "string" ||
    Buffer.byteLength(value.review_hint, "utf8") > 4_096
  ) return false
  return !containsDisallowedControl(value)
}

function isEditedMarkdown(value: unknown): value is RuleApplyEditedMarkdown {
  return isPlainObject(value) &&
    hasOnlyKeys(value, ["heading", "markdown"]) &&
    boundedNonEmpty(value.heading, 512) &&
    value.heading.trim().length > 0 &&
    !/[\r\n]/.test(value.heading) &&
    !/bob-managed-section/i.test(value.heading) &&
    typeof value.markdown === "string" &&
    Buffer.byteLength(value.markdown, "utf8") <= DEFAULT_RULE_AUTHORING_LIMITS.maxProjectContextBytes &&
    !/bob-managed-section/i.test(value.markdown) &&
    !containsDisallowedControl(value)
}

function isRejectReason(value: unknown): value is string {
  return typeof value === "string" &&
    !CONTROL_CHARACTER.test(value) &&
    Buffer.byteLength(value, "utf8") <= MAX_REJECT_REASON_BYTES
}

function boundedNonEmpty(value: unknown, maxBytes: number): value is string {
  return typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= maxBytes
}

function containsDisallowedControl(value: unknown): boolean {
  if (typeof value === "string") return CONTROL_CHARACTER.test(value)
  if (Array.isArray(value)) return value.some(containsDisallowedControl)
  if (isPlainObject(value)) return Object.values(value).some(containsDisallowedControl)
  return false
}

function assertPlanMatchesState(plan: RuleApplyPlan, state: RuleProposalTriageState): void {
  if (plan.run_id !== state.proposal.run_id || plan.schema_version !== "bob-bazaar-review/rule-apply-plan/v1") {
    throw new Error("Apply preview does not match the active validated proposal")
  }
}

function assertManifestMatchesPlan(manifest: ApplyManifestV1, plan: RuleApplyPlan): void {
  if (
    manifest.schema_version !== APPLY_MANIFEST_SCHEMA_VERSION ||
    manifest.status !== "committed" ||
    manifest.run_id !== plan.run_id ||
    manifest.targets.length !== plan.targets.length ||
    manifest.targets.some((target, index) =>
      target.asset !== plan.targets[index].asset ||
      target.path !== plan.targets[index].path ||
      target.post_image_sha256 !== plan.targets[index].post_image_sha256)
  ) {
    throw new Error("Committed apply manifest does not match the validated apply plan")
  }
}

function mapTriageError(error: unknown): {
  message: string
  stale: boolean
  recoverable: boolean
} {
  if (error instanceof SafeTriageError) {
    return { message: error.message, stale: false, recoverable: true }
  }
  const message = error instanceof Error ? error.message : ""
  if (/stale|base does not match|pre.image/i.test(message)) {
    return {
      message: "The approved rule bundle changed after proposal validation. Regenerate the proposal before apply.",
      stale: true,
      recoverable: true
    }
  }
  if (/decision|conflict|validation|proposal/i.test(message)) {
    return { message: "Apply validation failed. Review every decision and conflict resolution.", stale: false, recoverable: true }
  }
  return { message: "Project rule apply failed safely. No private diagnostic details were displayed.", stale: false, recoverable: false }
}

class SafeTriageError extends Error {}

function canonicalNow(value: string): string {
  if (!isCanonicalTimestamp(value)) throw new Error("Rule proposal triage timestamp is invalid")
  return value
}

function isCanonicalTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    CANONICAL_TIMESTAMP.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
}

function timestampAfter(...values: string[]): string {
  const maximum = Math.max(...values.map((value) => Date.parse(value)))
  if (!Number.isFinite(maximum)) throw new Error("Rule authoring timestamp is invalid")
  return new Date(maximum + 1).toISOString()
}

function completedRun(
  run: RuleAuthoringRunV1,
  artifacts: RuleAuthoringRunV1["artifacts"],
  completionAt: string
): RuleAuthoringRunV1 {
  return {
    ...run,
    currentPhase: "completed",
    phases: Object.fromEntries(Object.entries(run.phases).map(([phase, progress]) => [
      phase,
      progress.status === "skipped"
        ? structuredClone(progress)
        : {
            status: "completed",
            startedAt: progress.startedAt ?? completionAt,
            completedAt: progress.completedAt ?? completionAt
          }
    ])) as RuleAuthoringRunV1["phases"],
    artifacts,
    updatedAt: completionAt
  }
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function decodeUtf8(bytes: Uint8Array, label: string): string {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  if (text.charCodeAt(0) === 0xfeff) throw new Error(`${label} must not contain a BOM`)
  return text
}

function safeDisplay(value: unknown, maxBytes: number): string {
  return sanitizeDisplayPreservingClosingTags(
    value,
    Math.min(maxBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes)
  )
}

function sanitizeDisplayPreservingClosingTags(value: unknown, maxBytes: number): string {
  const source = typeof value === "string" ? value : String(value ?? "")
  const tags: string[] = []
  const protectedText = source.replace(/<\/[A-Za-z][A-Za-z0-9-]{0,63}>/g, (tag) => {
    const token = `BOB_SAFE_CLOSING_TAG_${tags.length}_TOKEN`
    tags.push(tag)
    return token
  })
  let sanitized = sanitizeRemoteSafeText(protectedText, maxBytes)
  for (const [index, tag] of tags.entries()) {
    sanitized = sanitized.replace(`BOB_SAFE_CLOSING_TAG_${index}_TOKEN`, tag)
  }
  return sanitized
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

function requiredBytes(values: ReadonlyMap<string, Buffer>, key: string): Buffer {
  const value = values.get(key)
  if (!value) throw new Error("Rule authoring post-image verification failed")
  return value
}

function isExpectedPreImage(value: unknown): boolean {
  return isPlainObject(value) && (
    (hasOnlyKeys(value, ["state"]) && value.state === "missing") ||
    (hasOnlyKeys(value, ["state", "sha256"]) && value.state === "present" &&
      SHA256.test(String(value.sha256)))
  )
}

function isCandidateId(value: unknown): value is string {
  return typeof value === "string" && CANDIDATE_ID.test(value)
}

function isPortableId(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    validateRuleAuthoringId(value, "id")
    return true
  } catch {
    return false
  }
}

function assertContained(root: string, target: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return
  }
  throw new Error("Rule authoring path escapes the workspace")
}

function hasOnlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sorted = [...expected].sort()
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index])
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

function requireVscode(): typeof import("vscode") {
  if (VSCODE_RUNTIME) return VSCODE_RUNTIME
  try {
    return require("vscode") as typeof import("vscode")
  } catch {
    throw new Error("VS Code API is required to open Project Rule Proposal Triage")
  }
}

function optionalVscode(): typeof import("vscode") | undefined {
  try {
    return require("vscode") as typeof import("vscode")
  } catch {
    return undefined
  }
}
