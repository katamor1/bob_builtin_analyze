"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const test = require("node:test")

test("package coverage boundary cleans managed outputs when construction throws", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "reviewPackageCoverageGuard.ts"),
    "utf8"
  )
  const build = source.indexOf("warnings = await buildReviewPackage(input)")
  const catchBlock = source.indexOf("catch (error)", build)
  const cleanup = source.indexOf("await cleanManagedReviewPackageOutputs(input.outDir)", catchBlock)
  const rethrow = source.indexOf("throw error", cleanup)
  assert.ok(build >= 0)
  assert.ok(catchBlock > build)
  assert.ok(cleanup > catchBlock)
  assert.ok(rethrow > cleanup)
})
