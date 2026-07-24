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
