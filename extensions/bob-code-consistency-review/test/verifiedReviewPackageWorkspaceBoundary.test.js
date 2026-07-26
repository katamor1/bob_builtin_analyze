"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  readVerifiedReviewPackage,
  withMaterializedVerifiedReviewPackage
} = require("../out/core/verifiedReviewPackage")

test("verified review package is materialized inside the workspace boundary", async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "verified-workspace-"))
  t.after(() => fs.rm(workspaceRoot, { recursive: true, force: true }))
  const packageDir = path.join(workspaceRoot, ".bob-review", "review-package")
  await fs.mkdir(packageDir, { recursive: true })
  await fs.writeFile(path.join(packageDir, "bob-input.md"), "verified input\n", "utf8")

  const snapshot = await readVerifiedReviewPackage(packageDir)
  const observed = await withMaterializedVerifiedReviewPackage(snapshot, async (verifiedPackageDir) => {
    const relative = path.relative(workspaceRoot, verifiedPackageDir)
    assert.notEqual(relative, "")
    assert.equal(relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), false)
    return fs.readFile(path.join(verifiedPackageDir, "bob-input.md"), "utf8")
  })

  assert.equal(observed, "verified input\n")
})

test("source does not use the operating-system temporary directory", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "verifiedReviewPackage.ts"),
    "utf8"
  )
  assert.match(source, /path\.dirname\(snapshot\.packageDir\)/)
  assert.doesNotMatch(source, /os\.tmpdir\(\)/)
})
