import {
  PROCESSING_BUDGET_ABSOLUTE_MAXIMA,
  PROCESSING_BUDGET_CATEGORY_IDS,
  PROCESSING_BUDGET_DEFAULT_LIMITS,
  PROCESSING_BUDGET_DEFINITION,
  PROCESSING_BUDGET_PROFILE_SCHEMA_VERSION,
  type ProcessingBudgetCategory
} from "./generatedProcessingBudgetDefinition"
import { ProcessingBudgetError } from "./processingBudgetError"

export type ProcessingBudgetLimits = Readonly<Record<ProcessingBudgetCategory, number>>

export interface ProcessingBudgetProfile {
  readonly schema_version: typeof PROCESSING_BUDGET_PROFILE_SCHEMA_VERSION
  readonly limits: ProcessingBudgetLimits
}

export interface ProcessingBudgetProfileOverrides {
  readonly schema_version?: typeof PROCESSING_BUDGET_PROFILE_SCHEMA_VERSION
  readonly limits?: Partial<Record<ProcessingBudgetCategory, number>>
}

function invalid(message: string): never {
  throw new ProcessingBudgetError("processing_budget_profile_invalid", message)
}

function snapshotClosedRecord(value: unknown, allowedKeys: readonly string[], label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object") invalid(`${label} must be a plain object`)
  try { if (Array.isArray(value)) invalid(`${label} must be a plain object`) } catch { invalid(`${label} is not inspectable`) }
  let prototype: object | null
  try {
    prototype = Object.getPrototypeOf(value)
  } catch {
    invalid(`${label} prototype is unavailable`)
  }
  if (prototype !== Object.prototype && prototype !== null) invalid(`${label} must not inherit configuration values`)
  const allowed = new Set(allowedKeys)
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  let keys: readonly PropertyKey[]
  try {
    keys = Reflect.ownKeys(value)
  } catch {
    invalid(`${label} keys are unavailable`)
  }
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.has(key)) invalid(`${label} contains an unknown property`)
    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key)
    } catch {
      invalid(`${label}.${key} descriptor is unavailable`)
    }
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      invalid(`${label}.${key} must be an enumerable own data property`)
    }
    output[key] = descriptor.value
  }
  return Object.freeze(output)
}

function checkedLimit(value: unknown, category: ProcessingBudgetCategory): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid(`${category} must be a non-negative safe integer`)
  const limit = value as number
  const maximum = PROCESSING_BUDGET_ABSOLUTE_MAXIMA[category]
  if (limit > maximum) invalid(`${category} exceeds its absolute maximum ${maximum}`)
  return limit
}

function freezeProfile(limits: Record<ProcessingBudgetCategory, number>): ProcessingBudgetProfile {
  const ordered = Object.create(null) as Record<ProcessingBudgetCategory, number>
  for (const category of PROCESSING_BUDGET_CATEGORY_IDS) ordered[category] = limits[category]
  return Object.freeze({
    schema_version: PROCESSING_BUDGET_PROFILE_SCHEMA_VERSION,
    limits: Object.freeze(ordered)
  })
}

function profileFromLimits(source: Readonly<Record<ProcessingBudgetCategory, number>>): ProcessingBudgetProfile {
  const limits = Object.create(null) as Record<ProcessingBudgetCategory, number>
  for (const category of PROCESSING_BUDGET_CATEGORY_IDS) limits[category] = source[category]
  return freezeProfile(limits)
}

export const DEFAULT_PROCESSING_BUDGET_PROFILE = profileFromLimits(PROCESSING_BUDGET_DEFAULT_LIMITS)
export const ABSOLUTE_PROCESSING_BUDGET_PROFILE = profileFromLimits(PROCESSING_BUDGET_ABSOLUTE_MAXIMA)

export function normalizeProcessingBudgetProfile(value: ProcessingBudgetProfileOverrides | undefined = undefined): ProcessingBudgetProfile {
  if (value === undefined) return profileFromLimits(PROCESSING_BUDGET_DEFAULT_LIMITS)
  const profile = snapshotClosedRecord(value, ["schema_version", "limits"], "processing budget profile")
  if (Object.hasOwn(profile, "schema_version") && profile.schema_version !== PROCESSING_BUDGET_PROFILE_SCHEMA_VERSION) {
    invalid(`schema_version must be ${PROCESSING_BUDGET_PROFILE_SCHEMA_VERSION}`)
  }
  const overrides = Object.hasOwn(profile, "limits")
    ? snapshotClosedRecord(profile.limits, PROCESSING_BUDGET_CATEGORY_IDS, "processing budget profile.limits")
    : Object.freeze(Object.create(null) as Record<string, unknown>)
  const limits = Object.create(null) as Record<ProcessingBudgetCategory, number>
  for (const category of PROCESSING_BUDGET_CATEGORY_IDS) {
    limits[category] = Object.hasOwn(overrides, category)
      ? checkedLimit(overrides[category], category)
      : PROCESSING_BUDGET_DEFAULT_LIMITS[category]
  }
  for (const definition of PROCESSING_BUDGET_DEFINITION) {
    if (definition.aggregateInto === null) continue
    if (limits[definition.id] > limits[definition.aggregateInto]) {
      invalid(`${definition.id} exceeds aggregate limit ${definition.aggregateInto}`)
    }
  }
  return freezeProfile(limits)
}
