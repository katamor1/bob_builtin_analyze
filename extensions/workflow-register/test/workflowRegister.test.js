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
  assert.match(workflow, /## Step: collect-context[\s\S]*?```workflow-step[\s\S]*?command: bobBazaar\.collectReviewContext[\s\S]*?sendResult: true[\s\S]*?required: true[\s\S]*?completeOnSuccess: false[\s\S]*?```/)
  assert.match(workflow, /## Step: load-rules[\s\S]*?```workflow-step[\s\S]*?command: bobBazaar\.loadReviewRules[\s\S]*?sendResult: true[\s\S]*?required: true[\s\S]*?completeOnSuccess: false[\s\S]*?```/)
})

test("activation schedules delayed workflow reload retries after Bob finishes startup", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "src", "extension.ts"), "utf8")

  assert.match(source, /const retryDelaysMs = \[3000, 10000\]/)
  assert.match(source, /setTimeout\(\(\) => service\.reload\(\{ showReport: false \}\)/)
})
