import { createHash, randomBytes } from "node:crypto"
import { constants as fsConstants, type Stats } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { getProjectRulesPaths } from "../projectRules/io"
import { buildDocumentChunkId } from "./documentChunk"
import type {
  LocalSourceMapping,
  RuleDocumentBatchResult,
  RuleDocumentDuplicate
} from "./extraction/documentExtractor"
import { DEFAULT_RULE_AUTHORING_LIMITS } from "./ruleAuthoringLimits"
import {
  getRuleAuthoringGenerationPaths,
  getRuleAuthoringPaths,
  validateRuleAuthoringId,
  type RuleAuthoringPaths
} from "./ruleAuthoringPaths"
import {
  commitRuleAuthoringArtifactGeneration,
  readRuleAuthoringRun,
  withRuleAuthoringDirectoryLock,
  writeRuleAuthoringRun,
  type RuleAuthoringArtifactKey,
  type RuleAuthoringRunV1
} from "./ruleAuthoringRunStore"
import type {
  DocumentChunkLocatorV1,
  DocumentChunkV1,
  RuleSourceManifestV1
} from "./ruleAuthoringTypes"
import { buildRuleSourceManifest } from "./ruleSourceManifest"
import {
  buildRuleSourceIndex,
  serializeRuleSourceIndex,
  type RuleSourceIndexV1
} from "./sourceIndex"
import { sanitizeRemoteSafeText } from "./remoteSafeText"

const SCOPE_SCHEMA = "bob-bazaar-review/rule-source-scope/v1" as const
const LOCAL_MAPPING_SCHEMA = "bob-bazaar-review/rule-source-locations/v1" as const
const SOURCE_ID = /^src-[a-f0-9]{12,64}$/
const SELECTED_ID = /^selected-[a-f0-9]{32}$/
const CHUNK_ID = /^chunk-[a-f0-9]{64}$/
const SHA256 = /^[a-f0-9]{64}$/
const WARNING_CODE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/
const MAX_SCOPE_BYTES = 4 * 1024 * 1024
const MAX_LOCAL_MAPPING_BYTES = 1024 * 1024
const MAX_APPROVED_MANIFEST_BYTES = 4 * 1024 * 1024
const MAX_LOCAL_MAPPING_RUNS = 128
const MAX_WARNINGS = 100
const MAX_CHUNKS = Math.floor(DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes / 128)
const TASK7_ARTIFACT_KEYS: readonly RuleAuthoringArtifactKey[] = [
  "sourceManifest",
  "documentChunks",
  "sourceScope",
  "sourceIndex"
]
const DOWNSTREAM_ARTIFACT_KEYS: readonly RuleAuthoringArtifactKey[] = [
  "evidenceSelection",
  "selectedEvidence",
  "ruleProposalRaw",
  "ruleProposal",
  "proposalValidation",
  "proposalDecisions",
  "applyPreview",
  "applyManifest"
]
const ARTIFACT_BASENAMES: Record<RuleAuthoringArtifactKey, string> = {
  sourceManifest: "source-manifest.json",
  documentChunks: "document-chunks.jsonl",
  sourceScope: "source-scope.json",
  sourceIndex: "source-index.json",
  evidenceSelection: "evidence-selection.json",
  selectedEvidence: "selected-evidence.md",
  ruleProposalRaw: "rule-proposal.raw.txt",
  ruleProposal: "rule-proposal.json",
  proposalValidation: "proposal-validation.json",
  proposalDecisions: "proposal-decisions.json",
  applyPreview: "apply-preview.json",
  applyManifest: "apply-manifest.json"
}

type ScopeSourceStatus =
  | "success"
  | "partial"
  | "blocked"
  | "failed"
  | "requires_conversion"
  | "requires_ocr"
  | "duplicate"

export interface SelectedRuleAuthoringSource {
  selectedId: string
  absolutePath: string
  logicalName: string
  mediaType: string
  byteSize: number
}

export interface RuleAuthoringScopeSourceV1 {
  selected_id: string
  source_id?: string
  logical_name: string
  media_type: string
  byte_size: number
  sha256: string
  extraction_status: ScopeSourceStatus
  warnings: string[]
  duplicate: {
    reason: RuleDocumentDuplicate["reason"]
    duplicate_of: string
  } | null
  exclusion_required: boolean
  exclusion_approved: boolean
}

export interface RuleAuthoringScopeChunkV1 {
  source_id: string
  chunk_id: string
  text_sha256: string
  included: boolean
}

export interface RuleAuthoringSourceScopeV1 {
  schema_version: typeof SCOPE_SCHEMA
  run_id: string
  revision_sha256: string
  sources: RuleAuthoringScopeSourceV1[]
  chunks: RuleAuthoringScopeChunkV1[]
  confirmed: boolean
  selected_chunk_count: number
  selected_text_utf8_bytes: number
  confirmed_at?: string
}

export interface RuleAuthoringResumeSource {
  selectedId: string
  sourceId?: string
  logicalName: string
  mediaType: string
  byteSize: number
  extractionStatus: ScopeSourceStatus
  warnings: string[]
  exclusionApproved: boolean
}

export interface RuleAuthoringExtractionState {
  run: RuleAuthoringRunV1
  scope?: RuleAuthoringSourceScopeV1
  sources: RuleAuthoringResumeSource[]
  chunks: DocumentChunkV1[]
  includedChunkIds: string[]
}

export interface PersistRuleAuthoringExtractionInput {
  workspaceRoot: string
  runId: string
  run: RuleAuthoringRunV1
  batch: RuleDocumentBatchResult
  selectedSources: readonly SelectedRuleAuthoringSource[]
  exclusionApprovals: readonly { selectedId: string; approved: boolean }[]
}

export interface RuleAuthoringPayloadSummary {
  logicalNames: string[]
  selectedChunkCount: number
  utf8Bytes: number
}

export type ConfirmRuleAuthoringScopeResult =
  | {
      status: "confirmed"
      run: RuleAuthoringRunV1
      summary: RuleAuthoringPayloadSummary
    }
  | {
      status: "empty" | "overflow" | "approval_required"
      run: RuleAuthoringRunV1
    }

export interface ConfirmedRuleAuthoringHandoff {
  run: RuleAuthoringRunV1
  index: RuleSourceIndexV1
  chunks: DocumentChunkV1[]
  summary: RuleAuthoringPayloadSummary
}

interface CanonicalExtractionState {
  run: RuleAuthoringRunV1
  manifest: RuleSourceManifestV1
  chunks: DocumentChunkV1[]
  scope: RuleAuthoringSourceScopeV1
}

interface LocalMappingRun {
  run_id: string
  updated_at: string
  sources: Array<{
    logical_name: string
    absolute_path: string
    sha256: string
    status: LocalSourceMapping["status"]
  }>
}

interface LocalMappingFile {
  schema_version: typeof LOCAL_MAPPING_SCHEMA
  runs: LocalMappingRun[]
}

export async function loadApprovedRuleSourceManifest(
  workspaceRootInput: string
): Promise<RuleSourceManifestV1 | undefined> {
  const workspaceRoot = path.resolve(workspaceRootInput)
  const sourcesPath = getProjectRulesPaths(workspaceRoot).sourcesPath
  const raw = await readTrustedUtf8(workspaceRoot, sourcesPath, MAX_APPROVED_MANIFEST_BYTES, true)
  if (raw === undefined) return undefined
  const parsed = parseJsonObject(raw, "Approved rule source manifest")
  return parsed as unknown as RuleSourceManifestV1
}

export async function persistRuleAuthoringExtraction(
  input: PersistRuleAuthoringExtractionInput
): Promise<RuleAuthoringExtractionState> {
  validateRunInput(input.run, input.workspaceRoot, input.runId)
  assertExtractionCanChange(input.run)
  const manifest = canonicalManifest(input.batch.manifest)
  const chunks = canonicalChunks(manifest, input.batch.aiChunks)
  const scope = createInitialScope(input, manifest, chunks)
  const manifestText = serializeJson(manifest)
  const chunksText = serializeChunks(chunks)
  const scopeText = serializeJson(scope)

  const nextRun = await commitRuleAuthoringArtifactGeneration({
    workspaceRoot: input.workspaceRoot,
    runId: input.runId,
    expectedUpdatedAt: input.run.updatedAt,
    files: {
      sourceManifest: manifestText,
      documentChunks: chunksText,
      sourceScope: scopeText
    },
    removeArtifactKeys: ["sourceIndex"],
    buildNextRun: (current, artifacts) => extractionProgressRun(current, artifacts)
  })

  await persistLocalMappings(
    path.resolve(input.workspaceRoot),
    input.runId,
    input.batch.localSourceMappings
  ).catch(() => undefined)
  return extractionState(nextRun, scope, chunks)
}

export async function resumeRuleAuthoringExtraction(
  run: RuleAuthoringRunV1
): Promise<RuleAuthoringExtractionState> {
  const current = await readMatchingRuleAuthoringRun(run)
  if (extractionArtifactLifecycle(current) === "empty") {
    return { run: current, sources: [], chunks: [], includedChunkIds: [] }
  }
  const state = await loadCanonicalExtractionState(run)
  return extractionState(state.run, state.scope, state.chunks)
}

export async function updateRuleAuthoringScopeSelection(input: {
  run: RuleAuthoringRunV1
  chunkId: string
  included: boolean
}): Promise<RuleAuthoringExtractionState> {
  requireChunkId(input.chunkId)
  if (typeof input.included !== "boolean") throw new Error("Rule authoring chunk inclusion is invalid")
  const state = await loadCanonicalExtractionState(input.run)
  if (state.scope.confirmed) throw new Error("Confirmed rule authoring scope is immutable")
  const scope = cloneScope(state.scope)
  const target = scope.chunks.find((chunk) => chunk.chunk_id === input.chunkId)
  if (!target) throw new Error("Rule authoring scope does not contain the requested chunk")
  target.included = input.included
  applyScopeSummary(scope, state.manifest, state.chunks)
  refreshScopeRevision(scope, state.manifest, state.chunks)

  const nextRun = await commitRuleAuthoringArtifactGeneration({
    workspaceRoot: state.run.workspaceRoot,
    runId: state.run.runId,
    expectedUpdatedAt: state.run.updatedAt,
    files: { sourceScope: serializeJson(scope) },
    removeArtifactKeys: ["sourceIndex"],
    buildNextRun: (current, artifacts) => ({
      ...current,
      artifacts,
      updatedAt: timestampAfter(current.updatedAt)
    })
  })
  return extractionState(nextRun, scope, state.chunks)
}

export async function confirmRuleAuthoringScope(input: {
  run: RuleAuthoringRunV1
  expectedSummary?: RuleAuthoringPayloadSummary
}): Promise<ConfirmRuleAuthoringScopeResult> {
  const state = await loadCanonicalExtractionState(input.run)
  if (state.scope.confirmed) {
    const handoff = await validateConfirmedHandoff(state)
    assertExpectedSummary(input.expectedSummary, handoff.summary)
    return {
      status: "confirmed",
      run: handoff.run,
      summary: handoff.summary
    }
  }
  if (state.scope.sources.some((source) => source.exclusion_required && !source.exclusion_approved)) {
    return { status: "approval_required", run: state.run }
  }
  const selected = selectedCanonicalChunks(state.scope, state.chunks)
  const selectedBytes = selected.reduce((total, chunk) => total + Buffer.byteLength(chunk.text, "utf8"), 0)
  if (selected.length === 0 || selectedBytes === 0) return { status: "empty", run: state.run }
  if (!Number.isSafeInteger(selectedBytes) || selectedBytes > DEFAULT_RULE_AUTHORING_LIMITS.maxSelectedEvidenceBytes) {
    return { status: "overflow", run: state.run }
  }

  const selectedSourceIds = new Set(selected.map((chunk) => chunk.source_id))
  const filteredManifest: RuleSourceManifestV1 = {
    ...state.manifest,
    sources: state.manifest.sources.filter((source) => selectedSourceIds.has(source.source_id))
  }
  let index: RuleSourceIndexV1
  try {
    index = buildRuleSourceIndex(
      filteredManifest,
      selected,
      DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes
    )
  } catch (error) {
    if (error instanceof Error && /exceeds its byte limit/.test(error.message)) {
      return { status: "overflow", run: state.run }
    }
    throw error
  }

  const summary = summaryFromIndex(index, selectedBytes)
  assertExpectedSummary(input.expectedSummary, summary)
  const scope = cloneScope(state.scope)
  scope.confirmed = true
  scope.confirmed_at = timestampAfter(state.run.updatedAt)
  scope.selected_chunk_count = summary.selectedChunkCount
  scope.selected_text_utf8_bytes = summary.utf8Bytes
  refreshScopeRevision(scope, state.manifest, state.chunks)

  const nextRun = await commitRuleAuthoringArtifactGeneration({
    workspaceRoot: state.run.workspaceRoot,
    runId: state.run.runId,
    expectedUpdatedAt: state.run.updatedAt,
    files: {
      sourceScope: serializeJson(scope),
      sourceIndex: serializeRuleSourceIndex(index)
    },
    buildNextRun: (current, artifacts) => ({
      ...current,
      artifacts,
      updatedAt: timestampAfter(current.updatedAt)
    })
  })
  return { status: "confirmed", run: nextRun, summary }
}

export async function loadConfirmedRuleAuthoringHandoff(input: {
  workspaceRoot: string
  runId: string
}): Promise<ConfirmedRuleAuthoringHandoff> {
  const paths = getRuleAuthoringPaths(path.resolve(input.workspaceRoot), input.runId)
  const run = await readRuleAuthoringRun(paths)
  const state = await loadCanonicalExtractionState(run)
  if (!state.scope.confirmed) throw new Error("Rule authoring consent is not confirmed")
  return validateConfirmedHandoff(state)
}

export async function bindRuleAuthoringRunToWorkflow(input: {
  run: RuleAuthoringRunV1
  workflowRunId: string
}): Promise<RuleAuthoringRunV1> {
  const workflowRunId = validateRuleAuthoringId(input.workflowRunId, "workflowRunId")
  if (input.run.workflowRunId !== undefined && input.run.workflowRunId !== workflowRunId) {
    throw new Error("Rule authoring run is bound to another workflow")
  }
  if (input.run.workflowRunId === workflowRunId) return input.run
  const next = structuredClone(input.run)
  next.workflowRunId = workflowRunId
  next.updatedAt = timestampAfter(next.updatedAt)
  await writeRuleAuthoringRun(next, input.run.updatedAt)
  return next
}

export async function invalidateRuleAuthoringExtraction(input: {
  run: RuleAuthoringRunV1
}): Promise<RuleAuthoringRunV1> {
  assertExtractionCanChange(input.run)
  if (!TASK7_ARTIFACT_KEYS.some((key) => input.run.artifacts[key] !== undefined)) return input.run
  const next = structuredClone(input.run)
  for (const key of TASK7_ARTIFACT_KEYS) delete next.artifacts[key]
  next.updatedAt = timestampAfter(next.updatedAt)
  await writeRuleAuthoringRun(next, input.run.updatedAt)
  return next
}

export function resolveRuleAuthoringArtifactPath(
  run: RuleAuthoringRunV1,
  key: RuleAuthoringArtifactKey
): string {
  const relative = run.artifacts[key]
  if (typeof relative !== "string") throw new Error(`Rule authoring ${key} artifact is missing`)
  const workspaceRoot = path.resolve(run.workspaceRoot)
  const paths = getRuleAuthoringPaths(workspaceRoot, run.runId)
  const target = path.resolve(workspaceRoot, relative)
  assertContained(workspaceRoot, target)
  const relativeGenerationPath = path.relative(paths.generationsDirectory, target)
  const segments = relativeGenerationPath.split(path.sep)
  if (segments.length !== 2 || segments[1] !== ARTIFACT_BASENAMES[key]) {
    throw new Error(`Rule authoring ${key} artifact pointer is not canonical`)
  }
  const generation = getRuleAuthoringGenerationPaths(paths, segments[0])
  const expected = path.join(generation.generationDirectory, ARTIFACT_BASENAMES[key])
  if (target !== expected) throw new Error(`Rule authoring ${key} artifact pointer is not canonical`)
  return target
}

async function loadCanonicalExtractionState(runInput: RuleAuthoringRunV1): Promise<CanonicalExtractionState> {
  const run = await readMatchingRuleAuthoringRun(runInput)
  if (extractionArtifactLifecycle(run) === "empty") {
    throw new Error("Rule authoring run has no persisted extraction scope")
  }
  const manifestPath = resolveRuleAuthoringArtifactPath(run, "sourceManifest")
  const chunksPath = resolveRuleAuthoringArtifactPath(run, "documentChunks")
  const scopePath = resolveRuleAuthoringArtifactPath(run, "sourceScope")
  const [manifestRaw, chunksRaw, scopeRaw] = await Promise.all([
    readTrustedUtf8(run.workspaceRoot, manifestPath, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes),
    readTrustedUtf8(run.workspaceRoot, chunksPath, DEFAULT_RULE_AUTHORING_LIMITS.maxAggregateSourceBytes),
    readTrustedUtf8(run.workspaceRoot, scopePath, MAX_SCOPE_BYTES)
  ])
  const manifest = canonicalManifest(parseJsonObject(manifestRaw!, "Rule source manifest") as unknown as RuleSourceManifestV1)
  const chunks = canonicalChunks(manifest, parseChunkLines(chunksRaw!))
  const scope = parseAndValidateScope(scopeRaw!, run, manifest, chunks)
  if (scope.confirmed && run.artifacts.sourceIndex === undefined) {
    throw new Error("Confirmed rule authoring scope requires a filtered source index")
  }
  if (!scope.confirmed && run.artifacts.sourceIndex !== undefined) {
    throw new Error("Pre-consent rule authoring run must not publish a source index")
  }
  return { run, manifest, chunks, scope }
}

async function validateConfirmedHandoff(
  state: CanonicalExtractionState
): Promise<ConfirmedRuleAuthoringHandoff> {
  if (!state.scope.confirmed || !state.scope.confirmed_at) {
    throw new Error("Rule authoring consent is not confirmed")
  }
  const scopePath = resolveRuleAuthoringArtifactPath(state.run, "sourceScope")
  const indexPath = resolveRuleAuthoringArtifactPath(state.run, "sourceIndex")
  if (path.dirname(scopePath) !== path.dirname(indexPath)) {
    throw new Error("Confirmed rule authoring scope and index must share one artifact generation")
  }
  const selected = selectedCanonicalChunks(state.scope, state.chunks)
  const selectedBytes = selected.reduce((total, chunk) => total + Buffer.byteLength(chunk.text, "utf8"), 0)
  if (selected.length === 0 || selectedBytes === 0) throw new Error("Confirmed rule authoring scope is empty")
  const sourceIds = new Set(selected.map((chunk) => chunk.source_id))
  const filteredManifest: RuleSourceManifestV1 = {
    ...state.manifest,
    sources: state.manifest.sources.filter((source) => sourceIds.has(source.source_id))
  }
  const expected = buildRuleSourceIndex(
    filteredManifest,
    selected,
    DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes
  )
  const raw = await readTrustedUtf8(
    state.run.workspaceRoot,
    indexPath,
    DEFAULT_RULE_AUTHORING_LIMITS.maxSourceIndexBytes
  )
  const parsed = parseJsonObject(raw!, "Rule source index") as unknown as RuleSourceIndexV1
  if (JSON.stringify(parsed) !== JSON.stringify(expected)) {
    throw new Error("Rule source index does not match confirmed canonical scope")
  }
  const summary = summaryFromIndex(expected, selectedBytes)
  if (
    state.scope.selected_chunk_count !== summary.selectedChunkCount ||
    state.scope.selected_text_utf8_bytes !== summary.utf8Bytes
  ) {
    throw new Error("Confirmed rule authoring scope summary does not match its filtered index")
  }
  return {
    run: state.run,
    index: expected,
    chunks: selected,
    summary
  }
}

async function readMatchingRuleAuthoringRun(runInput: RuleAuthoringRunV1): Promise<RuleAuthoringRunV1> {
  validateRunInput(runInput, runInput.workspaceRoot, runInput.runId)
  const paths = getRuleAuthoringPaths(runInput.workspaceRoot, runInput.runId)
  const run = await readRuleAuthoringRun(paths)
  if (run.updatedAt !== runInput.updatedAt) throw new Error("Rule authoring run changed since it was loaded")
  return run
}

function extractionArtifactLifecycle(run: RuleAuthoringRunV1): "empty" | "persisted" {
  const presentTask7 = TASK7_ARTIFACT_KEYS.filter((key) => run.artifacts[key] !== undefined)
  if (presentTask7.length === 0) {
    if (DOWNSTREAM_ARTIFACT_KEYS.some((key) => run.artifacts[key] !== undefined)) {
      throw new Error("Rule authoring run has downstream artifacts without a persisted extraction scope")
    }
    return "empty"
  }
  const required = ["sourceManifest", "documentChunks", "sourceScope"] as const
  if (required.some((key) => run.artifacts[key] === undefined)) {
    throw new Error("Rule authoring run has a partial or inconsistent extraction artifact set")
  }
  return "persisted"
}

function createInitialScope(
  input: PersistRuleAuthoringExtractionInput,
  manifest: RuleSourceManifestV1,
  chunks: readonly DocumentChunkV1[]
): RuleAuthoringSourceScopeV1 {
  if (
    !Array.isArray(input.selectedSources) ||
    input.selectedSources.length === 0 ||
    input.selectedSources.length > DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles
  ) {
    throw new Error("Rule authoring selected source count is invalid")
  }
  if (!Array.isArray(input.batch.localSourceMappings)) throw new Error("Rule authoring source mapping is invalid")
  const selectedByPath = new Map<string, SelectedRuleAuthoringSource>()
  const selectedIds = new Set<string>()
  for (const selected of input.selectedSources) {
    requireSelectedId(selected.selectedId)
    const absolutePath = requireAbsolutePath(selected.absolutePath)
    requireLogicalName(selected.logicalName)
    requireMediaType(selected.mediaType)
    requireNonNegativeInteger(selected.byteSize, "selected source bytes")
    if (selectedIds.has(selected.selectedId) || selectedByPath.has(absolutePath)) {
      throw new Error("Rule authoring selected source identity is duplicated")
    }
    selectedIds.add(selected.selectedId)
    selectedByPath.set(absolutePath, selected)
  }

  const approvals = new Map<string, boolean>()
  for (const approval of input.exclusionApprovals) {
    requireSelectedId(approval.selectedId)
    if (!selectedIds.has(approval.selectedId) || approvals.has(approval.selectedId) || typeof approval.approved !== "boolean") {
      throw new Error("Rule authoring exclusion approval is invalid")
    }
    approvals.set(approval.selectedId, approval.approved)
  }
  const mappings = new Map<string, LocalSourceMapping>()
  for (const mapping of input.batch.localSourceMappings) {
    const absolutePath = requireAbsolutePath(mapping.absolutePath)
    if (mappings.has(absolutePath)) throw new Error("Rule authoring local source mapping is duplicated")
    mappings.set(absolutePath, mapping)
  }
  if (mappings.size !== selectedByPath.size) throw new Error("Rule authoring selected source mapping is incomplete")
  const documents = new Map<string, RuleDocumentBatchResult["documents"][number]>()
  for (const document of input.batch.documents) {
    const absolutePath = requireAbsolutePath(document.localPath)
    if (documents.has(absolutePath)) throw new Error("Rule authoring extracted source path is duplicated")
    documents.set(absolutePath, document)
  }
  const manifestByHash = new Map(manifest.sources.map((source) => [source.sha256, source]))
  const duplicatePool = createDuplicateMetadataPool(input.batch.duplicates)

  const sources = input.selectedSources.map((selected): RuleAuthoringScopeSourceV1 => {
    const absolutePath = requireAbsolutePath(selected.absolutePath)
    const mapping = mappings.get(absolutePath)
    if (!mapping) throw new Error("Rule authoring selected source mapping is missing")
    if (mapping.logicalName !== selected.logicalName) throw new Error("Rule authoring selected source mapping changed its logical name")
    const sha = requireSha256(mapping.sha256)
    const status = requireScopeStatus(mapping.status)
    const document = documents.get(absolutePath)
    if (document) {
      if (
        document.logicalName !== selected.logicalName ||
        document.mediaType !== selected.mediaType ||
        document.byteSize !== selected.byteSize ||
        document.sha256 !== sha ||
        document.status !== status
      ) {
        throw new Error("Rule authoring extraction result does not match its selected source")
      }
    } else if (status !== "duplicate") {
      throw new Error("Rule authoring extraction result is missing for a selected source")
    }
    const duplicate = status === "duplicate"
      ? consumeDuplicateMetadata(duplicatePool, selected.logicalName, sha)
      : null
    const exclusionRequired = status !== "success"
    const source: RuleAuthoringScopeSourceV1 = {
      selected_id: selected.selectedId,
      logical_name: requireLogicalName(selected.logicalName),
      media_type: requireMediaType(selected.mediaType),
      byte_size: requireNonNegativeInteger(selected.byteSize, "selected source bytes"),
      sha256: sha,
      extraction_status: status,
      warnings: safeWarningCodes(document?.warnings ?? []),
      duplicate,
      exclusion_required: exclusionRequired,
      exclusion_approved: exclusionRequired ? approvals.get(selected.selectedId) === true : false
    }
    const manifestSource = manifestByHash.get(sha)
    if (status === "success" || status === "partial") {
      if (!manifestSource) throw new Error("Shareable rule authoring source is missing from its manifest")
      source.source_id = requireSourceId(manifestSource.source_id)
    }
    return source
  })
  if ([...duplicatePool.values()].some((records) => records.length > 0)) {
    throw new Error("Rule authoring duplicate metadata has leftover multiplicity")
  }
  const scope: RuleAuthoringSourceScopeV1 = {
    schema_version: SCOPE_SCHEMA,
    run_id: input.runId,
    revision_sha256: "0".repeat(64),
    sources,
    chunks: chunks.map((chunk) => ({
      source_id: chunk.source_id,
      chunk_id: chunk.chunk_id,
      text_sha256: chunk.text_sha256,
      included: true
    })),
    confirmed: false,
    selected_chunk_count: 0,
    selected_text_utf8_bytes: 0
  }
  applyScopeSummary(scope, manifest, chunks)
  refreshScopeRevision(scope, manifest, chunks)
  return parseAndValidateScope(serializeJson(scope), input.run, manifest, chunks)
}

function extractionProgressRun(
  current: RuleAuthoringRunV1,
  artifacts: RuleAuthoringRunV1["artifacts"]
): RuleAuthoringRunV1 {
  assertExtractionCanChange(current)
  const timestamp = timestampAfter(current.updatedAt)
  const phases = structuredClone(current.phases)
  phases.sources = {
    status: "completed",
    startedAt: phases.sources.startedAt ?? current.createdAt,
    completedAt: phases.sources.completedAt ?? timestamp
  }
  phases.extraction = {
    status: "completed",
    startedAt: phases.extraction.startedAt ?? timestamp,
    completedAt: phases.extraction.completedAt ?? timestamp
  }
  phases.evidence_selection = {
    status: "in_progress",
    startedAt: phases.evidence_selection.startedAt ?? timestamp
  }
  return {
    ...current,
    currentPhase: "evidence_selection",
    phases,
    artifacts,
    updatedAt: timestamp
  }
}

function canonicalManifest(input: RuleSourceManifestV1): RuleSourceManifestV1 {
  if (!isPlainObject(input) || !Array.isArray(input.sources)) {
    throw new Error("Rule source manifest is invalid")
  }
  const rebuilt = buildRuleSourceManifest({
    generatedAt: input.generated_at,
    sources: input.sources.map((source) => ({
      logicalName: source.logical_name,
      mediaType: source.media_type,
      sha256: source.sha256,
      byteSize: source.byte_size,
      extractionStatus: source.extraction_status,
      extractor: source.extractor,
      warnings: source.warnings
    }))
  })
  if (JSON.stringify(rebuilt) !== JSON.stringify(input)) {
    throw new Error("Rule source manifest is not canonical")
  }
  return structuredClone(input)
}

function canonicalChunks(
  manifest: RuleSourceManifestV1,
  input: readonly DocumentChunkV1[]
): DocumentChunkV1[] {
  if (!Array.isArray(input) || input.length > MAX_CHUNKS) throw new Error("Document chunk count exceeds its limit")
  const sources = new Map(manifest.sources.map((source) => [source.source_id, source]))
  const seen = new Set<string>()
  return input.map((chunk): DocumentChunkV1 => {
    if (!isPlainObject(chunk)) throw new Error("Document chunk is invalid")
    const allowed = new Set(["schema_version", "chunk_id", "source_id", "kind", "locator", "title", "text", "text_sha256", "flags"])
    if (Object.keys(chunk).some((key) => !allowed.has(key))) throw new Error("Document chunk is invalid")
    const source = sources.get(requireSourceId(chunk.source_id))
    if (!source || chunk.schema_version !== "bob-bazaar-review/document-chunk/v1") throw new Error("Document chunk is invalid")
    requireChunkId(chunk.chunk_id)
    if (seen.has(chunk.chunk_id)) throw new Error("Document chunk identity is duplicated")
    seen.add(chunk.chunk_id)
    if (!isChunkKind(chunk.kind) || !isPlainObject(chunk.locator)) throw new Error("Document chunk is invalid")
    validateLocator(chunk.locator)
    if (
      typeof chunk.text !== "string" ||
      Buffer.byteLength(chunk.text, "utf8") > DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes ||
      sha256(chunk.text) !== requireSha256(chunk.text_sha256)
    ) {
      throw new Error("Document chunk text identity is invalid")
    }
    const expectedId = buildDocumentChunkId(source.source_id, source.media_type, chunk.kind, chunk.locator)
    if (chunk.chunk_id !== expectedId) throw new Error("Document chunk structural identity is invalid")
    if (chunk.title !== undefined && (typeof chunk.title !== "string" || Buffer.byteLength(chunk.title, "utf8") > DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes)) {
      throw new Error("Document chunk title is invalid")
    }
    if (!Array.isArray(chunk.flags) || chunk.flags.some((flag) => typeof flag !== "string" || Buffer.byteLength(flag, "utf8") > 128 || CONTROL_CHARACTER.test(flag))) {
      throw new Error("Document chunk flags are invalid")
    }
    return structuredClone(chunk) as DocumentChunkV1
  })
}

function parseAndValidateScope(
  raw: string,
  run: RuleAuthoringRunV1,
  manifest: RuleSourceManifestV1,
  chunks: readonly DocumentChunkV1[]
): RuleAuthoringSourceScopeV1 {
  const parsed = parseJsonObject(raw, "Rule authoring source scope")
  const allowedTop = new Set([
    "schema_version",
    "run_id",
    "revision_sha256",
    "sources",
    "chunks",
    "confirmed",
    "selected_chunk_count",
    "selected_text_utf8_bytes",
    "confirmed_at"
  ])
  if (
    Object.keys(parsed).some((key) => !allowedTop.has(key)) ||
    parsed.schema_version !== SCOPE_SCHEMA ||
    parsed.run_id !== run.runId ||
    !Array.isArray(parsed.sources) ||
    parsed.sources.length === 0 ||
    parsed.sources.length > DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles ||
    !Array.isArray(parsed.chunks) ||
    parsed.chunks.length !== chunks.length ||
    typeof parsed.confirmed !== "boolean"
  ) {
    throw new Error("Rule authoring source scope is invalid or does not match its canonical revision")
  }
  const sourceIds = new Set<string>()
  const selectedIds = new Set<string>()
  const sources = parsed.sources.map((value): RuleAuthoringScopeSourceV1 => {
    if (!isPlainObject(value)) throw new Error("Rule authoring source scope has invalid source metadata")
    const allowed = new Set(["selected_id", "source_id", "logical_name", "media_type", "byte_size", "sha256", "extraction_status", "warnings", "duplicate", "exclusion_required", "exclusion_approved"])
    if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("Rule authoring source scope has invalid source metadata")
    const selectedId = requireSelectedId(value.selected_id)
    if (selectedIds.has(selectedId)) throw new Error("Rule authoring source scope has duplicate selected IDs")
    selectedIds.add(selectedId)
    const sourceId = value.source_id === undefined ? undefined : requireSourceId(value.source_id)
    if (sourceId) {
      if (sourceIds.has(sourceId)) throw new Error("Rule authoring source scope has duplicate source IDs")
      sourceIds.add(sourceId)
    }
    const duplicate = parseDuplicateMetadata(value.duplicate)
    const status = requireScopeStatus(value.extraction_status)
    const exclusionRequired = status !== "success"
    if (
      value.exclusion_required !== exclusionRequired ||
      typeof value.exclusion_approved !== "boolean" ||
      (!exclusionRequired && value.exclusion_approved)
    ) {
      throw new Error("Rule authoring source scope has invalid exclusion approval")
    }
    if ((status === "duplicate") !== (duplicate !== null)) {
      throw new Error("Rule authoring source scope has inconsistent duplicate metadata")
    }
    const source: RuleAuthoringScopeSourceV1 = {
      selected_id: selectedId,
      ...(sourceId ? { source_id: sourceId } : {}),
      logical_name: requireLogicalName(value.logical_name),
      media_type: requireMediaType(value.media_type),
      byte_size: requireNonNegativeInteger(value.byte_size, "source scope bytes"),
      sha256: requireSha256(value.sha256),
      extraction_status: status,
      warnings: safeWarningCodes(value.warnings),
      duplicate,
      exclusion_required: exclusionRequired,
      exclusion_approved: value.exclusion_approved
    }
    const shareable = status === "success" || status === "partial"
    if (shareable !== Boolean(sourceId)) {
      throw new Error("Rule authoring source scope has inconsistent shareable source identity")
    }
    if (sourceId) {
      const manifestSource = manifest.sources.find((candidate) => candidate.source_id === sourceId)
      if (
        !manifestSource ||
        manifestSource.logical_name !== source.logical_name ||
        manifestSource.media_type !== source.media_type ||
        manifestSource.byte_size !== source.byte_size ||
        manifestSource.sha256 !== source.sha256 ||
        manifestSource.extraction_status !== source.extraction_status ||
        JSON.stringify(manifestSource.warnings) !== JSON.stringify(source.warnings)
      ) {
        throw new Error("Rule authoring source scope does not match its canonical manifest")
      }
    }
    return source
  })
  if (sourceIds.size !== manifest.sources.length) {
    throw new Error("Rule authoring source scope does not cover its canonical manifest")
  }
  const chunkRecords = parsed.chunks.map((value, index): RuleAuthoringScopeChunkV1 => {
    if (!isPlainObject(value) || !hasExactKeys(value, ["source_id", "chunk_id", "text_sha256", "included"])) {
      throw new Error("Rule authoring source scope has invalid chunk metadata")
    }
    const canonical = chunks[index]
    if (
      value.source_id !== canonical.source_id ||
      value.chunk_id !== canonical.chunk_id ||
      value.text_sha256 !== canonical.text_sha256 ||
      typeof value.included !== "boolean"
    ) {
      throw new Error("Rule authoring source scope chunk identity does not match canonical chunks")
    }
    return {
      source_id: requireSourceId(value.source_id),
      chunk_id: requireChunkId(value.chunk_id),
      text_sha256: requireSha256(value.text_sha256),
      included: value.included
    }
  })
  const scope: RuleAuthoringSourceScopeV1 = {
    schema_version: SCOPE_SCHEMA,
    run_id: run.runId,
    revision_sha256: requireSha256(parsed.revision_sha256),
    sources,
    chunks: chunkRecords,
    confirmed: parsed.confirmed,
    selected_chunk_count: requireNonNegativeInteger(parsed.selected_chunk_count, "selected chunk count"),
    selected_text_utf8_bytes: requireNonNegativeInteger(parsed.selected_text_utf8_bytes, "selected text bytes")
  }
  if (parsed.confirmed_at !== undefined) scope.confirmed_at = requireTimestamp(parsed.confirmed_at)
  if (scope.confirmed !== Boolean(scope.confirmed_at)) throw new Error("Rule authoring source scope confirmation timestamp is invalid")
  if (scope.confirmed && scope.sources.some((source) => source.exclusion_required && !source.exclusion_approved)) {
    throw new Error("Confirmed rule authoring source scope has unapproved exclusions")
  }
  const recomputed = cloneScope(scope)
  applyScopeSummary(recomputed, manifest, chunks)
  if (
    recomputed.selected_chunk_count !== scope.selected_chunk_count ||
    recomputed.selected_text_utf8_bytes !== scope.selected_text_utf8_bytes
  ) {
    throw new Error("Rule authoring source scope summary is inconsistent")
  }
  if (scope.revision_sha256 !== scopeRevision(manifest, chunks, scope)) {
    throw new Error("Rule authoring source scope does not match its canonical revision")
  }
  return scope
}

function applyScopeSummary(
  scope: RuleAuthoringSourceScopeV1,
  _manifest: RuleSourceManifestV1,
  chunks: readonly DocumentChunkV1[]
): void {
  let count = 0
  let bytes = 0
  for (const [index, record] of scope.chunks.entries()) {
    if (!record.included) continue
    count += 1
    bytes += Buffer.byteLength(chunks[index].text, "utf8")
    if (!Number.isSafeInteger(bytes)) throw new Error("Rule authoring selected text bytes exceed the safe integer range")
  }
  scope.selected_chunk_count = count
  scope.selected_text_utf8_bytes = bytes
}

function selectedCanonicalChunks(
  scope: RuleAuthoringSourceScopeV1,
  chunks: readonly DocumentChunkV1[]
): DocumentChunkV1[] {
  return chunks.filter((_chunk, index) => scope.chunks[index].included)
}

function summaryFromIndex(index: RuleSourceIndexV1, utf8Bytes: number): RuleAuthoringPayloadSummary {
  return {
    logicalNames: index.sources.map((source) => source.logical_name).sort(compareText),
    selectedChunkCount: index.sources.reduce((total, source) => total + source.chunks.length, 0),
    utf8Bytes
  }
}

function assertExpectedSummary(
  expected: RuleAuthoringPayloadSummary | undefined,
  actual: RuleAuthoringPayloadSummary
): void {
  if (expected === undefined) return
  if (
    !Array.isArray(expected.logicalNames) ||
    expected.logicalNames.some((name) => typeof name !== "string") ||
    !Number.isSafeInteger(expected.selectedChunkCount) ||
    expected.selectedChunkCount < 0 ||
    !Number.isSafeInteger(expected.utf8Bytes) ||
    expected.utf8Bytes < 0 ||
    JSON.stringify(expected.logicalNames) !== JSON.stringify(actual.logicalNames) ||
    expected.selectedChunkCount !== actual.selectedChunkCount ||
    expected.utf8Bytes !== actual.utf8Bytes
  ) {
    throw new Error("Displayed rule authoring scope summary does not match the canonical consent scope")
  }
}

function extractionState(
  run: RuleAuthoringRunV1,
  scope: RuleAuthoringSourceScopeV1,
  chunks: readonly DocumentChunkV1[]
): RuleAuthoringExtractionState {
  return {
    run,
    scope: cloneScope(scope),
    sources: scope.sources.map((source) => ({
      selectedId: source.selected_id,
      ...(source.source_id ? { sourceId: source.source_id } : {}),
      logicalName: source.logical_name,
      mediaType: source.media_type,
      byteSize: source.byte_size,
      extractionStatus: source.extraction_status,
      warnings: [...source.warnings],
      exclusionApproved: source.exclusion_approved
    })),
    chunks: chunks.map((chunk) => structuredClone(chunk)),
    includedChunkIds: scope.chunks.filter((chunk) => chunk.included).map((chunk) => chunk.chunk_id)
  }
}

function consumeDuplicateMetadata(
  pool: Map<string, RuleAuthoringScopeSourceV1["duplicate"][]>,
  logicalName: string,
  sha: string
): RuleAuthoringScopeSourceV1["duplicate"] {
  const records = pool.get(duplicateKey(logicalName, sha))
  const duplicate = records?.shift()
  if (!duplicate) throw new Error("Rule authoring duplicate metadata is missing for selected multiplicity")
  return duplicate
}

function createDuplicateMetadataPool(
  value: readonly RuleDocumentDuplicate[]
): Map<string, RuleAuthoringScopeSourceV1["duplicate"][]> {
  if (!Array.isArray(value) || value.length > DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles) {
    throw new Error("Rule authoring duplicate metadata count is invalid")
  }
  const pool = new Map<string, RuleAuthoringScopeSourceV1["duplicate"][]>()
  for (const record of value) {
    if (
      !isPlainObject(record) ||
      !hasExactKeys(record, ["logical_name", "sha256", "reason", "duplicate_of"]) ||
      (record.reason !== "duplicate_in_run" && record.reason !== "duplicate_existing_manifest") ||
      typeof record.duplicate_of !== "string" ||
      !record.duplicate_of ||
      Buffer.byteLength(record.duplicate_of, "utf8") > 4096 ||
      CONTROL_CHARACTER.test(record.duplicate_of)
    ) {
      throw new Error("Rule authoring duplicate metadata is invalid")
    }
    const logicalName = requireLogicalName(record.logical_name)
    const sha = requireSha256(record.sha256)
    const key = duplicateKey(logicalName, sha)
    const records = pool.get(key) ?? []
    records.push({
      reason: record.reason,
      duplicate_of: sanitizeRemoteSafeText(record.duplicate_of, 255)
    })
    pool.set(key, records)
  }
  return pool
}

function duplicateKey(logicalName: string, sha: string): string {
  return JSON.stringify([logicalName, sha])
}

function parseDuplicateMetadata(value: unknown): RuleAuthoringScopeSourceV1["duplicate"] {
  if (value === null) return null
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, ["reason", "duplicate_of"]) ||
    (value.reason !== "duplicate_in_run" && value.reason !== "duplicate_existing_manifest") ||
    typeof value.duplicate_of !== "string" ||
    !value.duplicate_of ||
    Buffer.byteLength(value.duplicate_of, "utf8") > 255 ||
    CONTROL_CHARACTER.test(value.duplicate_of)
  ) {
    throw new Error("Rule authoring duplicate metadata is invalid")
  }
  return { reason: value.reason, duplicate_of: value.duplicate_of }
}

function validateLocator(locator: DocumentChunkLocatorV1): void {
  const allowed = new Set(["heading_path", "block_index", "table_index", "sheet", "row", "cell_range", "page", "part_index"])
  if (Object.keys(locator).some((key) => !allowed.has(key))) throw new Error("Document chunk locator is invalid")
  if (
    locator.heading_path !== undefined &&
    (!Array.isArray(locator.heading_path) || locator.heading_path.length > 64 || locator.heading_path.some((part) => typeof part !== "string" || Buffer.byteLength(part, "utf8") > DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes))
  ) {
    throw new Error("Document chunk locator is invalid")
  }
  for (const key of ["block_index", "table_index", "row", "page", "part_index"] as const) {
    const value = locator[key]
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new Error("Document chunk locator is invalid")
  }
  for (const key of ["sheet", "cell_range"] as const) {
    const value = locator[key]
    if (value !== undefined && (typeof value !== "string" || Buffer.byteLength(value, "utf8") > DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes)) {
      throw new Error("Document chunk locator is invalid")
    }
  }
}

function isChunkKind(value: unknown): value is DocumentChunkV1["kind"] {
  return value === "heading" || value === "paragraph" || value === "list" || value === "table" || value === "row" || value === "page"
}

function refreshScopeRevision(
  scope: RuleAuthoringSourceScopeV1,
  manifest: RuleSourceManifestV1,
  chunks: readonly DocumentChunkV1[]
): void {
  scope.revision_sha256 = scopeRevision(manifest, chunks, scope)
}

function scopeRevision(
  manifest: RuleSourceManifestV1,
  chunks: readonly DocumentChunkV1[],
  scope: RuleAuthoringSourceScopeV1
): string {
  const normalizedScope = {
    schema_version: scope.schema_version,
    run_id: scope.run_id,
    sources: scope.sources.map((source) => ({
      selected_id: source.selected_id,
      ...(source.source_id === undefined ? {} : { source_id: source.source_id }),
      logical_name: source.logical_name,
      media_type: source.media_type,
      byte_size: source.byte_size,
      sha256: source.sha256,
      extraction_status: source.extraction_status,
      warnings: [...source.warnings],
      duplicate: source.duplicate === null
        ? null
        : { reason: source.duplicate.reason, duplicate_of: source.duplicate.duplicate_of },
      exclusion_required: source.exclusion_required,
      exclusion_approved: source.exclusion_approved
    })),
    chunks: scope.chunks.map((chunk) => ({
      source_id: chunk.source_id,
      chunk_id: chunk.chunk_id,
      text_sha256: chunk.text_sha256,
      included: chunk.included
    })),
    confirmed: scope.confirmed,
    selected_chunk_count: scope.selected_chunk_count,
    selected_text_utf8_bytes: scope.selected_text_utf8_bytes,
    ...(scope.confirmed_at === undefined ? {} : { confirmed_at: scope.confirmed_at })
  }
  return sha256(JSON.stringify({ manifest, chunks, scope: normalizedScope }))
}

function assertExtractionCanChange(run: RuleAuthoringRunV1): void {
  if (run.artifacts.sourceIndex !== undefined || DOWNSTREAM_ARTIFACT_KEYS.some((key) => run.artifacts[key] !== undefined)) {
    throw new Error("Confirmed or downstream rule authoring extraction is immutable")
  }
}

function validateRunInput(run: RuleAuthoringRunV1, workspaceRoot: string, runId: string): void {
  if (!isPlainObject(run)) throw new Error("Rule authoring run is invalid")
  if (
    path.resolve(run.workspaceRoot) !== path.resolve(workspaceRoot) ||
    run.runId !== validateRuleAuthoringId(runId, "runId")
  ) {
    throw new Error("Rule authoring run identity does not match its workspace")
  }
}

async function persistLocalMappings(
  workspaceRoot: string,
  runIdInput: string,
  mappings: readonly LocalSourceMapping[]
): Promise<void> {
  const runId = validateRuleAuthoringId(runIdInput, "runId")
  const paths = getRuleAuthoringPaths(workspaceRoot, runId)
  const lockDirectory = path.join(paths.authoringDirectory, ".source-location-lock")
  await withRuleAuthoringDirectoryLock(workspaceRoot, lockDirectory, async () => {
    const raw = await readTrustedUtf8(workspaceRoot, paths.sourceLocationsPath, MAX_LOCAL_MAPPING_BYTES, true)
    const current = raw === undefined ? { schema_version: LOCAL_MAPPING_SCHEMA, runs: [] } : parseLocalMappingFile(raw)
    const nextRun: LocalMappingRun = {
      run_id: runId,
      updated_at: new Date().toISOString(),
      sources: mappings.map((mapping) => ({
        logical_name: requireLogicalName(mapping.logicalName),
        absolute_path: requireAbsolutePath(mapping.absolutePath),
        sha256: requireSha256(mapping.sha256),
        status: requireLocalStatus(mapping.status)
      }))
    }
    const runs = current.runs
      .filter((candidate) => candidate.run_id !== runId)
      .concat(nextRun)
      .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at) || compareText(left.run_id, right.run_id))
      .slice(0, MAX_LOCAL_MAPPING_RUNS)
    let serialized = serializeJson({ schema_version: LOCAL_MAPPING_SCHEMA, runs })
    while (Buffer.byteLength(serialized, "utf8") > MAX_LOCAL_MAPPING_BYTES && runs.length > 1) {
      runs.pop()
      serialized = serializeJson({ schema_version: LOCAL_MAPPING_SCHEMA, runs })
    }
    if (Buffer.byteLength(serialized, "utf8") > MAX_LOCAL_MAPPING_BYTES) return
    await atomicWriteTrusted(workspaceRoot, paths.sourceLocationsPath, serialized)
  })
}

function parseLocalMappingFile(raw: string): LocalMappingFile {
  const parsed = parseJsonObject(raw, "Local source mapping")
  if (!hasExactKeys(parsed, ["schema_version", "runs"]) || parsed.schema_version !== LOCAL_MAPPING_SCHEMA || !Array.isArray(parsed.runs) || parsed.runs.length > MAX_LOCAL_MAPPING_RUNS) {
    throw new Error("Local source mapping is invalid")
  }
  const seen = new Set<string>()
  const runs = parsed.runs.map((value): LocalMappingRun => {
    if (!isPlainObject(value) || !hasExactKeys(value, ["run_id", "updated_at", "sources"]) || !Array.isArray(value.sources) || value.sources.length > DEFAULT_RULE_AUTHORING_LIMITS.maxSourceFiles) {
      throw new Error("Local source mapping is invalid")
    }
    const runId = validateRuleAuthoringId(value.run_id, "runId")
    if (seen.has(runId)) throw new Error("Local source mapping is invalid")
    seen.add(runId)
    return {
      run_id: runId,
      updated_at: requireTimestamp(value.updated_at),
      sources: value.sources.map((source) => {
        if (!isPlainObject(source) || !hasExactKeys(source, ["logical_name", "absolute_path", "sha256", "status"])) {
          throw new Error("Local source mapping is invalid")
        }
        return {
          logical_name: requireLogicalName(source.logical_name),
          absolute_path: requireAbsolutePath(source.absolute_path),
          sha256: requireSha256(source.sha256),
          status: requireLocalStatus(source.status)
        }
      })
    }
  })
  return { schema_version: LOCAL_MAPPING_SCHEMA, runs }
}

function parseChunkLines(raw: string): DocumentChunkV1[] {
  const lines = raw.split("\n").filter((line) => line.length > 0)
  if (lines.length > MAX_CHUNKS) throw new Error("Persisted document chunk count exceeds its limit")
  return lines.map((line) => parseJsonObject(line, "Persisted document chunk") as unknown as DocumentChunkV1)
}

async function readTrustedUtf8(
  workspaceRootInput: string,
  filePathInput: string,
  maxBytes: number,
  optional = false
): Promise<string | undefined> {
  const workspaceRoot = path.resolve(workspaceRootInput)
  const filePath = path.resolve(filePathInput)
  assertContained(workspaceRoot, filePath)
  let before: Stats
  try {
    before = await fs.lstat(filePath)
  } catch (error) {
    if (optional && isNodeError(error) && error.code === "ENOENT") return undefined
    throw error
  }
  if (before.isSymbolicLink() || !before.isFile() || before.size > maxBytes) {
    throw new Error("Rule authoring artifact is unsafe or exceeds its byte limit")
  }
  const directory = path.dirname(filePath)
  const directoryBefore = await trustedDirectoryIdentity(workspaceRoot, directory)
  const handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
  try {
    const opened = await handle.stat()
    if (!sameFile(before, opened)) throw new Error("Rule authoring artifact changed while opening")
    const buffer = Buffer.allocUnsafe(maxBytes + 1)
    let offset = 0
    while (offset < buffer.length) {
      const result = await handle.read(buffer, offset, buffer.length - offset, offset)
      if (result.bytesRead === 0) break
      offset += result.bytesRead
    }
    if (offset > maxBytes) throw new Error("Rule authoring artifact exceeds its byte limit")
    const after = await handle.stat()
    const pathAfter = await fs.lstat(filePath)
    const directoryAfter = await trustedDirectoryIdentity(workspaceRoot, directory)
    if (!sameFile(opened, after) || !sameFile(after, pathAfter) || !sameIdentity(directoryBefore, directoryAfter)) {
      throw new Error("Rule authoring artifact changed while reading")
    }
    return buffer.subarray(0, offset).toString("utf8")
  } finally {
    await handle.close()
  }
}

async function atomicWriteTrusted(workspaceRootInput: string, targetInput: string, content: string): Promise<void> {
  const workspaceRoot = path.resolve(workspaceRootInput)
  const target = path.resolve(targetInput)
  assertContained(workspaceRoot, target)
  const directory = path.dirname(target)
  const directoryBefore = await trustedDirectoryIdentity(workspaceRoot, directory)
  const previous = await lstatOptional(target)
  if (previous && (previous.isSymbolicLink() || !previous.isFile())) throw new Error("Local source mapping target is unsafe")
  const temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`)
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(temporary, "wx", 0o600)
    await handle.writeFile(content, "utf8")
    await handle.sync()
    const written = await handle.stat()
    await handle.close()
    handle = undefined
    const directoryAfter = await trustedDirectoryIdentity(workspaceRoot, directory)
    if (!sameIdentity(directoryBefore, directoryAfter)) throw new Error("Local source mapping directory changed")
    const currentPrevious = await lstatOptional(target)
    if (!sameOptionalFile(previous, currentPrevious)) throw new Error("Local source mapping changed before replacement")
    const currentTemporary = await fs.lstat(temporary)
    if (!sameFile(written, currentTemporary) || currentTemporary.isSymbolicLink()) throw new Error("Local source mapping temporary file changed")
    await fs.rename(temporary, target)
    const installed = await fs.lstat(target)
    if (!sameFile(written, installed) || installed.isSymbolicLink()) throw new Error("Local source mapping replacement changed")
  } finally {
    await handle?.close().catch(() => undefined)
    if (sameIdentity(directoryBefore, await trustedDirectoryIdentity(workspaceRoot, directory).catch(() => undefined))) {
      await fs.rm(temporary, { force: true }).catch(() => undefined)
    }
  }
}

async function trustedDirectoryIdentity(workspaceRoot: string, directory: string): Promise<FileIdentity> {
  assertContained(workspaceRoot, directory)
  let current = workspaceRoot
  const root = await fs.lstat(current)
  if (root.isSymbolicLink() || !root.isDirectory()) throw new Error("Workspace root is unsafe")
  for (const segment of path.relative(workspaceRoot, directory).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    const stats = await fs.lstat(current)
    if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error("Rule authoring directory is unsafe")
  }
  const [realRoot, realDirectory] = await Promise.all([fs.realpath(workspaceRoot), fs.realpath(directory)])
  assertContained(realRoot, realDirectory)
  return fileIdentity(rootForDirectory(await fs.lstat(directory)))
}

function rootForDirectory(stats: Stats): Stats {
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("Rule authoring directory is unsafe")
  return stats
}

interface FileIdentity { dev: string; ino: string }

function fileIdentity(stats: Stats): FileIdentity {
  return { dev: String(stats.dev), ino: String(stats.ino) }
}

function sameIdentity(left: FileIdentity | undefined, right: FileIdentity | undefined): boolean {
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino)
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.isFile() && right.isFile() && left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs
}

function sameOptionalFile(left: Stats | undefined, right: Stats | undefined): boolean {
  if (!left || !right) return left === right
  return sameFile(left, right)
}

async function lstatOptional(target: string): Promise<Stats | undefined> {
  try {
    return await fs.lstat(target)
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined
    throw error
  }
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function serializeChunks(chunks: readonly DocumentChunkV1[]): string {
  return chunks.map((chunk) => JSON.stringify(chunk)).join("\n") + (chunks.length > 0 ? "\n" : "")
}

function parseJsonObject(raw: string, label: string): Record<string, any> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${label} is invalid`)
  }
  if (!isPlainObject(parsed)) throw new Error(`${label} is invalid`)
  return parsed
}

function requireSelectedId(value: unknown): string {
  if (typeof value !== "string" || !SELECTED_ID.test(value)) throw new Error("Selected source ID is invalid")
  return value
}

function requireSourceId(value: unknown): string {
  if (typeof value !== "string" || !SOURCE_ID.test(value)) throw new Error("Source ID is invalid")
  return value
}

function requireChunkId(value: unknown): string {
  if (typeof value !== "string" || !CHUNK_ID.test(value)) throw new Error("Chunk ID is invalid")
  return value
}

function requireSha256(value: unknown): string {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error("SHA-256 is invalid")
  return value
}

function requireLogicalName(value: unknown): string {
  if (
    typeof value !== "string" || !value || value.trim() !== value ||
    value.includes("/") || value.includes("\\") || CONTROL_CHARACTER.test(value) ||
    Buffer.byteLength(value, "utf8") > 255
  ) {
    throw new Error("Logical source name is invalid")
  }
  return value
}

function requireMediaType(value: unknown): string {
  if (value !== "docx" && value !== "xlsx" && value !== "pdf" && value !== "doc" && value !== "xls") {
    throw new Error("Source media type is invalid")
  }
  return value
}

function requireScopeStatus(value: unknown): ScopeSourceStatus {
  if (value === "success" || value === "partial" || value === "blocked" || value === "failed" || value === "requires_conversion" || value === "requires_ocr" || value === "duplicate") {
    return value
  }
  throw new Error("Source extraction status is invalid")
}

function requireLocalStatus(value: unknown): LocalSourceMapping["status"] {
  if (value === "success" || value === "partial" || value === "blocked" || value === "requires_conversion" || value === "requires_ocr" || value === "duplicate") return value
  throw new Error("Local source status is invalid")
}

function requireAbsolutePath(value: unknown): string {
  if (typeof value !== "string" || !path.isAbsolute(value) || CONTROL_CHARACTER.test(value) || Buffer.byteLength(value, "utf8") > 4096) {
    throw new Error("Local source path is invalid")
  }
  return path.resolve(value)
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is invalid`)
  return value
}

function safeWarningCodes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_WARNINGS) throw new Error("Source warning metadata is invalid")
  return value.map((warning) => {
    if (typeof warning !== "string" || Buffer.byteLength(warning, "utf8") > 128 || !WARNING_CODE.test(warning)) {
      throw new Error("Source warning metadata is invalid")
    }
    return warning
  })
}

function requireTimestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error("Timestamp is invalid")
  }
  return value
}

function timestampAfter(previous: string): string {
  const millis = Math.max(Date.now(), Date.parse(requireTimestamp(previous)) + 1)
  return new Date(millis).toISOString()
}

function cloneScope(scope: RuleAuthoringSourceScopeV1): RuleAuthoringSourceScopeV1 {
  return structuredClone(scope)
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index])
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function assertContained(root: string, target: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  if (relative === "") return
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Rule authoring path escapes its trusted workspace")
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
