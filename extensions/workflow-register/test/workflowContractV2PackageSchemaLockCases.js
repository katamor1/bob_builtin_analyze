const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  VALID,
  DIGEST,
  assertDeepFrozen,
  clone,
  fileEvidence,
  lockModule,
  providerEvidence,
  richLock,
  validLock
} = require("./workflowContractV2PackageSchemaTestSupport")

test("lock decoder exposes the exact literals and returns detached deeply frozen evidence", () => {
  const {
    decodeWorkflowPackageLock,
    WORKFLOW_COMPILER_CONTRACT_VERSION,
    WORKFLOW_COMPILER_POLICY_VERSIONS,
    WORKFLOW_PACKAGE_LOCK_SCHEMA_DIALECT,
    WORKFLOW_PACKAGE_LOCK_SCHEMA_VERSION
  } = lockModule()
  const input = richLock()
  const decoded = decodeWorkflowPackageLock(input)

  assert.equal(WORKFLOW_PACKAGE_LOCK_SCHEMA_VERSION, "workflow-register-lock/v2")
  assert.equal(WORKFLOW_COMPILER_CONTRACT_VERSION, "workflow-register-compiler/v2")
  assert.equal(WORKFLOW_PACKAGE_LOCK_SCHEMA_DIALECT, "https://json-schema.org/draft/2020-12/schema")
  assert.deepEqual(WORKFLOW_COMPILER_POLICY_VERSIONS, VALID.lock.policyVersions)
  assert.deepEqual(decoded, input)
  assert.notEqual(decoded, input)
  assert.notEqual(decoded.policyVersions, input.policyVersions)
  assert.notEqual(decoded.providers[0], input.providers[0])
  assertDeepFrozen(decoded)

  input.workflow.bytes = 999
  input.providers[0].requiredCapabilities[0] = "changed"
  assert.equal(decoded.workflow.bytes, 1)
  assert.deepEqual(decoded.providers[0].requiredCapabilities, ["workflow.effect.workspace-write"])
})

test("lock decoder rejects proxy, accessor, exotic, sparse, and extra-property inputs without invoking behavior", () => {
  const { decodeWorkflowPackageLock } = lockModule()
  let getterCalls = 0
  const accessor = validLock()
  Object.defineProperty(accessor, "workflow", {
    enumerable: true,
    get() {
      getterCalls += 1
      return VALID.lock.workflow
    }
  })
  assert.throws(() => decodeWorkflowPackageLock(accessor), TypeError)
  assert.equal(getterCalls, 0)

  let trapCalls = 0
  const proxy = new Proxy(validLock(), {
    getOwnPropertyDescriptor() {
      trapCalls += 1
      throw new Error("must not run")
    }
  })
  assert.throws(() => decodeWorkflowPackageLock(proxy), TypeError)
  assert.equal(trapCalls, 0)

  const sparse = validLock()
  sparse.prompts = new Array(1)
  assert.throws(() => decodeWorkflowPackageLock(sparse), TypeError)

  const extraArray = validLock()
  extraArray.schemas.extra = true
  assert.throws(() => decodeWorkflowPackageLock(extraArray), TypeError)

  const exotic = validLock()
  exotic.workflow = new (class WorkflowEvidence {
    constructor() {
      this.path = "workflow.yaml"
      this.bytes = 1
      this.digest = DIGEST("2")
    }
  })()
  assert.throws(() => decodeWorkflowPackageLock(exotic), TypeError)
  assert.throws(() => decodeWorkflowPackageLock({ ...validLock(), packageDigest: DIGEST("d") }), TypeError)
})

test("lock collection limits are checked before entry validation", () => {
  const { decodeWorkflowPackageLock } = lockModule()

  const maxFiles = validLock()
  maxFiles.prompts = Array.from({ length: 255 }, (_, index) => fileEvidence("prompt", index))
  maxFiles.schemas = Array.from({ length: 255 }, (_, index) => fileEvidence("schema", index))
  assert.equal(decodeWorkflowPackageLock(maxFiles).prompts.length, 255)

  let combinedTrapCalls = 0
  const tooManyCombined = clone(maxFiles)
  tooManyCombined.prompts.push(fileEvidence("prompt", 255))
  tooManyCombined.schemas[0] = new Proxy({ bad: true }, {
    ownKeys() {
      combinedTrapCalls += 1
      throw new Error("must not run")
    }
  })
  assert.throws(() => decodeWorkflowPackageLock(tooManyCombined), /combined/)
  assert.equal(combinedTrapCalls, 0)

  let promptTrapCalls = 0
  const overPromptLimit = validLock()
  overPromptLimit.prompts = Array.from({ length: 511 }, (_, index) => fileEvidence("prompt", index))
  overPromptLimit.prompts[0] = new Proxy({ bad: true }, {
    ownKeys() {
      promptTrapCalls += 1
      throw new Error("must not run")
    }
  })
  assert.throws(() => decodeWorkflowPackageLock(overPromptLimit), /length/)
  assert.equal(promptTrapCalls, 0)

  const maxProviders = validLock()
  maxProviders.providers = Array.from({ length: 256 }, (_, index) => providerEvidence(index))
  assert.equal(decodeWorkflowPackageLock(maxProviders).providers.length, 256)

  let providerGetterCalls = 0
  const tooManyProviders = validLock()
  tooManyProviders.providers = Array.from({ length: 257 }, (_, index) => providerEvidence(index))
  tooManyProviders.providers[0] = Object.defineProperty({}, "id", {
    enumerable: true,
    get() {
      providerGetterCalls += 1
      return "provider-000"
    }
  })
  assert.throws(() => decodeWorkflowPackageLock(tooManyProviders), /length/)
  assert.equal(providerGetterCalls, 0)
})

test("file evidence enforces exact paths, byte bounds, digests, sort order, and independent id/path uniqueness", () => {
  const { decodeWorkflowPackageLock } = lockModule()
  assert.doesNotThrow(() => decodeWorkflowPackageLock(richLock()))

  for (const [field, value] of [["bytes", 0], ["bytes", 4_194_305], ["digest", "sha256:ABC"]]) {
    const input = richLock()
    input.prompts[0][field] = value
    assert.throws(() => decodeWorkflowPackageLock(input), TypeError)
  }

  const wrongPromptPath = richLock()
  wrongPromptPath.prompts[0].path = "schemas/draft.json"
  assert.throws(() => decodeWorkflowPackageLock(wrongPromptPath), /path/)

  const wrongSchemaPath = richLock()
  wrongSchemaPath.schemas[0].path = "schemas/nested/request.json"
  assert.throws(() => decodeWorkflowPackageLock(wrongSchemaPath), /path/)

  const outOfOrder = richLock()
  outOfOrder.schemas.reverse()
  assert.throws(() => decodeWorkflowPackageLock(outOfOrder), /sorted/)

  const duplicateId = richLock()
  duplicateId.schemas[1].id = duplicateId.schemas[0].id
  assert.throws(() => decodeWorkflowPackageLock(duplicateId), /duplicate/)

  const duplicatePath = richLock()
  duplicatePath.schemas[1].path = duplicatePath.schemas[0].path
  duplicatePath.schemas[1].id = "zzz"
  assert.throws(() => decodeWorkflowPackageLock(duplicatePath), /duplicate/)
})
