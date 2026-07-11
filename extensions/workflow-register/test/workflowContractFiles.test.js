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

test("result step prompt and includeState are accepted as Bob runtime fields", () => {
  const validation = validateStrictText(`---
schemaVersion: workflow-register/v1
name: result-runtime-fields
description: Result runtime field validation.
stepMessage: step
steps:
  - id: collect
    title: Collect context
    type: command
    prompt: Collect the context.
    action:
      provider: sample.collect
    resultKey: context
  - id: save
    title: Save context
    type: result
    prompt: Save the collected context.
    includeState:
      - context
    result:
      source: state
      stateKey: context
      sinks:
        - type: file
          path: .bob/workflows/runs/{{run.id}}/context.json
---
# Result runtime fields
`)

  assert.equal(validation.ok, true, formatDiagnostics(validation))
  assert.equal(validation.workflow.engineSteps[1].prompt, "Save the collected context.")
  assert.deepEqual(validation.workflow.engineSteps[1].includeState, ["context"])
})

test("step messages allow result steps to use their result definition without a prompt", () => {
  const validation = validateStrictText(`---
schemaVersion: workflow-register/v1
name: result-step-without-prompt
description: Result step prompt fallback validation.
stepMessage: step
steps:
  - id: write
    title: Write result
    type: result
    result:
      source: literal
      text: done
      sinks:
        - type: file
          path: .bob/workflows/runs/{{run.id}}/done.txt
---
# Result step without prompt
`)

  assert.equal(validation.ok, true, formatDiagnostics(validation))
})

function assertStrictWorkflow(relativePath, text = readRepoFile(relativePath)) {
  const validation = validateStrictText(text, relativePath)
  assert.equal(validation.ok, true, `${relativePath}\n${formatDiagnostics(validation)}`)
}

function validateStrictText(text, filePath = "test/fixtures/inline/WORKFLOW.md") {
  return validateWorkflowText({
    sourceId: "workflow-register",
    filePath,
    text,
    strict: true
  })
}

function formatDiagnostics(validation) {
  return validation.diagnostics.map((item) => `${item.severity}: ${item.message}`).join("\n")
}

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split("/")), "utf8")
}
