const assert = require("node:assert/strict")
const { test } = require("node:test")

test("provenance projection ignores control-character and oversized metadata tokens", () => {
  const { projectWorkflowRunProvenance } = require("../out/core/runProvenance")
  const run = {
    schemaVersion: "workflow-register/run-state/v1",
    runId: "target-run",
    workflowId: "qa.review",
    workflowName: "QA Review",
    status: "completed",
    inputs: {},
    state: {
      "workflow.artifactReuse": JSON.stringify({
        schemaVersion: "workflow-register/artifact-reuse/v1",
        sourceRunId: "source\nrun",
        startStepId: "analyze\u0000suffix",
        reusedStepIds: ["collect", "bad\rstep", "x".repeat(300)],
        hydratedKeys: ["context", "bad\nkey"],
        createdAt: "2026-07-12T00:00:00.000Z"
      }),
      "workflow.artifactHydration": JSON.stringify({
        schemaVersion: "workflow-register/artifact-hydration/v1",
        sourceRunId: "source-run",
        hydrated: [
          { stateKey: "safe", artifactId: "safe-artifact", producedBy: "collect", sourceRunId: "source-run" },
          { stateKey: "bad\nstate", artifactId: "bad-artifact", producedBy: "collect" }
        ]
      })
    },
    steps: [{ id: "collect", title: "Collect", type: "agent", status: "completed" }],
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:01:00.000Z"
  }

  const projection = projectWorkflowRunProvenance(run)
  const output = JSON.stringify(projection)

  assert.equal(projection.sourceRunId, "source-run")
  assert.equal(projection.startStepId, undefined)
  assert.deepEqual(projection.reusedStepIds, ["collect"])
  assert.deepEqual(projection.hydratedStateKeys, ["context", "safe"])
  assert.deepEqual(projection.artifactIds, ["safe-artifact"])
  assert.doesNotMatch(output, /bad\\n|bad\\r|x{50}/)
})
