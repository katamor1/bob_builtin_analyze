declare const require: (id: string) => unknown

const { TextDecoder } = require("node:util") as {
  TextDecoder: new (encoding?: string, options?: { fatal?: boolean }) => { decode(input?: Uint8Array): string }
}

export interface WorkbookBudgetReservation {
  commit(actualAmount?: number): void
  release(): void
}

export interface WorkbookBudgetLedger {
  reserveForTarget(
    category: "sheets_per_workbook" | "rows_per_sheet",
    target: string,
    amount: number
  ): WorkbookBudgetReservation
}

export interface WorkbookBudgetSheet {
  readonly target: string
  readonly rows: number
}

export interface WorkbookBudgetCancellation {
  readonly aborted: boolean
  readonly reason?: unknown
}

export interface WorkbookBudgetInput {
  readonly ledger: WorkbookBudgetLedger
  readonly workbookTarget: string
  readonly sheets: readonly WorkbookBudgetSheet[]
  readonly signal?: WorkbookBudgetCancellation
}

export interface WorkbookBudgetCommit {
  readonly sheetCount: number
  readonly rowCount: number
}

export interface WorkbookBudgetArchiveEntry {
  readonly name: string
  readonly directory: boolean
}

export interface WorkbookBudgetArchive {
  readonly entries: readonly WorkbookBudgetArchiveEntry[]
  copyEntry(name: string): Uint8Array | undefined
}

export interface XlsxWorkbookBudgetSheet {
  readonly name: string
  readonly entryName: string
  readonly rows: number
}

export interface XlsxWorkbookBudgetCommit extends WorkbookBudgetCommit {
  readonly sheets: readonly XlsxWorkbookBudgetSheet[]
}

export interface XlsxWorkbookBudgetInput {
  readonly ledger: WorkbookBudgetLedger
  readonly workbookTarget: string
  readonly archive: WorkbookBudgetArchive
  readonly signal?: WorkbookBudgetCancellation
  readonly rowsToBudget?: (sheet: XlsxWorkbookBudgetSheet, index: number) => number
  readonly sheetTarget?: (sheet: XlsxWorkbookBudgetSheet, index: number) => string
}

export interface ParsedXlsxWorkbookSheet {
  readonly sheet: string
  readonly data: readonly (readonly unknown[])[]
}

interface XmlStartTag {
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
}

interface WorkbookSheetDeclaration {
  readonly name: string
  readonly relationshipId: string
}

interface WorkbookRelationship {
  readonly id: string
  readonly target: string
  readonly type: string
  readonly external: boolean
}

export function commitWorkbookBudget(input: WorkbookBudgetInput): WorkbookBudgetCommit {
  const reservations: WorkbookBudgetReservation[] = []
  let rowCount = 0
  try {
    throwIfCancelled(input.signal)
    const sheetCount = input.sheets.length
    if (!Number.isSafeInteger(sheetCount)) {
      throw new Error("workbook sheet count must be a non-negative safe integer")
    }
    reservations.push(input.ledger.reserveForTarget("sheets_per_workbook", input.workbookTarget, sheetCount))

    for (const sheet of input.sheets) {
      throwIfCancelled(input.signal)
      const target = sheet.target
      const rows = sheet.rows
      throwIfCancelled(input.signal)
      if (!Number.isSafeInteger(rows) || rows < 0) {
        throw new Error("workbook sheet rows must be a non-negative safe integer")
      }
      if (rows > Number.MAX_SAFE_INTEGER - rowCount) {
        throw new Error("workbook row total must be a non-negative safe integer")
      }
      rowCount += rows
      reservations.push(input.ledger.reserveForTarget("rows_per_sheet", target, rows))
    }

    throwIfCancelled(input.signal)
    for (const reservation of reservations) reservation.commit()
    return Object.freeze({ sheetCount, rowCount })
  } catch (error) {
    for (let index = reservations.length - 1; index >= 0; index -= 1) {
      try { reservations[index].release() } catch {}
    }
    throw error
  }
}

/**
 * Inspects the already bounded OOXML snapshot and commits sheet/row budgets
 * before a workbook parser is allowed to materialize its cell arrays.
 */
export function commitXlsxWorkbookBudget(input: XlsxWorkbookBudgetInput): XlsxWorkbookBudgetCommit {
  throwIfCancelled(input.signal)
  const workbookXml = requiredEntry(input.archive, "xl/workbook.xml", input.signal)
  const relationshipsXml = requiredEntry(input.archive, "xl/_rels/workbook.xml.rels", input.signal)
  const declarations = parseWorkbookSheets(workbookXml, input.signal)
  const relationships = parseWorkbookRelationships(relationshipsXml, input.signal)
  const sheets: XlsxWorkbookBudgetSheet[] = []
  const seenEntries = new Set<string>()

  for (const [index, declaration] of declarations.entries()) {
    throwIfCancelled(input.signal)
    const relationship = relationships.get(declaration.relationshipId)
    if (!relationship || relationship.external || !isWorksheetRelationship(relationship.type)) {
      throw xlsxError(
        "xlsx_relationship_invalid",
        `worksheet relationship ${boundedEcho(declaration.relationshipId)} is missing, external, or not a worksheet`
      )
    }
    const entryName = resolvePackageTarget("xl/workbook.xml", relationship.target)
    if (seenEntries.has(entryName)) {
      throw xlsxError("xlsx_relationship_invalid", `worksheet entry is referenced more than once: ${boundedEcho(entryName)}`)
    }
    seenEntries.add(entryName)
    const worksheetXml = requiredEntry(input.archive, entryName, input.signal)
    const rows = inspectWorksheetRows(worksheetXml, input.signal)
    sheets.push(Object.freeze({ name: declaration.name, entryName, rows }))
    throwIfCancelled(input.signal)
    void index
  }

  const sheetTargets = sheets.map((sheet, index) => ({
    target: input.sheetTarget?.(sheet, index) ?? `${input.workbookTarget}:sheet:${index}`,
    rows: input.rowsToBudget?.(sheet, index) ?? sheet.rows
  }))
  const committed = commitWorkbookBudget({
    ledger: input.ledger,
    workbookTarget: input.workbookTarget,
    sheets: sheetTargets,
    signal: input.signal
  })
  return Object.freeze({
    ...committed,
    sheets: Object.freeze(sheets)
  })
}

/**
 * Guards against a parser interpreting the same bounded bytes as more sheets
 * or a larger row span than the pre-parser OOXML inspection committed.
 */
export function assertParsedXlsxWorkbookWithinBudget(
  inspection: XlsxWorkbookBudgetCommit,
  parsedSheets: readonly ParsedXlsxWorkbookSheet[]
): void {
  if (parsedSheets.length > inspection.sheetCount) {
    throw xlsxError(
      "xlsx_parser_budget_mismatch",
      `XLSX parser materialized ${parsedSheets.length} sheets after ${inspection.sheetCount} were budgeted`
    )
  }
  const byName = new Map<string, XlsxWorkbookBudgetSheet>()
  for (const sheet of inspection.sheets) {
    if (byName.has(sheet.name)) {
      throw xlsxError("xlsx_parser_budget_mismatch", `budget inspection contains duplicate sheet name ${boundedEcho(sheet.name)}`)
    }
    byName.set(sheet.name, sheet)
  }
  const parsedNames = new Set<string>()
  for (const parsed of parsedSheets) {
    if (parsedNames.has(parsed.sheet)) {
      throw xlsxError("xlsx_parser_budget_mismatch", `XLSX parser returned duplicate sheet ${boundedEcho(parsed.sheet)}`)
    }
    parsedNames.add(parsed.sheet)
    const inspected = byName.get(parsed.sheet)
    if (!inspected || parsed.data.length > inspected.rows) {
      throw xlsxError(
        "xlsx_parser_budget_mismatch",
        `XLSX parser materialized an unbudgeted sheet or row span for ${boundedEcho(parsed.sheet)}`
      )
    }
  }
}

function parseWorkbookSheets(bytes: Uint8Array, signal: WorkbookBudgetCancellation | undefined): WorkbookSheetDeclaration[] {
  const sheets: WorkbookSheetDeclaration[] = []
  scanXml(bytes, signal, (tag) => {
    if (localName(tag.name) !== "sheet") return
    const name = requiredAttribute(tag, "name", "xlsx_workbook_invalid")
    const relationshipIds = Object.entries(tag.attributes)
      .filter(([attribute]) => localName(attribute) === "id" && attribute !== "sheetId")
      .map(([, value]) => value)
    if (relationshipIds.length !== 1) {
      throw xlsxError("xlsx_workbook_invalid", "workbook sheet must declare exactly one relationship id")
    }
    sheets.push(Object.freeze({ name, relationshipId: relationshipIds[0] }))
  })
  return sheets
}

function parseWorkbookRelationships(
  bytes: Uint8Array,
  signal: WorkbookBudgetCancellation | undefined
): Map<string, WorkbookRelationship> {
  const relationships = new Map<string, WorkbookRelationship>()
  scanXml(bytes, signal, (tag) => {
    if (localName(tag.name) !== "Relationship") return
    const id = requiredAttribute(tag, "Id", "xlsx_relationship_invalid")
    if (relationships.has(id)) {
      throw xlsxError("xlsx_relationship_invalid", `duplicate workbook relationship ${boundedEcho(id)}`)
    }
    relationships.set(id, Object.freeze({
      id,
      target: requiredAttribute(tag, "Target", "xlsx_relationship_invalid"),
      type: requiredAttribute(tag, "Type", "xlsx_relationship_invalid"),
      external: optionalAttribute(tag, "TargetMode")?.toLowerCase() === "external"
    }))
  })
  return relationships
}

function inspectWorksheetRows(bytes: Uint8Array, signal: WorkbookBudgetCancellation | undefined): number {
  let currentRow = 0
  let maximumReferencedRow = 0
  scanXml(bytes, signal, (tag) => {
    const element = localName(tag.name)
    if (element === "row") {
      const explicitRow = optionalAttribute(tag, "r")
      currentRow = explicitRow === undefined
        ? safeIncrement(currentRow, "worksheet row index")
        : positiveDecimal(explicitRow, "row r")
      maximumReferencedRow = Math.max(maximumReferencedRow, currentRow)
    } else if (element === "c") {
      const reference = optionalAttribute(tag, "r")
      if (reference !== undefined) {
        const match = /^[A-Za-z]{1,4}([1-9][0-9]*)$/.exec(reference)
        if (!match) throw xlsxError("xlsx_worksheet_invalid", `invalid cell reference ${boundedEcho(reference)}`)
        const cellRow = positiveDecimal(match[1], "cell row")
        currentRow = Math.max(currentRow, cellRow)
        maximumReferencedRow = Math.max(maximumReferencedRow, cellRow)
      }
    }
  })
  return maximumReferencedRow
}

function scanXml(
  bytes: Uint8Array,
  signal: WorkbookBudgetCancellation | undefined,
  visit: (tag: XmlStartTag) => void
): void {
  let xml: string
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw xlsxError("xlsx_xml_invalid", "XLSX XML entry is not valid UTF-8")
  }
  let offset = 0
  let scans = 0
  while (offset < xml.length) {
    if ((scans++ & 0x3ff) === 0) throwIfCancelled(signal)
    const start = xml.indexOf("<", offset)
    if (start < 0) break
    if (xml.startsWith("<!--", start)) {
      offset = requiredTerminator(xml, start + 4, "-->", "XML comment")
      continue
    }
    if (xml.startsWith("<![CDATA[", start)) {
      offset = requiredTerminator(xml, start + 9, "]]>", "XML CDATA")
      continue
    }
    if (xml.startsWith("<?", start)) {
      offset = requiredTerminator(xml, start + 2, "?>", "XML processing instruction")
      continue
    }
    const declarationPrefix = xml.slice(start, Math.min(xml.length, start + 10)).toUpperCase()
    if (declarationPrefix.startsWith("<!DOCTYPE") || declarationPrefix.startsWith("<!ENTITY")) {
      throw xlsxError("xlsx_xml_unsafe", "XLSX XML must not contain DTD or entity declarations")
    }
    if (xml.startsWith("<!", start)) {
      throw xlsxError("xlsx_xml_unsafe", "XLSX XML contains an unsupported declaration")
    }
    const end = findTagEnd(xml, start + 1)
    if (xml[start + 1] !== "/") visit(parseStartTag(xml.slice(start + 1, end)))
    offset = end + 1
  }
  throwIfCancelled(signal)
}

function parseStartTag(source: string): XmlStartTag {
  let offset = 0
  skipWhitespace()
  const name = readName()
  const attributes: Record<string, string> = Object.create(null) as Record<string, string>
  while (true) {
    skipWhitespace()
    if (offset >= source.length || source[offset] === "/") break
    const attribute = readName()
    skipWhitespace()
    if (source[offset] !== "=") throw xlsxError("xlsx_xml_invalid", "XML attribute is missing '='")
    offset += 1
    skipWhitespace()
    const quote = source[offset]
    if (quote !== '"' && quote !== "'") throw xlsxError("xlsx_xml_invalid", "XML attribute must be quoted")
    offset += 1
    const end = source.indexOf(quote, offset)
    if (end < 0) throw xlsxError("xlsx_xml_invalid", "XML attribute quote is not terminated")
    if (Object.hasOwn(attributes, attribute)) throw xlsxError("xlsx_xml_invalid", `duplicate XML attribute ${boundedEcho(attribute)}`)
    attributes[attribute] = decodeXmlAttribute(source.slice(offset, end))
    offset = end + 1
  }
  return Object.freeze({ name, attributes: Object.freeze(attributes) })

  function skipWhitespace(): void {
    while (offset < source.length && /[\t\r\n ]/.test(source[offset])) offset += 1
  }
  function readName(): string {
    const start = offset
    if (offset >= source.length || !/[A-Za-z_:]/.test(source[offset])) {
      throw xlsxError("xlsx_xml_invalid", "XML name is invalid")
    }
    offset += 1
    while (offset < source.length && /[A-Za-z0-9_.:-]/.test(source[offset])) offset += 1
    return source.slice(start, offset)
  }
}

function findTagEnd(xml: string, offset: number): number {
  let quote: string | undefined
  for (let index = offset; index < xml.length; index += 1) {
    const character = xml[index]
    if (quote !== undefined) {
      if (character === quote) quote = undefined
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === ">") {
      return index
    }
  }
  throw xlsxError("xlsx_xml_invalid", "XML tag is not terminated")
}

function decodeXmlAttribute(value: string): string {
  let output = ""
  let offset = 0
  while (offset < value.length) {
    const ampersand = value.indexOf("&", offset)
    if (ampersand < 0) return output + value.slice(offset)
    output += value.slice(offset, ampersand)
    const semicolon = value.indexOf(";", ampersand + 1)
    if (semicolon < 0) throw xlsxError("xlsx_xml_invalid", "XML entity reference is not terminated")
    const entity = value.slice(ampersand + 1, semicolon)
    output += decodeEntity(entity)
    offset = semicolon + 1
  }
  return output
}

function decodeEntity(entity: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }
  if (Object.hasOwn(named, entity)) return named[entity]
  let codePoint: number
  if (/^#[0-9]+$/.test(entity)) codePoint = Number(entity.slice(1))
  else if (/^#x[0-9A-Fa-f]+$/.test(entity)) codePoint = Number.parseInt(entity.slice(2), 16)
  else throw xlsxError("xlsx_xml_unsafe", `unsupported XML entity &${boundedEcho(entity)};`)
  if (!Number.isSafeInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff
    || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    throw xlsxError("xlsx_xml_invalid", "XML numeric entity is outside Unicode scalar range")
  }
  return String.fromCodePoint(codePoint)
}

function resolvePackageTarget(baseEntry: string, target: string): string {
  if (!target || target.includes("\\") || /[?#\u0000-\u001f\u007f]/.test(target)) {
    throw xlsxError("xlsx_relationship_invalid", "worksheet relationship target is unsafe")
  }
  const segments = target.startsWith("/")
    ? []
    : baseEntry.split("/").slice(0, -1)
  for (const segment of target.replace(/^\/+/, "").split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      if (segments.length === 0) throw xlsxError("xlsx_relationship_invalid", "worksheet relationship escapes package root")
      segments.pop()
    } else {
      segments.push(segment)
    }
  }
  const output = segments.join("/")
  if (!output) throw xlsxError("xlsx_relationship_invalid", "worksheet relationship target is empty")
  return output
}

function requiredEntry(
  archive: WorkbookBudgetArchive,
  name: string,
  signal: WorkbookBudgetCancellation | undefined
): Uint8Array {
  throwIfCancelled(signal)
  const value = archive.copyEntry(name)
  throwIfCancelled(signal)
  if (value === undefined) throw xlsxError("xlsx_entry_missing", `XLSX archive entry is missing: ${boundedEcho(name)}`)
  return value
}

function requiredAttribute(tag: XmlStartTag, name: string, code: string): string {
  const value = optionalAttribute(tag, name)
  if (value === undefined || value.length === 0) throw xlsxError(code, `XML ${localName(tag.name)} is missing ${name}`)
  return value
}

function optionalAttribute(tag: XmlStartTag, name: string): string | undefined {
  if (Object.hasOwn(tag.attributes, name)) return tag.attributes[name]
  const matches = Object.entries(tag.attributes).filter(([key]) => localName(key) === name)
  if (matches.length > 1) throw xlsxError("xlsx_xml_invalid", `XML attribute ${name} is ambiguous`)
  return matches[0]?.[1]
}

function localName(name: string): string {
  return name.slice(name.lastIndexOf(":") + 1)
}

function isWorksheetRelationship(type: string): boolean {
  return /\/relationships\/worksheet$/.test(type)
}

function positiveDecimal(value: string, label: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) throw xlsxError("xlsx_worksheet_invalid", `${label} is not a positive decimal`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw xlsxError("xlsx_worksheet_invalid", `${label} exceeds safe integer range`)
  return parsed
}

function safeIncrement(value: number, label: string): number {
  if (value >= Number.MAX_SAFE_INTEGER) throw xlsxError("xlsx_worksheet_invalid", `${label} exceeds safe integer range`)
  return value + 1
}

function requiredTerminator(xml: string, offset: number, terminator: string, label: string): number {
  const end = xml.indexOf(terminator, offset)
  if (end < 0) throw xlsxError("xlsx_xml_invalid", `${label} is not terminated`)
  return end + terminator.length
}

function xlsxError(code: string, message: string): Error & { readonly code: string } {
  return Object.assign(new Error(message), { code })
}

function boundedEcho(value: string): string {
  const characters = [...value]
  return characters.length <= 96 ? value : `${characters.slice(0, 96).join("")}…`
}

function throwIfCancelled(signal: WorkbookBudgetCancellation | undefined): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new Error("workbook enumeration was cancelled")
}
