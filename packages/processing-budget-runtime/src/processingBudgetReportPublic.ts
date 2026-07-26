import {
  PROCESSING_BUDGET_ABSOLUTE_MAXIMA,
  PROCESSING_BUDGET_CATEGORY_IDS,
  PROCESSING_BUDGET_DEFINITION,
  type ProcessingBudgetCategory
} from "./generatedProcessingBudgetDefinition"
import {
  ProcessingBudgetReportError,
  assertProcessingBudgetReportAllowsHandoff as assertBaseHandoff,
  createProcessingBudgetReport as createBaseReport,
  validateProcessingBudgetReport as validateBaseReport,
  type CreateProcessingBudgetReportInput,
  type ProcessingBudgetReport,
  type ValidateProcessingBudgetReportOptions
} from "./processingBudgetReport"

const SHA256 = /^sha256:[a-f0-9]{64}$/u
const strictReports = new WeakSet<object>()

export function createProcessingBudgetReport(input: CreateProcessingBudgetReportInput): ProcessingBudgetReport {
  return rememberStrict(assertStrictInvariants(createBaseReport(input)))
}

export function validateProcessingBudgetReport(
  value: unknown,
  options: ValidateProcessingBudgetReportOptions = {}
): ProcessingBudgetReport {
  if (typeof value === "object" && value !== null && strictReports.has(value)) {
    const report = value as ProcessingBudgetReport
    assertExpectedInputSha(report, options)
    return report
  }
  if (!hasOwnCoverageStatus(value)) invalid("processing budget report.coverage_status is required")
  return rememberStrict(assertStrictInvariants(validateBaseReport(value, options)))
}

export function serializeProcessingBudgetReport(value: unknown): string {
  return `${JSON.stringify(validateProcessingBudgetReport(value), null, 2)}\n`
}

export function assertProcessingBudgetReportAllowsHandoff(
  value: unknown,
  options: ValidateProcessingBudgetReportOptions = {}
): ProcessingBudgetReport {
  const report = validateProcessingBudgetReport(value, options)
  assertBaseHandoff(report, options)
  return report
}

function rememberStrict(report: ProcessingBudgetReport): ProcessingBudgetReport {
  strictReports.add(report)
  return report
}

function assertExpectedInputSha(
  report: ProcessingBudgetReport,
  options: ValidateProcessingBudgetReportOptions
): void {
  if (options.expected_input_sha256 === undefined) return
  const expected = options.expected_input_sha256
  if (!SHA256.test(expected)) invalid("expected_input_sha256 must be lowercase sha256:<64 hex>")
  if (report.input_sha256 !== expected) {
    throw new ProcessingBudgetReportError(
      "processing_budget_report_stale",
      `processing budget report input SHA ${report.input_sha256} does not match ${expected}`
    )
  }
}

function assertStrictInvariants(report: ProcessingBudgetReport): ProcessingBudgetReport {
  const byCategory = new Map(report.ledger.categories.map((entry) => [entry.category, entry] as const))
  if (byCategory.size !== PROCESSING_BUDGET_CATEGORY_IDS.length) invalid("processing budget report category set is incomplete")

  for (const category of PROCESSING_BUDGET_CATEGORY_IDS) {
    const entry = byCategory.get(category)
    if (!entry) invalid(`processing budget report category ${category} is missing`)
    if (entry.limit > PROCESSING_BUDGET_ABSOLUTE_MAXIMA[category]) {
      invalid(`processing budget report category ${category} exceeds its absolute maximum`)
    }
  }

  for (const target of report.ledger.targets) {
    const category = byCategory.get(target.category)
    if (!category || category.scope !== "target" || target.limit !== category.limit) {
      invalid(`processing budget report target ${target.category}/${target.target} has an inconsistent limit`)
    }
  }

  for (const definition of PROCESSING_BUDGET_DEFINITION) {
    if (definition.aggregateInto === null) continue
    const child = requiredCategory(byCategory, definition.id)
    const parent = requiredCategory(byCategory, definition.aggregateInto)
    if (child.limit > parent.limit) {
      invalid(`processing budget report limit ${definition.id} exceeds aggregate ${definition.aggregateInto}`)
    }
  }

  const childrenByParent = new Map<ProcessingBudgetCategory, ProcessingBudgetCategory[]>()
  for (const definition of PROCESSING_BUDGET_DEFINITION) {
    if (definition.aggregateInto === null) continue
    const children = childrenByParent.get(definition.aggregateInto) ?? []
    children.push(definition.id)
    childrenByParent.set(definition.aggregateInto, children)
  }
  for (const [parentCategory, childCategories] of childrenByParent) {
    const parent = requiredCategory(byCategory, parentCategory)
    const childCommitted = childCategories.reduce(
      (total, category) => safeAdd(total, requiredCategory(byCategory, category).committed),
      0
    )
    const childReserved = childCategories.reduce(
      (total, category) => safeAdd(total, requiredCategory(byCategory, category).reserved),
      0
    )
    if (parent.committed < childCommitted || parent.reserved < childReserved) {
      invalid(`processing budget report aggregate ${parentCategory} under-reports child consumption`)
    }
  }
  return report
}

function requiredCategory(
  categories: ReadonlyMap<ProcessingBudgetCategory, ProcessingBudgetReport["ledger"]["categories"][number]>,
  category: ProcessingBudgetCategory
): ProcessingBudgetReport["ledger"]["categories"][number] {
  const value = categories.get(category)
  if (!value) invalid(`processing budget report category ${category} is missing`)
  return value
}

function hasOwnCoverageStatus(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "coverage_status")
    return Boolean(descriptor && "value" in descriptor && descriptor.enumerable === true)
  } catch {
    return false
  }
}

function safeAdd(left: number, right: number): number {
  if (right > Number.MAX_SAFE_INTEGER - left) invalid("processing budget report aggregate exceeds safe integer range")
  return left + right
}

function invalid(message: string): never {
  throw new ProcessingBudgetReportError("processing_budget_report_invalid", message)
}
