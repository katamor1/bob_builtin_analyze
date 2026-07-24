"use strict"

const assert = require("node:assert/strict")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const { resolvePhysicalContainedPathSync } = require("../out")

test("absolute governed paths reject lexical dot and traversal components before normalization", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "bob-path-absolute-dot-"))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  await fsp.mkdir(path.join(root, "a"))
  await fsp.writeFile(path.join(root, "target.txt"), "ok")

  for (const candidatePath of [
    `${root}${path.sep}.${path.sep}target.txt`,
    `${root}${path.sep}a${path.sep}..${path.sep}target.txt`
  ]) {
    assert.throws(
      () => resolvePhysicalContainedPathSync({
        rootPath: root,
        candidatePath,
        allowAbsolute: true,
        mustExist: true
      }),
      (error) => error?.code === "path_policy_escape",
      candidatePath
    )
  }
})

test("physical resolution rejects foreign-platform absolute syntax", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "bob-path-foreign-"))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const candidatePath = process.platform === "win32" ? "/foreign/path.txt" : "C:\\foreign\\path.txt"

  assert.throws(
    () => resolvePhysicalContainedPathSync({
      rootPath: root,
      candidatePath,
      allowAbsolute: true,
      mustExist: false
    }),
    (error) => error?.code === "path_policy_absolute"
  )
})
