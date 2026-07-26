const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  invocationSubject,
  providerRuntime
} = require("./workflowContractV2ProviderInvocationTestSupport")

function digest(character) {
  return `sha256:${character.repeat(64)}`
}

function signal() {
  return new AbortController().signal
}

function subject() {
  return require("../out/core/contractV2/artifactTransaction.js")
}

async function temporaryRunRoot(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "workflow-contract-v2-artifact-transaction-"))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  return root
}

async function openRuntimeTransaction(t, overrides = {}) {
  const runtime = await providerRuntime({
    sideEffect: "workspace-write",
    artifactMaxBytes: overrides.artifactMaxBytes ?? 64,
    dispatch: overrides.dispatch ?? (async (input) => {
      await input.effect.artifacts.writeArtifact({
        id: "report",
        bytes: Buffer.from('{"ok":true}', "utf8")
      })
      return { ok: true }
    })
  })
  t.after(() => {
    runtime.registration.dispose()
    runtime.lease.release()
  })
  const runRoot = await temporaryRunRoot(t)
  const transaction = await subject().openWorkflowArtifactTransaction({
    lease: runtime.lease,
    runRoot,
    attemptId: overrides.attemptId ?? "attempt-0001",
    stepId: "invoke",
    inputDigest: digest("1")
  })
  return { runRoot, runtime, transaction }
}

test("provider artifacts remain invisible until the verified set and visibility record commit", async (t) => {
  const { runRoot, runtime, transaction } = await openRuntimeTransaction(t)
  const attempt = subject().workflowArtifactTransactionAttempt(transaction)

  const invocation = await invocationSubject().invokeCompiledWorkflowProvider({
    lease: runtime.lease,
    stepId: "invoke",
    value: { message: "hello" },
    signal: signal(),
    attempt
  })
  assert.equal(invocation.ok, true)

  const committedPath = path.join(runRoot, "attempts", "committed", "attempt-0001")
  assert.equal(fs.existsSync(committedPath), false)
  let visibilityCalls = 0
  const committed = await subject().commitWorkflowArtifactTransaction(
    transaction,
    async (evidence) => {
      visibilityCalls += 1
      assert.equal(fs.existsSync(committedPath), true)
      assert.equal(evidence.artifactSet.schemaVersion, "workflow-artifact-set/v2")
      assert.equal(evidence.artifactSet.entries.length, 1)
      assert.equal(evidence.artifactSet.entries[0].id, "report")
      assert.equal(evidence.artifactSet.entries[0].path, "artifacts/report.json")
      assert.match(evidence.artifactSetDigest, /^sha256:[0-9a-f]{64}$/)
    }
  )

  assert.equal(visibilityCalls, 1)
  assert.equal(Object.isFrozen(committed), true)
  assert.equal(Object.isFrozen(committed.artifactSet), true)
  assert.equal(Object.isFrozen(committed.artifactSet.entries), true)
  assert.equal(
    await fsp.readFile(path.join(committedPath, "artifacts", "report.json"), "utf8"),
    '{"ok":true}'
  )
  const inspection = await subject().inspectCommittedWorkflowArtifactTransaction({
    runRoot,
    attemptId: "attempt-0001",
    expectedArtifactSetDigest: committed.artifactSetDigest
  })
  assert.equal(inspection.status, "committed")
  assert.deepEqual(inspection.artifactSet, committed.artifactSet)
})

test("a promoted directory without visibility commit is retained as an invisible orphan", async (t) => {
  const { runRoot, runtime, transaction } = await openRuntimeTransaction(t, {
    attemptId: "attempt-orphan"
  })
  const attempt = subject().workflowArtifactTransactionAttempt(transaction)
  await invocationSubject().invokeCompiledWorkflowProvider({
    lease: runtime.lease,
    stepId: "invoke",
    value: { message: "hello" },
    signal: signal(),
    attempt
  })

  await assert.rejects(
    () => subject().commitWorkflowArtifactTransaction(transaction, async () => {
      throw new Error("injected visibility commit failure")
    }),
    /visibility commit failure/
  )

  const committedPath = path.join(runRoot, "attempts", "committed", "attempt-orphan")
  assert.equal(fs.existsSync(committedPath), true)
  const inspection = await subject().inspectCommittedWorkflowArtifactTransaction({
    runRoot,
    attemptId: "attempt-orphan"
  })
  assert.equal(inspection.status, "orphaned")
})

test("artifact verification rejects a file replaced by a symlink before promotion", async (t) => {
  const { runRoot, runtime, transaction } = await openRuntimeTransaction(t, {
    attemptId: "attempt-link"
  })
  const attempt = subject().workflowArtifactTransactionAttempt(transaction)
  await invocationSubject().invokeCompiledWorkflowProvider({
    lease: runtime.lease,
    stepId: "invoke",
    value: { message: "hello" },
    signal: signal(),
    attempt
  })

  const stagedFile = path.join(runRoot, "attempts", "staging", "attempt-link", "artifacts", "report.json")
  const replacement = path.join(runRoot, "replacement.json")
  await fsp.writeFile(replacement, '{"ok":false}', "utf8")
  await fsp.rm(stagedFile)
  try {
    await fsp.symlink(replacement, stagedFile)
  } catch (error) {
    t.skip(`host cannot create symlink for this case: ${error.code ?? error.message}`)
    return
  }

  let visibilityCalls = 0
  await assert.rejects(
    () => subject().commitWorkflowArtifactTransaction(transaction, async () => {
      visibilityCalls += 1
    }),
    /symlink|regular file|changed|verification/i
  )
  assert.equal(visibilityCalls, 0)
  assert.equal(fs.existsSync(path.join(runRoot, "attempts", "committed", "attempt-link")), false)
})

test("attempt IDs and committed destinations are immutable and collision-free", async (t) => {
  const first = await openRuntimeTransaction(t, { attemptId: "attempt-fixed" })
  await assert.rejects(
    () => subject().openWorkflowArtifactTransaction({
      lease: first.runtime.lease,
      runRoot: first.runRoot,
      attemptId: "attempt-fixed",
      stepId: "invoke",
      inputDigest: digest("1")
    }),
    /exists|collision|allocated/i
  )
  await assert.rejects(
    () => subject().openWorkflowArtifactTransaction({
      lease: first.runtime.lease,
      runRoot: first.runRoot,
      attemptId: "../escape",
      stepId: "invoke",
      inputDigest: digest("1")
    }),
    /attempt id|invalid/i
  )
})

test("artifact-set bytes and digest are deterministic for equivalent staged content", async (t) => {
  const left = await openRuntimeTransaction(t, { attemptId: "attempt-left" })
  const rightRoot = await temporaryRunRoot(t)
  const right = await subject().openWorkflowArtifactTransaction({
    lease: left.runtime.lease,
    runRoot: rightRoot,
    attemptId: "attempt-right",
    stepId: "invoke",
    inputDigest: digest("1")
  })

  for (const transaction of [left.transaction, right]) {
    await invocationSubject().invokeCompiledWorkflowProvider({
      lease: left.runtime.lease,
      stepId: "invoke",
      value: { message: "hello" },
      signal: signal(),
      attempt: subject().workflowArtifactTransactionAttempt(transaction)
    })
  }
  const leftCommit = await subject().commitWorkflowArtifactTransaction(left.transaction, async () => {})
  const rightCommit = await subject().commitWorkflowArtifactTransaction(right, async () => {})

  assert.equal(leftCommit.artifactSetDigest, rightCommit.artifactSetDigest)
  assert.deepEqual(leftCommit.artifactSet.entries, rightCommit.artifactSet.entries)
})
