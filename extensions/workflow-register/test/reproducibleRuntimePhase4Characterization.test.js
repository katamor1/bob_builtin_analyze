const assert = require("node:assert/strict")
const path = require("node:path")
const { test } = require("node:test")

const {
  createDeterministicClock,
  createDeterministicDateClock,
  createTempRunRoot,
  createUuidSequence,
  readExactBytes,
  sha256,
  withFixedDate,
  withMockedRandomUUID
} = require("./helpers/reproducibleRuntimeHarness.js")

const FIXTURE_ROOT = path.join(__dirname, "fixtures", "reproducible-runtime")
const STORE_TIMES = [
  "2026-07-17T00:00:00.000Z",
  "2026-07-17T00:01:00.000Z",
  "2026-07-17T00:02:00.000Z",
  "2026-07-17T00:03:00.000Z"
]
const ARTIFACT_TIME = "2026-07-17T00:02:30.000Z"
const UUIDS = Array.from({ length: 32 }, (_, index) => {
  const value = (index + 1).toString(16).padStart(8, "0")
  return `${value}-0000-4000-8000-${value.padStart(12, "0")}`
})
const LEASE_UUIDS = Array.from({ length: 3 }, (_, index) => (
  `1000000${index + 1}-0000-4000-8000-10000000000${index + 1}`
))
const FIXTURE_INTEGRITY = [
  { path: "v0/run.json", bytes: 658, sha256: "06b958073f76499caa49b618c7bb769dd164efe3fd52526f95746dd9b087c465" },
  { path: "phase4-v1/run.json", bytes: 1794, sha256: "e9940f5e6849d68f16ac50f5e70493d3c078025971c5d43ad248bc74e132c0b7" },
  { path: "phase4-v1/events.jsonl", bytes: 4690, sha256: "4e4ec8d8f2a90679040c0919156c916a25c408ff284db65b048b8feffc8909a6" },
  { path: "phase4-v1/artifact-manifest.json", bytes: 974, sha256: "11e0978d805f01f702a60b46c556095184a87e6b2051363fddc2ec105e381c71" },
  { path: "future/events.jsonl", bytes: 1104, sha256: "3a9466381d2d4eee9bd66df66245316908e9770b03e5a153b0f61a153f858f85" },
  { path: "corrupt/events-middle-bitflip.jsonl", bytes: 4690, sha256: "9255bd044ca8e6047f841c8f8c0c169cdbe67f041f0463ed08e8e345f38309c1" }
]

function workflow() {
  const step = {
    id: "collect",
    title: "Collect context",
    type: "command",
    action: { provider: "fixture.collect" },
    resultKey: "context"
  }
  return {
    id: "workflow-register.reproducible-runtime-phase4",
    name: "reproducible-runtime-phase4",
    label: "Reproducible Runtime Phase 4",
    description: "Exact-byte Phase 4 characterization workflow.",
    schemaVersion: "workflow-register/v1",
    definitionHash: "sha256:phase4-characterization",
    filePath: ".bob/workflows/reproducible-runtime-phase4/WORKFLOW.md",
    inputs: { revision: { type: "string", required: true } },
    artifacts: [{
      id: "context",
      producedBy: step.id,
      path: ".bob/workflows/runs/{{run.id}}/artifacts/collect/context.txt",
      schema: "text/plain"
    }],
    engineSteps: [step]
  }
}

test("reproducible runtime fixtures retain their reviewed exact bytes", () => {
  for (const fixture of FIXTURE_INTEGRITY) {
    const bytes = readExactBytes(FIXTURE_ROOT, fixture.path)
    assert.equal(bytes.byteLength, fixture.bytes, `${fixture.path} byte length changed`)
    assert.equal(sha256(bytes), fixture.sha256, `${fixture.path} SHA-256 changed`)
  }
})

test("Phase 4 run, event log, and artifact manifest bytes stay unchanged", async (t) => {
  const workspaceRoot = createTempRunRoot(t)
  await withMockedRandomUUID(UUIDS, async () => {
    const { FileRunStateStore } = require("../out/core/runStateStore.js")
    const { createDefaultResultSinkRegistry } = require("../out/core/resultSinkRegistry.js")
    const { writeProducedArtifacts } = require("../out/core/engine/resultWriters.js")
    const definition = workflow()
    const storeClock = createDeterministicClock(STORE_TIMES, "run store clock")
    const leaseClock = createDeterministicDateClock(
      Array(3).fill("2026-07-17T00:00:30.000Z"),
      "run lease clock"
    )
    const leaseTokens = createUuidSequence(LEASE_UUIDS, "run lease token sequence")
    const store = new FileRunStateStore({
      workspaceRoot,
      now: storeClock,
      engineVersion: "phase4-engine",
      lockOptions: {
        heartbeatMs: 0,
        hostname: "phase4-fixture-host",
        now: leaseClock,
        token: leaseTokens
      }
    })
    const resultSinks = createDefaultResultSinkRegistry({
      workspaceRoot,
      executeCommand: async () => undefined,
      isWorkspaceTrusted: () => true
    })

    const run = await store.createRun(definition, { revision: "abc123" })
    await store.saveRun(run)
    run.state.context = "phase4-context\n"
    await store.saveRun(run)
    const artifactResult = await withFixedDate(ARTIFACT_TIME, () => writeProducedArtifacts({
      workflow: definition,
      run,
      step: definition.engineSteps[0],
      resultSinks,
      commitState: () => store.saveRun(run)
    }))

    assert.deepEqual(artifactResult, { ok: true })
    assert.equal(storeClock.remaining(), 0)
    assert.equal(leaseClock.remaining(), 0)
    assert.equal(leaseTokens.remaining(), 0)

    const runRoot = path.join(workspaceRoot, ".bob", "workflows", "runs", run.runId)
    const comparisons = [
      ["phase4-v1/run.json", readExactBytes(runRoot, "run.json")],
      ["phase4-v1/events.jsonl", readExactBytes(runRoot, "events.ndjson")],
      ["phase4-v1/artifact-manifest.json", readExactBytes(runRoot, "artifacts", "manifest.json")]
    ]
    for (const [fixturePath, actual] of comparisons) {
      assert.deepEqual(actual, readExactBytes(FIXTURE_ROOT, fixturePath), `${fixturePath} changed`)
    }
  })
})
