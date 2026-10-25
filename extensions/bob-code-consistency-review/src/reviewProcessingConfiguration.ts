import { normalizeReviewProcessingLimits, type ReviewProcessingLimits } from "./core/limits"

const settings = ["maxDocumentBytes", "maxWorkbookSheets", "maxRowsPerSheet", "maxExcerptBytesPerDocument", "maxRawDiffBytes", "maxBobInputBytes"] as const

export function reviewProcessingLimitsFromConfiguration(
  config: { get<T>(section: string): T | undefined },
  overrides?: Partial<ReviewProcessingLimits>
): ReviewProcessingLimits {
  const values: Partial<ReviewProcessingLimits> = {}
  for (const key of settings) {
    const configured = config.get<number>(key)
    values[key] = overrides?.[key] ?? configured
  }
  return normalizeReviewProcessingLimits(values)
}
