"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const packageRoot = path.resolve(__dirname, "..")
const runtimePath = path.join(packageRoot, "out", "index.js")

function loadRuntime() {
  assert.equal(
    fs.existsSync(runtimePath),
    true,
    "compiled processing-budget runtime must exist before contract tests run"
  )
  delete require.cache[require.resolve(runtimePath)]
  return require(runtimePath)
}

function snapshot(runtime, ledger) {
  const report = ledger.snapshot()
  return {
    categories: report.categories.map((entry) => ({ ...entry })),
    targets: report.targets.map((entry) => ({ ...entry }))
  }
}

module.exports = { loadRuntime, packageRoot, snapshot }
