const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { createPhysicalPathMatcher } = require("./helpers/physicalPathMatcher")

test("physical path matcher uses leaf semantics and captured physical parent identity", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "physical-path-matcher-"))
  const other = await fs.mkdtemp(path.join(os.tmpdir(), "physical-path-matcher-other-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  t.after(() => fs.rm(other, { recursive: true, force: true }))
  const expected = path.join(root, "owner.json")
  const alternateLeaf = path.join(root, process.platform === "win32" ? "OWNER.JSON" : "owner.json")
  const otherParent = path.join(other, "owner.json")
  const otherLeaf = path.join(root, "guard.json")
  const matches = createPhysicalPathMatcher(fs)
  const originalRealpath = fs.realpath
  const originalLstat = fs.lstat
  try {
    fs.realpath = async () => { throw new Error("matcher recursed through patched realpath") }
    fs.lstat = async () => { throw new Error("matcher recursed through patched lstat") }

    assert.equal(await matches(expected, alternateLeaf), true)
    assert.equal(await matches(expected, otherParent), false)
    assert.equal(await matches(expected, otherLeaf), false)
  } finally {
    fs.realpath = originalRealpath
    fs.lstat = originalLstat
  }
})
