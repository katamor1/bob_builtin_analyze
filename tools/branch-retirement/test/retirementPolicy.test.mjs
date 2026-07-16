import test from "node:test"
import assert from "node:assert/strict"

import {
  evaluateRetirementEntry,
  summarizeRetirementAudit,
  validateRetirementMap
} from "../retirementPolicy.mjs"

const sha = "a".repeat(40)

function validMap() {
  return {
    schemaVersion: "bob-builtin-analyze/branch-retirement-map/v1",
    repository: "katamor1/bob_builtin_analyze",
    baselineMain: sha,
    entries: [
      {
        branch: "agent/example",
        expectedHeadSha: sha,
        expectedDisposition: "superseded",
        predecessorPullRequests: [1],
        replacementPullRequests: [2],
        requiredMainPaths: ["src/example.ts"],
        forbiddenMainPaths: [".github/workflows/example-temp.yml"],
        evidenceChecks: ["example-behavior"]
      }
    ]
  }
}

function passingObservation() {
  return {
    exists: true,
    remoteHeadSha: sha,
    headStable: true,
    observedDisposition: "superseded",
    replacementPullRequestsMerged: true,
    diagnosticTargetClosed: true,
    productionReplacementMerged: true,
    requiredMainPaths: { passed: true, missing: [] },
    forbiddenMainPaths: { passed: true, present: [] },
    behaviorChecks: { passed: true, checks: [{ id: "example-behavior", passed: true }] },
    openPullRequestReference: false,
    protectionChecked: true,
    protected: false,
    uniqueUnintegratedFiles: [],
    reasons: []
  }
}

test("validates a well-formed retirement map", () => {
  assert.equal(validateRetirementMap(validMap()), true)
})

test("rejects duplicate branches, main, unknown dispositions, and malformed SHA", () => {
  const duplicate = validMap()
  duplicate.entries.push(structuredClone(duplicate.entries[0]))
  assert.throws(() => validateRetirementMap(duplicate), /duplicate branch/i)

  const main = validMap()
  main.entries[0].branch = "main"
  assert.throws(() => validateRetirementMap(main), /default branch/i)

  const disposition = validMap()
  disposition.entries[0].expectedDisposition = "mystery"
  assert.throws(() => validateRetirementMap(disposition), /disposition/i)

  const malformedSha = validMap()
  malformedSha.entries[0].expectedHeadSha = "abc"
  assert.throws(() => validateRetirementMap(malformedSha), /40-character/i)
})

test("requires replacement evidence and diagnostic production mapping", () => {
  const missingReplacement = validMap()
  missingReplacement.entries[0].replacementPullRequests = []
  assert.throws(() => validateRetirementMap(missingReplacement), /replacement pull request/i)

  const diagnostic = validMap()
  diagnostic.entries[0].expectedDisposition = "diagnostic-only"
  diagnostic.entries[0].relatedProductionPullRequests = []
  assert.throws(() => validateRetirementMap(diagnostic), /related production/i)
})

test("rejects overlap between required and forbidden paths", () => {
  const map = validMap()
  map.entries[0].forbiddenMainPaths = ["src/example.ts"]
  assert.throws(() => validateRetirementMap(map), /both required and forbidden/i)
})

test("evaluates an existing branch as deletable only when every gate passes", () => {
  const entry = validMap().entries[0]
  const result = evaluateRetirementEntry(entry, passingObservation())
  assert.equal(result.deletable, true)
  assert.equal(result.safeToRetire, true)
  assert.equal(result.observedDisposition, "superseded")
  assert.deepEqual(result.reasons, [])
})

test("fails closed for moved heads, open PR references, protection, behavior gaps, and unique files", () => {
  const entry = validMap().entries[0]
  for (const mutate of [
    (o) => { o.headStable = false },
    (o) => { o.remoteHeadSha = "b".repeat(40) },
    (o) => { o.openPullRequestReference = true },
    (o) => { o.protectionChecked = false },
    (o) => { o.protected = true },
    (o) => { o.behaviorChecks = { passed: false, checks: [{ id: "example-behavior", passed: false }] } },
    (o) => { o.uniqueUnintegratedFiles = ["src/unique.ts"] }
  ]) {
    const observation = passingObservation()
    mutate(observation)
    const result = evaluateRetirementEntry(entry, observation)
    assert.equal(result.deletable, false, JSON.stringify(result))
    assert.equal(result.safeToRetire, false, JSON.stringify(result))
    assert.ok(result.reasons.length > 0)
  }
})

test("classifies a missing remote ref as already-absent without scheduling deletion", () => {
  const entry = validMap().entries[0]
  const result = evaluateRetirementEntry(entry, { exists: false, reasons: [] })
  assert.equal(result.observedDisposition, "already-absent")
  assert.equal(result.deletable, false)
  assert.equal(result.safeToRetire, true)
})

test("never makes blocked-unique deletable", () => {
  const entry = validMap().entries[0]
  const observation = passingObservation()
  observation.observedDisposition = "blocked-unique"
  const result = evaluateRetirementEntry(entry, observation)
  assert.equal(result.deletable, false)
  assert.equal(result.safeToRetire, false)
})

test("summarizes ready state only when all entries are safe and review gates are green", () => {
  const entry = evaluateRetirementEntry(validMap().entries[0], passingObservation())
  const ready = summarizeRetirementAudit({
    repository: "katamor1/bob_builtin_analyze",
    auditedMainSha: sha,
    entries: [entry],
    mainGuard: {
      defaultBranch: "main",
      protected: true,
      protectionChecked: true,
      unprotectedExactShaGuardAuthorized: false
    },
    review: { critical: 0, important: 0 },
    hostedGatesPassed: true
  })
  assert.equal(ready.ready_for_deletion, true)
  assert.deepEqual(ready.blockedBranches, [])

  const blocked = summarizeRetirementAudit({
    repository: "katamor1/bob_builtin_analyze",
    auditedMainSha: sha,
    entries: [{ ...entry, safeToRetire: false, reasons: ["blocked"] }],
    mainGuard: {
      defaultBranch: "main",
      protected: true,
      protectionChecked: true,
      unprotectedExactShaGuardAuthorized: false
    },
    review: { critical: 0, important: 0 },
    hostedGatesPassed: true
  })
  assert.equal(blocked.ready_for_deletion, false)
  assert.deepEqual(blocked.blockedBranches, ["agent/example"])
})
