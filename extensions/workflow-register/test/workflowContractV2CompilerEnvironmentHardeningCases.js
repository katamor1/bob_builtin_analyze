const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog
} = require("./workflowContractV2CompilerTestSupport")

test("compiler environments accept exact immutable Bob evidence wrappers but reject hostile tuple values", () => {
  const { createAuditedWorkflowCompilerEnvironment } = compilerSubject()
  const profile = createBobProfile()
  const wrapped = Object.freeze({ ...profile })
  const environment = createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: wrapped
  })
  assert.equal(Object.isFrozen(environment), true)
  assert.deepEqual(Object.keys(environment), [])

  let traps = 0
  const capabilities = new Proxy([...profile.capabilities], {
    get() { traps += 1; throw new Error("must not read proxy capability tuple") },
    ownKeys() { traps += 1; throw new Error("must not inspect proxy capability tuple") }
  })
  assert.throws(() => createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: Object.freeze({ ...profile, capabilities })
  }), TypeError)
  assert.equal(traps, 0)
})

test("compiler environment input accessors are rejected without invocation", () => {
  const { createAuditedWorkflowCompilerEnvironment } = compilerSubject()
  let getterCalls = 0
  const input = {
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  }
  Object.defineProperty(input, "purpose", {
    enumerable: true,
    get() {
      getterCalls += 1
      return "runtime"
    }
  })
  assert.throws(() => createAuditedWorkflowCompilerEnvironment(input), TypeError)
  assert.equal(getterCalls, 0)
})
