"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")

const { parseWorkflowMarkdown } = require("../out/core/parser")
const { isCommandResultSink, isFileResultSink } = require("../out/core/model")
const { createAuthoringModelFromTemplate } = require("../out/core/workflowAuthoringDefaults")
const { serializeAuthoringModelToMarkdown } = require("../out/core/workflowAuthoringSerializer")
const { validateStepDraft } = require("../out/core/workflowAuthoringStepDraftValidation")
const { validateWorkflowText } = require("../out/core/workflowValidator")
const { renderWorkflowBuilderStepRendererScript } = require("../out/webview/workflowBuilderStepRendererScript")

function customSinkWorkflow(sinkLines) {
  return `---
schemaVersion: workflow-register/v1
name: custom-sink
description: Exercise a declared custom result sink.
steps:
  - id: publish
    title: Publish result
    type: result
    result:
      source: literal
      text: ready
      sinks:
${sinkLines.map((line) => `        ${line}`).join("\n")}
---
# Custom sink
`
}

function parse(text) {
  return parseWorkflowMarkdown({
    sourceId: "workflow-register",
    filePath: ".bob/workflows/custom-sink/WORKFLOW.md",
    text
  })
}

function validate(text) {
  return validateWorkflowText({
    sourceId: "workflow-register",
    filePath: ".bob/workflows/custom-sink/WORKFLOW.md",
    text
  })
}

test("custom result sinks preserve their versioned payload instead of falling back to file", () => {
  const text = customSinkWorkflow([
    "- type: local.capture",
    "  contractVersion: local.capture/v1",
    "  payload:",
    "    channel: audit",
    "    options:",
    "      durable: true"
  ])
  const parsed = parse(text)
  const validation = validate(text)

  assert.equal(parsed.ok, true, parsed.diagnostics.join("\n"))
  assert.equal(validation.ok, true, validation.diagnostics.map((item) => item.message).join("\n"))
  assert.deepEqual(parsed.workflow.engineSteps[0].result.sinks[0], {
    type: "local.capture",
    contractVersion: "local.capture/v1",
    payload: { channel: "audit", options: { durable: true } }
  })
})

test("custom result sink schema is closed and requires a positive contract version and object payload", () => {
  const invalidSinks = [
    ["- type: local.capture", "  payload: {}"],
    ["- type: local.capture", "  contractVersion: local.capture/v0", "  payload: {}"],
    ["- type: local.capture", "  contractVersion: local.capture/v1"],
    ["- type: local.capture", "  contractVersion: local.capture/v1", "  payload: value"],
    ["- type: local.capture", "  contractVersion: local.capture/v1", "  payload: {}", "  extra: rejected"],
    ["- type: file", "  contractVersion: file/v1", "  payload: {}"]
  ]

  for (const sink of invalidSinks) {
    const result = validate(customSinkWorkflow(sink))
    assert.equal(result.ok, false, `unexpectedly accepted:\n${sink.join("\n")}`)
  }
})

test("authoring serialization and draft validation preserve opaque custom sink payloads", () => {
  const model = createAuthoringModelFromTemplate({
    name: "custom-authoring",
    title: "Custom Authoring",
    description: "Preserve a custom sink without treating it as a file.",
    template: "artifact-output"
  })
  const stepIndex = model.steps.findIndex((step) => step.type === "result")
  const originalStep = model.steps[stepIndex]
  const customSink = {
    type: "local.capture",
    contractVersion: "local.capture/v2",
    payload: { channel: "review", retry: { count: 2 } }
  }
  const draftStep = {
    ...originalStep,
    result: { ...originalStep.result, sinks: [customSink] }
  }
  model.steps[stepIndex] = draftStep

  const draft = validateStepDraft({ model, originalStep, draftStep, stepIndex })
  assert.equal(
    draft.diagnostics.some((item) => item.code.startsWith("result.fileSink.")),
    false,
    JSON.stringify(draft.diagnostics)
  )

  const serialized = serializeAuthoringModelToMarkdown(model)
  const reparsed = parseWorkflowMarkdown({
    sourceId: "workflow-register",
    filePath: serialized.filePath,
    text: serialized.markdown
  })
  assert.equal(reparsed.ok, true, reparsed.diagnostics.join("\n"))
  assert.deepEqual(reparsed.workflow.engineSteps[stepIndex].result.sinks[0], customSink)
})

test("Builder renders custom sinks read-only instead of presenting them as file sinks", () => {
  const script = renderWorkflowBuilderStepRendererScript()
  assert.match(script, /sink\.type !== 'command' && sink\.type !== 'file'/)
  assert.match(script, /Custom sink fields are source-managed and read-only in Builder\./)
  assert.match(script, /sink\.contractVersion/)
  assert.match(script, /JSON\.stringify\(sink\.payload \|\| \{\}/)
})

test("built-in sink guards reject forged custom records that only reuse a reserved type", () => {
  assert.equal(isFileResultSink({ type: "file", contractVersion: "local.capture/v1", payload: {} }), false)
  assert.equal(isCommandResultSink({ type: "command", contractVersion: "local.capture/v1", payload: {} }), false)
})
