const assert = require("node:assert/strict")
const { test } = require("node:test")

function subject() {
  return require("../out/core/contractV2/runAttemptRecovery.js")
}

const digestA = `sha256:${"a".repeat(64)}`
const digestB = `sha256:${"b".repeat(64)}`

function plan() {
  return Object.freeze({
    workflow: Object.freeze({
      steps: Object.freeze([
        Object.freeze({ id: "writeFirst", type: "command", provider: "writer" }),
        Object.freeze({ id: "writeSecond", type: "command", provider: "writer" })
      ])
    }),
    providerBindings: Object.freeze([
      Object.freeze({ id: "writer", sideEffect: "workspace-write" })
    ])
  })
}

function run(status, currentStep, firstStatus, secondStatus, secondAttempt = undefined) {
  return {
    runId: "run-1",
    workflowSchemaVersion: "workflow-register/v2",
    status,
    currentStep,
    state: {
      "workflow.contractV2.artifactSet.writeFirst": JSON.stringify({
        artifactSetDigest: digestA,
        attemptId: "attempt-0001-0001"
      })
    },
    steps: [
      { id: "writeFirst", status: firstStatus, attempt: 1 },
      {
        id: "writeSecond",
        status: secondStatus,
        ...(secondAttempt === undefined ? {} : { attempt: secondAttempt })
      }
    ]
  }
}

test("paused recovery revalidates every recorded committed artifact set", async () => {
  const calls = []
  const classify = subject().createWorkflowContractV2AttemptRecoveryClassifier(async (input) => {
    calls.push(input)
    return Object.freeze({
      status: "committed",
      artifactSet: Object.freeze({ attemptId: input.attemptId }),
      artifactSetDigest: input.expectedArtifactSetDigest
    })
  })
  const selectedRun = run("paused", "writeSecond", "completed", "pending")

  const result = await classify({
    plan: plan(),
    run: selectedRun,
    runRoot: "/workspace/.bob/workflows/runs/run-1"
  })

  assert.equal(result.kind, "clean")
  assert.deepEqual(result.committed, [Object.freeze({
    stepId: "writeFirst",
    attemptId: "attempt-0001-0001",
    artifactSetDigest: digestA
  })])
  assert.deepEqual(calls, [Object.freeze({
    runRoot: "/workspace/.bob/workflows/runs/run-1",
    attemptId: "attempt-0001-0001",
    expectedArtifactSetDigest: digestA
  })])
})

test("a running staging-only attempt is classified in-doubt without claiming success", async () => {
  const classify = subject().createWorkflowContractV2AttemptRecoveryClassifier(async (input) => {
    if (input.attemptId === "attempt-0001-0001") {
      return Object.freeze({ status: "committed", artifactSet: Object.freeze({}), artifactSetDigest: digestA })
    }
    return Object.freeze({ status: "staging" })
  })

  const result = await classify({
    plan: plan(),
    run: run("running", "writeSecond", "completed", "running", 2),
    runRoot: "/workspace/.bob/workflows/runs/run-1"
  })

  assert.deepEqual(result, Object.freeze({
    kind: "in-doubt",
    stepId: "writeSecond",
    attemptId: "attempt-0002-0002",
    artifactStatus: "staging",
    committed: Object.freeze([Object.freeze({
      stepId: "writeFirst",
      attemptId: "attempt-0001-0001",
      artifactSetDigest: digestA
    })])
  }))
})

test("a promoted artifact set without run visibility remains orphaned and in-doubt", async () => {
  const classify = subject().createWorkflowContractV2AttemptRecoveryClassifier(async (input) => {
    if (input.expectedArtifactSetDigest !== undefined) {
      return Object.freeze({ status: "committed", artifactSet: Object.freeze({}), artifactSetDigest: digestA })
    }
    return Object.freeze({ status: "orphaned", artifactSetDigest: digestB })
  })

  const result = await classify({
    plan: plan(),
    run: run("running", "writeSecond", "completed", "running", 2),
    runRoot: "/workspace/.bob/workflows/runs/run-1"
  })

  assert.equal(result.kind, "in-doubt")
  assert.equal(result.artifactStatus, "orphaned")
  assert.equal(result.artifactSetDigest, digestB)
})

test("malformed visibility evidence fails closed without invoking artifact inspection", async () => {
  let calls = 0
  const classify = subject().createWorkflowContractV2AttemptRecoveryClassifier(async () => {
    calls += 1
    return Object.freeze({ status: "missing" })
  })
  const selectedRun = run("paused", "writeSecond", "completed", "pending")
  selectedRun.state["workflow.contractV2.artifactSet.writeFirst"] = "{\"attemptId\":\"attempt-0001-0001\",\"attemptId\":\"replacement\"}"

  const result = await classify({
    plan: plan(),
    run: selectedRun,
    runRoot: "/workspace/.bob/workflows/runs/run-1"
  })

  assert.equal(result.kind, "invalid")
  assert.equal(calls, 0)
})

test("a non-string visibility value is rejected before Buffer or inspector behavior", async () => {
  let calls = 0
  const classify = subject().createWorkflowContractV2AttemptRecoveryClassifier(async () => {
    calls += 1
    return Object.freeze({ status: "missing" })
  })
  const selectedRun = run("paused", "writeSecond", "completed", "pending")
  selectedRun.state["workflow.contractV2.artifactSet.writeFirst"] = Object.freeze({
    attemptId: "attempt-0001-0001",
    artifactSetDigest: digestA
  })

  const result = await classify({
    plan: plan(),
    run: selectedRun,
    runRoot: "/workspace/.bob/workflows/runs/run-1"
  })

  assert.equal(result.kind, "invalid")
  assert.equal(calls, 0)
})

test("a proxied durable state is rejected without invoking its traps", async () => {
  let traps = 0
  let calls = 0
  const classify = subject().createWorkflowContractV2AttemptRecoveryClassifier(async () => {
    calls += 1
    return Object.freeze({ status: "missing" })
  })
  const selectedRun = run("paused", "writeSecond", "completed", "pending")
  selectedRun.state = new Proxy({}, {
    get() {
      traps += 1
      throw new Error("state trap must not run")
    },
    ownKeys() {
      traps += 1
      throw new Error("state trap must not run")
    }
  })

  const result = await classify({
    plan: plan(),
    run: selectedRun,
    runRoot: "/workspace/.bob/workflows/runs/run-1"
  })

  assert.equal(result.kind, "invalid")
  assert.equal(traps, 0)
  assert.equal(calls, 0)
})

test("repeated classification is deterministic and does not mutate durable evidence", async () => {
  const classify = subject().createWorkflowContractV2AttemptRecoveryClassifier(async (input) => Object.freeze({
    status: "committed",
    artifactSet: Object.freeze({}),
    artifactSetDigest: input.expectedArtifactSetDigest
  }))
  const selectedRun = run("paused", "writeSecond", "completed", "pending")
  const before = JSON.stringify(selectedRun)
  const input = {
    plan: plan(),
    run: selectedRun,
    runRoot: "/workspace/.bob/workflows/runs/run-1"
  }

  assert.deepEqual(await classify(input), await classify(input))
  assert.equal(JSON.stringify(selectedRun), before)
})
