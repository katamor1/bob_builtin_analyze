const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const {
  createAttempt,
  providerRuntime
} = require("./workflowContractV2ProviderInvocationTestSupport")

function signal() {
  return new AbortController().signal
}

async function withFreshInvocationSubject(validatorFactory, operation) {
  const catalogPath = require.resolve("../out/core/contractV2/jsonSchemaCatalog.js")
  const invocationPath = require.resolve("../out/core/contractV2/providerInvocation.js")
  const catalog = require(catalogPath)
  const original = catalog.validateLocalJsonSchemaViewValue
  catalog.validateLocalJsonSchemaViewValue = validatorFactory(original)
  delete require.cache[invocationPath]
  try {
    return await operation(require(invocationPath))
  } finally {
    catalog.validateLocalJsonSchemaViewValue = original
    delete require.cache[invocationPath]
  }
}

test("a wide provider object is rejected before the quadratic canonical clone", async (t) => {
  let schemaCalls = 0
  let dispatches = 0
  const runtime = await providerRuntime({
    dispatch: () => {
      dispatches += 1
      return { ok: true }
    }
  })
  t.after(() => {
    runtime.registration.dispose()
    runtime.lease.release()
  })
  const value = {}
  for (let index = 0; index < 1025; index += 1) {
    value[`field-${String(index).padStart(4, "0")}`] = index
  }

  const result = await withFreshInvocationSubject(
    () => () => {
      schemaCalls += 1
      throw new Error("wide object must not reach schema validation")
    },
    (subject) => subject.invokeCompiledWorkflowProvider({
      lease: runtime.lease,
      stepId: "invoke",
      value,
      signal: signal(),
      attempt: createAttempt().attempt
    })
  )

  assert.equal(result.ok, false)
  assert.equal(result.failure, "validation")
  assert.deepEqual(result.diagnostics.map((item) => item.code), ["WF2_PROVIDER_INPUT_INVALID"])
  assert.equal(schemaCalls, 0)
  assert.equal(dispatches, 0)
})

test("artifact writer source bounds rejected attempts and handles every staging rejection immediately", () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    "..",
    "src",
    "core",
    "contractV2",
    "providerInvocation.ts"
  ), "utf8")
  const increment = source.indexOf("writeCount += 1")
  const policy = source.indexOf("const policy = findArtifactPolicy")
  assert.ok(increment >= 0 && increment < policy)
  assert.match(source, /let writeFailure: Promise<void> \| undefined/)
  assert.match(source, /if \(writeFailure !== undefined\) return writeFailure/)
  assert.match(source, /void promiseCatch\(pending, \(\) => undefined\)/)
  assert.match(source, /writeCount > MAX_ARTIFACT_WRITES/)
})
