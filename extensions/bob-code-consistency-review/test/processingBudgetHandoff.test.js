"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  persistProcessingBudgetReport
} = require("../out/core/processingBudgetCoverage")
const {
  loadAndAssertCompleteProcessingBudgetReport,
  persistCompleteProcessingBudgetBinding
} = require("../out/core/processingBudgetReportGuard")
const {
  preprocessReviewWithCoverage
} = require("../out/core/preprocessCoverageBoundary")
const {
  computeManagedReviewPackageContentHash
} = require("../out/core/reviewPackageBuilder")
const {
  validateProcessingBudgetReport
} = require("../out/sharedProcessingBudgetReport")
const {
  ProcessingBudgetLedger
} = require("../out/sharedProcessingBudgetRuntime")

const INPUT_SHA = `sha256:${"c".repeat(64)}`

async function packageFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "processing-budget-handoff-"))
  const packageDir = path.join(root, ".bob-review", "review-package")
  await fs.mkdir(packageDir, { recursive: true })
  await fs.writeFile(path.join(packageDir, "bob-input.md"), "complete input\n", "utf8")
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return packageDir
}

async function persistComplete(packageDir) {
  const ledger = new ProcessingBudgetLedger()
  ledger.reserve("bob_input_bytes", 15).commit()
  const persisted = await persistProcessingBudgetReport({
    outDir: packageDir,
    operationId: "code-consistency-preprocess:test",
    inputSha256: INPUT_SHA,
    outcome: "success",
    ledger
  })
  await persistCompleteProcessingBudgetBinding({
    outDir: packageDir,
    reportInputSha256: INPUT_SHA,
    packageContentSha256: await computeManagedReviewPackageContentHash(packageDir)
  })
  return persisted
}

test("complete bound report permits later review stages", async (t) => {
  const packageDir = await packageFixture(t)
  const persisted = await persistComplete(packageDir)
  const loaded = await loadAndAssertCompleteProcessingBudgetReport(packageDir)
  assert.equal(loaded.reportPath, persisted.reportPath)
  assert.equal(loaded.report.input_sha256, INPUT_SHA)
  assert.equal(loaded.report.coverage_status, "complete")
})

test("package mutation makes an otherwise complete report stale", async (t) => {
  const packageDir = await packageFixture(t)
  await persistComplete(packageDir)
  await fs.writeFile(path.join(packageDir, "bob-input.md"), "mutated input\n", "utf8")
  await assert.rejects(
    () => loadAndAssertCompleteProcessingBudgetReport(packageDir),
    (error) => error?.code === "processing_budget_report_stale"
  )
})

test("partial report remains ineligible even when a matching binding is present", async (t) => {
  const packageDir = await packageFixture(t)
  const ledger = new ProcessingBudgetLedger()
  ledger.reserve("raw_diff_bytes", 10).commit()
  await persistProcessingBudgetReport({
    outDir: packageDir,
    operationId: "code-consistency-preprocess:partial",
    inputSha256: INPUT_SHA,
    outcome: "success",
    ledger,
    issues: [{
      kind: "truncation",
      code: "raw_diff_truncated",
      category: "raw_diff_bytes",
      target: "raw_diff_bytes",
      processed: 10,
      observed: 11,
      unprocessed: 1
    }]
  })
  await persistCompleteProcessingBudgetBinding({
    outDir: packageDir,
    reportInputSha256: INPUT_SHA,
    packageContentSha256: await computeManagedReviewPackageContentHash(packageDir)
  })
  await assert.rejects(
    () => loadAndAssertCompleteProcessingBudgetReport(packageDir),
    (error) => error?.code === "processing_budget_handoff_blocked"
  )
})

test("review-input validation failure removes stale package output and writes an empty-ledger failed report", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "processing-budget-prevalidation-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const inputPath = path.join(root, "review-input.yaml")
  const packageDir = path.join(root, ".bob-review", "review-package")
  await fs.mkdir(packageDir, { recursive: true })
  await fs.writeFile(inputPath, "review: [unterminated", "utf8")
  await fs.writeFile(path.join(packageDir, "bob-input.md"), "stale package\n", "utf8")

  await assert.rejects(() => preprocessReviewWithCoverage({
    workspaceRoot: root,
    inputPath,
    outDir: ".bob-review/review-package"
  }))

  await assert.rejects(() => fs.access(path.join(packageDir, "bob-input.md")))
  const reportPath = `${packageDir}.processing-budget-report.json`
  const report = validateProcessingBudgetReport(JSON.parse(await fs.readFile(reportPath, "utf8")))
  assert.equal(report.outcome, "failed")
  assert.equal(report.coverage_status, "failed")
  assert.match(report.input_sha256, /^sha256:[a-f0-9]{64}$/)
  assert.equal(report.issues[0].target, "review_input_validation")
  assert.ok(report.ledger.categories.every((entry) => entry.committed === 0 && entry.reserved === 0))
})

test("processing report and binding reads use no-follow opened-file identity checks", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "src", "core", "processingBudgetReportGuard.ts"), "utf8")
  assert.match(source, /fsConstants\.O_NOFOLLOW/)
  assert.match(source, /await fs\.open\(/)
  assert.match(source, /await handle\.stat\(\{ bigint: true \}\)/)
  assert.match(source, /assertStableOpenedFile/)
  assert.match(source, /new TextDecoder\("utf-8", \{ fatal: true \}\)/)
  assert.doesNotMatch(source, /await fs\.readFile\(filePath\)/)
})

test("review execution commands guard capture, validation, and triage", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "src", "reviewExecutionCommands.ts"), "utf8")
  const guards = source.match(/await loadAndAssertCompleteProcessingBudgetReport\(packageDir\)/g) ?? []
  assert.equal(guards.length, 3)
  assert.ok(source.indexOf(guards[0]) < source.indexOf("captureBobOutput({ workspaceRoot"))
  assert.ok(source.indexOf(guards[1], source.indexOf(guards[0]) + 1) < source.indexOf("validateBobOutput({ packageDir"))
  assert.ok(source.lastIndexOf(guards[2]) < source.indexOf("generateHumanTriage({ workspaceRoot"))
  assert.match(source, /preprocessReviewWithCoverage\(/)
})

test("coverage boundary clears stale package state and delegates to the core pipeline", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "src", "core", "preprocessCoverageBoundary.ts"), "utf8")
  assert.match(source, /await removeStaleProcessingBudgetReport\(outDir\)/)
  assert.match(source, /await cleanManagedReviewPackageOutputs\(outDir\)/)
  assert.match(source, /return await preprocessReview\(input\)/)
  assert.match(source, /target: "review_input_validation"/)
})

test("pipeline writes partial, failed, complete, and package-binding evidence", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "src", "core", "pipeline.ts"), "utf8")
  assert.match(source, /await removeStaleProcessingBudgetReport\(outDir\)/)
  assert.match(source, /prePackageIssues\.length > 0[\s\S]*persistProcessingBudgetReport\(/[\s\S]*new ProcessingCoveragePartialError/)
  assert.match(source, /buildCompleteReviewPackage\(/)
  assert.match(source, /outcome: outcomeFromProcessingError\(error\)/)
  assert.match(source, /persistCompleteProcessingBudgetBinding\(/)
  assert.match(source, /packageContentHash = await computeManagedReviewPackageContentHash\(outDir\)/)
  assert.match(source, /await removeProcessingBudgetReportBinding\(outDir\)/)
})
