import { DEFAULT_RULE_AUTHORING_LIMITS } from "./ruleAuthoringLimits"
import { validateRuleAuthoringId } from "./ruleAuthoringPaths"
import {
  ProposedMarkdownOperationV1,
  RuleProposalConflictV1,
  RuleProposalOperationV1,
  EXISTING_RULE_ID_PATTERN,
  RULE_PROPOSAL_SCHEMA_LIMITS,
  RuleProposalSchemaError,
  RuleProposalSourceRefV1,
  RuleProposalV1,
  validateRuleProposalSchema
} from "./ruleProposalSchema"

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SOURCE_ID_PATTERN = /^src-[a-f0-9]{12,64}$/
const CHUNK_ID_PATTERN = /^chunk-[a-f0-9]{64}$/
const RULE_ID_PATTERN = new RegExp(EXISTING_RULE_ID_PATTERN, "u")
const CONTEXT_ID_PATTERN = /^CTX-(?!0000$)[0-9]{4}$/
const PROMPT_ID_PATTERN = /^PRM-(?!0000$)[0-9]{4}$/
const DISALLOWED_MARKDOWN_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/
const ANY_CONTROL = /[\u0000-\u001f\u007f-\u009f]/
const MANAGED_SECTION_MARKER = /bob-managed-section/i
const MAX_ISSUES = 100
const MAX_ISSUE_PATH_LENGTH = 256
const MAX_CONTEXT_ASSET_IDS = 9_999
const MAX_CONTEXT_EVIDENCE_ITEMS = Math.floor(
  DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes / 128
)

export interface RuleProposalValidationEvidenceItem {
  readonly source_id: string
  readonly chunk_id: string
}

export interface RuleProposalValidationContext {
  readonly runId: string
  readonly base: {
    readonly checklistSha256: string
    readonly projectContextSha256: string
    readonly promptAddendumSha256: string
  }
  readonly existingRuleIds: readonly string[]
  readonly existingProjectContextSectionIds: readonly string[]
  readonly existingPromptAddendumSectionIds: readonly string[]
  readonly selectedEvidence: readonly RuleProposalValidationEvidenceItem[]
}

export interface RuleProposalValidationIssue {
  path: string
  code: string
  message: string
  operationId?: string
}

export type RuleProposalValidationResult =
  | { valid: true; proposal: RuleProposalV1 }
  | { valid: false; issues: RuleProposalValidationIssue[] }

interface ValidatedContext {
  runId: string
  base: RuleProposalValidationContext["base"]
  existingRuleIds: ReadonlySet<string>
  existingProjectContextSectionIds: ReadonlySet<string>
  existingPromptAddendumSectionIds: ReadonlySet<string>
  evidenceSourceByChunkId: ReadonlyMap<string, string>
}

interface CandidateEntry {
  candidateId: string
  operationId: string
  conflictIds: readonly string[]
  path: string
}

export function parseAndValidateRuleProposal(
  raw: string,
  context: RuleProposalValidationContext
): RuleProposalValidationResult {
  const validatedContext = validateContext(context)

  if (typeof raw !== "string") {
    return invalidResult([issue("/", "raw_type", "Proposal input must be a JSON string.")])
  }
  if (Buffer.byteLength(raw, "utf8") > DEFAULT_RULE_AUTHORING_LIMITS.maxProposalBytes) {
    return invalidResult([issue("/", "raw_too_large", "Proposal input exceeds the byte limit.")])
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return invalidResult([issue("/", "invalid_json", "Proposal input must contain exactly one JSON value.")])
  }

  if (!isPlainObject(parsed)) {
    return invalidResult([issue("/", "object_required", "Proposal input must be one JSON object.")])
  }

  const limitIssue = preflightCollectionLimits(parsed)
  if (limitIssue) return invalidResult([limitIssue])

  const schemaResult = validateRuleProposalSchema(parsed)
  if (!schemaResult.valid) {
    return invalidResult(normalizeSchemaErrors(schemaResult.errors))
  }

  const issues = new IssueCollector()
  validateIdentityAndBase(schemaResult.proposal, validatedContext, issues)
  const candidates = validateOperations(schemaResult.proposal, validatedContext, issues)
  validateConflicts(schemaResult.proposal.conflicts, candidates, validatedContext, issues)

  if (issues.items.length > 0) return invalidResult(issues.items)
  return { valid: true, proposal: schemaResult.proposal }
}

function preflightCollectionLimits(value: Record<string, unknown>): RuleProposalValidationIssue | undefined {
  const topLevelChecks: ReadonlyArray<[string, number]> = [
    ["operations", RULE_PROPOSAL_SCHEMA_LIMITS.maxRuleOperations],
    ["conflicts", RULE_PROPOSAL_SCHEMA_LIMITS.maxConflicts],
    ["project_context_operations", RULE_PROPOSAL_SCHEMA_LIMITS.maxProjectContextOperations],
    ["prompt_addendum_operations", RULE_PROPOSAL_SCHEMA_LIMITS.maxPromptAddendumOperations]
  ]
  for (const [field, limit] of topLevelChecks) {
    if (arrayExceeds(value[field], limit)) return collectionLimitIssue(`/${field}`)
  }

  for (const field of ["operations", "project_context_operations", "prompt_addendum_operations"] as const) {
    const operations = value[field]
    if (!Array.isArray(operations)) continue
    for (const [index, operation] of operations.entries()) {
      if (!isPlainObject(operation)) continue
      if (arrayExceeds(operation.source_refs, RULE_PROPOSAL_SCHEMA_LIMITS.maxSourceRefs)) {
        return collectionLimitIssue(`/${field}/${index}/source_refs`)
      }
      if (arrayExceeds(operation.conflict_ids, RULE_PROPOSAL_SCHEMA_LIMITS.maxConflictRefs)) {
        return collectionLimitIssue(`/${field}/${index}/conflict_ids`)
      }
      if (field === "operations" && isPlainObject(operation.rule)) {
        if (arrayExceeds(operation.rule.applies_when, RULE_PROPOSAL_SCHEMA_LIMITS.maxAppliesWhen)) {
          return collectionLimitIssue(`/${field}/${index}/rule/applies_when`)
        }
      }
    }
  }

  const conflicts = value.conflicts
  if (!Array.isArray(conflicts)) return undefined
  for (const [index, conflict] of conflicts.entries()) {
    if (!isPlainObject(conflict)) continue
    if (arrayExceeds(conflict.source_refs, RULE_PROPOSAL_SCHEMA_LIMITS.maxSourceRefs)) {
      return collectionLimitIssue(`/conflicts/${index}/source_refs`)
    }
    if (arrayExceeds(conflict.affected_candidate_ids, RULE_PROPOSAL_SCHEMA_LIMITS.maxAffectedCandidates)) {
      return collectionLimitIssue(`/conflicts/${index}/affected_candidate_ids`)
    }
    if (arrayExceeds(conflict.alternatives, RULE_PROPOSAL_SCHEMA_LIMITS.maxAlternatives)) {
      return collectionLimitIssue(`/conflicts/${index}/alternatives`)
    }
    if (!Array.isArray(conflict.alternatives)) continue
    for (const [alternativeIndex, alternative] of conflict.alternatives.entries()) {
      if (
        isPlainObject(alternative) &&
        arrayExceeds(alternative.source_refs, RULE_PROPOSAL_SCHEMA_LIMITS.maxSourceRefs)
      ) {
        return collectionLimitIssue(`/conflicts/${index}/alternatives/${alternativeIndex}/source_refs`)
      }
    }
  }
  return undefined
}

function arrayExceeds(value: unknown, limit: number): boolean {
  return Array.isArray(value) && value.length > limit
}

function collectionLimitIssue(path: string): RuleProposalValidationIssue {
  return issue(path, "schema_invalid", "Proposal array exceeds its item limit.")
}

function validateIdentityAndBase(
  proposal: RuleProposalV1,
  context: ValidatedContext,
  issues: IssueCollector
): void {
  if (proposal.run_id !== context.runId) {
    issues.add("/run_id", "run_mismatch", "Proposal run does not match the active run.")
  }
  const baseChecks: ReadonlyArray<{
    proposalValue: string
    contextValue: string
    path: string
  }> = [
    {
      proposalValue: proposal.base.checklist_sha256,
      contextValue: context.base.checklistSha256,
      path: "/base/checklist_sha256"
    },
    {
      proposalValue: proposal.base.project_context_sha256,
      contextValue: context.base.projectContextSha256,
      path: "/base/project_context_sha256"
    },
    {
      proposalValue: proposal.base.prompt_addendum_sha256,
      contextValue: context.base.promptAddendumSha256,
      path: "/base/prompt_addendum_sha256"
    }
  ]
  for (const check of baseChecks) {
    if (check.proposalValue !== check.contextValue) {
      issues.add(check.path, "stale_base", "Proposal base does not match the current approved asset.")
    }
  }
}

function validateOperations(
  proposal: RuleProposalV1,
  context: ValidatedContext,
  issues: IssueCollector
): Map<string, CandidateEntry> {
  const candidates = new Map<string, CandidateEntry>()
  const ruleTargets = new Set<string>()
  const contextTargets = new Set<string>()
  const promptTargets = new Set<string>()

  for (const [index, operation] of proposal.operations.entries()) {
    const path = `/operations/${index}`
    registerCandidate(operation, path, candidates, issues)
    validateRuleOperation(operation, path, context.existingRuleIds, ruleTargets, issues)
    validateSourceRefs(operation.source_refs, `${path}/source_refs`, diagnosticOperationId(path), context, issues)
    if (operation.rule) validateAppliesWhen(operation, path, issues)
  }
  for (const [index, operation] of proposal.project_context_operations.entries()) {
    const path = `/project_context_operations/${index}`
    registerCandidate(operation, path, candidates, issues)
    validateMarkdownOperation(
      operation,
      path,
      context.existingProjectContextSectionIds,
      contextTargets,
      issues
    )
    validateSourceRefs(operation.source_refs, `${path}/source_refs`, diagnosticOperationId(path), context, issues)
    validateManagedMarkdownText(operation, path, issues)
  }
  for (const [index, operation] of proposal.prompt_addendum_operations.entries()) {
    const path = `/prompt_addendum_operations/${index}`
    registerCandidate(operation, path, candidates, issues)
    validateMarkdownOperation(
      operation,
      path,
      context.existingPromptAddendumSectionIds,
      promptTargets,
      issues
    )
    validateSourceRefs(operation.source_refs, `${path}/source_refs`, diagnosticOperationId(path), context, issues)
    validateManagedMarkdownText(operation, path, issues)
  }
  return candidates
}

function registerCandidate(
  operation: RuleProposalOperationV1 | ProposedMarkdownOperationV1,
  path: string,
  candidates: Map<string, CandidateEntry>,
  issues: IssueCollector
): void {
  if (candidates.has(operation.candidate_id)) {
    issues.add(
      `${path}/candidate_id`,
      "duplicate_candidate_id",
      "Candidate identifiers must be globally unique.",
      diagnosticOperationId(path)
    )
    return
  }
  candidates.set(operation.candidate_id, {
    candidateId: operation.candidate_id,
    operationId: diagnosticOperationId(path),
    conflictIds: operation.conflict_ids,
    path
  })
}

function validateRuleOperation(
  operation: RuleProposalOperationV1,
  path: string,
  existingIds: ReadonlySet<string>,
  mutatedTargets: Set<string>,
  issues: IssueCollector
): void {
  const operationId = diagnosticOperationId(path)
  const matrixIsValid = operation.operation === "add"
    ? operation.target_rule_id === null && operation.rule !== null
    : operation.operation === "update"
      ? operation.target_rule_id !== null && operation.rule !== null
      : operation.target_rule_id !== null && operation.rule === null
  if (!matrixIsValid) {
    issues.add(path, "operation_matrix", "Rule operation fields do not match the operation kind.", operationId)
  }

  if (operation.operation !== "add" && operation.target_rule_id !== null) {
    if (!existingIds.has(operation.target_rule_id)) {
      issues.add(
        `${path}/target_rule_id`,
        "missing_target",
        "Rule operation target does not exist in the current asset.",
        operationId
      )
    }
    registerMutatedTarget(operation.target_rule_id, `${path}/target_rule_id`, operationId, mutatedTargets, issues)
  }
}

function validateMarkdownOperation(
  operation: ProposedMarkdownOperationV1,
  path: string,
  existingIds: ReadonlySet<string>,
  mutatedTargets: Set<string>,
  issues: IssueCollector
): void {
  const operationId = diagnosticOperationId(path)
  const hasContent = operation.heading !== null && operation.markdown !== null
  const hasNoContent = operation.heading === null && operation.markdown === null
  const matrixIsValid = operation.operation === "add"
    ? operation.target_section_id === null && hasContent
    : operation.operation === "update"
      ? operation.target_section_id !== null && hasContent
      : operation.target_section_id !== null && hasNoContent
  if (!matrixIsValid) {
    issues.add(
      path,
      "operation_matrix",
      "Managed Markdown fields do not match the operation kind.",
      operationId
    )
  }

  if (operation.operation !== "add" && operation.target_section_id !== null) {
    if (!existingIds.has(operation.target_section_id)) {
      issues.add(
        `${path}/target_section_id`,
        "missing_target",
        "Managed Markdown target does not exist in the current asset.",
        operationId
      )
    }
    registerMutatedTarget(
      operation.target_section_id,
      `${path}/target_section_id`,
      operationId,
      mutatedTargets,
      issues
    )
  }
}

function registerMutatedTarget(
  targetId: string,
  path: string,
  operationId: string,
  mutatedTargets: Set<string>,
  issues: IssueCollector
): void {
  if (mutatedTargets.has(targetId)) {
    issues.add(path, "duplicate_target", "An existing target may be mutated only once per asset.", operationId)
  } else {
    mutatedTargets.add(targetId)
  }
}

function validateAppliesWhen(
  operation: RuleProposalOperationV1,
  path: string,
  issues: IssueCollector
): void {
  const operationId = diagnosticOperationId(path)
  for (const [index, condition] of operation.rule?.applies_when.entries() ?? []) {
    const prefix = condition.startsWith("changed_file_matches:")
      ? "changed_file_matches:"
      : condition.startsWith("diff_contains:")
        ? "diff_contains:"
        : undefined
    const payload = prefix ? condition.slice(prefix.length) : ""
    if (!prefix || payload.length === 0 || ANY_CONTROL.test(condition)) {
      issues.add(
        `${path}/rule/applies_when/${index}`,
        "invalid_applies_when",
        "Rule applicability condition is not an allowed inert value.",
        operationId
      )
    }
  }
}

function validateManagedMarkdownText(
  operation: ProposedMarkdownOperationV1,
  path: string,
  issues: IssueCollector
): void {
  const operationId = diagnosticOperationId(path)
  for (const [field, value] of [
    ["heading", operation.heading],
    ["markdown", operation.markdown]
  ] as const) {
    if (value === null) continue
    if (field === "heading" && /[\r\n]/.test(value)) {
      issues.add(
        `${path}/${field}`,
        "control_character",
        "Managed Markdown heading must be a single line.",
        operationId
      )
    }
    if (field === "heading" && value.trim().length === 0) {
      issues.add(
        `${path}/${field}`,
        "invalid_heading",
        "Managed Markdown heading must contain non-whitespace text.",
        operationId
      )
    }
    if (DISALLOWED_MARKDOWN_CONTROL.test(value)) {
      issues.add(
        `${path}/${field}`,
        "control_character",
        "Managed Markdown text contains a disallowed control character.",
        operationId
      )
    }
    if (MANAGED_SECTION_MARKER.test(value)) {
      issues.add(
        `${path}/${field}`,
        "managed_marker",
        "Managed Markdown text must not contain managed-section marker text.",
        operationId
      )
    }
  }
}

function validateConflicts(
  conflicts: readonly RuleProposalConflictV1[],
  candidates: ReadonlyMap<string, CandidateEntry>,
  context: ValidatedContext,
  issues: IssueCollector
): void {
  const conflictsById = new Map<string, RuleProposalConflictV1>()
  for (const [index, conflict] of conflicts.entries()) {
    const path = `/conflicts/${index}`
    if (conflictsById.has(conflict.conflict_id)) {
      issues.add(`${path}/conflict_id`, "duplicate_conflict_id", "Conflict identifiers must be unique.")
    } else {
      conflictsById.set(conflict.conflict_id, conflict)
    }
    validateSourceRefs(conflict.source_refs, `${path}/source_refs`, undefined, context, issues)

    const affected = new Set<string>()
    for (const [affectedIndex, candidateId] of conflict.affected_candidate_ids.entries()) {
      if (affected.has(candidateId)) {
        issues.add(
          `${path}/affected_candidate_ids/${affectedIndex}`,
          "duplicate_candidate_ref",
          "A conflict must not reference the same candidate more than once."
        )
      } else {
        affected.add(candidateId)
      }
      const candidate = candidates.get(candidateId)
      if (!candidate) {
        issues.add(
          `${path}/affected_candidate_ids/${affectedIndex}`,
          "unknown_candidate",
          "Conflict references an unknown candidate."
        )
      } else if (!candidate.conflictIds.includes(conflict.conflict_id)) {
        issues.add(
          `${path}/affected_candidate_ids/${affectedIndex}`,
          "conflict_graph_mismatch",
          "Conflict and candidate references must agree in both directions.",
          candidate.operationId
        )
      }
    }

    const alternativeIds = new Set<string>()
    for (const [alternativeIndex, alternative] of conflict.alternatives.entries()) {
      const alternativePath = `${path}/alternatives/${alternativeIndex}`
      if (alternativeIds.has(alternative.alternative_id)) {
        issues.add(
          `${alternativePath}/alternative_id`,
          "duplicate_alternative_id",
          "Alternative identifiers must be unique within a conflict."
        )
      } else {
        alternativeIds.add(alternative.alternative_id)
      }
      validateSourceRefs(alternative.source_refs, `${alternativePath}/source_refs`, undefined, context, issues)
    }
  }

  for (const candidate of candidates.values()) {
    const seen = new Set<string>()
    for (const [index, conflictId] of candidate.conflictIds.entries()) {
      if (seen.has(conflictId)) {
        issues.add(
          `${candidate.path}/conflict_ids/${index}`,
          "duplicate_conflict_ref",
          "A candidate must not reference the same conflict more than once.",
          candidate.operationId
        )
      } else {
        seen.add(conflictId)
      }
      const conflict = conflictsById.get(conflictId)
      if (!conflict) {
        issues.add(
          `${candidate.path}/conflict_ids/${index}`,
          "unknown_conflict",
          "Candidate references an unknown conflict.",
          candidate.operationId
        )
      } else if (!conflict.affected_candidate_ids.includes(candidate.candidateId)) {
        issues.add(
          `${candidate.path}/conflict_ids/${index}`,
          "conflict_graph_mismatch",
          "Conflict and candidate references must agree in both directions.",
          candidate.operationId
        )
      }
    }
  }
}

function validateSourceRefs(
  refs: readonly RuleProposalSourceRefV1[],
  path: string,
  operationId: string | undefined,
  context: ValidatedContext,
  issues: IssueCollector
): void {
  const seen = new Set<string>()
  for (const [index, ref] of refs.entries()) {
    const refPath = `${path}/${index}`
    const key = `${ref.source_id}\u0000${ref.chunk_id}`
    if (seen.has(key)) {
      issues.add(refPath, "duplicate_source_ref", "Source references must be unique within their list.", operationId)
    } else {
      seen.add(key)
    }

    const expectedSourceId = context.evidenceSourceByChunkId.get(ref.chunk_id)
    if (expectedSourceId === undefined) {
      issues.add(refPath, "unknown_source_ref", "Source reference is not in the selected evidence.", operationId)
    } else if (expectedSourceId !== ref.source_id) {
      issues.add(
        refPath,
        "source_ownership_mismatch",
        "Source reference does not match selected chunk ownership.",
        operationId
      )
    }
  }
}

function validateContext(context: RuleProposalValidationContext): ValidatedContext {
  if (!isPlainObject(context)) throw invalidContext()

  try {
    if (typeof context.runId !== "string") throw invalidContext()
    validateRuleAuthoringId(context.runId, "context.runId")
  } catch {
    throw invalidContext()
  }
  if (!isPlainObject(context.base)) throw invalidContext()
  const hashes = [
    context.base.checklistSha256,
    context.base.projectContextSha256,
    context.base.promptAddendumSha256
  ]
  if (hashes.some((hash) => typeof hash !== "string" || !SHA256_PATTERN.test(hash))) {
    throw invalidContext()
  }

  const existingRuleIds = validateContextIds(context.existingRuleIds, RULE_ID_PATTERN)
  const existingProjectContextSectionIds = validateContextIds(
    context.existingProjectContextSectionIds,
    CONTEXT_ID_PATTERN
  )
  const existingPromptAddendumSectionIds = validateContextIds(
    context.existingPromptAddendumSectionIds,
    PROMPT_ID_PATTERN
  )
  if (!Array.isArray(context.selectedEvidence) || context.selectedEvidence.length > MAX_CONTEXT_EVIDENCE_ITEMS) {
    throw invalidContext()
  }
  const evidenceSourceByChunkId = new Map<string, string>()
  for (const ref of context.selectedEvidence) {
    if (
      !isPlainObject(ref) ||
      typeof ref.source_id !== "string" ||
      typeof ref.chunk_id !== "string" ||
      !SOURCE_ID_PATTERN.test(ref.source_id) ||
      !CHUNK_ID_PATTERN.test(ref.chunk_id) ||
      evidenceSourceByChunkId.has(ref.chunk_id)
    ) {
      throw invalidContext()
    }
    evidenceSourceByChunkId.set(ref.chunk_id, ref.source_id)
  }

  return {
    runId: context.runId,
    base: context.base,
    existingRuleIds,
    existingProjectContextSectionIds,
    existingPromptAddendumSectionIds,
    evidenceSourceByChunkId
  }
}

function validateContextIds(value: readonly string[], pattern: RegExp): ReadonlySet<string> {
  if (!Array.isArray(value) || value.length > MAX_CONTEXT_ASSET_IDS) throw invalidContext()
  const result = new Set<string>()
  for (const id of value) {
    if (typeof id !== "string" || !pattern.test(id) || result.has(id)) throw invalidContext()
    result.add(id)
  }
  return result
}

function normalizeSchemaErrors(errors: readonly RuleProposalSchemaError[]): RuleProposalValidationIssue[] {
  const normalized = errors.slice(0, MAX_ISSUES).map((error) => issue(
    normalizePath(error.instancePath),
    "schema_invalid",
    schemaMessage(error.keyword)
  ))
  return normalized.length > 0
    ? normalized
    : [issue("/", "schema_invalid", "Proposal does not match the required schema.")]
}

function schemaMessage(keyword: string): string {
  switch (keyword) {
    case "additionalProperties":
      return "Proposal contains an unknown property."
    case "maxItems":
      return "Proposal array exceeds its item limit."
    case "maxLength":
      return "Proposal text exceeds its length limit."
    case "required":
      return "Proposal is missing a required property."
    default:
      return "Proposal value does not match the required schema."
  }
}

function normalizePath(value: string): string {
  const path = value || "/"
  return path.length <= MAX_ISSUE_PATH_LENGTH
    ? path
    : path.slice(0, MAX_ISSUE_PATH_LENGTH)
}

class IssueCollector {
  readonly items: RuleProposalValidationIssue[] = []

  add(path: string, code: string, message: string, operationId?: string): void {
    if (this.items.length >= MAX_ISSUES) return
    this.items.push(issue(path, code, message, operationId))
  }
}

function issue(
  path: string,
  code: string,
  message: string,
  operationId?: string
): RuleProposalValidationIssue {
  const normalized: RuleProposalValidationIssue = {
    path: normalizePath(path),
    code,
    message
  }
  if (operationId !== undefined) normalized.operationId = operationId
  return normalized
}

function invalidResult(issues: RuleProposalValidationIssue[]): RuleProposalValidationResult {
  return { valid: false, issues: issues.slice(0, MAX_ISSUES) }
}

function invalidContext(): Error {
  return new Error("Rule proposal validation context is invalid")
}

function diagnosticOperationId(path: string): string {
  const match = /^\/(operations|project_context_operations|prompt_addendum_operations)\/([0-9]+)$/.exec(path)
  if (!match) throw new Error("Rule proposal operation path is invalid")
  return `${match[1]}:${match[2]}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
