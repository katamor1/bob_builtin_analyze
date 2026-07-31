"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  preprocessReviewWithCoverage
} = require("../out/core/preprocessCoverageBoundary")

test("pre-cancelled preprocessing does not delete the prior complete package or report", async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "preprocess-boundary-cancel-"))
  t.after(() => fs.rm(workspaceRoot, { recursive: true, force: true }))
  const outDir = path.join(workspaceRoot, ".bob-review", "review-package")
  const reportPath = `${outDir}.processing-budget-report.json`
  await fs.mkdir(outDir, { recursive: true })
  await fs.writeFile(path.join(outDir, "bob-input.md"), "prior complete package\n", "utf8")
  await fs.writeFile(reportPath, "prior report\n", "utf8")

  const cancellation = Object.assign(new Error("operator cancelled"), {
    code: "processing_cancelled",
    kind: "user"
  })
  const controller = new AbortController()
  controller.abort(cancellation)

  await assert.rejects(
    () => preprocessReviewWithCoverage({
      workspaceRoot,
      inputPath: "review-input.yaml",
      outDir: ".bob-review/review-package",
      abortSignal: controller.signal
    }),
    (error) => error === cancellation
  )

  assert.equal(await fs.readFile(path.join(outDir, "bob-input.md"), "utf8"), "prior complete package\n")
  assert.equal(await fs.readFile(reportPath, "utf8"), "prior report\n")
})

test("wrapper delegates one rollback-capable cleanup transaction to the core pipeline", async () => {
  const boundarySource = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "preprocessCoverageBoundary.ts"),
    "utf8"
  )
  const boundaryCheck = boundarySource.indexOf("throwIfBoundaryCancelled(input.abortSignal)")
  const preprocess = boundarySource.indexOf("return await preprocessReview(input)")
  assert.ok(boundaryCheck >= 0 && boundaryCheck < preprocess)
  assert.doesNotMatch(boundarySource, /removeStaleProcessingBudgetReport|cleanManagedReviewPackageOutputs/)

  const pipelineSource = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "pipeline.ts"),
    "utf8"
  )
  const firstCoreCheck = pipelineSource.indexOf("cancellation.throwIfCancelled()")
  const transaction = pipelineSource.indexOf("await cleanPreprocessOutputsWithRollback(")
  const reviewInputValidation = pipelineSource.indexOf("const reviewInput = await validateReviewInput(")
  assert.ok(firstCoreCheck >= 0 && firstCoreCheck < transaction)
  assert.ok(transaction > firstCoreCheck && transaction < reviewInputValidation)
  assert.doesNotMatch(
    pipelineSource.slice(0, reviewInputValidation),
    /await removeStaleProcessingBudgetReport|await cleanManagedReviewPackageOutputs/
  )
})

test("cleanup transaction captures first, restores on failure, and installs the binding last", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "preprocessCleanupTransaction.ts"),
    "utf8"
  )

  const initialCheck = source.indexOf("throwIfCancelled(signal)")
  const capture = source.indexOf("const snapshot = await capturePreprocessOutputs(outDir)")
  const postCaptureCheck = source.indexOf("throwIfCancelled(signal)", initialCheck + 1)
  const reportCleanup = source.indexOf("await removeStaleProcessingBudgetReport(outDir)", postCaptureCheck)
  const postReportCheck = source.indexOf("throwIfCancelled(signal)", postCaptureCheck + 1)
  const packageCleanup = source.indexOf("await cleanManagedReviewPackageOutputs(outDir)", postReportCheck)
  const postPackageCheck = source.indexOf("throwIfCancelled(signal)", postReportCheck + 1)
  const restore = source.indexOf("await restorePreprocessOutputs(outDir, snapshot)", postPackageCheck)

  assert.ok(initialCheck >= 0 && initialCheck < capture)
  assert.ok(postCaptureCheck > capture && postCaptureCheck < reportCleanup)
  assert.ok(postReportCheck > reportCleanup && postReportCheck < packageCleanup)
  assert.ok(postPackageCheck > packageCleanup && postPackageCheck < restore)

  const restoreStart = source.indexOf("async function restorePreprocessOutputs(")
  const packageFiles = source.indexOf("for (const file of snapshot.packageSnapshot.files)", restoreStart)
  const reportWrite = source.indexOf("replaceBytesAtomically(processingBudgetReportPath(outDir)", packageFiles)
  const bindingWrite = source.indexOf("replaceBytesAtomically(processingBudgetReportBindingPath(outDir)", reportWrite)
  assert.ok(packageFiles > restoreStart)
  assert.ok(reportWrite > packageFiles)
  assert.ok(bindingWrite > reportWrite)
})
