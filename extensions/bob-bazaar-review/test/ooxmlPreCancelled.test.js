"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const test = require("node:test")

async function source(relativePath) {
  return fs.readFile(path.join(__dirname, "..", ...relativePath.split("/")), "utf8")
}

function requireGuardsBeforeReadAndArchive(text, label) {
  const read = text.indexOf("const snapshot = await readBoundedDocumentFile(")
  const archive = text.indexOf("preflightOoxmlArchive({", read)
  const firstGuard = text.indexOf("throwIfCancelled(context.signal)")
  const secondGuard = text.indexOf("throwIfCancelled(context.signal)", firstGuard + 1)
  assert.ok(firstGuard >= 0 && firstGuard < read, `${label} must check cancellation before bounded read`)
  assert.ok(secondGuard > read && secondGuard < archive, `${label} must recheck cancellation before archive preflight`)
}

test("DOCX and XLSX reject pre-cancelled work before bounded read and archive inflation", async () => {
  requireGuardsBeforeReadAndArchive(
    await source("src/ruleAuthoring/extraction/docxExtractor.ts"),
    "DOCX"
  )
  requireGuardsBeforeReadAndArchive(
    await source("src/ruleAuthoring/extraction/xlsxExtractor.ts"),
    "XLSX"
  )
})

test("single and batch extraction check each request before fingerprinting", async () => {
  const text = await source("src/ruleAuthoring/extraction/documentExtractor.ts")
  const singleStart = text.indexOf("async function extractRuleDocumentWithContext(")
  const singleFingerprint = text.indexOf("const before = context.beforeFingerprint ?? await fingerprintSource(", singleStart)
  const singleGuard = text.indexOf("throwIfCancelled(request.signal)", singleStart)
  assert.ok(singleGuard > singleStart && singleGuard < singleFingerprint)

  const batchStart = text.indexOf("const fingerprinted = await Promise.all(requests.map(")
  const batchFingerprint = text.indexOf("const fingerprint = await fingerprintSource(", batchStart)
  const batchGuard = text.indexOf("throwIfCancelled(request.signal)", batchStart)
  assert.ok(batchGuard > batchStart && batchGuard < batchFingerprint)
})
