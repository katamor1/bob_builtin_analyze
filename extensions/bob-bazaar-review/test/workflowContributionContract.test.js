const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")
const Ajv = require("ajv")

const {
  repoRoot,
  readJson,
  readSourceSet
} = require("./helpers/sourceReader")

const ACTION_IDS = [
  "bobBazaar.openReviewGui",
  "bobBazaar.collectReviewContext",
  "bobBazaar.loadReviewRules",
  "bobBazaar.captureReviewResult",
  "bobBazaar.openRuleAuthoringGui",
  "bobBazaar.loadRuleSourceIndex",
  "bobBazaar.captureRuleEvidenceSelection",
  "bobBazaar.loadSelectedRuleEvidence",
  "bobBazaar.captureRuleProposal",
  "bobBazaar.openRuleProposalTriageGui",
  "bobBazaar.verifyRuleAuthoringApply"
]

const WORKFLOW_CLAIMS = [
  { path: ".bob/workflows/bazaar-project-rule-authoring/WORKFLOW.md", role: "product" },
  { path: ".bob/workflows/bazaar-project-rule-review/WORKFLOW.md", role: "product" },
  {
    path: "extensions/bob-bazaar-review/templates/.bob/workflows/bazaar-project-rule-authoring/WORKFLOW.md",
    role: "template"
  },
  {
    path: "extensions/bob-bazaar-review/templates/.bob/workflows/bazaar-project-rule-review/WORKFLOW.md",
    role: "template"
  }
]

test("Bazaar manifest owns exactly 11 actions, two templates, four workflow claims, and no other runtime kinds", () => {
  const manifest = readJson("contracts", "workflow-contributions.json")
  const packageJson = readJson("package.json")

  assert.equal(manifest.schema_version, "workflow-contributions/v1")
  assert.deepEqual(manifest.owner, { id: "local.bob-bazaar-review", version: "0.3.0" })
  assert.equal(manifest.owner.version, packageJson.version)
  assert.deepEqual(manifest.registry_api, {
    min: "provider-registry/v1",
    max: "provider-registry/v1"
  })
  assert.deepEqual(manifest.action_providers.map(({ id }) => id), ACTION_IDS)
  assert.equal(new Set(manifest.action_providers.map(({ contract_version }) => contract_version)).size, 11)
  assert.ok(manifest.action_providers.every(({ error_codes }) => error_codes.length === 0))
  assert.deepEqual(manifest.preflight_checks, [])
  assert.deepEqual(manifest.result_sinks, [])
  assert.equal(Object.hasOwn(manifest, "agent_provider"), false)
  assert.equal(manifest.workflow_templates.length, 2)
  assert.deepEqual(manifest.workflow_claims, WORKFLOW_CLAIMS)
  assert.deepEqual(manifest.workflow_exclusions, [])
  assert.deepEqual(manifest.external_commands, [])
})

test("every Bazaar contribution schema is present, draft-07 valid, referenced, and strict at its public object boundary", () => {
  const manifest = readJson("contracts", "workflow-contributions.json")
  const schemaById = new Map(manifest.schemas.map((entry) => [entry.id, entry]))
  const referencedSchemaIds = new Set()
  for (const action of manifest.action_providers) {
    referencedSchemaIds.add(action.input_schema)
    referencedSchemaIds.add(action.output_schema)
  }

  for (const schemaId of referencedSchemaIds) {
    assert.ok(schemaById.has(schemaId), `undeclared schema reference: ${schemaId}`)
  }

  const ajv = new Ajv({ strict: true })
  for (const declaration of manifest.schemas) {
    const absolutePath = path.join(repoRoot, ...declaration.path.split("/"))
    assert.ok(fs.existsSync(absolutePath), `missing declared schema: ${declaration.path}`)
    const schema = JSON.parse(fs.readFileSync(absolutePath, "utf8"))
    if (!declaration.path.includes("/contracts/schemas/")) continue
    assert.equal(schema.$schema, "http://json-schema.org/draft-07/schema#")
    ajv.compile(schema)
    const publicObjectBoundaries = schema.type === "object"
      ? [schema]
      : (schema.oneOf ?? []).filter(({ type }) => type === "object")
    assert.ok(
      publicObjectBoundaries.length > 0 || schema.type === "null",
      `${declaration.id} must declare an explicit public result boundary`
    )
    for (const boundary of publicObjectBoundaries) {
      assert.equal(boundary.additionalProperties, false, `${declaration.id} must reject unknown public fields`)
    }
  }
})

test("Bazaar negotiates provider-registry/v1 before one atomic registration with exactly 11 handlers", () => {
  const source = readSourceSet([
    "workflow/workflowRegisterBridge.ts",
    "workflow/workflowProviders.ts"
  ])

  assert.match(source, /apiVersion:\s*"provider-registry\/v1"/)
  assert.match(source, /negotiateProviderRegistry/)
  assert.match(source, /registerContributionSet/)
  assert.match(source, /const negotiatedVersion = api\.negotiateProviderRegistry\(manifest\.registry_api\)/)
  assert.match(source, /if \(negotiatedVersion !== api\.apiVersion\)/)
  assert.match(source, /const registration = registerNegotiatedContributionSet\(api, manifest, provenance, \{/)
  assert.match(source, /actionProviders,/)
  assert.match(source, /preflightChecks: new Map\(\)/)
  assert.match(source, /resultSinks: new Map\(\)/)
  assert.match(source, /return \{ registered: true, registrations: \[registration\], api \}/)
  assert.equal((source.match(/registerContributionSet\(/g) ?? []).length, 2, "one API declaration and one call")
  assert.deepEqual(
    [...source.matchAll(/actionProviders\.set\("([^"]+)"/g)].map((match) => match[1]),
    ACTION_IDS
  )
  assert.match(source, /openBazaarReviewGui\(context,[\s\S]*?return null/)
  assert.doesNotMatch(source, /registerActionProvider/)

  const negotiationIndex = source.indexOf("api.negotiateProviderRegistry(manifest.registry_api)")
  const registrationIndex = source.indexOf("api.registerContributionSet(manifest, provenance")
  assert.ok(negotiationIndex >= 0 && negotiationIndex < registrationIndex)
})
