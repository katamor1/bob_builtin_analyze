"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  coverageIssuesFromWarnings,
  persistProcessingBudgetReport,
  processingBudgetReportPath
} = require("../out/core/processingBudgetCoverage")
const {
  loadAndAssertCompleteProcessingBudgetReport,
  persistCompleteProcessingBudgetBinding,
  processingBudgetReportBindingPath,
  withCompleteProcessingBudgetReport
} = require("../out/core/processingBudgetReportGuard")
const {
  preprocessReviewWithCoverage
} = require("../out/core/preprocessCoverageBoundary")
const {
  readVerifiedReviewPackage
} = require("../out/core/verifiedReviewPackage")
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
    packageContentSha256: (await readVerifiedReviewPackage(packageDir)).contentHash
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

test("guarded consumers read the retained snapshot when the original package changes", async (t) => {
  const packageDir = await packageFixture(t)
  await persistComplete(packageDir)

  const text = await withCompleteProcessingBudgetReport(packageDir, async (verifiedPackageDir) => {
    await fs.writeFile(path.join(packageDir, "bob-input.md"), "mutated original\n", "utf8")
    return fs.readFile(path.join(verifiedPackageDir, "bob-input.md"), "utf8")
  })

  assert.equal(text, "complete input\n")
  await assert.rejects(
    () => loadAndAssertCompleteProcessingBudgetReport(packageDir),
    (error) => error?.code === "processing_budget_report_stale"
  )
})

test("guarded consumers fail when their verified snapshot is changed during use", async (t) => {
  const packageDir = await packageFixture(t)
  await persistComplete(packageDir)

  await assert.rejects(
    () => withCompleteProcessingBudgetReport(packageDir, async (verifiedPackageDir) => {
      const inputPath = path.join(verifiedPackageDir, "bob-input.md")
      await fs.chmod(inputPath, 0o600)
      await fs.writeFile(inputPath, "tampered verified bytes\n", "utf8")
      return "should-not-commit"
    }),
    (error) => error?.code === "processing_budget_report_stale"
      || /does not match verified bytes/u.test(error?.message ?? "")
  )
})

test("every evidence-loss warning family produces partial coverage", () => {
  const ledger = new ProcessingBudgetLedger()
  ledger.reserve("raw_diff_bytes", 10).commit()
  ledger.reserve("document_excerpt_bytes", 20).commit()
  ledger.reserve("bob_input_bytes", 30).commit()
  const issues = coverageIssuesFromWarnings({
    ledger,
    diffWarnings: ["unified diff exceeded maxRawDiffBytes (11 > 10); raw diff truncated."],
    documentWarnings: [
      "document excerpts exhausted aggregate maxBobInputBytes / document_excerpt_bytes (20); remaining excerpts skipped.",
      "failed to extract docs/requirements.md: source changed"
    ],
    codeWarnings: [
      "src/large.cpp exceeded maxDocumentBytes (100 > 50); detailed C/C++ source analysis skipped.",
      "code evidence exceeded maximum item count (500); remaining code evidence skipped."
    ],
    repositoryWarnings: ["repository index producer unsupported review languages omitted: cobol"],
    contextWarnings: ["project rule pack unavailable"],
    traceabilityWarnings: ["traceability row omitted"],
    ledgerWarnings: ["artifact observation missing"],
    packageWarnings: ["bob-input.md exceeded bob_input_bytes (31 > 30); optional sections truncated."]
  })
  assert.deepEqual(new Set(issues.map((issue) => issue.code)), new Set([
    "raw_diff_truncated",
    "document_excerpt_truncated",
    "document_evidence_incomplete",
    "code_evidence_incomplete",
    "repository_evidence_incomplete",
    "context_evidence_incomplete",
    "traceability_evidence_incomplete",
    "artifact_ledger_incomplete",
    "bob_input_truncated"
  ]))
  assert.ok(issues.every((issue) => issue.kind === "truncation" || issue.kind === "unprocessed"))
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

test("symlinked processing report is rejected before JSON parsing", {
  skip: process.platform === "win32" ? "file symlink creation is not a portable unprivileged Windows fixture" : false
}, async (t) => {
  const packageDir = await packageFixture(t)
  await persistComplete(packageDir)
  const reportPath = processingBudgetReportPath(packageDir)
  const physicalPath = `${reportPath}.physical`
  await fs.rename(reportPath, physicalPath)
  await fs.symlink(physicalPath, reportPath)
  await assert.rejects(
    () => loadAndAssertCompleteProcessingBudgetReport(packageDir),
    /unsafe|hard-linked|ELOOP/u
  )
})

test("hard-linked processing report is rejected", async (t) => {
  const packageDir = await packageFixture(t)
  await persistComplete(packageDir)
  const reportPath = processingBudgetReportPath(packageDir)
  await fs.link(reportPath, `${reportPath}.second-link`)
  await assert.rejects(
    () => loadAndAssertCompleteProcessingBudgetReport(packageDir),
    /unsafe|hard-linked/u
  )
})

test("invalid UTF-8 in processing evidence is rejected", async (t) => {
  const packageDir = await packageFixture(t)
  await persistComplete(packageDir)
  await fs.writeFile(processingBudgetReportPath(packageDir), Buffer.from([0xff, 0xfe, 0xfd]))
  await assert.rejects(
    () => loadAndAssertCompleteProcessingBudgetReport(packageDir),
    /not valid UTF-8/u
  )
})

test("unsafe binding file type is rejected independently of the report", async (t) => {
  const packageDir = await packageFixture(t)
  await persistComplete(packageDir)
  const bindingPath = processingBudgetReportBindingPath(packageDir)
  await fs.rm(bindingPath)
  await fs.mkdir(bindingPath)
  await assert.rejects(
    () => loadAndAssertCompleteProcessingBudgetReport(packageDir),
    /unsafe|regular file/u
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
    packageContentSha256: (await readVerifiedReviewPackage(packageDir)).contentHash
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

test("verified snapshots are checked before and after the consuming operation", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "src", "core", "verifiedReviewPackage.ts"), "utf8")
  assert.match(source, /const materializedBefore = await readVerifiedReviewPackage/)
  assert.match(source, /const materializedAfter = await readVerifiedReviewPackage/)
  assert.match(source, /await operation\(verifiedPackageDir\)/)
  assert.ok(source.indexOf("materializedAfter") > source.indexOf("await operation(verifiedPackageDir)"))
})

test("report and binding writers replace the live path without a backup gap", async () => {
  for (const relativePath of [
    "src/core/processingBudgetCoverage.ts",
    "src/core/processingBudgetReportGuard.ts"
  ]) {
    const source = await fs.readFile(path.join(__dirname, "..", relativePath), "utf8")
    assert.match(source, /replaceTextFileAtomically/)
    assert.doesNotMatch(source, /backupPath|\.bak/)
    assert.doesNotMatch(source, /rename\(filePath,/)
  }
})

test("review execution commands consume verified snapshots for capture, validation, and triage", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "src", "reviewExecutionCommands.ts"), "utf8")
  const guards = source.match(/withCompleteProcessingBudgetReport\(/g) ?? []
  assert.equal(guards.length, 3)
  assert.match(source, /\(verifiedPackageDir\) => captureBobOutput\(/)
  assert.match(source, /\(verifiedPackageDir\) => validateBobOutput\(/)
  assert.match(source, /\(verifiedPackageDir\) => generateHumanTriage\(/)
  assert.match(source, /preprocessReviewWithCoverage\(/)
})

test("coverage wrapper delegates stale-output cleanup to the rollback-capable core boundary", async () => {
  const boundary = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "preprocessCoverageBoundary.ts"),
    "utf8"
  )
  const pipeline = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "pipeline.ts"),
    "utf8"
  )
  assert.match(boundary, /return await preprocessReview\(input\)/)
  assert.match(boundary, /target: "review_input_validation"/)
  assert.doesNotMatch(boundary, /removeStaleProcessingBudgetReport|cleanManagedReviewPackageOutputs/)
  assert.match(pipeline, /await cleanPreprocessOutputsWithRollback\(outDir, cancellation\.signal as AbortSignal\)/)
})

test("pipeline checks every evidence warning before complete report binding", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "src", "core", "pipeline.ts"), "utf8")
  assert.match(source, /codeWarnings: codeAnalysis\.warnings/)
  assert.match(source, /repositoryWarnings: repositoryIndexBuild\?\.warnings/)
  assert.match(source, /contextWarnings: contextBudget\.warnings/)
  assert.match(source, /traceabilityWarnings: traceability\.warnings/)
  assert.match(source, /ledgerWarnings: \[\.\.\.upstreamLedger\.warnings, \.\.\.finalLedger\.warnings\]/)
  const finalLedger = source.indexOf("const finalLedger = await updateArtifactLedger")
  const completeReport = source.indexOf("const processingBudgetReport = await persistProcessingBudgetReport")
  assert.ok(finalLedger >= 0 && completeReport > finalLedger)
})
