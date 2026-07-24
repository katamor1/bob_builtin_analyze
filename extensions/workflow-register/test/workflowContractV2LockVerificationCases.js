const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  canonicalText,
  cloneJson,
  generationInput,
  replaceLockBytes,
  subject,
  withEncodedLock
} = require("./workflowContractV2LockTestSupport")

function canonicalBytes(value) {
  return Buffer.from(canonicalText(value), "utf8")
}

function expectMismatch(result, pointer) {
  assert.equal(result.ok, false)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].code, "WF2_LOCK_MISMATCH")
  assert.equal(result.diagnostics[0].severity, "error")
  assert.equal(result.diagnostics[0].location.path, "workflow.lock.json")
  assert.equal(result.diagnostics[0].location.pointer, pointer)
  assert.deepEqual(result.diagnostics[0].relatedLocations, [])
  assert.equal(result.diagnostics[0].message.includes("1.2.3"), false)
  assert.equal(result.diagnostics[0].message.includes("owner-token"), false)
}

test("lock verification accepts only the exact canonical generated lock", () => {
  const lockModule = subject()
  const fixture = withEncodedLock(lockModule)
  const result = lockModule.verifyWorkflowPackageLock(fixture.input)

  assert.equal(result.ok, true)
  assert.deepEqual(result.lock, fixture.lock)
  assert.equal(result.lockfileDigest, fixture.input.rawPackage.files.find(
    (file) => file.path === "workflow.lock.json"
  ).digest)
  assert.deepEqual(result.diagnostics, [])
})

test("lock verification reports one deterministic first-difference pointer", async (t) => {
  const lockModule = subject()
  const fixture = withEncodedLock(lockModule)
  const policyCases = [
    "artifact", "bob", "canonicalJson", "diagnostics", "jsonSchema",
    "packageShape", "predicate", "provider", "yaml"
  ].map((key) => [
    `policy ${key}`,
    `/policyVersions/${key}`,
    (lock) => { lock.policyVersions[key] = `workflow-contract-${key}/drift` }
  ])
  const cases = [
    ["schema version", "/schemaVersion", (lock) => { lock.schemaVersion = "workflow-register-lock/v9" }],
    ["compiler contract", "/compilerContractVersion", (lock) => { lock.compilerContractVersion = "workflow-register-compiler/v9" }],
    ...policyCases,
    ["workflow path", "/workflow/path", (lock) => { lock.workflow.path = "workflow-v2.yaml" }],
    ["workflow bytes", "/workflow/bytes", (lock) => { lock.workflow.bytes += 1 }],
    ["workflow digest", "/workflow/digest", (lock) => { lock.workflow.digest = `sha256:${"0".repeat(64)}` }],
    ["prompt id", "/prompts/0/id", (lock) => { lock.prompts[0].id = "changed" }],
    ["prompt path", "/prompts/0/path", (lock) => { lock.prompts[0].path = "prompts/changed.md" }],
    ["prompt bytes", "/prompts/0/bytes", (lock) => { lock.prompts[0].bytes += 1 }],
    ["prompt digest", "/prompts/0/digest", (lock) => { lock.prompts[0].digest = `sha256:${"0".repeat(64)}` }],
    ["schema id", "/schemas/0/id", (lock) => { lock.schemas[0].id = "changed" }],
    ["schema path", "/schemas/0/path", (lock) => { lock.schemas[0].path = "schemas/changed.json" }],
    ["schema bytes", "/schemas/0/bytes", (lock) => { lock.schemas[0].bytes += 1 }],
    ["schema digest", "/schemas/0/digest", (lock) => { lock.schemas[0].digest = `sha256:${"0".repeat(64)}` }],
    ["provider id", "/providers/0/id", (lock) => { lock.providers[0].id = "changed.provider" }],
    ["provider requested version", "/providers/0/requestedVersion", (lock) => { lock.providers[0].requestedVersion = "^9.0.0" }],
    ["provider exact version", "/providers/0/exactVersion", (lock) => { lock.providers[0].exactVersion = "1.2.4" }],
    ["provider contract digest", "/providers/0/contractDigest", (lock) => { lock.providers[0].contractDigest = `sha256:${"0".repeat(64)}` }],
    ["provider input id", "/providers/0/inputSchema/id", (lock) => { lock.providers[0].inputSchema.id = "schemas/changed.json" }],
    ["provider input bytes", "/providers/0/inputSchema/bytes", (lock) => { lock.providers[0].inputSchema.bytes += 1 }],
    ["provider input digest", "/providers/0/inputSchema/digest", (lock) => { lock.providers[0].inputSchema.digest = `sha256:${"0".repeat(64)}` }],
    ["provider value-to-unit kind", "/providers/0/output/kind", (lock) => { lock.providers[0].output = { kind: "unit" } }],
    ["provider unit-to-value kind", "/providers/1/output/kind", (lock) => { lock.providers[1].output = { kind: "value", schema: cloneJson(lock.providers[0].output.schema) } }],
    ["provider output id", "/providers/0/output/schema/id", (lock) => { lock.providers[0].output.schema.id = "schemas/changed.json" }],
    ["provider output bytes", "/providers/0/output/schema/bytes", (lock) => { lock.providers[0].output.schema.bytes += 1 }],
    ["provider output digest", "/providers/0/output/schema/digest", (lock) => { lock.providers[0].output.schema.digest = `sha256:${"0".repeat(64)}` }],
    ["provider error id", "/providers/0/errorSchema/id", (lock) => { lock.providers[0].errorSchema.id = "schemas/changed.json" }],
    ["provider error bytes", "/providers/0/errorSchema/bytes", (lock) => { lock.providers[0].errorSchema.bytes += 1 }],
    ["provider error digest", "/providers/0/errorSchema/digest", (lock) => { lock.providers[0].errorSchema.digest = `sha256:${"0".repeat(64)}` }],
    ["provider effect", "/providers/0/sideEffect", (lock) => { lock.providers[0].sideEffect = "external" }],
    ["provider idempotency", "/providers/0/idempotency", (lock) => { lock.providers[0].idempotency = "non-idempotent" }],
    ["provider capability", "/providers/0/requiredCapabilities/0", (lock) => { lock.providers[0].requiredCapabilities[0] = "provider.changed" }],
    ["Bob profile", "/bob/profile", (lock) => { lock.bob.profile = "bob/9" }],
    ["Bob extension id", "/bob/extensionId", (lock) => { lock.bob.extensionId = "IBM.changed" }],
    ["Bob extension version", "/bob/extensionVersion", (lock) => { lock.bob.extensionVersion = "9.0.0" }],
    ["Bob profile digest", "/bob/profileDigest", (lock) => { lock.bob.profileDigest = `sha256:${"0".repeat(64)}` }],
    ["Bob capability tuple", "/bob/capabilities/0", (lock) => { lock.bob.capabilities[0] = "source.changed" }],
    ["Bob required capability", "/bob/requiredCapabilities/0", (lock) => { lock.bob.requiredCapabilities[0] = "source.deactivate" }],
    ["Bob task capability", "/bob/taskCapabilities/0", (lock) => { lock.bob.taskCapabilities[0] = "task.getMessages" }],
    ["environment digest", "/environmentDigest", (lock) => { lock.environmentDigest = `sha256:${"0".repeat(64)}` }],
    ["cycle field", "/packageDigest", (lock) => { lock.packageDigest = fixture.input.rawPackage.packageDigest }]
  ]

  for (const [name, pointer, mutate] of cases) await t.test(name, () => {
    const drifted = cloneJson(fixture.lock)
    mutate(drifted)
    const input = replaceLockBytes(fixture.input, canonicalBytes(drifted))
    expectMismatch(lockModule.verifyWorkflowPackageLock(input), pointer)
  })
})

test("noncanonical lock bytes and stale raw evidence fail closed", () => {
  const lockModule = subject()
  const fixture = withEncodedLock(lockModule)

  const noncanonical = replaceLockBytes(fixture.input, Buffer.concat([fixture.lockBytes, Buffer.from("\n")]))
  expectMismatch(lockModule.verifyWorkflowPackageLock(noncanonical), "")

  const stale = generationInput()
  const lockFile = stale.rawPackage.files.find((file) => file.path === "workflow.lock.json")
  lockFile.bytes[0] = 0x5b
  expectMismatch(lockModule.verifyWorkflowPackageLock(stale), "")
})

test("missing and additional lock entries produce one mismatch", () => {
  const lockModule = subject()
  const fixture = withEncodedLock(lockModule)
  const missing = cloneJson(fixture.lock)
  missing.prompts = []
  expectMismatch(
    lockModule.verifyWorkflowPackageLock(replaceLockBytes(fixture.input, canonicalBytes(missing))),
    "/prompts/0"
  )

  const additional = cloneJson(fixture.lock)
  additional.prompts.push({
    id: "unused",
    path: "prompts/unused.md",
    bytes: 1,
    digest: `sha256:${"1".repeat(64)}`
  })
  expectMismatch(
    lockModule.verifyWorkflowPackageLock(replaceLockBytes(fixture.input, canonicalBytes(additional))),
    "/prompts/1"
  )
})

test("unknown lock fields cannot escape through diagnostic pointers", () => {
  const lockModule = subject()
  const fixture = withEncodedLock(lockModule)
  const hostile = cloneJson(fixture.lock)
  hostile["\u0001C:\\private\\secret"] = "sensitive-value"
  const input = replaceLockBytes(fixture.input, canonicalBytes(hostile))

  expectMismatch(lockModule.verifyWorkflowPackageLock(input), "")
})
