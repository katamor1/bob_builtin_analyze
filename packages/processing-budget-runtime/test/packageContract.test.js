"use strict"

const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const { packageRoot } = require("./helpers")

test("compiles generated runtime entrypoints before packaging", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"))
  assert.equal(packageJson.scripts.prepack, "npm run compile")
})

test("package payload contains runtime contracts and excludes source and tests", () => {
  const result = childProcess.spawnSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: packageRoot, encoding: "utf8", shell: process.platform === "win32" }
  )
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.length, 1)
  const paths = payload[0].files.map((entry) => entry.path)
  for (const required of [
    "README.md",
    "contracts/processing-budget-definition.v1.json",
    "out/index.js",
    "out/index.d.ts",
    "schema/processing-budget-profile.v1.schema.json"
  ]) {
    assert.equal(paths.includes(required), true, `missing packaged file ${required}`)
  }
  assert.equal(paths.some((entry) => entry.startsWith("src/")), false)
  assert.equal(paths.some((entry) => entry.startsWith("test/")), false)
  assert.equal(paths.some((entry) => entry.startsWith("scripts/")), false)
})
