import * as path from "node:path"

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/
const WINDOWS_FORBIDDEN_CHARACTER = /[<>:"/\\|?*]/
const MAX_PATH_SEGMENT_BYTES = 255

export interface RuleAuthoringPaths {
  reviewDirectory: string
  authoringDirectory: string
  sourceLocationsPath: string
  runsDirectory: string
  runDirectory: string
  authoringRunPath: string
  sourceManifestPath: string
  documentChunksPath: string
  sourceIndexPath: string
  evidenceSelectionPath: string
  selectedEvidencePath: string
  ruleProposalRawPath: string
  ruleProposalPath: string
  proposalValidationPath: string
  proposalDecisionsPath: string
  applyPreviewPath: string
  applyManifestPath: string
  backupsDirectory: string
  transactionsDirectory: string
}

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
    sourceManifestPath: path.join(runDirectory, "source-manifest.json"),
    documentChunksPath: path.join(runDirectory, "document-chunks.jsonl"),
    sourceIndexPath: path.join(runDirectory, "source-index.json"),
    evidenceSelectionPath: path.join(runDirectory, "evidence-selection.json"),
    selectedEvidencePath: path.join(runDirectory, "selected-evidence.md"),
    ruleProposalRawPath: path.join(runDirectory, "rule-proposal.raw.txt"),
    ruleProposalPath: path.join(runDirectory, "rule-proposal.json"),
    proposalValidationPath: path.join(runDirectory, "proposal-validation.json"),
    proposalDecisionsPath: path.join(runDirectory, "proposal-decisions.json"),
    applyPreviewPath: path.join(runDirectory, "apply-preview.json"),
    applyManifestPath: path.join(runDirectory, "apply-manifest.json"),
    backupsDirectory: path.join(authoringDirectory, "backups"),
    transactionsDirectory: path.join(authoringDirectory, "transactions")
  }
}
