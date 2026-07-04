const assert = require("node:assert/strict")
const { test } = require("node:test")

const { buildStepMessage, buildWorkflowStartMessage } = require("../out/bobWorkflowMessages")

function workflow(overrides = {}) {
  return {
    id: "workflow-register.sample",
    name: "sample",
    label: "Sample Workflow",
    menuLabel: "Sample Workflow",
    description: "Sample workflow.",
    promptWithoutTodo: "Follow the workflow.",
    mode: "agent",
    todoEnabled: true,
    todoAsSteps: true,
    stepMessage: "step",
    stepExecution: { mode: "engineSteps", allowOutOfOrder: false, showInBob: true },
    todos: [
      { id: "collect", text: "Collect", raw: "- collect" },
      { id: "analyze", text: "Analyze", raw: "- analyze" }
    ],
    ...overrides
  }
}

const stepDefinition = {
  id: "collect",
  prompt: "Collect documents.",
  commandArgs: [],
  sendResult: true,
  required: true,
  completeOnSuccess: true,
  runAgent: false,
  includeState: [],
  maxResultBytes: 1000,
  stateRequired: false,
  captureResult: false,
  resultCommandArgs: []
}

test("engine step UI first step message does not create a duplicate Bob todo list", () => {
  const message = buildStepMessage(workflow(), workflow().todos[0], 0, stepDefinition)

  assert.match(message, /<workflow_step index="1" id="collect">/)
  assert.match(message, /Collect documents\./)
  assert.doesNotMatch(message, /<workflow_todos>/)
  assert.doesNotMatch(message, /First, create or update your Todo list/)
})

test("plain workflow start message still includes workflow todos when not using engine step UI", () => {
  const definition = workflow({ stepExecution: { mode: "full", allowOutOfOrder: false, showInBob: true } })
  const message = buildWorkflowStartMessage(definition, definition.todos[0], 0, stepDefinition)

  assert.match(message, /<workflow_todos>/)
  assert.match(message, /- \[ \] collect: Collect/)
})

test("command result truncation uses UTF-8 byte length", () => {
  const message = buildStepMessage(
    workflow(),
    workflow().todos[0],
    0,
    { ...stepDefinition, maxResultBytes: 24 },
    { command: "sample.collect", ok: true, value: "あいうえおかきくけこ" }
  )
  const match = message.match(/<workflow_command_result>\n([\s\S]*?)\n<\/workflow_command_result>/)
  assert.ok(match)
  const payload = JSON.parse(match[1])

  assert.match(payload.value, /\[truncated\]/)
  assert.ok(Buffer.byteLength(payload.value, "utf8") <= 24)
  assert.doesNotThrow(() => Buffer.from(payload.value, "utf8").toString("utf8"))
})
