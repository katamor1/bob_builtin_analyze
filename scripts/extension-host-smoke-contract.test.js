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

const surfaceFixtures = [
  ["workflow-register", "Workflow Register"],
  ["bob-bazaar-review", "Bazaar Review"],
  ["bob-code-consistency-review", "Code Consistency Review"]
]

const expectedSurfaceEntries = [
  ["workflowRegister.openOperationHub", "workflowRegisterOperationHub", "Bob 操作ハブ"],
  ["workflowRegister.openWorkflowBuilder", "workflowRegisterBuilder", "ワークフロー作成・編集"],
  ["bobBazaar.openReviewGui", "bobBazaarReviewGui", "Bazaar レビュー"],
  ["bobCodeConsistency.openReviewWizard", "bobCodeConsistencyReviewWizard", "整合プレレビュー"]
]

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

test("consolidated surface smoke is wired identically on Ubuntu and Windows", () => {
  const qualityWorkflow = readRepoFile(".github", "workflows", "extensions-quality.yml")
  const surfaceTestPath = path.join(repoRoot, "scripts", "three-extension-surface-extension-host.test.js")

  assert.equal(fs.existsSync(surfaceTestPath), true, "consolidated Extension Host surface test must be committed")
  const surfaceSource = readRepoFile("scripts", "three-extension-surface-extension-host.test.js")
  for (const name of [
    "SURFACE_PUBLIC_COMMANDS",
    "SURFACE_HIDDEN_COMMANDS",
    "SURFACE_PRIMARY_PANELS"
  ]) {
    assert.match(surfaceSource, new RegExp(name), `${name} must drive the shared surface smoke`)
  }
  assert.match(surfaceSource, /vscode\.commands\.getCommands\(true\)/)
  assert.match(surfaceSource, /vscode\.commands\.executeCommand/)
  assert.match(surfaceSource, /vscode\.window\.tabGroups/)
  assert.match(surfaceSource, /unhandledRejection/)
  assert.doesNotMatch(
    surfaceSource,
    /executeCommand\(\s*["']bobBazaar\.authorProjectRulesFromDocuments["']/,
    "document-backed Bazaar authoring is registration-only in noninteractive Extension Host smoke"
  )

  for (const [extension, label] of surfaceFixtures) {
    const fixture = path.join(repoRoot, "extensions", extension, "test", "fixtures", "gui-surface-workspace", "README.md")
    assert.equal(fs.existsSync(fixture), true, `${label} surface workspace README must be committed`)
  }

  assert.equal(
    occurrenceCount(qualityWorkflow, /SMOKE_EXTRA_FILES:\s*\.\.\/\.\.\/scripts\/three-extension-surface-extension-host\.test\.js/g),
    3,
    "all three Ubuntu jobs must load the shared surface test"
  )
  assert.equal(
    occurrenceCount(qualityWorkflow, /extra_test_files:\s*"\.\.\/\.\.\/scripts\/three-extension-surface-extension-host\.test\.js"/g),
    3,
    "all three Windows matrix entries must load the shared surface test"
  )
  assert.equal(
    occurrenceCount(qualityWorkflow, /SMOKE_WORKSPACE_FOLDER:\s*test\/fixtures\/gui-surface-workspace/g),
    3,
    "all three Ubuntu jobs must use the dedicated surface workspace"
  )
  assert.equal(
    occurrenceCount(qualityWorkflow, /workspace_folder:\s*"test\/fixtures\/gui-surface-workspace"/g),
    3,
    "all three Windows matrix entries must use the dedicated surface workspace"
  )

  for (const matrixField of ["surface_public_commands", "surface_hidden_commands", "surface_primary_panels"]) {
    assert.match(qualityWorkflow, new RegExp(`${matrixField}:`), `Windows matrix must define ${matrixField}`)
    assert.match(
      qualityWorkflow,
      new RegExp(`SURFACE_${matrixField.replace("surface_", "").toUpperCase()}:\\s*\\$\\{\\{\\s*matrix\\.${matrixField}\\s*\\}\\}`),
      `Windows smoke environment must forward matrix.${matrixField}`
    )
  }

  for (const [command, viewType, title] of expectedSurfaceEntries) {
    assert.match(qualityWorkflow, new RegExp(command.replace(/\./g, "\\.")), `${command} must be part of the host matrix`)
    assert.match(qualityWorkflow, new RegExp(viewType), `${viewType} must be part of the host matrix`)
    assert.match(qualityWorkflow, new RegExp(title), `${title} must be part of the host matrix`)
  }

  assert.match(qualityWorkflow, /bobBazaar\.authorProjectRulesFromDocuments/)
  assert.match(qualityWorkflow, /workflowRegister\.runWorkflow/)
  assert.match(qualityWorkflow, /bobBazaar\.captureReviewResult/)
  assert.match(qualityWorkflow, /bobCodeConsistency\.preprocess/)
  assert.match(qualityWorkflow, new RegExp(`SMOKE_EXTRA_FILES:\\s*\\$\\{\\{\\s*matrix\\.extra_test_files\\s*\\}\\}`))
  assert.match(qualityWorkflow, new RegExp(`SMOKE_WORKSPACE_FOLDER:\\s*\\$\\{\\{\\s*matrix\\.workspace_folder\\s*\\}\\}`))
})

test("code consistency triage operator smoke remains a separate Linux and Windows run", () => {
  const qualityWorkflow = readRepoFile(".github", "workflows", "extensions-quality.yml")
  const smokeSource = readRepoFile("scripts", "extension-host-smoke.test.js")
  const operatorTestPath = path.join(repoRoot, "scripts", "triage-integrity-extension-host.test.js")
  const operatorWorkspacePath = path.join(
    repoRoot,
    "extensions",
    "bob-code-consistency-review",
    "test",
    "fixtures",
    "triage-operator-workspace"
  )

  assert.match(smokeSource, /SMOKE_EXTRA_FILES/)
  assert.match(smokeSource, /SMOKE_WORKSPACE_FOLDER/)
  assert.match(smokeSource, /files:\s*smokeTestFiles\(\)/)
  assert.match(qualityWorkflow, /name:\s*Code Consistency triage operator smoke/)
  assert.match(qualityWorkflow, /SMOKE_EXTRA_FILES:\s*\.\.\/\.\.\/scripts\/triage-integrity-extension-host\.test\.js/)
  assert.match(qualityWorkflow, /SMOKE_WORKSPACE_FOLDER:\s*test\/fixtures\/triage-operator-workspace/)
  assert.match(qualityWorkflow, /triage_extra_test_files:\s*"\.\.\/\.\.\/scripts\/triage-integrity-extension-host\.test\.js"/)
  assert.match(qualityWorkflow, /triage_workspace_folder:\s*"test\/fixtures\/triage-operator-workspace"/)
  assert.match(qualityWorkflow, /SMOKE_EXTRA_FILES:\s*\$\{\{\s*matrix\.triage_extra_test_files\s*\}\}/)
  assert.match(qualityWorkflow, /SMOKE_WORKSPACE_FOLDER:\s*\$\{\{\s*matrix\.triage_workspace_folder\s*\}\}/)
  assert.equal(fs.existsSync(operatorTestPath), true, "triage operator Extension Host test file must be committed")
  assert.equal(fs.existsSync(operatorWorkspacePath), true, "triage operator workspace fixture must be committed")
})

test("document payload host pins the same runtime and uses owned profiles",()=>{ const source=readRepoFile("scripts","t14-bounded-document-installed-smoke.mjs"); assert.match(source,/version:'1\.106\.1'/); assert.match(source,/reuseMachineInstall:false/); assert.match(source,/extensionDevelopmentPath:\[/); assert.match(source,/--user-data-dir=/); assert.match(source,/--extensions-dir=/); assert.match(source,/productActivationProbe:'not_run'/); const workflow=readRepoFile(".github","workflows","processing-budget-runtime.yml"); assert.match(workflow,/@vscode\/test-cli@0\.0\.12 @vscode\/test-electron@2\.5\.2/); });

test('aggregate document payload pins the same isolated native host',()=>{const source=readRepoFile('scripts','t15-aggregate-installed-smoke.mjs');for(const token of ["version:'1.106.1'",'reuseMachineInstall:false','--user-data-dir=','--extensions-dir=',"productActivationProbe:'not_run'",'hostExit=await runTests'])assert.ok(source.includes(token),token);});
