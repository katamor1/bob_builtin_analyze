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

function rejectingAttempt() {
  const {
    createWorkflowAttemptStaging
  } = require("../out/core/contractV2/providerAttemptStaging.js")
  return createWorkflowAttemptStaging({
    stageArtifact: async () => {
      throw new Error("injected staging failure")
    }
  })
}

test("an unawaited staging failure takes precedence over a provider error", async (t) => {
  let writePromise
  const runtime = await providerRuntime({
    sideEffect: "workspace-write",
    dispatch: (input) => {
      writePromise = input.effect.artifacts.writeArtifact({
        id: "report",
        bytes: Uint8Array.from([1, 2, 3])
      })
      void writePromise.catch(() => {})
      throw { code: "E_SAMPLE" }
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
      attempt: rejectingAttempt()
    }),
    (error) => error?.name === "WorkflowAttemptStagingError"
      && /artifact staging failed/i.test(error.message)
  )
  await assert.rejects(writePromise, /artifact staging failed/i)
})

test("a key-required provider without a stable key fails before dispatch", async (t) => {
  let calls = 0
  const runtime = await providerRuntime({
    idempotency: "key-required",
    dispatch: () => {
      calls += 1
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
      attempt: createAttempt().attempt
    }),
    /stable idempotency key/i
  )
  assert.equal(calls, 0)
})

test("an external non-idempotent provider receives no artifact writer", async (t) => {
  let observed
  const runtime = await providerRuntime({
    sideEffect: "external",
    idempotency: "non-idempotent",
    dispatch: (input) => {
      observed = input
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
    attempt: createAttempt().attempt
  })

  assert.equal(result.ok, true)
  assert.deepEqual(observed.idempotency, { mode: "non-idempotent" })
  assert.deepEqual(observed.effect, { kind: "external" })
  assert.deepEqual(Reflect.ownKeys(observed.effect), ["kind"])
  assert.equal(Object.isFrozen(observed.idempotency), true)
  assert.equal(Object.isFrozen(observed.effect), true)
})

test("the workspace artifact writer is closed after provider settlement", async (t) => {
  let writeArtifact
  const runtime = await providerRuntime({
    sideEffect: "workspace-write",
    dispatch: (input) => {
      writeArtifact = input.effect.artifacts.writeArtifact
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
    attempt: createAttempt().attempt
  })
  assert.equal(result.ok, true)
  assert.throws(
    () => writeArtifact({ id: "late", bytes: Uint8Array.from([9]) }),
    /writer is closed/i
  )
})

test("output byte limits reject validated values without changing the dispatch count", async (t) => {
  let calls = 0
  const runtime = await providerRuntime({
    maxOutputBytes: 4,
    dispatch: () => {
      calls += 1
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
    attempt: createAttempt().attempt
  })

  assert.equal(result.ok, false)
  assert.equal(result.failure, "validation")
  assert.deepEqual(codes(result), ["WF2_PROVIDER_OUTPUT_INVALID"])
  assert.equal(calls, 1)
})

test("outer accessors and proxies are rejected without executing hostile behavior", async (t) => {
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
  const attempt = createAttempt().attempt
  let getterCalls = 0
  const accessorInput = {}
  Object.defineProperties(accessorInput, {
    lease: { enumerable: true, get() { getterCalls += 1; return runtime.lease } },
    stepId: { enumerable: true, value: "invoke" },
    value: { enumerable: true, value: { message: "hello" } },
    signal: { enumerable: true, value: signal() },
    attempt: { enumerable: true, value: attempt }
  })
  await assert.rejects(
    () => invocationSubject().invokeCompiledWorkflowProvider(accessorInput),
    /data property|ordinary/i
  )
  assert.equal(getterCalls, 0)

  let proxyTraps = 0
  const proxyInput = new Proxy({}, {
    getPrototypeOf() { proxyTraps += 1; throw new Error("proxy trap") },
    ownKeys() { proxyTraps += 1; throw new Error("proxy trap") }
  })
  await assert.rejects(
    () => invocationSubject().invokeCompiledWorkflowProvider(proxyInput),
    /non-proxy|ordinary/i
  )
  assert.equal(proxyTraps, 0)
  assert.equal(dispatches, 0)
})
