"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const extensionRoot = path.resolve(__dirname, "..")
const repositoryRoot = path.resolve(extensionRoot, "..", "..")

const read = (...segments) => fs.readFileSync(path.join(...segments), "utf8")

test("workflow-register ships the canonical shared physical path policy", () => {
  const canonical = read(repositoryRoot, "packages", "processing-budget-runtime", "runtime", "path-policy.js")
  const mirrored = read(extensionRoot, "src", "shared-processing-budget-runtime", "path-policy.js")
  assert.equal(mirrored, canonical)

  const tsconfig = JSON.parse(read(extensionRoot, "tsconfig.json"))
  assert.equal(tsconfig.compilerOptions.allowJs, true)
  assert.ok(tsconfig.include.includes("src/**/*.js"))

  const roots = read(extensionRoot, "src", "core", "workspaceRoots.ts")
  assert.match(roots, /sharedProcessingBudgetRuntime/)
  assert.match(roots, /resolvePhysicalContainedPathSync/)
})
