"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const test = require("node:test")

test("OOXML preflight retains each inflated entry once and copies only at the public boundary", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "..", "runtime", "bounded-zip.js"),
    "utf8"
  )

  assert.doesNotMatch(source, /Buffer\.from\(content\)/u)
  assert.match(source, /\[entry\.name,\s*content\]/u)
  assert.match(source, /copyEntry\(name\)[\s\S]*Uint8Array\.from\(content\)/u)
})
