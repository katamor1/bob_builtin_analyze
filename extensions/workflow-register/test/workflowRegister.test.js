const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const extensionRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(extensionRoot, "..", "..")

test("package entry points at the compiled workflow implementation", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"))
  const tsconfig = JSON.parse(fs.readFileSync(path.join(extensionRoot, "tsconfig.json"), "utf8"))

  assert.equal(packageJson.main, "./out/extension.js")
  assert.deepEqual(tsconfig.include, ["src/**/*.ts"])
})

test("Bazaar workflow template sends collect-context and load-rules command results", () => {
  const workflowPath = path.join(
    repoRoot,
    "extensions",
    "bob-bazaar-review",
    "templates",
    ".bob",
    "workflows",
    "bazaar-project-rule-review",
    "WORKFLOW.md"
  )
  const workflow = fs.readFileSync(workflowPath, "utf8")

  assert.match(workflow, /^stepCompletion: manual$/m)
  assert.match(workflow, /^stepMessage: step$/m)
  assert.match(workflow, /## Step: review-input[\s\S]*?```workflow-step[\s\S]*?command: bobBazaar\.openReviewGui[\s\S]*?sendResult: false[\s\S]*?completeOnSuccess: false[\s\S]*?```/)
  assert.match(workflow, /## Step: collect-context[\s\S]*?```workflow-step[\s\S]*?command: bobBazaar\.collectReviewContext[\s\S]*?sendResult: true[\s\S]*?required: true[\s\S]*?completeOnSuccess: true[\s\S]*?```/)
  assert.match(workflow, /## Step: load-rules[\s\S]*?```workflow-step[\s\S]*?command: bobBazaar\.loadReviewRules[\s\S]*?sendResult: true[\s\S]*?required: true[\s\S]*?completeOnSuccess: true[\s\S]*?```/)
})

test("completeStep command can be called silently by companion extensions", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")

  assert.match(source, /interface StepCompletionOptions \{[\s\S]*silent\?: boolean[\s\S]*\}/)
  assert.match(source, /registerCommand\("workflowRegister\.completeStep", \(options\?: StepCompletionOptions\) => service\.completeCurrentStep\(options\)\)/)
  assert.match(source, /async completeCurrentStep\(options: StepCompletionOptions = \{\}\): Promise<string>/)
  assert.match(source, /if \(!options\.silent\) await vscode\.window\.showInformationMessage\(message\)/)
  assert.match(source, /return message/)
})

test("activation schedules delayed workflow reload retries after Bob finishes startup", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")

  assert.match(source, /const retryDelaysMs = \[3000, 10000\]/)
  assert.match(source, /setTimeout\(\(\) => service\.reload\(\{ showReport: false \}\)/)
})

test("package contributes standalone workflow launcher commands without a hard Bob dependency", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"))
  const commandIds = packageJson.contributes.commands.map((command) => command.command)

  assert.equal(packageJson.extensionDependencies, undefined)
  assert.ok(packageJson.activationEvents.includes("onCommand:workflowRegister.runWorkflow"))
  assert.ok(packageJson.activationEvents.includes("onCommand:workflowRegister.inspectRuns"))
  assert.ok(packageJson.activationEvents.includes("onCommand:workflowRegister.resumeRun"))
  assert.ok(packageJson.activationEvents.includes("onCommand:workflowRegister.retryCurrentStep"))
  assert.ok(commandIds.includes("workflowRegister.runWorkflow"))
  assert.ok(commandIds.includes("workflowRegister.inspectRuns"))
  assert.ok(commandIds.includes("workflowRegister.resumeRun"))
  assert.ok(commandIds.includes("workflowRegister.retryCurrentStep"))
})
