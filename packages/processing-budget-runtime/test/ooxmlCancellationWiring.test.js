"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const repositoryRoot = path.resolve(__dirname, "..", "..", "..")
const source = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8")

function objectSource(text, marker) {
  const markerOffset = text.indexOf(marker)
  assert.notEqual(markerOffset, -1, `missing marker: ${marker}`)
  const start = text.indexOf("{", markerOffset)
  assert.notEqual(start, -1, `missing object after marker: ${marker}`)
  let depth = 0
  for (let offset = start; offset < text.length; offset += 1) {
    if (text[offset] === "{") depth += 1
    else if (text[offset] === "}" && --depth === 0) return text.slice(start, offset + 1)
  }
  assert.fail(`unterminated object after marker: ${marker}`)
}

test("OOXML preflight cancellation is exposed by the public facade and wired through every consumer", () => {
  const boundedIo = source("packages/processing-budget-runtime/src/boundedDocumentIo.ts")
  const bazaarShared = source("extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts")
  const consistencyShared = source("extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts")
  const docx = source("extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts")
  const xlsx = source("extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts")
  const consistencyDocuments = source("extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts")

  assert.match(
    objectSource(boundedIo, "export interface OoxmlArchivePreflightInput"),
    /readonly signal\?: BoundedDocumentCancellation/
  )
  assert.match(objectSource(boundedIo, "runtime.preflightOoxmlArchive("), /signal: input\.signal/)
  for (const shared of [bazaarShared, consistencyShared]) {
    assert.match(
      objectSource(shared, "preflightOoxmlArchive(input:"),
      /signal\?: SharedWorkbookBudgetCancellation/
    )
  }
  assert.match(objectSource(docx, "preflightOoxmlArchive("), /signal: context\.signal/)
  assert.match(objectSource(xlsx, "preflightOoxmlArchive("), /signal: context\.signal/)
  assert.match(
    consistencyDocuments,
    /preflightArchive\(snapshot, ledger, filePath, selectionId, "docx", limits, signal\)/
  )
  assert.match(
    consistencyDocuments,
    /preflightArchive\(snapshot, ledger, filePath, selectionId, "xlsx", limits, signal\)/
  )
  assert.match(
    objectSource(consistencyDocuments, "preflightOoxmlArchive("),
    /signal/
  )
})
