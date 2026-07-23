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
  limits: { raw_diff_bytes: DEFAULT_PROCESSING_BUDGET_PROFILE.limits.raw_diff_bytes }
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
