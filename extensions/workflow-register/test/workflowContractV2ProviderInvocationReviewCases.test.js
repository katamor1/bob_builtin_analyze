const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const {
  createAttempt,
  invocationSubject,
  providerRuntime
} = require("./workflowContractV2ProviderInvocationTestSupport")

function signal() {
  return new AbortController().signal
}

function codes(result) {
  return result.diagnostics.map((diagnostic) => diagnostic.code)
}

function deepValue(depth) {
  let value = "leaf"
  for (let index = 0; index < depth; index += 1) value = { child: value }
  return value
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

test("over-depth provider input is rejected before the schema validator can clone it", async (t) => {
  let dispatches = 0
  let schemaCalls = 0
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

  const result = await withFreshInvocationSubject(
    () => () => {
      schemaCalls += 1
      throw new Error("schema validator must not receive an over-budget envelope")
    },
    (subject) => subject.invokeCompiledWorkflowProvider({
      lease: runtime.lease,
      stepId: "invoke",
      value: deepValue(65),
      signal: signal(),
      attempt: createAttempt().attempt
    })
  )

  assert.equal(result.ok, false)
  assert.equal(result.failure, "validation")
  assert.deepEqual(codes(result), ["WF2_PROVIDER_INPUT_INVALID"])
  assert.equal(schemaCalls, 0)
  assert.equal(dispatches, 0)
})

test("over-depth provider output is rejected before the output schema validator", async (t) => {
  let schemaCalls = 0
  const runtime = await providerRuntime({ dispatch: () => deepValue(65) })
  t.after(() => {
    runtime.registration.dispose()
    runtime.lease.release()
  })

  const result = await withFreshInvocationSubject(
    (original) => (input) => {
      schemaCalls += 1
      if (schemaCalls > 1) throw new Error("output schema validator must not receive an over-budget envelope")
      return original(input)
    },
    (subject) => subject.invokeCompiledWorkflowProvider({
      lease: runtime.lease,
      stepId: "invoke",
      value: { message: "hello" },
      signal: signal(),
      attempt: createAttempt().attempt
    })
  )

  assert.equal(result.ok, false)
  assert.equal(result.failure, "validation")
  assert.deepEqual(codes(result), ["WF2_PROVIDER_OUTPUT_INVALID"])
  assert.equal(schemaCalls, 1)
})

test("over-depth provider errors are rejected before the error schema validator", async (t) => {
  let schemaCalls = 0
  const runtime = await providerRuntime({ dispatch: () => { throw deepValue(65) } })
  t.after(() => {
    runtime.registration.dispose()
    runtime.lease.release()
  })

  const result = await withFreshInvocationSubject(
    (original) => (input) => {
      schemaCalls += 1
      if (schemaCalls > 1) throw new Error("error schema validator must not receive an over-budget envelope")
      return original(input)
    },
    (subject) => subject.invokeCompiledWorkflowProvider({
      lease: runtime.lease,
      stepId: "invoke",
      value: { message: "hello" },
      signal: signal(),
      attempt: createAttempt().attempt
    })
  )

  assert.equal(result.ok, false)
  assert.equal(result.failure, "validation")
  assert.deepEqual(codes(result), ["WF2_PROVIDER_ERROR_INVALID"])
  assert.equal(schemaCalls, 1)
})

test("artifact maximums are enforced before bytes are copied or staged", async (t) => {
  const staged = createAttempt()
  const runtime = await providerRuntime({
    sideEffect: "workspace-write",
    artifactMaxBytes: 2,
    dispatch: async (input) => {
      await input.effect.artifacts.writeArtifact({
        id: "report",
        bytes: Uint8Array.from([1, 2, 3])
      })
      return { ok: true }
    }
  })
  t.after(() => {
    runtime.registration.dispose()
    runtime.lease.release()
  })

  await assert.rejects(
    () => invocationSubject().invokeCompiledWorkflowProvider({
      lease: runtime.lease,
      stepId: "invoke",
      value: { message: "hello" },
      signal: signal(),
      attempt: staged.attempt
    }),
    (error) => error?.name === "WorkflowAttemptStagingError"
      && /artifact staging failed/i.test(error.message)
  )
  assert.deepEqual(staged.staged, [])
})

test("artifact byte length uses the captured typed-array intrinsic and ignores an own accessor", async (t) => {
  let getterCalls = 0
  const bytes = Uint8Array.from([1, 2, 3])
  Object.defineProperty(bytes, "byteLength", {
    configurable: true,
    get() {
      getterCalls += 1
      return 999_999
    }
  })
  const staged = createAttempt()
  const runtime = await providerRuntime({
    sideEffect: "workspace-write",
    artifactMaxBytes: 64,
    dispatch: async (input) => {
      await input.effect.artifacts.writeArtifact({ id: "report", bytes })
      return { ok: true }
    }
  })
  t.after(() => {
    runtime.registration.dispose()
    runtime.lease.release()
  })

  const result = await invocationSubject().invokeCompiledWorkflowProvider({
    lease: runtime.lease,
    stepId: "invoke",
    value: { message: "hello" },
    signal: signal(),
    attempt: staged.attempt
  })

  assert.equal(result.ok, true)
  assert.equal(getterCalls, 0)
  assert.equal(staged.staged.length, 1)
  assert.deepEqual([...staged.staged[0].bytes], [1, 2, 3])
})

test("a provider-thrown staging-shaped error is validated as a provider error", async (t) => {
  const {
    WorkflowAttemptStagingError
  } = require("../out/core/contractV2/providerAttemptStaging.js")
  const runtime = await providerRuntime({
    dispatch: () => { throw new WorkflowAttemptStagingError() }
  })
  t.after(() => {
    runtime.registration.dispose()
    runtime.lease.release()
  })

  const result = await invocationSubject().invokeCompiledWorkflowProvider({
    lease: runtime.lease,
    stepId: "invoke",
    value: { message: "hello" },
    signal: signal(),
    attempt: createAttempt().attempt
  })

  assert.equal(result.ok, false)
  assert.equal(result.failure, "validation")
  assert.deepEqual(codes(result), ["WF2_PROVIDER_ERROR_INVALID"])
})

test("provider invocation source orders bounded snapshots and artifact budgets before expensive work", () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    "..",
    "src",
    "core",
    "contractV2",
    "providerInvocation.ts"
  ), "utf8")

  const inputSnapshot = source.indexOf("snapshotBoundedWorkflowProviderEnvelope(snapshot.value")
  const inputValidation = source.indexOf("const validatedInput = validateSchemaCaptured")
  const errorSnapshot = source.indexOf("snapshotBoundedWorkflowProviderEnvelope(error")
  const errorValidation = source.indexOf("const validatedError = validateSchemaCaptured")
  const outputSnapshot = source.indexOf("snapshotBoundedWorkflowProviderEnvelope(returned")
  const outputValidation = source.indexOf("const validatedOutput = validateSchemaCaptured")

  assert.ok(inputSnapshot >= 0 && inputSnapshot < inputValidation)
  assert.ok(errorSnapshot >= 0 && errorSnapshot < errorValidation)
  assert.ok(outputSnapshot >= 0 && outputSnapshot < outputValidation)
  assert.match(source, /MAX_ARTIFACT_WRITES\s*=\s*128/)
  assert.match(source, /MAX_ARTIFACT_TOTAL_BYTES\s*=\s*67_108_864/)
  assert.match(source, /typedArrayByteLengthGetter/)
  assert.doesNotMatch(source, /isInstance\(WorkflowAttemptStagingError/)
})
