const STABLE_ID_NAMESPACES = ["PRJ", "CTX", "PRM"] as const
const MAX_STABLE_ID_NUMBER = 9_999
const KNOWN_STABLE_ID_PREFIX = /^(PRJ|CTX|PRM)-/

export type StableIdNamespace = (typeof STABLE_ID_NAMESPACES)[number]
export type StableId<Namespace extends StableIdNamespace> = `${Namespace}-${string}`
export type RuleId = StableId<"PRJ">
export type ContextSectionId = StableId<"CTX">
export type PromptSectionId = StableId<"PRM">

export function allocateRuleIds(existingIds: readonly string[], count: number): RuleId[] {
  return allocateStableIds("PRJ", existingIds, count)
}

export function allocateContextSectionIds(
  existingIds: readonly string[],
  count: number
): ContextSectionId[] {
  return allocateStableIds("CTX", existingIds, count)
}

export function allocatePromptSectionIds(
  existingIds: readonly string[],
  count: number
): PromptSectionId[] {
  return allocateStableIds("PRM", existingIds, count)
}

export function allocateStableIds<Namespace extends StableIdNamespace>(
  namespace: Namespace,
  existingIds: readonly string[],
  count: number
): Array<StableId<Namespace>> {
  if (!isStableIdNamespace(namespace)) {
    throw new Error("Unsupported stable ID namespace")
  }
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_STABLE_ID_NUMBER) {
    throw new Error("Stable ID allocation count must be a non-negative safe integer no greater than 9999")
  }
  if (!Array.isArray(existingIds)) {
    throw new Error(`Existing ${namespace} IDs must be an array`)
  }

  const idPattern = new RegExp(`^${namespace}-([0-9]{4})$`)
  const seen = new Set<string>()
  let maximum = 0

  for (const existingId of existingIds) {
    if (typeof existingId !== "string") {
      throw new Error(`Existing ${namespace} ID must match the approved namespace format`)
    }
    if (seen.has(existingId)) {
      throw new Error(`Duplicate existing ${namespace} ID`)
    }
    seen.add(existingId)
    const stablePrefix = KNOWN_STABLE_ID_PREFIX.exec(existingId.trim())?.[1]
    if (stablePrefix !== undefined && stablePrefix !== namespace) {
      throw new Error(`Existing ${stablePrefix} ID uses the wrong stable ID namespace for ${namespace}`)
    }
    // Existing checklists can contain legacy IDs such as RT-001. Only this
    // allocator's reserved namespace participates in the monotonic sequence.
    if (!existingId.trim().startsWith(`${namespace}-`)) continue
    const match = idPattern.exec(existingId)
    const numericId = match ? Number.parseInt(match[1], 10) : 0
    if (!match || numericId < 1 || numericId > MAX_STABLE_ID_NUMBER) {
      throw new Error(`Existing ${namespace} ID must match ${namespace}-NNNN from 0001 through 9999`)
    }
    maximum = Math.max(maximum, numericId)
  }

  const finalNumber = maximum + count
  if (finalNumber > MAX_STABLE_ID_NUMBER) {
    throw new Error(`${namespace} namespace overflow: allocation would exceed ${namespace}-9999`)
  }

  return Array.from({ length: count }, (_, index) => {
    const number = maximum + index + 1
    return `${namespace}-${number.toString(10).padStart(4, "0")}` as StableId<Namespace>
  })
}

function isStableIdNamespace(value: unknown): value is StableIdNamespace {
  return typeof value === "string" && STABLE_ID_NAMESPACES.some(namespace => namespace === value)
}
