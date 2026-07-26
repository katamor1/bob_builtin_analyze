import { createHash } from "node:crypto"
import type { CodeAnalysisResult } from "./analysisTypes"
import type { DiffSummary } from "./diffTypes"
import type { DocumentExtractionResult } from "./documentTypes"
import type { ReviewProcessingLimits } from "./limits"
import type { ReviewInput } from "./reviewTypes"
import type { TraceabilityResult } from "./traceabilityResultTypes"
import type { ContextBudgetArtifact } from "../evidenceScope/contextBudgetArtifact"
import type { ProduceRepositorySymbolIndexResult } from "../evidenceScope/repositorySymbolIndexProducer"
import type { SharedProcessingBudgetLimits } from "../sharedProcessingBudgetRuntime"

export interface ProcessingOperationConfiguration {
  readonly textEncoding?: string
  readonly diffFixturePath?: string
  readonly bzrPath?: string
  readonly processingBudgetLimits?: Readonly<Partial<SharedProcessingBudgetLimits>>
  readonly workflowRunId?: string
}

export interface MaterializedProcessingInputs {
  readonly diff?: DiffSummary
  readonly documents?: DocumentExtractionResult
  readonly codeAnalysis?: CodeAnalysisResult
  readonly repositoryIndexBuild?: ProduceRepositorySymbolIndexResult
  readonly contextBudgetArtifact?: ContextBudgetArtifact
  readonly contextWarnings?: readonly string[]
  readonly traceability?: TraceabilityResult
}

export function computeProcessingOperationInputSha(input: {
  readonly reviewInput: ReviewInput
  readonly configuration: ProcessingOperationConfiguration
  readonly limits: ReviewProcessingLimits
  readonly materialized?: MaterializedProcessingInputs
}): string {
  const materialized = input.materialized ?? {}
  const payload = {
    schema_version: "code-consistency-processing-input/v2",
    review_input_sha256: canonicalSha(input.reviewInput),
    configuration_sha256: canonicalSha({
      text_encoding: input.configuration.textEncoding ?? "auto",
      diff_fixture_path: input.configuration.diffFixturePath ?? "",
      bzr_path: input.configuration.bzrPath ?? "",
      processing_budget_limits: input.configuration.processingBudgetLimits ?? {},
      workflow_run_id: input.configuration.workflowRunId ?? ""
    }),
    limits_sha256: canonicalSha(input.limits),
    processed_inputs: {
      diff_sha256: optionalCanonicalSha(materialized.diff),
      documents_sha256: optionalCanonicalSha(materialized.documents),
      code_analysis_sha256: optionalCanonicalSha(materialized.codeAnalysis),
      repository_index_sha256: optionalCanonicalSha(materialized.repositoryIndexBuild),
      context_budget_sha256: optionalCanonicalSha({
        artifact: materialized.contextBudgetArtifact,
        warnings: materialized.contextWarnings ?? []
      }),
      traceability_sha256: optionalCanonicalSha(materialized.traceability)
    }
  }
  return canonicalSha(payload)
}

export function canonicalSha(value: unknown): string {
  const text = JSON.stringify(canonicalValue(value, new Set<object>()))
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`
}

function optionalCanonicalSha(value: unknown): string | null {
  return value === undefined ? null : canonicalSha(value)
}

function canonicalValue(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new Error("processing operation input contains a non-finite or unsafe number")
    }
    return value
  }
  if (typeof value === "bigint") return value.toString(10)
  if (value === undefined) return null
  if (typeof value !== "object") throw new Error("processing operation input contains an unsupported value")
  if (seen.has(value)) throw new Error("processing operation input contains a cycle")
  seen.add(value)
  try {
    if (Array.isArray(value)) return canonicalArray(value, seen)
    let prototype: object | null
    try {
      prototype = Object.getPrototypeOf(value)
    } catch {
      throw new Error("processing operation input object prototype is unavailable")
    }
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("processing operation input must contain plain data objects")
    }

    let ownKeys: readonly PropertyKey[]
    try {
      ownKeys = Reflect.ownKeys(value)
    } catch {
      throw new Error("processing operation input object keys are unavailable")
    }
    const descriptors = new Map<string, PropertyDescriptor>()
    for (const key of ownKeys) {
      if (typeof key !== "string") {
        throw new Error("processing operation input contains a symbol property")
      }
      let descriptor: PropertyDescriptor | undefined
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, key)
      } catch {
        throw new Error("processing operation input property descriptor is unavailable")
      }
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
        throw new Error("processing operation input contains an accessor or hidden property")
      }
      descriptors.set(key, descriptor)
    }

    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    for (const key of [...descriptors.keys()].sort(compareCodePoints)) {
      const descriptor = descriptors.get(key)
      if (!descriptor) throw new Error("processing operation input property descriptor was lost")
      if (descriptor.value !== undefined) output[key] = canonicalValue(descriptor.value, seen)
    }
    return output
  } finally {
    seen.delete(value)
  }
}

function canonicalArray(value: unknown[], seen: Set<object>): unknown[] {
  let prototype: object | null
  try {
    prototype = Object.getPrototypeOf(value)
  } catch {
    throw new Error("processing operation input array prototype is unavailable")
  }
  if (prototype !== Array.prototype && prototype !== null) {
    throw new Error("processing operation input must contain plain data arrays")
  }

  let ownKeys: readonly PropertyKey[]
  try {
    ownKeys = Reflect.ownKeys(value)
  } catch {
    throw new Error("processing operation input array keys are unavailable")
  }

  let lengthDescriptor: PropertyDescriptor | undefined
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length")
  } catch {
    throw new Error("processing operation input array length descriptor is unavailable")
  }
  if (!lengthDescriptor || !("value" in lengthDescriptor)
    || lengthDescriptor.enumerable !== false || lengthDescriptor.configurable !== false
    || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0
    || lengthDescriptor.value > 0xffff_ffff) {
    throw new Error("processing operation input array length is invalid")
  }
  const length = lengthDescriptor.value as number
  const descriptors = new Map<number, PropertyDescriptor>()
  for (const key of ownKeys) {
    if (typeof key !== "string") {
      throw new Error("processing operation input contains a symbol property on an array")
    }
    if (key === "length") continue
    const index = canonicalArrayIndex(key, length)
    if (index === undefined) {
      throw new Error("processing operation input contains a hidden or non-index array property")
    }
    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key)
    } catch {
      throw new Error("processing operation input array property descriptor is unavailable")
    }
    if (!descriptor || !("value" in descriptor)) {
      throw new Error("processing operation input contains an accessor on an array index")
    }
    if (descriptor.enumerable !== true) {
      throw new Error("processing operation input contains a hidden array index")
    }
    descriptors.set(index, descriptor)
  }

  const entries: unknown[] = []
  for (const index of [...descriptors.keys()].sort((left, right) => left - right)) {
    const descriptor = descriptors.get(index)
    if (!descriptor) throw new Error("processing operation input array descriptor was lost")
    entries.push([index, canonicalValue(descriptor.value, seen)])
  }
  return ["processing-operation-array/v1", length, entries]
}

function canonicalArrayIndex(key: string, length: number): number | undefined {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(key)) return undefined
  const index = Number(key)
  if (!Number.isSafeInteger(index) || index < 0 || index >= length || index >= 0xffff_ffff) return undefined
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
