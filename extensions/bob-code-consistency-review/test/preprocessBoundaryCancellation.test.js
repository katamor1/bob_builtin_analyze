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

test("cleanup sequence checks cancellation before every destructive boundary", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "preprocessCoverageBoundary.ts"),
    "utf8"
  )
  const firstCheck = source.indexOf("throwIfBoundaryCancelled(input.abortSignal)")
  const reportCleanup = source.indexOf("await removeStaleProcessingBudgetReport(outDir)")
  const secondCheck = source.indexOf("throwIfBoundaryCancelled(input.abortSignal)", firstCheck + 1)
  const packageCleanup = source.indexOf("await cleanManagedReviewPackageOutputs(outDir)")
  const thirdCheck = source.indexOf("throwIfBoundaryCancelled(input.abortSignal)", secondCheck + 1)
  const preprocess = source.indexOf("return await preprocessReview(input)")

  assert.ok(firstCheck >= 0 && firstCheck < reportCleanup)
  assert.ok(secondCheck > reportCleanup && secondCheck < packageCleanup)
  assert.ok(thirdCheck > packageCleanup && thirdCheck < preprocess)
})
