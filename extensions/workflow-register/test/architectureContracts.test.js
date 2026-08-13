const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { extensionRoot } = require("./helpers/sourceReader")

function readDoc(...segments) {
  return fs.readFileSync(path.join(extensionRoot, "docs", ...segments), "utf8")
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function fencedInterfaceBlock(contract, interfaceName) {
  const match = contract.match(new RegExp(
    "```(?:ts|typescript)\\r?\\n(interface\\s+" + escapeRegExp(interfaceName) + "\\s*\\{[\\s\\S]*?\\r?\\n\\})\\r?\\n```"
  ))
  assert.ok(match, `${interfaceName} must be documented in a fenced TypeScript block`)
  return match[1]
}

function assertWorkflowExecutionInputContract(contract) {
  const actionInput = fencedInterfaceBlock(contract, "ActionExecutionInput")
  for (const field of ["latestAssistantText", "resultText", "artifactText"]) {
    assert.match(
      actionInput,
      new RegExp(`^\\s*${field}\\?: string\\s*$`, "m"),
      `ActionExecutionInput must define optional ${field}`
    )
  }
  assert.doesNotMatch(
    actionInput,
    /^\s*(?:bobRoot|workspaceRoot)\??\s*:/m,
    "ActionExecutionInput must not document stale bobRoot or workspaceRoot fields"
  )

  const agentInput = fencedInterfaceBlock(contract, "AgentExecutionInput")
  for (const [field, shape] of [
    ["workflowId", "string"],
    ["runId", "string"],
    ["stepId", "string"],
    ["prompt", "string"],
    ["inputs", "Record<string, unknown>"],
    ["state", "Record<string, string>"]
  ]) {
    assert.match(
      agentInput,
      new RegExp(`^\\s*${field}: ${escapeRegExp(shape)}\\s*$`, "m"),
      `AgentExecutionInput must define required ${field}`
    )
  }
  for (const field of ["logicalWorkflowId", "workflowRoot", "workflowFile", "workflowFolderName"]) {
    assert.match(
      agentInput,
      new RegExp(`^\\s*${field}\\?: string\\s*$`, "m"),
      `AgentExecutionInput must define optional ${field}`
    )
  }
}

test("workflow action contract docs describe workflow-register public API and execution inputs", () => {
  const contract = readDoc("workflow-action-contracts-ja.md")

  for (const phrase of [
    "registerActionProvider",
    "registerAgentProvider",
    "registerResultSink",
    "runWorkflow",
    "runWorkflowStep",
    "runNextStep",
    "result sink",
    "失敗"
  ]) {
    assert.ok(contract.includes(phrase), `workflow action contract must document: ${phrase}`)
  }
  assertWorkflowExecutionInputContract(contract)
})

test("workflow execution input assertions reject stale interface field shapes", () => {
  const contract = readDoc("workflow-action-contracts-ja.md").replace(/\r\n/g, "\n")
  const missingActionFieldsContract = contract.replace(
    [
      "  latestAssistantText?: string",
      "  resultText?: string",
      "  artifactText?: string"
    ].join("\n"),
    ""
  )
  const staleActionFieldsContract = contract.replace(
    "  latestAssistantText?: string",
    [
      "  bobRoot?: string",
      "  workspaceRoot?: string",
      "  latestAssistantText?: string"
    ].join("\n")
  )
  const staleAgentContract = contract.replace(
    ["  runId: string", "  stepId: string"].join("\n"),
    ["  runId?: string", "  stepId?: string"].join("\n")
  )

  assert.notEqual(missingActionFieldsContract, contract, "ActionExecutionInput missing-field fixture must change the interface")
  assert.throws(
    () => assertWorkflowExecutionInputContract(missingActionFieldsContract),
    /ActionExecutionInput must define optional latestAssistantText/
  )
  assert.notEqual(staleActionFieldsContract, contract, "ActionExecutionInput stale-field fixture must change the interface")
  assert.throws(
    () => assertWorkflowExecutionInputContract(staleActionFieldsContract),
    /ActionExecutionInput must not document stale bobRoot or workspaceRoot fields/
  )
  assert.notEqual(staleAgentContract, contract, "AgentExecutionInput mutation fixture must change the interface")
  assert.throws(
    () => assertWorkflowExecutionInputContract(staleAgentContract),
    /AgentExecutionInput must define required runId/
  )
})

test("artifact metadata contract docs define additive cross-extension metadata", () => {
  const contract = readDoc("artifact-metadata-contract-ja.md")

  for (const phrase of [
    "artifact_metadata",
    ".artifact-metadata.json",
    "producer_extension",
    "producer_version",
    "workflow_run_id",
    "source_vcs",
    "source_revision",
    "input_hash",
    "contains_sensitive_context",
    "human_review_required",
    "破壊的 schema 変更ではない"
  ]) {
    assert.ok(contract.includes(phrase), `artifact metadata contract must document: ${phrase}`)
  }
})

test("workflow-register README is synchronized with the split runtime and task snapshot defaults", () => {
  const readme = fs.readFileSync(path.join(extensionRoot, "README.md"), "utf8")

  assert.match(readme, /src\/bobStepRuntime\.ts[\s\S]*StepRuntime/)
  assert.doesNotMatch(readme, /今後の分割候補は `StepRuntime`/)
  assert.match(readme, /workflowRegister\.taskSnapshots\.includeMessages`\s*\|\s*`false`/)
  assert.match(readme, /既定では Bob chat messages を含めません/)
})

test("workflow-register docs cover template customization and snapshot defaults", () => {
  const readme = fs.readFileSync(path.join(extensionRoot, "README.md"), "utf8")
  const basicDesign = fs.readFileSync(path.join(extensionRoot, "docs", "basic-design-ja.md"), "utf8")
  const detailedDesign = fs.readFileSync(path.join(extensionRoot, "docs", "detailed-design-ja.md"), "utf8")
  const unitTestSpec = fs.readFileSync(path.join(extensionRoot, "docs", "unit-test-spec-ja.md"), "utf8")
  const realMachineSpec = fs.readFileSync(path.join(extensionRoot, "docs", "real-machine-test-spec-ja.md"), "utf8")

  for (const [name, text] of [
    ["README", readme],
    ["basic design", basicDesign],
    ["detailed design", detailedDesign],
    ["unit test spec", unitTestSpec],
    ["real machine test spec", realMachineSpec]
  ]) {
    assert.match(text, /テンプレート調整/, `${name} must document テンプレート調整`)
  }

  assert.match(detailedDesign, /workflowRegister\.taskSnapshots\.includeMessages`\s*\|\s*`false`/)
  assert.match(unitTestSpec, /WR-UT-036[\s\S]*WR-UT-039/)
  assert.match(realMachineSpec, /WR-RT-036[\s\S]*bzr --no-aliases/)
})
