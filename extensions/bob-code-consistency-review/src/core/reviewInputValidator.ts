import * as fs from "node:fs/promises"
import * as path from "node:path"
import YAML from "yaml"
import { pathExists, readTextFile, resolveWorkspacePathStrict } from "./fileSystem"
import { DEFAULT_REVIEW_PROCESSING_LIMITS, normalizeReviewProcessingLimits } from "./limits"
import { formatSchemaErrors, loadSchemaValidator } from "./schemaLoader"
import type { ReviewInput } from "./reviewTypes"

export const MAX_REVIEW_INPUT_ARTIFACT_REFERENCES = 500

export async function validateReviewInput(
  inputPath: string,
  workspaceRoot = process.cwd(),
  textEncoding = "auto",
  maxInputBytes = DEFAULT_REVIEW_PROCESSING_LIMITS.maxDocumentBytes
): Promise<ReviewInput> {
  const resolvedInputPath = resolveWorkspacePathStrict(workspaceRoot, inputPath, "reviewInputPath")
  const inputByteLimit = normalizeReviewProcessingLimits({ maxDocumentBytes: maxInputBytes }).maxDocumentBytes
  const stat = await fs.stat(resolvedInputPath)
  if (stat.size > inputByteLimit) {
    throw new Error(`review-input.yaml exceeded maxDocumentBytes (${stat.size} > ${inputByteLimit})`)
  }

  const raw = await readTextFile(resolvedInputPath, textEncoding)
  const parsed = YAML.parse(raw) as unknown

  const validate = await loadSchemaValidator("review-input")
  if (!validate(parsed)) {
    const errors = formatSchemaErrors(validate)
    throw new Error(`Invalid review-input.yaml:\n${errors.map((error) => `- ${error}`).join("\n")}`)
  }

  const reviewInput = parsed as ReviewInput
  const artifactReferences = countArtifactReferences(reviewInput)
  if (artifactReferences > MAX_REVIEW_INPUT_ARTIFACT_REFERENCES) {
    throw new Error(
      `review-input.yaml artifact references exceed maximum (${artifactReferences} > ${MAX_REVIEW_INPUT_ARTIFACT_REFERENCES})`
    )
  }

  const artifactValidation = await validateArtifactPaths(reviewInput, workspaceRoot)
  if (artifactValidation.escaped.length > 0) {
    throw new Error(`review-input.yaml artifact path escapes workspace:\n${artifactValidation.escaped.map((file) => `- ${file}`).join("\n")}`)
  }
  if (artifactValidation.missing.length > 0) {
    throw new Error(`review-input.yaml references missing artifact file(s):\n${artifactValidation.missing.map((file) => `- ${file}`).join("\n")}`)
  }

  return reviewInput
}

function countArtifactReferences(reviewInput: ReviewInput): number {
  return Object.values(reviewInput.artifacts).reduce(
    (total, value) => total + (Array.isArray(value) ? value.length : 0),
    0
  )
}

async function validateArtifactPaths(reviewInput: ReviewInput, workspaceRoot: string): Promise<{ escaped: string[]; missing: string[] }> {
  const escaped: string[] = []
  const missing: string[] = []
  for (const value of Object.values(reviewInput.artifacts)) {
    if (!Array.isArray(value)) continue
    for (const item of value as Array<{ path?: string }>) {
      if (!item.path) continue
      let resolved: string
      try {
        resolved = resolveWorkspacePathStrict(workspaceRoot, item.path, "artifact path")
      } catch {
        escaped.push(path.normalize(item.path))
        continue
      }
      if (!(await pathExists(resolved))) missing.push(path.normalize(item.path))
    }
  }
  return { escaped, missing }
}
