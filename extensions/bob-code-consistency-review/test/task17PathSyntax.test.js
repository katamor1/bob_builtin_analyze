"use strict"

const assert = require("node:assert/strict")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { resolveWorkspacePathStrict } = require("../out/core/fileSystem")

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
