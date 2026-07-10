const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { validateWorkflowText } = require("../out/core/workflowValidator")

const repoRoot = path.resolve(__dirname, "..", "..", "..")

const sampleWorkflowPaths = [
  "extensions/workflow-register/samples/review-gated-step-execution/.bob/workflows/review-gated-step-execution/WORKFLOW.md",
  "extensions/workflow-register/samples/step-back-branching-approval/.bob/workflows/step-back-branching-approval/WORKFLOW.md",
  "extensions/workflow-register/samples/mechanical-checks-precheck/.bob/workflows/mechanical-checks-precheck/WORKFLOW.md",
  "extensions/workflow-register/samples/mechanical-checks-parser-pilot/.bob/workflows/mechanical-checks-parser-pilot/WORKFLOW.md"
]

const integrationWorkflowPairs = [
  {
    templatePath: "extensions/bob-bazaar-review/templates/.bob/workflows/bazaar-project-rule-review/WORKFLOW.md",
    mirrorPath: ".bob/workflows/bazaar-project-rule-review/WORKFLOW.md"
  },
  {
    templatePath: "extensions/bob-code-consistency-review/templates/.bob/workflows/code-consistency-review/WORKFLOW.md",
    mirrorPath: ".bob/workflows/code-consistency-review/WORKFLOW.md"
  }
]

test("workflow-register samples are strict-clean", () => {
  for (const relativePath of sampleWorkflowPaths) assertStrictWorkflow(relativePath)
})

test("integration workflow templates are strict-clean and match workspace mirrors", () => {
  for (const { templatePath, mirrorPath } of integrationWorkflowPairs) {
    const templateText = readRepoFile(templatePath)
    const mirrorText = readRepoFile(mirrorPath)
    assert.equal(mirrorText, templateText, `${mirrorPath} must match ${templatePath}`)
    assertStrictWorkflow(templatePath, templateText)
    assertStrictWorkflow(mirrorPath, mirrorText)
  }
})

function assertStrictWorkflow(relativePath, text = readRepoFile(relativePath)) {
  const validation = validateWorkflowText({
    sourceId: "workflow-register",
    filePath: relativePath,
    text,
    strict: true
  })
  assert.equal(
    validation.ok,
    true,
    `${relativePath}\n${validation.diagnostics.map((item) => `${item.severity}: ${item.message}`).join("\n")}`
  )
}

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split("/")), "utf8")
}
