const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  assertDeepFrozen,
  canonicalText,
  digestBytes,
  generationInput,
  sourceFiles,
  subject
} = require("./workflowContractV2LockTestSupport")

test("lock generation is canonical across provider and capability insertion orders", () => {
  const lockModule = subject()
  const first = lockModule.generateWorkflowPackageLock(generationInput())
  const second = lockModule.generateWorkflowPackageLock(generationInput({
    reverseProviders: true,
    reverseCapabilities: true
  }))

  assert.deepEqual(second, first)
  assert.deepEqual(
    lockModule.encodeWorkflowPackageLock(second),
    lockModule.encodeWorkflowPackageLock(first)
  )
  assert.equal(first.schemaVersion, "workflow-register-lock/v2")
  assert.equal(first.compilerContractVersion, "workflow-register-compiler/v2")
  assert.equal("packageDigest" in first, false)
  assert.deepEqual(first.prompts.map(({ id, path }) => [id, path]), [["intro", "prompts/intro.md"]])
  assert.deepEqual(first.schemas.map(({ id, path }) => [id, path]), [
    ["error", "schemas/error.json"],
    ["request", "schemas/request.json"],
    ["response", "schemas/response.json"]
  ])
  assert.deepEqual(first.providers.map((provider) => provider.id), ["alpha.provider", "beta.provider"])
  assert.deepEqual(first.providers[0].requiredCapabilities, [
    "provider.alpha",
    "workflow.effect.workspace-write"
  ])
  assert.deepEqual(first.bob.requiredCapabilities, [
    "source.log",
    "task.sendMessage",
    "task.toSerializable"
  ])
  assert.deepEqual(first.bob.taskCapabilities, ["task.sendMessage", "task.toSerializable"])
  assertDeepFrozen(first)
})

test("environment digest uses only the exact public compiler preimage", () => {
  const lockModule = subject()
  const lock = lockModule.generateWorkflowPackageLock(generationInput())
  const preimage = {
    schemaVersion: "workflow-register-compiler-environment/v2",
    compilerContractVersion: lock.compilerContractVersion,
    policyVersions: lock.policyVersions,
    providers: lock.providers,
    bob: lock.bob
  }
  const expected = digestBytes(Buffer.from(canonicalText(preimage), "utf8"))

  assert.equal(lock.environmentDigest, expected)
  assert.equal("purpose" in preimage, false)
  assert.equal("leaseable" in preimage, false)
  assert.equal("dispatch" in preimage, false)
})

test("lock evidence is rebuilt from exact raw package bytes", () => {
  const lockModule = subject()
  const files = sourceFiles()
  const input = generationInput({ files })
  const lock = lockModule.generateWorkflowPackageLock(input)
  const byPath = new Map(input.rawPackage.files.map((file) => [file.path, file]))

  assert.deepEqual(lock.workflow, {
    path: "workflow.yaml",
    bytes: byPath.get("workflow.yaml").byteLength,
    digest: byPath.get("workflow.yaml").digest
  })
  for (const entry of [...lock.prompts, ...lock.schemas]) {
    const raw = byPath.get(entry.path)
    assert.equal(entry.bytes, raw.byteLength)
    assert.equal(entry.digest, raw.digest)
  }
})

test("encoded lock is exact compact canonical JSON and returns a fresh buffer", () => {
  const lockModule = subject()
  const lock = lockModule.generateWorkflowPackageLock(generationInput())
  const first = lockModule.encodeWorkflowPackageLock(lock)
  const second = lockModule.encodeWorkflowPackageLock(lock)

  assert.equal(first.toString("utf8"), canonicalText(lock))
  assert.notEqual(first, second)
  first[0] ^= 0xff
  assert.equal(second.toString("utf8"), canonicalText(lock))
})
