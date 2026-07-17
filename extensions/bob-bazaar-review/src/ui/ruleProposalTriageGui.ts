import { createHash, randomBytes } from "node:crypto"
import { constants as fsConstants, type BigIntStats } from "node:fs"
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
  validateRuleApplyEvidence,
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
  ruleApplyMetadataEquals,
  validateRuleApplyMetadata,
  withRuleApplyWorkspaceLock,
  type ApplyManifestV1,
  type IncompleteRuleApplyTransactionV1,
  type RuleApplyRecoveryRequest,
  type RuleApplyWorkspaceLockToken
} from "../ruleAuthoring/ruleApplyTransaction"
import { resolveRuleAuthoringArtifactPath } from "../ruleAuthoring/ruleAuthoringArtifactStore"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "../ruleAuthoring/ruleAuthoringLimits"
import {
  hasUtf8ByteLength,
  RULE_AUTHORING_TEXT_BYTE_LIMITS
} from "../ruleAuthoring/ruleAuthoringTextLimits"
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
  | { type: "openEvidence"; candidateId: string; comparisonDocument: "full" }
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
  validationContext: RuleProposalValidationContext
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
  evidence_binding: {
    source_manifest: StoredEvidenceArtifactBinding
    document_chunks: StoredEvidenceArtifactBinding
    evidence_selection: StoredEvidenceArtifactBinding
    selected_evidence: Array<{
      source_id: string
      chunk_id: string
      text_sha256: string
    }>
  }
}

interface StoredEvidenceArtifactBinding {
  artifact: string
  sha256: string
}

export interface RuleProposalValidationEvidenceInput {
  run: Pick<RuleAuthoringRunV1, "runId" | "artifacts">
  evidence: RuleApplyEvidence
}

interface StoredApplyPreviewV1 {
  schema_version: typeof RULE_APPLY_PREVIEW_SCHEMA_VERSION
  run_id: string
  generated_at: string
  targets: Array<{
    asset: string
    path: string
    expected_pre_image: unknown
    post_image_sha256: string
  }>
  decision_summary: {
    accepted: number
    edited: number
    rejected: number
  }
  binding: {
    proposal_artifact: string
    proposal_sha256: string
    proposal_validation_artifact: string
    proposal_validation_sha256: string
    proposal_decisions_artifact: string
    proposal_decisions_sha256: string
    plan_metadata_sha256: string
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
  withRuleApplyWorkspaceLock: typeof withRuleApplyWorkspaceLock
  recoverCommittedRuleAuthoringApply: (
    input: RuleProposalTriageInput,
    workspaceLockToken?: RuleApplyWorkspaceLockToken
  ) => Promise<RuleAuthoringCommittedRecoveryResult | undefined>
  loadRuleProposalTriageState: (input: RuleProposalTriageInput) => Promise<RuleProposalTriageState>
  persistRuleProposalDecisions: (
    state: RuleProposalTriageState,
    decisions: RuleProposalDecisionsV1,
    workspaceLockToken?: RuleApplyWorkspaceLockToken
  ) => Promise<RuleProposalTriageState>
  buildRuleApplyPlan: typeof buildRuleApplyPlan
  persistRuleApplyPreview: (
    state: RuleProposalTriageState,
    decisions: RuleProposalDecisionsV1,
    plan: RuleApplyPlan,
    workspaceLockToken?: RuleApplyWorkspaceLockToken
  ) => Promise<RuleProposalTriageState>
  validateDisplayedRuleApplyPreview: (
    state: RuleProposalTriageState,
    plan: RuleApplyPlan,
    workspaceLockToken?: RuleApplyWorkspaceLockToken
  ) => Promise<void>
  executeRuleApplyTransaction: typeof executeRuleApplyTransaction
  persistRuleApplyCompletion: (
    state: RuleProposalTriageState,
    decisions: RuleProposalDecisionsV1,
    plan: RuleApplyPlan,
    manifest: ApplyManifestV1,
    workspaceLockToken?: RuleApplyWorkspaceLockToken
  ) => Promise<RuleAuthoringRunV1>
  invalidateRuleApplyPreview: (
    input: RuleProposalTriageInput,
    workspaceLockToken?: RuleApplyWorkspaceLockToken
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
const ANY_CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024
const MAX_TRANSACTION_ENTRIES = 10_000
const MAX_DOCUMENT_CHUNKS = Math.floor(DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes / 128)
const MAX_COMPARISON_DOCUMENT_BYTES = (2 * DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes) + 65_536
const APPLY_CONFIRMATION = "採用した規約を反映"
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
  if (
    value.type === "openEvidence" &&
    hasOnlyKeys(value, ["type", "candidateId", "comparisonDocument"]) &&
    isCandidateId(value.candidateId) &&
    value.comparisonDocument === "full"
  ) {
    return {
      type: "openEvidence",
      candidateId: value.candidateId,
      comparisonDocument: "full"
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
    withRuleApplyWorkspaceLock,
    recoverCommittedRuleAuthoringApply,
    loadRuleProposalTriageState,
    persistRuleProposalDecisions,
    buildRuleApplyPlan,
    persistRuleApplyPreview,
    validateDisplayedRuleApplyPreview,
    executeRuleApplyTransaction,
    persistRuleApplyCompletion,
    invalidateRuleApplyPreview,
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
  validatedAt: string,
  evidenceInput: RuleProposalValidationEvidenceInput
): StoredProposalValidationV1 {
  const timestamp = canonicalNow(validatedAt)
  const result = parseAndValidateRuleProposal(JSON.stringify(proposal), context)
  if (!result.valid) throw new Error("Rule proposal cannot be recorded as validated")
  if (
    !isPlainObject(evidenceInput) ||
    !isPlainObject(evidenceInput.run) ||
    evidenceInput.run.runId !== proposal.run_id ||
    !isPlainObject(evidenceInput.run.artifacts) ||
    !isPlainObject(evidenceInput.evidence)
  ) {
    throw new Error("Rule proposal validation evidence binding is malformed")
  }
  validateRuleApplyEvidence(evidenceInput.evidence)
  const selectedEvidence = evidenceInput.evidence.selection.selected_chunks.map((item) => ({
    source_id: item.source_id,
    chunk_id: item.chunk_id,
    text_sha256: item.text_sha256
  }))
  if (stableJson(context.selectedEvidence) !== stableJson(selectedEvidence.map(({ source_id, chunk_id }) => ({
    source_id,
    chunk_id
  })))) {
    throw new Error("Rule proposal validation context is not bound to selected evidence")
  }
  return {
    schema_version: RULE_PROPOSAL_VALIDATION_ARTIFACT_SCHEMA_VERSION,
    run_id: proposal.run_id,
    valid: true,
    issues: [],
    validated_at: timestamp,
    proposal_sha256: sha256(Buffer.from(JSON.stringify(result.proposal), "utf8")),
    validation_context: structuredClone(context),
    evidence_binding: {
      source_manifest: {
        artifact: requiredEvidenceArtifactPointer(evidenceInput.run, "sourceManifest"),
        sha256: canonicalValueSha256(evidenceInput.evidence.sourceManifest)
      },
      document_chunks: {
        artifact: requiredEvidenceArtifactPointer(evidenceInput.run, "documentChunks"),
        sha256: canonicalValueSha256(evidenceInput.evidence.chunks)
      },
      evidence_selection: {
        artifact: requiredEvidenceArtifactPointer(evidenceInput.run, "evidenceSelection"),
        sha256: canonicalValueSha256(evidenceInput.evidence.selection)
      },
      selected_evidence: selectedEvidence
    }
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
    "規約案の確認・採否",
    vscodeApi.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  )
  context.subscriptions.push(panel)
  const nonce = dependencies.createNonce()
  let state: RuleProposalTriageState | undefined
  let decisions = emptyDecisionOverlay(input.runId)
  let recovery: readonly IncompleteRuleApplyTransactionV1[] = []
  let preview: RuleProposalTriagePreviewModel | undefined
  let displayedPreviewDigest: string | undefined
  let transaction: RuleProposalTriageTransactionModel | undefined
  let staleWarning = ""
  let status = "検証済みの規約案を読み込んでいます。"
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
      reject(error instanceof Error ? error : new Error("規約案の確認・採否に失敗しました"))
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
      const recoveredResult = await dependencies.withRuleApplyWorkspaceLock<
        Extract<RuleAuthoringDecisionResult, { status: "applied" }> | undefined
      >(
        input.workspaceRoot,
        input.runId,
        async (workspaceLockToken) => {
          recovery = await dependencies.findIncompleteRuleApplyTransactions(input.workspaceRoot)
          if (recovery.length > 0) {
            state = undefined
            preview = undefined
            displayedPreviewDigest = undefined
            status = "Transaction recovery is required before proposal triage can resume."
            render()
            return undefined
          }
          const committed = await dependencies.recoverCommittedRuleAuthoringApply(
            input,
            workspaceLockToken
          )
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
            return {
              status: "applied",
              runId: committed.runId,
              transactionId: committed.transactionId
            } as const
          }
          state = await dependencies.loadRuleProposalTriageState(input)
          decisions = cloneDecisions(state.decisions)
          preview = undefined
          displayedPreviewDigest = undefined
          status = "Review every proposal candidate before previewing apply."
          render()
          return undefined
        }
      )
      if (recoveredResult) finish(recoveredResult)
    }

    panel.onDidDispose(() => finish({ status: "closed", runId: input.runId }))
    panel.webview.onDidReceiveMessage((rawMessage) => {
      if (busy || settled) return
      const message = parseRuleProposalTriageMessage(rawMessage)
      if (!message) {
        if (isPlainObject(rawMessage) && rawMessage.type === "editRule") {
          status = "The editable value is invalid or exceeds its UTF-8 byte limit."
          render()
          void vscodeApi.window.showErrorMessage(status)
        } else if (
          isPlainObject(rawMessage) &&
          rawMessage.type === "setDecision" &&
          rawMessage.decision === "reject"
        ) {
          status = "The rejection reason is invalid or exceeds the 8,192-byte UTF-8 limit."
          render()
          void vscodeApi.window.showErrorMessage(status)
        }
        return
      }
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
            if (!current || message.action !== current.recovery_action) return
            let recovered: Awaited<ReturnType<typeof recoverRuleApplyTransaction>>
            try {
              recovered = await dependencies.withRuleApplyWorkspaceLock(
                input.workspaceRoot,
                current.transaction_id,
                async (workspaceLockToken) => {
                  const result = await dependencies.recoverRuleApplyTransaction(
                    input.workspaceRoot,
                    current.transaction_id,
                    {
                      action: message.action,
                      now: canonicalNow(dependencies.now()),
                      workspaceLockToken
                    }
                  )
                  if (result.status !== "committed") {
                    await dependencies.invalidateRuleApplyPreview({
                      workspaceRoot: input.workspaceRoot,
                      runId: current.run_id
                    }, workspaceLockToken)
                  } else {
                    const completed = await dependencies.recoverCommittedRuleAuthoringApply({
                      workspaceRoot: input.workspaceRoot,
                      runId: current.run_id
                    }, workspaceLockToken)
                    if (
                      !completed ||
                      completed.runId !== current.run_id ||
                      completed.transactionId !== current.transaction_id
                    ) {
                      throw new Error("Committed apply completion recovery did not attach its owning run")
                    }
                  }
                  return result
                }
              )
            } catch (error) {
              await refreshAfterRecovery()
              throw error
            }
            transaction = {
              transactionId: current.transaction_id,
              status: recovered.status === "committed" ? "committed" : "rolled_back",
              targetCount: "targets" in recovered && Array.isArray(recovered.targets)
                ? recovered.targets.length
                : 0
            }
            status = recovered.status === "committed"
              ? "The durable apply commit was completed safely."
              : "The incomplete transaction was rolled back."
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
            const nextDecisions = withDecision(decisions, message.candidateId, nextDecision)
            const persistedState = await dependencies.persistRuleProposalDecisions(state, nextDecisions)
            state = persistedState
            decisions = nextDecisions
            preview = undefined
            displayedPreviewDigest = undefined
            staleWarning = ""
            status = "判定内容を保存しました。反映前にプレビューを更新してください。"
            render()
            return
          }
          if (message.type === "editRule") {
            const operation = requireOperation(state.proposal, message.candidateId)
            if (operation.operation === "retire") {
              throw new SafeTriageError("この候補は編集できません。採用または却下を選択してください。")
            }
            const previous = decisions.decisions[message.candidateId]
            const common = {
              decision: "edit" as const,
              reviewed_at: canonicalNow(dependencies.now()),
              conflict_resolutions: previous?.conflict_resolutions === undefined
                ? undefined
                : structuredClone(previous.conflict_resolutions)
            }
            let nextDecisions: RuleProposalDecisionsV1
            if (isRuleOperation(operation)) {
              if (!("rule" in message)) {
                throw new SafeTriageError("This candidate requires a rule edit.")
              }
              assertEditedRuleAgainstProposal(
                state.proposal,
                state.validationContext,
                operation,
                message.rule
              )
              nextDecisions = withDecision(decisions, message.candidateId, compactDecision({
                ...common,
                edited_rule: structuredClone(message.rule)
              }))
            } else {
              if (!("markdown" in message)) {
                throw new SafeTriageError("This candidate requires a Markdown edit.")
              }
              assertEditedMarkdownAgainstProposal(
                state.proposal,
                state.validationContext,
                operation,
                message.markdown
              )
              nextDecisions = withDecision(decisions, message.candidateId, compactDecision({
                ...common,
                edited_markdown: structuredClone(message.markdown)
              }))
            }
            const persistedState = await dependencies.persistRuleProposalDecisions(state, nextDecisions)
            state = persistedState
            decisions = nextDecisions
            preview = undefined
            displayedPreviewDigest = undefined
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
            const nextDecisions = withDecision(decisions, message.candidateId, {
              ...structuredClone(current),
              reviewed_at: canonicalNow(dependencies.now()),
              conflict_resolutions: resolutions
            })
            const persistedState = await dependencies.persistRuleProposalDecisions(state, nextDecisions)
            state = persistedState
            decisions = nextDecisions
            preview = undefined
            displayedPreviewDigest = undefined
            status = "Conflict resolution saved."
            render()
            return
          }
          if (message.type === "openEvidence") {
            const operation = requireOperation(state.proposal, message.candidateId)
            if ("comparisonDocument" in message) {
              const content = buildFullComparisonDocument(state, decisions, operation)
              if (Buffer.byteLength(content, "utf8") > MAX_COMPARISON_DOCUMENT_BYTES) {
                throw new SafeTriageError("The full comparison exceeds the approved display limit.")
              }
              const document = await vscodeApi.workspace.openTextDocument({
                language: "markdown",
                content
              })
              await vscodeApi.window.showTextDocument(document, { preview: true })
              return
            }
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
            displayedPreviewDigest = planMetadataSha256(prepared.plan)
            staleWarning = ""
            status = "Apply preview regenerated from the current approved bundle."
            render()
            return
          }
          if (!preview || !displayedPreviewDigest) {
            throw new SafeTriageError("Generate and inspect an apply preview before applying approved operations.")
          }
          const prepared = await prepareFreshApply(dependencies, input, state, decisions)
          const freshDigest = planMetadataSha256(prepared.plan)
          if (freshDigest !== displayedPreviewDigest) {
            state = await dependencies.persistRuleApplyPreview(
              prepared.state,
              prepared.decisions,
              prepared.plan
            )
            decisions = prepared.decisions
            preview = previewModel(prepared.plan, decisions, canonicalNow(dependencies.now()))
            displayedPreviewDigest = freshDigest
            staleWarning = ""
            status = "反映計画が変更されました。更新されたプレビューを確認してから反映してください。"
            render()
            return
          }
          await dependencies.validateDisplayedRuleApplyPreview(prepared.state, prepared.plan)
          const confirmation = await vscodeApi.window.showWarningMessage(
            "採用または編集した規約案を、承認済みのすべての成果物へ反映しますか？",
            { modal: true },
            APPLY_CONFIRMATION
          )
          if (confirmation !== APPLY_CONFIRMATION) return
          let transactionAttempted = false
          let finalOutcome:
            | {
                readonly kind: "changed"
                readonly state: RuleProposalTriageState
                readonly decisions: RuleProposalDecisionsV1
                readonly plan: RuleApplyPlan
                readonly digest: string
                readonly now: string
              }
            | {
                readonly kind: "recovered"
                readonly recovery: RuleAuthoringCommittedRecoveryResult
              }
            | {
                readonly kind: "committed"
                readonly state: RuleProposalTriageState
                readonly decisions: RuleProposalDecisionsV1
                readonly plan: RuleApplyPlan
                readonly digest: string
                readonly now: string
                readonly manifest: ApplyManifestV1
              }
          try {
            finalOutcome = await dependencies.withRuleApplyWorkspaceLock(
              input.workspaceRoot,
              input.runId,
              async (workspaceLockToken) => {
                const recovered = await dependencies.recoverCommittedRuleAuthoringApply(
                  input,
                  workspaceLockToken
                )
                if (recovered) return { kind: "recovered" as const, recovery: recovered }
                const confirmedPrepared = await prepareFreshApply(
                  dependencies,
                  input,
                  prepared.state,
                  prepared.decisions
                )
                const confirmedDigest = planMetadataSha256(confirmedPrepared.plan)
                const now = canonicalNow(dependencies.now())
                if (confirmedDigest !== displayedPreviewDigest) {
                  const persistedState = await dependencies.persistRuleApplyPreview(
                    confirmedPrepared.state,
                    confirmedPrepared.decisions,
                    confirmedPrepared.plan,
                    workspaceLockToken
                  )
                  return {
                    kind: "changed" as const,
                    state: persistedState,
                    decisions: confirmedPrepared.decisions,
                    plan: confirmedPrepared.plan,
                    digest: confirmedDigest,
                    now
                  }
                }
                await dependencies.validateDisplayedRuleApplyPreview(
                  confirmedPrepared.state,
                  confirmedPrepared.plan,
                  workspaceLockToken
                )
                const transactionId = validateRuleAuthoringId(
                  dependencies.newTransactionId(),
                  "transactionId"
                )
                transactionAttempted = true
                let manifest: ApplyManifestV1
                try {
                  manifest = await dependencies.executeRuleApplyTransaction(confirmedPrepared.plan, {
                    workspaceRoot: input.workspaceRoot,
                    transactionId,
                    now,
                    workspaceLockToken
                  })
                } catch (error) {
                  if (isPlainObject(error) && error.status === "rolled_back") {
                    await dependencies.invalidateRuleApplyPreview(input, workspaceLockToken)
                  }
                  throw error
                }
                await dependencies.persistRuleApplyCompletion(
                  confirmedPrepared.state,
                  confirmedPrepared.decisions,
                  confirmedPrepared.plan,
                  manifest,
                  workspaceLockToken
                )
                return {
                  kind: "committed" as const,
                  state: confirmedPrepared.state,
                  decisions: confirmedPrepared.decisions,
                  plan: confirmedPrepared.plan,
                  digest: confirmedDigest,
                  now,
                  manifest
                }
              }
            )
          } catch (error) {
            if (transactionAttempted) {
              await refreshAfterRecovery()
              if (settled) return
            }
            throw error
          }
          if (finalOutcome.kind === "recovered") {
            transaction = {
              transactionId: finalOutcome.recovery.transactionId,
              status: "committed",
              targetCount: TARGET_SPECS.length
            }
            status = "Recovered a committed apply before starting another transaction."
            render()
            finish({
              status: "applied",
              runId: finalOutcome.recovery.runId,
              transactionId: finalOutcome.recovery.transactionId
            })
            return
          }
          state = finalOutcome.state
          decisions = finalOutcome.decisions
          preview = previewModel(finalOutcome.plan, decisions, finalOutcome.now)
          displayedPreviewDigest = finalOutcome.digest
          if (finalOutcome.kind === "changed") {
            staleWarning = ""
            status = "確認中に反映計画が変更されました。更新されたプレビューを確認してから反映してください。"
            render()
            return
          }
          const manifest = finalOutcome.manifest
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
  const evidence: RuleApplyEvidence = { sourceManifest, selection, chunks }
  validateRuleApplyEvidence(evidence)
  const validationContext = assertStoredProposalValidation(
    parseJsonObject(validationRaw, "Proposal validation"),
    schema.proposal,
    run,
    evidence
  )
  const semantic = parseAndValidateRuleProposal(JSON.stringify(schema.proposal), validationContext)
  if (!semantic.valid) {
    const codes = semantic.issues.slice(0, 8).map(({ code, path: issuePath }) =>
      `${code}@${issuePath}`).join(",")
    throw new Error(`Stored rule proposal is not semantically valid (${codes})`)
  }
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
  return {
    run,
    proposal: semantic.proposal,
    validationContext,
    decisions,
    bundle,
    evidence
  }
}

export async function persistRuleProposalDecisions(
  state: RuleProposalTriageState,
  decisionsValue: RuleProposalDecisionsV1,
  workspaceLockToken?: RuleApplyWorkspaceLockToken
): Promise<RuleProposalTriageState> {
  return withRuleApplyWorkspaceLock(
    state.run.workspaceRoot,
    state.run.runId,
    async () => {
      const decisions = validateDecisionOverlayForPersistence(decisionsValue, state.proposal, false)
      const current = await currentMatchingRun(state)
      await assertRuleApplyMutationAllowed(current)
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
    },
    workspaceLockToken
  )
}

export async function persistRuleApplyPreview(
  state: RuleProposalTriageState,
  decisionsValue: RuleProposalDecisionsV1,
  plan: RuleApplyPlan,
  workspaceLockToken?: RuleApplyWorkspaceLockToken
): Promise<RuleProposalTriageState> {
  return withRuleApplyWorkspaceLock(
    state.run.workspaceRoot,
    state.run.runId,
    async () => {
      const decisions = validateDecisionOverlayForPersistence(decisionsValue, state.proposal, true)
      assertPlanMatchesState(plan, state)
      const current = await currentMatchingRun(state)
      await assertRuleApplyMutationAllowed(current)
      const generatedAt = timestampAfter(current.updatedAt)
      const storedPreview = await storedPreviewFromPlan(current, state.proposal, plan, decisions, generatedAt)
      const next = await commitRuleAuthoringArtifactGeneration({
        workspaceRoot: current.workspaceRoot,
        runId: current.runId,
        expectedUpdatedAt: current.updatedAt,
        files: {
          applyPreview: serializeJson(storedPreview)
        },
        buildNextRun: (run, artifacts) => ({
          ...applyInProgressRun(run, generatedAt),
          artifacts
        })
      })
      return { ...state, run: next, decisions }
    },
    workspaceLockToken
  )
}

export async function persistRuleApplyCompletion(
  state: RuleProposalTriageState,
  decisionsValue: RuleProposalDecisionsV1,
  plan: RuleApplyPlan,
  manifest: ApplyManifestV1,
  workspaceLockToken?: RuleApplyWorkspaceLockToken
): Promise<RuleAuthoringRunV1> {
  return withRuleApplyWorkspaceLock(
    state.run.workspaceRoot,
    state.run.runId,
    async () => {
      const decisions = validateDecisionOverlayForPersistence(decisionsValue, state.proposal, true)
      assertPlanMatchesState(plan, state)
      assertManifestMatchesPlan(manifest, plan)
      const current = await currentMatchingRun(state)
      await assertStoredApplyBinding(current, plan)
      const completionAt = timestampAfter(current.updatedAt, manifest.committed_at)
      return commitRuleAuthoringArtifactGeneration({
        workspaceRoot: current.workspaceRoot,
        runId: current.runId,
        expectedUpdatedAt: current.updatedAt,
        files: {
          applyManifest: serializeJson(manifest)
        },
        buildNextRun: (run, artifacts) => completedRun(run, artifacts, completionAt)
      })
    },
    workspaceLockToken
  )
}

export async function validateDisplayedRuleApplyPreview(
  state: RuleProposalTriageState,
  plan: RuleApplyPlan,
  workspaceLockToken?: RuleApplyWorkspaceLockToken
): Promise<void> {
  await withRuleApplyWorkspaceLock(
    state.run.workspaceRoot,
    state.run.runId,
    async () => {
      assertPlanMatchesState(plan, state)
      await assertStoredApplyBinding(state.run, plan)
    },
    workspaceLockToken
  )
}

export async function invalidateRuleApplyPreview(
  inputValue: RuleProposalTriageInput,
  workspaceLockToken?: RuleApplyWorkspaceLockToken
): Promise<RuleAuthoringRunV1> {
  const input = normalizeTriageInput(inputValue)
  return withRuleApplyWorkspaceLock(
    input.workspaceRoot,
    input.runId,
    async (activeToken) => {
      const state = await loadRuleProposalTriageState(input)
      if (state.run.currentPhase !== "apply" || state.run.phases.apply.status !== "in_progress") {
        throw new Error("Rule authoring apply preview can only be invalidated while apply is in progress")
      }
      if (state.run.artifacts.applyPreview === undefined) return state.run
      return (await persistRuleProposalDecisions(state, state.decisions, activeToken)).run
    },
    workspaceLockToken
  )
}

export async function verifyRuleAuthoringApply(
  inputValue: RuleProposalTriageInput
): Promise<RuleAuthoringApplyVerificationResult> {
  const input = normalizeTriageInput(inputValue)
  return withRuleApplyWorkspaceLock(input.workspaceRoot, input.runId, async (workspaceLockToken) => {
    let run = await readRuleAuthoringRun(getRuleAuthoringPaths(input.workspaceRoot, input.runId))
    if (run.currentPhase !== "completed") {
      await recoverCommittedRuleAuthoringApply(input, workspaceLockToken)
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
      status: "verified" as const,
      runId: run.runId,
      transactionId: manifest.transaction_id,
      targetCount: manifest.targets.length
    }
  })
}

export async function recoverCommittedRuleAuthoringApply(
  inputValue: RuleProposalTriageInput,
  workspaceLockToken?: RuleApplyWorkspaceLockToken
): Promise<RuleAuthoringCommittedRecoveryResult | undefined> {
  const input = normalizeTriageInput(inputValue)
  return withRuleApplyWorkspaceLock(
    input.workspaceRoot,
    input.runId,
    async () => {
      if ((await findIncompleteRuleApplyTransactions(input.workspaceRoot)).length > 0) {
        throw new Error("Incomplete rule apply transaction requires recovery")
      }
      const run = await readRuleAuthoringRun(getRuleAuthoringPaths(input.workspaceRoot, input.runId))
      const pending = await findPendingCommittedTransactionManifests(input.workspaceRoot)
      if (pending.some(({ run_id }) => run_id !== run.runId)) {
        throw new Error("Another authoring run has a committed apply that requires completion recovery")
      }
      if (run.currentPhase === "completed") {
        if (run.phases.completed.status !== "completed" || run.artifacts.applyManifest === undefined) {
          throw new Error("Completed rule authoring apply metadata is incomplete")
        }
        const manifest = validateApplyManifest(parseJsonObject(
          await readResolvedArtifact(
            run,
            "applyManifest",
            DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes
          ),
          "Apply manifest"
        ), run.runId)
        await verifyCommittedManifestForRun(run, manifest)
        return {
          status: "recovered" as const,
          runId: run.runId,
          transactionId: manifest.transaction_id
        }
      }
      if (run.artifacts.applyManifest !== undefined) {
        throw new Error("Rule authoring run phase is not completed but an apply manifest is attached")
      }
      const committed = pending.find(({ run_id }) => run_id === run.runId)
      if (run.currentPhase !== "apply" || run.phases.apply.status !== "in_progress") {
        if (committed) {
          throw new Error("Committed apply run state requires explicit recovery")
        }
        return undefined
      }
      try {
        if (!committed) return undefined
        await assertStoredApplyBinding(run, committed)
        await verifyCommittedManifestForRun(run, committed)
      } catch {
        throw new Error("Committed apply binding validation failed")
      }
      const completionAt = timestampAfter(run.updatedAt, committed.committed_at)
      await commitRuleAuthoringArtifactGeneration({
        workspaceRoot: run.workspaceRoot,
        runId: run.runId,
        expectedUpdatedAt: run.updatedAt,
        files: { applyManifest: serializeJson(committed) },
        buildNextRun: (current, artifacts) => completedRun(current, artifacts, completionAt)
      })
      return {
        status: "recovered" as const,
        runId: run.runId,
        transactionId: committed.transaction_id
      }
    },
    workspaceLockToken
  )
}

async function verifyCommittedManifestForRun(
  run: RuleAuthoringRunV1,
  manifest: ApplyManifestV1
): Promise<void> {
  requiredEvidenceArtifactPointer(run, "evidenceSelection")
  await assertStoredApplyBinding(run, manifest)
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
  const authoritativeSelection = parseJsonObject(
    await readResolvedArtifact(
      run,
      "evidenceSelection",
      DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes
    ),
    "Authoritative evidence selection"
  ) as unknown as RuleApplyEvidence["selection"]
  validateRuleApplyEvidence({
    sourceManifest: authoritativeSourceManifest,
    chunks: authoritativeChunks,
    selection: authoritativeSelection
  })
  verifyCurrentRunProvenanceAgainstChunks(
    run.runId,
    manifest,
    requiredBytes(verifiedBytes, "rule_sources"),
    requiredBytes(verifiedBytes, "rule_provenance"),
    authoritativeSourceManifest,
    authoritativeChunks
  )
  await assertVerifiedTargetSnapshotCurrent(run, manifest, verifiedBytes)
}

async function assertVerifiedTargetSnapshotCurrent(
  run: RuleAuthoringRunV1,
  manifest: ApplyManifestV1,
  verifiedBytes: ReadonlyMap<string, Buffer>
): Promise<void> {
  for (const [index, [asset, relativePath]] of TARGET_SPECS.entries()) {
    let current: Buffer
    try {
      current = await readWorkspaceFileBounded(
        run.workspaceRoot,
        path.join(run.workspaceRoot, ...relativePath.split("/")),
        MAX_ARTIFACT_BYTES,
        false
      ) as Buffer
    } catch {
      throw new Error("Rule authoring target snapshot changed during verification")
    }
    if (
      sha256(current) !== manifest.targets[index].post_image_sha256 ||
      !current.equals(requiredBytes(verifiedBytes, asset))
    ) {
      throw new Error("Rule authoring target snapshot changed during verification")
    }
  }
}

async function findPendingCommittedTransactionManifests(
  workspaceRoot: string
): Promise<ApplyManifestV1[]> {
  const pending: ApplyManifestV1[] = []
  for (const manifest of await findCommittedTransactionManifests(workspaceRoot)) {
    const run = await readRuleAuthoringRun(getRuleAuthoringPaths(workspaceRoot, manifest.run_id))
    if (run.currentPhase !== "completed") {
      pending.push(manifest)
      continue
    }
    if (run.phases.completed.status !== "completed" || run.artifacts.applyManifest === undefined) {
      throw new Error("Completed rule authoring apply metadata is incomplete")
    }
    const attached = validateApplyManifest(parseJsonObject(
      await readResolvedArtifact(
        run,
        "applyManifest",
        DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes
      ),
      "Attached apply manifest"
    ), run.runId)
    if (stableJson(attached) !== stableJson(manifest)) {
      throw new Error("Committed apply binding does not match the completed transaction")
    }
  }
  return pending
}

async function findCommittedTransactionManifests(
  workspaceRoot: string
): Promise<ApplyManifestV1[]> {
  const paths = getRuleAuthoringPaths(workspaceRoot, "transaction-probe")
  let stats
  try {
    stats = await fs.lstat(paths.transactionsDirectory)
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return []
    throw error
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error("Rule authoring transaction directory is unsafe")
  }
  await assertSafeParentChain(workspaceRoot, paths.transactionsDirectory)
  const entries = await fs.readdir(paths.transactionsDirectory, { withFileTypes: true })
  if (entries.length > MAX_TRANSACTION_ENTRIES) {
    throw new Error("Rule authoring transaction count exceeds its limit")
  }
  const matches: ApplyManifestV1[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !isPortableId(entry.name)) continue
    const directory = path.join(paths.transactionsDirectory, entry.name)
    const journalBytes = await readWorkspaceFileBounded(
      workspaceRoot,
      path.join(directory, "transaction-journal.json"),
      MAX_ARTIFACT_BYTES,
      true
    )
    if (!journalBytes) continue
    const journal = parseJsonObject(
      decodeUtf8(journalBytes, "Apply transaction journal"),
      "Apply transaction journal"
    )
    if (journal.status !== "committed") continue
    if (
      journal.schema_version !== RULE_APPLY_TRANSACTION_SCHEMA_VERSION ||
      journal.transaction_id !== entry.name ||
      typeof journal.run_id !== "string" ||
      !Array.isArray(journal.targets) ||
      !Array.isArray(journal.decisions) ||
      !Array.isArray(journal.retirements)
    ) {
      throw new Error("Committed apply transaction journal is malformed")
    }
    try {
      validateRuleAuthoringId(journal.run_id, "runId")
    } catch {
      throw new Error("Committed apply transaction run ID is malformed")
    }
    try {
      validateRuleApplyMetadata(journal.decisions, journal.retirements)
    } catch {
      throw new Error("Committed apply transaction journal decision or retirement metadata is malformed")
    }
    const manifestBytes = await readWorkspaceFileBounded(
      workspaceRoot,
      path.join(directory, "apply-manifest.json"),
      DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes,
      true
    )
    let manifest: ApplyManifestV1
    if (manifestBytes) {
      manifest = validateApplyManifest(
        parseJsonObject(decodeUtf8(manifestBytes, "Apply manifest"), "Apply manifest"),
        journal.run_id
      )
    } else {
      const completedRun = await readRuleAuthoringRun(
        getRuleAuthoringPaths(workspaceRoot, journal.run_id)
      )
      if (
        completedRun.currentPhase !== "completed" ||
        completedRun.phases.completed.status !== "completed" ||
        completedRun.artifacts.applyManifest === undefined
      ) {
        throw new Error("Committed apply transaction manifest is missing")
      }
      manifest = validateApplyManifest(parseJsonObject(
        await readResolvedArtifact(
          completedRun,
          "applyManifest",
          DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes
        ),
        "Attached apply manifest"
      ), journal.run_id)
    }
    if (
      manifest.transaction_id !== entry.name ||
      !journalTargetsMatchManifest(journal.targets, manifest) ||
      !ruleApplyMetadataEquals(
        journal.decisions,
        journal.retirements,
        manifest.decisions,
        manifest.retirements
      )
    ) {
      throw new Error("Committed apply binding does not match its transaction manifest")
    }
    matches.push(manifest)
  }
  const counts = new Map<string, number>()
  for (const { run_id } of matches) counts.set(run_id, (counts.get(run_id) ?? 0) + 1)
  if ([...counts.values()].some((count) => count > 1)) {
    throw new Error("Multiple committed apply transactions require explicit recovery")
  }
  return matches.sort((left, right) => left.transaction_id < right.transaction_id
    ? -1
    : left.transaction_id > right.transaction_id ? 1 : 0)
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
      label: "チェックリスト規約",
      operations: proposal.operations.map((operation) =>
        operationModel(state, decisions, operation, "rule"))
    },
    {
      asset: "project_context",
      label: "プロジェクト情報",
      operations: proposal.project_context_operations.map((operation) =>
        operationModel(state, decisions, operation, "project_context"))
    },
    {
      asset: "prompt_addendum",
      label: "レビュープロンプトの補足",
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
    canApply: decisionsComplete && recovery.length === 0 && preview !== undefined,
    staleWarning,
    status,
    recovery: recovery.map((item) => ({
      transactionId: item.transaction_id,
      status: item.status,
      recoveryAction: item.recovery_action
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
    recovery: recovery.map((item) => ({
      transactionId: item.transaction_id,
      status: item.status,
      recoveryAction: item.recovery_action
    }))
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
  const existingSummary = existingOperationSummary(state.bundle, operation, asset)
  const proposedSummary = proposedOperationSummary(operation, effectiveRule, effectiveMarkdown)
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
    existingSummary: existingSummary.text,
    proposedSummary: proposedSummary.text,
    existingSummaryTruncated: existingSummary.truncated,
    proposedSummaryTruncated: proposedSummary.truncated,
    comparisonAvailable: true,
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

interface OperationComparisonSummary {
  text: string
  truncated: boolean
}

function existingOperationSummary(
  bundle: RuleApplyBundle,
  operation: RuleProposalOperationV1 | ProposedMarkdownOperationV1,
  asset: "rule" | "project_context" | "prompt_addendum"
): OperationComparisonSummary {
  return comparisonSummary(fullExistingOperationValue(bundle, operation, asset))
}

function proposedOperationSummary(
  operation: RuleProposalOperationV1 | ProposedMarkdownOperationV1,
  effectiveRule: RuleProposalRuleV1 | null | undefined,
  effectiveMarkdown: RuleApplyEditedMarkdown | undefined
): OperationComparisonSummary {
  if (operation.operation === "retire") return comparisonSummary("Retire the existing approved item.")
  if (isRuleOperation(operation)) {
    return comparisonSummary(effectiveRule
      ? approvedRuleSummary(effectiveRule)
      : "Proposed rule is unavailable.")
  }
  return comparisonSummary(effectiveMarkdown
    ? `${effectiveMarkdown.heading}\n${effectiveMarkdown.markdown}`
    : "Proposed section is unavailable.")
}

function approvedRuleSummary(rule: Record<string, unknown> | RuleProposalRuleV1): string {
  const value = {
    category: typeof rule.category === "string" ? rule.category : "",
    title: typeof rule.title === "string" ? rule.title : "",
    description: typeof rule.description === "string" ? rule.description : "",
    severity_on_fail: typeof rule.severity_on_fail === "string" ? rule.severity_on_fail : "",
    applies_when: Array.isArray(rule.applies_when)
      ? rule.applies_when.filter((item): item is string => typeof item === "string")
      : [],
    evidence_required: rule.evidence_required === true,
    review_hint: typeof rule.review_hint === "string" ? rule.review_hint : ""
  }
  return JSON.stringify(value, null, 2)
}

function comparisonSummary(value: string): OperationComparisonSummary {
  return {
    text: safeDisplay(value, 8_192),
    truncated: Buffer.byteLength(value, "utf8") > 8_192
  }
}

function buildFullComparisonDocument(
  state: RuleProposalTriageState,
  decisions: RuleProposalDecisionsV1,
  operation: RuleProposalOperationV1 | ProposedMarkdownOperationV1
): string {
  const decision = decisions.decisions[operation.candidate_id]
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
  const asset = isRuleOperation(operation)
    ? "rule"
    : state.proposal.project_context_operations.some(({ candidate_id }) =>
        candidate_id === operation.candidate_id)
      ? "project_context"
      : "prompt_addendum"
  const existing = fullExistingOperationValue(state.bundle, operation, asset)
  const proposed = operation.operation === "retire"
    ? "Retire the existing approved item."
    : isRuleOperation(operation)
      ? effectiveRule ? approvedRuleSummary(effectiveRule) : "Proposed rule is unavailable."
      : effectiveMarkdown
        ? `${effectiveMarkdown.heading}\n${effectiveMarkdown.markdown}`
        : "Proposed section is unavailable."
  return [
    "# Full existing-versus-proposed comparison",
    "",
    `Candidate: ${operation.candidate_id}`,
    `Operation: ${operation.operation}`,
    "",
    "## Existing approved",
    "",
    "<<<BOB_EXISTING_COMPARISON>>>",
    labelComparisonPayload("EXISTING", existing),
    "<<<END_BOB_EXISTING_COMPARISON>>>",
    "",
    "## Proposed",
    "",
    "<<<BOB_PROPOSED_COMPARISON>>>",
    labelComparisonPayload("PROPOSED", proposed),
    "<<<END_BOB_PROPOSED_COMPARISON>>>"
  ].join("\n")
}

function labelComparisonPayload(label: "EXISTING" | "PROPOSED", value: string): string {
  return value.replace(/\r\n|\r/g, "\n").replace(/^/gm, `${label} | `)
}

function fullExistingOperationValue(
  bundle: RuleApplyBundle,
  operation: RuleProposalOperationV1 | ProposedMarkdownOperationV1,
  asset: "rule" | "project_context" | "prompt_addendum"
): string {
  if (operation.operation === "add") return "No existing approved item (new addition)."
  try {
    if (asset === "rule" && isRuleOperation(operation)) {
      if (bundle.checklist?.state !== "present") return "Existing approved rule is unavailable."
      const parsed = JSON.parse(decodeUtf8(bundle.checklist.bytes, "Approved checklist")) as unknown
      if (!isPlainObject(parsed) || !Array.isArray(parsed.rules)) {
        return "Existing approved rule is unavailable."
      }
      const rule = parsed.rules.find((value): value is Record<string, unknown> =>
        isPlainObject(value) && value.id === operation.target_rule_id)
      return rule ? approvedRuleSummary(rule) : "Existing approved rule is unavailable."
    }
    if (!isRuleOperation(operation)) {
      const current = asset === "project_context" ? bundle.projectContext : bundle.promptAddendum
      if (current?.state !== "present") return "Existing approved section is unavailable."
      const kind = asset === "project_context" ? "CTX" : "PRM"
      const parsed = parseManagedMarkdown(decodeUtf8(current.bytes, "Approved managed Markdown"), kind)
      const section = parsed.sections.find(({ id }) => id === operation.target_section_id)
      return section
        ? `${section.heading}\n${section.markdown}`
        : "Existing approved section is unavailable."
    }
  } catch {
    return asset === "rule"
      ? "Existing approved rule is unavailable."
      : "Existing approved section is unavailable."
  }
  return "Existing approved item is unavailable."
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
    generatedAt,
    planDigest: planMetadataSha256(plan)
  }
}

async function storedPreviewFromPlan(
  run: RuleAuthoringRunV1,
  proposal: RuleProposalV1,
  plan: RuleApplyPlan,
  decisions: RuleProposalDecisionsV1,
  generatedAt: string
): Promise<StoredApplyPreviewV1> {
  const artifacts = await loadBoundHumanReviewArtifacts(run)
  if (
    stableJson(artifacts.proposal) !== stableJson(proposal) ||
    stableJson(artifacts.decisions) !== stableJson(decisions)
  ) {
    throw new Error("Stored Human Triage artifacts changed before apply preview persistence")
  }
  const summary = previewModel(plan, decisions, generatedAt)
  return {
    schema_version: RULE_APPLY_PREVIEW_SCHEMA_VERSION,
    run_id: plan.run_id,
    generated_at: generatedAt,
    targets: plan.targets.map((target) => ({
      asset: target.asset,
      path: target.path,
      expected_pre_image: structuredClone(target.expected_pre_image),
      post_image_sha256: target.post_image_sha256
    })),
    decision_summary: {
      accepted: summary.acceptedCount,
      edited: summary.editedCount,
      rejected: summary.rejectedCount
    },
    binding: {
      proposal_artifact: requiredArtifactPointer(run, "ruleProposal"),
      proposal_sha256: canonicalValueSha256(artifacts.proposal),
      proposal_validation_artifact: requiredArtifactPointer(run, "proposalValidation"),
      proposal_validation_sha256: canonicalValueSha256(artifacts.validation),
      proposal_decisions_artifact: requiredArtifactPointer(run, "proposalDecisions"),
      proposal_decisions_sha256: canonicalValueSha256(artifacts.decisions),
      plan_metadata_sha256: planMetadataSha256(plan)
    }
  }
}

async function assertStoredApplyBinding(
  run: RuleAuthoringRunV1,
  plan: Pick<RuleApplyPlan, "run_id" | "targets" | "decisions" | "retirements"> |
    Pick<ApplyManifestV1, "run_id" | "targets" | "decisions" | "retirements">
): Promise<void> {
  const artifacts = await loadBoundHumanReviewArtifacts(run)
  const preview = parseStoredApplyPreview(
    parseJsonObject(
      await readResolvedArtifact(run, "applyPreview", DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes),
      "Apply preview"
    ),
    run,
    artifacts.decisions
  )
  const expectedTargets = canonicalPlanTargets(plan.targets)
  if (
    preview.binding.proposal_sha256 !== canonicalValueSha256(artifacts.proposal) ||
    preview.binding.proposal_validation_sha256 !== canonicalValueSha256(artifacts.validation) ||
    preview.binding.proposal_decisions_sha256 !== canonicalValueSha256(artifacts.decisions) ||
    preview.binding.plan_metadata_sha256 !== planMetadataSha256(plan) ||
    stableJson(preview.targets) !== stableJson(expectedTargets)
  ) {
    throw new Error("Committed apply binding does not match its Human Triage artifacts")
  }
}

async function loadBoundHumanReviewArtifacts(run: RuleAuthoringRunV1): Promise<{
  proposal: RuleProposalV1
  validation: Record<string, unknown>
  decisions: RuleProposalDecisionsV1
}> {
  requiredArtifactPointer(run, "ruleProposal")
  requiredArtifactPointer(run, "proposalValidation")
  requiredArtifactPointer(run, "proposalDecisions")
  const proposalValue = parseJsonObject(
    await readResolvedArtifact(run, "ruleProposal", DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes),
    "Stored rule proposal"
  )
  const schema = validateRuleProposalSchema(proposalValue)
  if (!schema.valid || schema.proposal.run_id !== run.runId) {
    throw new Error("Committed apply binding proposal is malformed")
  }
  const selection = parseJsonObject(
    await readResolvedArtifact(run, "evidenceSelection", DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes),
    "Evidence selection"
  ) as unknown as RuleApplyEvidence["selection"]
  const sourceManifest = parseJsonObject(
    await readResolvedArtifact(run, "sourceManifest", DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes),
    "Rule source manifest"
  ) as unknown as RuleSourceManifestV1
  const chunks = parseDocumentChunks(await readResolvedArtifact(
    run,
    "documentChunks",
    DEFAULT_RULE_AUTHORING_LIMITS.maxAggregateSourceBytes
  ))
  const evidence: RuleApplyEvidence = { sourceManifest, selection, chunks }
  validateRuleApplyEvidence(evidence)
  const validation = parseJsonObject(
    await readResolvedArtifact(run, "proposalValidation", DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes),
    "Proposal validation"
  )
  const context = assertStoredProposalValidation(validation, schema.proposal, run, evidence)
  const semantic = parseAndValidateRuleProposal(JSON.stringify(schema.proposal), context)
  if (!semantic.valid) throw new Error("Committed apply binding proposal validation is invalid")
  const decisions = validateDecisionOverlayForPersistence(
    parseJsonObject(
      await readResolvedArtifact(run, "proposalDecisions", DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes),
      "Proposal decisions"
    ) as unknown as RuleProposalDecisionsV1,
    semantic.proposal,
    true
  )
  return { proposal: semantic.proposal, validation, decisions }
}

function parseStoredApplyPreview(
  value: unknown,
  run: RuleAuthoringRunV1,
  decisions: RuleProposalDecisionsV1
): StoredApplyPreviewV1 {
  if (
    !isPlainObject(value) ||
    !hasOnlyKeys(value, [
      "schema_version",
      "run_id",
      "generated_at",
      "targets",
      "decision_summary",
      "binding"
    ]) ||
    value.schema_version !== RULE_APPLY_PREVIEW_SCHEMA_VERSION ||
    value.run_id !== run.runId ||
    !isCanonicalTimestamp(value.generated_at) ||
    !Array.isArray(value.targets) ||
    value.targets.length !== TARGET_SPECS.length ||
    !isPlainObject(value.decision_summary) ||
    !hasOnlyKeys(value.decision_summary, ["accepted", "edited", "rejected"]) ||
    !isPlainObject(value.binding) ||
    !hasOnlyKeys(value.binding, [
      "proposal_artifact",
      "proposal_sha256",
      "proposal_validation_artifact",
      "proposal_validation_sha256",
      "proposal_decisions_artifact",
      "proposal_decisions_sha256",
      "plan_metadata_sha256"
    ])
  ) {
    throw new Error("Committed apply binding preview is malformed")
  }
  for (const [index, target] of value.targets.entries()) {
    const [asset, targetPath] = TARGET_SPECS[index]
    if (
      !isPlainObject(target) ||
      !hasOnlyKeys(target, ["asset", "path", "expected_pre_image", "post_image_sha256"]) ||
      target.asset !== asset ||
      target.path !== targetPath ||
      !isExpectedPreImage(target.expected_pre_image) ||
      !SHA256.test(String(target.post_image_sha256))
    ) throw new Error("Committed apply binding preview target is malformed")
  }
  const values = Object.values(decisions.decisions)
  const expectedSummary = {
    accepted: values.filter(({ decision }) => decision === "accept").length,
    edited: values.filter(({ decision }) => decision === "edit").length,
    rejected: values.filter(({ decision }) => decision === "reject").length
  }
  if (
    !Object.values(value.decision_summary).every((item) =>
      Number.isSafeInteger(item) && Number(item) >= 0 && Number(item) <= 400) ||
    stableJson(value.decision_summary) !== stableJson(expectedSummary) ||
    value.binding.proposal_artifact !== requiredArtifactPointer(run, "ruleProposal") ||
    value.binding.proposal_validation_artifact !== requiredArtifactPointer(run, "proposalValidation") ||
    value.binding.proposal_decisions_artifact !== requiredArtifactPointer(run, "proposalDecisions") ||
    !SHA256.test(String(value.binding.proposal_sha256)) ||
    !SHA256.test(String(value.binding.proposal_validation_sha256)) ||
    !SHA256.test(String(value.binding.proposal_decisions_sha256)) ||
    !SHA256.test(String(value.binding.plan_metadata_sha256))
  ) {
    throw new Error("Committed apply binding preview does not match its artifact pointers")
  }
  return structuredClone(value) as unknown as StoredApplyPreviewV1
}

function requiredArtifactPointer(
  run: RuleAuthoringRunV1,
  key: "ruleProposal" | "proposalValidation" | "proposalDecisions" | "applyPreview"
): string {
  const value = run.artifacts[key]
  if (value === undefined) throw new Error(`Committed apply binding ${key} artifact is missing`)
  return value
}

function planMetadataSha256(
  value: Pick<RuleApplyPlan, "run_id" | "targets" | "decisions" | "retirements"> |
    Pick<ApplyManifestV1, "run_id" | "targets" | "decisions" | "retirements">
): string {
  const metadata = validateRuleApplyMetadata(value.decisions, value.retirements)
  return canonicalValueSha256({
    schema_version: "bob-bazaar-review/rule-apply-plan-metadata/v1",
    run_id: value.run_id,
    targets: canonicalPlanTargets(value.targets),
    decisions: metadata.decisions,
    retirements: metadata.retirements
  })
}

function canonicalPlanTargets(
  targets: readonly {
    asset: string
    path: string
    expected_pre_image: unknown
    post_image_sha256: string
  }[]
): StoredApplyPreviewV1["targets"] {
  if (targets.length !== TARGET_SPECS.length) throw new Error("Apply plan target metadata is malformed")
  return targets.map((target, index) => {
    const [asset, targetPath] = TARGET_SPECS[index]
    if (
      target.asset !== asset ||
      target.path !== targetPath ||
      !isExpectedPreImage(target.expected_pre_image) ||
      !SHA256.test(String(target.post_image_sha256))
    ) throw new Error("Apply plan target metadata is malformed")
    return {
      asset,
      path: targetPath,
      expected_pre_image: structuredClone(target.expected_pre_image),
      post_image_sha256: target.post_image_sha256
    }
  })
}

function canonicalValueSha256(value: unknown): string {
  return sha256(Buffer.from(stableJson(value), "utf8"))
}

function assertStoredProposalValidation(
  value: unknown,
  proposal: RuleProposalV1,
  run: Pick<RuleAuthoringRunV1, "runId" | "artifacts">,
  evidence: RuleApplyEvidence
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
      "validation_context",
      "evidence_binding"
    ]) ||
    value.schema_version !== RULE_PROPOSAL_VALIDATION_ARTIFACT_SCHEMA_VERSION ||
    value.run_id !== proposal.run_id ||
    value.valid !== true ||
    !Array.isArray(value.issues) ||
    value.issues.length !== 0 ||
    !isCanonicalTimestamp(value.validated_at) ||
    value.proposal_sha256 !== sha256(Buffer.from(JSON.stringify(proposal), "utf8")) ||
    !isPlainObject(value.validation_context) ||
    !isPlainObject(value.evidence_binding) ||
    !hasOnlyKeys(value.evidence_binding, [
      "source_manifest",
      "document_chunks",
      "evidence_selection",
      "selected_evidence"
    ]) ||
    !Array.isArray(value.evidence_binding.selected_evidence)
  ) {
    throw new Error("Stored rule proposal does not have a valid validation record")
  }
  const context = structuredClone(value.validation_context) as unknown as RuleProposalValidationContext
  const expectedEvidence = evidence.selection.selected_chunks.map((item) => ({
    source_id: item.source_id,
    chunk_id: item.chunk_id
  }))
  const expectedSelectedEvidence = evidence.selection.selected_chunks.map((item) => ({
    source_id: item.source_id,
    chunk_id: item.chunk_id,
    text_sha256: item.text_sha256
  }))
  const binding = value.evidence_binding
  if (
    context.runId !== proposal.run_id ||
    stableJson(context.selectedEvidence) !== stableJson(expectedEvidence) ||
    !storedEvidenceBindingMatches(
      binding.source_manifest,
      requiredEvidenceArtifactPointer(run, "sourceManifest"),
      evidence.sourceManifest
    ) ||
    !storedEvidenceBindingMatches(
      binding.document_chunks,
      requiredEvidenceArtifactPointer(run, "documentChunks"),
      evidence.chunks
    ) ||
    !storedEvidenceBindingMatches(
      binding.evidence_selection,
      requiredEvidenceArtifactPointer(run, "evidenceSelection"),
      evidence.selection
    ) ||
    stableJson(binding.selected_evidence) !== stableJson(expectedSelectedEvidence)
  ) {
    throw new Error("Stored rule proposal validation context is not bound to selected evidence")
  }
  parseAndValidateRuleProposal(JSON.stringify(proposal), context)
  return context
}

function storedEvidenceBindingMatches(
  value: unknown,
  artifact: string,
  evidenceValue: unknown
): boolean {
  return isPlainObject(value) &&
    hasOnlyKeys(value, ["artifact", "sha256"]) &&
    value.artifact === artifact &&
    value.sha256 === canonicalValueSha256(evidenceValue)
}

function requiredEvidenceArtifactPointer(
  run: Pick<RuleAuthoringRunV1, "artifacts">,
  key: "sourceManifest" | "documentChunks" | "evidenceSelection"
): string {
  const value = run.artifacts[key]
  if (value === undefined) throw new Error(`Rule proposal validation ${key} artifact is missing`)
  return value
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
  validationContext: RuleProposalValidationContext,
  operation: RuleProposalOperationV1,
  editedRule: RuleProposalRuleV1
): void {
  const candidate = structuredClone(proposal)
  const target = candidate.operations.find(({ candidate_id }) => candidate_id === operation.candidate_id)
  if (!target) throw new SafeTriageError("The stored proposal operation is unavailable.")
  target.rule = structuredClone(editedRule)
  const result = parseAndValidateRuleProposal(JSON.stringify(candidate), validationContext)
  if (!result.valid) {
    throw new SafeTriageError("The edited rule does not match the validated semantic rule contract.")
  }
}

function assertEditedMarkdownAgainstProposal(
  proposal: RuleProposalV1,
  validationContext: RuleProposalValidationContext,
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
  const result = parseAndValidateRuleProposal(JSON.stringify(candidate), validationContext)
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
  if (current.updatedAt !== state.run.updatedAt) {
    throw new Error("Rule authoring run changed since it was loaded")
  }
  for (const key of [
    "ruleProposal",
    "proposalValidation",
    "proposalDecisions",
    "applyPreview"
  ] as const) {
    if (current.artifacts[key] !== state.run.artifacts[key]) {
      throw new Error("Stored Human Triage artifacts changed while Human Triage was open")
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

async function assertRuleApplyMutationAllowed(run: RuleAuthoringRunV1): Promise<void> {
  if ((await findIncompleteRuleApplyTransactions(run.workspaceRoot)).length > 0) {
    throw new Error("Transaction recovery is required before changing Human Triage artifacts")
  }
  if ((await findPendingCommittedTransactionManifests(run.workspaceRoot)).length > 0) {
    throw new Error("Committed apply completion recovery is required before changing Human Triage artifacts")
  }
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
    const beforePath = await fs.lstat(filePath, { bigint: true })
    if (beforePath.isSymbolicLink() || !beforePath.isFile() || beforePath.size > BigInt(maxBytes)) {
      throw new Error("Rule authoring file is not a bounded regular file")
    }
    handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
    const before = await handle.stat({ bigint: true })
    if (
      !before.isFile() ||
      before.size > BigInt(maxBytes) ||
      !sameBoundedReadIdentity(beforePath, before)
    ) throw new Error("Rule authoring file changed before it was read")
    const bytes = await handle.readFile()
    const after = await handle.stat({ bigint: true })
    const afterPath = await fs.lstat(filePath, { bigint: true })
    if (
      bytes.byteLength > maxBytes ||
      afterPath.isSymbolicLink() ||
      !afterPath.isFile() ||
      after.size !== BigInt(bytes.byteLength) ||
      !sameBoundedReadIdentity(before, after) ||
      !sameBoundedReadIdentity(after, afterPath)
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

function sameBoundedReadIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
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
  let metadata
  try {
    metadata = validateRuleApplyMetadata(value.decisions, value.retirements)
  } catch {
    throw new Error("Rule authoring committed apply manifest decision or retirement metadata is malformed")
  }
  return {
    ...structuredClone(value),
    decisions: metadata.decisions,
    retirements: metadata.retirements
  } as unknown as ApplyManifestV1
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
      assertAuthoritativeDecisionRef(ref, authoritative)
    }
  }
}

function assertAuthoritativeDecisionRef(
  value: unknown,
  chunks: ReadonlyMap<string, { locator: unknown; textSha256: string }>
): void {
  if (
    !isPlainObject(value) ||
    !hasOnlyKeys(value, ["source_id", "chunk_id"]) ||
    typeof value.source_id !== "string" ||
    typeof value.chunk_id !== "string" ||
    !chunks.has(`${value.source_id}\u0000${value.chunk_id}`)
  ) {
    throw new Error("Rule apply decision source reference is not authoritative")
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

export function parseDocumentChunks(raw: string): DocumentChunkV1[] {
  let count = 0
  forEachDocumentChunkLine(raw, () => {
    count += 1
    if (count > MAX_DOCUMENT_CHUNKS) {
      throw new Error("Document chunk count exceeds its limit")
    }
  })
  const chunks: DocumentChunkV1[] = []
  forEachDocumentChunkLine(raw, (line) => {
    chunks.push(parseJsonObject(line, "Document chunk") as unknown as DocumentChunkV1)
  })
  return chunks
}

function forEachDocumentChunkLine(raw: string, visit: (line: string) => void): void {
  let start = 0
  for (let index = 0; index <= raw.length; index += 1) {
    if (index !== raw.length && raw.charCodeAt(index) !== 0x0a) continue
    let end = index
    if (end > start && raw.charCodeAt(end - 1) === 0x0d) end -= 1
    if (end > start) visit(raw.slice(start, end))
    start = index + 1
  }
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
    !hasUtf8ByteLength(value.category, RULE_AUTHORING_TEXT_BYTE_LIMITS.category, { nonEmpty: true }) ||
    !hasUtf8ByteLength(value.title, RULE_AUTHORING_TEXT_BYTE_LIMITS.title, { nonEmpty: true }) ||
    !hasUtf8ByteLength(value.description, RULE_AUTHORING_TEXT_BYTE_LIMITS.description, { nonEmpty: true }) ||
    (value.severity_on_fail !== "error" && value.severity_on_fail !== "warning" &&
      value.severity_on_fail !== "info") ||
    !Array.isArray(value.applies_when) ||
    value.applies_when.length > 32 ||
    value.applies_when.some((item) =>
      !hasUtf8ByteLength(item, RULE_AUTHORING_TEXT_BYTE_LIMITS.appliesWhen)) ||
    typeof value.evidence_required !== "boolean" ||
    !hasUtf8ByteLength(value.review_hint, RULE_AUTHORING_TEXT_BYTE_LIMITS.reviewHint)
  ) return false
  return !containsDisallowedControl(value)
}

function isEditedMarkdown(value: unknown): value is RuleApplyEditedMarkdown {
  return isPlainObject(value) &&
    hasOnlyKeys(value, ["heading", "markdown"]) &&
    hasUtf8ByteLength(value.heading, RULE_AUTHORING_TEXT_BYTE_LIMITS.markdownHeading, { nonEmpty: true }) &&
    value.heading.trim().length > 0 &&
    !/[\r\n]/.test(value.heading) &&
    !/bob-managed-section/i.test(value.heading) &&
    hasUtf8ByteLength(value.markdown, RULE_AUTHORING_TEXT_BYTE_LIMITS.managedMarkdown) &&
    !/bob-managed-section/i.test(value.markdown) &&
    !containsDisallowedControl(value)
}

function isRejectReason(value: unknown): value is string {
  return hasUtf8ByteLength(value, RULE_AUTHORING_TEXT_BYTE_LIMITS.rejectReason) &&
    !ANY_CONTROL_CHARACTER.test(value)
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
      target.post_image_sha256 !== plan.targets[index].post_image_sha256 ||
      stableJson(target.expected_pre_image) !== stableJson(plan.targets[index].expected_pre_image)) ||
    !ruleApplyMetadataEquals(
      manifest.decisions,
      manifest.retirements,
      plan.decisions,
      plan.retirements
    )
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
  if (run.currentPhase !== "apply" || run.phases.apply.status !== "in_progress") {
    throw new Error("Rule authoring apply phase is not in progress")
  }
  return {
    ...run,
    currentPhase: "completed",
    phases: {
      ...structuredClone(run.phases),
      apply: {
        status: "completed",
        startedAt: run.phases.apply.startedAt ?? completionAt,
        completedAt: completionAt
      },
      completed: {
        status: "completed",
        startedAt: completionAt,
        completedAt: completionAt
      }
    },
    artifacts,
    updatedAt: completionAt
  }
}

function applyInProgressRun(run: RuleAuthoringRunV1, updatedAt: string): RuleAuthoringRunV1 {
  if (run.currentPhase !== "human_review" && run.currentPhase !== "apply") {
    throw new Error("Rule authoring run cannot enter apply from its current phase")
  }
  const phases = structuredClone(run.phases)
  if (run.currentPhase === "human_review") {
    phases.human_review = {
      status: "completed",
      startedAt: run.phases.human_review.startedAt ?? updatedAt,
      completedAt: updatedAt
    }
  }
  phases.apply = {
    status: "in_progress",
    startedAt: run.phases.apply.startedAt ?? updatedAt
  }
  phases.completed = { status: "not_started" }
  return {
    ...run,
    currentPhase: "apply",
    phases,
    updatedAt
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
    throw new Error("規約案の確認・採否を開くには VS Code API が必要です")
  }
}

function optionalVscode(): typeof import("vscode") | undefined {
  try {
    return require("vscode") as typeof import("vscode")
  } catch {
    return undefined
  }
}
