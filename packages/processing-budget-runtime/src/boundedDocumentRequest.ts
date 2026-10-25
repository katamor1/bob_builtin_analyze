import * as path from "node:path"
import { BoundedDocumentError } from "./boundedDocumentError"
import { ProcessingBudgetLedger } from "./processingBudgetLedger"
import { DEFAULT_PROCESSING_BUDGET_PROFILE } from "./processingBudgetProfile"

export const MAX_DOCUMENT_FILE_BYTES = 50 * 1048576

export interface BoundedDocumentIdentity {
  readonly byteSize: string
  readonly mtimeNs: string
  readonly device: string
  readonly inode: string
}
export interface BoundedDocumentFingerprint extends BoundedDocumentIdentity {
  readonly sha256: string
}
export interface BoundedDocumentReadInput {
  readonly filePath: string
  readonly rootPath: string
  readonly maximumFileBytes: number
  readonly target: string
  readonly ledger: ProcessingBudgetLedger
  readonly expectedFingerprint?: BoundedDocumentFingerprint
  readonly signal?: AbortSignal
}

export function invalidInput(): never {
  throw new BoundedDocumentError("bounded_document_input_invalid", { phase: "input" })
}

export function ownData(input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) invalidInput()
    const proto = Object.getPrototypeOf(input)
    if (proto !== null && proto !== Object.prototype) invalidInput()
    const descriptors = Object.getOwnPropertyDescriptors(input)
    const allowed = new Set([...required, ...optional])
    const keys = Reflect.ownKeys(descriptors)
    if (keys.some(key => typeof key !== "string" || !allowed.has(key)) || required.some(key => !Object.hasOwn(descriptors, key))) invalidInput()
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    for (const key of keys) {
      if (typeof key !== "string") invalidInput()
      const descriptor = descriptors[key]
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) invalidInput()
      result[key] = descriptor.value
    }
    return result
  } catch {
    return invalidInput()
  }
}

function boundedString(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.includes("\0") || Buffer.byteLength(value, "utf8") > maximum) invalidInput()
  return value
}

export function fileMaximum(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) invalidInput()
  return Math.min(value, MAX_DOCUMENT_FILE_BYTES)
}

const abortedGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")?.get
export function validateSignal(value: unknown): AbortSignal | undefined {
  if (value === undefined) return undefined
  try {
    if (!(value instanceof AbortSignal) || !abortedGetter) invalidInput()
    abortedGetter.call(value)
    return value
  } catch {
    return invalidInput()
  }
}
export function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal && abortedGetter?.call(signal)) throw new BoundedDocumentError("bounded_document_cancelled")
}

export function fingerprint(value: unknown): BoundedDocumentFingerprint {
  const data = ownData(value, ["byteSize", "mtimeNs", "device", "inode", "sha256"])
  for (const key of ["byteSize", "mtimeNs", "device", "inode"]) {
    const number = data[key]
    if (typeof number !== "string" || number.length > 40 || !(key === "mtimeNs" ? /^-?(0|[1-9][0-9]*)$/ : /^(0|[1-9][0-9]*)$/).test(number)) invalidInput()
  }
  if (typeof data.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(data.sha256)) invalidInput()
  return Object.freeze(data) as unknown as BoundedDocumentFingerprint
}

const ledgerProfileGetter = Object.getOwnPropertyDescriptor(ProcessingBudgetLedger.prototype, "profile")?.get
function validateLedger(value: unknown): ProcessingBudgetLedger {
  try {
    if (!(value instanceof ProcessingBudgetLedger) || !ledgerProfileGetter) invalidInput()
    ledgerProfileGetter.call(value)
    return value
  } catch {
    return invalidInput()
  }
}

export function normalizeReadInput(value: unknown): BoundedDocumentReadInput {
  const data = ownData(value, ["filePath", "rootPath", "maximumFileBytes", "target", "ledger"], ["expectedFingerprint", "signal"])
  const filePath = boundedString(data.filePath, 4096)
  const rootPath = boundedString(data.rootPath, 4096)
  if (!path.isAbsolute(filePath) || !path.isAbsolute(rootPath)) invalidInput()
  const ledger = validateLedger(data.ledger)
  return Object.freeze({ filePath: path.resolve(filePath), rootPath: path.resolve(rootPath), maximumFileBytes: fileMaximum(data.maximumFileBytes), target: boundedString(data.target, 256), ledger,
    ...(data.expectedFingerprint === undefined ? {} : { expectedFingerprint: fingerprint(data.expectedFingerprint) }),
    ...(data.signal === undefined ? {} : { signal: validateSignal(data.signal) }) })
}

export function documentLedger(maximum: number): ProcessingBudgetLedger {
  const leaf = fileMaximum(maximum)
  const total = Math.max(leaf, DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_document_bytes)
  const operation = Math.max(total, DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_operation_input_bytes)
  return new ProcessingBudgetLedger({ limits: { single_document_bytes: leaf, total_document_bytes: total, total_operation_input_bytes: operation } })
}
