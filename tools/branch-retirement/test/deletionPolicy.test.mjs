import test from "node:test"
import assert from "node:assert/strict"

import {
  buildAtomicDeletionPlan,
  summarizeDeletionResult,
  validateDeletionInputs
} from "../deletionPolicy.mjs"

const mainSha = "a".repeat(40)
const branchSha = "b".repeat(40)

function manifest() {
  return {
    schemaVersion: "bob-builtin-analyze/branch-retirement-audit/v1",
    repository: "katamor1/bob_builtin_analyze",
    auditedMainSha: mainSha,
    mainGuard: {
      defaultBranch: "main",
      protected: true,
      protectionChecked: true,
      unprotectedExactShaGuardAuthorized: false
    },
    ready_for_deletion: true,
    blockedBranches: [],
    entries: [
      {
        branch: "agent/example",
        remoteHeadSha: branchSha,
        observedDisposition: "superseded",
        replacementPullRequests: [2],
        deletable: true,
        safeToRetire: true,
        reasons: []
      },
      {
        branch: "agent/already-absent",
        remoteHeadSha: null,
        observedDisposition: "already-absent",
        replacementPullRequests: [3],
        deletable: false,
        safeToRetire: true,
        reasons: []
      }
    ]
  }
}

function inputs(overrides = {}) {
  return {
    manifest: manifest(),
    repository: "katamor1/bob_builtin_analyze",
    remote: "origin",
    defaultBranch: "main",
    currentMainSha: mainSha,
    auditedMainIsAncestor: true,
    remoteBranches: new Map([["main", mainSha], ["agent/example", branchSha], ["agent/unknown", "c".repeat(40)]]),
    openPullRequestRefs: new Set(),
    protectedBranches: new Set(["main"]),
    executionBranch: "integration/retire-superseded-branches-20260716-v2",
    ...overrides
  }
}

test("validates a safe deletion input", () => {
  assert.equal(validateDeletionInputs(inputs()), true)
})

test("rejects non-ready or blocked manifests", () => {
  const notReady = inputs()
  notReady.manifest.ready_for_deletion = false
  assert.throws(() => validateDeletionInputs(notReady), /ready_for_deletion/i)

  const blocked = inputs()
  blocked.manifest.blockedBranches = ["agent/example"]
  assert.throws(() => validateDeletionInputs(blocked), /blockedBranches/i)
})


test("requires main itself to remain protected", () => {
  const value = inputs()
  value.protectedBranches.delete("main")
  assert.throws(() => validateDeletionInputs(value), /main.*protected|protection state.*changed/i)
})

test("permits unprotected main only when the manifest and caller authorize the exact-SHA guard", () => {
  const value = inputs({ allowUnprotectedMainExactShaGuard: true })
  value.protectedBranches.delete("main")
  value.manifest.mainGuard = {
    defaultBranch: "main",
    protected: false,
    protectionChecked: true,
    unprotectedExactShaGuardAuthorized: true
  }
  assert.equal(validateDeletionInputs(value), true)
})

test("rejects stale or incomplete unprotected-main authorization", () => {
  const missingCaller = inputs()
  missingCaller.protectedBranches.delete("main")
  missingCaller.manifest.mainGuard = {
    defaultBranch: "main",
    protected: false,
    protectionChecked: true,
    unprotectedExactShaGuardAuthorized: true
  }
  assert.throws(() => validateDeletionInputs(missingCaller), /exact-SHA guard/i)

  const staleManifest = inputs({ allowUnprotectedMainExactShaGuard: true })
  staleManifest.protectedBranches.delete("main")
  assert.throws(() => validateDeletionInputs(staleManifest), /protection state.*changed|manifest.*protected/i)
})

test("rejects default, protected, open-PR, and execution branches", () => {
  for (const mutate of [
    (value) => { value.manifest.entries[0].branch = "main"; value.manifest.entries[0].remoteHeadSha = mainSha },
    (value) => { value.protectedBranches.add("agent/example") },
    (value) => { value.openPullRequestRefs.add("agent/example") },
    (value) => { value.manifest.entries[0].branch = value.executionBranch; value.remoteBranches.set(value.executionBranch, branchSha) }
  ]) {
    const value = inputs()
    mutate(value)
    assert.throws(() => validateDeletionInputs(value), /default|protected|open pull|execution/i)
  }
})

test("rejects malformed or moved heads and non-ancestor main", () => {
  const malformed = inputs()
  malformed.manifest.entries[0].remoteHeadSha = "bad"
  assert.throws(() => validateDeletionInputs(malformed), /40-character/i)

  const moved = inputs()
  moved.remoteBranches.set("agent/example", "c".repeat(40))
  assert.throws(() => validateDeletionInputs(moved), /moved|does not match/i)

  const diverged = inputs({ auditedMainIsAncestor: false })
  assert.throws(() => validateDeletionInputs(diverged), /ancestor/i)
})

test("builds one atomic push command with a lease for every exact ref", () => {
  const plan = buildAtomicDeletionPlan(inputs())
  assert.deepEqual(plan.branches, [{
    branch: "agent/example",
    expectedSha: branchSha,
    disposition: "superseded",
    replacementPullRequests: [2]
  }])
  assert.deepEqual(plan.alreadyAbsent, ["agent/already-absent"])
  assert.deepEqual(plan.command, [
    "git", "push", "--atomic",
    `--force-with-lease=refs/heads/agent/example:${branchSha}`,
    "origin",
    ":refs/heads/agent/example"
  ])
  assert.equal(plan.command.some((part) => part.includes("agent/unknown")), false)
})

test("does not generate a push command for a zero-target batch", () => {
  const value = inputs()
  value.remoteBranches.delete("agent/example")
  value.manifest.entries[0] = {
    ...value.manifest.entries[0],
    remoteHeadSha: null,
    observedDisposition: "already-absent",
    deletable: false,
    safeToRetire: true
  }
  const plan = buildAtomicDeletionPlan(value)
  assert.deepEqual(plan.branches, [])
  assert.equal(plan.command, null)
  assert.deepEqual(plan.alreadyAbsent.sort(), ["agent/already-absent", "agent/example"].sort())
})

test("summarizes dry run and apply verification without hiding failures", () => {
  const plan = buildAtomicDeletionPlan(inputs())
  const dryRun = summarizeDeletionResult(plan, { mode: "dry-run" })
  assert.equal(dryRun.status, "dry-run")
  assert.equal(dryRun.atomic, true)
  assert.equal(dryRun.wouldDelete.length, 1)

  const failed = summarizeDeletionResult(plan, {
    mode: "apply",
    pushSucceeded: true,
    postVerification: {
      targetsAbsent: false,
      defaultBranchIsMain: true,
      mainUnchangedDuringDeletion: true
    }
  })
  assert.equal(failed.status, "verification_failed")
})
