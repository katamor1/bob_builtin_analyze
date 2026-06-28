const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-"))
}

test("v1 workflow parser accepts inputs, execution contract metadata, typed steps, and result sinks", () => {
  const { parseWorkflowMarkdown } = require("../out/core/parser")

  const parsed = parseWorkflowMarkdown({
    sourceId: "workflow-register",
    filePath: "C:/repo/.bob/workflows/sample/WORKFLOW.md",
    text: `---
schemaVersion: workflow-register/v1
name: sample
description: Sample workflow.
title: Sample Workflow
mode: sample-reviewer
category: code-review
permissions:
  - read
requires:
  workspace: true
  bob:
    minVersion: "2.0.0"
  files:
    - .bob/skills/sample/SKILL.md
inputs:
  revision:
    type: string
    title: Revision
    required: true
  target:
    type: select
    title: Target
    requiredWhen: "inputs.revision != ''"
    options:
      - trunk
      - branch
preflight:
  - id: check-workspace
    title: Check workspace
    required: true
    checks:
      - workspaceOpen
    files:
      - .bob/skills/sample/SKILL.md
    failurePolicy: stop
tools:
  sample.collect:
    purpose: Collect context.
    required: true
    outputKey: reviewContext
    failurePolicy: stop
guardrails:
  allowedCommands:
    - sample.collect
  deniedCommands:
    - shell
  requireApproval:
    - id: large-review
      when: "state.changedFiles > 100"
      message: Large review detected.
artifacts:
  - id: reviewContext
    producedBy: collect
    path: .bob/workflows/runs/{{run.id}}/steps/collect.json
completion:
  summary: markdown
  includeArtifacts: true
  validateResult: true
  visualization:
    type: mermaid
    enabled: true
steps:
  - id: collect
    title: Collect context
    type: command
    action:
      provider: sample.collect
      args:
        revision: "{{inputs.revision}}"
    resultKey: reviewContext
  - id: save
    title: Save context
    type: result
    result:
      source: state
      stateKey: reviewContext
      sinks:
        - type: file
          path: ".bob/workflows/runs/{{run.id}}/steps/save.result.json"
---
# Sample
`
  })

  assert.equal(parsed.ok, true, parsed.diagnostics.join("\n"))
  assert.equal(parsed.workflow.schemaVersion, "workflow-register/v1")
  assert.equal(parsed.workflow.mode, "sample-reviewer")
  assert.equal(parsed.workflow.category, "code-review")
  assert.equal(parsed.workflow.requires.workspace, true)
  assert.equal(parsed.workflow.requires.bob.minVersion, "2.0.0")
  assert.equal(parsed.workflow.inputs.revision.type, "string")
  assert.equal(parsed.workflow.inputs.target.requiredWhen, "inputs.revision != ''")
  assert.equal(parsed.workflow.preflight[0].id, "check-workspace")
  assert.equal(parsed.workflow.tools["sample.collect"].outputKey, "reviewContext")
  assert.equal(parsed.workflow.guardrails.allowedCommands[0], "sample.collect")
  assert.equal(parsed.workflow.guardrails.requireApproval[0].id, "large-review")
  assert.equal(parsed.workflow.artifacts[0].id, "reviewContext")
  assert.equal(parsed.workflow.completion.visualization.type, "mermaid")
  assert.equal(parsed.workflow.engineSteps.length, 2)
  assert.equal(parsed.workflow.engineSteps[0].type, "command")
  assert.equal(parsed.workflow.engineSteps[0].action.provider, "sample.collect")
  assert.equal(parsed.workflow.engineSteps[1].type, "result")
  assert.equal(parsed.workflow.engineSteps[1].result.sinks[0].type, "file")
})

test("v1 workflow parser reports schema validation errors", () => {
  const { parseWorkflowMarkdown } = require("../out/core/parser")

  const parsed = parseWorkflowMarkdown({
    sourceId: "workflow-register",
    filePath: "C:/repo/.bob/workflows/bad/WORKFLOW.md",
    text: `---
schemaVersion: workflow-register/v1
name: bad
steps:
  - id: missing-title
    type: command
---
# Bad
`
  })

  assert.equal(parsed.ok, false)
  assert.match(parsed.diagnostics.join("\n"), /description/)
  assert.match(parsed.diagnostics.join("\n"), /action/)
})

test("action registry executes registered providers and rejects unknown providers", async () => {
  const { ActionRegistry } = require("../out/core/actionRegistry")
  const registry = new ActionRegistry()
  registry.register({
    id: "sample.collect",
    execute: async ({ args, inputs }) => ({ revision: args.revision, target: inputs.target })
  })

  const ok = await registry.execute("sample.collect", {
    args: { revision: "42" },
    inputs: { target: "trunk" }
  })
  const missing = await registry.execute("sample.missing", { args: {}, inputs: {} })

  assert.equal(ok.ok, true)
  assert.deepEqual(ok.value, { revision: "42", target: "trunk" })
  assert.equal(missing.ok, false)
  assert.match(missing.error, /Unsupported action provider/)
})

test("result sink registry writes command and file sinks with allowlist enforcement", async () => {
  const { createDefaultResultSinkRegistry } = require("../out/core/resultSinkRegistry")
  const workspaceRoot = tempDir()
  const calls = []
  const registry = createDefaultResultSinkRegistry({
    workspaceRoot,
    executeCommand: async (...args) => {
      calls.push(args)
      return { status: "ok" }
    },
    allowedCommandSinks: ["bobBazaar.captureReviewResult"]
  })

  const commandResult = await registry.write({
    type: "command",
    command: "bobBazaar.captureReviewResult",
    args: ["extra"]
  }, {
    workflowId: "workflow-register.sample",
    runId: "run-1",
    stepId: "save",
    text: "{\"ok\":true}"
  })
  const rejected = await registry.write({
    type: "command",
    command: "workbench.action.files.save"
  }, {
    workflowId: "workflow-register.sample",
    runId: "run-1",
    stepId: "save",
    text: "unused"
  })
  const fileResult = await registry.write({
    type: "file",
    path: ".bob/workflows/runs/{{run.id}}/steps/{{step.id}}.result.json"
  }, {
    workflowId: "workflow-register.sample",
    runId: "run-1",
    stepId: "save",
    text: "{\"ok\":true}"
  })

  assert.equal(commandResult.ok, true)
  assert.deepEqual(calls, [["bobBazaar.captureReviewResult", "{\"ok\":true}", "extra"]])
  assert.equal(rejected.ok, false)
  assert.match(rejected.error, /Unsupported result command/)
  assert.equal(fileResult.ok, true)
  assert.equal(fs.readFileSync(path.join(workspaceRoot, ".bob", "workflows", "runs", "run-1", "steps", "save.result.json"), "utf8"), "{\"ok\":true}")
})

test("workflow engine runs command and file-result steps without Bob and persists run state", async () => {
  const { ActionRegistry } = require("../out/core/actionRegistry")
  const { WorkflowEngine } = require("../out/core/engine")
  const { createDefaultResultSinkRegistry } = require("../out/core/resultSinkRegistry")
  const { FileRunStateStore } = require("../out/core/runStateStore")

  const workspaceRoot = tempDir()
  const actions = new ActionRegistry()
  actions.register({
    id: "sample.collect",
    execute: async ({ args }) => ({ revision: args.revision, status: "ready" })
  })
  const sinks = createDefaultResultSinkRegistry({ workspaceRoot, executeCommand: async () => undefined })
  const runStore = new FileRunStateStore({ workspaceRoot, now: () => "2026-06-28T00:00:00.000Z" })
  const engine = new WorkflowEngine({ actions, resultSinks: sinks, runStore })

  const workflow = {
    id: "workflow-register.sample",
    name: "sample",
    label: "Sample",
    schemaVersion: "workflow-register/v1",
    inputs: { revision: { type: "string", required: true } },
    engineSteps: [
      {
        id: "collect",
        title: "Collect",
        type: "command",
        action: { provider: "sample.collect", args: { revision: "{{inputs.revision}}" } },
        resultKey: "reviewContext"
      },
      {
        id: "save",
        title: "Save",
        type: "result",
        result: {
          source: "state",
          stateKey: "reviewContext",
          sinks: [{ type: "file", path: ".bob/workflows/runs/{{run.id}}/steps/save.result.json" }]
        }
      }
    ]
  }

  const run = await engine.runWorkflow(workflow, { revision: "77" })
  const saved = JSON.parse(fs.readFileSync(path.join(workspaceRoot, ".bob", "workflows", "runs", run.runId, "run.json"), "utf8"))
  const resultPath = path.join(workspaceRoot, ".bob", "workflows", "runs", run.runId, "steps", "save.result.json")

  assert.equal(run.status, "completed")
  assert.equal(saved.status, "completed")
  assert.equal(saved.steps.map((step) => step.status).join(","), "completed,completed")
  assert.equal(JSON.parse(fs.readFileSync(resultPath, "utf8")).revision, "77")
})

test("workflow engine holds manual steps and resumes them", async () => {
  const { ActionRegistry } = require("../out/core/actionRegistry")
  const { WorkflowEngine } = require("../out/core/engine")
  const { createDefaultResultSinkRegistry } = require("../out/core/resultSinkRegistry")
  const { FileRunStateStore } = require("../out/core/runStateStore")

  const workspaceRoot = tempDir()
  const runStore = new FileRunStateStore({ workspaceRoot, now: () => "2026-06-28T00:00:00.000Z" })
  const engine = new WorkflowEngine({
    actions: new ActionRegistry(),
    resultSinks: createDefaultResultSinkRegistry({ workspaceRoot, executeCommand: async () => undefined }),
    runStore
  })
  const workflow = {
    id: "workflow-register.manual",
    name: "manual",
    label: "Manual",
    schemaVersion: "workflow-register/v1",
    inputs: {},
    engineSteps: [
      { id: "approve", title: "Approve", type: "manual" },
      { id: "write", title: "Write", type: "result", result: { source: "literal", text: "done", sinks: [{ type: "file", path: ".bob/workflows/runs/{{run.id}}/steps/write.txt" }] } }
    ]
  }

  const held = await engine.runWorkflow(workflow, {})
  const resumed = await engine.resumeRun(held.runId, { workflow, completeHeldStep: true })

  assert.equal(held.status, "held")
  assert.equal(held.currentStep, "approve")
  assert.equal(resumed.status, "completed")
  assert.equal(fs.readFileSync(path.join(workspaceRoot, ".bob", "workflows", "runs", held.runId, "steps", "write.txt"), "utf8"), "done")
})
