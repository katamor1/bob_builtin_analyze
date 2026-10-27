import {
  createDocumentLedger, loadXlsxCodec, withValidatedOoxmlParserInput,
  type OoxmlDocumentKind, type ValidatedOoxmlParserInput, type BudgetedOoxmlParserInput,
  type DocumentOperation, type DocumentAdmission, type DocumentOoxmlOptions
} from "../../sharedProcessingBudgetRuntime"
import { DEFAULT_RULE_AUTHORING_LIMITS, type RuleAuthoringLimits } from "../ruleAuthoringLimits"
import { assertStableSourceFingerprint, type SourceFingerprint } from "../ruleSourceHash"

type NormalContext = { rootPath: string; target: string; operation?: never; admission?: never }
type BudgetedContext = { rootPath: string; target: string; operation: DocumentOperation; admission: DocumentAdmission }
type NormalParser<T> = (input: ValidatedOoxmlParserInput) => Promise<T>
type BudgetedParser<T> = (input: BudgetedOoxmlParserInput) => Promise<T>

export function withRuleOoxmlParserInput<T>(filePath: string, expectedFingerprint: SourceFingerprint, documentKind: OoxmlDocumentKind, limits: RuleAuthoringLimits, parse: NormalParser<T>, context: NormalContext): Promise<T>
export function withRuleOoxmlParserInput<T>(filePath: string, expectedFingerprint: SourceFingerprint, documentKind: OoxmlDocumentKind, limits: RuleAuthoringLimits, parse: BudgetedParser<T>, context: BudgetedContext): Promise<T>
export async function withRuleOoxmlParserInput<T>(filePath: string, expectedFingerprint: SourceFingerprint, documentKind: OoxmlDocumentKind, limits: RuleAuthoringLimits, parse: NormalParser<T> | BudgetedParser<T>, context: NormalContext | BudgetedContext): Promise<T> {
  if (context.operation) {
    assertStableSourceFingerprint(expectedFingerprint, context.admission.fingerprint)
    const common = { structuralLimits: { maxEntries: limits.maxOoxmlEntries, maxExpandedBytes: limits.maxOoxmlDeclaredUncompressedBytes }, loadXlsxCodec }
    const options: DocumentOoxmlOptions = documentKind === "xlsx" ? { ...common, documentKind, xlsxBudget: { headerRows: 0 } } : { ...common, documentKind }
    return context.operation.withValidatedOoxml(context.admission, options, parse as BudgetedParser<T>)
  }
  const maximumFileBytes = Math.min(limits.maxSourceBytes, DEFAULT_RULE_AUTHORING_LIMITS.maxSourceBytes)
  return withValidatedOoxmlParserInput({
    filePath, rootPath: context.rootPath, maximumFileBytes, target: context.target,
    ledger: createDocumentLedger(maximumFileBytes), expectedFingerprint, documentKind,
    structuralLimits: { maxEntries: limits.maxOoxmlEntries, maxExpandedBytes: limits.maxOoxmlDeclaredUncompressedBytes }, loadXlsxCodec
  }, parse as NormalParser<T>)
}
