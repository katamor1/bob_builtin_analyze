"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { validateContributionManifest } = require("../out/core/contributionManifest")

const repositoryRoot = path.resolve(__dirname, "../../..")
const extensions = Object.freeze([
  {
    name: "bob-bazaar-review",
    installedOwner: { id: "local.bob-bazaar-review", version: "0.3.0" }
  },
  {
    name: "bob-code-consistency-review",
    installedOwner: { id: "local.bob-code-consistency-review", version: "0.1.0" }
  },
  {
    name: "workflow-register",
    installedOwner: { id: "local.workflow-register", version: "0.1.0" }
  }
])

const expectedWorkflowInventory = Object.freeze([
  ".bob/template-library/standard/process-code-precheck/WORKFLOW.md",
  ".bob/workflows/bazaar-project-rule-authoring/WORKFLOW.md",
  ".bob/workflows/bazaar-project-rule-review/WORKFLOW.md",
  ".bob/workflows/code-consistency-review/WORKFLOW.md",
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
  ".bob/workflows/process-unit-test-execution-review/WORKFLOW.md",
  "extensions/bob-bazaar-review/templates/.bob/workflows/bazaar-project-rule-authoring/WORKFLOW.md",
  "extensions/bob-bazaar-review/templates/.bob/workflows/bazaar-project-rule-review/WORKFLOW.md",
  "extensions/bob-code-consistency-review/templates/.bob/workflows/code-consistency-review/WORKFLOW.md",
  "extensions/workflow-register/samples/mechanical-checks-parser-pilot/.bob/workflows/mechanical-checks-parser-pilot/WORKFLOW.md",
  "extensions/workflow-register/samples/mechanical-checks-precheck/.bob/workflows/mechanical-checks-precheck/WORKFLOW.md",
  "extensions/workflow-register/samples/review-gated-step-execution/.bob/workflows/review-gated-step-execution/WORKFLOW.md",
  "extensions/workflow-register/samples/step-back-branching-approval/.bob/workflows/step-back-branching-approval/WORKFLOW.md",
  "extensions/workflow-register/test/fixtures/bob-code-consistency-review-template/WORKFLOW.md",
  "extensions/workflow-register/test/fixtures/code-consistency-workflow/WORKFLOW.md"
])

function loadExtension(specification) {
  const extensionRoot = path.join(repositoryRoot, "extensions", specification.name)
  const manifest = JSON.parse(fs.readFileSync(
    path.join(extensionRoot, "contracts", "workflow-contributions.json"),
    "utf8"
  ))
  return { ...specification, manifest }
}

function contributionIdentifiers(entry) {
  const { manifest } = entry
  return [
    ...manifest.action_providers.map((item) => ({ value: item.id, kind: "action" })),
    ...manifest.preflight_checks.map((item) => ({ value: item.id, kind: "preflight" })),
    ...manifest.result_sinks.map((item) => ({ value: item.type, kind: "result sink" })),
    ...(manifest.agent_provider ? [{ value: manifest.agent_provider.id, kind: "agent" }] : []),
    ...manifest.workflow_templates.map((item) => ({ value: item.id, kind: "workflow template" })),
    ...manifest.schemas.map((item) => ({ value: item.id, kind: "schema" }))
  ].map((item) => ({ ...item, owner: manifest.owner.id }))
}

function contributionContractVersions(entry) {
  const { manifest } = entry
  return [
    ...manifest.action_providers.map((item) => ({ value: item.contract_version, kind: "action" })),
    ...manifest.preflight_checks.map((item) => ({ value: item.contract_version, kind: "preflight" })),
    ...manifest.result_sinks.map((item) => ({ value: item.contract_version, kind: "result sink" })),
    ...(manifest.agent_provider ? [{ value: manifest.agent_provider.contract_version, kind: "agent" }] : []),
    ...manifest.external_commands.map((item) => ({ value: item.contract_version, kind: "external command" }))
  ].map((item) => ({ ...item, owner: manifest.owner.id }))
}

function assertAggregateUnique(entries, select, label) {
  const firstByValue = new Map()
  for (const item of entries.flatMap(select)) {
    const existing = firstByValue.get(item.value)
    assert.equal(
      existing,
      undefined,
      `${label} '${item.value}' collides between ${existing?.owner ?? "unknown"} (${existing?.kind ?? "unknown"}) and ${item.owner} (${item.kind})`
    )
    firstByValue.set(item.value, item)
  }
}

test("all three manifests are valid against their installed package provenance", () => {
  for (const entry of extensions.map(loadExtension)) {
    const result = validateContributionManifest(entry.manifest, {
      expectedOwner: entry.installedOwner,
      ownerDirectory: `extensions/${entry.name}`
    })
    assert.equal(result.ok, true, `${entry.name}: ${JSON.stringify(result.diagnostics, null, 2)}`)
  }
})

test("the 27-path workflow inventory is classified exactly once across all manifests", () => {
  const classifications = []
  for (const entry of extensions.map(loadExtension)) {
    for (const claim of entry.manifest.workflow_claims) {
      classifications.push({ path: claim.path, owner: entry.manifest.owner.id, kind: `claim:${claim.role}` })
    }
    for (const exclusion of entry.manifest.workflow_exclusions) {
      classifications.push({ path: exclusion.path, owner: entry.manifest.owner.id, kind: "exclusion" })
    }
  }

  const firstByPath = new Map()
  for (const classification of classifications) {
    const existing = firstByPath.get(classification.path)
    assert.equal(
      existing,
      undefined,
      `${classification.path} is ambiguous between ${existing?.owner ?? "unknown"} and ${classification.owner}`
    )
    firstByPath.set(classification.path, classification)
  }
  assert.equal(classifications.length, 27)
  assert.deepEqual([...firstByPath.keys()].sort(), [...expectedWorkflowInventory].sort())
})

test("all globally namespaced contribution IDs and contract versions are unique across manifests", () => {
  const entries = extensions.map(loadExtension)

  assertAggregateUnique(entries, contributionIdentifiers, "contribution identifier")
  assertAggregateUnique(entries, contributionContractVersions, "contract version")
})

test("the aggregate release gate rejects cross-owner ID and contract collisions", () => {
  const entries = extensions.map(loadExtension).map((entry) => ({
    ...entry,
    manifest: structuredClone(entry.manifest)
  }))
  entries[1].manifest.action_providers[0].id = entries[0].manifest.action_providers[0].id
  assert.throws(
    () => assertAggregateUnique(entries, contributionIdentifiers, "contribution identifier"),
    /collides between/
  )

  entries[1].manifest.action_providers[0].id = "bobCodeConsistency.initializeWorkspace"
  entries[1].manifest.action_providers[0].contract_version = entries[0].manifest.action_providers[0].contract_version
  assert.throws(
    () => assertAggregateUnique(entries, contributionContractVersions, "contract version"),
    /collides between/
  )
})
