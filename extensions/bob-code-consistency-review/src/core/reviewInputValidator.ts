import { assertDocumentNotCancelled, assertProcessingOperation, BoundedDocumentError, remainingDeadlineMilliseconds, type SharedAbsoluteDeadline, type ProcessingOperation } from "../sharedProcessingBudgetRuntime"
import * as path from "node:path"
import YAML from "yaml"
import { pathExists, resolveWorkspacePathStrict } from "./fileSystem"
import { DEFAULT_REVIEW_PROCESSING_LIMITS, normalizeReviewProcessingLimits } from "./limits"
import { formatSchemaErrors, loadSchemaValidator } from "./schemaLoader"
import { readStableReviewInputText } from "./stableReviewInput"
import { createPipelineProcessingOperation } from "./processingBudgetPipeline"
import type { ReviewInput } from "./reviewTypes"

export const MAX_REVIEW_INPUT_ARTIFACT_REFERENCES = 500

export async function validateReviewInput(
  inputPath: string,
  workspaceRoot = process.cwd(),
  textEncoding = "auto",
  maxInputBytes = DEFAULT_REVIEW_PROCESSING_LIMITS.maxDocumentBytes,
  options?: { signal?: AbortSignal; deadline?: SharedAbsoluteDeadline; beforeArtifactPaths?: (reviewInput: ReviewInput) => void; processingOperation?: ProcessingOperation }
): Promise<ReviewInput> {
  assertDocumentNotCancelled(options?.signal)
  const inputByteLimit = normalizeReviewProcessingLimits({ maxDocumentBytes: maxInputBytes }).maxDocumentBytes
  const operation = options?.processingOperation ?? createPipelineProcessingOperation(normalizeReviewProcessingLimits({ maxDocumentBytes: inputByteLimit }), undefined, options?.signal, options?.deadline)
  try {
  assertProcessingOperation(operation)
  if (options?.processingOperation !== undefined && options.signal !== undefined && options.signal !== operation.signal) throw new BoundedDocumentError("bounded_document_input_invalid")
  const signal = operation.signal
  if (options?.deadline !== undefined) {
    remainingDeadlineMilliseconds(options?.deadline, 0)
    if (Object.getOwnPropertyDescriptor(options?.deadline, "expires_at_monotonic_ms")?.value !== operation.deadline.expires_at_monotonic_ms) throw new BoundedDocumentError("bounded_document_input_invalid")
  }
  operation.throwIfCancelled()
  const resolvedInputPath = resolveWorkspacePathStrict(workspaceRoot, inputPath, "reviewInputPath")
  const raw = await readStableReviewInputText({ rootPath: workspaceRoot, filePath: resolvedInputPath, textEncoding, maximumBytes: inputByteLimit, operation, signal, deadline: operation.deadline })
  assertDocumentNotCancelled(signal)
  const parsed = YAML.parse(raw) as unknown

  const validate = await loadSchemaValidator("review-input")
  assertDocumentNotCancelled(signal)
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

  assertDocumentNotCancelled(signal)
  options?.beforeArtifactPaths?.(reviewInput)
  assertDocumentNotCancelled(signal)
  const artifactValidation = await validateArtifactPaths(reviewInput, workspaceRoot, signal)
  assertDocumentNotCancelled(signal)
  if (artifactValidation.escaped.length > 0) {
    throw new Error(`review-input.yaml artifact path escapes workspace:\n${artifactValidation.escaped.map((file) => `- ${file}`).join("\n")}`)
  }
  if (artifactValidation.missing.length > 0) {
    throw new Error(`review-input.yaml references missing artifact file(s):\n${artifactValidation.missing.map((file) => `- ${file}`).join("\n")}`)
  }

  return reviewInput
  } finally { if (options?.processingOperation === undefined) operation.dispose() }
}

function countArtifactReferences(reviewInput: ReviewInput): number {
  return Object.values(reviewInput.artifacts).reduce<number>(
    (total, value) => total + (Array.isArray(value) ? value.length : 0),
    0
  )
}

async function validateArtifactPaths(reviewInput: ReviewInput, workspaceRoot: string, signal?: AbortSignal): Promise<{ escaped: string[]; missing: string[] }> {
  const escaped: string[] = []
  const missing: string[] = []
  for (const value of Object.values(reviewInput.artifacts)) {
    if (!Array.isArray(value)) continue
    for (const item of value as Array<{ path?: string }>) {
      if (!item.path) continue
      assertDocumentNotCancelled(signal)
      let resolved: string
      try {
        resolved = resolveWorkspacePathStrict(workspaceRoot, item.path, "artifact path")
      } catch {
        escaped.push(path.normalize(item.path))
        continue
      }
      const exists = await pathExists(resolved)
      assertDocumentNotCancelled(signal)
      if (!exists) missing.push(path.normalize(item.path))
    }
  }
  return { escaped, missing }
}
