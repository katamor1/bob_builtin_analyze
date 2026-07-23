"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const packageRoot = path.resolve(__dirname, "..")
const repositoryRoot = path.resolve(packageRoot, "..", "..")

function text(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8")
}

function packageJson(extension) {
  return JSON.parse(text(`extensions/${extension}/package.json`))
}

test("both document extensions compile and copy the same shared runtime", () => {
  for (const extension of ["bob-bazaar-review", "bob-code-consistency-review"]) {
    const compile = packageJson(extension).scripts.compile
    assert.match(compile, /tsc -p \.\.\/\.\.\/packages\/processing-budget-runtime/)
    assert.match(compile, /copy-bounded-document-runtime\.js/)
    assert.match(compile, /copy-extension-runtime\.js out\/shared-processing-budget-runtime/)
    const wrapper = text(`extensions/${extension}/src/sharedProcessingBudgetRuntime.ts`)
    assert.match(wrapper, /require\("\.\/shared-processing-budget-runtime"\)/)
    assert.match(wrapper, /maximumArchiveBytes\?: number/)
  }
})

test("Bazaar DOCX and XLSX parse only bounded snapshot bytes", () => {
  const coordinator = text("extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts")
  const docx = text("extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts")
  const xlsx = text("extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts")
  const fingerprint = text("extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts")
  for (const source of [docx, xlsx]) {
    assert.match(source, /readBoundedDocumentFile/)
    assert.match(source, /preflightOoxmlArchive/)
    assert.match(source, /snapshot\.copyBytes\(\)/)
    assert.match(source, /snapshot\.assertCurrent\(\)/)
  }
  assert.match(docx, /convertToHtml\(\s*\{ buffer:/)
  assert.doesNotMatch(docx, /convertToHtml\(\s*\{ path:/)
  assert.match(xlsx, /readExcelFile\.default\(Buffer\.from\(snapshot\.copyBytes\(\)\)\)/)
  assert.match(fingerprint, /readBoundedDocumentFile/)
  assert.doesNotMatch(fingerprint, /createReadStream|readFile/)
  const fingerprintCalls = coordinator.match(/fingerprintSource\(absolutePath, \{\s*maximumBytes: (?:limits|effectiveLimits)\.maxSourceBytes\s*\}\)/g) ?? []
  assert.equal(fingerprintCalls.length, 3)
})

test("consistency review removes governed stat/read truncation and parses shared bytes", () => {
  const coordinator = text("extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts")
  const docx = text("extensions/bob-code-consistency-review/src/analyzers/documentDocxExtractor.ts")
  const xlsx = text("extensions/bob-code-consistency-review/src/analyzers/documentXlsxExtractor.ts")
  assert.match(coordinator, /readBoundedDocumentFile/)
  assert.match(coordinator, /preflightOoxmlArchive/)
  assert.match(coordinator, /snapshot\.assertCurrent\(\)/)
  assert.doesNotMatch(coordinator, /fs\.stat|fs\.open|readLimitedTextFile|assertDocumentWithinByteLimit/)
  assert.match(docx, /convertToHtml\(\{ buffer: Buffer\.from\(documentBytes\) \}\)/)
  assert.doesNotMatch(docx, /convertToHtml\(\{ path:/)
  assert.match(xlsx, /readExcelFile\.default\(Buffer\.from\(documentBytes\)\)/)
})

test("runtime package contains copy-only byte APIs and no source fallback", () => {
  const facade = text("packages/processing-budget-runtime/src/boundedDocumentIo.ts")
  const publicRuntime = text("packages/processing-budget-runtime/runtime/bounded-document-runtime.js")
  const boundedFile = text("packages/processing-budget-runtime/runtime/bounded-file.js")
  const boundedZip = text("packages/processing-budget-runtime/runtime/bounded-zip.js")
  assert.match(facade, /copyBytes\(\): Uint8Array/)
  assert.match(facade, /copyEntry\(name: string\): Uint8Array \| undefined/)
  assert.match(facade, /maximumArchiveBytes\?: number/)
  assert.match(publicRuntime, /archiveBytes\.byteLength > maximumArchiveBytes/)
  assert.ok(publicRuntime.indexOf("archiveBytes.byteLength > maximumArchiveBytes") < publicRuntime.indexOf("archive.preflightOoxmlArchive"))
  assert.match(boundedFile, /reserveForTarget\("single_document_bytes"/)
  assert.match(boundedFile, /Buffer\.alloc\(size\)/)
  assert.match(boundedZip, /inflateRawSync\(compressed, \{ maxOutputLength:/)
  assert.match(boundedZip, /archive_crc_mismatch/)
  assert.doesNotMatch(`${boundedFile}\n${boundedZip}`, /readFileSync\([^)]*repository|process\.cwd\(\).*src/)
})
