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
