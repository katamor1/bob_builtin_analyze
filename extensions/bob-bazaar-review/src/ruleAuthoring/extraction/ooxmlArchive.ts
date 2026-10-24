import {
  createDocumentLedger,
  loadXlsxCodec,
  withValidatedOoxmlParserInput,
  type OoxmlDocumentKind,
  type ValidatedOoxmlParserInput
} from "../../sharedProcessingBudgetRuntime"
import { DEFAULT_RULE_AUTHORING_LIMITS, type RuleAuthoringLimits } from "../ruleAuthoringLimits"
import type { SourceFingerprint } from "../ruleSourceHash"

export async function withRuleOoxmlParserInput<T>(
  filePath: string,
  expectedFingerprint: SourceFingerprint,
  documentKind: OoxmlDocumentKind,
  limits: RuleAuthoringLimits,
  parse: (input: ValidatedOoxmlParserInput) => Promise<T>,
  context: { rootPath: string; target: string }
): Promise<T> {
  const maximumFileBytes = Math.min(limits.maxSourceBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceBytes)
  return withValidatedOoxmlParserInput({
    filePath,
    rootPath: context.rootPath,
    maximumFileBytes,
    target: context.target,
    ledger: createDocumentLedger(maximumFileBytes),
    expectedFingerprint,
    documentKind,
    structuralLimits: { maxEntries: limits.maxOoxmlEntries, maxExpandedBytes: limits.maxOoxmlDeclaredUncompressedBytes },
    loadXlsxCodec
  }, parse)
}
