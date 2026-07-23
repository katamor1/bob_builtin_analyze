"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

class Reservation {
  constructor(ledger, debits, amount) {
    this.ledger = ledger
    this.debits = debits
    this.amount = amount
    this.open = true
  }
  commit(actual = this.amount) {
    assert.equal(this.open, true)
    assert.equal(actual, this.amount)
    for (const { state } of this.debits) {
      state.reserved -= this.amount
      state.committed += actual
    }
    this.open = false
  }
  release() {
    assert.equal(this.open, true)
    for (const { state } of this.debits) state.reserved -= this.amount
    this.open = false
  }
}

class Ledger {
  constructor(limits) {
    this.limits = limits
    this.operation = new Map()
    this.targets = new Map()
  }
  state(map, key) {
    let state = map.get(key)
    if (!state) {
      state = { committed: 0, reserved: 0 }
      map.set(key, state)
    }
    return state
  }
  reserveForTarget(category, target, amount) {
    const aggregate = category === "sheets_per_workbook" ? "total_sheets" : "total_rows"
    const targetState = this.state(this.targets, `${category}:${target}`)
    const aggregateState = this.state(this.operation, aggregate)
    const debits = [
      { category, state: targetState },
      { category: aggregate, state: aggregateState }
    ]
    for (const debit of debits) {
      const limit = this.limits[debit.category]
      const used = debit.state.committed + debit.state.reserved
      if (amount > limit - used) {
        throw Object.assign(new Error(`${debit.category} exceeded`), {
          code: "processing_budget_exceeded",
          details: Object.freeze({
            targetCategory: category,
            target,
            constrainedCategory: debit.category,
            limit,
            observed: used + amount
          })
        })
      }
    }
    for (const debit of debits) debit.state.reserved += amount
    return new Reservation(this, debits, amount)
  }
  snapshot() {
    return {
      totalSheets: this.state(this.operation, "total_sheets").committed,
      totalRows: this.state(this.operation, "total_rows").committed,
      reservedSheets: this.state(this.operation, "total_sheets").reserved,
      reservedRows: this.state(this.operation, "total_rows").reserved
    }
  }
}

function archive(entries) {
  const map = new Map(Object.entries(entries).map(([name, value]) => [name, Buffer.from(value)]))
  return Object.freeze({
    entries: Object.freeze([...map].map(([name, bytes]) => Object.freeze({
      name,
      directory: false,
      compression_method: 0,
      compressed_bytes: bytes.length,
      expanded_bytes: bytes.length,
      crc32: "00000000"
    }))),
    copyEntry(name) {
      const value = map.get(name)
      return value ? Uint8Array.from(value) : undefined
    }
  })
}

function workbookArchive(sheets) {
  const workbookSheets = sheets.map((sheet, index) =>
    `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  ).join("")
  const relationships = sheets.map((sheet, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join("")
  const entries = {
    "xl/workbook.xml": `<?xml version="1.0"?><workbook xmlns:r="urn:r"><sheets>${workbookSheets}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships>${relationships}</Relationships>`
  }
  for (const [index, sheet] of sheets.entries()) entries[`xl/worksheets/sheet${index + 1}.xml`] = sheet.xml
  return archive(entries)
}

function runtime() {
  return require("../out/workbookBudget.js")
}

const limits = {
  sheets_per_workbook: 20,
  total_sheets: 100,
  rows_per_sheet: 500,
  total_rows: 25_000
}

test("inspects worksheet relationships and sparse row indexes before committing workbook budgets", () => {
  const ledger = new Ledger(limits)
  const result = runtime().commitXlsxWorkbookBudget({
    ledger,
    workbookTarget: "book-a",
    archive: workbookArchive([
      { name: "Visible", xml: `<worksheet><sheetData><!-- <row r="999"/> --><row r="2"><c r="A2"/></row><row><c r="B7"/></row></sheetData></worksheet>` },
      { name: "日本語", xml: `<worksheet><sheetData><row r="3"/></sheetData></worksheet>` }
    ])
  })

  assert.deepEqual(result, {
    sheetCount: 2,
    rowCount: 10,
    sheets: [
      { name: "Visible", entryName: "xl/worksheets/sheet1.xml", rows: 7 },
      { name: "日本語", entryName: "xl/worksheets/sheet2.xml", rows: 3 }
    ]
  })
  assert.deepEqual(ledger.snapshot(), { totalSheets: 2, totalRows: 10, reservedSheets: 0, reservedRows: 0 })
})

test("rejects a sparse worksheet limit before any parser can be called and rolls back the workbook reservation", () => {
  const ledger = new Ledger({ ...limits, rows_per_sheet: 5, total_rows: 100 })
  const before = ledger.snapshot()
  assert.throws(
    () => runtime().commitXlsxWorkbookBudget({
      ledger,
      workbookTarget: "book-sparse",
      archive: workbookArchive([{ name: "Sparse", xml: `<worksheet><sheetData><row r="6"/></sheetData></worksheet>` }])
    }),
    (error) => error.code === "processing_budget_exceeded"
      && error.details.targetCategory === "rows_per_sheet"
      && error.details.constrainedCategory === "rows_per_sheet"
      && error.details.limit === 5
      && error.details.observed === 6
  )
  assert.deepEqual(ledger.snapshot(), before)
})

test("rejects external worksheet relationships and DTD/entity declarations", () => {
  const ledger = new Ledger(limits)
  const external = archive({
    "xl/workbook.xml": `<workbook xmlns:r="urn:r"><sheets><sheet name="x" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" TargetMode="External" Target="https://example.invalid/x.xml"/></Relationships>`
  })
  assert.throws(
    () => runtime().commitXlsxWorkbookBudget({ ledger, workbookTarget: "external", archive: external }),
    (error) => error.code === "xlsx_relationship_invalid"
  )

  const dtd = workbookArchive([{ name: "x", xml: `<!DOCTYPE worksheet [<!ENTITY x "boom">]><worksheet><sheetData><row/></sheetData></worksheet>` }])
  assert.throws(
    () => runtime().commitXlsxWorkbookBudget({ ledger: new Ledger(limits), workbookTarget: "dtd", archive: dtd }),
    (error) => error.code === "xlsx_xml_unsafe"
  )
})

test("cancellation while scanning worksheet rows releases all pending reservations", () => {
  const controller = new AbortController()
  const ledger = new Ledger(limits)
  const source = workbookArchive([{ name: "cancel", xml: `<worksheet><sheetData>${"<row/>".repeat(20)}</sheetData></worksheet>` }])
  let reads = 0
  const cancellable = {
    entries: source.entries,
    copyEntry(name) {
      reads += 1
      const value = source.copyEntry(name)
      if (name.includes("sheet1")) controller.abort(new Error("operator cancelled"))
      return value
    }
  }
  const before = ledger.snapshot()
  assert.throws(
    () => runtime().commitXlsxWorkbookBudget({ ledger, workbookTarget: "cancel", archive: cancellable, signal: controller.signal }),
    /operator cancelled/
  )
  assert.ok(reads >= 3)
  assert.deepEqual(ledger.snapshot(), before)
})

test("validates parsed workbook materialization against the precommitted inspection", () => {
  const inspection = {
    sheetCount: 1,
    rowCount: 3,
    sheets: [{ name: "Sheet1", entryName: "xl/worksheets/sheet1.xml", rows: 3 }]
  }
  assert.doesNotThrow(() => runtime().assertParsedXlsxWorkbookWithinBudget(inspection, [
    { sheet: "Sheet1", data: [[1], [2], [3]] }
  ]))
  assert.throws(
    () => runtime().assertParsedXlsxWorkbookWithinBudget(inspection, [
      { sheet: "Sheet1", data: [[1], [2], [3], [4]] }
    ]),
    (error) => error.code === "xlsx_parser_budget_mismatch"
  )
})

test("budgets data rows separately while retaining the full parser row span", () => {
  const ledger = new Ledger({ ...limits, rows_per_sheet: 2, total_rows: 2 })
  const inspection = runtime().commitXlsxWorkbookBudget({
    ledger,
    workbookTarget: "header-aware",
    archive: workbookArchive([{ name: "Sheet1", xml: `<worksheet><sheetData><row r="1"/><row r="2"/><row r="3"/></sheetData></worksheet>` }]),
    rowsToBudget: (sheet) => Math.max(0, sheet.rows - 1)
  })

  assert.equal(inspection.rowCount, 2)
  assert.equal(inspection.sheets[0].rows, 3)
  assert.deepEqual(ledger.snapshot(), { totalSheets: 1, totalRows: 2, reservedSheets: 0, reservedRows: 0 })
  assert.doesNotThrow(() => runtime().assertParsedXlsxWorkbookWithinBudget(inspection, [
    { sheet: "Sheet1", data: [["header"], ["one"], ["two"]] }
  ]))
})

test("accounts for implicit rows following a sparse explicit row before parser materialization", () => {
  const ledger = new Ledger({ ...limits, rows_per_sheet: 200, total_rows: 200 })
  const result = runtime().commitXlsxWorkbookBudget({
    ledger,
    workbookTarget: "mixed-row-index",
    archive: workbookArchive([{ name: "Mixed", xml: `<worksheet><sheetData><row r="100"/><row/><row/></sheetData></worksheet>` }])
  })

  assert.equal(result.sheets[0].rows, 102)
  assert.equal(result.rowCount, 102)
})

test("rejects duplicate parsed sheet names against the precommitted inspection", () => {
  const inspection = {
    sheetCount: 2,
    rowCount: 4,
    sheets: [
      { name: "Sheet1", entryName: "xl/worksheets/sheet1.xml", rows: 2 },
      { name: "Sheet2", entryName: "xl/worksheets/sheet2.xml", rows: 2 }
    ]
  }
  assert.throws(
    () => runtime().assertParsedXlsxWorkbookWithinBudget(inspection, [
      { sheet: "Sheet1", data: [[1], [2]] },
      { sheet: "Sheet1", data: [[3], [4]] }
    ]),
    (error) => error.code === "xlsx_parser_budget_mismatch"
  )
})

function sheetBudgetRows(prefix, count, rows) {
  return Array.from({ length: count }, (_, index) => ({ target: `${prefix}:${index}`, rows }))
}

test("enforces every default workbook, sheet, and row boundary at exact and plus-one values", () => {
  const localSheets = new Ledger(limits)
  assert.equal(runtime().commitWorkbookBudget({ ledger: localSheets, workbookTarget: "default-local-sheets", sheets: sheetBudgetRows("dls", 20, 0) }).sheetCount, 20)
  assert.throws(
    () => runtime().commitWorkbookBudget({ ledger: new Ledger(limits), workbookTarget: "default-local-sheets-over", sheets: sheetBudgetRows("dlso", 21, 0) }),
    (error) => error.code === "processing_budget_exceeded" && error.details.constrainedCategory === "sheets_per_workbook" && error.details.limit === 20 && error.details.observed === 21
  )

  assert.equal(runtime().commitWorkbookBudget({ ledger: new Ledger(limits), workbookTarget: "default-local-rows", sheets: [{ target: "dlr", rows: 500 }] }).rowCount, 500)
  assert.throws(
    () => runtime().commitWorkbookBudget({ ledger: new Ledger(limits), workbookTarget: "default-local-rows-over", sheets: [{ target: "dlro", rows: 501 }] }),
    (error) => error.code === "processing_budget_exceeded" && error.details.constrainedCategory === "rows_per_sheet" && error.details.limit === 500 && error.details.observed === 501
  )

  const totalSheets = new Ledger(limits)
  for (let index = 0; index < 5; index += 1) {
    runtime().commitWorkbookBudget({ ledger: totalSheets, workbookTarget: `default-total-sheets-${index}`, sheets: sheetBudgetRows(`dts${index}`, 20, 0) })
  }
  assert.equal(totalSheets.snapshot().totalSheets, 100)
  assert.throws(
    () => runtime().commitWorkbookBudget({ ledger: totalSheets, workbookTarget: "default-total-sheets-over", sheets: [{ target: "dtso", rows: 0 }] }),
    (error) => error.code === "processing_budget_exceeded" && error.details.constrainedCategory === "total_sheets" && error.details.limit === 100 && error.details.observed === 101
  )

  const totalRows = new Ledger(limits)
  for (const [index, count] of [20, 20, 10].entries()) {
    runtime().commitWorkbookBudget({ ledger: totalRows, workbookTarget: `default-total-rows-${index}`, sheets: sheetBudgetRows(`dtr${index}`, count, 500) })
  }
  assert.equal(totalRows.snapshot().totalRows, 25_000)
  assert.throws(
    () => runtime().commitWorkbookBudget({ ledger: totalRows, workbookTarget: "default-total-rows-over", sheets: [{ target: "dtro", rows: 1 }] }),
    (error) => error.code === "processing_budget_exceeded" && error.details.constrainedCategory === "total_rows" && error.details.limit === 25_000 && error.details.observed === 25_001
  )
})

test("enforces every absolute workbook, sheet, and row boundary at exact and plus-one values", () => {
  const absolute = { sheets_per_workbook: 100, total_sheets: 1_000, rows_per_sheet: 5_000, total_rows: 250_000 }
  assert.equal(runtime().commitWorkbookBudget({ ledger: new Ledger(absolute), workbookTarget: "absolute-local-sheets", sheets: sheetBudgetRows("als", 100, 0) }).sheetCount, 100)
  assert.throws(
    () => runtime().commitWorkbookBudget({ ledger: new Ledger(absolute), workbookTarget: "absolute-local-sheets-over", sheets: sheetBudgetRows("also", 101, 0) }),
    (error) => error.code === "processing_budget_exceeded" && error.details.constrainedCategory === "sheets_per_workbook" && error.details.limit === 100 && error.details.observed === 101
  )
  assert.equal(runtime().commitWorkbookBudget({ ledger: new Ledger(absolute), workbookTarget: "absolute-local-rows", sheets: [{ target: "alr", rows: 5_000 }] }).rowCount, 5_000)
  assert.throws(
    () => runtime().commitWorkbookBudget({ ledger: new Ledger(absolute), workbookTarget: "absolute-local-rows-over", sheets: [{ target: "alro", rows: 5_001 }] }),
    (error) => error.code === "processing_budget_exceeded" && error.details.constrainedCategory === "rows_per_sheet" && error.details.limit === 5_000 && error.details.observed === 5_001
  )

  const totalSheets = new Ledger(absolute)
  for (let index = 0; index < 10; index += 1) {
    runtime().commitWorkbookBudget({ ledger: totalSheets, workbookTarget: `absolute-total-sheets-${index}`, sheets: sheetBudgetRows(`ats${index}`, 100, 0) })
  }
  assert.equal(totalSheets.snapshot().totalSheets, 1_000)
  assert.throws(
    () => runtime().commitWorkbookBudget({ ledger: totalSheets, workbookTarget: "absolute-total-sheets-over", sheets: [{ target: "atso", rows: 0 }] }),
    (error) => error.code === "processing_budget_exceeded" && error.details.constrainedCategory === "total_sheets" && error.details.limit === 1_000 && error.details.observed === 1_001
  )

  const totalRows = new Ledger(absolute)
  runtime().commitWorkbookBudget({ ledger: totalRows, workbookTarget: "absolute-total-rows", sheets: sheetBudgetRows("atr", 50, 5_000) })
  assert.equal(totalRows.snapshot().totalRows, 250_000)
  assert.throws(
    () => runtime().commitWorkbookBudget({ ledger: totalRows, workbookTarget: "absolute-total-rows-over", sheets: [{ target: "atro", rows: 1 }] }),
    (error) => error.code === "processing_budget_exceeded" && error.details.constrainedCategory === "total_rows" && error.details.limit === 250_000 && error.details.observed === 250_001
  )
})
