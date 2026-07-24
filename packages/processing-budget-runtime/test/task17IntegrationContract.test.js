"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const repositoryRoot = path.resolve(__dirname, "..", "..", "..")
const source = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8")

test("both external runners consume one absolute deadline and preserve termination cause", () => {
  for (const relativePath of [
    "extensions/bob-bazaar-review/src/bazaar/externalProcessRunner.ts",
    "extensions/bob-code-consistency-review/src/core/externalProcessRunner.ts"
  ]) {
    const runner = source(relativePath)
    assert.match(runner, /deadline: SharedAbsoluteDeadline/)
    assert.match(runner, /createCancellationScope/)
    assert.match(runner, /terminationCause/)
    assert.doesNotMatch(runner, /readonly timeoutMs:/)
    assert.doesNotMatch(runner, /setTimeout\(\s*\(\) => fail\("timeout"/)
  }
})

test("Code Consistency creates one operation deadline and passes it through every external layer", () => {
  const pipeline = source("extensions/bob-code-consistency-review/src/core/pipeline.ts")
  const diff = source("extensions/bob-code-consistency-review/src/core/gitDiffCollector.ts")
  const index = source("extensions/bob-code-consistency-review/src/evidenceScope/repositorySymbolIndexProducer.ts")
  assert.match(pipeline, /const deadline = .*createAbsoluteDeadline/)
  assert.match(pipeline, /createCancellationScope\(\{[\s\S]*deadline[\s\S]*signal: input\.abortSignal/)
  assert.match(pipeline, /budgetLedger: processingBudgetLedger,[\s\S]*deadline,[\s\S]*signal: cancellation\.signal/)
  assert.match(diff, /deadline\?: SharedAbsoluteDeadline/)
  assert.match(diff, /const deadline = options\.deadline \?\? createAbsoluteDeadline/)
  assert.match(diff, /createCancellationScope\(\{ deadline, signal: options\.signal \}\)/)
  assert.match(index, /deadline\?: SharedAbsoluteDeadline/)
  assert.match(index, /deadline: input\.deadline \?\? createAbsoluteDeadline/)
})

test("Bazaar client and PDF extraction convert timeout configuration once at their operation boundary", () => {
  const client = source("extensions/bob-bazaar-review/src/bazaar/bazaar.ts")
  const pdf = source("extensions/bob-bazaar-review/src/ruleAuthoring/extraction/pdfExtractor.ts")
  assert.match(client, /private readonly deadline: SharedAbsoluteDeadline/)
  assert.match(client, /options\.deadline \?\? createAbsoluteDeadline/)
  assert.match(client, /deadline: this\.deadline/)
  assert.match(pdf, /const deadline = options\.deadline \?\? createAbsoluteDeadline/)
  assert.match(pdf, /deadline,/)
})

test("long-lived MCP registries create Bazaar clients at the tool-call boundary", () => {
  const tools = source("extensions/bob-bazaar-review/src/mcp/tools.ts")
  assert.match(tools, /new BazaarClient\(this\.clientOptions\)/)
  assert.doesNotMatch(tools, /private readonly client = new BazaarClient/)
})

test("bounded document reads and archive preflight carry cancellation through both consumers", () => {
  const boundedFile = source("packages/processing-budget-runtime/runtime/bounded-file.js")
  const boundedArchive = source("packages/processing-budget-runtime/runtime/bounded-zip.js")
  const sourceHash = source("extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts")
  const bazaarDocuments = source("extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts")
  const docx = source("extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts")
  const xlsx = source("extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts")
  const consistencyDocuments = source("extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts")

  assert.match(boundedFile, /"maximumFileBytes", "signal"/)
  assert.match(boundedFile, /throwIfCancelled\(options\.signal\)/)
  assert.match(boundedArchive, /"maximumExpandedBytes", "signal"/)
  assert.match(boundedArchive, /throwIfCancelled\(options\.signal\)/)
  assert.match(sourceHash, /signal\?: SharedWorkbookBudgetCancellation/)
  assert.match(sourceHash, /signal: options\.signal/)
  assert.match(bazaarDocuments, /signal: context\.cancellation\.signal/)
  assert.match(bazaarDocuments, /signal: cancellation\.signal/)
  assert.match(docx, /maximumFileBytes: maxFileBytes,[\s\S]*signal: context\.signal/)
  assert.match(docx, /maximumExpandedBytes: maxExpandedBytes,[\s\S]*signal: context\.signal/)
  assert.match(xlsx, /maximumFileBytes: maxFileBytes,[\s\S]*signal: context\.signal/)
  assert.match(xlsx, /maximumExpandedBytes: maxExpandedBytes,[\s\S]*signal: context\.signal/)
  assert.match(consistencyDocuments, /maximumFileBytes: limits\.maxDocumentBytes,[\s\S]*signal/)
  assert.match(consistencyDocuments, /maximumExpandedBytes: ledger\.profile\.limits\.total_document_bytes,[\s\S]*signal/)
})

test("governed workspace and document paths share one physical containment policy", () => {
  const boundedFile = source("packages/processing-budget-runtime/runtime/bounded-file.js")
  const consistencyFileSystem = source("extensions/bob-code-consistency-review/src/core/fileSystem.ts")
  const consistencyResolver = source("extensions/bob-code-consistency-review/src/workspaceResolver.ts")
  const bazaarResolver = source("extensions/bob-bazaar-review/src/workspace/workspaceResolver.ts")
  assert.match(boundedFile, /require\("\.\/path-policy"\)/)
  assert.match(consistencyFileSystem, /normalizeWorkspaceRelativePath/)
  assert.match(consistencyFileSystem, /resolvePhysicalContainedPathSync/)
  assert.match(consistencyResolver, /selectDeepestPhysicalRoot/)
  assert.match(bazaarResolver, /selectDeepestPhysicalRoot/)
})
