import {
  PROCESSING_BUDGET_CATEGORY_IDS,
  PROCESSING_BUDGET_DEFINITION_BY_ID,
  PROCESSING_BUDGET_LEDGER_REPORT_SCHEMA_VERSION,
  type ProcessingBudgetCategory,
  type ProcessingBudgetUnit
} from "./generatedProcessingBudgetDefinition"
import { ProcessingBudgetError } from "./processingBudgetError"
import {
  normalizeProcessingBudgetProfile,
  type ProcessingBudgetProfile,
  type ProcessingBudgetProfileOverrides
} from "./processingBudgetProfile"

interface MutableCategoryState {
  committed: number
  reserved: number
}

interface OpenReservation {
  readonly targetCategory: ProcessingBudgetCategory
  readonly categories: readonly ProcessingBudgetCategory[]
  readonly amount: number
}

export interface ProcessingBudgetLedgerCategoryReport {
  readonly category: ProcessingBudgetCategory
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
}

export interface ProcessingBudgetReservation {
  readonly category: ProcessingBudgetCategory
  readonly amount: number
  commit(actualAmount?: number): void
  release(): void
}

function invalidReservationAmount(value: unknown): value is number {
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

function categoryChain(category: ProcessingBudgetCategory): readonly ProcessingBudgetCategory[] {
  const output: ProcessingBudgetCategory[] = []
  const visited = new Set<ProcessingBudgetCategory>()
  let current: ProcessingBudgetCategory | null = category
  while (current !== null) {
    if (visited.has(current)) {
      throw new ProcessingBudgetError("processing_budget_internal_invariant", `aggregate cycle includes ${current}`)
    }
    visited.add(current)
    output.push(current)
    current = PROCESSING_BUDGET_DEFINITION_BY_ID[current].aggregateInto
  }
  return Object.freeze(output)
}

export class ProcessingBudgetLedger {
  readonly #profile: ProcessingBudgetProfile
  readonly #state: Record<ProcessingBudgetCategory, MutableCategoryState>
  readonly #reservations = new Map<symbol, OpenReservation>()

  constructor(profile: ProcessingBudgetProfile | ProcessingBudgetProfileOverrides | undefined = undefined) {
    this.#profile = normalizeProcessingBudgetProfile(profile)
    this.#state = Object.create(null) as Record<ProcessingBudgetCategory, MutableCategoryState>
    for (const category of PROCESSING_BUDGET_CATEGORY_IDS) {
      this.#state[category] = { committed: 0, reserved: 0 }
    }
    Object.freeze(this)
  }

  get profile(): ProcessingBudgetProfile {
    return this.#profile
  }

  reserve(categoryValue: ProcessingBudgetCategory, amountValue: number): ProcessingBudgetReservation {
    if (!isCategory(categoryValue)) {
      throw new ProcessingBudgetError(
        "processing_budget_category_invalid",
        `unknown processing budget category ${String(categoryValue)}`,
        { targetCategory: String(categoryValue) }
      )
    }
    if (!invalidReservationAmount(amountValue)) {
      throw new ProcessingBudgetError(
        "processing_budget_reservation_invalid",
        `reservation for ${categoryValue} must be a non-negative safe integer`,
        { targetCategory: categoryValue, observed: diagnosticNumber(amountValue) }
      )
    }
    const category = categoryValue
    const amount = amountValue
    const categories = categoryChain(category)
    for (const constrainedCategory of categories) {
      const limit = this.#profile.limits[constrainedCategory]
      const remaining = assertStateWithinLimit(this.#state[constrainedCategory], limit)
      if (amount > remaining) {
        throw new ProcessingBudgetError(
          "processing_budget_exceeded",
          `${category} reservation exceeds ${constrainedCategory} limit ${limit}`,
          {
            targetCategory: category,
            constrainedCategory,
            limit,
            observed: safeObservedTotal(limit - remaining, amount)
          }
        )
      }
    }
    for (const constrainedCategory of categories) {
      this.#state[constrainedCategory].reserved += amount
    }
    const token = Symbol(category)
    this.#reservations.set(token, Object.freeze({ targetCategory: category, categories, amount }))
    const ledger = this
    return Object.freeze({
      category,
      amount,
      commit(actualAmount: number = amount): void {
        ledger.#commitReservation(token, actualAmount)
      },
      release(): void {
        ledger.#releaseReservation(token)
      }
    })
  }

  snapshot(): ProcessingBudgetLedgerReport {
    const categories = PROCESSING_BUDGET_CATEGORY_IDS.map((category) => {
      const definition = PROCESSING_BUDGET_DEFINITION_BY_ID[category]
      const state = this.#state[category]
      const limit = this.#profile.limits[category]
      const remaining = assertStateWithinLimit(state, limit)
      return Object.freeze({
        category,
        unit: definition.unit,
        limit,
        committed: state.committed,
        reserved: state.reserved,
        used: limit - remaining,
        remaining
      })
    })
    return Object.freeze({
      schema_version: PROCESSING_BUDGET_LEDGER_REPORT_SCHEMA_VERSION,
      categories: Object.freeze(categories)
    })
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
    if (!invalidReservationAmount(actualAmountValue) || actualAmountValue > reservation.amount) {
      throw new ProcessingBudgetError(
        "processing_budget_commit_invalid",
        `committed usage must be a non-negative safe integer no greater than reserved ${reservation.amount}`,
        {
          targetCategory: reservation.targetCategory,
          limit: reservation.amount,
          observed: diagnosticNumber(actualAmountValue)
        }
      )
    }
    const actualAmount = actualAmountValue
    for (const category of reservation.categories) {
      const state = this.#state[category]
      const limit = this.#profile.limits[category]
      assertStateWithinLimit(state, limit)
      if (state.reserved < reservation.amount || actualAmount > limit - state.committed) {
        throw new ProcessingBudgetError(
          "processing_budget_internal_invariant",
          `cannot commit reservation against ${category}`
        )
      }
    }
    for (const category of reservation.categories) {
      const state = this.#state[category]
      state.reserved -= reservation.amount
      state.committed += actualAmount
    }
    this.#reservations.delete(token)
  }

  #releaseReservation(token: symbol): void {
    const reservation = this.#openReservation(token)
    for (const category of reservation.categories) {
      const state = this.#state[category]
      if (state.reserved < reservation.amount) {
        throw new ProcessingBudgetError(
          "processing_budget_internal_invariant",
          `cannot release reservation against ${category}`
        )
      }
    }
    for (const category of reservation.categories) this.#state[category].reserved -= reservation.amount
    this.#reservations.delete(token)
  }
}
