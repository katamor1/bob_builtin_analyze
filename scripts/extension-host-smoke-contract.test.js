#!/usr/bin/env node
"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const repoRoot = path.resolve(__dirname, "..")

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8")
}

function occurrenceCount(text, pattern) {
  return (text.match(pattern) ?? []).length
}

const pinnedRuntimeInstall = /npm install --no-save --package-lock=false --ignore-scripts --audit=false --fund=false @vscode\/test-cli@0\.0\.12 @vscode\/test-electron@2\.5\.2/g
const transientCliInvocation = /npx\s+--yes\s+--package\s+["']?@vscode\/test-cli/
const localCliInvocation = /node_modules[\\/]\.bin[\\/]vscode-test(?:\.cmd)?/

test("Extension Host workflows install and execute the pinned local VS Code test runtime", () => {
  const qualityWorkflow = readRepoFile(".github", "workflows", "extensions-quality.yml")
  const diagnosticWorkflow = readRepoFile(".github", "workflows", "extension-host-smoke-diagnostic.yml")

  assert.equal(
    occurrenceCount(qualityWorkflow, pinnedRuntimeInstall),
    4,
    "extensions-quality must install the pinned CLI and Electron runtime in all three Ubuntu jobs and the Windows matrix"
  )
  assert.equal(
    occurrenceCount(diagnosticWorkflow, pinnedRuntimeInstall),
    1,
    "the diagnostic workflow must install the same pinned local runtime"
  )

  for (const [name, workflow] of [
    ["extensions-quality", qualityWorkflow],
    ["extension-host-smoke-diagnostic", diagnosticWorkflow]
  ]) {
    assert.doesNotMatch(workflow, transientCliInvocation, `${name} must not execute a transient npx --package CLI`)
    assert.match(workflow, localCliInvocation, `${name} must execute the project-local vscode-test binary`)
  }
})

test("Extension Host smoke preflights both local packages and preserves soft-dependency isolation", () => {
  const smokeSource = readRepoFile("scripts", "extension-host-smoke.test.js")

  assert.match(smokeSource, /"@vscode\/test-cli"/)
  assert.match(smokeSource, /"@vscode\/test-electron"/)
  assert.match(smokeSource, /require\.resolve\(packageName, \{ paths: \[process\.cwd\(\)\] \}\)/)
  assert.match(smokeSource, /skipExtensionDependencies:\s*true/)
  assert.match(smokeSource, /ui:\s*"bdd"/)
})
