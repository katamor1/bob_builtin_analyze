const test = require("node:test")
const assert = require("node:assert/strict")

const { createAuthoringModelFromTemplate } = require("../out/core/workflowAuthoringDefaults")
const { loadAuthoringModelFromMarkdown } = require("../out/core/workflowAuthoringLoader")
const { serializeAuthoringModelToMarkdown } = require("../out/core/workflowAuthoringSerializer")
const { validateWorkflowText } = require("../out/core/workflowValidator")

const fileBoundWorkflow = `---
schemaVersion: workflow-register/v1
name: builder-file-bound
description: Builder file-bound workflow.
title: Builder File Bound
mode: agent
workspaceRequired: true
x-skipResume:
  fileBound: true
steps:
  - id: collect-context
    title: Collect context
    type: agent
    prompt: Collect reusable context.
    resultKey: collectedContext
artifacts:
  - id: collectedContext
    producedBy: collect-context
    path: .bob/workflows/runs/{{run.id}}/artifacts/collect-context/collectedContext.md
    schema: text/markdown
---
# Builder File Bound
`

function validateRendered(rendered) {
  return validateWorkflowText({
    sourceId: "workflow-register",
    filePath: rendered.filePath,
    text: rendered.markdown,
    strict: true
  })
}

test("loader exposes x-skipResume as explicit authoring metadata and round-trips it", () => {
  const loaded = loadAuthoringModelFromMarkdown({
    sourceId: "workflow-register",
    filePath: ".bob/workflows/builder-file-bound/WORKFLOW.md",
    text: fileBoundWorkflow
  })

  assert.deepEqual(loaded.model.skipResume, { fileBound: true })
  assert.equal(loaded.model.unknownFrontMatter?.["x-skipResume"], undefined)

  const rendered = serializeAuthoringModelToMarkdown(loaded.model)
  assert.match(rendered.markdown, /x-skipResume:\n\s+fileBound: true/)
  const validation = validateRendered(rendered)
  assert.equal(validation.ok, true, validation.diagnostics.map((item) => item.message).join("\n"))
})

test("loader preserves unknown x-skipResume subfields across Builder round-trip", () => {
  const source = fileBoundWorkflow.replace(
    "  fileBound: true\n",
    "  fileBound: true\n  futureMode: cautious\n  provenance:\n    retain: true\n"
  )
  const loaded = loadAuthoringModelFromMarkdown({
    sourceId: "workflow-register",
    filePath: ".bob/workflows/builder-file-bound/WORKFLOW.md",
    text: source
  })

  assert.deepEqual(loaded.model.skipResume, { fileBound: true })
  assert.deepEqual(loaded.model.unknownFrontMatter?.["x-skipResume"], {
    futureMode: "cautious",
    provenance: { retain: true }
  })

  const rendered = serializeAuthoringModelToMarkdown(loaded.model)
  assert.match(rendered.markdown, /x-skipResume:\n\s+futureMode: cautious\n\s+provenance:\n\s+retain: true\n\s+fileBound: true/)
  const validation = validateRendered(rendered)
  assert.equal(validation.ok, true, validation.diagnostics.map((item) => item.message).join("\n"))
})

test("serializer emits explicit skip resume metadata from a new authoring model", () => {
  const model = createAuthoringModelFromTemplate({
    name: "builder-new-file-bound",
    title: "Builder New File Bound",
    description: "Generate file-bound metadata in Builder.",
    template: "simple-agent"
  })
  model.steps[0].resultKey = "analysisReport"
  model.skipResume = { fileBound: true }
  model.artifacts.push({
    id: "analysisReport",
    producedBy: model.steps[0].id,
    path: `.bob/workflows/runs/{{run.id}}/artifacts/${model.steps[0].id}/analysisReport.md`,
    schema: "text/markdown"
  })

  const rendered = serializeAuthoringModelToMarkdown(model)
  assert.match(rendered.markdown, /x-skipResume:\n\s+fileBound: true/)
  const validation = validateRendered(rendered)
  assert.equal(validation.ok, true, validation.diagnostics.map((item) => item.message).join("\n"))
})
