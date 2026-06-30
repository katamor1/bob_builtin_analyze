const test = require("node:test")
const assert = require("node:assert/strict")

const { createAuthoringModelFromTemplate } = require("../out/core/workflowAuthoringDefaults")
const { serializeAuthoringModelToMarkdown } = require("../out/core/workflowAuthoringSerializer")
const { validateWorkflowText } = require("../out/core/workflowValidator")

test("serializes a simple-agent authoring model into a valid workflow", () => {
  const model = createAuthoringModelFromTemplate({
    name: "gui-sample",
    title: "GUI Sample",
    description: "GUI で作成したサンプル workflow を実行する。",
    template: "simple-agent"
  })
  const result = serializeAuthoringModelToMarkdown(model)
  assert.equal(result.name, "gui-sample")
  assert.match(result.markdown, /schemaVersion: workflow-register\/v1/)
  assert.match(result.markdown, /steps:/)

  const validation = validateWorkflowText({ sourceId: "workflow-register", filePath: result.filePath, text: result.markdown })
  assert.equal(validation.ok, true)
})

test("serializes an artifact-output authoring model with result handoff", () => {
  const model = createAuthoringModelFromTemplate({
    name: "gui-artifact",
    title: "GUI Artifact",
    description: "AI 結果を Markdown 成果物へ保存する。",
    template: "artifact-output"
  })
  const result = serializeAuthoringModelToMarkdown(model)
  assert.match(result.markdown, /artifacts:/)
  assert.match(result.markdown, /stateKey: analysisReport/)

  const validation = validateWorkflowText({ sourceId: "workflow-register", filePath: result.filePath, text: result.markdown })
  assert.equal(validation.ok, true)
})
