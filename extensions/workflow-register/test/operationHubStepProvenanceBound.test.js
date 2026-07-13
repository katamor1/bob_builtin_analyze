const assert = require("node:assert/strict")
const { test } = require("node:test")

function inputWithSteps(count) {
  const stepIds = Array.from({ length: count }, (_, index) => `step-${index + 1}`)
  return {
    workspaceName: "repo",
    workspaceRoots: ["/repo"],
    extensionStatus: [],
    setup: {
      bobRootPresent: true,
      workflowsPresent: true,
      runStatePresent: true,
      mcpConfigPresent: true,
      traceabilityPresent: false
    },
    workflows: [],
    runs: [{
      root: "/repo",
      run: {
        runId: "target-run",
        workflowId: "qa.review",
        workflowName: "QA Review",
        status: "completed",
        inputs: {},
        state: {
          "workflow.artifactReuse": JSON.stringify({
            schemaVersion: "workflow-register/artifact-reuse/v1",
            sourceRunId: "source-run",
            sourceWorkflowId: "qa.review",
            startStepId: "step-13",
            reusedStepIds: stepIds,
            hydratedKeys: [],
            createdAt: "2026-07-12T00:00:00.000Z"
          })
        },
        steps: stepIds.map((id) => ({ id, title: id, type: "agent", status: "completed" })),
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:01:00.000Z"
      }
    }]
  }
}

test("Operation Hub bounds step provenance and reports omitted steps", () => {
  const { buildOperationHubModel } = require("../out/gui/operationHubModel")
  const { renderOperationHubHtml } = require("../out/gui/operationHubHtml")
  const model = buildOperationHubModel(inputWithSteps(15))
  const run = model.runMonitor[0]
  const html = renderOperationHubHtml({ cspSource: "vscode-resource:", nonce: "nonce", model })

  assert.equal(run.stepProvenance.length, 8)
  assert.equal(run.stepProvenanceOmittedCount, 7)
  assert.match(html, /7 more step\(s\); see Run Diagnostics/)
  assert.doesNotMatch(html, /step-9/)
})
