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

test("Bazaar workflow template declares the providers owned by this extension", () => {
  const workflowPath = path.join(extensionRoot, "templates", ".bob", "workflows", "bazaar-project-rule-review", "WORKFLOW.md")
  const workflow = fs.readFileSync(workflowPath, "utf8")

  assert.match(workflow, /^stepCompletion: manual$/m)
  assert.match(workflow, /^stepMessage: step$/m)
  assert.doesNotMatch(workflow, /```workflow-step/)
  assert.doesNotMatch(workflow, /^## Step:/m)
  assert.match(workflow, /^steps:$/m)
  assert.match(workflow, /id: review-input[\s\S]*?provider: bobBazaar\.openReviewGui[\s\S]*?sendResult: false[\s\S]*?completeOnSuccess: false/)
  assert.match(workflow, /id: collect-context[\s\S]*?provider: bobBazaar\.collectReviewContext[\s\S]*?sendResult: true[\s\S]*?required: true[\s\S]*?completeOnSuccess: true/)
  assert.match(workflow, /id: load-rules[\s\S]*?provider: bobBazaar\.loadReviewRules[\s\S]*?sendResult: true[\s\S]*?required: true[\s\S]*?completeOnSuccess: true/)
})
