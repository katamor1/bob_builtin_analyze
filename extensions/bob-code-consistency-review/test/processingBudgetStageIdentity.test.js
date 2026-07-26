"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const test = require("node:test")

test("pipeline refreshes failed-report identity after every completed materialization stage", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "src", "core", "pipeline.ts"), "utf8")
  for (const expected of [
    /refreshInputSha\(\{\}\)/,
    /refreshInputSha\(\{ diff \}\)/,
    /if \(repositoryIndexBuild\) refreshInputSha\(\{ repositoryIndexBuild \}\)/,
    /refreshInputSha\(\{ documents \}\)/,
    /refreshInputSha\(\{ codeAnalysis \}\)/,
    /refreshInputSha\(\{\s*contextBudgetArtifact: contextBudget\.artifact,\s*contextWarnings: contextBudget\.warnings\s*\}\)/,
    /refreshInputSha\(\{ traceability \}\)/
  ]) assert.match(source, expected)

  const ordered = [
    "const diff = await collectGitDiff",
    "refreshInputSha({ diff })",
    "const repositoryIndexBuild =",
    "refreshInputSha({ repositoryIndexBuild })",
    "const documents = await extractDocuments",
    "refreshInputSha({ documents })",
    "const codeAnalysis = await analyzeCodeChanges",
    "refreshInputSha({ codeAnalysis })",
    "const contextBudget = await buildReviewContextBudget",
    "contextBudgetArtifact: contextBudget.artifact",
    "const upstreamLedger = await updateArtifactLedger",
    "const traceability = await buildTraceability",
    "refreshInputSha({ traceability })"
  ].map((token) => source.indexOf(token))

  assert.ok(ordered.every((position) => position >= 0))
  assert.deepEqual(ordered, [...ordered].sort((left, right) => left - right))
})

test("pipeline accumulates immutable materialized input before recomputing the SHA", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "src", "core", "pipeline.ts"), "utf8")
  assert.match(source, /let materializedInputs: MaterializedProcessingInputs = Object\.freeze\(\{\}\)/)
  assert.match(source, /materializedInputs = Object\.freeze\(\{ \.\.\.materializedInputs, \.\.\.completed \}\)/)
  assert.match(source, /materialized: materializedInputs/)
})
