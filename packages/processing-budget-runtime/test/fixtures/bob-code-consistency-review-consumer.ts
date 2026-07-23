import {
  DEFAULT_PROCESSING_BUDGET_PROFILE,
  ProcessingBudgetLedger,
  normalizeProcessingBudgetProfile,
  type ProcessingBudgetCategory,
  type ProcessingBudgetLedgerReport,
  type ProcessingBudgetProfile
} from "../../src"

const category: ProcessingBudgetCategory = "raw_diff_bytes"
const profile: ProcessingBudgetProfile = normalizeProcessingBudgetProfile({
  limits: { raw_diff_bytes: DEFAULT_PROCESSING_BUDGET_PROFILE.limits.raw_diff_bytes }
})
const ledger = new ProcessingBudgetLedger(profile)
const reservation = ledger.reserve(category, 128)
reservation.commit(64)
const report: ProcessingBudgetLedgerReport = ledger.snapshot()
void report.categories[0]?.remaining

// @ts-expect-error consumers must not configure unknown budget categories
normalizeProcessingBudgetProfile({ limits: { not_a_category: 1 } })
// @ts-expect-error consumers must not reserve unknown budget categories
ledger.reserve("not_a_category", 1)
