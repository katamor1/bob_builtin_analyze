"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", ...relativePath.split("/")), "utf8")
}

test("both command-palette review operations use the processing coverage gate and workspace scope", () => {
  const commands = source("src/bazaar/bazaarReviewCommands.ts")
  assert.equal((commands.match(/runBazaarReviewProcessingOperation\(/g) ?? []).length, 2)
  assert.equal((commands.match(/repositoryScope: bazaarFolder\.uri\.fsPath/g) ?? []).length, 2)
  assert.equal((commands.match(/showAndOfferBobContext\(/g) ?? []).length, 3)
  assert.match(commands, /const result = await runBazaarReviewProcessingOperation\([\s\S]*await showAndOfferBobContext\([\s\S]*result\.packet/)
  assert.match(commands, /BazaarProcessingCoveragePartialError/)
})

test("GUI persists failure and does not record or hand off a packet before complete coverage", () => {
  const gui = source("src/ui/reviewGui.ts")
  const gate = gui.indexOf("result = await runBazaarReviewProcessingOperation(")
  const persistFailure = gui.indexOf("recordReviewPacketProcessingFailure(reviewRun, error)")
  const record = gui.indexOf("const completedReviewRun = await recordReviewPacket(reviewRun, result.packet)")
  const handoff = gui.indexOf("addResult = await addPacketToBobContext(doc.uri, result.packet)")
  assert.ok(gate >= 0)
  assert.ok(persistFailure > gate)
  assert.ok(record > persistFailure)
  assert.ok(handoff > record)
  assert.doesNotMatch(gui.slice(gate, record), /recordReviewPacket\(reviewRun, result\.packet\)/)
})

test("coverage boundary derives a physical report scope from prepared root when a caller omits it", () => {
  const coverage = source("src/bazaar/bazaarProcessingCoverage.ts")
  assert.match(coverage, /requestedRepositoryScope === undefined[\s\S]*normalizeRepositoryScope\(product\.prepared\.root\)/)
  assert.match(coverage, /operationInputSha\(preparedRepositoryScope/)
  assert.match(coverage, /BAZAAR_REVIEW_BOB_INPUT_DEFAULT_BYTES = DEFAULT_PROCESSING_BUDGET_PROFILE\.limits\.bob_input_bytes/)
  assert.match(coverage, /BAZAAR_REVIEW_BOB_INPUT_MAX_BYTES = PROCESSING_BUDGET_ABSOLUTE_MAXIMA\.bob_input_bytes/)
})

test("partial coverage reports target, processed bytes, and original observation", () => {
  const coverage = source("src/bazaar/bazaarProcessingCoverage.ts")
  assert.match(coverage, /category: "raw_diff_bytes"[\s\S]*target: "bazaar-diff"[\s\S]*processed: boundedDiffBytes[\s\S]*observed: originalDiffBytes/)
  assert.match(coverage, /category: "document_excerpt_bytes"[\s\S]*target: "bazaar-added-files"/)
  assert.match(coverage, /assertProcessingBudgetReportAllowsHandoff\(/)
})
