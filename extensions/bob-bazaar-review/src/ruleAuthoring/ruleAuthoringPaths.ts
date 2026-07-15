import * as path from "node:path"

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/
const WINDOWS_FORBIDDEN_CHARACTER = /[<>:"/\\|?*]/
const MAX_PATH_SEGMENT_BYTES = 255

export interface RuleAuthoringPaths {
  reviewDirectory: string
  authoringDirectory: string
  sourceLocationsPath: string
  runsDirectory: string
  runDirectory: string
  authoringRunPath: string
  generationsDirectory: string
  backupsDirectory: string
  transactionsDirectory: string
}

export interface RuleAuthoringGenerationPaths {
  generationId: string
  generationDirectory: string
  sourceManifestPath: string
  documentChunksPath: string
  sourceScopePath: string
  sourceIndexPath: string
  evidenceSelectionPath: string
  selectedEvidencePath: string
  ruleProposalRawPath: string
  ruleProposalPath: string
  proposalValidationPath: string
  proposalDecisionsPath: string
  applyPreviewPath: string
  applyManifestPath: string
}

const ARTIFACT_GENERATION_ID = /^gen-[a-f0-9]{32}$/

export function validateRuleAuthoringId(value: string, fieldName: string): string {
  if (/[. ]$/.test(value)) throw new Error(`${fieldName} must not end with a dot or space`)
  const normalized = value.trim()
  if (!normalized) throw new Error(`${fieldName} is required`)
  if (normalized !== value) throw new Error(`${fieldName} must not have surrounding whitespace`)
  if (Buffer.byteLength(normalized, "utf8") > MAX_PATH_SEGMENT_BYTES) {
    throw new Error(`${fieldName} must not exceed the portable path segment byte limit`)
  }
  if (normalized === "." || normalized === "..") throw new Error(`${fieldName} must be a safe path segment`)
  if (WINDOWS_FORBIDDEN_CHARACTER.test(normalized)) {
    throw new Error(`${fieldName} must not contain Windows-forbidden characters`)
  }
  if (CONTROL_CHARACTER.test(normalized)) throw new Error(`${fieldName} must not contain control characters`)
  if (WINDOWS_RESERVED_NAME.test(normalized)) throw new Error(`${fieldName} must not use a Windows reserved name`)
  return normalized
}

export function getRuleAuthoringPaths(workspaceRoot: string, runId: string): RuleAuthoringPaths {
  const root = path.resolve(workspaceRoot)
  const safeRunId = validateRuleAuthoringId(runId, "runId")
  const reviewDirectory = path.join(root, ".bob", "review")
  const authoringDirectory = path.join(reviewDirectory, "rule-authoring")
  const runsDirectory = path.join(authoringDirectory, "runs")
  const runDirectory = path.join(runsDirectory, safeRunId)

  return {
    reviewDirectory,
    authoringDirectory,
    sourceLocationsPath: path.join(authoringDirectory, "source-locations.local.json"),
    runsDirectory,
    runDirectory,
    authoringRunPath: path.join(runDirectory, "authoring-run.json"),
    generationsDirectory: path.join(runDirectory, "generations"),
    backupsDirectory: path.join(authoringDirectory, "backups"),
    transactionsDirectory: path.join(authoringDirectory, "transactions")
  }
}

export function getRuleAuthoringGenerationPaths(
  paths: RuleAuthoringPaths,
  generationId: string
): RuleAuthoringGenerationPaths {
  if (!ARTIFACT_GENERATION_ID.test(generationId)) {
    throw new Error("Rule authoring artifact generation ID is invalid")
  }
  const generationDirectory = path.join(paths.generationsDirectory, generationId)
  return {
    generationId,
    generationDirectory,
    sourceManifestPath: path.join(generationDirectory, "source-manifest.json"),
    documentChunksPath: path.join(generationDirectory, "document-chunks.jsonl"),
    sourceScopePath: path.join(generationDirectory, "source-scope.json"),
    sourceIndexPath: path.join(generationDirectory, "source-index.json"),
    evidenceSelectionPath: path.join(generationDirectory, "evidence-selection.json"),
    selectedEvidencePath: path.join(generationDirectory, "selected-evidence.md"),
    ruleProposalRawPath: path.join(generationDirectory, "rule-proposal.raw.txt"),
    ruleProposalPath: path.join(generationDirectory, "rule-proposal.json"),
    proposalValidationPath: path.join(generationDirectory, "proposal-validation.json"),
    proposalDecisionsPath: path.join(generationDirectory, "proposal-decisions.json"),
    applyPreviewPath: path.join(generationDirectory, "apply-preview.json"),
    applyManifestPath: path.join(generationDirectory, "apply-manifest.json")
  }
}
