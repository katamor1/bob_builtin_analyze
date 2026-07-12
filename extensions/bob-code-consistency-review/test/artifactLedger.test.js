const assert = require("node:assert/strict")
const { test } = require("node:test")

function ledgerApi() {
  return require("../out/evidenceScope/artifactLedger")
}

const HASH_A = `sha256:${"a".repeat(64)}`
const HASH_B = `sha256:${"b".repeat(64)}`
const HASH_C = `sha256:${"c".repeat(64)}`
const REV_A = "1".repeat(40)
const REV_B = "2".repeat(40)

function observation(overrides = {}) {
  return {
    id: "repository-symbol-index:repo",
    kind: "repository-symbol-index",
    producer: "producer-v1",
    path: ".bob/evidence-scope/repository-symbol-index.json",
    content_hash: HASH_A,
    input_hash: HASH_A,
    source_revision: REV_A,
    depends_on: [],
    ...overrides
  }
}

function previousLedger() {
  return {
    schema_version: 1,
    ledger_id: "bob-evidence-scope",
    source_revision: REV_A,
    artifacts: [
      {
        ...observation(),
        status: "fresh",
        stale_reasons: []
      },
      {
        ...observation({
          id: "review-package:REVIEW-001",
          kind: "review-package",
          producer: "bob-code-consistency-review@0.1.0",
          path: ".bob-review/review-package",
          content_hash: HASH_B,
          input_hash: HASH_C,
          source_revision: `${REV_A}..${REV_A}`,
          depends_on: ["repository-symbol-index:repo"]
        }),
        status: "fresh",
        stale_reasons: []
      }
    ]
  }
}

test("changed upstream marks an unobserved review package stale", () => {
  const { reconcileArtifactLedger } = ledgerApi()
  const result = reconcileArtifactLedger(previousLedger(), {
    sourceRevision: REV_A,
    observations: [observation({ content_hash: HASH_C })],
    completeKinds: ["repository-symbol-index"]
  })

  const index = result.artifacts.find((item) => item.id === "repository-symbol-index:repo")
  const packageRecord = result.artifacts.find((item) => item.id === "review-package:REVIEW-001")
  assert.equal(index.status, "fresh")
  assert.equal(packageRecord.status, "stale")
  assert.deepEqual(packageRecord.stale_reasons, ["upstream-changed:repository-symbol-index:repo"])
})

test("a rebuilt dependent observed with current upstream is fresh", () => {
  const { reconcileArtifactLedger } = ledgerApi()
  const result = reconcileArtifactLedger(previousLedger(), {
    sourceRevision: REV_A,
    observations: [
      observation({ content_hash: HASH_C }),
      observation({
        id: "review-package:REVIEW-001",
        kind: "review-package",
        producer: "bob-code-consistency-review@0.1.0",
        path: ".bob-review/review-package",
        content_hash: HASH_C,
        input_hash: HASH_B,
        source_revision: `${REV_A}..${REV_A}`,
        depends_on: ["repository-symbol-index:repo"]
      })
    ],
    completeKinds: ["repository-symbol-index", "review-package"]
  })

  const packageRecord = result.artifacts.find((item) => item.id === "review-package:REVIEW-001")
  assert.equal(packageRecord.status, "fresh")
  assert.deepEqual(packageRecord.stale_reasons, [])
})

test("missing upstream is recorded and propagates to dependents", () => {
  const { reconcileArtifactLedger } = ledgerApi()
  const result = reconcileArtifactLedger(previousLedger(), {
    sourceRevision: REV_A,
    observations: [],
    completeKinds: ["repository-symbol-index"]
  })

  const index = result.artifacts.find((item) => item.id === "repository-symbol-index:repo")
  const packageRecord = result.artifacts.find((item) => item.id === "review-package:REVIEW-001")
  assert.equal(index.status, "missing")
  assert.deepEqual(index.stale_reasons, ["artifact-missing"])
  assert.equal(packageRecord.status, "stale")
  assert.deepEqual(packageRecord.stale_reasons, ["dependency-missing:repository-symbol-index:repo"])
})

test("source revision changes stale unobserved artifacts", () => {
  const { reconcileArtifactLedger } = ledgerApi()
  const result = reconcileArtifactLedger(previousLedger(), {
    sourceRevision: REV_B,
    observations: [],
    completeKinds: []
  })

  for (const record of result.artifacts) {
    assert.notEqual(record.status, "fresh")
    assert.ok(record.stale_reasons.includes("source-revision-changed"))
  }
})

test("ledger ordering and normalization are deterministic and source-free", () => {
  const { reconcileArtifactLedger } = ledgerApi()
  const packageObservation = observation({
    id: "review-package:Z",
    kind: "review-package",
    path: ".bob-review/z",
    content_hash: HASH_B,
    input_hash: HASH_C,
    source_revision: `${REV_A}..${REV_A}`,
    depends_on: ["project-rule-pack:rules", "repository-symbol-index:repo", "project-rule-pack:rules"],
    raw_body: "RAW-LEDGER-SENTINEL"
  })
  const ruleObservation = observation({
    id: "project-rule-pack:rules",
    kind: "project-rule-pack",
    path: ".bob/evidence-scope/rules.yaml",
    content_hash: HASH_C,
    depends_on: []
  })

  const left = reconcileArtifactLedger(undefined, {
    sourceRevision: REV_A,
    observations: [packageObservation, observation(), ruleObservation],
    completeKinds: ["review-package", "repository-symbol-index", "project-rule-pack"]
  })
  const right = reconcileArtifactLedger(undefined, {
    sourceRevision: REV_A,
    observations: [ruleObservation, observation(), packageObservation],
    completeKinds: ["project-rule-pack", "repository-symbol-index", "review-package"]
  })

  assert.deepEqual(left, right)
  assert.deepEqual(left.artifacts.map((item) => item.id), [
    "project-rule-pack:rules",
    "repository-symbol-index:repo",
    "review-package:Z"
  ])
  assert.deepEqual(left.artifacts[2].depends_on, [
    "project-rule-pack:rules",
    "repository-symbol-index:repo"
  ])
  assert.doesNotMatch(JSON.stringify(left), /RAW-LEDGER-SENTINEL/)
})

test("duplicate observations and self dependencies are rejected", () => {
  const { reconcileArtifactLedger } = ledgerApi()
  assert.throws(
    () => reconcileArtifactLedger(undefined, {
      sourceRevision: REV_A,
      observations: [observation(), observation()],
      completeKinds: []
    }),
    /duplicate artifact observation id/
  )
  assert.throws(
    () => reconcileArtifactLedger(undefined, {
      sourceRevision: REV_A,
      observations: [observation({ depends_on: ["repository-symbol-index:repo"] })],
      completeKinds: []
    }),
    /must not depend on itself/
  )
})
