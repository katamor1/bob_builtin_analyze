import {
  assertDocumentNotCancelled,
  createProcessingOperation,
  createReviewDocumentProfile,
  type ProcessingOperation,
  type SharedAbsoluteDeadline,
  type SharedProcessingBudgetLimits
} from "../sharedProcessingBudgetRuntime"
import type { ReviewProcessingLimits } from "./limits"

export function createPipelineProcessingOperation(
  limits: ReviewProcessingLimits,
  overrides?: Readonly<Partial<SharedProcessingBudgetLimits>>,
  signal?: AbortSignal,
  deadline?: SharedAbsoluteDeadline
): ProcessingOperation {
  assertDocumentNotCancelled(signal)
  return createProcessingOperation({ profile: createReviewDocumentProfile(limits, overrides), signal, deadline })
}
