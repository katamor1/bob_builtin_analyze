"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")
const Ajv = require("ajv")

const { validateContributionManifest } = require("../out/core/contributionManifest")

const extensionRoot = path.resolve(__dirname, "..")
const repositoryRoot = path.resolve(extensionRoot, "../..")
const manifestPath = path.join(extensionRoot, "contracts", "workflow-contributions.json")

const productWorkflowPaths = Object.freeze([
  ".bob/workflows/process-code-doc-investigation/WORKFLOW.md",
  ".bob/workflows/process-code-precheck/WORKFLOW.md",
  ".bob/workflows/process-coding-plan/WORKFLOW.md",
  ".bob/workflows/process-common-review/WORKFLOW.md",
  ".bob/workflows/process-external-spec-design/WORKFLOW.md",
  ".bob/workflows/process-external-spec-review/WORKFLOW.md",
  ".bob/workflows/process-functional-test-design/WORKFLOW.md",
  ".bob/workflows/process-functional-test-execution-review/WORKFLOW.md",
  ".bob/workflows/process-integration-test-design/WORKFLOW.md",
  ".bob/workflows/process-internal-spec-design/WORKFLOW.md",
  ".bob/workflows/process-internal-spec-review/WORKFLOW.md",
  ".bob/workflows/process-qa-intake-analysis/WORKFLOW.md",
  ".bob/workflows/process-unit-test-design/WORKFLOW.md",
  ".bob/workflows/process-unit-test-execution-review/WORKFLOW.md"
])

const sampleWorkflowPaths = Object.freeze([
  "extensions/workflow-register/samples/mechanical-checks-parser-pilot/.bob/workflows/mechanical-checks-parser-pilot/WORKFLOW.md",
  "extensions/workflow-register/samples/mechanical-checks-precheck/.bob/workflows/mechanical-checks-precheck/WORKFLOW.md",
  "extensions/workflow-register/samples/review-gated-step-execution/.bob/workflows/review-gated-step-execution/WORKFLOW.md",
  "extensions/workflow-register/samples/step-back-branching-approval/.bob/workflows/step-back-branching-approval/WORKFLOW.md"
])

const fixtureWorkflowPaths = Object.freeze([
  "extensions/workflow-register/test/fixtures/bob-code-consistency-review-template/WORKFLOW.md",
  "extensions/workflow-register/test/fixtures/code-consistency-workflow/WORKFLOW.md"
])

function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"))
}

function sorted(values) {
  return [...values].sort()
}

test("workflow-register publishes one complete valid built-in contribution manifest", () => {
  assert.ok(fs.existsSync(manifestPath), "contracts/workflow-contributions.json must exist")
  const manifest = readManifest()
  const result = validateContributionManifest(manifest, {
    expectedOwner: { id: "local.workflow-register", version: "0.1.0" },
    ownerDirectory: "extensions/workflow-register"
  })

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2))
  assert.deepEqual(manifest.registry_api, { min: "provider-registry/v1", max: "provider-registry/v1" })
  assert.deepEqual(sorted(manifest.action_providers.map((item) => item.id)), [
    "vscode.executeCommand",
    "workflowRegister.runMechanicalChecks"
  ])
  assert.deepEqual(sorted(manifest.preflight_checks.map((item) => item.id)), [
    "bazaarRepository",
    "bobWorkspaceInitialized",
    "workspaceOpen"
  ])
  assert.deepEqual(sorted(manifest.result_sinks.map((item) => item.type)), ["command", "file"])
  assert.equal("agent_provider" in manifest, false)
  assert.deepEqual(manifest.workflow_templates, [])
})

test("workflow-register classifies exactly 19 owned workflow roles and two fixture exclusions", () => {
  const manifest = readManifest()
  const byRole = new Map()
  for (const claim of manifest.workflow_claims) {
    const paths = byRole.get(claim.role) ?? []
    paths.push(claim.path)
    byRole.set(claim.role, paths)
  }

  assert.equal(manifest.workflow_claims.length, 19)
  assert.deepEqual(sorted(byRole.get("product") ?? []), sorted(productWorkflowPaths))
  assert.deepEqual(byRole.get("template"), [
    ".bob/template-library/standard/process-code-precheck/WORKFLOW.md"
  ])
  assert.deepEqual(sorted(byRole.get("sample") ?? []), sorted(sampleWorkflowPaths))
  assert.deepEqual(sorted(manifest.workflow_exclusions.map((item) => item.path)), sorted(fixtureWorkflowPaths))
})

test("workflow-register scopes its external sample command to the exact declaring workflow", () => {
  const manifest = readManifest()
  assert.deepEqual(manifest.external_commands, [
    {
      id: "example.preapprovalCheck",
      contract_version: "example.preapproval-check/v1",
      workflow_paths: [
        "extensions/workflow-register/samples/step-back-branching-approval/.bob/workflows/step-back-branching-approval/WORKFLOW.md"
      ]
    }
  ])
})

test("every declared owner-contained template, schema, sample, and exclusion is tracked", () => {
  const manifest = readManifest()
  const paths = [
    ...manifest.workflow_templates.map((item) => item.source),
    ...manifest.schemas.map((item) => item.path),
    ...manifest.workflow_claims
      .filter((item) => item.path.startsWith("extensions/workflow-register/"))
      .map((item) => item.path),
    ...manifest.workflow_exclusions.map((item) => item.path)
  ]
  for (const repoPath of new Set(paths)) {
    assert.ok(fs.existsSync(path.join(repositoryRoot, repoPath)), repoPath)
  }
})

test("built-in action contract schemas accept only closed JSON-compatible execution data", () => {
  const ajv = new Ajv({ allErrors: true, strict: true })
  const inputSchema = JSON.parse(fs.readFileSync(
    path.join(extensionRoot, "schema", "workflow-register-action-input.v1.schema.json"),
    "utf8"
  ))
  const outputSchema = JSON.parse(fs.readFileSync(
    path.join(extensionRoot, "schema", "workflow-register-action-output.v1.schema.json"),
    "utf8"
  ))
  const validateInput = ajv.compile(inputSchema)
  const validateOutput = ajv.compile(outputSchema)

  assert.equal(validateInput({
    args: ["sample.command", { nested: [true, null, 1] }],
    inputs: { request: "review", options: { strict: true } },
    state: { draft: "ready" },
    workflowRoot: "/workspace"
  }), true, JSON.stringify(validateInput.errors))
  assert.equal(validateInput({ args: {}, inputs: {}, extra: true }), false)
  assert.equal(validateInput({ args: () => undefined, inputs: {} }), false)
  assert.equal(validateInput({ args: {}, inputs: { callback: () => undefined } }), false)

  assert.equal(validateOutput({ status: "passed", details: [1, true, null] }), true)
  assert.equal(validateOutput(() => undefined), false)
  assert.equal(validateOutput(undefined), false)
})
