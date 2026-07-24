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
  const cases = [
    ["compiler contract", "/compilerContractVersion", (lock) => { lock.compilerContractVersion = "workflow-register-compiler/v9" }],
    ["policy", "/policyVersions/yaml", (lock) => { lock.policyVersions.yaml = "workflow-contract-yaml/v9" }],
    ["workflow digest", "/workflow/digest", (lock) => { lock.workflow.digest = `sha256:${"0".repeat(64)}` }],
    ["prompt digest", "/prompts/0/digest", (lock) => { lock.prompts[0].digest = `sha256:${"0".repeat(64)}` }],
    ["schema bytes", "/schemas/0/bytes", (lock) => { lock.schemas[0].bytes += 1 }],
    ["provider version", "/providers/0/exactVersion", (lock) => { lock.providers[0].exactVersion = "1.2.4" }],
    ["provider input digest", "/providers/0/inputSchema/digest", (lock) => { lock.providers[0].inputSchema.digest = `sha256:${"0".repeat(64)}` }],
    ["provider output kind", "/providers/0/output/kind", (lock) => { lock.providers[0].output = { kind: "unit" } }],
    ["provider effect", "/providers/0/sideEffect", (lock) => { lock.providers[0].sideEffect = "external" }],
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
