const test = require("node:test")
const assert = require("node:assert/strict")

const { serializeAuthoringModelToMarkdown } = require("../out/core/workflowAuthoringSerializer")
const { validateWorkflowText } = require("../out/core/workflowValidator")
const { planSkipResumeReadiness } = require("../out/core/workflowSkipResumeReadiness")

function baseModel() {
  return {
    metadata: {
      schemaVersion: "workflow-register/v1",
      name: "skip-resume-readiness",
      title: "Skip Resume Readiness",
      description: "Prepare reusable workflow outputs.",
      mode: "agent",
      workspaceRequired: true
    },
    inputs: [],
    preflight: [],
    steps: [
      {
        id: "collect-context",
        title: "Collect context",
        type: "command",
        action: { provider: "vscode.executeCommand", args: ["example.collectContext"] },
        resultKey: "collectedContext"
      },
      {
        id: "review",
        title: "Review",
        type: "agent",
        prompt: "Review the collected context.",
        includeState: ["collectedContext"],
        resultKey: "reviewReport"
      }
    ],
    artifacts: []
  }
}

function artifact(stepId, resultKey, path = `.bob/workflows/runs/{{run.id}}/artifacts/${stepId}/${resultKey}.md`) {
  return { id: resultKey, producedBy: stepId, path, schema: "text/markdown" }
}

test("planner deterministically generates run-scoped artifacts without mutating the input", () => {
  const model = baseModel()
  const original = structuredClone(model)

  const plan = planSkipResumeReadiness(model)

  assert.deepEqual(model, original)
  assert.deepEqual(plan.selectedStepIds, ["collect-context", "review"])
  assert.deepEqual(plan.nextModel.skipResume, { fileBound: true })
  assert.deepEqual(plan.nextModel.artifacts, [
    artifact("collect-context", "collectedContext"),
    artifact("review", "reviewReport")
  ])
  assert.deepEqual(plan.candidates.map((candidate) => ({
    stepId: candidate.stepId,
    resultKey: candidate.resultKey,
    status: candidate.status,
    selected: candidate.selected
  })), [
    { stepId: "collect-context", resultKey: "collectedContext", status: "ready", selected: true },
    { stepId: "review", resultKey: "reviewReport", status: "ready", selected: true }
  ])
  assert.equal(plan.blockingIssues.length, 0)
  assert.ok(plan.changes.some((change) => change.includes("x-skipResume.fileBound")))
})

test("planner supports manual form and approval outputs and explicit step selection", () => {
  const model = baseModel()
  model.steps = [
    {
      id: "human-review",
      title: "Human review",
      type: "manual",
      prompt: "Review the draft.",
      form: { resultKey: "reviewNotes", fields: [{ id: "notes", type: "string" }] },
      approval: { resultKey: "reviewDecision", approveLabel: "Approve", rejectLabel: "Reject" }
    },
    {
      id: "summarize",
      title: "Summarize",
      type: "agent",
      prompt: "Summarize the review.",
      includeState: ["reviewNotes", "reviewDecision"],
      resultKey: "summary"
    }
  ]

  const plan = planSkipResumeReadiness(model, ["human-review"])

  assert.deepEqual(plan.selectedStepIds, ["human-review"])
  assert.deepEqual(plan.nextModel.artifacts, [
    artifact("human-review", "reviewNotes"),
    artifact("human-review", "reviewDecision")
  ])
  assert.deepEqual(plan.candidates.map((candidate) => [candidate.stepId, candidate.resultKey, candidate.selected]), [
    ["human-review", "reviewNotes", true],
    ["human-review", "reviewDecision", true],
    ["summarize", "summary", false]
  ])
})

test("planner preserves compatible existing artifacts and is idempotent", () => {
  const model = baseModel()
  model.artifacts = [
    artifact("collect-context", "collectedContext"),
    { id: "unrelated", producedBy: "external-step", path: ".bob/artifacts/unrelated.md" }
  ]

  const first = planSkipResumeReadiness(model)
  const second = planSkipResumeReadiness(first.nextModel)

  assert.equal(first.candidates[0].status, "existing")
  assert.deepEqual(second.nextModel, first.nextModel)
  assert.equal(second.nextModel.artifacts.filter((item) => item.id === "collectedContext").length, 1)
  assert.deepEqual(second.nextModel.artifacts.find((item) => item.id === "unrelated"), model.artifacts[1])
})

test("planner blocks agent and result steps that are not ready for file-bound reuse", () => {
  const model = baseModel()
  delete model.steps[1].resultKey
  model.steps.push({
    id: "publish",
    title: "Publish",
    type: "result",
    result: { source: "state", stateKey: "collectedContext", sinks: [{ type: "command", command: "example.publish" }] }
  })

  const plan = planSkipResumeReadiness(model)

  assert.ok(plan.blockingIssues.some((issue) => issue.includes("agent step 'review'") && issue.includes("resultKey")))
  assert.ok(plan.blockingIssues.some((issue) => issue.includes("result step 'publish'") && issue.includes("file sink")))
})

test("planner blocks artifact ownership and path conflicts without overwriting them", () => {
  const cases = [
    {
      name: "same id owned by another step",
      existing: { id: "collectedContext", producedBy: "review", path: ".bob/workflows/runs/{{run.id}}/artifacts/review/collectedContext.md" },
      expected: /collectedContext.*review.*collect-context/i
    },
    {
      name: "producer artifact does not match a reusable result key",
      existing: { id: "legacyContext", producedBy: "collect-context", path: ".bob/workflows/runs/{{run.id}}/artifacts/collect-context/legacyContext.md" },
      expected: /legacyContext.*collect-context.*resultKey/i
    },
    {
      name: "matching artifact is not run-scoped",
      existing: { id: "collectedContext", producedBy: "collect-context", path: ".bob/artifacts/context.md" },
      expected: /collectedContext.*run-scoped/i
    }
  ]

  for (const item of cases) {
    const model = baseModel()
    model.artifacts = [item.existing]
    const plan = planSkipResumeReadiness(model)
    assert.deepEqual(model.artifacts, [item.existing], item.name)
    assert.ok(plan.blockingIssues.some((issue) => item.expected.test(issue)), `${item.name}: ${plan.blockingIssues.join("\n")}`)
    assert.deepEqual(plan.nextModel.artifacts[0], item.existing, item.name)
  }
})

test("a complete generated model passes strict workflow validation", () => {
  const plan = planSkipResumeReadiness(baseModel())
  const rendered = serializeAuthoringModelToMarkdown(plan.nextModel)
  const validation = validateWorkflowText({
    sourceId: "workflow-register",
    filePath: rendered.filePath,
    text: rendered.markdown,
    strict: true
  })

  assert.equal(plan.blockingIssues.length, 0)
  assert.equal(validation.ok, true, validation.diagnostics.map((item) => `${item.severity}: ${item.message}`).join("\n"))
})
