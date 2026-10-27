import { createHash } from "node:crypto"
import { BoundedDocumentError } from "./boundedDocumentError"
import { ProcessingBudgetError } from "./processingBudgetError"
import { ProcessingBudgetLedger, type ProcessingBudgetReservation } from "./processingBudgetLedger"

export interface WorkbookSheetBudget { readonly name: string; readonly rowCount: number }
export interface XlsxWorkbookInspection { readonly sheets: readonly { readonly name: string; readonly partName: string; readonly rowSpan: number }[] }
export interface WorkbookBudgetCommit {
  readonly sheetCount: number
  readonly totalRows: number
  readonly sheets: readonly { readonly name: string; readonly target: string; readonly rows: number }[]
}
export interface XlsxWorkbookBudgetCommit extends WorkbookBudgetCommit { readonly inspection: XlsxWorkbookInspection }
interface WorkbookBudgetInput {
  ledger: ProcessingBudgetLedger
  workbookTarget: string
  sheets: Iterable<WorkbookSheetBudget>
  cancellation?: () => void
}
interface XlsxWorkbookBudgetInput {
  ledger: ProcessingBudgetLedger
  workbookTarget: string
  inspection: XlsxWorkbookInspection
  headerRows: 0 | 1
  sheetTarget?: (sheetName: string, index: number) => string
  cancellation?: () => void
}
function invalid(): never { throw new ProcessingBudgetError("processing_budget_reservation_invalid", "workbook budget input invalid") }
function unsafe(): never { throw new BoundedDocumentError("bounded_document_archive_invalid", { phase: "zip" }) }
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid()
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) invalid()
  const descriptors = Object.getOwnPropertyDescriptors(value), allowed = new Set([...required, ...optional])
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== "string" || !allowed.has(key)) || required.some(key => !Object.hasOwn(descriptors, key))) invalid()
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key]
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) invalid()
    result[key] = descriptor.value
  }
  return result
}
function count(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid(); return value }
function arrayValues(value: unknown): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid()
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<string, PropertyDescriptor>
  const length: unknown = descriptors.length?.value
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || Reflect.ownKeys(descriptors).length !== length + 1) invalid()
  const output: unknown[] = []
  for (let index = 0; index < length; index++) {
    const descriptor = descriptors[String(index)]
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) invalid()
    output.push(descriptor.value)
  }
  return output
}
function name(value: unknown): string { if (typeof value !== "string" || value.length === 0) invalid(); return value }
function sum(left: number, right: number): number { if (right > Number.MAX_SAFE_INTEGER - left) invalid(); return left + right }
function sheetTarget(book: string, sheet: string, index: number): string {
  return "sheet-" + index + "-" + createHash("sha256").update(book).update("\0").update(String(index)).update("\0").update(sheet).digest("hex")
}
const ledgerProfile = Object.getOwnPropertyDescriptor(ProcessingBudgetLedger.prototype, "profile")?.get
function ledger(value: unknown): ProcessingBudgetLedger {
  if (!(value instanceof ProcessingBudgetLedger) || !ledgerProfile) invalid()
  try { ledgerProfile.call(value) } catch { invalid() }
  return value
}
function callback(value: unknown): (() => void) | undefined { if (value !== undefined && typeof value !== "function") invalid(); return value as (() => void) | undefined }

export function commitWorkbookBudget(value: WorkbookBudgetInput): WorkbookBudgetCommit {
  const data = record(value, ["ledger", "workbookTarget", "sheets"], ["cancellation"])
  const budget = ledger(data.ledger), workbookTarget = name(data.workbookTarget), cancellation = callback(data.cancellation)
  return commitGroup(budget, workbookTarget, data.sheets as Iterable<WorkbookSheetBudget>, cancellation)
}

function commitGroup(budget: ProcessingBudgetLedger, workbookTarget: string, source: Iterable<WorkbookSheetBudget>, cancellation?: () => void, customTarget?: (sheetName: string, index: number) => string): WorkbookBudgetCommit {
  const sheets: { name: string; rows: number; target: string }[] = [], names = new Set<string>(), targets = new Set<string>()
  let totalRows = 0
  cancellation?.()
  for (const item of source) {
    cancellation?.()
    const row = record(item, ["name", "rowCount"]), sheet = name(row.name), rows = count(row.rowCount)
    if (names.has(sheet)) invalid()
    names.add(sheet); totalRows = sum(totalRows, rows)
    const target = customTarget ? name(customTarget(sheet, sheets.length)) : sheetTarget(workbookTarget, sheet, sheets.length)
    if (targets.has(target)) invalid()
    targets.add(target); sheets.push({ name: sheet, rows, target })
  }
  const pending: ProcessingBudgetReservation[] = []
  try {
    cancellation?.()
    pending.push(budget.reserveForTarget("sheets_per_workbook", workbookTarget, sheets.length))
    for (const sheet of sheets) {
      cancellation?.()
      pending.push(budget.reserveForTarget("rows_per_sheet", sheet.target, sheet.rows))
    }
    cancellation?.()
  } catch (error) {
    for (let index = pending.length - 1; index >= 0; index--) { try { pending[index].release() } catch { /* Preserve the first failure. */ } }
    throw error
  }
  // Real ledger commits cannot fail after successful reservations; no await or
  // cancellation callback may split this group into partially admitted work.
  for (const reservation of pending) reservation.commit()
  return Object.freeze({ sheetCount: sheets.length, totalRows, sheets: Object.freeze(sheets.map(sheet => Object.freeze(sheet))) })
}

function inspectedSheets(value: XlsxWorkbookInspection): XlsxWorkbookInspection["sheets"] {
  const data = record(value, ["sheets"])
  const values = arrayValues(data.sheets)
  const names = new Set<string>(), parts = new Set<string>()
  return Object.freeze(values.map(value => {
    const row = record(value, ["name", "partName", "rowSpan"]), sheet = name(row.name), part = name(row.partName), rowSpan = count(row.rowSpan)
    if (names.has(sheet) || parts.has(part)) invalid()
    names.add(sheet); parts.add(part)
    return Object.freeze({ name: sheet, partName: part, rowSpan })
  }))
}

export function commitXlsxWorkbookBudget(value: XlsxWorkbookBudgetInput): XlsxWorkbookBudgetCommit {
  const data = record(value, ["ledger", "workbookTarget", "inspection", "headerRows"], ["sheetTarget", "cancellation"])
  if (data.headerRows !== 0 && data.headerRows !== 1) invalid()
  if (data.sheetTarget !== undefined && typeof data.sheetTarget !== "function") invalid()
  const sheets = inspectedSheets(data.inspection as XlsxWorkbookInspection), header = data.headerRows
  const inspection = Object.freeze({ sheets })
  const result = commitGroup(ledger(data.ledger), name(data.workbookTarget), sheets.map(sheet => ({ name: sheet.name, rowCount: Math.max(0, sheet.rowSpan - header) })), callback(data.cancellation), data.sheetTarget as ((name: string, index: number) => string) | undefined)
  return Object.freeze({ ...result, inspection })
}

export function assertParsedXlsxWorkbookWithinBudget(parsed: readonly { sheet: string; data: readonly unknown[] }[], inspection: XlsxWorkbookInspection): void {
  const inspected = inspectedSheets(inspection), expected = new Map(inspected.map(sheet => [sheet.name, sheet.rowSpan])), names = new Set<string>()
  if (!Array.isArray(parsed) || parsed.length > inspected.length) unsafe()
  for (const sheet of parsed) {
    if (!sheet || typeof sheet.sheet !== "string" || names.has(sheet.sheet) || !Array.isArray(sheet.data)) unsafe()
    names.add(sheet.sheet)
    const span = expected.get(sheet.sheet)
    if (span === undefined || sheet.data.length > span) unsafe()
  }
}

interface XmlTag { readonly name: string; readonly attributes: Readonly<Record<string, string>> }
interface SheetDeclaration { readonly name: string; readonly relationshipId: string }
interface Relationship { readonly target: string; readonly type: string; readonly external: boolean }
interface PartFacts { root: string; sheets: readonly SheetDeclaration[]; relationships: ReadonlyMap<string, Relationship>; rowSpan: number }
type Part = { facts: PartFacts } | { failed: true }

// Called only with entries already checked by the existing ZIP owner. Errors
// from unused candidate parts are deferred; bytes and decoded strings escape
// neither this callback nor its small structural facts.
export function createXlsxInspectionObserver(): { observeEntry(name: string, validatedBytes: Uint8Array): void; finish(): XlsxWorkbookInspection } {
  const parts = new Map<string, Part>()
  let finished = false
  return Object.freeze({
    observeEntry(entry: string, bytes: Uint8Array): void {
      if (finished || typeof entry !== "string" || parts.has(entry)) unsafe()
      try { parts.set(entry, { facts: inspectPart(entry, bytes) }) } catch { parts.set(entry, { failed: true }) }
    },
    finish(): XlsxWorkbookInspection {
      if (finished) unsafe()
      finished = true
      function required(entry: string, root: string): PartFacts {
        const part = parts.get(entry)
        if (!part || "failed" in part || part.facts.root !== root) unsafe()
        return part.facts
      }
      const declarations = required("xl/workbook.xml", "workbook").sheets
      const relationships = required("xl/_rels/workbook.xml.rels", "Relationships").relationships
      const names = new Set<string>(), ids = new Set<string>(), targets = new Set<string>()
      const sheets = declarations.map(sheet => {
        if (names.has(sheet.name) || ids.has(sheet.relationshipId)) unsafe()
        names.add(sheet.name); ids.add(sheet.relationshipId)
        const relationship = relationships.get(sheet.relationshipId)
        if (!relationship || relationship.external || !/\/worksheet$/.test(relationship.type)) unsafe()
        const target = resolveTarget("xl/workbook.xml", relationship.target)
        if (targets.has(target)) unsafe()
        targets.add(target)
        const rowSpan = required(target, "worksheet").rowSpan
        return Object.freeze({ name: sheet.name, partName: target, rowSpan })
      })
      return Object.freeze({ sheets: Object.freeze(sheets) })
    }
  })
}

function inspectPart(entry: string, bytes: Uint8Array): PartFacts {
  const sheets: SheetDeclaration[] = [], relationships = new Map<string, Relationship>()
  let row = 0, rowSpan = 0
  const root = scanXml(bytes, tag => {
    const local = localName(tag.name)
    if (entry === "xl/workbook.xml" && local === "sheet") {
      const ids = Object.entries(tag.attributes).filter(([key]) => localName(key) === "id").map(([, value]) => value)
      if (ids.length !== 1 || !ids[0]) unsafe()
      sheets.push(Object.freeze({ name: requiredAttribute(tag, "name"), relationshipId: ids[0] }))
    }
    if (entry === "xl/_rels/workbook.xml.rels" && local === "Relationship") {
      const id = requiredAttribute(tag, "Id")
      if (relationships.has(id)) unsafe()
      relationships.set(id, Object.freeze({ target: requiredAttribute(tag, "Target"), type: requiredAttribute(tag, "Type"), external: attribute(tag, "TargetMode")?.toLowerCase() === "external" }))
    }
    if (local === "row") {
      const explicit = attribute(tag, "r")
      row = explicit === undefined ? increment(row) : positiveDecimal(explicit)
      rowSpan = Math.max(rowSpan, row)
    } else if (local === "c") {
      const reference = attribute(tag, "r")
      if (reference !== undefined) {
        const match = /^[A-Za-z]+([1-9][0-9]*)$/.exec(reference)
        if (!match) unsafe()
        const cellRow = positiveDecimal(match[1])
        row = Math.max(row, cellRow); rowSpan = Math.max(rowSpan, cellRow)
      }
    }
  })
  return { root, sheets: Object.freeze(sheets), relationships, rowSpan }
}

function localName(value: string): string { return value.slice(value.lastIndexOf(":") + 1) }
function attribute(tag: XmlTag, name: string): string | undefined {
  const values = Object.entries(tag.attributes).filter(([key]) => localName(key) === name)
  if (values.length > 1) unsafe()
  return values[0]?.[1]
}
function requiredAttribute(tag: XmlTag, name: string): string { const value = attribute(tag, name); if (!value) unsafe(); return value }
function positiveDecimal(value: string): number { if (!/^[1-9][0-9]*$/.test(value)) unsafe(); const parsed = Number(value); if (!Number.isSafeInteger(parsed)) unsafe(); return parsed }
function increment(value: number): number { if (value >= Number.MAX_SAFE_INTEGER) unsafe(); return value + 1 }
function resolveTarget(base: string, target: string): string {
  if (!target || target.includes("\\") || /[?#\u0000-\u001f\u007f]/.test(target)) unsafe()
  const segments = target.startsWith("/") ? [] : base.split("/").slice(0, -1)
  for (const part of target.replace(/^\/+/, "").split("/")) {
    if (!part || part === ".") continue
    if (part === "..") { if (!segments.length) unsafe(); segments.pop() } else segments.push(part)
  }
  if (!segments.length) unsafe()
  return segments.join("/")
}

function xmlCharacters(value: string): void { if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(value)) unsafe() }
function entities(value: string): string {
  let output = "", offset = 0
  while (offset < value.length) {
    const amp = value.indexOf("&", offset)
    if (amp < 0) { output += value.slice(offset); break }
    output += value.slice(offset, amp)
    const end = value.indexOf(";", amp + 1)
    if (end < 0) unsafe()
    const entity = value.slice(amp + 1, end), named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }
    if (Object.hasOwn(named, entity)) output += named[entity]
    else {
      let point: number
      if (/^#[0-9]+$/.test(entity)) point = Number(entity.slice(1))
      else if (/^#x[0-9a-fA-F]+$/.test(entity)) point = Number.parseInt(entity.slice(2), 16)
      else unsafe()
      if (!Number.isSafeInteger(point) || point <= 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) unsafe()
      output += String.fromCodePoint(point)
    }
    offset = end + 1
  }
  xmlCharacters(output)
  return output
}
function terminator(xml: string, offset: number, token: string): number { const end = xml.indexOf(token, offset); if (end < 0) unsafe(); return end }
function tagEnd(xml: string, start: number): number {
  let quote: string | undefined
  for (let index = start; index < xml.length; index++) {
    const character = xml[index]
    if (quote !== undefined) { if (character === quote) quote = undefined }
    else if (character === '"' || character === "'") quote = character
    else if (character === ">") return index
    else if (character === "<") unsafe()
  }
  return unsafe()
}
function parseTag(source: string): { tag: XmlTag; closed: boolean } {
  let offset = 0
  const whitespace = () => { const start = offset; while (/[\t\r\n ]/.test(source[offset] ?? "") && offset < source.length) offset++; return offset > start }
  const readName = () => { const match = /^[A-Za-z_:][A-Za-z0-9_.:-]*/.exec(source.slice(offset)); if (!match) unsafe(); offset += match[0].length; return match[0] }
  const name = readName(), attributes: Record<string, string> = Object.create(null) as Record<string, string>
  let closed = false
  while (offset < source.length) {
    const separated = whitespace()
    if (offset === source.length) break
    if (source[offset] === "/") { closed = true; offset++; if (offset !== source.length) unsafe(); break }
    if (!separated) unsafe()
    const key = readName(); whitespace()
    if (source[offset++] !== "=") unsafe()
    whitespace(); const quote = source[offset++]
    if (quote !== '"' && quote !== "'") unsafe()
    const end = source.indexOf(quote, offset)
    if (end < 0 || Object.hasOwn(attributes, key)) unsafe()
    const raw = source.slice(offset, end)
    if (raw.includes("<")) unsafe()
    attributes[key] = entities(raw); offset = end + 1
  }
  return { tag: Object.freeze({ name, attributes: Object.freeze(attributes) }), closed }
}
function scanXml(bytes: Uint8Array, visit: (tag: XmlTag) => void): string {
  let xml: string
  try { xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes) } catch { return unsafe() }
  xmlCharacters(xml)
  const stack: string[] = []
  let offset = 0, root: string | undefined
  while (offset < xml.length) {
    const start = xml.indexOf("<", offset), text = xml.slice(offset, start < 0 ? xml.length : start)
    entities(text)
    if (!stack.length && text.trim()) unsafe()
    if (start < 0) { offset = xml.length; break }
    if (xml.startsWith("<!--", start)) { const end = terminator(xml, start + 4, "-->"); if (xml.slice(start + 4, end).includes("--")) unsafe(); offset = end + 3; continue }
    if (xml.startsWith("<![CDATA[", start)) { if (!stack.length) unsafe(); offset = terminator(xml, start + 9, "]]>") + 3; continue }
    if (xml.startsWith("<?", start)) { offset = terminator(xml, start + 2, "?>") + 2; continue }
    if (xml.startsWith("<!", start)) unsafe()
    const end = tagEnd(xml, start + 1), source = xml.slice(start + 1, end)
    if (source.startsWith("/")) {
      const match = /^\/([A-Za-z_:][A-Za-z0-9_.:-]*)[\t\r\n ]*$/.exec(source)
      if (!match || stack.pop() !== match[1]) unsafe()
    } else {
      const { tag, closed } = parseTag(source)
      if (!stack.length) { if (root !== undefined) unsafe(); root = localName(tag.name) }
      visit(tag)
      if (!closed) stack.push(tag.name)
    }
    offset = end + 1
  }
  if (stack.length || root === undefined) unsafe()
  return root
}
