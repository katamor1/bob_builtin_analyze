import {
  DEFAULT_PROCESSING_BUDGET_PROFILE,
  ProcessingBudgetLedger,
  assertParsedXlsxWorkbookWithinBudget,
  commitWorkbookBudget,
  commitXlsxWorkbookBudget,
  normalizeProcessingBudgetProfile,
  preflightOoxmlArchive,
  readBoundedDocumentFile,
  type BoundedDocumentSnapshot,
  type OoxmlArchiveSnapshot,
  type ProcessingBudgetCategory,
  type ProcessingBudgetLedgerReport,
  type ProcessingBudgetProfile
} from "../.."

const category: ProcessingBudgetCategory = "raw_diff_bytes"
const profile: ProcessingBudgetProfile = normalizeProcessingBudgetProfile({
  limits: { raw_diff_bytes: DEFAULT_PROCESSING_BUDGET_PROFILE.limits.raw_diff_bytes }
})
const ledger = new ProcessingBudgetLedger(profile)
const reservation = ledger.reserve(category, 128)
reservation.commit(64)
ledger.reserveForTarget("single_document_bytes", "fixture-document", 128).release()
commitWorkbookBudget({
  ledger,
  workbookTarget: "fixture-workbook",
  sheets: [{ target: "fixture-workbook:sheet-0", rows: 1 }]
})
const report: ProcessingBudgetLedgerReport = ledger.snapshot()
const firstCategory = report.categories[0]
if (firstCategory?.scope === "operation") void firstCategory.remaining

const document: Promise<BoundedDocumentSnapshot> = readBoundedDocumentFile({
  filePath: "fixture.docx",
  target: "fixture-document",
  ledger
})
void document
const archive: OoxmlArchiveSnapshot = preflightOoxmlArchive({
  archiveBytes: new Uint8Array(),
  target: "fixture-archive",
  ledger,
  expectedKind: "docx"
})
void archive
const workbookInspection = commitXlsxWorkbookBudget({
  ledger,
  workbookTarget: "fixture-workbook-from-archive",
  archive
})
assertParsedXlsxWorkbookWithinBudget(workbookInspection, [])

// @ts-expect-error target-scoped categories require an explicit target
ledger.reserve("single_document_bytes", 1)
// @ts-expect-error operation-scoped categories must not accept a target
ledger.reserveForTarget("raw_diff_bytes", "fixture-diff", 1)
// @ts-expect-error consumers must not configure unknown budget categories
normalizeProcessingBudgetProfile({ limits: { not_a_category: 1 } })
// @ts-expect-error consumers must not reserve unknown budget categories
ledger.reserve("not_a_category", 1)
// @ts-expect-error OOXML kind is closed
preflightOoxmlArchive({ archiveBytes: new Uint8Array(), target: "invalid", ledger, expectedKind: "pdf" })
