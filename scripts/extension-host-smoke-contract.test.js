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

test("Extension Host workflow installs and executes the pinned local VS Code test runtime", () => {
  const qualityWorkflow = readRepoFile(".github", "workflows", "extensions-quality.yml")

  assert.equal(
    occurrenceCount(qualityWorkflow, pinnedRuntimeInstall),
    4,
    "extensions-quality must install the pinned CLI and Electron runtime in all three Ubuntu jobs and the Windows matrix"
  )
  assert.doesNotMatch(qualityWorkflow, transientCliInvocation, "extensions-quality must not execute a transient npx --package CLI")
  assert.match(qualityWorkflow, localCliInvocation, "extensions-quality must execute the project-local vscode-test binary")
})

test("temporary Extension Host diagnostic workflow is not shipped", () => {
  const diagnosticWorkflowPath = path.join(repoRoot, ".github", "workflows", "extension-host-smoke-diagnostic.yml")
  assert.equal(fs.existsSync(diagnosticWorkflowPath), false)
})

test("Extension Host smoke preflights packages, the local binary, and soft-dependency isolation", () => {
  const smokeSource = readRepoFile("scripts", "extension-host-smoke.test.js")

  assert.match(smokeSource, /"@vscode\/test-cli"/)
  assert.match(smokeSource, /"@vscode\/test-electron"/)
  assert.match(smokeSource, /require\.resolve\(packageName, \{ paths: \[process\.cwd\(\)\] \}\)/)
  assert.match(smokeSource, /const cliBinaryName = process\.platform === "win32" \? "vscode-test\.cmd" : "vscode-test"/)
  assert.match(smokeSource, /fs\.existsSync\(cliBinaryPath\)/)
  assert.match(smokeSource, /skipExtensionDependencies:\s*true/)
  assert.match(smokeSource, /ui:\s*"bdd"/)
})
