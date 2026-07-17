const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const expectedAttribute = "extensions/workflow-register/test/fixtures/reproducible-runtime/** text eol=lf"

test("reproducible runtime exact-byte fixtures are checked out with LF on every platform", () => {
  const repositoryRoot = path.resolve(__dirname, "..", "..", "..")
  const attributes = fs.readFileSync(path.join(repositoryRoot, ".gitattributes"), "utf8")
  const lines = attributes.split(/\r?\n/).map((line) => line.trim())

  assert.ok(
    lines.includes(expectedAttribute),
    `repository .gitattributes must include: ${expectedAttribute}`
  )
})
