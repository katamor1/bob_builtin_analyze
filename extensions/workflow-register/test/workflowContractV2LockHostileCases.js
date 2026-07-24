const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  generationInput,
  sourceFiles,
  subject
} = require("./workflowContractV2LockTestSupport")

test("lock generation rejects proxy and accessor inputs without invoking behavior", () => {
  const lockModule = subject()
  let traps = 0
  const outer = new Proxy(generationInput(), {
    get() { traps += 1; throw new Error("must not read proxy") },
    ownKeys() { traps += 1; throw new Error("must not inspect proxy") }
  })
  assert.throws(() => lockModule.generateWorkflowPackageLock(outer), TypeError)
  assert.equal(traps, 0)

  let getterCalls = 0
  const provider = { ...generationInput().providers[0] }
  Object.defineProperty(provider, "exactVersion", {
    enumerable: true,
    get() {
      getterCalls += 1
      return "1.2.3"
    }
  })
  const input = generationInput({ providers: [provider] })
  assert.throws(() => lockModule.generateWorkflowPackageLock(input), TypeError)
  assert.equal(getterCalls, 0)
})

test("lock generation rejects sparse arrays, duplicate ids, and invalid Bob subsets", () => {
  const lockModule = subject()
  const sparseProviders = []
  sparseProviders.length = 1
  assert.throws(
    () => lockModule.generateWorkflowPackageLock(generationInput({ providers: sparseProviders })),
    /sparse|dense|array/i
  )

  const duplicateProviders = generationInput().providers.map((provider) => ({ ...provider }))
  duplicateProviders[1].id = duplicateProviders[0].id
  assert.throws(
    () => lockModule.generateWorkflowPackageLock(generationInput({ providers: duplicateProviders })),
    /duplicate|provider/i
  )

  const invalidBob = {
    profile: "bob/2.0.1",
    requiredCapabilities: ["source.log"],
    taskCapabilities: ["task.sendMessage"]
  }
  assert.throws(
    () => lockModule.generateWorkflowPackageLock(generationInput({ bob: invalidBob })),
    /taskCapabilities|required/i
  )
})

test("raw package bytes and evidence are recomputed before lock generation", () => {
  const lockModule = subject()
  const input = generationInput()
  const workflow = input.rawPackage.files.find((file) => file.path === "workflow.yaml")
  workflow.digest = `sha256:${"0".repeat(64)}`
  assert.throws(
    () => lockModule.generateWorkflowPackageLock(input),
    /digest|evidence|raw package/i
  )

  const staleLength = generationInput()
  staleLength.rawPackage.files.find((file) => file.path === "workflow.yaml").byteLength += 1
  assert.throws(
    () => lockModule.generateWorkflowPackageLock(staleLength),
    /byte|length|evidence/i
  )
})

test("provider schema evidence must match the exact raw schema bytes", () => {
  const lockModule = subject()
  const input = generationInput()
  input.providers[0].inputSchema.digest = `sha256:${"0".repeat(64)}`
  assert.throws(
    () => lockModule.generateWorkflowPackageLock(input),
    /schema|digest|evidence/i
  )
})

test("lock generation snapshots caller bytes and invokes no write capability", () => {
  const lockModule = subject()
  const files = sourceFiles()
  const input = generationInput({ files })
  let writeCalls = 0
  Object.defineProperty(input, "writeFile", {
    enumerable: true,
    value() { writeCalls += 1 }
  })
  assert.throws(() => lockModule.generateWorkflowPackageLock(input), /unknown field|exact|input/i)
  assert.equal(writeCalls, 0)

  const accepted = generationInput({ files })
  const workflow = accepted.rawPackage.files.find((file) => file.path === "workflow.yaml")
  const original = workflow.bytes[0]
  const lock = lockModule.generateWorkflowPackageLock(accepted)
  workflow.bytes[0] ^= 0xff
  assert.equal(lock.workflow.digest, accepted.rawPackage.files.find(
    (file) => file.path === "workflow.yaml"
  ).digest)
  workflow.bytes[0] = original
})
