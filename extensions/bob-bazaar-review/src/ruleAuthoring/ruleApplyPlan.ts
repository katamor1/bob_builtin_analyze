import { createHash } from "node:crypto"
import { ProjectChecklist, ProjectRule } from "../projectRules/types"
import { buildDocumentChunkId } from "./documentChunk"
import {
  loadSelectedEvidence,
  RuleEvidenceSelectionV1
} from "./evidenceSelection"
import {
  applyManagedMarkdownOperations,
  ManagedMarkdownDecision,
  parseManagedMarkdown
} from "./managedMarkdownSections"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "./ruleAuthoringLimits"
import { validateRuleAuthoringId } from "./ruleAuthoringPaths"
import { RULE_AUTHORING_TEXT_BYTE_LIMITS } from "./ruleAuthoringTextLimits"
import { DocumentChunkV1, RuleSourceManifestV1 } from "./ruleAuthoringTypes"
import {
  allocateContextSectionIds,
  allocatePromptSectionIds,
  allocateRuleIds
} from "./ruleIdAllocator"
import {
  ProposedMarkdownOperationV1,
  RuleProposalOperationV1,
  RuleProposalRuleV1,
  RuleProposalSourceRefV1,
  RuleProposalV1
} from "./ruleProposalSchema"
import { parseAndValidateRuleProposal } from "./ruleProposalValidation"

export const RULE_APPLY_PLAN_SCHEMA_VERSION = "bob-bazaar-review/rule-apply-plan/v1" as const
export const RULE_PROPOSAL_DECISIONS_SCHEMA_VERSION = "bob-bazaar-review/proposal-decisions/v1" as const
export const RULE_PROVENANCE_SCHEMA_VERSION = "bob-bazaar-review/rule-provenance/v1" as const

export type RuleApplyAsset =
  | "checklist"
  | "project_context"
  | "prompt_addendum"
  | "rule_sources"
  | "rule_provenance"

export type RuleApplyTargetAsset = "rule" | "project_context" | "prompt_addendum"

export type RuleApplyCurrentAsset =
  | { readonly state: "present"; readonly bytes: Uint8Array }
  | { readonly state: "missing" }

export interface RuleApplyBundle {
  readonly checklist: RuleApplyCurrentAsset
  readonly projectContext: RuleApplyCurrentAsset
  readonly promptAddendum: RuleApplyCurrentAsset
  readonly ruleSources: RuleApplyCurrentAsset
  readonly ruleProvenance: RuleApplyCurrentAsset
}

export interface RuleApplyEvidence {
  readonly sourceManifest: RuleSourceManifestV1
  readonly selection: RuleEvidenceSelectionV1
  readonly chunks: readonly DocumentChunkV1[]
}

export interface RuleApplyEditedMarkdown {
  readonly heading: string
  readonly markdown: string
}

interface RuleApplyDecisionCommon {
  readonly reviewed_at: string
  readonly conflict_resolutions?: Readonly<Record<string, string>>
}

export interface RuleApplyAcceptDecision extends RuleApplyDecisionCommon {
  readonly decision: "accept"
}

export interface RuleApplyRejectDecision extends RuleApplyDecisionCommon {
  readonly decision: "reject"
  readonly reject_reason?: string
}

export interface RuleApplyEditRuleDecision extends RuleApplyDecisionCommon {
  readonly decision: "edit"
  readonly edited_rule: RuleProposalRuleV1
}

export interface RuleApplyEditMarkdownDecision extends RuleApplyDecisionCommon {
  readonly decision: "edit"
  readonly edited_markdown: RuleApplyEditedMarkdown
}

export type RuleApplyCandidateDecision =
  | RuleApplyAcceptDecision
  | RuleApplyRejectDecision
  | RuleApplyEditRuleDecision
  | RuleApplyEditMarkdownDecision

export interface RuleProposalDecisionsV1 {
  readonly schema_version: typeof RULE_PROPOSAL_DECISIONS_SCHEMA_VERSION
  readonly run_id: string
  readonly decisions: Readonly<Record<string, RuleApplyCandidateDecision>>
}

export type RuleApplyExpectedPreImage =
  | { readonly state: "present"; readonly sha256: string }
  | { readonly state: "missing" }

export interface RuleApplyPlanTarget {
  readonly asset: RuleApplyAsset
  readonly path: string
  readonly expected_pre_image: RuleApplyExpectedPreImage
  readonly post_image_sha256: string
  readonly bytes: Uint8Array
}

export interface RuleApplyDecisionRecordV1 {
  readonly candidate_id: string
  readonly target_asset: RuleApplyTargetAsset
  readonly operation: "add" | "update" | "retire"
  readonly decision: "accept" | "reject" | "edit"
  readonly target_id: string | null
  readonly reviewed_at: string
  readonly source_refs: RuleProposalSourceRefV1[]
  readonly conflict_resolutions: Record<string, string>
}

export interface RuleApplyRetirementV1 {
  readonly candidate_id: string
  readonly target_asset: RuleApplyTargetAsset
  readonly target_id: string
  readonly decision: "accept" | "edit"
  readonly reviewed_at: string
  readonly source_refs: RuleProposalSourceRefV1[]
  readonly previous: ProjectRule | { heading: string; markdown: string }
}

export interface RuleProvenanceSourceRefV1 extends RuleProposalSourceRefV1 {
  readonly locator: DocumentChunkV1["locator"]
  readonly text_sha256: string
}

export interface RuleProvenanceRuleEntryV1 {
  readonly rule_id: string
  readonly lifecycle: "active" | "retired"
  readonly source_refs: RuleProvenanceSourceRefV1[]
  readonly first_applied_at: string
  readonly last_applied_at: string
  readonly last_run_id: string
}

export interface RuleProvenanceMarkdownEntryV1 {
  readonly asset: "project-context" | "review-prompt-addendum"
  readonly section_id: string
  readonly lifecycle: "active" | "retired"
  readonly source_refs: RuleProvenanceSourceRefV1[]
  readonly last_applied_at: string
  readonly last_run_id: string
}

export interface RuleProvenanceV1 {
  readonly schema_version: typeof RULE_PROVENANCE_SCHEMA_VERSION
  readonly updated_at: string
  readonly rules: RuleProvenanceRuleEntryV1[]
  readonly markdown_sections: RuleProvenanceMarkdownEntryV1[]
}

interface FinalTargetIds {
  readonly rules: ReadonlySet<string>
  readonly projectContext: ReadonlySet<string>
  readonly promptAddendum: ReadonlySet<string>
}

interface ProvenanceChunkLookupValue {
  readonly source_id: string
  readonly chunk_id: string
  readonly locator: DocumentChunkV1["locator"]
  readonly text_sha256: string
}

interface ProvenanceBuildResult {
  readonly provenance: RuleProvenanceV1
  readonly retirements: RuleApplyRetirementV1[]
}

export interface RuleApplyPlan {
  readonly schema_version: typeof RULE_APPLY_PLAN_SCHEMA_VERSION
  readonly run_id: string
  readonly targets: RuleApplyPlanTarget[]
  readonly decisions: RuleApplyDecisionRecordV1[]
  readonly retirements: RuleApplyRetirementV1[]
}

interface EffectiveOperation {
  targetAsset: RuleApplyTargetAsset
  operation: RuleProposalOperationV1 | ProposedMarkdownOperationV1
  decision: RuleApplyCandidateDecision
  assignedTargetId: string | null
}

interface ParsedCurrentBundle {
  checklistBytes: Buffer
  projectContextBytes: Buffer
  promptAddendumBytes: Buffer
  checklist: ProjectChecklist
  projectContext: ReturnType<typeof parseManagedMarkdown>
  promptAddendum: ReturnType<typeof parseManagedMarkdown>
  sources: RuleSourceManifestV1
  provenance: RuleProvenanceV1
}

interface MergedSources {
  manifest: RuleSourceManifestV1
  sourceIdMap: ReadonlyMap<string, string>
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SOURCE_ID_PATTERN = /^src-[a-f0-9]{12,64}$/
const CHUNK_ID_PATTERN = /^chunk-[a-f0-9]{64}$/
const CANDIDATE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const REMOTE_SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/
const REMOTE_SAFE_WARNING = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/
const MAX_APPROVED_RULE_SOURCE_COUNT = 4_096
const MAX_APPROVED_RULE_SOURCE_MANIFEST_BYTES = 4 * 1024 * 1024
const MAX_EVIDENCE_CHUNKS = Math.floor(DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes / 128)
const EMPTY_BYTES = Buffer.alloc(0)
const EMPTY_MANIFEST_TIMESTAMP = "1970-01-01T00:00:00.000Z"
const TARGET_PATHS: ReadonlyArray<readonly [RuleApplyAsset, string]> = [
  ["checklist", ".bob/review/checklist.json"],
  ["project_context", ".bob/review/project-context.md"],
  ["prompt_addendum", ".bob/review/review-prompt-addendum.md"],
  ["rule_sources", ".bob/review/rule-sources.json"],
  ["rule_provenance", ".bob/review/rule-provenance.json"]
]

export function buildRuleApplyPlan(
  bundle: RuleApplyBundle,
  proposalInput: RuleProposalV1,
  decisionsInput: RuleProposalDecisionsV1,
  evidence: RuleApplyEvidence
): RuleApplyPlan {
  assertApplyBundleShape(bundle)
  try {
    validateRuleAuthoringId(proposalInput.run_id, "runId")
  } catch {
    throw new Error("Proposal run identity is invalid")
  }
  const current = parseCurrentBundle(bundle)
  validateProvenanceIntegrity(current.provenance, current.sources, {
    rules: new Set(current.checklist.rules.map(({ id }) => id)),
    projectContext: new Set(current.projectContext.sections.map(({ id }) => id)),
    promptAddendum: new Set(current.promptAddendum.sections.map(({ id }) => id))
  })
  validateRuleApplyEvidence(evidence)

  const proposal = validateProposalForApply(proposalInput, current, bundle, evidence)
  const decisions = validateDecisionOverlay(decisionsInput, proposal)
  const effectiveProposal = applyDecisionEdits(proposal, decisions)
  const validatedEffectiveProposal = validateProposalForApply(effectiveProposal, current, bundle, evidence)
  assertBlockingConflictsResolved(validatedEffectiveProposal, decisions)

  const assignedRuleIds = allocateAcceptedAddIds(
    validatedEffectiveProposal.operations,
    decisions,
    allocateRuleIds,
    uniqueStrings([
      ...current.checklist.rules.map(({ id }) => id),
      ...current.provenance.rules.map(({ rule_id }) => rule_id)
    ])
  )
  const assignedContextIds = allocateAcceptedAddIds(
    validatedEffectiveProposal.project_context_operations,
    decisions,
    allocateContextSectionIds,
    uniqueStrings([
      ...current.projectContext.sections.map(({ id }) => id),
      ...current.provenance.markdown_sections
        .filter(({ asset }) => asset === "project-context")
        .map(({ section_id }) => section_id)
    ])
  )
  const assignedPromptIds = allocateAcceptedAddIds(
    validatedEffectiveProposal.prompt_addendum_operations,
    decisions,
    allocatePromptSectionIds,
    uniqueStrings([
      ...current.promptAddendum.sections.map(({ id }) => id),
      ...current.provenance.markdown_sections
        .filter(({ asset }) => asset === "review-prompt-addendum")
        .map(({ section_id }) => section_id)
    ])
  )

  const operations = collectEffectiveOperations(
    validatedEffectiveProposal,
    decisions,
    assignedRuleIds,
    assignedContextIds,
    assignedPromptIds
  )
  const checklist = applyChecklistOperations(current.checklist, operations)
  const projectContextText = applyMarkdownOperations(current.projectContext, operations, "project_context")
  const promptAddendumText = applyMarkdownOperations(current.promptAddendum, operations, "prompt_addendum")
  assertApprovedMarkdownSize(projectContextText, DEFAULT_RULE_AUTHORING_LIMITS.maxProjectContextBytes)
  assertApprovedMarkdownSize(promptAddendumText, DEFAULT_RULE_AUTHORING_LIMITS.maxPromptAddendumBytes)

  const mergedSources = mergeRuleSources(current.sources, evidence.sourceManifest, operations)
  const provenanceChunks = buildProvenanceChunkLookup(evidence, mergedSources.sourceIdMap)
  const provenanceResult = buildProvenance(
    current.provenance,
    current,
    checklist,
    projectContextText,
    promptAddendumText,
    operations,
    validatedEffectiveProposal.run_id,
    mergedSources,
    provenanceChunks
  )
  const ruleSourcesBytes = serializeStableJson(mergedSources.manifest)
  if (ruleSourcesBytes.byteLength > MAX_APPROVED_RULE_SOURCE_MANIFEST_BYTES) {
    throw new Error("Approved rule source manifest exceeds its byte limit")
  }

  const outputBytes = new Map<RuleApplyAsset, Buffer>([
    ["checklist", serializeStableJson(checklist)],
    ["project_context", Buffer.from(projectContextText, "utf8")],
    ["prompt_addendum", Buffer.from(promptAddendumText, "utf8")],
    ["rule_sources", ruleSourcesBytes],
    ["rule_provenance", serializeStableJson(provenanceResult.provenance)]
  ])
  const inputAssets = assetMap(bundle)
  const targets = TARGET_PATHS.map(([asset, targetPath]) => {
    const bytes = requiredMapValue(outputBytes, asset)
    return {
      asset,
      path: targetPath,
      expected_pre_image: expectedPreImage(requiredMapValue(inputAssets, asset)),
      post_image_sha256: sha256(bytes),
      bytes: Buffer.from(bytes)
    }
  })

  return {
    schema_version: RULE_APPLY_PLAN_SCHEMA_VERSION,
    run_id: validatedEffectiveProposal.run_id,
    targets,
    decisions: buildDecisionRecords(operations, provenanceChunks),
    retirements: provenanceResult.retirements
  }
}

function parseCurrentBundle(bundle: RuleApplyBundle): ParsedCurrentBundle {
  const checklistBytes = requirePresentBytes(bundle.checklist, "Approved checklist")
  const projectContextBytes = currentBytes(bundle.projectContext)
  const promptAddendumBytes = currentBytes(bundle.promptAddendum)
  const checklist = parseChecklist(checklistBytes)
  const projectContextText = decodeUtf8(projectContextBytes, "Approved project context")
  const promptAddendumText = decodeUtf8(promptAddendumBytes, "Approved prompt addendum")

  return {
    checklistBytes,
    projectContextBytes,
    promptAddendumBytes,
    checklist,
    projectContext: parseManagedMarkdown(projectContextText, "CTX"),
    promptAddendum: parseManagedMarkdown(promptAddendumText, "PRM"),
    sources: bundle.ruleSources.state === "present"
      ? parseSourceManifest(bundle.ruleSources.bytes)
      : emptySourceManifest(),
    provenance: bundle.ruleProvenance.state === "present"
      ? parseProvenance(bundle.ruleProvenance.bytes)
      : emptyProvenance()
  }
}

function validateProposalForApply(
  proposal: RuleProposalV1,
  current: ParsedCurrentBundle,
  bundle: RuleApplyBundle,
  evidence: RuleApplyEvidence
): RuleProposalV1 {
  const result = parseAndValidateRuleProposal(JSON.stringify(proposal), {
    runId: proposal?.run_id,
    base: {
      checklistSha256: sha256ForProposal(bundle.checklist),
      projectContextSha256: sha256ForProposal(bundle.projectContext),
      promptAddendumSha256: sha256ForProposal(bundle.promptAddendum)
    },
    existingRuleIds: current.checklist.rules.map(({ id }) => id),
    existingProjectContextSectionIds: current.projectContext.sections.map(({ id }) => id),
    existingPromptAddendumSectionIds: current.promptAddendum.sections.map(({ id }) => id),
    selectedEvidence: evidence.selection.selected_chunks.map(({ source_id, chunk_id }) => ({
      source_id,
      chunk_id
    }))
  })
  if (!result.valid) {
    if (result.issues.some(({ code }) => code === "stale_base")) {
      throw new Error("Proposal base does not match the current approved asset")
    }
    throw new Error("Rule proposal failed apply-time validation")
  }
  return result.proposal
}

function validateDecisionOverlay(
  input: RuleProposalDecisionsV1,
  proposal: RuleProposalV1
): ReadonlyMap<string, RuleApplyCandidateDecision> {
  if (
    !isPlainObject(input) ||
    input.schema_version !== RULE_PROPOSAL_DECISIONS_SCHEMA_VERSION ||
    input.run_id !== proposal.run_id ||
    !isPlainObject(input.decisions)
  ) {
    throw new Error("Proposal decisions must match the active validated proposal")
  }
  const candidates = allProposalOperations(proposal)
  const candidateIds = new Set(candidates.map(({ candidate_id }) => candidate_id))
  const decisionIds = Object.keys(input.decisions)
  if (
    decisionIds.length !== candidateIds.size ||
    decisionIds.some((candidateId) => !candidateIds.has(candidateId))
  ) {
    throw new Error("Every validated proposal candidate requires exactly one Human Triage decision")
  }

  const output = new Map<string, RuleApplyCandidateDecision>()
  for (const operation of candidates) {
    const decision = input.decisions[operation.candidate_id]
    validateCandidateDecision(decision, operation)
    output.set(operation.candidate_id, structuredClone(decision))
  }
  return output
}

function validateCandidateDecision(
  value: RuleApplyCandidateDecision,
  operation: RuleProposalOperationV1 | ProposedMarkdownOperationV1
): void {
  if (!isPlainObject(value) || !isCanonicalTimestamp(value.reviewed_at)) {
    throw new Error("Proposal decision is malformed")
  }
  if (value.decision !== "accept" && value.decision !== "reject" && value.decision !== "edit") {
    throw new Error("Proposal decision is malformed")
  }
  validateConflictResolutionShape(value.conflict_resolutions)
  if (value.decision === "reject") {
    if (
      value.reject_reason !== undefined &&
      (
        typeof value.reject_reason !== "string" ||
        CONTROL_CHARACTER.test(value.reject_reason) ||
        Buffer.byteLength(value.reject_reason, "utf8") > RULE_AUTHORING_TEXT_BYTE_LIMITS.rejectReason
      )
    ) {
      throw new Error("Proposal rejection reason is malformed")
    }
    if ("edited_rule" in value || "edited_markdown" in value) {
      throw new Error("Rejected proposal decision cannot carry an edit")
    }
    return
  }
  if (value.decision === "accept") {
    if ("edited_rule" in value || "edited_markdown" in value || "reject_reason" in value) {
      throw new Error("Accepted proposal decision cannot carry an edit or rejection reason")
    }
    return
  }
  if (operation.operation === "retire") {
    throw new Error("A retire proposal cannot use an edit decision")
  }
  const ruleOperation = isRuleOperation(operation)
  if (ruleOperation) {
    if (!("edited_rule" in value) || "edited_markdown" in value) {
      throw new Error("Edited rule decision requires only an edited rule value")
    }
  } else if (!("edited_markdown" in value) || "edited_rule" in value) {
    throw new Error("Edited Markdown decision requires only an edited Markdown value")
  }
}

function applyDecisionEdits(
  proposal: RuleProposalV1,
  decisions: ReadonlyMap<string, RuleApplyCandidateDecision>
): RuleProposalV1 {
  const output = structuredClone(proposal)
  for (const operation of allProposalOperations(output)) {
    const decision = requiredMapValue(decisions, operation.candidate_id)
    if (decision.decision !== "edit") continue
    if (isRuleOperation(operation) && "edited_rule" in decision) {
      operation.rule = structuredClone(decision.edited_rule)
    } else if (!isRuleOperation(operation) && "edited_markdown" in decision) {
      operation.heading = decision.edited_markdown.heading
      operation.markdown = decision.edited_markdown.markdown
    } else {
      throw new Error("Proposal edit does not match its validated candidate")
    }
  }
  return output
}

function assertBlockingConflictsResolved(
  proposal: RuleProposalV1,
  decisions: ReadonlyMap<string, RuleApplyCandidateDecision>
): void {
  const conflictsById = new Map(proposal.conflicts.map((conflict) => [conflict.conflict_id, conflict]))
  const chosenAlternativeByConflict = new Map<string, string>()
  for (const operation of allProposalOperations(proposal)) {
    const decision = requiredMapValue(decisions, operation.candidate_id)
    if (decision.decision === "reject") continue
    const resolutions = decision.conflict_resolutions ?? {}
    for (const conflictId of Object.keys(resolutions)) {
      if (!operation.conflict_ids.includes(conflictId)) {
        throw new Error("Proposal decision references an unrelated conflict resolution")
      }
      const conflict = conflictsById.get(conflictId)
      const alternativeId = resolutions[conflictId]
      if (!conflict?.alternatives.some(({ alternative_id }) => alternative_id === alternativeId)) {
        throw new Error("Proposal decision references an invalid conflict resolution")
      }
      const existing = chosenAlternativeByConflict.get(conflictId)
      if (existing !== undefined && existing !== alternativeId) {
        throw new Error("Accepted candidates cannot choose inconsistent conflict resolutions")
      }
      chosenAlternativeByConflict.set(conflictId, alternativeId)
    }
    for (const conflictId of operation.conflict_ids) {
      const conflict = conflictsById.get(conflictId)
      if (conflict?.blocking && resolutions[conflictId] === undefined) {
        throw new Error("Accepted candidate has a blocking conflict without a validated resolution")
      }
    }
  }
}

function allocateAcceptedAddIds<T extends string>(
  operations: readonly (RuleProposalOperationV1 | ProposedMarkdownOperationV1)[],
  decisions: ReadonlyMap<string, RuleApplyCandidateDecision>,
  allocator: (existingIds: readonly string[], count: number) => T[],
  existingIds: readonly string[]
): ReadonlyMap<string, T> {
  const acceptedAdds = operations.filter((operation) =>
    operation.operation === "add" &&
    requiredMapValue(decisions, operation.candidate_id).decision !== "reject"
  )
  const allocated = allocator(existingIds, acceptedAdds.length)
  return new Map(acceptedAdds.map((operation, index) => [operation.candidate_id, allocated[index]]))
}

function collectEffectiveOperations(
  proposal: RuleProposalV1,
  decisions: ReadonlyMap<string, RuleApplyCandidateDecision>,
  assignedRuleIds: ReadonlyMap<string, string>,
  assignedContextIds: ReadonlyMap<string, string>,
  assignedPromptIds: ReadonlyMap<string, string>
): EffectiveOperation[] {
  const output: EffectiveOperation[] = []
  const append = (
    targetAsset: RuleApplyTargetAsset,
    operations: readonly (RuleProposalOperationV1 | ProposedMarkdownOperationV1)[],
    assignedIds: ReadonlyMap<string, string>
  ): void => {
    for (const operation of operations) {
      output.push({
        targetAsset,
        operation,
        decision: requiredMapValue(decisions, operation.candidate_id),
        assignedTargetId: operation.operation === "add"
          ? (assignedIds.get(operation.candidate_id) ?? null)
          : operationTargetId(operation)
      })
    }
  }
  append("rule", proposal.operations, assignedRuleIds)
  append("project_context", proposal.project_context_operations, assignedContextIds)
  append("prompt_addendum", proposal.prompt_addendum_operations, assignedPromptIds)
  return output
}

function applyChecklistOperations(
  current: ProjectChecklist,
  operations: readonly EffectiveOperation[]
): ProjectChecklist {
  const rules = current.rules.map((rule) => structuredClone(rule))
  for (const entry of operations) {
    if (entry.targetAsset !== "rule" || entry.decision.decision === "reject") continue
    const operation = entry.operation as RuleProposalOperationV1
    if (operation.operation === "add") {
      const assignedId = requireAssignedId(entry)
      rules.push(projectRuleFromProposal(assignedId, requireRuleValue(operation)))
      continue
    }
    const targetId = requireAssignedId(entry)
    const index = rules.findIndex(({ id }) => id === targetId)
    if (index < 0) throw new Error("Validated rule target is unavailable during apply planning")
    if (operation.operation === "retire") rules.splice(index, 1)
    else rules[index] = projectRuleFromProposal(targetId, requireRuleValue(operation))
  }
  return {
    ...structuredClone(current),
    rules
  }
}

function applyMarkdownOperations(
  current: ReturnType<typeof parseManagedMarkdown>,
  operations: readonly EffectiveOperation[],
  targetAsset: "project_context" | "prompt_addendum"
): string {
  const markdownDecisions: ManagedMarkdownDecision[] = []
  for (const entry of operations) {
    if (entry.targetAsset !== targetAsset || entry.decision.decision === "reject") continue
    const operation = entry.operation as ProposedMarkdownOperationV1
    if (operation.operation === "add") {
      markdownDecisions.push({
        operation: "add",
        assignedSectionId: requireAssignedId(entry),
        heading: requireString(operation.heading),
        markdown: requireString(operation.markdown)
      })
    } else if (operation.operation === "update") {
      markdownDecisions.push({
        operation: "update",
        targetSectionId: requireAssignedId(entry),
        heading: requireString(operation.heading),
        markdown: requireString(operation.markdown)
      })
    } else {
      markdownDecisions.push({ operation: "retire", targetSectionId: requireAssignedId(entry) })
    }
  }
  return applyManagedMarkdownOperations(current, markdownDecisions)
}

function mergeRuleSources(
  current: RuleSourceManifestV1,
  evidence: RuleSourceManifestV1,
  operations: readonly EffectiveOperation[]
): MergedSources {
  validateSourceManifest(current, MAX_APPROVED_RULE_SOURCE_COUNT)
  validateSourceManifest(evidence, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles)
  const referencedEvidenceIds = new Set<string>()
  for (const entry of operations) {
    if (entry.decision.decision === "reject") continue
    for (const sourceRef of entry.operation.source_refs) referencedEvidenceIds.add(sourceRef.source_id)
  }

  const sources = current.sources.map((source) => copySourceManifestEntry(source))
  const existingById = new Map(sources.map((source) => [source.source_id, source]))
  const existingByHash = new Map(sources.map((source) => [source.sha256, source]))
  const evidenceById = new Map(evidence.sources.map((source) => [source.source_id, source]))
  const sourceIdMap = new Map<string, string>()
  let added = false
  for (const sourceId of [...referencedEvidenceIds].sort(compareText)) {
    const source = evidenceById.get(sourceId)
    if (!source) throw new Error("Accepted proposal provenance references an unavailable evidence source")
    if (source.extraction_status !== "success" && source.extraction_status !== "partial") {
      throw new Error("Accepted proposal provenance references a source without extracted evidence")
    }
    const byHash = existingByHash.get(source.sha256)
    if (byHash) {
      sourceIdMap.set(sourceId, byHash.source_id)
      continue
    }
    const assignedSourceId = allocateMergedSourceId(source.sha256, source.source_id, existingById)
    const copied = copySourceManifestEntry(source, assignedSourceId)
    sources.push(copied)
    existingById.set(assignedSourceId, copied)
    existingByHash.set(copied.sha256, copied)
    sourceIdMap.set(sourceId, assignedSourceId)
    added = true
  }

  const manifest: RuleSourceManifestV1 = {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: added
      ? maxTimestamp(current.generated_at, evidence.generated_at)
      : current.generated_at,
    sources: sources.sort((left, right) => compareText(left.source_id, right.source_id))
  }
  validateSourceManifest(manifest, MAX_APPROVED_RULE_SOURCE_COUNT)
  return {
    manifest,
    sourceIdMap
  }
}

function buildProvenance(
  currentProvenance: RuleProvenanceV1,
  current: ParsedCurrentBundle,
  checklist: ProjectChecklist,
  projectContextText: string,
  promptAddendumText: string,
  operations: readonly EffectiveOperation[],
  runId: string,
  mergedSources: MergedSources,
  chunkLookup: ReadonlyMap<string, ProvenanceChunkLookupValue>
): ProvenanceBuildResult {
  const rules = new Map(currentProvenance.rules.map((entry) => [entry.rule_id, structuredClone(entry)]))
  const markdownSections = new Map(currentProvenance.markdown_sections.map((entry) => [
    markdownProvenanceKey(entry.asset, entry.section_id),
    structuredClone(entry)
  ]))
  const retirements: RuleApplyRetirementV1[] = []
  let latestAppliedAt: string | undefined

  for (const entry of operations) {
    if (entry.decision.decision === "reject") continue
    const targetId = requireAssignedId(entry)
    const sourceRefs = enrichSourceRefs(entry.operation.source_refs, chunkLookup)
    latestAppliedAt = latestAppliedAt === undefined
      ? entry.decision.reviewed_at
      : maxTimestamp(latestAppliedAt, entry.decision.reviewed_at)
    const before = valueBeforeOperation(current, entry)
    const lifecycle = entry.operation.operation === "retire" ? "retired" : "active"
    if (entry.operation.operation === "retire") {
      retirements.push({
        candidate_id: entry.operation.candidate_id,
        target_asset: entry.targetAsset,
        target_id: targetId,
        decision: entry.decision.decision,
        reviewed_at: entry.decision.reviewed_at,
        source_refs: normalizeSourceRefs(entry.operation.source_refs, chunkLookup),
        previous: structuredClone(requiredPreviousValue(before))
      })
    }
    if (entry.targetAsset === "rule") {
      const prior = rules.get(targetId)
      rules.set(targetId, {
        rule_id: targetId,
        lifecycle,
        source_refs: sourceRefs,
        first_applied_at: prior?.first_applied_at ?? entry.decision.reviewed_at,
        last_applied_at: entry.decision.reviewed_at,
        last_run_id: runId
      })
    } else {
      const asset = entry.targetAsset === "project_context"
        ? "project-context"
        : "review-prompt-addendum"
      markdownSections.set(markdownProvenanceKey(asset, targetId), {
        asset,
        section_id: targetId,
        lifecycle,
        source_refs: sourceRefs,
        last_applied_at: entry.decision.reviewed_at,
        last_run_id: runId
      })
    }
  }

  const provenance: RuleProvenanceV1 = {
    schema_version: RULE_PROVENANCE_SCHEMA_VERSION,
    updated_at: latestAppliedAt ?? currentProvenance.updated_at,
    rules: [...rules.values()].sort((left, right) => compareText(left.rule_id, right.rule_id)),
    markdown_sections: [...markdownSections.values()].sort((left, right) =>
      compareText(left.asset, right.asset) || compareText(left.section_id, right.section_id)
    )
  }
  const finalContext = parseManagedMarkdown(projectContextText, "CTX")
  const finalPrompt = parseManagedMarkdown(promptAddendumText, "PRM")
  validateProvenanceIntegrity(provenance, mergedSources.manifest, {
    rules: new Set(checklist.rules.map(({ id }) => id)),
    projectContext: new Set(finalContext.sections.map(({ id }) => id)),
    promptAddendum: new Set(finalPrompt.sections.map(({ id }) => id))
  })
  return { provenance, retirements }
}

function buildProvenanceChunkLookup(
  evidence: RuleApplyEvidence,
  sourceIdMap: ReadonlyMap<string, string>
): ReadonlyMap<string, ProvenanceChunkLookupValue> {
  const output = new Map<string, ProvenanceChunkLookupValue>()
  const sources = new Map(evidence.sourceManifest.sources.map((source) => [source.source_id, source]))
  for (const chunk of evidence.chunks) {
    const key = sourceChunkKey(chunk.source_id, chunk.chunk_id)
    if (output.has(key)) throw new Error("Apply evidence contains duplicate source/chunk identity")
    const source = sources.get(chunk.source_id)
    if (!source) throw new Error("Apply evidence contains a chunk without a source")
    const mappedSourceId = sourceIdMap.get(chunk.source_id) ?? chunk.source_id
    output.set(key, {
      source_id: mappedSourceId,
      chunk_id: mappedSourceId === chunk.source_id
        ? chunk.chunk_id
        : buildDocumentChunkId(mappedSourceId, source.media_type, chunk.kind, chunk.locator),
      locator: structuredClone(chunk.locator),
      text_sha256: chunk.text_sha256
    })
  }
  return output
}

function enrichSourceRefs(
  refs: readonly RuleProposalSourceRefV1[],
  chunks: ReadonlyMap<string, ProvenanceChunkLookupValue>
): RuleProvenanceSourceRefV1[] {
  return refs.map((sourceRef) => {
    const chunk = chunks.get(sourceChunkKey(sourceRef.source_id, sourceRef.chunk_id))
    if (!chunk) throw new Error("Accepted proposal source reference is unavailable in stored evidence")
    return {
      source_id: chunk.source_id,
      chunk_id: chunk.chunk_id,
      locator: structuredClone(chunk.locator),
      text_sha256: chunk.text_sha256
    }
  }).sort((left, right) =>
    compareText(left.source_id, right.source_id) || compareText(left.chunk_id, right.chunk_id)
  )
}

function buildDecisionRecords(
  operations: readonly EffectiveOperation[],
  chunks: ReadonlyMap<string, ProvenanceChunkLookupValue>
): RuleApplyDecisionRecordV1[] {
  return operations.map((entry) => ({
    candidate_id: entry.operation.candidate_id,
    target_asset: entry.targetAsset,
    operation: entry.operation.operation,
    decision: entry.decision.decision,
    target_id: entry.assignedTargetId,
    reviewed_at: entry.decision.reviewed_at,
    source_refs: entry.decision.decision === "reject"
      ? []
      : normalizeSourceRefs(entry.operation.source_refs, chunks),
    conflict_resolutions: sortStringRecord(entry.decision.conflict_resolutions ?? {})
  }))
}

export function validateRuleApplyEvidence(evidence: RuleApplyEvidence): void {
  if (!isPlainObject(evidence) || !Array.isArray(evidence.chunks)) {
    throw new Error("Apply evidence is malformed")
  }
  validateSourceManifest(evidence.sourceManifest, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles)
  if (evidence.chunks.length > MAX_EVIDENCE_CHUNKS) {
    throw new Error("Document chunk count exceeds its limit")
  }
  const sources = new Map(evidence.sourceManifest.sources.map((source) => [source.source_id, source]))
  const chunks = new Map<string, DocumentChunkV1>()
  for (const chunk of evidence.chunks) {
    if (!isPlainObject(chunk)) throw new Error("Document chunk is malformed")
    const expectedKeys = chunk.title === undefined
      ? ["schema_version", "chunk_id", "source_id", "kind", "locator", "text", "text_sha256", "flags"]
      : ["schema_version", "chunk_id", "source_id", "kind", "locator", "title", "text", "text_sha256", "flags"]
    const source = sources.get(String(chunk.source_id))
    if (
      !hasExactKeys(chunk, expectedKeys) ||
      chunk.schema_version !== "bob-bazaar-review/document-chunk/v1" ||
      !CHUNK_ID_PATTERN.test(String(chunk.chunk_id)) ||
      !source ||
      !isDocumentChunkKind(chunk.kind) ||
      !isPlainObject(chunk.locator) ||
      typeof chunk.text !== "string" ||
      Buffer.byteLength(chunk.text, "utf8") > DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes ||
      !SHA256_PATTERN.test(String(chunk.text_sha256)) ||
      sha256(Buffer.from(chunk.text, "utf8")) !== chunk.text_sha256 ||
      (chunk.title !== undefined && (
        typeof chunk.title !== "string" ||
        Buffer.byteLength(chunk.title, "utf8") > DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes ||
        CONTROL_CHARACTER.test(chunk.title)
      )) ||
      !Array.isArray(chunk.flags) ||
      chunk.flags.length > 100 ||
      chunk.flags.some((flag: unknown) =>
        typeof flag !== "string" ||
        Buffer.byteLength(flag, "utf8") > 128 ||
        CONTROL_CHARACTER.test(flag)
      ) ||
      chunks.has(chunk.chunk_id)
    ) {
      throw new Error("Document chunk is malformed")
    }
    validateLocator(chunk.locator)
    if (
      buildDocumentChunkId(source.source_id, source.media_type, chunk.kind, chunk.locator) !==
      chunk.chunk_id
    ) {
      throw new Error("Document chunk deterministic identity is invalid")
    }
    chunks.set(chunk.chunk_id, structuredClone(chunk) as DocumentChunkV1)
  }
  loadSelectedEvidence(
    evidence.selection,
    evidence.chunks,
    DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes
  )
  for (const item of evidence.selection.selected_chunks) {
    const source = sources.get(item.source_id)
    const chunk = chunks.get(item.chunk_id)
    if (
      !source ||
      !chunk ||
      chunk.source_id !== source.source_id ||
      buildDocumentChunkId(chunk.source_id, source.media_type, chunk.kind, chunk.locator) !== chunk.chunk_id
    ) {
      throw new Error("Evidence selection has unknown or mismatched identifiers")
    }
    validateLocator(chunk.locator as Record<string, unknown>)
  }
}

function isDocumentChunkKind(value: unknown): value is DocumentChunkV1["kind"] {
  return value === "heading" || value === "paragraph" || value === "list" ||
    value === "table" || value === "row" || value === "page"
}

function validateSourceManifest(value: RuleSourceManifestV1, maxSourceCount: number): void {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, ["schema_version", "generated_at", "sources"]) ||
    value.schema_version !== "bob-bazaar-review/rule-sources/v1" ||
    !isCanonicalTimestamp(value.generated_at) ||
    !Array.isArray(value.sources) ||
    value.sources.length > maxSourceCount
  ) {
    throw new Error("Rule source manifest is malformed")
  }
  const sourceIds = new Set<string>()
  const hashes = new Set<string>()
  for (const source of value.sources) {
    if (
      !isPlainObject(source) ||
      !hasExactKeys(source, [
        "source_id",
        "logical_name",
        "media_type",
        "sha256",
        "byte_size",
        "extraction_status",
        "extractor",
        "warnings"
      ]) ||
      !SOURCE_ID_PATTERN.test(source.source_id) ||
      !SHA256_PATTERN.test(source.sha256) ||
      !source.sha256.startsWith(source.source_id.slice(4)) ||
      sourceIds.has(source.source_id) ||
      hashes.has(source.sha256) ||
      typeof source.logical_name !== "string" ||
      source.logical_name.length === 0 ||
      source.logical_name.trim() !== source.logical_name ||
      source.logical_name.includes("/") ||
      source.logical_name.includes("\\") ||
      CONTROL_CHARACTER.test(source.logical_name) ||
      Buffer.byteLength(source.logical_name, "utf8") > 255 ||
      !Number.isSafeInteger(source.byte_size) ||
      source.byte_size < 0 ||
      !["docx", "xlsx", "pdf"].includes(source.media_type) ||
      !source.logical_name.toLowerCase().endsWith(`.${source.media_type}`) ||
      !["success", "partial", "blocked", "requires_conversion", "requires_ocr"].includes(source.extraction_status) ||
      !isPlainObject(source.extractor) ||
      !hasExactKeys(source.extractor, ["id", "version"]) ||
      typeof source.extractor.id !== "string" ||
      !REMOTE_SAFE_TOKEN.test(source.extractor.id) ||
      Buffer.byteLength(source.extractor.id, "utf8") > 128 ||
      typeof source.extractor.version !== "string" ||
      !REMOTE_SAFE_TOKEN.test(source.extractor.version) ||
      Buffer.byteLength(source.extractor.version, "utf8") > 128 ||
      !Array.isArray(source.warnings) ||
      source.warnings.length > 100 ||
      source.warnings.some((warning: unknown) =>
        typeof warning !== "string" ||
        !REMOTE_SAFE_WARNING.test(warning) ||
        Buffer.byteLength(warning, "utf8") > 128
      )
    ) {
      throw new Error("Rule source manifest is malformed")
    }
    sourceIds.add(source.source_id)
    hashes.add(source.sha256)
  }
}

function parseSourceManifest(bytes: Uint8Array): RuleSourceManifestV1 {
  if (bytes.byteLength > MAX_APPROVED_RULE_SOURCE_MANIFEST_BYTES) {
    throw new Error("Approved rule source manifest exceeds its byte limit")
  }
  const parsed = parseJsonBytes(bytes, "Approved rule source manifest")
  validateSourceManifest(parsed as RuleSourceManifestV1, MAX_APPROVED_RULE_SOURCE_COUNT)
  return structuredClone(parsed as RuleSourceManifestV1)
}

function parseProvenance(bytes: Uint8Array): RuleProvenanceV1 {
  const parsed = parseJsonBytes(bytes, "Approved rule provenance")
  if (
    !isPlainObject(parsed) ||
    !hasExactKeys(parsed, ["schema_version", "updated_at", "rules", "markdown_sections"]) ||
    parsed.schema_version !== RULE_PROVENANCE_SCHEMA_VERSION ||
    !isCanonicalTimestamp(parsed.updated_at) ||
    !Array.isArray(parsed.rules) ||
    !Array.isArray(parsed.markdown_sections)
  ) {
    throw new Error("Approved rule provenance is malformed")
  }
  for (const entry of parsed.rules) validateRuleProvenanceEntry(entry)
  for (const entry of parsed.markdown_sections) validateMarkdownProvenanceEntry(entry)
  return structuredClone(parsed) as unknown as RuleProvenanceV1
}

function validateRuleProvenanceEntry(value: unknown): asserts value is RuleProvenanceRuleEntryV1 {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "rule_id",
      "lifecycle",
      "source_refs",
      "first_applied_at",
      "last_applied_at",
      "last_run_id"
    ]) ||
    !isSafeTargetId(value.rule_id, "rule") ||
    !isLifecycle(value.lifecycle) ||
    !Array.isArray(value.source_refs) ||
    !isCanonicalTimestamp(value.first_applied_at) ||
    !isCanonicalTimestamp(value.last_applied_at) ||
    compareText(value.first_applied_at, value.last_applied_at) > 0 ||
    !isValidRuleAuthoringId(value.last_run_id)
  ) {
    throw new Error("Approved rule provenance is malformed")
  }
  validateProvenanceSourceRefs(value.source_refs)
}

function validateMarkdownProvenanceEntry(value: unknown): asserts value is RuleProvenanceMarkdownEntryV1 {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "asset",
      "section_id",
      "lifecycle",
      "source_refs",
      "last_applied_at",
      "last_run_id"
    ]) ||
    (value.asset !== "project-context" && value.asset !== "review-prompt-addendum") ||
    !isSafeTargetId(
      value.section_id,
      value.asset === "project-context" ? "project_context" : "prompt_addendum"
    ) ||
    !isLifecycle(value.lifecycle) ||
    !Array.isArray(value.source_refs) ||
    !isCanonicalTimestamp(value.last_applied_at) ||
    !isValidRuleAuthoringId(value.last_run_id)
  ) {
    throw new Error("Approved rule provenance is malformed")
  }
  validateProvenanceSourceRefs(value.source_refs)
}

function validateProvenanceIntegrity(
  provenance: RuleProvenanceV1,
  sources: RuleSourceManifestV1,
  targets?: FinalTargetIds
): void {
  const sourceIds = new Set(sources.sources.map(({ source_id }) => source_id))
  const ruleIds = new Set<string>()
  for (const entry of provenance.rules) {
    if (ruleIds.has(entry.rule_id)) throw new Error("Rule provenance contains duplicate rule IDs")
    ruleIds.add(entry.rule_id)
    if (targets && entry.lifecycle === "active" && !targets.rules.has(entry.rule_id)) {
      throw new Error("Active rule provenance target does not exist in the approved checklist")
    }
    assertRefsHaveSources(entry.source_refs, sourceIds)
  }
  const markdownIds = new Set<string>()
  for (const entry of provenance.markdown_sections) {
    const key = markdownProvenanceKey(entry.asset, entry.section_id)
    if (markdownIds.has(key)) throw new Error("Rule provenance contains duplicate Markdown section IDs")
    markdownIds.add(key)
    const activeTargets = entry.asset === "project-context"
      ? targets?.projectContext
      : targets?.promptAddendum
    if (activeTargets && entry.lifecycle === "active" && !activeTargets.has(entry.section_id)) {
      throw new Error("Active Markdown provenance target does not exist in the approved asset")
    }
    assertRefsHaveSources(entry.source_refs, sourceIds)
  }
}

function assertRefsHaveSources(refs: readonly RuleProvenanceSourceRefV1[], sources: ReadonlySet<string>): void {
  if (refs.some(({ source_id }) => !sources.has(source_id))) {
    throw new Error("Rule provenance references an unavailable source")
  }
}

function valueBeforeOperation(
  current: ParsedCurrentBundle,
  entry: EffectiveOperation
): ProjectRule | { heading: string; markdown: string } | null {
  if (entry.operation.operation === "add") return null
  const targetId = requireAssignedId(entry)
  if (entry.targetAsset === "rule") {
    return copyRetirementRule(
      requiredValue(current.checklist.rules.find(({ id }) => id === targetId))
    )
  }
  const sections = entry.targetAsset === "project_context"
    ? current.projectContext.sections
    : current.promptAddendum.sections
  const section = requiredValue(sections.find(({ id }) => id === targetId))
  return { heading: section.heading, markdown: section.markdown }
}

function copyRetirementRule(value: ProjectRule): ProjectRule {
  const output: ProjectRule = {
    id: value.id,
    category: value.category,
    title: value.title,
    description: value.description,
    severity_on_fail: value.severity_on_fail
  }
  if (value.applies_when !== undefined) output.applies_when = [...value.applies_when]
  if (value.evidence_required !== undefined) output.evidence_required = value.evidence_required
  if (value.review_hint !== undefined) output.review_hint = value.review_hint
  return output
}

function normalizeSourceRefs(
  refs: readonly RuleProposalSourceRefV1[],
  chunks: ReadonlyMap<string, ProvenanceChunkLookupValue>
): RuleProposalSourceRefV1[] {
  return refs.map((sourceRef) => {
    const chunk = chunks.get(sourceChunkKey(sourceRef.source_id, sourceRef.chunk_id))
    if (!chunk) throw new Error("Accepted proposal source reference is unavailable in stored evidence")
    return { source_id: chunk.source_id, chunk_id: chunk.chunk_id }
  }).sort((left, right) =>
    compareText(left.source_id, right.source_id) || compareText(left.chunk_id, right.chunk_id)
  )
}

function validateProvenanceSourceRefs(value: readonly unknown[]): void {
  const seen = new Set<string>()
  for (const ref of value) {
    if (
      !isPlainObject(ref) ||
      !hasExactKeys(ref, ["source_id", "chunk_id", "locator", "text_sha256"]) ||
      !SOURCE_ID_PATTERN.test(String(ref.source_id)) ||
      !CHUNK_ID_PATTERN.test(String(ref.chunk_id)) ||
      !SHA256_PATTERN.test(String(ref.text_sha256)) ||
      !isPlainObject(ref.locator)
    ) {
      throw new Error("Approved rule provenance source reference is malformed")
    }
    validateLocator(ref.locator)
    const key = `${ref.source_id}\u0000${ref.chunk_id}`
    if (seen.has(key)) throw new Error("Approved rule provenance contains duplicate source references")
    seen.add(key)
  }
}

function validateLocator(locator: Record<string, unknown>): void {
  const allowed = new Set([
    "heading_path",
    "block_index",
    "table_index",
    "sheet",
    "row",
    "cell_range",
    "page",
    "part_index"
  ])
  if (Object.keys(locator).some((key) => !allowed.has(key))) {
    throw new Error("Approved rule provenance locator is malformed")
  }
  if (
    locator.heading_path !== undefined &&
    (
      !Array.isArray(locator.heading_path) ||
      locator.heading_path.length > 64 ||
      locator.heading_path.some((part) =>
        typeof part !== "string" ||
        Buffer.byteLength(part, "utf8") > DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes ||
        CONTROL_CHARACTER.test(part)
      )
    )
  ) {
    throw new Error("Approved rule provenance locator is malformed")
  }
  for (const key of ["block_index", "table_index", "row", "page", "part_index"]) {
    const value = locator[key]
    if (value !== undefined && (!Number.isSafeInteger(value) || Number(value) < 0)) {
      throw new Error("Approved rule provenance locator is malformed")
    }
  }
  for (const key of ["sheet", "cell_range"]) {
    const value = locator[key]
    if (value !== undefined && (
      typeof value !== "string" ||
      Buffer.byteLength(value, "utf8") > DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes ||
      CONTROL_CHARACTER.test(value)
    )) {
      throw new Error("Approved rule provenance locator is malformed")
    }
  }
}

function parseChecklist(bytes: Uint8Array): ProjectChecklist {
  const value = parseJsonBytes(bytes, "Approved checklist")
  if (
    !isPlainObject(value) ||
    typeof value.version !== "string" ||
    typeof value.project !== "string" ||
    !Array.isArray(value.rules)
  ) {
    throw new Error("Approved checklist is malformed")
  }
  const ids = new Set<string>()
  for (const rule of value.rules) {
    if (
      !isPlainObject(rule) ||
      typeof rule.id !== "string" ||
      rule.id.length === 0 ||
      ids.has(rule.id) ||
      typeof rule.category !== "string" ||
      typeof rule.title !== "string" ||
      typeof rule.description !== "string" ||
      !["error", "warning", "info"].includes(String(rule.severity_on_fail))
    ) {
      throw new Error("Approved checklist is malformed")
    }
    ids.add(rule.id)
  }
  return structuredClone(value) as unknown as ProjectChecklist
}

function projectRuleFromProposal(id: string, value: RuleProposalRuleV1): ProjectRule {
  return {
    id,
    category: value.category,
    title: value.title,
    description: value.description,
    severity_on_fail: value.severity_on_fail,
    applies_when: [...value.applies_when],
    evidence_required: value.evidence_required,
    review_hint: value.review_hint
  }
}

function allProposalOperations(
  proposal: RuleProposalV1
): Array<RuleProposalOperationV1 | ProposedMarkdownOperationV1> {
  return [
    ...proposal.operations,
    ...proposal.project_context_operations,
    ...proposal.prompt_addendum_operations
  ]
}

function operationTargetId(operation: RuleProposalOperationV1 | ProposedMarkdownOperationV1): string | null {
  return isRuleOperation(operation) ? operation.target_rule_id : operation.target_section_id
}

function isRuleOperation(
  operation: RuleProposalOperationV1 | ProposedMarkdownOperationV1
): operation is RuleProposalOperationV1 {
  return Object.prototype.hasOwnProperty.call(operation, "target_rule_id")
}

function requireRuleValue(operation: RuleProposalOperationV1): RuleProposalRuleV1 {
  if (!operation.rule) throw new Error("Validated rule proposal value is unavailable")
  return operation.rule
}

function requireAssignedId(entry: EffectiveOperation): string {
  if (entry.assignedTargetId === null) throw new Error("Validated proposal target ID is unavailable")
  return entry.assignedTargetId
}

function requireString(value: string | null): string {
  if (value === null) throw new Error("Validated managed Markdown value is unavailable")
  return value
}

function requiredPreviousValue<T>(value: T | null): T {
  if (value === null) throw new Error("Retired approved value is unavailable")
  return value
}

function requiredValue<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Validated approved target is unavailable")
  return value
}

function assertApprovedMarkdownSize(value: string, limit: number): void {
  if (Buffer.byteLength(value, "utf8") > limit) {
    throw new Error("Approved Markdown exceeds its hard byte limit")
  }
}

function emptySourceManifest(): RuleSourceManifestV1 {
  return {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: EMPTY_MANIFEST_TIMESTAMP,
    sources: []
  }
}

function emptyProvenance(): RuleProvenanceV1 {
  return {
    schema_version: RULE_PROVENANCE_SCHEMA_VERSION,
    updated_at: EMPTY_MANIFEST_TIMESTAMP,
    rules: [],
    markdown_sections: []
  }
}

function copySourceManifestEntry(
  source: RuleSourceManifestV1["sources"][number],
  sourceId = source.source_id
): RuleSourceManifestV1["sources"][number] {
  return {
    source_id: sourceId,
    logical_name: source.logical_name,
    media_type: source.media_type,
    sha256: source.sha256,
    byte_size: source.byte_size,
    extraction_status: source.extraction_status,
    extractor: { id: source.extractor.id, version: source.extractor.version },
    warnings: [...source.warnings]
  }
}

function allocateMergedSourceId(
  sha: string,
  preferredId: string,
  existingById: ReadonlyMap<string, RuleSourceManifestV1["sources"][number]>
): string {
  if (!existingById.has(preferredId)) return preferredId
  for (let length = 12; length <= sha.length; length += 1) {
    const candidate = `src-${sha.slice(0, length)}`
    if (!existingById.has(candidate)) return candidate
  }
  throw new Error("Rule source identity cannot be merged without a collision")
}

function assetMap(bundle: RuleApplyBundle): ReadonlyMap<RuleApplyAsset, RuleApplyCurrentAsset> {
  return new Map([
    ["checklist", bundle.checklist],
    ["project_context", bundle.projectContext],
    ["prompt_addendum", bundle.promptAddendum],
    ["rule_sources", bundle.ruleSources],
    ["rule_provenance", bundle.ruleProvenance]
  ])
}

function expectedPreImage(asset: RuleApplyCurrentAsset): RuleApplyExpectedPreImage {
  return asset.state === "missing"
    ? { state: "missing" }
    : { state: "present", sha256: sha256(asset.bytes) }
}

function sha256ForProposal(asset: RuleApplyCurrentAsset): string {
  return sha256(asset.state === "present" ? asset.bytes : EMPTY_BYTES)
}

function currentBytes(asset: RuleApplyCurrentAsset): Buffer {
  return asset.state === "present" ? Buffer.from(asset.bytes) : Buffer.alloc(0)
}

function requirePresentBytes(asset: RuleApplyCurrentAsset, label: string): Buffer {
  if (asset.state !== "present") throw new Error(`${label} is required`)
  return Buffer.from(asset.bytes)
}

function assertApplyBundleShape(bundle: RuleApplyBundle): void {
  if (!isPlainObject(bundle)) throw new Error("Approved rule bundle is malformed")
  for (const asset of [
    bundle.checklist,
    bundle.projectContext,
    bundle.promptAddendum,
    bundle.ruleSources,
    bundle.ruleProvenance
  ]) {
    if (
      !isPlainObject(asset) ||
      (asset.state !== "present" && asset.state !== "missing") ||
      (asset.state === "present" && !(asset.bytes instanceof Uint8Array))
    ) {
      throw new Error("Approved rule bundle asset is malformed")
    }
  }
}

function parseJsonBytes(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(decodeUtf8(bytes, label))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} JSON is malformed`)
    throw error
  }
}

function decodeUtf8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`${label} must contain valid UTF-8 bytes`)
  }
}

function serializeStableJson(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(canonicalJson(value), null, 2)}\n`, "utf8")
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (!isPlainObject(value)) return value
  const output: Record<string, unknown> = Object.create(null)
  for (const key of Object.keys(value).sort(compareText)) output[key] = canonicalJson(value[key])
  return output
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

function maxTimestamp(left: string, right: string): string {
  return compareText(left, right) >= 0 ? left : right
}

function isCanonicalTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    CANONICAL_TIMESTAMP.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
}

function isSafeTargetId(value: unknown, asset: RuleApplyTargetAsset): value is string {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > 128 || CONTROL_CHARACTER.test(value)) {
    return false
  }
  if (asset === "project_context") return /^CTX-(?!0000$)[0-9]{4}$/.test(value)
  if (asset === "prompt_addendum") return /^PRM-(?!0000$)[0-9]{4}$/.test(value)
  return true
}

function isLifecycle(value: unknown): value is "active" | "retired" {
  return value === "active" || value === "retired"
}

function isValidRuleAuthoringId(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    return validateRuleAuthoringId(value, "runId") === value
  } catch {
    return false
  }
}

function validateConflictResolutionShape(value: unknown): void {
  if (value === undefined) return
  if (!isPlainObject(value)) throw new Error("Proposal conflict resolution is malformed")
  for (const [conflictId, alternativeId] of Object.entries(value)) {
    if (!CANDIDATE_ID_PATTERN.test(conflictId) || typeof alternativeId !== "string" || !CANDIDATE_ID_PATTERN.test(alternativeId)) {
      throw new Error("Proposal conflict resolution is malformed")
    }
  }
}

function sortStringRecord(value: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareText(left, right)))
}

function markdownProvenanceKey(
  asset: "project-context" | "review-prompt-addendum",
  sectionId: string
): string {
  return `${asset}\u0000${sectionId}`
}

function sourceChunkKey(sourceId: string, chunkId: string): string {
  return `${sourceId}\u0000${chunkId}`
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function requiredMapValue<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key)
  if (value === undefined) throw new Error("Required validated apply-planning value is unavailable")
  return value
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: object, expectedKeys: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText)
  const expected = [...expectedKeys].sort(compareText)
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}
