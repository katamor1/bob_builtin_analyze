const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const extensionRoot = path.resolve(__dirname, "..")

test("Bazaar companion extension registers workflow providers with workflow-register", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"))
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")

  assert.ok(packageJson.extensionDependencies.includes("local.workflow-register"))
  assert.ok(packageJson.activationEvents.includes("onStartupFinished"))
  assert.match(source, /const WORKFLOW_REGISTER_EXTENSION_ID = "local\.workflow-register"/)
  assert.match(source, /registerWorkflowProviders\(context\)\.catch/)
  assert.match(source, /api\.registerActionProvider\(\{[\s\S]*id: "bobBazaar\.openReviewGui"[\s\S]*openBazaarReviewGui\(context\)[\s\S]*\}\)/)
  assert.match(source, /api\.registerActionProvider\(\{[\s\S]*id: "bobBazaar\.collectReviewContext"[\s\S]*collectReviewContext\(\)[\s\S]*\}\)/)
  assert.match(source, /api\.registerActionProvider\(\{[\s\S]*id: "bobBazaar\.loadReviewRules"[\s\S]*loadReviewRules\(\)[\s\S]*\}\)/)
  assert.match(source, /api\.registerActionProvider\(\{[\s\S]*id: "bobBazaar\.captureReviewResult"[\s\S]*captureReviewResult\(firstStringArg\(args\)\)[\s\S]*\}\)/)
})
