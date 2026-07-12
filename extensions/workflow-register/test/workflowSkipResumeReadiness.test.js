const test = require("node:test")
const assert = require("node:assert/strict")

const {
  applyWorkflowSkipResumeReadiness,
  planWorkflowSkipResumeReadiness
} = require("../out/core/workflowSkipResumeReadiness")
const { loadAuthoringModelFromMarkdown } = require("../out/core/workflowAuthoringLoader")
const { serializeAuthoringModelToMarkdown } = require("../out/core/workflowAuthoringSerializer")
const { validateWorkflowText } = require("../out/core/workflowValidator")

function validModel() {
  return {
    metadata: {
      schemaVersion: "workflow-register/v1",
      name: "readiness-sample",
      title: "Readiness Sample",
      description: "Configure file-bound skip resume from the Builder.",
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
        action: { provider: "sample.collect" },
        resultKey: "collectedContext"
      },
      {
        id: "review",
        title: "Review",
        type: "agent",
        prompt: "Review the collected context.",
        includeState: ["collectedContext"],
        resultKey: "reviewReport"
      },
      {
        id: "operator-input",
        title: "Operator input",
        type: "manual",
        form: {
          resultKey: "operatorInput",
          fields: [{ id: "note", title: "Note", type: "string" }]
        },
        approval: {
          resultKey: "approvalDecision",
          approveLabel: "Approve",
          rejectLabel: "Reject"
        }
      },
      {
        id: "write-result",
        title: "Write result",
        type: "result",
        result: {
          source: "state",
          stateKey: "reviewReport",
          sinks: [{ type: "file", path: ".bob/artifacts/review.md" }]
        }
      }
    ],
    artifacts: [
      {
        id: "reviewReport",
        producedBy: "review",
        path: ".bob/workflows/runs/{{run.id}}/artifacts/review/reviewReport.md",
        schema: "text/markdown"
      },
      {
        id: "auditTrail",
        producedBy: "write-result",
        path: ".bob/artifacts/audit.json",
        schema: "application/json"
      }
    ],
    body: "# Readiness Sample\n"
  }
}

function invalidMissingAgentResultModel() {
  const model = validModel()
  model.steps.splice(2, 0, {
    id: "draft-without-output",
    title: "Draft without output",
    type: "agent",
    prompt: "Draft text without persisting a result key."
  })
  return model
}

function candidate(plan, stepId, resultKey, source = "step") {
  return plan.candidates.find((item) => item.stepId === stepId && item.resultKey === resultKey && item.source === source)
}

test("planner discovers reusable outputs without mutating the authoring model", () => {
  const model = validModel()
  const before = structuredClone(model)
  const plan = planWorkflowSkipResumeReadiness(model)

  assert.deepEqual(model, before)
  assert.equal(plan.fileBoundBefore, false)
  assert.equal(plan.fileBoundAfter, true)
  assert.deepEqual(plan.errors, [])

  const command = candidate(plan, "collect-context", "collectedContext")
  assert.equal(command.status, "proposed")
  assert.deepEqual(command.proposedArtifact, {
    id: "collectedContext",
    producedBy: "collect-context",
    path: ".bob/workflows/runs/{{run.id}}/artifacts/collect-context/collectedContext.json",
    schema: "application/json"
  })

  const agent = candidate(plan, "review", "reviewReport")
  assert.equal(agent.status, "ready")
  assert.deepEqual(agent.existingArtifact, before.artifacts[0])

  const form = candidate(plan, "operator-input", "operatorInput", "form")
  assert.equal(form.status, "proposed")
  assert.equal(form.proposedArtifact.schema, "application/json")

  const approval = candidate(plan, "operator-input", "approvalDecision", "approval")
  assert.equal(approval.status, "proposed")
  assert.ok(plan.selectedCandidateIds.includes(command.candidateId))
  assert.ok(plan.selectedCandidateIds.includes(agent.candidateId))
  assert.ok(plan.selectedCandidateIds.includes(form.candidateId))
  assert.ok(plan.selectedCandidateIds.includes(approval.candidateId))
  assert.match(plan.diff, /\+ x-skipResume\.fileBound: true/)
  assert.match(plan.diff, /\+ artifact collectedContext/)
  assert.match(plan.diff, /= artifact reviewReport/)
})

test("planner blocks file-bound apply when an agent has no resultKey", () => {
  const model = invalidMissingAgentResultModel()
  const plan = planWorkflowSkipResumeReadiness(model)

  assert.ok(plan.unavailable.some((item) => item.stepId === "draft-without-output" && item.code === "agent-result-key-missing"))
  assert.ok(plan.errors.some((message) => message.includes("draft-without-output") && message.includes("resultKey")))
  assert.throws(
    () => applyWorkflowSkipResumeReadiness(model, plan.selectedCandidateIds, plan.fingerprint),
    /cannot be applied|resultKey/i
  )
  assert.equal(model.skipResume, undefined)
})

test("apply adds only selected missing artifacts and preserves existing definitions", () => {
  const model = validModel()
  const before = structuredClone(model)
  const preview = planWorkflowSkipResumeReadiness(model)
  const selected = [
    candidate(preview, "collect-context", "collectedContext").candidateId,
    candidate(preview, "review", "reviewReport").candidateId,
    candidate(preview, "operator-input", "operatorInput", "form").candidateId
  ]
  const selectedPreview = planWorkflowSkipResumeReadiness(model, selected)
  const applied = applyWorkflowSkipResumeReadiness(model, selected, selectedPreview.fingerprint)

  assert.deepEqual(model, before)
  assert.deepEqual(applied.model.skipResume, { fileBound: true })
  assert.deepEqual(applied.model.artifacts.slice(0, before.artifacts.length), before.artifacts)
  assert.deepEqual(applied.model.artifacts.slice(before.artifacts.length), [
    {
      id: "collectedContext",
      producedBy: "collect-context",
      path: ".bob/workflows/runs/{{run.id}}/artifacts/collect-context/collectedContext.json",
      schema: "application/json"
    },
    {
      id: "operatorInput",
      producedBy: "operator-input",
      path: ".bob/workflows/runs/{{run.id}}/artifacts/operator-input/operatorInput.json",
      schema: "application/json"
    }
  ])
  assert.equal(applied.plan.fingerprint, selectedPreview.fingerprint)
})

test("planner fails closed on artifact id and run-scope conflicts", () => {
  const crossProducer = validModel()
  crossProducer.artifacts.unshift({
    id: "collectedContext",
    producedBy: "review",
    path: ".bob/workflows/runs/{{run.id}}/artifacts/review/collectedContext.json",
    schema: "application/json"
  })
  const crossPlan = planWorkflowSkipResumeReadiness(crossProducer)
  assert.equal(candidate(crossPlan, "collect-context", "collectedContext").status, "conflict")
  assert.ok(crossPlan.errors.some((message) => message.includes("collectedContext") && message.includes("review")))
  assert.throws(() => applyWorkflowSkipResumeReadiness(crossProducer, crossPlan.selectedCandidateIds, crossPlan.fingerprint), /cannot be applied|conflict/i)

  const unscoped = validModel()
  unscoped.artifacts[0] = {
    id: "reviewReport",
    producedBy: "review",
    path: ".bob/artifacts/review.md",
    schema: "text/markdown"
  }
  const unscopedPlan = planWorkflowSkipResumeReadiness(unscoped)
  assert.equal(candidate(unscopedPlan, "review", "reviewReport").status, "conflict")
  assert.ok(unscopedPlan.errors.some((message) => message.includes("run-scoped")))
})

test("apply rejects a stale preview fingerprint", () => {
  const model = validModel()
  const preview = planWorkflowSkipResumeReadiness(model)
  model.steps[0].title = "Changed after preview"

  assert.throws(
    () => applyWorkflowSkipResumeReadiness(model, preview.selectedCandidateIds, preview.fingerprint),
    /changed after the readiness preview|stale/i
  )
  assert.equal(model.skipResume, undefined)
})

test("applied readiness round-trips through YAML and passes strict validation", () => {
  const model = validModel()
  model.artifacts = model.artifacts.filter((artifact) => artifact.id !== "auditTrail")
  const preview = planWorkflowSkipResumeReadiness(model)
  const applied = applyWorkflowSkipResumeReadiness(model, preview.selectedCandidateIds, preview.fingerprint)
  const rendered = serializeAuthoringModelToMarkdown(applied.model)

  assert.match(rendered.markdown, /x-skipResume:\n  fileBound: true/)
  assert.match(rendered.markdown, /id: collectedContext[\s\S]*producedBy: collect-context[\s\S]*\{\{run\.id\}\}/)

  const validation = validateWorkflowText({
    sourceId: "workflow-register",
    filePath: rendered.filePath,
    text: rendered.markdown,
    strict: true,
    availableActionProviders: ["sample.collect"]
  })
  assert.equal(validation.ok, true, validation.diagnostics.map((item) => item.message).join("\n"))

  const loaded = loadAuthoringModelFromMarkdown({
    sourceId: "workflow-register",
    filePath: rendered.filePath,
    text: rendered.markdown
  })
  assert.deepEqual(loaded.model.skipResume, { fileBound: true })
  assert.equal(loaded.model.unknownFrontMatter && Object.hasOwn(loaded.model.unknownFrontMatter, "x-skipResume"), false)

  const roundTripped = serializeAuthoringModelToMarkdown(loaded.model)
  assert.equal((roundTripped.markdown.match(/x-skipResume:/g) || []).length, 1)
  assert.equal(validateWorkflowText({ sourceId: "workflow-register", filePath: roundTripped.filePath, text: roundTripped.markdown, strict: true, availableActionProviders: ["sample.collect"] }).ok, true)
})
