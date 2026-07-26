const assert = require("node:assert/strict")
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

test("invalid provider input returns one stable diagnostic and performs zero dispatches", async (t) => {
  let calls = 0
  const runtime = await providerRuntime({
    dispatch: () => {
      calls += 1
      return { ok: true }
    }
  })
  t.after(() => {
    runtime.registration.dispose()
    runtime.lease.release()
  })
  const { attempt } = createAttempt()

  const result = await invocationSubject().invokeCompiledWorkflowProvider({
    lease: runtime.lease,
    stepId: "invoke",
    value: { unexpected: true },
    signal: signal(),
    attempt
  })

  assert.equal(result.ok, false)
  assert.equal(result.failure, "validation")
  assert.deepEqual(codes(result), ["WF2_PROVIDER_INPUT_INVALID"])
  assert.equal(calls, 0)
})

test("valid provider value input dispatches once with a frozen ABI and returns detached validated output", async (t) => {
  let calls = 0
  let observed
  const output = { ok: true }
  const runtime = await providerRuntime({
    dispatch: (input) => {
      calls += 1
      observed = input
      return output
    }
  })
  t.after(() => {
    runtime.registration.dispose()
    runtime.lease.release()
  })
  const { attempt } = createAttempt()

  const result = await invocationSubject().invokeCompiledWorkflowProvider({
    lease: runtime.lease,
    stepId: "invoke",
    value: { message: "hello" },
    signal: signal(),
    attempt
  })
  output.ok = false

  assert.equal(calls, 1)
  assert.equal(result.ok, true)
  assert.deepEqual(result.output, { kind: "value", value: { ok: true } })
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.isFrozen(result.output), true)
  assert.equal(Object.isFrozen(result.output.value), true)
  assert.notStrictEqual(result.output.value, output)
  assert.equal(Object.isFrozen(observed), true)
  assert.equal(Object.isFrozen(observed.value), true)
  assert.deepEqual(observed.idempotency, { mode: "idempotent" })
  assert.deepEqual(observed.effect, { kind: "none" })
  assert.equal(Object.isFrozen(observed.idempotency), true)
  assert.equal(Object.isFrozen(observed.effect), true)
})

test("unit provider output accepts only undefined", async (t) => {
  let returned = undefined
  let calls = 0
  const runtime = await providerRuntime({
    outputKind: "unit",
    dispatch: () => {
      calls += 1
      return returned
    }
  })
  t.after(() => {
    runtime.registration.dispose()
    runtime.lease.release()
  })
  const { attempt } = createAttempt()

  const success = await invocationSubject().invokeCompiledWorkflowProvider({
    lease: runtime.lease,
    stepId: "invoke",
    value: { message: "hello" },
    signal: signal(),
    attempt
  })
  assert.deepEqual(success.output, { kind: "unit" })

  returned = null
  const invalid = await invocationSubject().invokeCompiledWorkflowProvider({
    lease: runtime.lease,
    stepId: "invoke",
    value: { message: "hello" },
    signal: signal(),
    attempt
  })
  assert.equal(invalid.ok, false)
  assert.deepEqual(codes(invalid), ["WF2_PROVIDER_OUTPUT_INVALID"])
  assert.equal(calls, 2)
})

test("provider errors are validated as detached typed failures and malformed errors are redacted", async (t) => {
  const secret = "do-not-persist-provider-secret"
  let thrown = { code: "E_SAMPLE" }
  const runtime = await providerRuntime({
    dispatch: () => { throw thrown }
  })
  t.after(() => {
    runtime.registration.dispose()
    runtime.lease.release()
  })
  const { attempt } = createAttempt()

  const typed = await invocationSubject().invokeCompiledWorkflowProvider({
    lease: runtime.lease,
    stepId: "invoke",
    value: { message: "hello" },
    signal: signal(),
    attempt
  })
  thrown.code = "MUTATED"
  assert.equal(typed.ok, false)
  assert.equal(typed.failure, "provider-error")
  assert.deepEqual(typed.error, { code: "E_SAMPLE" })
  assert.equal(Object.isFrozen(typed.error), true)

  thrown = { message: secret }
  const invalid = await invocationSubject().invokeCompiledWorkflowProvider({
    lease: runtime.lease,
    stepId: "invoke",
    value: { message: "hello" },
    signal: signal(),
    attempt
  })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.failure, "validation")
  assert.deepEqual(codes(invalid), ["WF2_PROVIDER_ERROR_INVALID"])
  assert.doesNotMatch(JSON.stringify(invalid), new RegExp(secret))
})

test("key-required workspace dispatch receives only a frozen one-method staging writer and snapshots bytes on entry", async (t) => {
  let observed
  let sourceBytes
  let writePromise
  const runtime = await providerRuntime({
    sideEffect: "workspace-write",
    idempotency: "key-required",
    dispatch: (input) => {
      observed = input
      sourceBytes = Uint8Array.from([1, 2, 3])
      writePromise = input.effect.artifacts.writeArtifact({ id: "report", bytes: sourceBytes })
      sourceBytes[0] = 9
      return { ok: true }
    }
  })
  t.after(() => {
    runtime.registration.dispose()
    runtime.lease.release()
  })
  const staged = createAttempt({ idempotencyKey: "run:step:attempt", pauseStage: true })

  const pending = invocationSubject().invokeCompiledWorkflowProvider({
    lease: runtime.lease,
    stepId: "invoke",
    value: { message: "hello" },
    signal: signal(),
    attempt: staged.attempt
  })
  staged.releaseStage()
  const result = await pending
  await writePromise

  assert.equal(result.ok, true)
  assert.deepEqual(observed.idempotency, { mode: "key-required", key: "run:step:attempt" })
  assert.equal(observed.effect.kind, "workspace-write")
  assert.deepEqual(Reflect.ownKeys(observed.effect.artifacts), ["writeArtifact"])
  assert.equal(Object.isFrozen(observed.effect.artifacts), true)
  assert.equal(staged.staged.length, 1)
  assert.equal(staged.staged[0].id, "report")
  assert.deepEqual([...staged.staged[0].bytes], [1, 2, 3])
})

test("forged, released, and wrong-step invocation inputs fail before dispatch", async (t) => {
  let calls = 0
  const runtime = await providerRuntime({
    dispatch: () => {
      calls += 1
      return { ok: true }
    }
  })
  t.after(() => runtime.registration.dispose())
  const { attempt } = createAttempt()

  await assert.rejects(
    () => invocationSubject().invokeCompiledWorkflowProvider({
      lease: { handle: runtime.lease.handle, released: false, release() {} },
      stepId: "invoke",
      value: { message: "hello" },
      signal: signal(),
      attempt
    }),
    /lease/i
  )

  await assert.rejects(
    () => invocationSubject().invokeCompiledWorkflowProvider({
      lease: runtime.lease,
      stepId: "missing",
      value: { message: "hello" },
      signal: signal(),
      attempt
    }),
    /step/i
  )
  runtime.lease.release()
  await assert.rejects(
    () => invocationSubject().invokeCompiledWorkflowProvider({
      lease: runtime.lease,
      stepId: "invoke",
      value: { message: "hello" },
      signal: signal(),
      attempt
    }),
    /lease|released/i
  )
  assert.equal(calls, 0)
})

test("compiled provider handles retain the exact dispatch identity after registry disposal and re-registration", async (t) => {
  let originalCalls = 0
  let replacementCalls = 0
  const runtime = await providerRuntime({
    dispatch: () => {
      originalCalls += 1
      return { ok: true }
    }
  })
  t.after(() => runtime.lease.release())
  runtime.registration.dispose()
  const replacement = runtime.registry.register({
    sourceId: "replacement.provider",
    contract: {
      id: "sample.provider",
      version: "1.0.0",
      inputSchema: runtime.schemas.input.evidence,
      output: { kind: "value", schema: runtime.schemas.output.evidence },
      errorSchema: runtime.schemas.error.evidence,
      sideEffect: "none",
      idempotency: "idempotent",
      requiredCapabilities: [],
      dispatch: () => {
        replacementCalls += 1
        return { ok: false }
      }
    }
  })
  t.after(() => replacement.dispose())
  const { attempt } = createAttempt()

  const result = await invocationSubject().invokeCompiledWorkflowProvider({
    lease: runtime.lease,
    stepId: "invoke",
    value: { message: "hello" },
    signal: signal(),
    attempt
  })

  assert.equal(result.ok, true)
  assert.equal(originalCalls, 1)
  assert.equal(replacementCalls, 0)
})
