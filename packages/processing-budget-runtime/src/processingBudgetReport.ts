import {
  PROCESSING_BUDGET_CATEGORY_IDS,
  PROCESSING_BUDGET_DEFINITION_BY_ID,
  PROCESSING_BUDGET_LEDGER_REPORT_SCHEMA_VERSION,
  type ProcessingBudgetCategory,
  type TargetScopedProcessingBudgetCategory
} from "./generatedProcessingBudgetDefinition"
import type {
  ProcessingBudgetLedgerCategoryReport,
  ProcessingBudgetLedgerReport,
  ProcessingBudgetLedgerTargetReport
} from "./processingBudgetLedger"

export const PROCESSING_BUDGET_REPORT_SCHEMA_VERSION = "processing-budget-report/v1" as const
export const PROCESSING_BUDGET_REPORT_MAX_ISSUES = 1_024 as const
export const PROCESSING_BUDGET_REPORT_MAX_TEXT_UTF8_BYTES = 256 as const

export type ProcessingBudgetCoverageStatus = "complete" | "partial" | "failed"
export type ProcessingBudgetOperationOutcome = "success" | "failed" | "cancelled"
export type ProcessingBudgetReportIssueKind = "truncation" | "unprocessed"
export type ProcessingBudgetReportErrorCode =
  | "processing_budget_report_invalid"
  | "processing_budget_report_stale"
  | "processing_budget_handoff_blocked"

export class ProcessingBudgetReportError extends Error {
  constructor(readonly code: ProcessingBudgetReportErrorCode, message: string) {
    super(message)
    this.name = "ProcessingBudgetReportError"
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export interface ProcessingBudgetReportIssue {
  readonly kind: ProcessingBudgetReportIssueKind
  readonly code: string
  readonly category?: ProcessingBudgetCategory
  readonly target?: string
  readonly processed?: number
  readonly observed?: number
  readonly unprocessed?: number
}

export interface ProcessingBudgetReportFailure {
  readonly code: string
  readonly category?: ProcessingBudgetCategory
  readonly target?: string
  readonly limit?: number
  readonly observed?: number
}

export interface ProcessingBudgetReportProducer {
  readonly id: string
  readonly version: string
}

export interface ProcessingBudgetReport {
  readonly schema_version: typeof PROCESSING_BUDGET_REPORT_SCHEMA_VERSION
  readonly producer: ProcessingBudgetReportProducer
  readonly operation_id: string
  readonly input_sha256: string
  readonly outcome: ProcessingBudgetOperationOutcome
  readonly coverage_status: ProcessingBudgetCoverageStatus
  readonly ledger: ProcessingBudgetLedgerReport
  readonly issues: readonly ProcessingBudgetReportIssue[]
  readonly failure?: ProcessingBudgetReportFailure
}

export interface CreateProcessingBudgetReportInput {
  readonly producer: ProcessingBudgetReportProducer
  readonly operation_id: string
  readonly input_sha256: string
  readonly outcome: ProcessingBudgetOperationOutcome
  readonly ledger: ProcessingBudgetLedgerReport
  readonly issues?: readonly ProcessingBudgetReportIssue[]
  readonly failure?: ProcessingBudgetReportFailure
}

export interface ValidateProcessingBudgetReportOptions {
  readonly expected_input_sha256?: string
}

const SHA256 = /^sha256:[a-f0-9]{64}$/u
const SAFE_CODE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u
const SAFE_PRODUCER_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/u
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u
const validatedReports = new WeakSet<object>()
const categoryOrder = new Map(PROCESSING_BUDGET_CATEGORY_IDS.map((category, index) => [category, index] as const))

export function createProcessingBudgetReport(input: CreateProcessingBudgetReportInput): ProcessingBudgetReport {
  return validateProcessingBudgetReport({
    schema_version: PROCESSING_BUDGET_REPORT_SCHEMA_VERSION,
    producer: input.producer,
    operation_id: input.operation_id,
    input_sha256: input.input_sha256,
    outcome: input.outcome,
    ledger: input.ledger,
    issues: input.issues ?? [],
    failure: input.failure
  })
}

export function validateProcessingBudgetReport(
  value: unknown,
  options: ValidateProcessingBudgetReportOptions = {}
): ProcessingBudgetReport {
  const report = closedRecord(
    value,
    ["schema_version", "producer", "operation_id", "input_sha256", "outcome", "coverage_status", "ledger", "issues", "failure"],
    ["schema_version", "producer", "operation_id", "input_sha256", "outcome", "ledger", "issues"],
    "processing budget report"
  )
  if (report.schema_version !== PROCESSING_BUDGET_REPORT_SCHEMA_VERSION) {
    invalid(`schema_version must be ${PROCESSING_BUDGET_REPORT_SCHEMA_VERSION}`)
  }

  const producerRecord = closedRecord(report.producer, ["id", "version"], ["id", "version"], "processing budget report.producer")
  const producer = Object.freeze({
    id: checkedText(producerRecord.id, "producer.id", SAFE_PRODUCER_ID),
    version: checkedText(producerRecord.version, "producer.version", SEMVER)
  })
  const operationId = checkedText(report.operation_id, "operation_id")
  const inputSha256 = checkedSha(report.input_sha256, "input_sha256")
  if (options.expected_input_sha256 !== undefined) {
    const expected = checkedSha(options.expected_input_sha256, "expected_input_sha256")
    if (inputSha256 !== expected) stale(`processing budget report input SHA ${inputSha256} does not match ${expected}`)
  }
  const outcome = checkedOutcome(report.outcome)
  const ledger = normalizeLedgerReport(report.ledger)
  const issues = normalizeIssues(report.issues)
  const failure = report.failure === undefined ? undefined : normalizeFailure(report.failure)
  const coverageStatus = report.coverage_status === undefined
    ? derivedCoverage(outcome, issues)
    : checkedCoverage(report.coverage_status)

  assertOutcomeCoverage(outcome, coverageStatus, issues, failure)
  const normalized = Object.freeze({
    schema_version: PROCESSING_BUDGET_REPORT_SCHEMA_VERSION,
    producer,
    operation_id: operationId,
    input_sha256: inputSha256,
    outcome,
    coverage_status: coverageStatus,
    ledger,
    issues,
    ...(failure === undefined ? {} : { failure })
  })
  validatedReports.add(normalized)
  return normalized
}

export function serializeProcessingBudgetReport(value: unknown): string {
  return `${JSON.stringify(knownOrValidated(value), null, 2)}\n`
}

export function assertProcessingBudgetReportAllowsHandoff(
  value: unknown,
  options: ValidateProcessingBudgetReportOptions = {}
): ProcessingBudgetReport {
  const report = knownOrValidated(value, options)
  if (report.outcome !== "success" || report.coverage_status !== "complete" || report.issues.length !== 0 || report.failure !== undefined) {
    blocked("formal handoff requires successful complete processing coverage")
  }
  if (report.ledger.categories.some((entry) => entry.reserved !== 0)
    || report.ledger.targets.some((entry) => entry.reserved !== 0)) {
    blocked("formal handoff requires every processing budget reservation to be finalized")
  }
  return report
}

function knownOrValidated(value: unknown, options: ValidateProcessingBudgetReportOptions = {}): ProcessingBudgetReport {
  if (typeof value === "object" && value !== null && validatedReports.has(value)) {
    const report = value as ProcessingBudgetReport
    if (options.expected_input_sha256 !== undefined) {
      const expected = checkedSha(options.expected_input_sha256, "expected_input_sha256")
      if (report.input_sha256 !== expected) stale(`processing budget report input SHA ${report.input_sha256} does not match ${expected}`)
    }
    return report
  }
  return validateProcessingBudgetReport(value, options)
}

function normalizeIssues(value: unknown): readonly ProcessingBudgetReportIssue[] {
  if (!Array.isArray(value)) invalid("issues must be an array")
  if (value.length > PROCESSING_BUDGET_REPORT_MAX_ISSUES) invalid(`issues exceed ${PROCESSING_BUDGET_REPORT_MAX_ISSUES}`)
  const issues = denseArrayMap(value, "issues", normalizeIssue)
  issues.sort(compareIssues)
  return Object.freeze(issues)
}

function normalizeIssue(value: unknown, index: number): ProcessingBudgetReportIssue {
  const record = closedRecord(
    value,
    ["kind", "code", "category", "target", "processed", "observed", "unprocessed"],
    ["kind", "code"],
    `issues[${index}]`
  )
  if (record.kind !== "truncation" && record.kind !== "unprocessed") invalid(`issues[${index}].kind is invalid`)
  const kind = record.kind
  const code = checkedText(record.code, `issues[${index}].code`, SAFE_CODE)
  const category = optionalCategory(record.category, `issues[${index}].category`)
  const target = optionalText(record.target, `issues[${index}].target`)
  const processed = optionalInteger(record.processed, `issues[${index}].processed`)
  const observed = optionalInteger(record.observed, `issues[${index}].observed`)
  const unprocessed = optionalInteger(record.unprocessed, `issues[${index}].unprocessed`)
  if (kind === "truncation" && (category === undefined || processed === undefined)) {
    invalid("truncation issues require category and processed")
  }
  if (observed !== undefined && processed !== undefined && observed < processed) {
    invalid(`issues[${index}].observed must not be below processed`)
  }
  if (observed !== undefined && processed !== undefined && unprocessed !== undefined
    && observed !== safeAdd(processed, unprocessed, `issues[${index}]`)) {
    invalid(`issues[${index}] observed must equal processed plus unprocessed`)
  }
  return Object.freeze({
    kind,
    code,
    ...(category === undefined ? {} : { category }),
    ...(target === undefined ? {} : { target }),
    ...(processed === undefined ? {} : { processed }),
    ...(observed === undefined ? {} : { observed }),
    ...(unprocessed === undefined ? {} : { unprocessed })
  })
}

function normalizeFailure(value: unknown): ProcessingBudgetReportFailure {
  const record = closedRecord(value, ["code", "category", "target", "limit", "observed"], ["code"], "failure")
  const category = optionalCategory(record.category, "failure.category")
  const target = optionalText(record.target, "failure.target")
  const limit = optionalInteger(record.limit, "failure.limit")
  const observed = optionalInteger(record.observed, "failure.observed")
  return Object.freeze({
    code: checkedText(record.code, "failure.code", SAFE_CODE),
    ...(category === undefined ? {} : { category }),
    ...(target === undefined ? {} : { target }),
    ...(limit === undefined ? {} : { limit }),
    ...(observed === undefined ? {} : { observed })
  })
}

function normalizeLedgerReport(value: unknown): ProcessingBudgetLedgerReport {
  const record = closedRecord(value, ["schema_version", "categories", "targets"], ["schema_version", "categories", "targets"], "ledger")
  if (record.schema_version !== PROCESSING_BUDGET_LEDGER_REPORT_SCHEMA_VERSION) {
    invalid(`ledger.schema_version must be ${PROCESSING_BUDGET_LEDGER_REPORT_SCHEMA_VERSION}`)
  }
  if (!Array.isArray(record.categories) || record.categories.length !== PROCESSING_BUDGET_CATEGORY_IDS.length) {
    invalid(`ledger.categories must contain all ${PROCESSING_BUDGET_CATEGORY_IDS.length} categories`)
  }
  if (!Array.isArray(record.targets)) invalid("ledger.targets must be an array")

  const categories = denseArrayMap(record.categories, "ledger.categories", normalizeCategoryReport)
  const targets = denseArrayMap(record.targets, "ledger.targets", normalizeTargetReport)
  const orderedTargets = [...targets].sort(compareTargets)
  for (let index = 0; index < targets.length; index += 1) {
    if (targets[index].category !== orderedTargets[index].category || targets[index].target !== orderedTargets[index].target) {
      invalid("ledger.targets are not in canonical category/target order")
    }
    if (index > 0 && targets[index - 1].category === targets[index].category && targets[index - 1].target === targets[index].target) {
      invalid("ledger.targets contains a duplicate target")
    }
  }

  for (const category of PROCESSING_BUDGET_CATEGORY_IDS) {
    const categoryReport = categories[requiredCategoryIndex(category)]
    const matching = targets.filter((target) => target.category === category)
    if (categoryReport.scope === "target") {
      const committed = matching.reduce((total, target) => safeAdd(total, target.committed, "ledger target committed"), 0)
      const reserved = matching.reduce((total, target) => safeAdd(total, target.reserved, "ledger target reserved"), 0)
      if (categoryReport.target_count !== matching.length || categoryReport.committed !== committed || categoryReport.reserved !== reserved) {
        invalid(`ledger target category summary does not match target records for ${category}`)
      }
    } else if (matching.length !== 0) {
      invalid(`operation category ${category} must not have target records`)
    }
  }

  return Object.freeze({
    schema_version: PROCESSING_BUDGET_LEDGER_REPORT_SCHEMA_VERSION,
    categories: Object.freeze(categories),
    targets: Object.freeze(targets)
  })
}

function normalizeCategoryReport(value: unknown, index: number): ProcessingBudgetLedgerCategoryReport {
  const expectedCategory = PROCESSING_BUDGET_CATEGORY_IDS[index]
  const definition = PROCESSING_BUDGET_DEFINITION_BY_ID[expectedCategory]
  const common = ["category", "scope", "unit", "limit", "committed", "reserved", "used"]
  const allowed = definition.scope === "operation" ? [...common, "remaining"] : [...common, "target_count"]
  const record = closedRecord(value, allowed, allowed, `ledger.categories[${index}]`)
  if (record.category !== expectedCategory || record.scope !== definition.scope || record.unit !== definition.unit) {
    invalid(`ledger.categories[${index}] does not match canonical definition ${expectedCategory}`)
  }
  const limit = checkedInteger(record.limit, `ledger.categories[${index}].limit`)
  const committed = checkedInteger(record.committed, `ledger.categories[${index}].committed`)
  const reserved = checkedInteger(record.reserved, `ledger.categories[${index}].reserved`)
  const used = checkedInteger(record.used, `ledger.categories[${index}].used`)
  if (used !== safeAdd(committed, reserved, `ledger.categories[${index}]`) || used > limit) {
    invalid(`ledger.categories[${index}] usage is inconsistent`)
  }
  if (definition.scope === "operation") {
    const remaining = checkedInteger(record.remaining, `ledger.categories[${index}].remaining`)
    if (remaining !== limit - used) invalid(`ledger.categories[${index}].remaining is inconsistent`)
    return Object.freeze({
      category: expectedCategory,
      scope: "operation",
      unit: definition.unit,
      limit,
      committed,
      reserved,
      used,
      remaining
    }) as ProcessingBudgetLedgerCategoryReport
  }
  const targetCount = checkedInteger(record.target_count, `ledger.categories[${index}].target_count`)
  return Object.freeze({
    category: expectedCategory as TargetScopedProcessingBudgetCategory,
    scope: "target",
    unit: definition.unit,
    limit,
    committed,
    reserved,
    used,
    target_count: targetCount
  }) as ProcessingBudgetLedgerCategoryReport
}

function normalizeTargetReport(value: unknown, index: number): ProcessingBudgetLedgerTargetReport {
  const record = closedRecord(
    value,
    ["category", "target", "unit", "limit", "committed", "reserved", "used", "remaining"],
    ["category", "target", "unit", "limit", "committed", "reserved", "used", "remaining"],
    `ledger.targets[${index}]`
  )
  const category = checkedCategory(record.category, `ledger.targets[${index}].category`)
  const definition = PROCESSING_BUDGET_DEFINITION_BY_ID[category]
  if (definition.scope !== "target" || record.unit !== definition.unit) invalid(`ledger.targets[${index}] category or unit is invalid`)
  const target = checkedText(record.target, `ledger.targets[${index}].target`)
  const limit = checkedInteger(record.limit, `ledger.targets[${index}].limit`)
  const committed = checkedInteger(record.committed, `ledger.targets[${index}].committed`)
  const reserved = checkedInteger(record.reserved, `ledger.targets[${index}].reserved`)
  const used = checkedInteger(record.used, `ledger.targets[${index}].used`)
  const remaining = checkedInteger(record.remaining, `ledger.targets[${index}].remaining`)
  if (used !== safeAdd(committed, reserved, `ledger.targets[${index}]`) || used > limit || remaining !== limit - used) {
    invalid(`ledger.targets[${index}] usage is inconsistent`)
  }
  return Object.freeze({
    category: category as TargetScopedProcessingBudgetCategory,
    target,
    unit: definition.unit,
    limit,
    committed,
    reserved,
    used,
    remaining
  })
}

function assertOutcomeCoverage(
  outcome: ProcessingBudgetOperationOutcome,
  coverage: ProcessingBudgetCoverageStatus,
  issues: readonly ProcessingBudgetReportIssue[],
  failure: ProcessingBudgetReportFailure | undefined
): void {
  if (outcome === "success") {
    if (failure !== undefined) invalid("successful processing report must not contain failure")
    if (coverage === "failed") invalid("successful processing report cannot have failed coverage")
    if (coverage === "complete" && issues.length !== 0) invalid("complete processing report must not contain issues")
    if (coverage === "partial" && issues.length === 0) invalid("partial processing report must contain an issue")
    return
  }
  if (coverage !== "failed") invalid("failed or cancelled processing outcome requires failed coverage")
  if (failure === undefined) invalid("failed or cancelled processing outcome requires failure details")
}

function derivedCoverage(outcome: ProcessingBudgetOperationOutcome, issues: readonly ProcessingBudgetReportIssue[]): ProcessingBudgetCoverageStatus {
  if (outcome !== "success") return "failed"
  return issues.length === 0 ? "complete" : "partial"
}

function checkedOutcome(value: unknown): ProcessingBudgetOperationOutcome {
  if (value !== "success" && value !== "failed" && value !== "cancelled") invalid("outcome is invalid")
  return value
}

function checkedCoverage(value: unknown): ProcessingBudgetCoverageStatus {
  if (value !== "complete" && value !== "partial" && value !== "failed") invalid("coverage_status is invalid")
  return value
}

function checkedCategory(value: unknown, label: string): ProcessingBudgetCategory {
  if (typeof value !== "string" || !categoryOrder.has(value as ProcessingBudgetCategory)) invalid(`${label} is invalid`)
  return value as ProcessingBudgetCategory
}

function optionalCategory(value: unknown, label: string): ProcessingBudgetCategory | undefined {
  return value === undefined ? undefined : checkedCategory(value, label)
}

function checkedSha(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) invalid(`${label} must be lowercase sha256:<64 hex>`)
  return value
}

function optionalText(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : checkedText(value, label)
}

function checkedText(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length === 0 || CONTROL_CHARACTERS.test(value)
    || value.normalize("NFC") !== value || utf8ByteLength(value) > PROCESSING_BUDGET_REPORT_MAX_TEXT_UTF8_BYTES
    || (pattern !== undefined && !pattern.test(value))) {
    invalid(`${label} is invalid or exceeds ${PROCESSING_BUDGET_REPORT_MAX_TEXT_UTF8_BYTES} UTF-8 bytes`)
  }
  return value
}

function optionalInteger(value: unknown, label: string): number | undefined {
  return value === undefined ? undefined : checkedInteger(value, label)
}

function checkedInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid(`${label} must be a non-negative safe integer`)
  return value as number
}

function denseArrayMap<T>(
  value: readonly unknown[],
  label: string,
  normalize: (entry: unknown, index: number) => T
): T[] {
  let keys: readonly PropertyKey[]
  try { keys = Reflect.ownKeys(value) } catch { invalid(`${label} keys are unavailable`) }

  let lengthDescriptor: PropertyDescriptor | undefined
  try { lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length") } catch { invalid(`${label}.length descriptor is unavailable`) }
  if (!lengthDescriptor || !("value" in lengthDescriptor)
    || lengthDescriptor.enumerable !== false || lengthDescriptor.configurable !== false
    || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0
    || lengthDescriptor.value > 0xffff_ffff) {
    invalid(`${label}.length is invalid`)
  }
  const length = lengthDescriptor.value as number
  const descriptors = new Map<number, PropertyDescriptor>()
  for (const key of keys) {
    if (typeof key !== "string") invalid(`${label} contains a symbol property`)
    if (key === "length") continue
    if (!/^(?:0|[1-9][0-9]*)$/u.test(key)) invalid(`${label} contains a non-index property ${key}`)
    const index = Number(key)
    if (!Number.isSafeInteger(index) || index < 0 || index >= length || index >= 0xffff_ffff) {
      invalid(`${label} contains an invalid index ${key}`)
    }
    let descriptor: PropertyDescriptor | undefined
    try { descriptor = Object.getOwnPropertyDescriptor(value, key) } catch { invalid(`${label}[${key}] descriptor is unavailable`) }
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      invalid(`${label}[${key}] must be an enumerable own data property`)
    }
    descriptors.set(index, descriptor)
  }
  if (descriptors.size !== length) invalid(`${label} contains one or more sparse slots`)

  const output: T[] = []
  for (const [index, descriptor] of [...descriptors.entries()].sort((left, right) => left[0] - right[0])) {
    output.push(normalize(descriptor.value, index))
  }
  return output
}

function closedRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  label: string
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be a plain object`)
  let prototype: object | null
  try { prototype = Object.getPrototypeOf(value) } catch { invalid(`${label} prototype is unavailable`) }
  if (prototype !== Object.prototype && prototype !== null) invalid(`${label} must be a plain object`)
  const allowed = new Set(allowedKeys)
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  let keys: readonly PropertyKey[]
  try { keys = Reflect.ownKeys(value) } catch { invalid(`${label} keys are unavailable`) }
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.has(key)) invalid(`${label} contains unknown property ${String(key)}`)
    let descriptor: PropertyDescriptor | undefined
    try { descriptor = Object.getOwnPropertyDescriptor(value, key) } catch { invalid(`${label}.${key} descriptor is unavailable`) }
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) invalid(`${label}.${key} must be an enumerable own data property`)
    output[key] = descriptor.value
  }
  for (const key of requiredKeys) if (!Object.hasOwn(output, key)) invalid(`${label}.${key} is required`)
  return Object.freeze(output)
}

function compareIssues(left: ProcessingBudgetReportIssue, right: ProcessingBudgetReportIssue): number {
  return issueCategoryOrder(left.category) - issueCategoryOrder(right.category)
    || compareCodePoints(left.target ?? "", right.target ?? "")
    || compareCodePoints(left.kind, right.kind)
    || compareCodePoints(left.code, right.code)
}

function compareTargets(left: ProcessingBudgetLedgerTargetReport, right: ProcessingBudgetLedgerTargetReport): number {
  return requiredCategoryIndex(left.category) - requiredCategoryIndex(right.category)
    || compareCodePoints(left.target, right.target)
}

function issueCategoryOrder(category: ProcessingBudgetCategory | undefined): number {
  return category === undefined ? -1 : requiredCategoryIndex(category)
}

function requiredCategoryIndex(category: ProcessingBudgetCategory): number {
  const index = categoryOrder.get(category)
  if (index === undefined) invalid(`unknown category ${category}`)
  return index
}

function compareCodePoints(left: string, right: string): number {
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftCodePoint = left.codePointAt(leftIndex)
    const rightCodePoint = right.codePointAt(rightIndex)
    if (leftCodePoint === undefined || rightCodePoint === undefined) break
    if (leftCodePoint !== rightCodePoint) return leftCodePoint < rightCodePoint ? -1 : 1
    leftIndex += leftCodePoint > 0xffff ? 2 : 1
    rightIndex += rightCodePoint > 0xffff ? 2 : 1
  }
  return leftIndex < left.length ? 1 : rightIndex < right.length ? -1 : 0
}

function safeAdd(left: number, right: number, label: string): number {
  if (right > Number.MAX_SAFE_INTEGER - left) invalid(`${label} exceeds safe integer range`)
  return left + right
}

function utf8ByteLength(value: string): number {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit <= 0x7f) bytes += 1
    else if (codeUnit <= 0x7ff) bytes += 2
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff
      && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00
      && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4
      index += 1
    } else bytes += 3
  }
  return bytes
}

function invalid(message: string): never {
  throw new ProcessingBudgetReportError("processing_budget_report_invalid", message)
}
function stale(message: string): never {
  throw new ProcessingBudgetReportError("processing_budget_report_stale", message)
}
function blocked(message: string): never {
  throw new ProcessingBudgetReportError("processing_budget_handoff_blocked", message)
}
