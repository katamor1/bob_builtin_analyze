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

test("wrapper and core cleanup sequences recheck cancellation at every destructive boundary", async () => {
  const boundarySource = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "preprocessCoverageBoundary.ts"),
    "utf8"
  )
  const firstBoundaryCheck = boundarySource.indexOf("throwIfBoundaryCancelled(input.abortSignal)")
  const boundaryReportCleanup = boundarySource.indexOf("await removeStaleProcessingBudgetReport(outDir)")
  const secondBoundaryCheck = boundarySource.indexOf(
    "throwIfBoundaryCancelled(input.abortSignal)",
    firstBoundaryCheck + 1
  )
  const boundaryPackageCleanup = boundarySource.indexOf("await cleanManagedReviewPackageOutputs(outDir)")
  const thirdBoundaryCheck = boundarySource.indexOf(
    "throwIfBoundaryCancelled(input.abortSignal)",
    secondBoundaryCheck + 1
  )
  const preprocess = boundarySource.indexOf("return await preprocessReview(input)")

  assert.ok(firstBoundaryCheck >= 0 && firstBoundaryCheck < boundaryReportCleanup)
  assert.ok(secondBoundaryCheck > boundaryReportCleanup && secondBoundaryCheck < boundaryPackageCleanup)
  assert.ok(thirdBoundaryCheck > boundaryPackageCleanup && thirdBoundaryCheck < preprocess)

  const pipelineSource = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "pipeline.ts"),
    "utf8"
  )
  const firstCoreCheck = pipelineSource.indexOf("cancellation.throwIfCancelled()")
  const coreReportCleanup = pipelineSource.indexOf("await removeStaleProcessingBudgetReport(outDir)")
  const secondCoreCheck = pipelineSource.indexOf("cancellation.throwIfCancelled()", firstCoreCheck + 1)
  const corePackageCleanup = pipelineSource.indexOf("await cleanManagedReviewPackageOutputs(outDir)")
  const thirdCoreCheck = pipelineSource.indexOf("cancellation.throwIfCancelled()", secondCoreCheck + 1)
  const reviewInputValidation = pipelineSource.indexOf("const reviewInput = await validateReviewInput(")

  assert.ok(firstCoreCheck >= 0 && firstCoreCheck < coreReportCleanup)
  assert.ok(secondCoreCheck > coreReportCleanup && secondCoreCheck < corePackageCleanup)
  assert.ok(thirdCoreCheck > corePackageCleanup && thirdCoreCheck < reviewInputValidation)
})
