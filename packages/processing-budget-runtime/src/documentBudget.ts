import { createAbsoluteDeadline, createCancellationScope, type AbsoluteProcessingDeadline, type ProcessingCancellationScope } from "./deadlineCancellation"
import { createHash } from "node:crypto"
import { admitBoundedDocumentFile, withOperationDocumentSnapshot, type AdmittedDocumentFile } from "./boundedDocumentFile"
import { ownedDocumentSnapshot, type BoundedDocumentSnapshot } from "./boundedDocumentIo"
import { assertOperationNotAborted, invalidInput, normalizeReadInput, ownData, validateSignal, type BoundedDocumentFingerprint, type BoundedDocumentReadInput } from "./boundedDocumentRequest"
import { ProcessingBudgetLedger, type ProcessingBudgetLedgerReport, type ProcessingBudgetReservation } from "./processingBudgetLedger"
import type { OperationScopedProcessingBudgetCategory } from "./generatedProcessingBudgetDefinition"
import { type ProcessingBudgetProfile } from "./processingBudgetProfile"
import { normalizeOoxmlStructuralLimits, prepareAdmittedOoxmlSnapshot, type OoxmlStructuralLimits, type XlsxZipCodec, type ValidatedOoxmlParserInput } from "./ooxmlParserInput"
import { commitXlsxWorkbookBudget, type XlsxWorkbookInspection } from "./workbookBudget"

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
export interface ProcessingOperationInput {
  readonly profile: ProcessingBudgetProfile
  readonly signal?: AbortSignal
  readonly signals?: readonly AbortSignal[]
  readonly deadline?: AbsoluteProcessingDeadline
}
export interface ProcessingOperation {
  readonly profile: ProcessingBudgetProfile
  readonly signal: AbortSignal
  readonly deadline: AbsoluteProcessingDeadline
  throwIfCancelled(): void
  dispose(): void
  snapshot(): Readonly<ProcessingBudgetLedgerReport>
  reserve(category: OperationScopedProcessingBudgetCategory, amount: number): ProcessingBudgetReservation
  documents(selectedDocumentCount: number): DocumentOperation
  assertDocuments(document: DocumentOperation): void
}
export interface DocumentOperationInput {
  readonly selectedDocumentCount: number
  readonly profile: ProcessingBudgetProfile
  readonly signal?: AbortSignal
}
export interface DocumentOperationBase {
  readonly profile: ProcessingBudgetProfile
  readonly selectedDocumentCount: number
  readonly signal: AbortSignal
  readonly deadline: AbsoluteProcessingDeadline
  dispose(): void
  fingerprintSelection(index: number, request: DocumentSelectionRequest): Promise<DocumentAdmission>
  readSelection(index: number, request: DocumentSelectionRequest): Promise<BoundedDocumentSnapshot>
  verifyAfterExternalRead(admission: DocumentAdmission): Promise<void>
  snapshot(): Readonly<ProcessingBudgetLedgerReport>
}
export type DocumentOoxmlOptions = { readonly structuralLimits: OoxmlStructuralLimits; readonly loadXlsxCodec: () => Promise<XlsxZipCodec> } &
  ({ readonly documentKind: "docx" } | { readonly documentKind: "xlsx"; readonly xlsxBudget: { readonly headerRows: 0 | 1 } })
export type BudgetedOoxmlParserInput = Omit<ValidatedOoxmlParserInput, "documentKind"> &
  ({ readonly documentKind: "docx" } | { readonly documentKind: "xlsx"; readonly workbookInspection: XlsxWorkbookInspection })
export interface DocumentOperation extends DocumentOperationBase {
  withValidatedOoxml<T>(admission: DocumentAdmission, options: DocumentOoxmlOptions, parse: (input: BudgetedOoxmlParserInput) => Promise<T>): Promise<T>
}
interface AdmissionRecord {
  readonly operation: symbol
  readonly file: AdmittedDocumentFile
  readonly signal?: AbortSignal
  readonly target: string
  state: "admitted" | "in_progress" | "completed" | "failed"
}
const admissions = new WeakMap<DocumentAdmission, AdmissionRecord>()
const processingOperations = new WeakSet<ProcessingOperation>()
const documentOwners = new WeakMap<DocumentOperation, symbol>()
const ownedDocumentDisposers = new WeakMap<DocumentOperation, () => void>()

export function assertDocumentNotCancelled(signal?: AbortSignal): void {
  assertOperationNotAborted(validateSignal(signal))
}

export function assertProcessingOperation(value: unknown): asserts value is ProcessingOperation {
  if (!value || typeof value !== "object" || !processingOperations.has(value as ProcessingOperation)) invalidInput()
}

export function createProcessingOperation(value: ProcessingOperationInput): ProcessingOperation {
  const input = ownData(value, ["profile"], ["signal", "signals", "deadline"])
  if (Object.hasOwn(input, "signal") && Object.hasOwn(input, "signals")) invalidInput()
  const source = validateSignal(input.signal)
  let sources: AbortSignal[] | undefined
  if (input.signals !== undefined) {
    if (!Array.isArray(input.signals)) invalidInput()
    sources = input.signals.map(item => { const signal = validateSignal(item); if (!signal) invalidInput(); return signal })
  }
  const scope = createCancellationScope({ deadline: input.deadline === undefined ? createAbsoluteDeadline(120000) : input.deadline as AbsoluteProcessingDeadline,
    ...(sources === undefined ? { signal: source } : { signals: sources }) })
  const children = new Set<ProcessingCancellationScope>()
  const dispose = (): void => { for (const child of children) child.dispose(); children.clear(); scope.dispose() }
  try {
    assertOperationNotAborted(scope.signal)
    const ledger = new ProcessingBudgetLedger(input.profile as ProcessingBudgetProfile)
    const identity = Symbol("processing operation")
    let document: DocumentOperation | undefined
    const operation: ProcessingOperation = Object.freeze({
      profile: ledger.profile, signal: scope.signal, deadline: scope.deadline,
      throwIfCancelled: () => assertOperationNotAborted(scope.signal), dispose,
      snapshot: () => ledger.snapshot(),
      reserve(category: OperationScopedProcessingBudgetCategory, amount: number): ProcessingBudgetReservation {
        assertOperationNotAborted(scope.signal)
        return ledger.reserve(category, amount)
      },
      documents(selectedDocumentCount: number): DocumentOperation {
        assertOperationNotAborted(scope.signal)
        if (document || !Number.isSafeInteger(selectedDocumentCount) || selectedDocumentCount < 0) invalidInput()
        ledger.reserve("document_count", selectedDocumentCount).commit()
        document = createOwnedDocumentOperation(selectedDocumentCount, ledger, scope, source === undefined && !sources?.length, children)
        documentOwners.set(document, identity)
        return document
      },
      assertDocuments(candidate: DocumentOperation): void {
        assertOperationNotAborted(scope.signal)
        if (documentOwners.get(candidate) !== identity) invalidInput()
      }
    })
    processingOperations.add(operation)
    return operation
  } catch (error) { dispose(); throw error }
}

export function createDocumentOperation(value: DocumentOperationInput): DocumentOperation {
  const input = ownData(value, ["selectedDocumentCount", "profile"], ["signal"])
  const signal = validateSignal(input.signal)
  assertOperationNotAborted(signal)
  const countValue = input.selectedDocumentCount
  if (typeof countValue !== "number" || !Number.isSafeInteger(countValue) || countValue < 0) invalidInput()
  const owner = createProcessingOperation({ profile: input.profile as ProcessingBudgetProfile, signal })
  try {
    const document = owner.documents(countValue)
    ownedDocumentDisposers.set(document, () => owner.dispose())
    return document
  } catch (error) { owner.dispose(); throw error }
}

function createOwnedDocumentOperation(count: number, ledger: ProcessingBudgetLedger, control: ProcessingCancellationScope, allowSelectionSignal: boolean, children: Set<ProcessingCancellationScope>): DocumentOperation {
  const identity = Symbol("document operation"), used = new Set<number>(), signal = control.signal
  const selectionScopes = new Map<AbortSignal, ProcessingCancellationScope>()
  function releaseSelection(selectedSignal: AbortSignal | undefined): void {
    if (!selectedSignal) return
    const child = selectionScopes.get(selectedSignal)
    if (child) { child.dispose(); children.delete(child); selectionScopes.delete(selectedSignal) }
  }

  function selection(index: number, value: DocumentSelectionRequest): BoundedDocumentReadInput {
    assertOperationNotAborted(signal)
    if (!Number.isSafeInteger(index) || index < 0 || index >= count || used.has(index)) invalidInput()
    used.add(index)
    const data = ownData(value, ["filePath", "rootPath", "maximumFileBytes"], ["signal"])
    let effectiveSignal = signal
    if (allowSelectionSignal && data.signal !== undefined) {
      const selected = validateSignal(data.signal)
      if (selected && selected !== signal) {
        const child = createCancellationScope({ deadline: control.deadline, signals: [signal, selected] })
        children.add(child); selectionScopes.set(child.signal, child); effectiveSignal = child.signal
      }
    }
    try {
      assertOperationNotAborted(effectiveSignal)
      // Validate before hashing so path coercion and inherited getters never run.
      const normalized = normalizeReadInput({ ...data, signal: effectiveSignal, ledger, target: "selection" } as unknown as BoundedDocumentReadInput)
      const digest = createHash("sha256").update(normalized.rootPath).update("\0").update(normalized.filePath).digest("hex")
      return Object.freeze({ ...normalized, target: `document-${index}-${digest}` })
    } catch (error) { releaseSelection(effectiveSignal); throw error }
  }

  async function consumeAdmission<T>(handle: DocumentAdmission, consume: (snapshot: { bytes: Buffer; fingerprint: BoundedDocumentFingerprint }, record: AdmissionRecord) => Promise<T>): Promise<T> {
    assertOperationNotAborted(signal)
    const record = handle && typeof handle === "object" ? admissions.get(handle) : undefined
    if (!record || record.operation !== identity || record.state !== "admitted") invalidInput()
    record.state = "in_progress"
    try {
      assertOperationNotAborted(record.signal)
      const result = await record.file.withSnapshot(snapshot => consume(snapshot, record))
      assertOperationNotAborted(record.signal)
      record.state = "completed"
      return result
    } catch (error) { record.state = "failed"; assertOperationNotAborted(record.signal); throw error }
    finally { releaseSelection(record.signal) }
  }

  const document: DocumentOperation = Object.freeze({
    profile: ledger.profile, selectedDocumentCount: count, signal, deadline: control.deadline,
    dispose: () => ownedDocumentDisposers.get(document)?.(),
    async fingerprintSelection(index: number, request: DocumentSelectionRequest): Promise<DocumentAdmission> {
      const input = selection(index, request)
      let admitted = false
      try {
        const file = await admitBoundedDocumentFile(input)
        assertOperationNotAborted(input.signal)
        const handle = Object.freeze({ fingerprint: file.fingerprint }) as DocumentAdmission
        admissions.set(handle, { operation: identity, file, signal: input.signal, target: input.target, state: "admitted" })
        admitted = true
        return handle
      } finally { if (!admitted) releaseSelection(input.signal) }
    },
    async readSelection(index: number, request: DocumentSelectionRequest): Promise<BoundedDocumentSnapshot> {
      const input = selection(index, request)
      try {
        const snapshot = await withOperationDocumentSnapshot(input, async ({ bytes, fingerprint }) => ownedDocumentSnapshot(bytes, fingerprint))
        assertOperationNotAborted(input.signal)
        return snapshot
      } finally { releaseSelection(input.signal) }
    },
    async verifyAfterExternalRead(handle: DocumentAdmission): Promise<void> {
      return consumeAdmission(handle, async () => undefined)
    },
    async withValidatedOoxml<T>(handle: DocumentAdmission, value: DocumentOoxmlOptions, parse: (input: BudgetedOoxmlParserInput) => Promise<T>): Promise<T> {
      assertOperationNotAborted(signal)
      const options = ownData(value, ["documentKind", "structuralLimits", "loadXlsxCodec"], ["xlsxBudget"])
      const kind = options.documentKind
      if ((kind !== "docx" && kind !== "xlsx") || typeof options.loadXlsxCodec !== "function" || typeof parse !== "function") invalidInput()
      const structuralLimits = normalizeOoxmlStructuralLimits(options.structuralLimits)
      let headerRows: 0 | 1 | undefined
      if (kind === "xlsx") {
        const budget = ownData(options.xlsxBudget, ["headerRows"])
        if (budget.headerRows !== 0 && budget.headerRows !== 1) invalidInput()
        headerRows = budget.headerRows
      } else if (Object.hasOwn(options, "xlsxBudget")) invalidInput()
      const loadCodec = options.loadXlsxCodec as () => Promise<XlsxZipCodec>
      return consumeAdmission(handle, async ({ bytes }, record) => {
        const onWorkbook = headerRows === undefined ? undefined : (inspection: XlsxWorkbookInspection) => {
          commitXlsxWorkbookBudget({ ledger, workbookTarget: record.target, inspection, headerRows, cancellation: () => assertOperationNotAborted(record.signal) })
        }
        const prepared = await prepareAdmittedOoxmlSnapshot(bytes, kind, structuralLimits, loadCodec, record.signal, onWorkbook)
        assertOperationNotAborted(record.signal)
        let input: BudgetedOoxmlParserInput
        if (kind === "xlsx") {
          if (!prepared.workbookInspection) invalidInput()
          input = Object.freeze({ ...prepared, documentKind: "xlsx", workbookInspection: prepared.workbookInspection })
        } else input = Object.freeze({ documentKind: "docx", parserInput: prepared.parserInput, normalization: prepared.normalization })
        const result = await parse(input)
        assertOperationNotAborted(record.signal)
        return result
      })
    },
    snapshot: () => ledger.snapshot()
  })
  return document
}
