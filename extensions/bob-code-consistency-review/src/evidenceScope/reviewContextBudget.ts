import type { CodeAnalysisResult } from "../core/analysisTypes"
import type { DiffSummary } from "../core/diffTypes"
import type { DocumentExtractionResult } from "../core/documentTypes"
import type { ReviewProcessingLimits } from "../core/limits"
import type { ReviewInput } from "../core/reviewTypes"
import {
  createContextBudgetArtifact,
  type ContextBudgetArtifact
} from "./contextBudgetArtifact"
import { parseProjectRules } from "./projectRuleConfig"
import { buildReviewEvidenceScope } from "./reviewEvidenceAdapter"

export type ReviewContextBudgetInput = {
  reviewInput: ReviewInput
  diff: DiffSummary
  documents: DocumentExtractionResult
  codeAnalysis: CodeAnalysisResult
  limits: ReviewProcessingLimits
}

export type ReviewContextBudgetResult = {
  artifact: ContextBudgetArtifact
  warnings: string[]
}

const TOKEN_ESTIMATION_POLICY = "ceil(text.length / 4); budget=floor(maxBobInputBytes / 4)"
const RULE_CONFIG_SOURCE = "review-input.bob_options.evidence_scope_rules"

export function buildReviewContextBudget(input: ReviewContextBudgetInput): ReviewContextBudgetResult {
  const rawRules = input.reviewInput.bob_options?.evidence_scope_rules
  const parsedRules = parseProjectRules(rawRules)
  const scope = buildReviewEvidenceScope(input.codeAnalysis, input.documents, {
    tokenBudget: Math.max(1, Math.floor(input.limits.maxBobInputBytes / 4)),
    maxDependencyDepth: input.reviewInput.analysis_options?.max_call_depth ?? 1,
    rules: parsedRules.rules,
    documentKeywords: reviewDocumentKeywords(input.reviewInput),
    includeLowPriority: input.reviewInput.bob_options?.evidence_scope_include_low_priority === true
  })
  const warnings = [...new Set([...parsedRules.warnings, ...scope.warnings])].sort()
  const artifact = createContextBudgetArtifact(
    { ...scope, warnings },
    {
      base: input.diff.base,
      head: input.diff.head,
      tokenEstimation: TOKEN_ESTIMATION_POLICY,
      ruleSource: rawRules === undefined ? "none" : RULE_CONFIG_SOURCE
    }
  )

  return { artifact, warnings }
}

function reviewDocumentKeywords(reviewInput: ReviewInput): string[] {
  const values = [
    reviewInput.review.id,
    ...(reviewInput.review.ticket_ids ?? []),
    ...reviewInput.review_focus,
    ...tokenize(reviewInput.review.title),
    ...tokenize(reviewInput.review.purpose)
  ]
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort()
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((term) => term.length >= 2)
}
