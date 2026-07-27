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

test("single and batch extraction reject cancellation before fingerprinting", async () => {
  const text = await source("src/ruleAuthoring/extraction/documentExtractor.ts")
  const singleStart = text.indexOf("async function extractRuleDocumentWithContext(")
  const singleFingerprint = text.indexOf("const before = context.beforeFingerprint ?? await fingerprintSource(", singleStart)
  const singleGuard = text.indexOf("context.cancellation.throwIfCancelled()", singleStart)
  assert.ok(singleGuard > singleStart && singleGuard < singleFingerprint)

  const batchStart = text.indexOf("export async function extractRuleDocuments(")
  const firstFingerprint = text.indexOf("const fingerprint = await fingerprintSource(", batchStart)
  const sharedSignal = text.indexOf("signal: sharedRequestSignal(requests)", batchStart)
  const scopeGuard = text.indexOf("cancellation.throwIfCancelled()", batchStart)
  assert.ok(sharedSignal > batchStart && sharedSignal < firstFingerprint)
  assert.ok(scopeGuard > sharedSignal && scopeGuard < firstFingerprint)

  const perRequestGuard = text.lastIndexOf("cancellation.throwIfCancelled()", firstFingerprint)
  assert.ok(perRequestGuard >= scopeGuard && perRequestGuard < firstFingerprint)
})
