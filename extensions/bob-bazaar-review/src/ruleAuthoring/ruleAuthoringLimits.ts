export interface RuleAuthoringLimits {
  maxSourceFiles: number
  maxSourceBytes: number
  maxAggregateSourceBytes: number
  maxChunkBytes: number
  maxSourceIndexBytes: number
  maxSelectedEvidenceBytes: number
  maxProposalBytes: number
  maxPdfOutputBytes: number
  maxOoxmlEntries: number
  maxOoxmlDeclaredUncompressedBytes: number
  maxRuleOperations: number
  maxProjectContextOperations: number
  maxPromptAddendumOperations: number
  maxProjectContextBytes: number
  maxPromptAddendumBytes: number
}

export const DEFAULT_RULE_AUTHORING_LIMITS: Readonly<RuleAuthoringLimits> = Object.freeze({
  maxSourceFiles: 20,
  maxSourceBytes: 25 * 1024 * 1024,
  maxAggregateSourceBytes: 100 * 1024 * 1024,
  maxChunkBytes: 32 * 1024,
  maxSourceIndexBytes: 1024 * 1024,
  maxSelectedEvidenceBytes: 1024 * 1024,
  maxProposalBytes: 1024 * 1024,
  maxPdfOutputBytes: 32 * 1024 * 1024,
  maxOoxmlEntries: 5_000,
  maxOoxmlDeclaredUncompressedBytes: 250 * 1024 * 1024,
  maxRuleOperations: 200,
  maxProjectContextOperations: 100,
  maxPromptAddendumOperations: 100,
  maxProjectContextBytes: 256 * 1024,
  maxPromptAddendumBytes: 256 * 1024
})
