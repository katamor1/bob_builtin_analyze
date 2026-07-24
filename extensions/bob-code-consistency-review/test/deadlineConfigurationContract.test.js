"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const extensionRoot = path.resolve(__dirname, "..")

test("the compatibility timeout setting describes one non-refreshing preprocess deadline", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"))
  const description = manifest.contributes.configuration.properties["bobCodeConsistency.vcsCommandTimeoutMs"].description
  assert.match(description, /前処理1回全体/)
  assert.match(description, /更新せず共有/)
  assert.doesNotMatch(description, /コマンド1回あたり/)
})
