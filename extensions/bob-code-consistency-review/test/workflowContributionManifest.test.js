"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")
const { extensionRoot, readExtensionFile, readJson, readSrc, repoRoot } = require("./helpers/sourceReader")

const ACTION_IDS = [
  "bobCodeConsistency.initializeWorkspace",
  "bobCodeConsistency.createReviewInput",
  "bobCodeConsistency.prepareAiReviewInputDraft",
  "bobCodeConsistency.applyAiReviewInputDraft",
  "bobCodeConsistency.prepareAiTraceabilityDraft",
  "bobCodeConsistency.captureAiTraceabilityDraft",
  "bobCodeConsistency.applyAiTraceabilityDraft",
  "bobCodeConsistency.openTraceabilityPrep",
  "bobCodeConsistency.validateTraceabilityCatalog",
  "bobCodeConsistency.createReviewInputFromTraceability",
  "bobCodeConsistency.repairReviewInput",
  "bobCodeConsistency.explainReviewInputDiagnostics",
  "bobCodeConsistency.preprocess",
  "bobCodeConsistency.captureBobOutput",
  "bobCodeConsistency.validateOutput",
  "bobCodeConsistency.triage"
]

const OWNER_DIRECTORY = "extensions/bob-code-consistency-review"
const MANIFEST_PATH = path.join(extensionRoot, "contracts", "workflow-contributions.json")

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"))
}

function repoFile(relativePath) {
  return path.join(repoRoot, ...relativePath.split("/"))
}

test("contribution manifest exactly declares the current CCR surface", () => {
  const packageJson = readJson("package.json")
  const manifest = readManifest()

  assert.equal(manifest.schema_version, "workflow-contributions/v1")
  assert.deepEqual(manifest.owner, {
    id: `${packageJson.publisher}.${packageJson.name}`,
    version: packageJson.version
  })
  assert.deepEqual(manifest.registry_api, {
    min: "provider-registry/v1",
    max: "provider-registry/v1"
  })
  assert.deepEqual(manifest.action_providers.map((item) => item.id), ACTION_IDS)
  assert.deepEqual(manifest.preflight_checks, [])
  assert.deepEqual(manifest.result_sinks, [])
  assert.equal(manifest.agent_provider, undefined)
  assert.deepEqual(manifest.workflow_templates, [{
    id: "code-consistency-review",
    source: `${OWNER_DIRECTORY}/templates/.bob/workflows/code-consistency-review/WORKFLOW.md`,
    destinations: [".bob/workflows/code-consistency-review/WORKFLOW.md"]
  }])
  assert.deepEqual(manifest.workflow_claims, [
    {
      path: ".bob/workflows/code-consistency-review/WORKFLOW.md",
      role: "product"
    },
    {
      path: `${OWNER_DIRECTORY}/templates/.bob/workflows/code-consistency-review/WORKFLOW.md`,
      role: "template"
    }
  ])
  assert.deepEqual(manifest.workflow_exclusions, [])
  assert.deepEqual(manifest.external_commands, [])
})

test("all CCR actions use unique v1 contracts and strict shared action schemas", () => {
  const manifest = readManifest()
  const contractVersions = manifest.action_providers.map((item) => item.contract_version)

  assert.equal(new Set(contractVersions).size, ACTION_IDS.length)
  for (const action of manifest.action_providers) {
    assert.equal(action.contract_version, `${action.id}/v1`)
    assert.equal(action.input_schema, "bobCodeConsistency.workflow-action-input")
    assert.equal(action.output_schema, "bobCodeConsistency.workflow-action-output")
    assert.deepEqual(action.error_codes, [])
  }

  assert.deepEqual(manifest.schemas, [
    {
      id: "bobCodeConsistency.workflow-action-input",
      path: `${OWNER_DIRECTORY}/contracts/schemas/workflow-action-input.v1.schema.json`
    },
    {
      id: "bobCodeConsistency.workflow-action-output",
      path: `${OWNER_DIRECTORY}/contracts/schemas/workflow-action-output.v1.schema.json`
    },
    {
      id: "bobCodeConsistency.review-input",
      path: `${OWNER_DIRECTORY}/resources/schemas/review-input.schema.json`
    },
    {
      id: "bobCodeConsistency.bob-output",
      path: `${OWNER_DIRECTORY}/resources/schemas/bob-output.schema.json`
    },
    {
      id: "bobCodeConsistency.evidence-scope-rule-pack",
      path: `${OWNER_DIRECTORY}/resources/schemas/evidence-scope-rule-pack.schema.json`
    },
    {
      id: "bobCodeConsistency.repository-symbol-index",
      path: `${OWNER_DIRECTORY}/resources/schemas/repository-symbol-index.schema.json`
    }
  ])

  for (const declaration of manifest.schemas) {
    assert.ok(declaration.path.startsWith(`${OWNER_DIRECTORY}/`), declaration.path)
    assert.equal(fs.statSync(repoFile(declaration.path)).isFile(), true, declaration.path)
  }

  for (const name of ["workflow-action-input.v1.schema.json", "workflow-action-output.v1.schema.json"]) {
    const schema = JSON.parse(readExtensionFile("contracts", "schemas", name))
    assert.equal(schema.$schema, "http://json-schema.org/draft-07/schema#")
  }
  const inputSchema = JSON.parse(readExtensionFile("contracts", "schemas", "workflow-action-input.v1.schema.json"))
  const outputSchema = JSON.parse(readExtensionFile("contracts", "schemas", "workflow-action-output.v1.schema.json"))
  assert.equal(inputSchema.additionalProperties, false)
  assert.ok(Array.isArray(outputSchema.oneOf))
  assert.ok(outputSchema.oneOf.some((branch) => branch.type === "object" && branch.additionalProperties?.$ref === "#"))
})

test("the owned template exists and exactly matches its claimed product mirror", () => {
  const manifest = readManifest()
  const template = manifest.workflow_templates[0]
  assert.equal(fs.readFileSync(repoFile(template.source), "utf8"), fs.readFileSync(repoFile(template.destinations[0]), "utf8"))
})

test("VSIX policy requires the manifest and every declared packaged contribution file", () => {
  const policy = readExtensionFile("scripts", "check-vsix-policy.js")
  const vscodeIgnore = readExtensionFile(".vscodeignore")

  assert.match(policy, /contracts\/workflow-contributions\.json/)
  assert.match(policy, /manifest\.schemas/)
  assert.match(policy, /manifest\.workflow_templates/)
  assert.doesNotMatch(vscodeIgnore, /^contracts\//m)
})

test("provider bridge has no legacy per-provider registration call", () => {
  const source = readSrc("workflowProviderRegistration.ts")
  assert.doesNotMatch(source, /registerActionProvider/)
  assert.match(source, /negotiateProviderRegistry/)
  assert.match(source, /registerContributionSet/)
})
