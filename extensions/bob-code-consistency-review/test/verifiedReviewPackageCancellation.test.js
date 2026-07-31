"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  readVerifiedReviewPackage
} = require("../out/core/verifiedReviewPackage")

async function packageFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verified-package-cancel-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const packageDir = path.join(root, ".bob-review", "review-package")
  await fs.mkdir(path.join(packageDir, "prompts"), { recursive: true })
  await fs.writeFile(path.join(packageDir, "prompts", "system.md"), "system\n", "utf8")
  await fs.writeFile(path.join(packageDir, "bob-input.md"), "input\n", "utf8")
  return packageDir
}

test("verified package capture rejects a pre-cancelled signal before stable file reads", async (t) => {
  const packageDir = await packageFixture(t)
  const cancellation = Object.assign(new Error("operator cancelled capture"), {
    code: "processing_cancelled",
    kind: "user"
  })
  const controller = new AbortController()
  controller.abort(cancellation)

  await assert.rejects(
    () => readVerifiedReviewPackage(packageDir, controller.signal),
    (error) => error === cancellation
  )
})

test("verified package traversal rechecks cancellation between managed paths and reads", async (t) => {
  const packageDir = await packageFixture(t)
  const cancellation = Object.assign(new Error("cancelled during capture"), {
    code: "processing_cancelled",
    kind: "user"
  })
  let checks = 0
  const signal = {
    get aborted() {
      checks += 1
      return checks >= 5
    },
    get reason() {
      return cancellation
    }
  }

  await assert.rejects(
    () => readVerifiedReviewPackage(packageDir, signal),
    (error) => error === cancellation
  )
  assert.ok(checks >= 5)
})

test("rollback cleanup threads the operation signal through every snapshot reader", async () => {
  const cleanupSource = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "preprocessCleanupTransaction.ts"),
    "utf8"
  )
  assert.match(cleanupSource, /capturePreprocessOutputs\(outDir, signal\)/)
  assert.match(cleanupSource, /readOptionalPackageSnapshot\(outDir, signal\)/)
  assert.match(cleanupSource, /readVerifiedReviewPackage\(outDir, signal\)/)
  assert.match(cleanupSource, /readOptionalStableFile\([\s\S]*signal/)

  const packageSource = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "verifiedReviewPackage.ts"),
    "utf8"
  )
  const readLoop = packageSource.indexOf("while (offset < size)")
  assert.ok(readLoop >= 0)
  assert.ok(packageSource.lastIndexOf("throwIfCancelled(signal)", readLoop) >= 0)
  assert.ok(packageSource.indexOf("throwIfCancelled(signal)", readLoop) > readLoop)
})
