"use strict"

const assert = require("node:assert/strict")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { resolveWorkspacePathStrict } = require("../out/core/fileSystem")
const { buildReviewInputFromDraft } = require("../out/core/reviewInputBuilder")

test("strict workspace resolution rejects raw dot, traversal, and empty components before host normalization", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "bob-strict-path-syntax-"))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  await fsp.mkdir(path.join(root, "a"))
  await fsp.writeFile(path.join(root, "target.txt"), "ok")

  for (const value of ["./target.txt", "a/../target.txt", "a//target.txt"]) {
    assert.throws(
      () => resolveWorkspacePathStrict(root, value, "testPath"),
      /testPath.*(?:unsafe|escapes|safe workspace-relative)/,
      value
    )
  }
})

test("strict workspace resolution rejects foreign-platform absolute syntax without reinterpreting it as a file name", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "bob-strict-path-foreign-"))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const value = process.platform === "win32" ? "/foreign/path.txt" : "C:\\foreign\\path.txt"

  assert.throws(
    () => resolveWorkspacePathStrict(root, value, "testPath"),
    /testPath.*(?:workspace|unsafe|absolute)/
  )
})

test("strict workspace resolution still accepts a physically contained host absolute path", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "bob-strict-path-contained-"))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const file = path.join(root, "資料.txt")
  await fsp.writeFile(file, "ok")

  assert.equal(resolveWorkspacePathStrict(root, file, "testPath"), file)
})

test("review-input authoring rejects artifact paths that escape through a symlink or reparse point", async (t) => {
  const parent = await fsp.mkdtemp(path.join(os.tmpdir(), "bob-review-input-physical-"))
  t.after(() => fsp.rm(parent, { recursive: true, force: true }))
  const root = path.join(parent, "workspace")
  const outside = path.join(parent, "outside")
  await fsp.mkdir(root)
  await fsp.mkdir(outside)
  await fsp.writeFile(path.join(outside, "requirements.md"), "REQ-PATH-001\n")
  try {
    await fsp.symlink(outside, path.join(root, "linked-docs"), process.platform === "win32" ? "junction" : "dir")
  } catch (error) {
    if (error && ["EPERM", "EACCES", "EINVAL"].includes(error.code)) {
      t.skip(`symlink creation is unavailable: ${error.code}`)
      return
    }
    throw error
  }

  const result = await buildReviewInputFromDraft({
    review: {},
    artifact_candidates: [{ kind: "requirements", path: "linked-docs/requirements.md" }]
  }, { workspaceRoot: root })

  assert.equal(result.status, "error")
  assert.ok(result.errors.some((message) => /artifact path.*(?:outside|escape|unsafe)/i.test(message)))
})
