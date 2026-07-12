const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { validateWorkflowText } = require("../out/core/workflowValidator")

test("automatic pause agent-call limit is an integer in the public schema", () => {
  const schema = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "schema", "workflow-register.v1.schema.json"),
    "utf8"
  ))
  assert.equal(
    schema.properties.runControl.properties.limits.properties.maxAgentStepsPerRun.type,
    "integer"
  )
})

test("workflow validation rejects fractional automatic pause agent-call limits", () => {
  const text = `---
schemaVersion: workflow-register/v1
name: fractional-agent-limit
description: Reject a fractional agent-call limit.
runControl:
  limits:
    maxAgentStepsPerRun: 1.5
steps:
  - id: analyze
    title: Analyze
    type: agent
    prompt: Analyze.
---
# Fractional agent limit
`
  const result = validateWorkflowText({
    sourceId: "workflow-register",
    filePath: "C:/repo/.bob/workflows/fractional-agent-limit/WORKFLOW.md",
    text
  })

  assert.equal(result.ok, false)
  assert.match(
    result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    /maxAgentStepsPerRun.*integer/
  )
})
