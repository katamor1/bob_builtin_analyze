import { createHash } from "node:crypto"
import { admitBoundedDocumentFile, withOperationDocumentSnapshot, type AdmittedDocumentFile } from "./boundedDocumentFile"
import { ownedDocumentSnapshot, type BoundedDocumentSnapshot } from "./boundedDocumentIo"
import { assertOperationNotAborted, invalidInput, normalizeReadInput, ownData, validateSignal, type BoundedDocumentFingerprint, type BoundedDocumentReadInput } from "./boundedDocumentRequest"
import { ProcessingBudgetLedger, type ProcessingBudgetLedgerReport } from "./processingBudgetLedger"
import { type ProcessingBudgetProfile } from "./processingBudgetProfile"

declare const documentAdmissionBrand: unique symbol
export interface DocumentAdmission {
  readonly [documentAdmissionBrand]: true
  readonly fingerprint: BoundedDocumentFingerprint
}
export interface DocumentSelectionRequest {
  readonly filePath: string
  readonly rootPath: string
  readonly maximumFileBytes: number
  readonly signal?: AbortSignal
}
export interface DocumentOperationInput {
  readonly selectedDocumentCount: number
  readonly profile: ProcessingBudgetProfile
  readonly signal?: AbortSignal
}
export interface DocumentOperationBase {
  readonly profile: ProcessingBudgetProfile
  readonly selectedDocumentCount: number
  readonly signal?: AbortSignal
  fingerprintSelection(index: number, request: DocumentSelectionRequest): Promise<DocumentAdmission>
  readSelection(index: number, request: DocumentSelectionRequest): Promise<BoundedDocumentSnapshot>
  verifyAfterExternalRead(admission: DocumentAdmission): Promise<void>
  snapshot(): Readonly<ProcessingBudgetLedgerReport>
}
interface AdmissionRecord {
  readonly operation: symbol
  readonly file: AdmittedDocumentFile
  readonly signal?: AbortSignal
  state: "admitted" | "in_progress" | "completed" | "failed"
}
const admissions = new WeakMap<DocumentAdmission, AdmissionRecord>()

export function assertDocumentNotCancelled(signal?: AbortSignal): void {
  assertOperationNotAborted(validateSignal(signal))
}

export function createDocumentOperation(value: DocumentOperationInput): DocumentOperationBase {
  const input = ownData(value, ["selectedDocumentCount", "profile"], ["signal"])
  const signal = validateSignal(input.signal)
  assertOperationNotAborted(signal)
  const countValue = input.selectedDocumentCount
  if (typeof countValue !== "number" || !Number.isSafeInteger(countValue) || countValue < 0) invalidInput()
  const count = countValue
  const ledger = new ProcessingBudgetLedger(input.profile as ProcessingBudgetProfile)
  ledger.reserve("document_count", count).commit()
  const identity = Symbol("document operation"), used = new Set<number>()

  function selection(index: number, value: DocumentSelectionRequest): BoundedDocumentReadInput {
    assertOperationNotAborted(signal)
    if (!Number.isSafeInteger(index) || index < 0 || index >= count || used.has(index)) invalidInput()
    used.add(index)
    const data = ownData(value, ["filePath", "rootPath", "maximumFileBytes"], ["signal"])
    const effectiveSignal = signal ?? validateSignal(data.signal)
    assertOperationNotAborted(effectiveSignal)
    // Validate before hashing so path coercion and inherited getters never run.
    const normalized = normalizeReadInput({ ...data, signal: effectiveSignal, ledger, target: "selection" } as unknown as BoundedDocumentReadInput)
    const digest = createHash("sha256").update(normalized.rootPath).update("\0").update(normalized.filePath).digest("hex")
    return Object.freeze({ ...normalized, target: `document-${index}-${digest}` })
  }

  return Object.freeze({
    profile: ledger.profile, selectedDocumentCount: count, ...(signal === undefined ? {} : { signal }),
    async fingerprintSelection(index: number, request: DocumentSelectionRequest): Promise<DocumentAdmission> {
      const input = selection(index, request)
      const file = await admitBoundedDocumentFile(input)
      assertOperationNotAborted(input.signal)
      const handle = Object.freeze({ fingerprint: file.fingerprint }) as DocumentAdmission
      admissions.set(handle, { operation: identity, file, signal: input.signal, state: "admitted" })
      return handle
    },
    async readSelection(index: number, request: DocumentSelectionRequest): Promise<BoundedDocumentSnapshot> {
      const input = selection(index, request)
      const snapshot = await withOperationDocumentSnapshot(input, async ({ bytes, fingerprint }) => ownedDocumentSnapshot(bytes, fingerprint))
      assertOperationNotAborted(input.signal)
      return snapshot
    },
    async verifyAfterExternalRead(handle: DocumentAdmission): Promise<void> {
      assertOperationNotAborted(signal)
      const record = handle && typeof handle === "object" ? admissions.get(handle) : undefined
      if (!record || record.operation !== identity || record.state !== "admitted") invalidInput()
      assertOperationNotAborted(record.signal)
      record.state = "in_progress"
      try {
        await record.file.withSnapshot(async () => undefined)
        assertOperationNotAborted(record.signal)
        record.state = "completed"
      } catch (error) { record.state = "failed"; throw error }
    },
    snapshot: () => ledger.snapshot()
  })
}
