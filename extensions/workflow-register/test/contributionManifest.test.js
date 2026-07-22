const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const {
  validateContributionManifest
} = require("../out/core/contributionManifest")

const fixtureRoot = path.join(__dirname, "fixtures", "workflow-contributions")
const validationContext = Object.freeze({
  expectedOwner: Object.freeze({ id: "local.sample-extension", version: "1.2.3" }),
  ownerDirectory: "extensions/sample-extension"
})

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), "utf8"))
}

function clone(value) {
  return structuredClone(value)
}

function validate(value, context = validationContext) {
  return validateContributionManifest(value, context)
}

function assertInvalid(value, code) {
  const result = validate(value)
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some((item) => item.code === code), JSON.stringify(result.diagnostics, null, 2))
  return result
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

test("accepts a complete closed contribution manifest without importing VS Code", () => {
  const result = validate(fixture("valid.json"))

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2))
  assert.deepEqual(result.manifest.owner, { id: "local.sample-extension", version: "1.2.3" })
  assert.equal(result.manifest.action_providers[0].id, "sample.collect")
  assert.equal(result.manifest.preflight_checks[0].id, "sample.workspaceReady")
  assert.equal(result.manifest.result_sinks[0].type, "sample.report")
  assert.equal(result.manifest.agent_provider.id, "sample.agent")
})

test("accepts exact path-scoped workflow claims, exclusions, and external sample commands", () => {
  const value = fixture("valid.json")

  const result = validate(value)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2))
  assert.deepEqual(result.manifest.workflow_claims, value.workflow_claims)
  assert.deepEqual(result.manifest.workflow_exclusions, value.workflow_exclusions)
  assert.deepEqual(result.manifest.external_commands, value.external_commands)
})

test("requires the exact v1 schema discriminator and every closed top-level field", () => {
  const future = fixture("valid.json")
  future.schema_version = "workflow-contributions/v2"
  assertInvalid(future, "schema.const")

  for (const field of [
    "schema_version",
    "owner",
    "registry_api",
    "action_providers",
    "preflight_checks",
    "result_sinks",
    "workflow_templates",
    "workflow_claims",
    "workflow_exclusions",
    "external_commands",
    "schemas"
  ]) {
    const value = fixture("valid.json")
    delete value[field]
    const result = assertInvalid(value, "schema.required")
    assert.ok(result.diagnostics.some((item) => item.path === `/${field}`), field)
  }
})

test("accepts an owner with no optional agent and empty contribution namespaces", () => {
  const value = fixture("valid.json")
  delete value.agent_provider
  value.action_providers = []
  value.preflight_checks = []
  value.result_sinks = []
  value.workflow_templates = []
  value.workflow_claims = []
  value.workflow_exclusions = []
  value.external_commands = []
  value.schemas = []

  const result = validate(value)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2))
})

test("rejects unknown fields at the top level and in every manifest namespace", () => {
  assertInvalid(fixture("invalid-unknown-field.json"), "schema.additionalProperties")

  const mutations = [
    ["owner", (value) => { value.owner.unexpected = true }],
    ["registry_api", (value) => { value.registry_api.unexpected = true }],
    ["action_providers", (value) => { value.action_providers[0].unexpected = true }],
    ["preflight_checks", (value) => { value.preflight_checks[0].unexpected = true }],
    ["result_sinks", (value) => { value.result_sinks[0].unexpected = true }],
    ["agent_provider", (value) => { value.agent_provider.unexpected = true }],
    ["workflow_templates", (value) => { value.workflow_templates[0].unexpected = true }],
    ["workflow_claims", (value) => { value.workflow_claims[0].unexpected = true }],
    ["workflow_exclusions", (value) => { value.workflow_exclusions[0].unexpected = true }],
    ["external_commands", (value) => { value.external_commands[0].unexpected = true }],
    ["schemas", (value) => { value.schemas[0].unexpected = true }]
  ]

  for (const [namespace, mutate] of mutations) {
    const value = fixture("valid.json")
    mutate(value)
    const result = assertInvalid(value, "schema.additionalProperties")
    assert.ok(result.diagnostics.some((item) => item.path.includes(namespace)), namespace)
  }
})

test("requires exact owner id and version from the extension package", () => {
  const wrongId = validate(fixture("valid.json"), {
    ...validationContext,
    expectedOwner: { ...validationContext.expectedOwner, id: "local.other-extension" }
  })
  const wrongVersion = validate(fixture("valid.json"), {
    ...validationContext,
    expectedOwner: { ...validationContext.expectedOwner, version: "1.2.4" }
  })

  assert.equal(wrongId.ok, false)
  assert.ok(wrongId.diagnostics.some((item) => item.code === "owner.id_mismatch"))
  assert.equal(wrongVersion.ok, false)
  assert.ok(wrongVersion.diagnostics.some((item) => item.code === "owner.version_mismatch"))
})

test("rejects malformed extension ids and non-exact SemVer owner versions", () => {
  for (const id of ["sample-extension", "Local.Sample", "local.sample_extension", ".sample", "local."]) {
    const value = fixture("valid.json")
    value.owner.id = id
    assertInvalid(value, "schema.pattern")
  }
  for (const version of ["v1.2.3", "1.2", "01.2.3", "1.2.3.4", "1.2.3-"]) {
    const value = fixture("valid.json")
    value.owner.version = version
    assertInvalid(value, "schema.pattern")
  }
})

test("rejects zero and malformed versions at both registry range endpoints", () => {
  for (const endpoint of ["min", "max"]) {
    for (const version of ["provider-registry/v0", "provider-registry/1", "provider-registry/v01", "other/v1"]) {
      const value = fixture("valid.json")
      value.registry_api[endpoint] = version
      const result = assertInvalid(value, "schema.pattern")
      assert.ok(result.diagnostics.some((item) => item.path === `/registry_api/${endpoint}`))
    }
  }
})

test("rejects zero and malformed versions in every contribution contract reference", () => {
  const references = [
    ["action_providers", (value, version) => { value.action_providers[0].contract_version = version }],
    ["preflight_checks", (value, version) => { value.preflight_checks[0].contract_version = version }],
    ["result_sinks", (value, version) => { value.result_sinks[0].contract_version = version }],
    ["agent_provider", (value, version) => { value.agent_provider.contract_version = version }],
    ["external_commands", (value, version) => { value.external_commands[0].contract_version = version }]
  ]
  for (const [namespace, mutate] of references) {
    for (const version of ["sample/v0", "sample/1", "sample/v01", "/v1", "v1"]) {
      const value = fixture("valid.json")
      mutate(value, version)
      const result = assertInvalid(value, "schema.pattern")
      assert.ok(result.diagnostics.some((item) => item.path.includes(namespace)), namespace)
    }
  }
})

test("rejects inverted registry compatibility ranges", () => {
  assertInvalid(fixture("invalid-range.json"), "registry.invalid_range")
})

test("rejects inverted registry ranges beyond Number.MAX_SAFE_INTEGER", () => {
  const value = fixture("valid.json")
  value.registry_api.min = "provider-registry/v9007199254740993"
  value.registry_api.max = "provider-registry/v9007199254740992"

  assertInvalid(value, "registry.invalid_range")
})

test("rejects duplicate identifiers within a namespace", () => {
  assertInvalid(fixture("invalid-duplicate.json"), "identifier.duplicate")

  const namespaces = [
    ["preflight_checks", (value) => value.preflight_checks.push(clone(value.preflight_checks[0]))],
    ["result_sinks", (value) => value.result_sinks.push(clone(value.result_sinks[0]))],
    ["workflow_templates", (value) => value.workflow_templates.push(clone(value.workflow_templates[0]))],
    ["schemas", (value) => value.schemas.push(clone(value.schemas[0]))]
  ]
  for (const [namespace, mutate] of namespaces) {
    const value = fixture("valid.json")
    mutate(value)
    const result = assertInvalid(value, "identifier.duplicate")
    assert.ok(result.diagnostics.some((item) => item.path.includes(namespace)), namespace)
  }
})

test("rejects cross-namespace provider identifiers and contract-version collisions", () => {
  for (const mutate of [
    (value) => { value.preflight_checks[0].id = value.action_providers[0].id },
    (value) => { value.result_sinks[0].type = value.action_providers[0].id },
    (value) => { value.agent_provider.id = value.action_providers[0].id }
  ]) {
    const value = fixture("valid.json")
    mutate(value)
    assertInvalid(value, "identifier.cross_namespace_collision")
  }

  const contractCollision = fixture("valid.json")
  contractCollision.preflight_checks[0].contract_version = contractCollision.action_providers[0].contract_version
  assertInvalid(contractCollision, "contract_version.duplicate")

  const externalContractCollision = fixture("valid.json")
  externalContractCollision.external_commands[0].contract_version = externalContractCollision.action_providers[0].contract_version
  assertInvalid(externalContractCollision, "contract_version.duplicate")
})

test("requires exact normalized paths for every workflow classification and command scope", () => {
  for (const unsafePath of [
    "**/WORKFLOW.md",
    "extensions/sample-extension/**/WORKFLOW.md",
    "extensions/sample-extension/samples/?/WORKFLOW.md",
    "extensions/sample-extension/samples/[ab]/WORKFLOW.md",
    "extensions/sample-extension/samples/{a,b}/WORKFLOW.md"
  ]) {
    for (const mutate of [
      (value) => { value.workflow_claims[0].path = unsafePath },
      (value) => { value.workflow_exclusions[0].path = unsafePath },
      (value) => {
        value.workflow_claims[1].path = unsafePath
        value.external_commands[0].workflow_paths[0] = unsafePath
      }
    ]) {
      const value = fixture("valid.json")
      mutate(value)
      assertInvalid(value, "path.not_exact")
    }
  }

  for (const unsafePath of [
    "/extensions/sample-extension/WORKFLOW.md",
    "C:/extensions/sample-extension/WORKFLOW.md",
    "extensions\\sample-extension\\WORKFLOW.md",
    "extensions/sample-extension/../other/WORKFLOW.md"
  ]) {
    for (const mutate of [
      (value) => { value.workflow_claims[0].path = unsafePath },
      (value) => { value.workflow_exclusions[0].path = unsafePath },
      (value) => {
        value.workflow_claims[1].path = unsafePath
        value.external_commands[0].workflow_paths[0] = unsafePath
      }
    ]) {
      const value = fixture("valid.json")
      mutate(value)
      assertInvalid(value, "path.not_normalized")
    }
  }
})

test("limits workflow classifications to WORKFLOW.md files and exclusions to meaningful reasons", () => {
  for (const mutate of [
    (value) => { value.workflow_claims[0].path = "extensions/sample-extension/templates/readme.txt" },
    (value) => { value.workflow_exclusions[0].path = "extensions/sample-extension/test/fixtures/readme.txt" },
    (value) => {
      value.workflow_claims[1].path = "extensions/sample-extension/samples/sample-review/command.yaml"
      value.external_commands[0].workflow_paths[0] = value.workflow_claims[1].path
    }
  ]) {
    const value = fixture("valid.json")
    mutate(value)
    assertInvalid(value, "workflow_path.not_workflow_file")
  }

  const blankReason = fixture("valid.json")
  blankReason.workflow_exclusions[0].reason = " \t "
  assertInvalid(blankReason, "workflow_exclusion.reason_empty")
})

test("rejects duplicate or ambiguous workflow classifications and unowned exclusions", () => {
  const duplicateClaim = fixture("valid.json")
  duplicateClaim.workflow_claims.push(clone(duplicateClaim.workflow_claims[0]))
  assertInvalid(duplicateClaim, "workflow_claim.duplicate")

  const duplicateExclusion = fixture("valid.json")
  duplicateExclusion.workflow_exclusions.push(clone(duplicateExclusion.workflow_exclusions[0]))
  assertInvalid(duplicateExclusion, "workflow_exclusion.duplicate")

  const ambiguous = fixture("valid.json")
  ambiguous.workflow_exclusions[0].path = ambiguous.workflow_claims[0].path
  assertInvalid(ambiguous, "workflow_path.ambiguous")

  const unowned = fixture("valid.json")
  unowned.workflow_exclusions[0].path = "extensions/other/test/fixtures/WORKFLOW.md"
  assertInvalid(unowned, "workflow_exclusion.outside_owner")
})

test("binds external command declarations to non-empty exact sample claims", () => {
  const empty = fixture("valid.json")
  empty.external_commands[0].workflow_paths = []
  assertInvalid(empty, "schema.minItems")

  const productClaim = fixture("valid.json")
  productClaim.workflow_claims[1].role = "product"
  assertInvalid(productClaim, "external_command.not_sample_claim")

  const unclaimed = fixture("valid.json")
  unclaimed.external_commands[0].workflow_paths[0] = "extensions/sample-extension/samples/other/.bob/workflows/other/WORKFLOW.md"
  assertInvalid(unclaimed, "external_command.not_sample_claim")

  const duplicateId = fixture("valid.json")
  const secondById = clone(duplicateId.external_commands[0])
  secondById.contract_version = "sample.external-review-secondary/v1"
  duplicateId.external_commands.push(secondById)
  assertInvalid(duplicateId, "external_command.id_duplicate")

  const duplicateContract = fixture("valid.json")
  const secondByContract = clone(duplicateContract.external_commands[0])
  secondByContract.id = "sample.otherExternalReview"
  duplicateContract.external_commands.push(secondByContract)
  assertInvalid(duplicateContract, "contract_version.duplicate")
})

test("uses one global identifier collision domain for every contribution kind", () => {
  const kinds = [
    {
      name: "action provider",
      read: (value) => value.action_providers[0].id,
      write: (value, id) => { value.action_providers[0].id = id }
    },
    {
      name: "preflight check",
      read: (value) => value.preflight_checks[0].id,
      write: (value, id) => { value.preflight_checks[0].id = id }
    },
    {
      name: "result sink",
      read: (value) => value.result_sinks[0].type,
      write: (value, id) => { value.result_sinks[0].type = id }
    },
    {
      name: "agent provider",
      read: (value) => value.agent_provider.id,
      write: (value, id) => { value.agent_provider.id = id }
    },
    {
      name: "workflow template",
      read: (value) => value.workflow_templates[0].id,
      write: (value, id) => { value.workflow_templates[0].id = id }
    },
    {
      name: "schema",
      read: (value) => value.schemas[0].id,
      write: (value, id) => {
        const previous = value.schemas[0].id
        value.schemas[0].id = id
        for (const provider of value.action_providers) {
          if (provider.input_schema === previous) provider.input_schema = id
          if (provider.output_schema === previous) provider.output_schema = id
        }
        for (const check of value.preflight_checks) {
          if (check.result_schema === previous) check.result_schema = id
        }
        for (const sink of value.result_sinks) {
          if (sink.payload_schema === previous) sink.payload_schema = id
        }
      }
    }
  ]

  for (let left = 0; left < kinds.length; left += 1) {
    for (let right = left + 1; right < kinds.length; right += 1) {
      const value = fixture("valid.json")
      kinds[right].write(value, kinds[left].read(value))
      const result = validate(value)
      assert.equal(result.ok, false, `${kinds[left].name} / ${kinds[right].name}`)
      assert.ok(
        result.diagnostics.some((item) => item.code === "identifier.cross_namespace_collision"),
        `${kinds[left].name} / ${kinds[right].name}: ${JSON.stringify(result.diagnostics)}`
      )
    }
  }
})

test("keeps schema file paths outside the six-kind contribution identifier domain", () => {
  const value = fixture("valid.json")
  value.schemas[0].path = `extensions/sample-extension/${value.action_providers[0].id}`

  const result = validate(value)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2))
})

test("rejects unknown schema references from every schema-bearing contribution", () => {
  const references = [
    (value) => { value.action_providers[0].input_schema = "missing.input" },
    (value) => { value.action_providers[0].output_schema = "missing.output" },
    (value) => { value.preflight_checks[0].result_schema = "missing.result" },
    (value) => { value.result_sinks[0].payload_schema = "missing.payload" }
  ]
  for (const mutate of references) {
    const value = fixture("valid.json")
    mutate(value)
    assertInvalid(value, "schema_reference.unknown")
  }
})

test("requires normalized repository-relative POSIX paths inside the owner directory", () => {
  assertInvalid(fixture("invalid-path.json"), "path.not_normalized")

  for (const unsafePath of [
    "./extensions/sample-extension/schema/input.json",
    "extensions/sample-extension/schema//input.json",
    "extensions\\sample-extension\\schema\\input.json",
    "/extensions/sample-extension/schema/input.json",
    "C:/extensions/sample-extension/schema/input.json"
  ]) {
    const value = fixture("valid.json")
    value.schemas[0].path = unsafePath
    assertInvalid(value, "path.not_normalized")
  }

  for (const outsidePath of ["extensions/other/schema/input.json", "extensions/sample-extension-other/input.json"]) {
    const value = fixture("valid.json")
    value.schemas[0].path = outsidePath
    assertInvalid(value, "path.outside_owner")
  }
})

test("binds the declared extension id to its repository owner directory", () => {
  const value = fixture("valid.json")
  const result = validate(value, {
    ...validationContext,
    ownerDirectory: "extensions/not-the-owner"
  })

  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.some((item) => item.code === "owner.directory_mismatch"))
})

test("validates template sources, every destination, and schema paths", () => {
  const source = fixture("valid.json")
  source.workflow_templates[0].source = "extensions/other/WORKFLOW.md"
  assertInvalid(source, "path.outside_owner")

  const destination = fixture("valid.json")
  destination.workflow_templates[0].destinations.push("../outside/WORKFLOW.md")
  assertInvalid(destination, "path.not_normalized")

  const schema = fixture("valid.json")
  schema.schemas[0].path = "extensions/other/schema.json"
  assertInvalid(schema, "path.outside_owner")
})

test("permits only the exact root workflow template destination outside the owner", () => {
  const accepted = fixture("valid.json")
  accepted.workflow_templates[0].destinations = [".bob/workflows/sample-review/WORKFLOW.md"]
  assert.equal(validate(accepted).ok, true)

  for (const destination of [
    ".bob/workflows/WORKFLOW.md",
    ".bob/workflows/nested/sample-review/WORKFLOW.md",
    ".bob/workflows/sample-review/workflow.md",
    ".bob/other/sample-review/WORKFLOW.md",
    "other/.bob/workflows/sample-review/WORKFLOW.md"
  ]) {
    const value = fixture("valid.json")
    value.workflow_templates[0].destinations = [destination]
    assertInvalid(value, "path.outside_owner")
  }
})

test("returns stable path-sorted diagnostics", () => {
  const value = fixture("valid.json")
  value.registry_api.min = "provider-registry/v0"
  value.owner.id = "bad"
  value.schemas[0].path = "../escape.json"

  const first = validate(value)
  const second = validate(value)
  assert.equal(first.ok, false)
  assert.deepEqual(first.diagnostics, second.diagnostics)
  assert.deepEqual(
    first.diagnostics,
    [...first.diagnostics].sort((left, right) => (
      compareCodeUnits(left.path, right.path)
      || compareCodeUnits(left.code, right.code)
      || compareCodeUnits(left.message, right.message)
    ))
  )
})

test("sorts non-ASCII diagnostic paths by locale-independent UTF-16 code units", () => {
  const value = fixture("valid.json")
  value["ä"] = true
  value.z = true

  const result = validate(value)
  assert.equal(result.ok, false)
  assert.deepEqual(result.diagnostics.map((item) => item.path), ["/z", "/ä"])
})

test("does not mutate accepted or rejected input objects", () => {
  const accepted = fixture("valid.json")
  const acceptedBefore = clone(accepted)
  validate(accepted)
  assert.deepEqual(accepted, acceptedBefore)

  const rejected = fixture("invalid-path.json")
  const rejectedBefore = clone(rejected)
  validate(rejected)
  assert.deepEqual(rejected, rejectedBefore)
})

test("bounds and sanitizes every untrusted diagnostic path and message to 256 UTF-8 bytes", () => {
  const value = fixture("valid.json")
  const hostile = `bad\u0000\n${"界".repeat(300)}`
  value[hostile] = true
  value.action_providers[0].id = hostile
  value.schemas[0].path = `extensions/other/${hostile}.json`

  const result = validate(value)
  assert.equal(result.ok, false)
  assert.ok(result.diagnostics.length > 0)
  for (const diagnostic of result.diagnostics) {
    assert.ok(Buffer.byteLength(diagnostic.path, "utf8") <= 256, diagnostic.path)
    assert.ok(Buffer.byteLength(diagnostic.message, "utf8") <= 256, diagnostic.message)
    assert.doesNotMatch(diagnostic.path, /[\u0000-\u001f\u007f]/)
    assert.doesNotMatch(diagnostic.message, /[\u0000-\u001f\u007f]/)
  }
})
