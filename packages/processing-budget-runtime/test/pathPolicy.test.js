"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  isPortablePathContained,
  normalizeWorkspaceRelativePath,
  resolvePhysicalContainedPath,
  resolvePhysicalContainedPathSync,
  selectDeepestPhysicalRoot
} = require("../out")

test("workspace-relative normalization accepts spaces and Japanese while rejecting unsafe syntax", () => {
  assert.equal(normalizeWorkspaceRelativePath("資料/設計 docs/仕様.md"), "資料/設計 docs/仕様.md")
  for (const value of [
    "",
    "./file.txt",
    "a/../file.txt",
    "a//file.txt",
    "/absolute/file.txt",
    "C:\\absolute\\file.txt",
    "C:drive-relative.txt",
    "\\\\server\\share\\file.txt",
    "\\\\?\\C:\\device.txt",
    "\\\\.\\PIPE\\name",
    "a/\u0000/file.txt",
    " spaced.txt",
    "spaced.txt "
  ]) {
    assert.throws(() => normalizeWorkspaceRelativePath(value), undefined, value)
  }
})

test("portable containment handles drive and UNC paths without device aliases", () => {
  assert.equal(isPortablePathContained("C:\\Work\\Root", "c:\\work\\root\\資料\\a.txt", "win32"), true)
  assert.equal(isPortablePathContained("C:\\Work\\Root", "C:\\Work\\Other\\a.txt", "win32"), false)
  assert.equal(isPortablePathContained("\\\\server\\share\\root", "\\\\SERVER\\SHARE\\root\\child\\a.txt", "win32"), true)
  assert.equal(isPortablePathContained("\\\\server\\share\\root", "\\\\server\\share\\other\\a.txt", "win32"), false)
  assert.throws(() => isPortablePathContained("C:\\Work", "\\\\?\\C:\\Work\\a.txt", "win32"))
  assert.throws(() => isPortablePathContained("C:\\Work", "C:relative.txt", "win32"))
})

test("physical containment accepts an owned Japanese path and a missing leaf", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "bob-path-policy-"))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const directory = path.join(root, "設計 docs")
  await fsp.mkdir(directory)
  const file = path.join(directory, "仕様.txt")
  await fsp.writeFile(file, "ok")

  const existing = await resolvePhysicalContainedPath({ rootPath: root, candidatePath: file, mustExist: true })
  assert.equal(existing.relative_path, "設計 docs/仕様.txt")
  assert.equal(existing.path, fs.realpathSync(file))

  const missing = resolvePhysicalContainedPathSync({
    rootPath: root,
    candidatePath: "設計 docs/new-output.txt",
    allowAbsolute: false,
    mustExist: false
  })
  assert.equal(missing.relative_path, "設計 docs/new-output.txt")
})

test("physical containment rejects symlink escape and symlinked roots", async (t) => {
  const parent = await fsp.mkdtemp(path.join(os.tmpdir(), "bob-path-symlink-"))
  t.after(() => fsp.rm(parent, { recursive: true, force: true }))
  const root = path.join(parent, "root")
  const outside = path.join(parent, "outside")
  await fsp.mkdir(root)
  await fsp.mkdir(outside)
  await fsp.writeFile(path.join(outside, "secret.txt"), "secret")
  await fsp.symlink(outside, path.join(root, "link"), process.platform === "win32" ? "junction" : "dir")

  await assert.rejects(
    () => resolvePhysicalContainedPath({ rootPath: root, candidatePath: path.join(root, "link", "secret.txt"), mustExist: true }),
    (error) => error?.code === "path_policy_symlink" || error?.code === "path_policy_escape"
  )
  await assert.rejects(
    () => resolvePhysicalContainedPath({ rootPath: path.join(root, "link"), candidatePath: path.join(outside, "secret.txt"), mustExist: true }),
    (error) => error?.code === "path_policy_symlink"
  )
})

test("multi-root selection uses physical identity instead of lexical symlink location", async (t) => {
  const parent = await fsp.mkdtemp(path.join(os.tmpdir(), "bob-multiroot-"))
  t.after(() => fsp.rm(parent, { recursive: true, force: true }))
  const rootA = path.join(parent, "workspace-a")
  const rootB = path.join(parent, "workspace-b")
  await fsp.mkdir(rootA)
  await fsp.mkdir(rootB)
  const file = path.join(rootB, "資料.txt")
  await fsp.writeFile(file, "ok")
  const alias = path.join(rootA, "alias-to-b")
  await fsp.symlink(rootB, alias, process.platform === "win32" ? "junction" : "dir")

  assert.equal(await selectDeepestPhysicalRoot([rootA, rootB], path.join(alias, "資料.txt")), rootB)
})
