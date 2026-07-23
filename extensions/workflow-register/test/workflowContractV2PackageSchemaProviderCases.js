const assert = require("node:assert/strict")
const { test } = require("node:test")
const { types: utilTypes } = require("node:util")
const {
  VALID,
  DIGEST,
  lockModule,
  pointerModule,
  replaceAt,
  richLock,
  richProvider,
  validLock,
  validPointerInput
} = require("./workflowContractV2PackageSchemaTestSupport")

test("provider bindings require canonical semver, exact schema evidence, closed output variants, and sorted capabilities", () => {
  const { decodeWorkflowPackageLock } = lockModule()
  assert.doesNotThrow(() => decodeWorkflowPackageLock(richLock()))

  for (const [field, value] of [
    ["requestedVersion", "not semver"],
    ["exactVersion", "v1.2.4"],
    ["sideEffect", "filesystem"],
    ["idempotency", "maybe"]
  ]) {
    const lock = richLock()
    lock.providers[0][field] = value
    assert.throws(() => decodeWorkflowPackageLock(lock), new RegExp(field))
  }

  const unitWithSchema = richLock()
  unitWithSchema.providers[0].output = { kind: "unit", schema: richProvider().output.schema }
  assert.throws(() => decodeWorkflowPackageLock(unitWithSchema), TypeError)

  const valueWithoutSchema = richLock()
  valueWithoutSchema.providers[0].output = { kind: "value" }
  assert.throws(() => decodeWorkflowPackageLock(valueWithoutSchema), TypeError)

  const changedSchema = richLock()
  changedSchema.providers[0].output.schema.id = "schemas/other.json"
  changedSchema.providers[0].output.schema.digest = DIGEST("d")
  const decoded = decodeWorkflowPackageLock(changedSchema)
  assert.equal(decoded.providers[0].output.schema.id, "schemas/other.json")
  assert.equal(decoded.providers[0].output.schema.digest, DIGEST("d"))

  const duplicateCapabilities = richLock()
  duplicateCapabilities.providers[0].requiredCapabilities = [
    "workflow.effect.workspace-write",
    "workflow.effect.workspace-write"
  ]
  assert.throws(() => decodeWorkflowPackageLock(duplicateCapabilities), /sorted|duplicate/)

  const outOfOrderProviders = validLock()
  outOfOrderProviders.providers = [richProvider("z-provider"), richProvider("a-provider")]
  assert.throws(() => decodeWorkflowPackageLock(outOfOrderProviders), /sorted/)
})

test("Bob evidence is the exact audited tuple and taskCapabilities exactly project the required task subset", () => {
  const { decodeWorkflowPackageLock } = lockModule()
  const decoded = decodeWorkflowPackageLock(richLock())
  assert.deepEqual(decoded.bob.capabilities, VALID.lock.bob.capabilities)
  assert.deepEqual(decoded.bob.requiredCapabilities, ["source.log", "task.sendMessage"])
  assert.deepEqual(decoded.bob.taskCapabilities, ["task.sendMessage"])

  const wrongTuple = richLock()
  wrongTuple.bob.capabilities = [...wrongTuple.bob.capabilities]
  wrongTuple.bob.capabilities[0] = "source.other"
  assert.throws(() => decodeWorkflowPackageLock(wrongTuple), /capabilities/)

  const missingProjection = richLock()
  missingProjection.bob.taskCapabilities = []
  assert.throws(() => decodeWorkflowPackageLock(missingProjection), /taskCapabilities/)

  const extraProjection = validLock()
  extraProjection.bob.taskCapabilities = ["task.sendMessage"]
  assert.throws(() => decodeWorkflowPackageLock(extraProjection), /taskCapabilities/)

  const unknownRequired = validLock()
  unknownRequired.bob.requiredCapabilities = ["task.unknown"]
  assert.throws(() => decodeWorkflowPackageLock(unknownRequired), /requiredCapabilities/)
})

test("policy record and every digest leaf are exact and error text never includes source-controlled values", () => {
  const { decodeWorkflowPackageLock } = lockModule()
  for (const key of Object.keys(VALID.lock.policyVersions)) {
    const lock = validLock()
    lock.policyVersions[key] = "SECRET-VALUE"
    assert.throws(() => decodeWorkflowPackageLock(lock), (error) => {
      assert.equal(error instanceof TypeError, true)
      assert.match(error.message, new RegExp(key))
      assert.doesNotMatch(error.message, /SECRET-VALUE/)
      return true
    })
  }

  for (const digestPath of [["workflow", "digest"], ["environmentDigest"]]) {
    const lock = validLock()
    replaceAt(lock, digestPath, "SECRET-VALUE")
    assert.throws(() => decodeWorkflowPackageLock(lock), (error) => {
      assert.equal(error instanceof TypeError, true)
      assert.doesNotMatch(error.message, /SECRET-VALUE/)
      return true
    })
  }
})

test("captured proxy detection remains authoritative after util.types.isProxy is replaced", () => {
  const { decodeWorkflowPackagePointer } = pointerModule()
  const { decodeWorkflowPackageLock } = lockModule()
  const original = utilTypes.isProxy
  utilTypes.isProxy = () => false
  try {
    assert.throws(() => decodeWorkflowPackagePointer(new Proxy(validPointerInput(), {})), TypeError)
    assert.throws(() => decodeWorkflowPackageLock(new Proxy(validLock(), {})), TypeError)
  } finally {
    utilTypes.isProxy = original
  }
})

test("provider side-effect declarations enforce the reserved capability contract", () => {
  const { decodeWorkflowPackageLock } = lockModule()

  const none = richLock()
  none.providers[0].sideEffect = "none"
  none.providers[0].requiredCapabilities = []
  assert.doesNotThrow(() => decodeWorkflowPackageLock(none))

  const workspace = richLock()
  workspace.providers[0].sideEffect = "workspace-write"
  workspace.providers[0].requiredCapabilities = ["workflow.effect.workspace-write"]
  assert.doesNotThrow(() => decodeWorkflowPackageLock(workspace))

  const external = richLock()
  external.providers[0].sideEffect = "external"
  external.providers[0].requiredCapabilities = ["workflow.effect.external"]
  assert.doesNotThrow(() => decodeWorkflowPackageLock(external))

  const invalid = [
    ["none", ["workflow.effect.workspace-write"]],
    ["none", ["workflow.effect.external"]],
    ["workspace-write", []],
    ["workspace-write", ["workflow.effect.external"]],
    ["external", []],
    ["external", ["workflow.effect.workspace-write"]]
  ]
  for (const [sideEffect, requiredCapabilities] of invalid) {
    const lock = richLock()
    lock.providers[0].sideEffect = sideEffect
    lock.providers[0].requiredCapabilities = requiredCapabilities
    assert.throws(() => decodeWorkflowPackageLock(lock), /requiredCapabilities/)
  }
})
