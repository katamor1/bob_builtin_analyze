import { createHash, randomBytes } from "node:crypto"
import { constants as fsConstants, Stats } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { getProjectRulesPaths } from "../projectRules/io"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "./ruleAuthoringLimits"
import { getRuleAuthoringPaths, validateRuleAuthoringId } from "./ruleAuthoringPaths"
import { RULE_AUTHORING_TEXT_BYTE_LIMITS } from "./ruleAuthoringTextLimits"
import { withRuleAuthoringRotatingDirectoryLock } from "./ruleAuthoringRunStore"
import {
  RULE_APPLY_PLAN_SCHEMA_VERSION,
  RuleApplyAsset,
  RuleApplyDecisionRecordV1,
  RuleApplyExpectedPreImage,
  RuleApplyPlan,
  RuleApplyPlanTarget,
  RuleApplyRetirementV1
} from "./ruleApplyPlan"

export const RULE_APPLY_TRANSACTION_SCHEMA_VERSION = "bob-bazaar-review/rule-apply-transaction/v1" as const
export const APPLY_MANIFEST_SCHEMA_VERSION = "bob-bazaar-review/apply-manifest/v1" as const

export type RuleApplyTransactionStatus =
  | "prepared"
  | "applying"
  | "rolling_back"
  | "rolled_back"
  | "rollback_failed"
  | "committed"

export type RuleApplyTargetStatus = "prepared" | "replaced" | "restored"

export type RuleApplyFaultOperation =
  | "journal_persisted"
  | "stage_target"
  | "backup_target"
  | "replace_target"
  | "restore_target"
  | "commit_manifest"
  | "manifest_persisted"

export interface RuleApplyFaultEvent {
  readonly operation: RuleApplyFaultOperation
  readonly transactionId: string
  readonly status: RuleApplyTransactionStatus
  readonly asset?: RuleApplyAsset
  readonly index?: number
}

export type RuleApplyFaultInjector = (event: RuleApplyFaultEvent) => void | Promise<void>

const RULE_APPLY_WORKSPACE_LOCK_TOKEN: unique symbol = Symbol("ruleApplyWorkspaceLockToken")

export interface RuleApplyWorkspaceLockToken {
  readonly [RULE_APPLY_WORKSPACE_LOCK_TOKEN]: true
}

export interface ExecuteRuleApplyTransactionOptions {
  readonly workspaceRoot: string
  readonly transactionId: string
  readonly now: string
  readonly faultInjector?: RuleApplyFaultInjector
  readonly workspaceLockToken?: RuleApplyWorkspaceLockToken
}

export interface RuleApplyRecoveryRequest {
  readonly action: "rollback" | "resume"
  readonly now: string
  readonly faultInjector?: RuleApplyFaultInjector
  readonly workspaceLockToken?: RuleApplyWorkspaceLockToken
}

export interface RuleApplyTransactionTargetV1 {
  readonly asset: RuleApplyAsset
  readonly path: string
  readonly expected_pre_image: RuleApplyExpectedPreImage
  readonly post_image_sha256: string
  state: RuleApplyTargetStatus
  readonly backup_path: string | null
  readonly staging_path: string
}

export interface RuleApplyTransactionJournalV1 {
  readonly schema_version: typeof RULE_APPLY_TRANSACTION_SCHEMA_VERSION
  readonly transaction_id: string
  readonly run_id: string
  status: RuleApplyTransactionStatus
  readonly created_at: string
  updated_at: string
  readonly targets: RuleApplyTransactionTargetV1[]
  readonly decisions: RuleApplyDecisionRecordV1[]
  readonly retirements: RuleApplyRetirementV1[]
  error_code?: string
  rollback_error_code?: string
}

export interface ApplyManifestTargetV1 {
  readonly asset: RuleApplyAsset
  readonly path: string
  readonly expected_pre_image: RuleApplyExpectedPreImage
  readonly post_image_sha256: string
  readonly state: "replaced"
}

export interface ApplyManifestV1 {
  readonly schema_version: typeof APPLY_MANIFEST_SCHEMA_VERSION
  readonly transaction_id: string
  readonly run_id: string
  readonly status: "committed"
  readonly committed_at: string
  readonly backup_directory: string
  readonly targets: ApplyManifestTargetV1[]
  readonly decisions: RuleApplyDecisionRecordV1[]
  readonly retirements: RuleApplyRetirementV1[]
}

export interface ValidatedRuleApplyMetadata {
  readonly decisions: RuleApplyDecisionRecordV1[]
  readonly retirements: RuleApplyRetirementV1[]
}

export interface IncompleteRuleApplyTransactionV1 {
  readonly transaction_id: string
  readonly run_id: string
  readonly status: Exclude<RuleApplyTransactionStatus, "committed" | "rolled_back">
  readonly recovery_action: "rollback" | "resume"
}

export type RuleApplyTransactionErrorCode =
  | "filesystem_failure"
  | "invalid_plan"
  | "invalid_transaction_id"
  | "recovery_incomplete"
  | "rollback_failed"
  | "stale_pre_image"
  | "transaction_exists"
  | "unsafe_journal"
  | "unsafe_path"
  | "workspace_busy"

export class RuleApplyTransactionError extends Error {
  readonly code: RuleApplyTransactionErrorCode
  readonly transactionId?: string
  readonly status?: RuleApplyTransactionStatus

  constructor(
    code: RuleApplyTransactionErrorCode,
    options: { transactionId?: string; status?: RuleApplyTransactionStatus } = {}
  ) {
    super(errorMessage(code))
    this.name = "RuleApplyTransactionError"
    this.code = code
    this.transactionId = options.transactionId
    this.status = options.status
  }
}

interface ValidatedTransactionPlan {
  readonly runId: string
  readonly targets: Array<RuleApplyPlanTarget & { readonly bytes: Buffer }>
  readonly decisions: RuleApplyDecisionRecordV1[]
  readonly retirements: RuleApplyRetirementV1[]
}

interface TransactionPaths {
  readonly workspaceRoot: string
  readonly authoringDirectory: string
  readonly transactionsDirectory: string
  readonly backupsDirectory: string
  readonly transactionDirectory: string
  readonly backupDirectory: string
  readonly stagingDirectory: string
  readonly journalPath: string
  readonly manifestPath: string
  readonly applyLockDirectory: string
}

class RuleApplyPostCommitError extends Error {
  readonly manifest: ApplyManifestV1

  constructor(manifest: ApplyManifestV1) {
    super("Project-rule transaction completion journal could not be confirmed.")
    this.manifest = manifest
  }
}

const TARGET_SPECS: ReadonlyArray<readonly [RuleApplyAsset, string]> = [
  ["checklist", ".bob/review/checklist.json"],
  ["project_context", ".bob/review/project-context.md"],
  ["prompt_addendum", ".bob/review/review-prompt-addendum.md"],
  ["rule_sources", ".bob/review/rule-sources.json"],
  ["rule_provenance", ".bob/review/rule-provenance.json"]
]
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SOURCE_ID_PATTERN = /^src-[a-f0-9]{12,64}$/
const CHUNK_ID_PATTERN = /^chunk-[a-f0-9]{64}$/
const CANDIDATE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SAFE_CODE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/
const ANY_CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/
const MAX_PLAN_TARGET_BYTES = 16 * 1024 * 1024
const MAX_JOURNAL_BYTES = 16 * 1024 * 1024
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024
const MAX_TRANSACTION_ENTRIES = 10_000
const MAX_METADATA_RECORDS =
  DEFAULT_RULE_AUTHORING_LIMITS.maxRuleOperations +
  DEFAULT_RULE_AUTHORING_LIMITS.maxProjectContextOperations +
  DEFAULT_RULE_AUTHORING_LIMITS.maxPromptAddendumOperations
const MAX_METADATA_SOURCE_REFS = 64
const MAX_METADATA_CONFLICT_RESOLUTIONS = 200
const WORKSPACE_MUTEXES = new Set<string>()
interface WorkspaceLockTokenState {
  readonly workspaceRoot: string
  accepting: boolean
  inFlight: number
  readonly drainWaiters: Array<() => void>
}
const WORKSPACE_LOCK_TOKENS = new WeakMap<RuleApplyWorkspaceLockToken, WorkspaceLockTokenState>()

export function validateRuleApplyMetadata(
  decisionsValue: unknown,
  retirementsValue: unknown
): ValidatedRuleApplyMetadata {
  if (
    !Array.isArray(decisionsValue) ||
    decisionsValue.length > MAX_METADATA_RECORDS ||
    !Array.isArray(retirementsValue) ||
    retirementsValue.length > MAX_METADATA_RECORDS
  ) {
    throw new Error("Rule apply decision or retirement metadata is malformed")
  }
  const decisions = decisionsValue.map(validateDecisionMetadataRecord)
  const decisionByCandidate = new Map<string, RuleApplyDecisionRecordV1>()
  for (const decision of decisions) {
    if (decisionByCandidate.has(decision.candidate_id)) {
      throw new Error("Rule apply decision metadata contains a duplicate candidate")
    }
    decisionByCandidate.set(decision.candidate_id, decision)
  }
  const retirements = retirementsValue.map(validateRetirementMetadataRecord)
  const retirementCandidates = new Set<string>()
  for (const retirement of retirements) {
    if (retirementCandidates.has(retirement.candidate_id)) {
      throw new Error("Rule apply retirement metadata contains a duplicate candidate")
    }
    retirementCandidates.add(retirement.candidate_id)
    const decision = decisionByCandidate.get(retirement.candidate_id)
    if (
      !decision ||
      decision.operation !== "retire" ||
      decision.decision === "reject" ||
      decision.target_asset !== retirement.target_asset ||
      decision.target_id !== retirement.target_id ||
      decision.decision !== retirement.decision ||
      decision.reviewed_at !== retirement.reviewed_at ||
      stableMetadataJson(decision.source_refs) !== stableMetadataJson(retirement.source_refs)
    ) {
      throw new Error("Rule apply retirement metadata does not match its decision")
    }
  }
  const expectedRetirements = decisions.filter(({ operation, decision }) =>
    operation === "retire" && decision !== "reject")
  if (
    retirements.length !== expectedRetirements.length ||
    expectedRetirements.some(({ candidate_id }) => !retirementCandidates.has(candidate_id))
  ) {
    throw new Error("Rule apply retirement metadata is incomplete")
  }
  const output = {
    decisions: structuredClone(decisions),
    retirements: structuredClone(retirements)
  }
  assertMetadataSerializable(output)
  return output
}

export function ruleApplyMetadataEquals(
  leftDecisions: unknown,
  leftRetirements: unknown,
  rightDecisions: unknown,
  rightRetirements: unknown
): boolean {
  try {
    const left = validateRuleApplyMetadata(leftDecisions, leftRetirements)
    const right = validateRuleApplyMetadata(rightDecisions, rightRetirements)
    return stableMetadataJson(left) === stableMetadataJson(right)
  } catch {
    return false
  }
}

function validateDecisionMetadataRecord(value: unknown): RuleApplyDecisionRecordV1 {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "candidate_id",
      "target_asset",
      "operation",
      "decision",
      "target_id",
      "reviewed_at",
      "source_refs",
      "conflict_resolutions"
    ]) ||
    typeof value.candidate_id !== "string" ||
    !CANDIDATE_ID_PATTERN.test(value.candidate_id) ||
    !isRuleApplyTargetAsset(value.target_asset) ||
    (value.operation !== "add" && value.operation !== "update" && value.operation !== "retire") ||
    (value.decision !== "accept" && value.decision !== "reject" && value.decision !== "edit") ||
    !isCanonicalTimestamp(value.reviewed_at) ||
    !isPlainObject(value.conflict_resolutions)
  ) {
    throw new Error("Rule apply decision metadata is malformed")
  }
  if (
    (value.operation === "retire" && value.decision === "edit") ||
    (value.operation === "add" && value.decision === "reject" && value.target_id !== null) ||
    (!(value.operation === "add" && value.decision === "reject") &&
      !isMetadataTargetId(value.target_id, value.target_asset))
  ) {
    throw new Error("Rule apply decision target metadata is malformed")
  }
  const sourceRefs = validateDecisionSourceRefs(value.source_refs)
  if (
    (value.decision === "reject" && sourceRefs.length !== 0) ||
    (value.decision !== "reject" && sourceRefs.length === 0)
  ) {
    throw new Error("Rule apply decision source metadata is malformed")
  }
  const conflicts = Object.entries(value.conflict_resolutions)
  if (
    conflicts.length > MAX_METADATA_CONFLICT_RESOLUTIONS ||
    conflicts.some(([conflictId, alternativeId]) =>
      !CANDIDATE_ID_PATTERN.test(conflictId) ||
      typeof alternativeId !== "string" ||
      !CANDIDATE_ID_PATTERN.test(alternativeId))
  ) {
    throw new Error("Rule apply decision conflict metadata is malformed")
  }
  return {
    candidate_id: value.candidate_id,
    target_asset: value.target_asset,
    operation: value.operation,
    decision: value.decision,
    target_id: value.target_id,
    reviewed_at: value.reviewed_at,
    source_refs: sourceRefs,
    conflict_resolutions: Object.fromEntries(conflicts.sort(([left], [right]) => compareText(left, right)))
  }
}

function validateRetirementMetadataRecord(value: unknown): RuleApplyRetirementV1 {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "candidate_id",
      "target_asset",
      "target_id",
      "decision",
      "reviewed_at",
      "source_refs",
      "previous"
    ]) ||
    typeof value.candidate_id !== "string" ||
    !CANDIDATE_ID_PATTERN.test(value.candidate_id) ||
    !isRuleApplyTargetAsset(value.target_asset) ||
    !isMetadataTargetId(value.target_id, value.target_asset) ||
    (value.decision !== "accept" && value.decision !== "edit") ||
    !isCanonicalTimestamp(value.reviewed_at)
  ) {
    throw new Error("Rule apply retirement metadata is malformed")
  }
  const sourceRefs = validateDecisionSourceRefs(value.source_refs)
  if (sourceRefs.length === 0) throw new Error("Rule apply retirement source metadata is malformed")
  const previous = validateRetirementPrevious(value.previous, value.target_asset, value.target_id)
  return {
    candidate_id: value.candidate_id,
    target_asset: value.target_asset,
    target_id: value.target_id,
    decision: value.decision,
    reviewed_at: value.reviewed_at,
    source_refs: sourceRefs,
    previous
  }
}

function validateDecisionSourceRefs(value: unknown): Array<{ source_id: string; chunk_id: string }> {
  if (!Array.isArray(value) || value.length > MAX_METADATA_SOURCE_REFS) {
    throw new Error("Rule apply source reference metadata is malformed")
  }
  const seen = new Set<string>()
  return value.map((ref) => {
    if (
      !isPlainObject(ref) ||
      !hasExactKeys(ref, ["source_id", "chunk_id"]) ||
      typeof ref.source_id !== "string" ||
      typeof ref.chunk_id !== "string" ||
      !SOURCE_ID_PATTERN.test(ref.source_id) ||
      !CHUNK_ID_PATTERN.test(ref.chunk_id)
    ) {
      throw new Error("Rule apply source reference metadata is malformed")
    }
    const key = `${ref.source_id}\u0000${ref.chunk_id}`
    if (seen.has(key)) throw new Error("Rule apply source reference metadata contains a duplicate")
    seen.add(key)
    return { source_id: ref.source_id, chunk_id: ref.chunk_id }
  })
}

function validateRetirementPrevious(
  value: unknown,
  asset: RuleApplyDecisionRecordV1["target_asset"],
  targetId: string
): RuleApplyRetirementV1["previous"] {
  if (!isPlainObject(value)) throw new Error("Rule apply retirement previous value is malformed")
  if (asset !== "rule") {
    if (
      !hasExactKeys(value, ["heading", "markdown"]) ||
      !boundedMetadataString(value.heading, RULE_AUTHORING_TEXT_BYTE_LIMITS.markdownHeading, true) ||
      typeof value.markdown !== "string" ||
      CONTROL_CHARACTER.test(value.markdown) ||
      Buffer.byteLength(value.markdown, "utf8") > DEFAULT_RULE_AUTHORING_LIMITS.maxProjectContextBytes
    ) {
      throw new Error("Rule apply retirement previous Markdown is malformed")
    }
    return { heading: value.heading, markdown: value.markdown }
  }
  const allowed = [
    "id",
    "category",
    "title",
    "description",
    "severity_on_fail",
    "applies_when",
    "evidence_required",
    "review_hint"
  ]
  const required = ["id", "category", "title", "description", "severity_on_fail"]
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) ||
    value.id !== targetId ||
    !boundedMetadataString(value.category, RULE_AUTHORING_TEXT_BYTE_LIMITS.category, true) ||
    !boundedMetadataString(value.title, RULE_AUTHORING_TEXT_BYTE_LIMITS.title, true) ||
    !boundedMetadataString(value.description, RULE_AUTHORING_TEXT_BYTE_LIMITS.description, true) ||
    (value.severity_on_fail !== "error" && value.severity_on_fail !== "warning" &&
      value.severity_on_fail !== "info") ||
    (value.applies_when !== undefined && (
      !Array.isArray(value.applies_when) ||
      value.applies_when.length > 32 ||
      value.applies_when.some((item: unknown) =>
        !boundedMetadataString(item, RULE_AUTHORING_TEXT_BYTE_LIMITS.appliesWhen, false) ||
        ANY_CONTROL_CHARACTER.test(item))
    )) ||
    (value.evidence_required !== undefined && typeof value.evidence_required !== "boolean") ||
    (value.review_hint !== undefined &&
      !boundedMetadataString(value.review_hint, RULE_AUTHORING_TEXT_BYTE_LIMITS.reviewHint, false))
  ) {
    throw new Error("Rule apply retirement previous rule is malformed")
  }
  return structuredClone(value) as RuleApplyRetirementV1["previous"]
}

function isRuleApplyTargetAsset(value: unknown): value is RuleApplyDecisionRecordV1["target_asset"] {
  return value === "rule" || value === "project_context" || value === "prompt_addendum"
}

function isMetadataTargetId(
  value: unknown,
  asset: RuleApplyDecisionRecordV1["target_asset"]
): value is string {
  if (!boundedMetadataString(value, 128, true) || ANY_CONTROL_CHARACTER.test(value)) return false
  if (asset === "project_context") return /^CTX-(?!0000$)[0-9]{4}$/.test(value)
  if (asset === "prompt_addendum") return /^PRM-(?!0000$)[0-9]{4}$/.test(value)
  return /^PRJ-(?!0000$)[0-9]{4}$/.test(value) || !/^\s*(?:PRJ|CTX|PRM)-/.test(value)
}

function boundedMetadataString(value: unknown, maxBytes: number, nonEmpty: boolean): value is string {
  return typeof value === "string" &&
    (!nonEmpty || value.length > 0) &&
    !CONTROL_CHARACTER.test(value) &&
    Buffer.byteLength(value, "utf8") <= maxBytes
}

function stableMetadataJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableMetadataJson).join(",")}]`
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort(compareText).map((key) =>
      `${JSON.stringify(key)}:${stableMetadataJson(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

export async function executeRuleApplyTransaction(
  planInput: RuleApplyPlan,
  options: ExecuteRuleApplyTransactionOptions
): Promise<ApplyManifestV1> {
  const plan = validatePlan(planInput)
  const workspaceRoot = validateWorkspaceRoot(options?.workspaceRoot)
  const transactionId = validateTransactionId(options?.transactionId)
  const now = requireCanonicalTimestamp(options?.now, "transaction timestamp")
  const paths = transactionPaths(workspaceRoot, transactionId)

  const executeUnderWorkspaceLock = async (): Promise<ApplyManifestV1> => {
    await assertWorkspaceRoot(paths.workspaceRoot)
    await assertTransactionDoesNotExist(paths)
    await assertNoIncompleteRuleApplyTransactions(paths.workspaceRoot, transactionId)
    await ensureSafeDirectoryChain(paths.workspaceRoot, paths.stagingDirectory)
    await ensureSafeDirectoryChain(paths.workspaceRoot, paths.backupDirectory)
    await assertAllTargetPathsSafe(paths.workspaceRoot)
    for (const target of plan.targets) {
      await assertPreImage(paths.workspaceRoot, target)
    }

    const journal = createJournal(plan, transactionId, now)
    try {
      await writeJournal(paths, journal, options.faultInjector)
      await stageAndBackupTargets(paths, plan, journal, options.faultInjector)
      journal.status = "applying"
      journal.updated_at = now
      await writeJournal(paths, journal, options.faultInjector)

      await replacePreparedTargets(paths, journal, options.faultInjector)
      return await commitTransaction(paths, journal, now, options.faultInjector)
    } catch (error) {
      if (error instanceof RuleApplyPostCommitError) {
        throw new RuleApplyTransactionError("filesystem_failure", {
          transactionId,
          status: "committed"
        })
      }
      if (await readExistingManifestCommitBoundary(paths, journal)) {
        throw new RuleApplyTransactionError("filesystem_failure", {
          transactionId,
          status: "committed"
        })
      }
      const code = failureCode(error)
      journal.error_code = code
      journal.updated_at = now
      const rollbackStatus = await rollbackTransaction(paths, journal, now, options.faultInjector)
      throw new RuleApplyTransactionError(
        rollbackStatus === "rollback_failed" ? "rollback_failed" : code,
        { transactionId, status: rollbackStatus }
      )
    }
  }
  const token = options?.workspaceLockToken
  if (token !== undefined) {
    return withActiveWorkspaceLockToken(token, workspaceRoot, transactionId, executeUnderWorkspaceLock)
  }
  return withRuleApplyWorkspaceLock(workspaceRoot, transactionId, (workspaceLockToken) =>
    withActiveWorkspaceLockToken(
      workspaceLockToken,
      workspaceRoot,
      transactionId,
      executeUnderWorkspaceLock
    ))
}

export async function findIncompleteRuleApplyTransactions(
  workspaceRootInput: string
): Promise<IncompleteRuleApplyTransactionV1[]> {
  const workspaceRoot = validateWorkspaceRoot(workspaceRootInput)
  await assertWorkspaceRoot(workspaceRoot)
  const paths = transactionPaths(workspaceRoot, "transaction-probe")
  const baseStats = await lstatOptional(paths.transactionsDirectory)
  if (!baseStats) return []
  if (baseStats.isSymbolicLink() || !baseStats.isDirectory()) {
    throw new RuleApplyTransactionError("unsafe_path")
  }
  await assertExistingDirectoryChain(workspaceRoot, paths.transactionsDirectory)
  const entries = await fs.readdir(paths.transactionsDirectory, { withFileTypes: true })
  if (entries.length > MAX_TRANSACTION_ENTRIES) throw new RuleApplyTransactionError("unsafe_journal")

  const incomplete: IncompleteRuleApplyTransactionV1[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    let transactionId: string
    try {
      transactionId = validateTransactionId(entry.name)
    } catch {
      continue
    }
    const childPaths = transactionPaths(workspaceRoot, transactionId)
    const journalStats = await lstatOptional(childPaths.journalPath)
    if (!journalStats || journalStats.isSymbolicLink() || !journalStats.isFile()) continue
    const journal = await readJournal(childPaths)
    if (journal.status === "committed" || journal.status === "rolled_back") continue
    incomplete.push({
      transaction_id: journal.transaction_id,
      run_id: journal.run_id,
      status: journal.status,
      recovery_action: await lstatOptional(childPaths.manifestPath) ? "resume" : "rollback"
    })
  }
  return incomplete.sort((left, right) => compareText(left.transaction_id, right.transaction_id))
}

export async function recoverRuleApplyTransaction(
  workspaceRootInput: string,
  transactionIdInput: string,
  requestInput: RuleApplyRecoveryRequest
): Promise<RuleApplyTransactionJournalV1 | ApplyManifestV1> {
  const workspaceRoot = validateWorkspaceRoot(workspaceRootInput)
  const transactionId = validateTransactionId(transactionIdInput)
  const request = validateRecoveryRequest(requestInput)
  const paths = transactionPaths(workspaceRoot, transactionId)

  const recoverUnderWorkspaceLock = async (): Promise<RuleApplyTransactionJournalV1 | ApplyManifestV1> => {
    await assertWorkspaceRoot(workspaceRoot)
    const journal = await readJournal(paths)
    if (journal.status === "committed") return readManifest(paths, journal)
    const committedBoundary = await commitExistingManifestIfPresent(
      paths,
      journal,
      request.now,
      request.faultInjector
    )
    if (committedBoundary) return committedBoundary
    if (request.action === "rollback") {
      if (journal.status === "rolled_back") return journal
      journal.error_code = journal.error_code ?? "recovery_requested"
      const status = await rollbackTransaction(paths, journal, request.now, request.faultInjector, true)
      if (status === "rollback_failed") {
        throw new RuleApplyTransactionError("rollback_failed", { transactionId, status })
      }
      return journal
    }

    if (journal.status === "rolled_back" || journal.status === "rolling_back" || journal.status === "rollback_failed") {
      throw new RuleApplyTransactionError("recovery_incomplete", { transactionId, status: journal.status })
    }

    try {
      journal.status = "applying"
      journal.updated_at = request.now
      await writeJournal(paths, journal, request.faultInjector)
      await verifyOrResumeTargets(paths, journal, request.faultInjector)
      const existingManifest = await commitExistingManifestIfPresent(
        paths,
        journal,
        request.now,
        request.faultInjector
      )
      if (existingManifest) return existingManifest
      return await commitTransaction(paths, journal, request.now, request.faultInjector)
    } catch (error) {
      if (error instanceof RuleApplyPostCommitError) {
        throw new RuleApplyTransactionError("filesystem_failure", {
          transactionId,
          status: "committed"
        })
      }
      if (await readExistingManifestCommitBoundary(paths, journal)) {
        throw new RuleApplyTransactionError("filesystem_failure", {
          transactionId,
          status: "committed"
        })
      }
      journal.error_code = failureCode(error)
      const status = await rollbackTransaction(paths, journal, request.now, request.faultInjector, true)
      throw new RuleApplyTransactionError(
        status === "rollback_failed" ? "rollback_failed" : failureCode(error),
        { transactionId, status }
      )
    }
  }
  const token = request.workspaceLockToken
  if (token !== undefined) {
    return withActiveWorkspaceLockToken(token, workspaceRoot, transactionId, recoverUnderWorkspaceLock)
  }
  return withRuleApplyWorkspaceLock(workspaceRoot, transactionId, (workspaceLockToken) =>
    withActiveWorkspaceLockToken(
      workspaceLockToken,
      workspaceRoot,
      transactionId,
      recoverUnderWorkspaceLock
    ))
}

function createJournal(
  plan: ValidatedTransactionPlan,
  transactionId: string,
  now: string
): RuleApplyTransactionJournalV1 {
  return {
    schema_version: RULE_APPLY_TRANSACTION_SCHEMA_VERSION,
    transaction_id: transactionId,
    run_id: plan.runId,
    status: "prepared",
    created_at: now,
    updated_at: now,
    targets: plan.targets.map((target) => ({
      asset: target.asset,
      path: target.path,
      expected_pre_image: structuredClone(target.expected_pre_image),
      post_image_sha256: target.post_image_sha256,
      state: "prepared",
      backup_path: target.expected_pre_image.state === "present"
        ? backupRelativePath(transactionId, target.asset)
        : null,
      staging_path: stagingRelativePath(transactionId, target.asset)
    })),
    decisions: structuredClone(plan.decisions),
    retirements: structuredClone(plan.retirements)
  }
}

async function stageAndBackupTargets(
  paths: TransactionPaths,
  plan: ValidatedTransactionPlan,
  journal: RuleApplyTransactionJournalV1,
  faultInjector?: RuleApplyFaultInjector
): Promise<void> {
  for (const [index, target] of plan.targets.entries()) {
    await emit(faultInjector, {
      operation: "stage_target",
      transactionId: journal.transaction_id,
      status: journal.status,
      asset: target.asset,
      index
    })
    const stagedPath = absoluteWorkspacePath(paths.workspaceRoot, journal.targets[index].staging_path)
    await atomicWriteFile(paths.workspaceRoot, stagedPath, target.bytes, false)
    await assertFileHash(paths.workspaceRoot, stagedPath, target.post_image_sha256, MAX_PLAN_TARGET_BYTES)
  }

  for (const [index, target] of plan.targets.entries()) {
    if (target.expected_pre_image.state === "missing") continue
    await emit(faultInjector, {
      operation: "backup_target",
      transactionId: journal.transaction_id,
      status: journal.status,
      asset: target.asset,
      index
    })
    const liveBytes = await readTargetForExpectedPreImage(paths.workspaceRoot, target)
    const backupPath = absoluteWorkspacePath(paths.workspaceRoot, requiredString(journal.targets[index].backup_path))
    await atomicWriteFile(paths.workspaceRoot, backupPath, liveBytes, false)
    await assertFileHash(paths.workspaceRoot, backupPath, target.expected_pre_image.sha256, MAX_PLAN_TARGET_BYTES)
  }
}

async function replacePreparedTargets(
  paths: TransactionPaths,
  journal: RuleApplyTransactionJournalV1,
  faultInjector?: RuleApplyFaultInjector
): Promise<void> {
  for (const [index, target] of journal.targets.entries()) {
    if (target.state !== "prepared") continue
    await replaceOneTarget(paths, journal, target, index, faultInjector)
  }
}

async function verifyOrResumeTargets(
  paths: TransactionPaths,
  journal: RuleApplyTransactionJournalV1,
  faultInjector?: RuleApplyFaultInjector
): Promise<void> {
  for (const [index, target] of journal.targets.entries()) {
    await verifyTargetArtifacts(paths, target)
    if (target.state === "restored") {
      throw new RuleApplyTransactionError("recovery_incomplete", {
        transactionId: journal.transaction_id,
        status: journal.status
      })
    }
    if (target.state === "replaced") {
      const liveState = await classifyLiveTarget(paths.workspaceRoot, target)
      if (liveState !== "post") throw new RuleApplyTransactionError("recovery_incomplete")
      continue
    }
    const liveState = await classifyLiveTarget(paths.workspaceRoot, target)
    if (liveState === "post") {
      target.state = "replaced"
      await writeJournal(paths, journal, faultInjector)
      continue
    }
    if (liveState !== "pre") throw new RuleApplyTransactionError("stale_pre_image")
    const stagedPath = absoluteWorkspacePath(paths.workspaceRoot, target.staging_path)
    await assertFileHash(paths.workspaceRoot, stagedPath, target.post_image_sha256, MAX_PLAN_TARGET_BYTES)
    if (target.expected_pre_image.state === "present") {
      const backupPath = absoluteWorkspacePath(paths.workspaceRoot, requiredString(target.backup_path))
      await assertFileHash(paths.workspaceRoot, backupPath, target.expected_pre_image.sha256, MAX_PLAN_TARGET_BYTES)
    }
    await replaceOneTarget(paths, journal, target, index, faultInjector)
  }
}

async function commitExistingManifestIfPresent(
  paths: TransactionPaths,
  journal: RuleApplyTransactionJournalV1,
  now: string,
  faultInjector?: RuleApplyFaultInjector
): Promise<ApplyManifestV1 | undefined> {
  const manifest = await readExistingManifestCommitBoundary(paths, journal)
  if (!manifest) return undefined
  journal.status = "committed"
  journal.updated_at = now
  delete journal.error_code
  delete journal.rollback_error_code
  try {
    await writeJournal(paths, journal, faultInjector)
  } catch {
    try {
      const persisted = await readJournal(paths)
      if (
        persisted.status === "committed" &&
        persisted.transaction_id === manifest.transaction_id &&
        persisted.run_id === manifest.run_id
      ) return manifest
      await writeJournal(paths, journal)
    } catch {
      throw new RuleApplyPostCommitError(manifest)
    }
  }
  return manifest
}

async function readExistingManifestCommitBoundary(
  paths: TransactionPaths,
  journal: RuleApplyTransactionJournalV1
): Promise<ApplyManifestV1 | undefined> {
  const stats = await lstatOptional(paths.manifestPath)
  if (!stats) return undefined
  if (stats.isSymbolicLink() || !stats.isFile()) throw new RuleApplyTransactionError("unsafe_journal")
  const manifest = await readManifest(paths, journal)
  if (journal.targets.some(({ state }) => state !== "replaced")) {
    throw new RuleApplyTransactionError("unsafe_journal")
  }
  for (const target of journal.targets) {
    await assertLivePostImage(paths.workspaceRoot, target)
  }
  return manifest
}

async function replaceOneTarget(
  paths: TransactionPaths,
  journal: RuleApplyTransactionJournalV1,
  target: RuleApplyTransactionTargetV1,
  index: number,
  faultInjector?: RuleApplyFaultInjector
): Promise<void> {
  const stagedPath = absoluteWorkspacePath(paths.workspaceRoot, target.staging_path)
  const stagedBytes = await readRegularFileBounded(
    paths.workspaceRoot,
    stagedPath,
    MAX_PLAN_TARGET_BYTES,
    "unsafe_path"
  )
  if (sha256(stagedBytes) !== target.post_image_sha256) {
    throw new RuleApplyTransactionError("recovery_incomplete")
  }
  const targetPath = targetAbsolutePath(paths.workspaceRoot, target.asset)
  await assertPreImage(paths.workspaceRoot, target)
  await emit(faultInjector, {
    operation: "replace_target",
    transactionId: journal.transaction_id,
    status: journal.status,
    asset: target.asset,
    index
  })
  await atomicWriteFile(paths.workspaceRoot, targetPath, stagedBytes, true, async () => {
    await assertPreImage(paths.workspaceRoot, target)
  })
  await assertLivePostImage(paths.workspaceRoot, target)
  target.state = "replaced"
  await writeJournal(paths, journal, faultInjector)
}

async function commitTransaction(
  paths: TransactionPaths,
  journal: RuleApplyTransactionJournalV1,
  now: string,
  faultInjector?: RuleApplyFaultInjector
): Promise<ApplyManifestV1> {
  for (const target of journal.targets) {
    if (target.state !== "replaced") throw new RuleApplyTransactionError("recovery_incomplete")
    await verifyTargetArtifacts(paths, target)
    await assertLivePostImage(paths.workspaceRoot, target)
  }
  await emit(faultInjector, {
    operation: "commit_manifest",
    transactionId: journal.transaction_id,
    status: journal.status
  })
  const manifest = manifestFromJournal(journal, now)
  await atomicWriteJson(paths.workspaceRoot, paths.manifestPath, manifest)
  await emit(faultInjector, {
    operation: "manifest_persisted",
    transactionId: journal.transaction_id,
    status: journal.status
  })
  journal.status = "committed"
  journal.updated_at = now
  delete journal.error_code
  delete journal.rollback_error_code
  try {
    await writeJournal(paths, journal, faultInjector)
  } catch {
    try {
      const persisted = await readJournal(paths)
      if (
        persisted.status === "committed" &&
        persisted.transaction_id === manifest.transaction_id &&
        persisted.run_id === manifest.run_id
      ) return manifest
      await writeJournal(paths, journal)
    } catch {
      throw new RuleApplyPostCommitError(manifest)
    }
  }
  return manifest
}

function manifestFromJournal(
  journal: RuleApplyTransactionJournalV1,
  committedAt: string
): ApplyManifestV1 {
  return {
    schema_version: APPLY_MANIFEST_SCHEMA_VERSION,
    transaction_id: journal.transaction_id,
    run_id: journal.run_id,
    status: "committed",
    committed_at: committedAt,
    backup_directory: backupDirectoryRelativePath(journal.transaction_id),
    targets: journal.targets.map((target) => ({
      asset: target.asset,
      path: target.path,
      expected_pre_image: structuredClone(target.expected_pre_image),
      post_image_sha256: target.post_image_sha256,
      state: "replaced"
    })),
    decisions: structuredClone(journal.decisions),
    retirements: structuredClone(journal.retirements)
  }
}

async function rollbackTransaction(
  paths: TransactionPaths,
  journal: RuleApplyTransactionJournalV1,
  now: string,
  faultInjector?: RuleApplyFaultInjector,
  failOnPreparedDivergence = false
): Promise<"rolled_back" | "rollback_failed"> {
  if (await lstatOptional(paths.manifestPath)) {
    throw new RuleApplyTransactionError("recovery_incomplete", {
      transactionId: journal.transaction_id,
      status: journal.status
    })
  }
  journal.status = "rolling_back"
  journal.updated_at = now
  let journalWriteFailed = false
  try {
    await writeJournal(paths, journal, faultInjector)
  } catch {
    journalWriteFailed = true
  }

  let restoreFailed = false
  for (let index = journal.targets.length - 1; index >= 0; index -= 1) {
    const target = journal.targets[index]
    if (target.state === "restored") continue
    try {
      const liveState = await classifyLiveTarget(
        paths.workspaceRoot,
        target,
        target.state === "prepared" ? "pre" : "post"
      )
      if (target.state === "prepared" && liveState === "pre") continue
      if (target.state === "prepared" && liveState === "other") {
        if (failOnPreparedDivergence) restoreFailed = true
        continue
      }
      if (target.state === "replaced" && liveState === "pre") {
        target.state = "restored"
        await writeJournal(paths, journal, faultInjector)
        continue
      }
      if (liveState !== "post") {
        restoreFailed = true
        continue
      }
      await emit(faultInjector, {
        operation: "restore_target",
        transactionId: journal.transaction_id,
        status: journal.status,
        asset: target.asset,
        index
      })
      await restoreOneTarget(paths, target)
      target.state = "restored"
      journal.updated_at = now
      await writeJournal(paths, journal, faultInjector)
    } catch {
      restoreFailed = true
    }
  }

  const failed = restoreFailed || journalWriteFailed ||
    journal.targets.some(({ state }) => state === "replaced")
  journal.status = failed ? "rollback_failed" : "rolled_back"
  journal.updated_at = now
  if (failed) journal.rollback_error_code = "filesystem_failure"
  else delete journal.rollback_error_code
  try {
    await writeJournal(paths, journal, faultInjector)
  } catch {
    journal.status = "rollback_failed"
    journal.rollback_error_code = "filesystem_failure"
  }
  return journal.status
}

async function classifyLiveTarget(
  workspaceRoot: string,
  target: Pick<
    RuleApplyTransactionTargetV1,
    "asset" | "expected_pre_image" | "post_image_sha256"
  >,
  equalImagePreference: "pre" | "post" = "post"
): Promise<"pre" | "post" | "other"> {
  const targetPath = targetAbsolutePath(workspaceRoot, target.asset)
  const stats = await lstatOptional(targetPath)
  if (!stats) return target.expected_pre_image.state === "missing" ? "pre" : "other"
  if (stats.isSymbolicLink() || !stats.isFile()) throw new RuleApplyTransactionError("unsafe_path")
  const bytes = await readRegularFileBounded(
    workspaceRoot,
    targetPath,
    MAX_PLAN_TARGET_BYTES,
    "unsafe_path"
  )
  const hash = sha256(bytes)
  const matchesPost = hash === target.post_image_sha256
  const matchesPre = target.expected_pre_image.state === "present" &&
    hash === target.expected_pre_image.sha256
  if (matchesPost && matchesPre) return equalImagePreference
  if (matchesPost) return "post"
  if (matchesPre) return "pre"
  return "other"
}

async function verifyTargetArtifacts(
  paths: TransactionPaths,
  target: RuleApplyTransactionTargetV1
): Promise<void> {
  await assertRecoveryArtifactHash(
    paths.workspaceRoot,
    absoluteWorkspacePath(paths.workspaceRoot, target.staging_path),
    target.post_image_sha256
  )
  if (target.expected_pre_image.state === "present") {
    await assertRecoveryArtifactHash(
      paths.workspaceRoot,
      absoluteWorkspacePath(paths.workspaceRoot, requiredString(target.backup_path)),
      target.expected_pre_image.sha256
    )
  }
}

async function assertRecoveryArtifactHash(
  workspaceRoot: string,
  filePath: string,
  expectedHash: string
): Promise<void> {
  const stats = await lstatOptional(filePath)
  if (!stats) throw new RuleApplyTransactionError("recovery_incomplete")
  if (stats.isSymbolicLink() || !stats.isFile()) throw new RuleApplyTransactionError("unsafe_path")
  const bytes = await readRegularFileBounded(
    workspaceRoot,
    filePath,
    MAX_PLAN_TARGET_BYTES,
    "recovery_incomplete"
  )
  if (sha256(bytes) !== expectedHash) throw new RuleApplyTransactionError("recovery_incomplete")
}

async function restoreOneTarget(
  paths: TransactionPaths,
  target: RuleApplyTransactionTargetV1
): Promise<void> {
  await assertLivePostImage(paths.workspaceRoot, target)
  const targetPath = targetAbsolutePath(paths.workspaceRoot, target.asset)
  if (target.expected_pre_image.state === "missing") {
    await fs.unlink(targetPath)
    await fsyncDirectory(path.dirname(targetPath))
    const after = await lstatOptional(targetPath)
    if (after) throw new RuleApplyTransactionError("rollback_failed")
    return
  }
  const backupPath = absoluteWorkspacePath(paths.workspaceRoot, requiredString(target.backup_path))
  const backupBytes = await readRegularFileBounded(
    paths.workspaceRoot,
    backupPath,
    MAX_PLAN_TARGET_BYTES,
    "rollback_failed"
  )
  if (sha256(backupBytes) !== target.expected_pre_image.sha256) {
    throw new RuleApplyTransactionError("rollback_failed")
  }
  await atomicWriteFile(paths.workspaceRoot, targetPath, backupBytes, true, async () => {
    await assertLivePostImage(paths.workspaceRoot, target)
  })
  await assertFileHash(
    paths.workspaceRoot,
    targetPath,
    target.expected_pre_image.sha256,
    MAX_PLAN_TARGET_BYTES
  )
}

function validatePlan(input: RuleApplyPlan): ValidatedTransactionPlan {
  if (
    !isPlainObject(input) ||
    input.schema_version !== RULE_APPLY_PLAN_SCHEMA_VERSION ||
    typeof input.run_id !== "string" ||
    !Array.isArray(input.targets) ||
    input.targets.length !== TARGET_SPECS.length ||
    !Array.isArray(input.decisions) ||
    !Array.isArray(input.retirements)
  ) {
    throw new RuleApplyTransactionError("invalid_plan")
  }
  try {
    validateRuleAuthoringId(input.run_id, "runId")
  } catch {
    throw new RuleApplyTransactionError("invalid_plan")
  }

  let aggregateBytes = 0
  const targets = input.targets.map((target, index) => {
    const [expectedAsset, expectedPath] = TARGET_SPECS[index]
    if (
      !isPlainObject(target) ||
      target.asset !== expectedAsset ||
      target.path !== expectedPath ||
      !isExpectedPreImage(target.expected_pre_image) ||
      typeof target.post_image_sha256 !== "string" ||
      !SHA256_PATTERN.test(target.post_image_sha256) ||
      !(target.bytes instanceof Uint8Array)
    ) {
      throw new RuleApplyTransactionError("invalid_plan")
    }
    const bytes = Buffer.from(target.bytes)
    aggregateBytes += bytes.byteLength
    if (
      bytes.byteLength > MAX_PLAN_TARGET_BYTES ||
      aggregateBytes > MAX_PLAN_TARGET_BYTES ||
      sha256(bytes) !== target.post_image_sha256
    ) {
      throw new RuleApplyTransactionError("invalid_plan")
    }
    return {
      asset: target.asset,
      path: target.path,
      expected_pre_image: structuredClone(target.expected_pre_image),
      post_image_sha256: target.post_image_sha256,
      bytes
    }
  })
  let metadata: ValidatedRuleApplyMetadata
  try {
    metadata = validateRuleApplyMetadata(input.decisions, input.retirements)
  } catch {
    throw new RuleApplyTransactionError("invalid_plan")
  }
  return {
    runId: input.run_id,
    targets,
    decisions: metadata.decisions,
    retirements: metadata.retirements
  }
}

function validateWorkspaceRoot(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\u0000")) {
    throw new RuleApplyTransactionError("unsafe_path")
  }
  return path.resolve(value)
}

function validateTransactionId(value: unknown): string {
  if (typeof value !== "string") throw new RuleApplyTransactionError("invalid_transaction_id")
  try {
    return validateRuleAuthoringId(value, "transactionId")
  } catch {
    throw new RuleApplyTransactionError("invalid_transaction_id")
  }
}

function validateRecoveryRequest(value: RuleApplyRecoveryRequest): RuleApplyRecoveryRequest {
  if (
    !isPlainObject(value) ||
    (value.action !== "rollback" && value.action !== "resume")
  ) {
    throw new RuleApplyTransactionError("recovery_incomplete")
  }
  return {
    action: value.action,
    now: requireCanonicalTimestamp(value.now, "recovery timestamp"),
    faultInjector: value.faultInjector,
    workspaceLockToken: value.workspaceLockToken
  }
}

function requireCanonicalTimestamp(value: unknown, _label: string): string {
  if (
    typeof value !== "string" ||
    !CANONICAL_TIMESTAMP.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new RuleApplyTransactionError("invalid_plan")
  }
  return value
}

function transactionPaths(workspaceRoot: string, transactionId: string): TransactionPaths {
  const authoring = getRuleAuthoringPaths(workspaceRoot, "run-probe")
  const transactionDirectory = path.join(authoring.transactionsDirectory, transactionId)
  const backupDirectory = path.join(authoring.backupsDirectory, transactionId)
  return {
    workspaceRoot,
    authoringDirectory: authoring.authoringDirectory,
    transactionsDirectory: authoring.transactionsDirectory,
    backupsDirectory: authoring.backupsDirectory,
    transactionDirectory,
    backupDirectory,
    stagingDirectory: path.join(transactionDirectory, "staging"),
    journalPath: path.join(transactionDirectory, "transaction-journal.json"),
    manifestPath: path.join(transactionDirectory, "apply-manifest.json"),
    applyLockDirectory: path.join(authoring.authoringDirectory, ".apply-lock")
  }
}

function targetAbsolutePath(workspaceRoot: string, asset: RuleApplyAsset): string {
  const paths = getProjectRulesPaths(workspaceRoot)
  switch (asset) {
    case "checklist": return paths.checklistPath
    case "project_context": return paths.contextPath
    case "prompt_addendum": return paths.addendumPath
    case "rule_sources": return paths.sourcesPath
    case "rule_provenance": return paths.provenancePath
  }
}

function stagingRelativePath(transactionId: string, asset: RuleApplyAsset): string {
  return `.bob/review/rule-authoring/transactions/${transactionId}/staging/${asset}.stage`
}

function backupRelativePath(transactionId: string, asset: RuleApplyAsset): string {
  return `.bob/review/rule-authoring/backups/${transactionId}/${asset}.backup`
}

function backupDirectoryRelativePath(transactionId: string): string {
  return `.bob/review/rule-authoring/backups/${transactionId}`
}

function absoluteWorkspacePath(workspaceRoot: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new RuleApplyTransactionError("unsafe_path")
  const target = path.resolve(workspaceRoot, ...relativePath.split("/"))
  const relative = path.relative(workspaceRoot, target)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new RuleApplyTransactionError("unsafe_path")
  }
  return target
}

async function withWorkspaceMutex<T>(
  paths: TransactionPaths,
  transactionId: string,
  work: () => Promise<T>
): Promise<T> {
  const mutexKey = paths.workspaceRoot
  if (WORKSPACE_MUTEXES.has(mutexKey)) {
    throw new RuleApplyTransactionError("workspace_busy", { transactionId })
  }
  WORKSPACE_MUTEXES.add(mutexKey)
  let outcome: { readonly ok: true; readonly value: T } |
    { readonly ok: false; readonly error: unknown } | undefined
  let lockFailure: unknown
  try {
    await assertWorkspaceRoot(paths.workspaceRoot)
    await ensureSafeDirectoryChain(paths.workspaceRoot, paths.applyLockDirectory)
    try {
      await withRuleAuthoringRotatingDirectoryLock(
        paths.workspaceRoot,
        paths.applyLockDirectory,
        async () => {
          try {
            outcome = { ok: true, value: await work() }
          } catch (error) {
            outcome = { ok: false, error }
          }
        }
      )
    } catch (error) {
      lockFailure = error
    }
  } finally {
    WORKSPACE_MUTEXES.delete(mutexKey)
  }
  if (outcome?.ok === false) throw outcome.error
  if (lockFailure !== undefined || outcome === undefined) {
    throw new RuleApplyTransactionError("workspace_busy", { transactionId })
  }
  return outcome.value
}

export async function withRuleApplyWorkspaceLock<T>(
  workspaceRootInput: string,
  operationIdInput: string,
  action: (workspaceLockToken: RuleApplyWorkspaceLockToken) => Promise<T> | T,
  existingToken?: RuleApplyWorkspaceLockToken
): Promise<T> {
  const workspaceRoot = validateWorkspaceRoot(workspaceRootInput)
  const operationId = validateTransactionId(operationIdInput)
  if (typeof action !== "function") {
    throw new RuleApplyTransactionError("workspace_busy", { transactionId: operationId })
  }
  if (existingToken !== undefined) {
    return withActiveWorkspaceLockToken(existingToken, workspaceRoot, operationId, () =>
      Promise.resolve(action(existingToken)))
  }
  const paths = transactionPaths(workspaceRoot, "transaction-probe")
  return withWorkspaceMutex(paths, operationId, async () => {
    const token = Object.freeze({
      [RULE_APPLY_WORKSPACE_LOCK_TOKEN]: true as const
    }) as RuleApplyWorkspaceLockToken
    const state: WorkspaceLockTokenState = {
      workspaceRoot,
      accepting: true,
      inFlight: 0,
      drainWaiters: []
    }
    WORKSPACE_LOCK_TOKENS.set(token, state)
    try {
      return await action(token)
    } finally {
      state.accepting = false
      if (state.inFlight > 0) {
        await new Promise<void>((resolve) => state.drainWaiters.push(resolve))
      }
      WORKSPACE_LOCK_TOKENS.delete(token)
    }
  })
}

async function withActiveWorkspaceLockToken<T>(
  token: RuleApplyWorkspaceLockToken,
  workspaceRoot: string,
  operationId: string,
  action: () => Promise<T>
): Promise<T> {
  const state = typeof token === "object" && token !== null
    ? WORKSPACE_LOCK_TOKENS.get(token)
    : undefined
  if (!state || !state.accepting || state.workspaceRoot !== workspaceRoot) {
    throw new RuleApplyTransactionError("workspace_busy", { transactionId: operationId })
  }
  state.inFlight += 1
  try {
    return await action()
  } finally {
    state.inFlight -= 1
    if (!state.accepting && state.inFlight === 0) {
      for (const resolve of state.drainWaiters.splice(0)) resolve()
    }
  }
}

async function assertWorkspaceRoot(workspaceRoot: string): Promise<void> {
  const stats = await lstatOptional(workspaceRoot)
  if (!stats || stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new RuleApplyTransactionError("unsafe_path")
  }
  const physical = await fs.realpath(workspaceRoot)
  if (!samePhysicalPath(physical, workspaceRoot)) {
    throw new RuleApplyTransactionError("unsafe_path")
  }
}

async function assertTransactionDoesNotExist(paths: TransactionPaths): Promise<void> {
  for (const candidate of [paths.transactionDirectory, paths.backupDirectory]) {
    if (await lstatOptional(candidate)) {
      throw new RuleApplyTransactionError("transaction_exists", {
        transactionId: path.basename(paths.transactionDirectory)
      })
    }
  }
}

async function assertNoIncompleteRuleApplyTransactions(
  workspaceRoot: string,
  transactionId: string
): Promise<void> {
  const incomplete = await findIncompleteRuleApplyTransactions(workspaceRoot)
  if (incomplete.some((transaction) => transaction.transaction_id !== transactionId)) {
    throw new RuleApplyTransactionError("recovery_incomplete", { transactionId })
  }
}

async function assertAllTargetPathsSafe(workspaceRoot: string): Promise<void> {
  for (const [asset] of TARGET_SPECS) {
    const target = targetAbsolutePath(workspaceRoot, asset)
    await ensureSafeDirectoryChain(workspaceRoot, path.dirname(target))
    const stats = await lstatOptional(target)
    if (stats && (stats.isSymbolicLink() || !stats.isFile())) {
      throw new RuleApplyTransactionError("unsafe_path")
    }
  }
}

async function ensureSafeDirectoryChain(workspaceRoot: string, targetDirectory: string): Promise<void> {
  const relative = path.relative(workspaceRoot, path.resolve(targetDirectory))
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new RuleApplyTransactionError("unsafe_path")
  }
  let current = workspaceRoot
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    let stats = await lstatOptional(current)
    if (!stats) {
      let created = false
      try {
        await fs.mkdir(current)
        created = true
      } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
          throw new RuleApplyTransactionError("filesystem_failure")
        }
      }
      if (created) {
        try {
          await fsyncDirectory(path.dirname(current))
        } catch {
          throw new RuleApplyTransactionError("filesystem_failure")
        }
      }
      stats = await lstatOptional(current)
    }
    if (!stats || stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new RuleApplyTransactionError("unsafe_path")
    }
  }
}

async function assertExistingDirectoryChain(workspaceRoot: string, targetDirectory: string): Promise<void> {
  const relative = path.relative(workspaceRoot, path.resolve(targetDirectory))
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new RuleApplyTransactionError("unsafe_path")
  }
  let current = workspaceRoot
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    const stats = await lstatOptional(current)
    if (!stats || stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new RuleApplyTransactionError("unsafe_path")
    }
  }
}

async function assertPreImage(
  workspaceRoot: string,
  target: Pick<RuleApplyPlanTarget, "asset" | "expected_pre_image">
): Promise<void> {
  const targetPath = targetAbsolutePath(workspaceRoot, target.asset)
  const stats = await lstatOptional(targetPath)
  if (target.expected_pre_image.state === "missing") {
    if (!stats) return
    if (stats.isSymbolicLink() || !stats.isFile()) throw new RuleApplyTransactionError("unsafe_path")
    throw new RuleApplyTransactionError("stale_pre_image")
  }
  if (!stats) throw new RuleApplyTransactionError("stale_pre_image")
  if (stats.isSymbolicLink() || !stats.isFile()) throw new RuleApplyTransactionError("unsafe_path")
  const bytes = await readRegularFileBounded(
    workspaceRoot,
    targetPath,
    MAX_PLAN_TARGET_BYTES,
    "unsafe_path"
  )
  if (sha256(bytes) !== target.expected_pre_image.sha256) {
    throw new RuleApplyTransactionError("stale_pre_image")
  }
}

async function readTargetForExpectedPreImage(
  workspaceRoot: string,
  target: RuleApplyPlanTarget
): Promise<Buffer> {
  if (target.expected_pre_image.state !== "present") {
    throw new RuleApplyTransactionError("invalid_plan")
  }
  await assertPreImage(workspaceRoot, target)
  const bytes = await readRegularFileBounded(
    workspaceRoot,
    targetAbsolutePath(workspaceRoot, target.asset),
    MAX_PLAN_TARGET_BYTES,
    "unsafe_path"
  )
  if (sha256(bytes) !== target.expected_pre_image.sha256) {
    throw new RuleApplyTransactionError("stale_pre_image")
  }
  return bytes
}

async function assertLivePostImage(
  workspaceRoot: string,
  target: Pick<RuleApplyTransactionTargetV1, "asset" | "post_image_sha256">
): Promise<void> {
  const targetPath = targetAbsolutePath(workspaceRoot, target.asset)
  try {
    await assertFileHash(workspaceRoot, targetPath, target.post_image_sha256, MAX_PLAN_TARGET_BYTES)
  } catch (error) {
    if (error instanceof RuleApplyTransactionError && error.code === "unsafe_path") throw error
    throw new RuleApplyTransactionError("filesystem_failure")
  }
}

async function assertFileHash(
  workspaceRoot: string,
  filePath: string,
  expectedHash: string,
  maxBytes: number
): Promise<void> {
  const bytes = await readRegularFileBounded(workspaceRoot, filePath, maxBytes, "unsafe_path")
  if (sha256(bytes) !== expectedHash) throw new RuleApplyTransactionError("filesystem_failure")
}

async function readRegularFileBounded(
  workspaceRoot: string,
  filePath: string,
  maxBytes: number,
  errorCode: RuleApplyTransactionErrorCode
): Promise<Buffer> {
  const resolved = path.resolve(filePath)
  const relative = path.relative(workspaceRoot, resolved)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new RuleApplyTransactionError("unsafe_path")
  }
  await assertExistingDirectoryChain(workspaceRoot, path.dirname(resolved))
  const before = await lstatOptional(resolved)
  if (!before || before.isSymbolicLink() || !before.isFile()) {
    throw new RuleApplyTransactionError(errorCode)
  }
  if (before.size > maxBytes) throw new RuleApplyTransactionError(errorCode)

  let handle: fs.FileHandle
  try {
    handle = await fs.open(resolved, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
  } catch (error) {
    if (isNodeError(error) && error.code === "ELOOP") throw new RuleApplyTransactionError("unsafe_path")
    throw new RuleApplyTransactionError(errorCode)
  }
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || !sameIdentity(before, opened) || opened.size > maxBytes) {
      throw new RuleApplyTransactionError(errorCode)
    }
    const bytes = await handle.readFile()
    if (bytes.byteLength > maxBytes) throw new RuleApplyTransactionError(errorCode)
    const afterHandle = await handle.stat()
    const afterPath = await lstatOptional(resolved)
    if (
      !afterPath ||
      afterPath.isSymbolicLink() ||
      !afterPath.isFile() ||
      !sameIdentity(opened, afterHandle) ||
      !sameIdentity(afterHandle, afterPath) ||
      afterHandle.size !== bytes.byteLength
    ) {
      throw new RuleApplyTransactionError(errorCode)
    }
    return Buffer.from(bytes)
  } finally {
    await handle.close()
  }
}

async function atomicWriteFile(
  workspaceRoot: string,
  destination: string,
  bytes: Uint8Array,
  allowReplace: boolean,
  beforeRename?: () => Promise<void>
): Promise<void> {
  const resolved = path.resolve(destination)
  const relative = path.relative(workspaceRoot, resolved)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new RuleApplyTransactionError("unsafe_path")
  }
  await ensureSafeDirectoryChain(workspaceRoot, path.dirname(resolved))
  if (!allowReplace && await lstatOptional(resolved)) {
    throw new RuleApplyTransactionError("filesystem_failure")
  }
  const temporaryPath = path.join(
    path.dirname(resolved),
    `.${path.basename(resolved)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`
  )
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(
      temporaryPath,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        (fsConstants.O_NOFOLLOW ?? 0),
      0o600
    )
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = undefined
    if (beforeRename) await beforeRename()
    await assertExistingDirectoryChain(workspaceRoot, path.dirname(resolved))
    const tempStats = await fs.lstat(temporaryPath)
    if (tempStats.isSymbolicLink() || !tempStats.isFile()) {
      throw new RuleApplyTransactionError("unsafe_path")
    }
    await fs.rename(temporaryPath, resolved)
    await fsyncDirectory(path.dirname(resolved))
    const installed = await fs.lstat(resolved)
    if (installed.isSymbolicLink() || !installed.isFile()) {
      throw new RuleApplyTransactionError("unsafe_path")
    }
  } catch (error) {
    if (handle) {
      try { await handle.close() } catch { /* best effort */ }
    }
    try { await fs.unlink(temporaryPath) } catch { /* best effort */ }
    if (error instanceof RuleApplyTransactionError) throw error
    throw new RuleApplyTransactionError("filesystem_failure")
  }
}

async function atomicWriteJson(
  workspaceRoot: string,
  destination: string,
  value: unknown
): Promise<void> {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8")
  if (bytes.byteLength > MAX_JOURNAL_BYTES) throw new RuleApplyTransactionError("filesystem_failure")
  await atomicWriteFile(workspaceRoot, destination, bytes, true)
}

async function writeJournal(
  paths: TransactionPaths,
  journal: RuleApplyTransactionJournalV1,
  faultInjector?: RuleApplyFaultInjector
): Promise<void> {
  await atomicWriteJson(paths.workspaceRoot, paths.journalPath, journal)
  await emit(faultInjector, {
    operation: "journal_persisted",
    transactionId: journal.transaction_id,
    status: journal.status
  })
}

async function readJournal(paths: TransactionPaths): Promise<RuleApplyTransactionJournalV1> {
  let parsed: unknown
  try {
    const bytes = await readRegularFileBounded(
      paths.workspaceRoot,
      paths.journalPath,
      MAX_JOURNAL_BYTES,
      "unsafe_journal"
    )
    parsed = JSON.parse(bytes.toString("utf8"))
  } catch (error) {
    if (error instanceof RuleApplyTransactionError) throw error
    throw new RuleApplyTransactionError("unsafe_journal")
  }
  validateJournal(parsed, paths)
  return parsed
}

function validateJournal(
  value: unknown,
  paths: TransactionPaths
): asserts value is RuleApplyTransactionJournalV1 {
  if (
    !isPlainObject(value) ||
    value.schema_version !== RULE_APPLY_TRANSACTION_SCHEMA_VERSION ||
    value.transaction_id !== path.basename(paths.transactionDirectory) ||
    !isValidRuleAuthoringId(value.run_id) ||
    !isTransactionStatus(value.status) ||
    !isCanonicalTimestamp(value.created_at) ||
    !isCanonicalTimestamp(value.updated_at) ||
    !Array.isArray(value.targets) ||
    value.targets.length !== TARGET_SPECS.length ||
    !Array.isArray(value.decisions) ||
    !Array.isArray(value.retirements) ||
    !isOptionalSafeCode(value.error_code) ||
    !isOptionalSafeCode(value.rollback_error_code)
  ) {
    throw new RuleApplyTransactionError("unsafe_journal")
  }
  for (const [index, target] of value.targets.entries()) {
    const [asset, targetPath] = TARGET_SPECS[index]
    const expectedBackup = isPlainObject(target) && target.expected_pre_image?.state === "present"
      ? backupRelativePath(value.transaction_id, asset)
      : null
    if (
      !isPlainObject(target) ||
      target.asset !== asset ||
      target.path !== targetPath ||
      !isExpectedPreImage(target.expected_pre_image) ||
      typeof target.post_image_sha256 !== "string" ||
      !SHA256_PATTERN.test(target.post_image_sha256) ||
      !isTargetStatus(target.state) ||
      target.backup_path !== expectedBackup ||
      target.staging_path !== stagingRelativePath(value.transaction_id, asset)
    ) {
      throw new RuleApplyTransactionError("unsafe_journal")
    }
  }
  try {
    const metadata = validateRuleApplyMetadata(value.decisions, value.retirements)
    value.decisions = metadata.decisions
    value.retirements = metadata.retirements
  } catch {
    throw new RuleApplyTransactionError("unsafe_journal")
  }
  if (value.status === "committed" && value.targets.some(({ state }) => state !== "replaced")) {
    throw new RuleApplyTransactionError("unsafe_journal")
  }
  if (value.status === "rolled_back" && value.targets.some(({ state }) => state === "replaced")) {
    throw new RuleApplyTransactionError("unsafe_journal")
  }
}

async function readManifest(
  paths: TransactionPaths,
  journal: RuleApplyTransactionJournalV1
): Promise<ApplyManifestV1> {
  let parsed: unknown
  try {
    const bytes = await readRegularFileBounded(
      paths.workspaceRoot,
      paths.manifestPath,
      MAX_MANIFEST_BYTES,
      "unsafe_journal"
    )
    parsed = JSON.parse(bytes.toString("utf8"))
  } catch (error) {
    if (error instanceof RuleApplyTransactionError) throw error
    throw new RuleApplyTransactionError("unsafe_journal")
  }
  if (
    !isPlainObject(parsed) ||
    !hasExactKeys(parsed, [
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
    parsed.schema_version !== APPLY_MANIFEST_SCHEMA_VERSION ||
    parsed.transaction_id !== journal.transaction_id ||
    parsed.run_id !== journal.run_id ||
    parsed.status !== "committed" ||
    !isCanonicalTimestamp(parsed.committed_at) ||
    parsed.backup_directory !== backupDirectoryRelativePath(journal.transaction_id) ||
    !Array.isArray(parsed.targets) ||
    parsed.targets.length !== journal.targets.length ||
    !Array.isArray(parsed.decisions) ||
    !Array.isArray(parsed.retirements)
  ) {
    throw new RuleApplyTransactionError("unsafe_journal")
  }
  for (const [index, target] of parsed.targets.entries()) {
    const expected = journal.targets[index]
    if (
      !isPlainObject(target) ||
      !hasExactKeys(target, [
        "asset",
        "path",
        "expected_pre_image",
        "post_image_sha256",
        "state"
      ]) ||
      target.asset !== expected.asset ||
      target.path !== expected.path ||
      target.state !== "replaced" ||
      target.post_image_sha256 !== expected.post_image_sha256 ||
      JSON.stringify(target.expected_pre_image) !== JSON.stringify(expected.expected_pre_image)
    ) {
      throw new RuleApplyTransactionError("unsafe_journal")
    }
  }
  if (!ruleApplyMetadataEquals(
    parsed.decisions,
    parsed.retirements,
    journal.decisions,
    journal.retirements
  )) {
    throw new RuleApplyTransactionError("unsafe_journal")
  }
  const metadata = validateRuleApplyMetadata(parsed.decisions, parsed.retirements)
  return {
    ...structuredClone(parsed),
    decisions: metadata.decisions,
    retirements: metadata.retirements
  } as unknown as ApplyManifestV1
}

async function emit(
  faultInjector: RuleApplyFaultInjector | undefined,
  event: RuleApplyFaultEvent
): Promise<void> {
  if (faultInjector) await faultInjector(Object.freeze({ ...event }))
}

async function fsyncDirectory(directory: string): Promise<void> {
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(directory, fsConstants.O_RDONLY)
    await handle.sync()
  } catch (error) {
    if (
      !isNodeError(error) ||
      !["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EBADF"].includes(error.code ?? "")
    ) {
      throw error
    }
  } finally {
    if (handle) await handle.close()
  }
}

function assertMetadataSerializable(value: unknown): void {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new RuleApplyTransactionError("invalid_plan")
  }
  if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > MAX_JOURNAL_BYTES) {
    throw new RuleApplyTransactionError("invalid_plan")
  }
}

function isExpectedPreImage(value: unknown): value is RuleApplyExpectedPreImage {
  return isPlainObject(value) && (
    (value.state === "missing" && Object.keys(value).length === 1) ||
    (
      value.state === "present" &&
      Object.keys(value).length === 2 &&
      typeof value.sha256 === "string" &&
      SHA256_PATTERN.test(value.sha256)
    )
  )
}

function isTransactionStatus(value: unknown): value is RuleApplyTransactionStatus {
  return [
    "prepared",
    "applying",
    "rolling_back",
    "rolled_back",
    "rollback_failed",
    "committed"
  ].includes(String(value))
}

function isTargetStatus(value: unknown): value is RuleApplyTargetStatus {
  return value === "prepared" || value === "replaced" || value === "restored"
}

function isCanonicalTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    CANONICAL_TIMESTAMP.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
}

function isValidRuleAuthoringId(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    return validateRuleAuthoringId(value, "runId") === value
  } catch {
    return false
  }
}

function isOptionalSafeCode(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && SAFE_CODE.test(value))
}

function sameIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

async function lstatOptional(filePath: string): Promise<Stats | undefined> {
  try {
    return await fs.lstat(filePath)
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined
    throw error
  }
}

function failureCode(error: unknown): RuleApplyTransactionErrorCode {
  if (error instanceof RuleApplyTransactionError) return error.code
  return "filesystem_failure"
}

function requiredString(value: string | null): string {
  if (value === null) throw new RuleApplyTransactionError("unsafe_journal")
  return value
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function samePhysicalPath(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left)
  const normalizedRight = path.resolve(right)
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText)
  const sorted = [...expected].sort(compareText)
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index])
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value
}

function errorMessage(code: RuleApplyTransactionErrorCode): string {
  switch (code) {
    case "workspace_busy": return "Another project-rule transaction is already active."
    case "unsafe_path": return "Project-rule transaction path safety validation failed."
    case "stale_pre_image": return "Approved asset changed before transactional replacement."
    case "rollback_failed": return "Project-rule transaction rollback did not restore every target."
    case "invalid_transaction_id": return "Transaction ID must be a validated safe path segment."
    case "transaction_exists": return "Project-rule transaction ID is already in use."
    case "unsafe_journal": return "Project-rule transaction journal failed validation."
    case "recovery_incomplete": return "Project-rule transaction cannot be recovered with that action."
    case "invalid_plan": return "Project-rule apply plan failed validation."
    case "filesystem_failure": return "Project-rule transaction failed during filesystem mutation."
  }
}
