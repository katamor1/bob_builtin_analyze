import {
  PROCESSING_BUDGET_CATEGORY_IDS,
  PROCESSING_BUDGET_DEFINITION_BY_ID,
  PROCESSING_BUDGET_LEDGER_REPORT_SCHEMA_VERSION,
  PROCESSING_BUDGET_OPERATION_CATEGORY_IDS,
  PROCESSING_BUDGET_TARGET_CATEGORY_IDS,
  type OperationScopedProcessingBudgetCategory,
  type ProcessingBudgetCategory,
  type ProcessingBudgetUnit,
  type TargetScopedProcessingBudgetCategory
} from "./generatedProcessingBudgetDefinition"
import { ProcessingBudgetError } from "./processingBudgetError"
import {
  normalizeProcessingBudgetProfile,
  type ProcessingBudgetProfile,
  type ProcessingBudgetProfileOverrides
} from "./processingBudgetProfile"

export const PROCESSING_BUDGET_TARGET_MAX_UTF8_BYTES = 256 as const

interface MutableCategoryState {
  committed: number
  reserved: number
}

interface ReservationDebit {
  readonly category: ProcessingBudgetCategory
  readonly state: MutableCategoryState
  readonly target?: string
}

interface OpenReservation {
  readonly targetCategory: ProcessingBudgetCategory
  readonly target?: string
  readonly debits: readonly ReservationDebit[]
  readonly amount: number
}

interface ProcessingBudgetLedgerCategoryBaseReport {
  readonly category: ProcessingBudgetCategory
  readonly unit: ProcessingBudgetUnit
  readonly limit: number
  readonly committed: number
  readonly reserved: number
  readonly used: number
}

export interface ProcessingBudgetLedgerOperationCategoryReport extends ProcessingBudgetLedgerCategoryBaseReport {
  readonly scope: "operation"
  readonly category: OperationScopedProcessingBudgetCategory
  readonly remaining: number
}

export interface ProcessingBudgetLedgerTargetCategoryReport extends ProcessingBudgetLedgerCategoryBaseReport {
  readonly scope: "target"
  readonly category: TargetScopedProcessingBudgetCategory
  readonly target_count: number
}

export type ProcessingBudgetLedgerCategoryReport =
  | ProcessingBudgetLedgerOperationCategoryReport
  | ProcessingBudgetLedgerTargetCategoryReport

export interface ProcessingBudgetLedgerTargetReport {
  readonly category: TargetScopedProcessingBudgetCategory
  readonly target: string
  readonly unit: ProcessingBudgetUnit
  readonly limit: number
  readonly committed: number
  readonly reserved: number
  readonly used: number
  readonly remaining: number
}

export interface ProcessingBudgetLedgerReport {
  readonly schema_version: typeof PROCESSING_BUDGET_LEDGER_REPORT_SCHEMA_VERSION
  readonly categories: readonly ProcessingBudgetLedgerCategoryReport[]
  readonly targets: readonly ProcessingBudgetLedgerTargetReport[]
}

export interface ProcessingBudgetReservation {
  readonly category: ProcessingBudgetCategory
  readonly target?: string
  readonly amount: number
  commit(actualAmount?: number): void
  release(): void
}

function validReservationAmount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function diagnosticNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && Number.isSafeInteger(value)
    ? value
    : undefined
}

function safeObservedTotal(used: number, requested: number): number | undefined {
  return requested <= Number.MAX_SAFE_INTEGER - used ? used + requested : undefined
}

function safeSum(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0 || right > Number.MAX_SAFE_INTEGER - left) {
    throw new ProcessingBudgetError(
      "processing_budget_internal_invariant",
      "processing budget ledger report total is not a non-negative safe integer"
    )
  }
  return left + right
}

function assertStateWithinLimit(state: MutableCategoryState, limit: number): number {
  if (!Number.isSafeInteger(state.committed) || !Number.isSafeInteger(state.reserved)
    || state.committed < 0 || state.reserved < 0 || state.committed > limit
    || state.reserved > limit - state.committed) {
    throw new ProcessingBudgetError(
      "processing_budget_internal_invariant",
      "processing budget ledger state is outside its configured limit"
    )
  }
  return limit - state.committed - state.reserved
}

function isCategory(value: unknown): value is ProcessingBudgetCategory {
  return typeof value === "string" && Object.hasOwn(PROCESSING_BUDGET_DEFINITION_BY_ID, value)
}

function isTargetCategory(value: ProcessingBudgetCategory): value is TargetScopedProcessingBudgetCategory {
  return PROCESSING_BUDGET_DEFINITION_BY_ID[value].scope === "target"
}

function isOperationCategory(value: ProcessingBudgetCategory): value is OperationScopedProcessingBudgetCategory {
  return PROCESSING_BUDGET_DEFINITION_BY_ID[value].scope === "operation"
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

function operationChain(category: OperationScopedProcessingBudgetCategory): readonly OperationScopedProcessingBudgetCategory[] {
  const output: OperationScopedProcessingBudgetCategory[] = []
  const visited = new Set<ProcessingBudgetCategory>()
  let current: ProcessingBudgetCategory | null = category
  while (current !== null) {
    if (visited.has(current)) {
      throw new ProcessingBudgetError("processing_budget_internal_invariant", `aggregate cycle includes ${current}`)
    }
    visited.add(current)
    if (!isOperationCategory(current)) {
      throw new ProcessingBudgetError(
        "processing_budget_internal_invariant",
        `${current} is not operation-scoped inside an operation aggregate chain`
      )
    }
    output.push(current)
    current = PROCESSING_BUDGET_DEFINITION_BY_ID[current].aggregateInto
  }
  return Object.freeze(output)
}

function utf8ByteLengthExceeds(value: string, maximum: number): boolean {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit <= 0x7f) {
      bytes += 1
    } else if (codeUnit <= 0x7ff) {
      bytes += 2
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff
      && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00
      && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4
      index += 1
    } else {
      bytes += 3
    }
    if (bytes > maximum) return true
  }
  return false
}

function validateTarget(target: unknown, category: TargetScopedProcessingBudgetCategory): string {
  if (typeof target !== "string" || target.length === 0
    || utf8ByteLengthExceeds(target, PROCESSING_BUDGET_TARGET_MAX_UTF8_BYTES)) {
    throw new ProcessingBudgetError(
      "processing_budget_target_invalid",
      `target for ${category} must be a non-empty string of at most ${PROCESSING_BUDGET_TARGET_MAX_UTF8_BYTES} UTF-8 bytes`,
      { targetCategory: category }
    )
  }
  return target
}

export class ProcessingBudgetLedger {
  readonly #profile: ProcessingBudgetProfile
  readonly #operationState = new Map<OperationScopedProcessingBudgetCategory, MutableCategoryState>()
  readonly #targetState = new Map<TargetScopedProcessingBudgetCategory, Map<string, MutableCategoryState>>()
  readonly #reservations = new Map<symbol, OpenReservation>()

  constructor(profile: ProcessingBudgetProfile | ProcessingBudgetProfileOverrides | undefined = undefined) {
    this.#profile = normalizeProcessingBudgetProfile(profile)
    for (const category of PROCESSING_BUDGET_OPERATION_CATEGORY_IDS) {
      this.#operationState.set(category, { committed: 0, reserved: 0 })
    }
    for (const category of PROCESSING_BUDGET_TARGET_CATEGORY_IDS) {
      this.#targetState.set(category, new Map())
    }
    Object.freeze(this)
  }

  get profile(): ProcessingBudgetProfile {
    return this.#profile
  }

  reserve(categoryValue: OperationScopedProcessingBudgetCategory, amountValue: number): ProcessingBudgetReservation {
    if (!isCategory(categoryValue)) {
      throw new ProcessingBudgetError(
        "processing_budget_category_invalid",
        `unknown processing budget category ${String(categoryValue)}`,
        { targetCategory: String(categoryValue) }
      )
    }
    if (isTargetCategory(categoryValue)) {
      throw new ProcessingBudgetError(
        "processing_budget_target_required",
        `${categoryValue} requires reserveForTarget(...)`,
        { targetCategory: categoryValue }
      )
    }
    return this.#reserve(categoryValue, undefined, amountValue)
  }

  reserveForTarget(
    categoryValue: TargetScopedProcessingBudgetCategory,
    targetValue: string,
    amountValue: number
  ): ProcessingBudgetReservation {
    if (!isCategory(categoryValue)) {
      throw new ProcessingBudgetError(
        "processing_budget_category_invalid",
        `unknown processing budget category ${String(categoryValue)}`,
        { targetCategory: String(categoryValue) }
      )
    }
    if (isOperationCategory(categoryValue)) {
      throw new ProcessingBudgetError(
        "processing_budget_target_invalid",
        `${categoryValue} is operation-scoped and does not accept a target`,
        { targetCategory: categoryValue }
      )
    }
    const target = validateTarget(targetValue, categoryValue)
    return this.#reserve(categoryValue, target, amountValue)
  }

  snapshot(): ProcessingBudgetLedgerReport {
    const targetReports: ProcessingBudgetLedgerTargetReport[] = []
    const categories = PROCESSING_BUDGET_CATEGORY_IDS.map((category): ProcessingBudgetLedgerCategoryReport => {
      const definition = PROCESSING_BUDGET_DEFINITION_BY_ID[category]
      const limit = this.#profile.limits[category]
      if (isOperationCategory(category)) {
        const state = this.#requiredOperationState(category)
        const remaining = assertStateWithinLimit(state, limit)
        return Object.freeze({
          category,
          scope: "operation" as const,
          unit: definition.unit,
          limit,
          committed: state.committed,
          reserved: state.reserved,
          used: limit - remaining,
          remaining
        })
      }

      const states = this.#requiredTargetStates(category)
      let committed = 0
      let reserved = 0
      const orderedTargets = [...states.entries()].sort(([left], [right]) => compareCodePoints(left, right))
      for (const [target, state] of orderedTargets) {
        const remaining = assertStateWithinLimit(state, limit)
        committed = safeSum(committed, state.committed)
        reserved = safeSum(reserved, state.reserved)
        targetReports.push(Object.freeze({
          category,
          target,
          unit: definition.unit,
          limit,
          committed: state.committed,
          reserved: state.reserved,
          used: limit - remaining,
          remaining
        }))
      }
      return Object.freeze({
        category,
        scope: "target" as const,
        unit: definition.unit,
        limit,
        committed,
        reserved,
        used: safeSum(committed, reserved),
        target_count: states.size
      })
    })
    return Object.freeze({
      schema_version: PROCESSING_BUDGET_LEDGER_REPORT_SCHEMA_VERSION,
      categories: Object.freeze(categories),
      targets: Object.freeze(targetReports)
    })
  }

  #reserve(
    category: ProcessingBudgetCategory,
    target: string | undefined,
    amountValue: number
  ): ProcessingBudgetReservation {
    if (!validReservationAmount(amountValue)) {
      throw new ProcessingBudgetError(
        "processing_budget_reservation_invalid",
        `reservation for ${category} must be a non-negative safe integer`,
        { targetCategory: category, target, observed: diagnosticNumber(amountValue) }
      )
    }
    const amount = amountValue
    const debits: ReservationDebit[] = []
    let unattachedTargetState: MutableCategoryState | undefined

    if (isTargetCategory(category)) {
      if (target === undefined) {
        throw new ProcessingBudgetError(
          "processing_budget_internal_invariant",
          `${category} target reservation is missing its target`
        )
      }
      const states = this.#requiredTargetStates(category)
      const existing = states.get(target)
      const state = existing ?? { committed: 0, reserved: 0 }
      if (!existing) unattachedTargetState = state
      debits.push(Object.freeze({ category, target, state }))
      const parent = PROCESSING_BUDGET_DEFINITION_BY_ID[category].aggregateInto
      if (parent === null || !isOperationCategory(parent)) {
        throw new ProcessingBudgetError(
          "processing_budget_internal_invariant",
          `${category} does not have an operation-scoped aggregate`
        )
      }
      for (const aggregate of operationChain(parent)) {
        debits.push(Object.freeze({ category: aggregate, state: this.#requiredOperationState(aggregate) }))
      }
    } else {
      for (const aggregate of operationChain(category)) {
        debits.push(Object.freeze({ category: aggregate, state: this.#requiredOperationState(aggregate) }))
      }
    }

    for (const debit of debits) {
      const limit = this.#profile.limits[debit.category]
      const remaining = assertStateWithinLimit(debit.state, limit)
      if (amount > remaining) {
        throw new ProcessingBudgetError(
          "processing_budget_exceeded",
          `${category} reservation exceeds ${debit.category} limit ${limit}`,
          {
            targetCategory: category,
            target,
            constrainedCategory: debit.category,
            limit,
            observed: safeObservedTotal(limit - remaining, amount)
          }
        )
      }
    }

    if (unattachedTargetState !== undefined && target !== undefined && amount > 0 && isTargetCategory(category)) {
      this.#requiredTargetStates(category).set(target, unattachedTargetState)
    }
    for (const debit of debits) debit.state.reserved += amount

    const token = Symbol(category)
    this.#reservations.set(token, Object.freeze({
      targetCategory: category,
      target,
      debits: Object.freeze(debits),
      amount
    }))
    const ledger = this
    const reservation = {
      category,
      amount,
      commit(actualAmount: number = amount): void {
        ledger.#commitReservation(token, actualAmount)
      },
      release(): void {
        ledger.#releaseReservation(token)
      }
    } as ProcessingBudgetReservation & { target?: string }
    if (target !== undefined) reservation.target = target
    return Object.freeze(reservation)
  }

  #requiredOperationState(category: OperationScopedProcessingBudgetCategory): MutableCategoryState {
    const state = this.#operationState.get(category)
    if (!state) {
      throw new ProcessingBudgetError(
        "processing_budget_internal_invariant",
        `missing operation state for ${category}`
      )
    }
    return state
  }

  #requiredTargetStates(category: TargetScopedProcessingBudgetCategory): Map<string, MutableCategoryState> {
    const states = this.#targetState.get(category)
    if (!states) {
      throw new ProcessingBudgetError(
        "processing_budget_internal_invariant",
        `missing target state for ${category}`
      )
    }
    return states
  }

  #openReservation(token: symbol): OpenReservation {
    const reservation = this.#reservations.get(token)
    if (!reservation) {
      throw new ProcessingBudgetError(
        "processing_budget_reservation_finalized",
        "processing budget reservation was already committed or released"
      )
    }
    return reservation
  }

  #commitReservation(token: symbol, actualAmountValue: number): void {
    const reservation = this.#openReservation(token)
    if (!validReservationAmount(actualAmountValue) || actualAmountValue > reservation.amount) {
      throw new ProcessingBudgetError(
        "processing_budget_commit_invalid",
        `committed usage must be a non-negative safe integer no greater than reserved ${reservation.amount}`,
        {
          targetCategory: reservation.targetCategory,
          target: reservation.target,
          limit: reservation.amount,
          observed: diagnosticNumber(actualAmountValue)
        }
      )
    }
    const actualAmount = actualAmountValue
    for (const debit of reservation.debits) {
      const limit = this.#profile.limits[debit.category]
      assertStateWithinLimit(debit.state, limit)
      if (debit.state.reserved < reservation.amount || actualAmount > limit - debit.state.committed) {
        throw new ProcessingBudgetError(
          "processing_budget_internal_invariant",
          `cannot commit reservation against ${debit.category}`
        )
      }
    }
    for (const debit of reservation.debits) {
      debit.state.reserved -= reservation.amount
      debit.state.committed += actualAmount
    }
    this.#reservations.delete(token)
    this.#removeEmptyTargetState(reservation)
  }

  #releaseReservation(token: symbol): void {
    const reservation = this.#openReservation(token)
    for (const debit of reservation.debits) {
      if (debit.state.reserved < reservation.amount) {
        throw new ProcessingBudgetError(
          "processing_budget_internal_invariant",
          `cannot release reservation against ${debit.category}`
        )
      }
    }
    for (const debit of reservation.debits) debit.state.reserved -= reservation.amount
    this.#reservations.delete(token)
    this.#removeEmptyTargetState(reservation)
  }

  #removeEmptyTargetState(reservation: OpenReservation): void {
    if (reservation.target === undefined || !isTargetCategory(reservation.targetCategory)) return
    const states = this.#requiredTargetStates(reservation.targetCategory)
    const state = states.get(reservation.target)
    if (state && state.committed === 0 && state.reserved === 0) states.delete(reservation.target)
  }
}
