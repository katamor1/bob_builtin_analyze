import {
  resolveWorkspacePathStrict
} from "./fileSystem"
import {
  buildReviewInputFromDraft as buildReviewInputFromDraftBase,
  writeReviewInputFromDraft as writeReviewInputFromDraftBase,
  type ReviewInputBuildResult,
  type ReviewInputDraft,
  type ReviewInputWriteResult
} from "./reviewInputBuilderBase"

export {
  ARTIFACT_KIND_VALUES,
  CHANGE_TYPE_VALUES,
  REVIEW_FOCUS_PRESETS,
  REVIEW_FOCUS_VALUES,
  VCS_VALUES,
  type ArtifactKind,
  type ChangeType,
  type ReviewFocus,
  type ReviewFocusPreset,
  type ReviewInputArtifactDraft,
  type ReviewInputBuildResult,
  type ReviewInputDraft,
  type ReviewInputWriteResult,
  type VcsKind
} from "./reviewInputBuilderBase"

export async function buildReviewInputFromDraft(
  draft: ReviewInputDraft,
  options: { workspaceRoot: string; strictPaths?: boolean }
): Promise<ReviewInputBuildResult> {
  const pathErrors = artifactPathErrors(draft, options.workspaceRoot)
  if (pathErrors.length > 0) return { status: "error", errors: pathErrors, warnings: [] }
  return buildReviewInputFromDraftBase(draft, options)
}

export async function writeReviewInputFromDraft(input: {
  draft: ReviewInputDraft
  workspaceRoot: string
  outputPath: string
  overwrite?: boolean
  backupExisting?: boolean
  strictPaths?: boolean
}): Promise<ReviewInputWriteResult> {
  const pathErrors = artifactPathErrors(input.draft, input.workspaceRoot)
  let outputPath: string
  try {
    outputPath = resolveWorkspacePathStrict(input.workspaceRoot, input.outputPath, "reviewInputOutputPath")
  } catch (error) {
    return {
      status: "error",
      outputPath: input.outputPath,
      errors: [error instanceof Error ? error.message : "reviewInputOutputPath is unsafe"],
      warnings: []
    }
  }
  if (pathErrors.length > 0) return { status: "error", outputPath, errors: pathErrors, warnings: [] }
  return writeReviewInputFromDraftBase({ ...input, outputPath })
}

function artifactPathErrors(draft: ReviewInputDraft, workspaceRoot: string): string[] {
  if (!Array.isArray(draft.artifact_candidates)) return []
  const errors: string[] = []
  for (const candidate of draft.artifact_candidates) {
    if (typeof candidate?.path !== "string" || !candidate.path.trim()) continue
    try {
      resolveWorkspacePathStrict(workspaceRoot, candidate.path, "artifact path")
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `artifact path is unsafe: ${String(candidate.path)}`)
    }
  }
  return [...new Set(errors)]
}
