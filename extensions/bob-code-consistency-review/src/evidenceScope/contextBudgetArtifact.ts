import type { EvidenceScopeResult } from "./evidenceScopeTypes"

export type ContextBudgetArtifactMetadata = {
  base: string
  head: string
  tokenEstimation: string
  ruleSource: string
}

export type ContextBudgetArtifact = {
  schema_version: 1
  selection_policy: "bob-evidence-scope-v1"
  scope_fingerprint: string
  source_revision: string
  token_estimation: string
  rule_source: string
  selected_code: EvidenceScopeResult["selectedCode"]
  applicable_rules: EvidenceScopeResult["applicableRules"]
  selected_documents: EvidenceScopeResult["selectedDocuments"]
  unknown_impact: EvidenceScopeResult["unknownImpact"]
  budget: EvidenceScopeResult["budgetReport"]
  warnings: string[]
}

export function createContextBudgetArtifact(
  scope: EvidenceScopeResult,
  metadata: ContextBudgetArtifactMetadata
): ContextBudgetArtifact {
  return {
    schema_version: 1,
    selection_policy: "bob-evidence-scope-v1",
    scope_fingerprint: scope.scopeFingerprint,
    source_revision: sourceRevision(metadata.base, metadata.head),
    token_estimation: metadata.tokenEstimation,
    rule_source: metadata.ruleSource,
    selected_code: scope.selectedCode,
    applicable_rules: scope.applicableRules,
    selected_documents: scope.selectedDocuments,
    unknown_impact: scope.unknownImpact,
    budget: scope.budgetReport,
    warnings: scope.warnings
  }
}

function sourceRevision(base: string, head: string): string {
  if (base && head) return `${base}..${head}`
  return head || base || ""
}
