const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { extensionRoot, readSrc } = require("./helpers/sourceReader")

test("extension entrypoint is a composition root for command and workflow registrations", () => {
  for (const fileName of ["workflowProviders.ts", "workflowActions.ts", "workspaceCommands.ts"]) {
    assert.ok(fs.existsSync(path.join(extensionRoot, "src", fileName)), `${fileName} must exist`)
  }

  const source = readSrc("extension.ts")
  assert.match(source, /registerWorkflowProvidersWithRetry\(context\)/)
  assert.match(source, /collectReviewContext\(/)
  assert.match(source, /loadReviewRules\(/)
  assert.match(source, /configureMcp\(context\)/)
  assert.match(source, /initProjectRules\(\)/)
  assert.doesNotMatch(source, /function registerWorkflowProviders/)
  assert.doesNotMatch(source, /function collectReviewContext/)
  assert.doesNotMatch(source, /function findReviewPacketText/)
  assert.doesNotMatch(source, /function configureMcp/)
  assert.doesNotMatch(source, /function initProjectRules/)
})

test("workspace root resolution modules live under the workspace source boundary", () => {
  for (const fileName of ["workspaceResolver.ts", "workspaceRoots.ts"]) {
    assert.ok(fs.existsSync(path.join(extensionRoot, "src", "workspace", fileName)), `workspace/${fileName} must exist`)
    assert.ok(!fs.existsSync(path.join(extensionRoot, "src", fileName)), `${fileName} must not stay at the src root`)
  }

  const resolverSource = readSrc("workspace", "workspaceResolver.ts")
  assert.match(resolverSource, /from "\.\/workspaceRoots"/)
})
