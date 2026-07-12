const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const {
  applySkipResumeReadiness,
  buildSkipResumeReadinessPreview
} = require("../out/core/authoring/workflowSkipResumeReadinessPreview")

function model() {
  return {
    metadata: {
      schemaVersion: "workflow-register/v1",
      name: "skip-resume-preview",
      title: "Skip Resume Preview",
      description: "Preview file-bound readiness.",
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
        prompt: "Review reusable context.",
        includeState: ["collectedContext"],
        resultKey: "reviewReport"
      }
    ],
    artifacts: []
  }
}

const validationContext = { sourceId: "workflow-register" }

test("preview and apply share the same planner and strict validation evidence", () => {
  const input = model()
  const original = structuredClone(input)
  const preview = buildSkipResumeReadinessPreview(input, undefined, validationContext)
  const applied = applySkipResumeReadiness(input, preview.selectedStepIds, validationContext)

  assert.deepEqual(input, original)
  assert.equal(preview.ok, true)
  assert.equal(applied.ok, true)
  assert.deepEqual(applied.candidates, preview.candidates)
  assert.deepEqual(applied.blockingIssues, preview.blockingIssues)
  assert.deepEqual(applied.changes, preview.changes)
  assert.deepEqual(applied.selectedStepIds, preview.selectedStepIds)
  assert.equal(applied.beforeMarkdown, preview.beforeMarkdown)
  assert.equal(applied.afterMarkdown, preview.afterMarkdown)
  assert.deepEqual(applied.diagnostics, preview.diagnostics)
  assert.deepEqual(applied.model, preview.nextModel)
  assert.doesNotMatch(preview.beforeMarkdown, /x-skipResume/)
  assert.match(preview.afterMarkdown, /x-skipResume:\n\s+fileBound: true/)
})

test("partial selection is previewed but apply is refused when strict validation needs another artifact", () => {
  const preview = buildSkipResumeReadinessPreview(model(), ["collect-context"], validationContext)
  const applied = applySkipResumeReadiness(model(), ["collect-context"], validationContext)

  assert.equal(preview.ok, false)
  assert.equal(applied.ok, false)
  assert.equal(applied.model, undefined)
  assert.ok(preview.diagnostics.some((item) => item.severity === "error" && item.message.includes("step 'review'") && item.message.includes("no matching artifact")))
})

test("planner blockers prevent apply without changing the source model", () => {
  const input = model()
  delete input.steps[1].resultKey
  const original = structuredClone(input)

  const preview = buildSkipResumeReadinessPreview(input, undefined, validationContext)
  const applied = applySkipResumeReadiness(input, preview.selectedStepIds, validationContext)

  assert.equal(preview.ok, false)
  assert.equal(applied.ok, false)
  assert.equal(applied.model, undefined)
  assert.deepEqual(input, original)
  assert.ok(preview.blockingIssues.some((issue) => issue.includes("agent step 'review'") && issue.includes("resultKey")))
})

test("workflow builder host handles readiness preview and apply messages", () => {
  const panelSource = fs.readFileSync(path.join(__dirname, "..", "src", "webview", "workflowBuilderPanel.ts"), "utf8")

  assert.match(panelSource, /previewSkipResumeReadiness/)
  assert.match(panelSource, /applySkipResumeReadiness/)
  assert.match(panelSource, /skipResumeReadinessPreviewResult/)
  assert.match(panelSource, /skipResumeReadinessApplied/)
  assert.match(panelSource, /buildSkipResumeReadinessPreview/)
})
