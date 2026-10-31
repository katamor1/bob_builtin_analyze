import {
  assertDocumentNotCancelled,
  createProcessingOperation,
  createReviewDocumentProfile,
  type ProcessingOperation,
  type SharedProcessingBudgetLimits
} from "../sharedProcessingBudgetRuntime"
import type { ReviewProcessingLimits } from "./limits"

export function createPipelineProcessingOperation(
  limits: ReviewProcessingLimits,
  overrides?: Readonly<Partial<SharedProcessingBudgetLimits>>,
  signal?: AbortSignal
): ProcessingOperation {
  assertDocumentNotCancelled(signal)
  return createProcessingOperation({ profile: createReviewDocumentProfile(limits, overrides), signal })
}
