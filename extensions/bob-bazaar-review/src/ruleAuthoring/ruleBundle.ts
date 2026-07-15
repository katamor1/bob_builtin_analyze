import { createHash } from "node:crypto"
import { constants as fsConstants, type BigIntStats } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { decodeTextBuffer } from "../bazaar/textEncoding"
import {
  getProjectRulesPaths,
  parseProjectChecklistJson,
  resolveWorkspacePath
} from "../projectRules/io"
import type { ProjectChecklist } from "../projectRules/types"
import {
  parseApprovedRuleProvenance,
  parseApprovedRuleSourceManifest,
  RULE_PROVENANCE_SCHEMA_VERSION,
  validateApprovedRuleProvenanceIntegrity,
  type RuleProvenanceV1
} from "./ruleApplyPlan"
import type { RuleSourceManifestV1 } from "./ruleAuthoringTypes"

export interface ProjectRuleBundleLimits {
  readonly maxChecklistBytes: number
  readonly maxReviewResultSchemaBytes: number
  readonly maxOptionalMarkdownBytes: number
  readonly maxRuleSourcesBytes: number
  readonly maxRuleProvenanceBytes: number
  readonly maxProvenanceSummaryBytes: number
}

export const PROJECT_RULE_BUNDLE_LIMITS: ProjectRuleBundleLimits = Object.freeze({
  maxChecklistBytes: 1024 * 1024,
  maxReviewResultSchemaBytes: 1024 * 1024,
  maxOptionalMarkdownBytes: 256 * 1024,
  maxRuleSourcesBytes: 4 * 1024 * 1024,
  maxRuleProvenanceBytes: 4 * 1024 * 1024,
  maxProvenanceSummaryBytes: 512 * 1024
})

export interface ProjectRuleBundleOptions {
  readonly checklistPath?: string
  readonly schemaPath?: string
}

export interface ProjectRuleBundleBaseHashes {
  readonly checklistSha256: string
  readonly reviewResultSchemaSha256: string
  readonly projectContextSha256: string
  readonly reviewPromptAddendumSha256: string
  readonly ruleSourcesSha256: string
  readonly ruleProvenanceSha256: string
}

export interface ProjectRuleProvenanceSourceSummary {
  readonly source_id: string
  readonly logical_name: string
  readonly media_type: string
  readonly sha256: string
  readonly extraction_status: string
}

export interface ProjectRuleProvenanceRuleSummary {
  readonly rule_id: string
  readonly lifecycle: "active" | "retired"
  readonly source_ids: string[]
  readonly first_applied_at: string
  readonly last_applied_at: string
  readonly last_run_id: string
}

export interface ProjectRuleProvenanceMarkdownSummary {
  readonly asset: "project-context" | "review-prompt-addendum"
  readonly section_id: string
  readonly lifecycle: "active" | "retired"
  readonly source_ids: string[]
  readonly last_applied_at: string
  readonly last_run_id: string
}

export interface ProjectRuleProvenanceSummary {
  readonly schema_version: "bob-bazaar-review/project-rule-provenance-summary/v1"
  readonly source_manifest_generated_at: string | null
  readonly provenance_updated_at: string | null
  readonly sources: ProjectRuleProvenanceSourceSummary[]
  readonly rules: ProjectRuleProvenanceRuleSummary[]
  readonly markdown_sections: ProjectRuleProvenanceMarkdownSummary[]
}

export interface ProjectRuleBundle {
  readonly checklist: ProjectChecklist
  readonly reviewResultSchema: unknown
  readonly projectContext: string
  readonly reviewPromptAddendum: string
  readonly provenanceSummary?: ProjectRuleProvenanceSummary
  readonly baseHashes: ProjectRuleBundleBaseHashes
}

const EMPTY_BYTES = Buffer.alloc(0)
const EMPTY_TIMESTAMP = "1970-01-01T00:00:00.000Z"

/**
 * Load the project-owned review assets that may be sent to AI review entrypoints.
 *
 * This intentionally reads only the six stable files under `.bob/review`; ignored
 * rule-authoring run artifacts and extracted document text are never traversed.
 */
export async function loadProjectRuleBundle(
  workspaceRoot: string,
  options: ProjectRuleBundleOptions = {}
): Promise<ProjectRuleBundle> {
  const paths = getProjectRulesPaths(workspaceRoot)
  const checklistPath = options.checklistPath
    ? resolveWorkspacePath(workspaceRoot, options.checklistPath)
    : paths.checklistPath
  const schemaPath = options.schemaPath
    ? resolveWorkspacePath(workspaceRoot, options.schemaPath)
    : paths.schemaPath

  const [checklistBytes, schemaBytes, contextBytes, addendumBytes, sourcesBytes, provenanceBytes] = await Promise.all([
    readApprovedFile(workspaceRoot, checklistPath, PROJECT_RULE_BUNDLE_LIMITS.maxChecklistBytes, "Project checklist"),
    readApprovedFile(workspaceRoot, schemaPath, PROJECT_RULE_BUNDLE_LIMITS.maxReviewResultSchemaBytes, "Review result schema"),
    readApprovedFile(workspaceRoot, paths.contextPath, PROJECT_RULE_BUNDLE_LIMITS.maxOptionalMarkdownBytes, "Project context"),
    readApprovedFile(workspaceRoot, paths.addendumPath, PROJECT_RULE_BUNDLE_LIMITS.maxOptionalMarkdownBytes, "Review prompt addendum"),
    readApprovedFile(workspaceRoot, paths.sourcesPath, PROJECT_RULE_BUNDLE_LIMITS.maxRuleSourcesBytes, "Approved rule source manifest"),
    readApprovedFile(workspaceRoot, paths.provenancePath, PROJECT_RULE_BUNDLE_LIMITS.maxRuleProvenanceBytes, "Approved rule provenance")
  ])

  if (!checklistBytes) {
    throw new Error(`Project checklist file not found: ${checklistPath}。プロジェクト review checklist ファイルが見つかりません。`)
  }
  if (!schemaBytes) {
    throw new Error(`Review result schema file not found: ${schemaPath}。レビュー結果 schema ファイルが見つかりません。`)
  }

  const checklist = parseProjectChecklistJson(decodeTextBuffer(checklistBytes), checklistPath)
  const reviewResultSchema = parseRequiredJson(schemaBytes, "Review result schema")
  const projectContext = contextBytes ? decodeUtf8(contextBytes, "Project context") : ""
  const reviewPromptAddendum = addendumBytes ? decodeUtf8(addendumBytes, "Review prompt addendum") : ""
  const provenanceSummary = buildProvenanceSummary(sourcesBytes, provenanceBytes)

  return {
    checklist,
    reviewResultSchema,
    projectContext,
    reviewPromptAddendum,
    provenanceSummary,
    baseHashes: {
      checklistSha256: sha256(checklistBytes),
      reviewResultSchemaSha256: sha256(schemaBytes),
      projectContextSha256: sha256(contextBytes ?? EMPTY_BYTES),
      reviewPromptAddendumSha256: sha256(addendumBytes ?? EMPTY_BYTES),
      ruleSourcesSha256: sha256(sourcesBytes ?? EMPTY_BYTES),
      ruleProvenanceSha256: sha256(provenanceBytes ?? EMPTY_BYTES)
    }
  }
}

function buildProvenanceSummary(
  sourcesBytes: Buffer | undefined,
  provenanceBytes: Buffer | undefined
): ProjectRuleProvenanceSummary | undefined {
  if (!sourcesBytes && !provenanceBytes) return undefined

  const sources = sourcesBytes
    ? parseApprovedRuleSourceManifest(sourcesBytes)
    : emptySourceManifest()
  const provenance = provenanceBytes
    ? parseApprovedRuleProvenance(provenanceBytes)
    : emptyProvenance()
  validateApprovedRuleProvenanceIntegrity(provenance, sources)

  const summary: ProjectRuleProvenanceSummary = {
    schema_version: "bob-bazaar-review/project-rule-provenance-summary/v1",
    source_manifest_generated_at: sourcesBytes ? sources.generated_at : null,
    provenance_updated_at: provenanceBytes ? provenance.updated_at : null,
    sources: [...sources.sources]
      .sort((left, right) => compareText(left.source_id, right.source_id))
      .map((source) => ({
        source_id: source.source_id,
        logical_name: source.logical_name,
        media_type: source.media_type,
        sha256: source.sha256,
        extraction_status: source.extraction_status
      })),
    rules: [...provenance.rules]
      .sort((left, right) => compareText(left.rule_id, right.rule_id))
      .map((entry) => ({
        rule_id: entry.rule_id,
        lifecycle: entry.lifecycle,
        source_ids: uniqueSorted(entry.source_refs.map(({ source_id }) => source_id)),
        first_applied_at: entry.first_applied_at,
        last_applied_at: entry.last_applied_at,
        last_run_id: entry.last_run_id
      })),
    markdown_sections: [...provenance.markdown_sections]
      .sort((left, right) => compareText(left.asset, right.asset) || compareText(left.section_id, right.section_id))
      .map((entry) => ({
        asset: entry.asset,
        section_id: entry.section_id,
        lifecycle: entry.lifecycle,
        source_ids: uniqueSorted(entry.source_refs.map(({ source_id }) => source_id)),
        last_applied_at: entry.last_applied_at,
        last_run_id: entry.last_run_id
      }))
  }
  if (Buffer.byteLength(JSON.stringify(summary), "utf8") > PROJECT_RULE_BUNDLE_LIMITS.maxProvenanceSummaryBytes) {
    throw new Error("Approved rule provenance summary exceeds its byte limit")
  }
  return summary
}

async function readApprovedFile(
  workspaceRoot: string,
  filePath: string,
  maxBytes: number,
  label: string
): Promise<Buffer | undefined> {
  const resolvedRoot = path.resolve(workspaceRoot)
  const resolvedPath = path.resolve(filePath)
  const workspaceContained = isContainedPath(resolvedRoot, resolvedPath)

  let beforePath: BigIntStats
  try {
    beforePath = await fs.lstat(resolvedPath, { bigint: true })
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return undefined
    throw error
  }
  if (!beforePath.isFile() || beforePath.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file`)
  }
  if (workspaceContained) await assertPhysicalParentContained(resolvedRoot, resolvedPath, label)
  if (beforePath.size > BigInt(maxBytes)) throw new Error(`${label} exceeds its byte limit`)

  const handle = await fs.open(resolvedPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0))
  try {
    const beforeHandle = await handle.stat({ bigint: true })
    if (!beforeHandle.isFile() || !sameFileIdentity(beforePath, beforeHandle)) {
      throw new Error(`${label} changed while it was being opened`)
    }
    const bytes = await readHandleBounded(handle, maxBytes, label)
    const afterHandle = await handle.stat({ bigint: true })
    const afterPath = await fs.lstat(resolvedPath, { bigint: true })
    if (
      !sameFileIdentity(beforeHandle, afterHandle) ||
      !sameFileIdentity(afterHandle, afterPath) ||
      !sameFileVersion(beforeHandle, afterHandle) ||
      afterHandle.size !== BigInt(bytes.byteLength)
    ) {
      throw new Error(`${label} changed while it was being read`)
    }
    if (workspaceContained) await assertPhysicalParentContained(resolvedRoot, resolvedPath, label)
    return bytes
  } finally {
    await handle.close()
  }
}

async function readHandleBounded(
  handle: fs.FileHandle,
  maxBytes: number,
  label: string
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  while (true) {
    const remaining = maxBytes + 1 - total
    if (remaining <= 0) throw new Error(`${label} exceeds its byte limit`)
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, remaining))
    const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, null)
    if (bytesRead === 0) break
    total += bytesRead
    if (total > maxBytes) throw new Error(`${label} exceeds its byte limit`)
    chunks.push(chunk.subarray(0, bytesRead))
  }
  return Buffer.concat(chunks, total)
}

async function assertPhysicalParentContained(root: string, filePath: string, label: string): Promise<void> {
  const [physicalRoot, physicalParent] = await Promise.all([
    fs.realpath(root),
    fs.realpath(path.dirname(filePath))
  ])
  if (!isContainedPath(physicalRoot, physicalParent)) {
    throw new Error(`${label} path escapes the workspace through a symbolic link`)
  }
}

function isContainedPath(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function sameFileIdentity(
  left: BigIntStats,
  right: BigIntStats
): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function sameFileVersion(
  left: BigIntStats,
  right: BigIntStats
): boolean {
  return left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs
}

function parseRequiredJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(decodeTextBuffer(Buffer.from(bytes)))
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

function emptySourceManifest(): RuleSourceManifestV1 {
  return {
    schema_version: "bob-bazaar-review/rule-sources/v1",
    generated_at: EMPTY_TIMESTAMP,
    sources: []
  }
}

function emptyProvenance(): RuleProvenanceV1 {
  return {
    schema_version: RULE_PROVENANCE_SCHEMA_VERSION,
    updated_at: EMPTY_TIMESTAMP,
    rules: [],
    markdown_sections: []
  }
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code
}
