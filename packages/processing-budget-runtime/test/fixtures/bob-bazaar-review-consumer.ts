import {
  DEFAULT_PROCESSING_BUDGET_PROFILE,
  ProcessingBudgetLedger,
  normalizeProcessingBudgetProfile,
  type ProcessingBudgetCategory,
  type ProcessingBudgetLedgerReport,
  type ProcessingBudgetProfile
} from "../.."

const category: ProcessingBudgetCategory = "raw_diff_bytes"
const profile: ProcessingBudgetProfile = normalizeProcessingBudgetProfile({
  limits: { single_document_bytes: 26214400, total_document_bytes: 104857600, document_count: 20, total_operation_input_bytes: 268435456 }
})
const ledger = new ProcessingBudgetLedger(profile)
const reservation = ledger.reserve(category, 128)
reservation.commit(64)
ledger.reserveForTarget("single_document_bytes", "fixture-document", 128).release()
const report: ProcessingBudgetLedgerReport = ledger.snapshot()
const firstCategory = report.categories[0]
if (firstCategory?.scope === "operation") void firstCategory.remaining

// @ts-expect-error target-scoped categories require an explicit target
ledger.reserve("single_document_bytes", 1)
// @ts-expect-error operation-scoped categories must not accept a target
ledger.reserveForTarget("raw_diff_bytes", "fixture-diff", 1)
// @ts-expect-error consumers must not configure unknown budget categories
normalizeProcessingBudgetProfile({ limits: { not_a_category: 1 } })
// @ts-expect-error consumers must not reserve unknown budget categories
ledger.reserve("not_a_category", 1)

// @ts-expect-error normalized limits are readonly
profile.limits.document_count = 1
// @ts-expect-error reports are readonly
report.categories.push(firstCategory)

import { readBoundedDocumentFile, fingerprintBoundedDocumentFile, type BoundedDocumentReadInput } from "../.."
import { withValidatedOoxmlParserInput, type ValidatedOoxmlParserRequest } from "../../out/validatedOoxml"
const boundedInput: BoundedDocumentReadInput = { filePath: "/source.docx", rootPath: "/", maximumFileBytes: 1, target: "document", ledger }
void readBoundedDocumentFile(boundedInput)
const fingerprint = fingerprintBoundedDocumentFile({ filePath: boundedInput.filePath, rootPath: boundedInput.rootPath, maximumFileBytes: 1 })
async function parseDocument(request: ValidatedOoxmlParserRequest): Promise<number> { return withValidatedOoxmlParserInput(request, async ({ parserInput }) => parserInput.byteLength) }
void fingerprint; void parseDocument
// @ts-expect-error no low-level prepare export on the root
import { prepareOoxmlParserInput } from "../.."
// @ts-expect-error parser callback must receive validated input
withValidatedOoxmlParserInput({}, async (input: string) => input)

import { createDocumentOperation, commitWorkbookBudget, commitXlsxWorkbookBudget, assertParsedXlsxWorkbookWithinBudget, type DocumentOperation, type DocumentAdmission, type DocumentOoxmlOptions, type XlsxWorkbookInspection } from "../.."
import type { BudgetedOoxmlParserInput } from "../../out/validatedOoxml"
const operation: DocumentOperation = createDocumentOperation({ selectedDocumentCount: 0, profile })
async function parseBudgeted(admission: DocumentAdmission, options: DocumentOoxmlOptions): Promise<number> {
  return operation.withValidatedOoxml(admission, options, async (input: BudgetedOoxmlParserInput) => {
    if (input.documentKind === "xlsx") assertParsedXlsxWorkbookWithinBudget([], input.workbookInspection)
    return input.parserInput.byteLength
  })
}
function workbookTypes(inspection: XlsxWorkbookInspection): void {
  commitWorkbookBudget({ ledger, workbookTarget: "typed", sheets: [{ name: "S", rowCount: 2 }] })
  commitXlsxWorkbookBudget({ ledger, workbookTarget: "typed-xlsx", inspection, headerRows: 1 })
}
// @ts-expect-error operation ledger is not a caller-owned public capability
void operation.ledger
// @ts-expect-error plain fingerprints cannot forge a branded admission
const forgedAdmission: DocumentAdmission = { fingerprint: { byteSize: "0", mtimeNs: "0", device: "0", inode: "0", sha256: "0".repeat(64) } }
// @ts-expect-error budgeted xlsx requires an explicit header policy
const missingWorkbookPolicy: DocumentOoxmlOptions = { documentKind: "xlsx", structuralLimits: { maxEntries: 5000, maxExpandedBytes: 262144000 }, loadXlsxCodec: async () => ({ strToU8: (_text: string) => new Uint8Array(0), zipSync: (_entries: Record<string, Uint8Array>) => new Uint8Array(0) }) }
void parseBudgeted; void workbookTypes; void forgedAdmission; void missingWorkbookPolicy
