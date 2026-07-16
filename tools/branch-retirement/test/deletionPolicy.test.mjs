import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateDeletionInputs,
  buildAtomicDeletionPlan,
  summarizeDeletionResult
} from '../deletionPolicy.mjs'

const MAIN = '1'.repeat(40)
const A = 'a'.repeat(40)
const B = 'b'.repeat(40)

function manifest() {
  return {
    schemaVersion: 'bob-builtin-analyze/branch-retirement-audit/v1',
    repository: 'katamor1/bob_builtin_analyze',
    auditedMainSha: MAIN,
    ready_for_deletion: true,
    blockedBranches: [],
    entries: [
      { branch: 'agent/a', remoteSha: A, disposition: 'superseded', deletable: true, replacementPullRequests: [82] },
      { branch: 'agent/b', remoteSha: B, disposition: 'merged-source', deletable: true, replacementPullRequests: [93] },
      { branch: 'agent/absent', remoteSha: null, disposition: 'already-absent', deletable: false, replacementPullRequests: [97] }
    ]
  }
}

test('rejects unsafe deletion inputs', () => {
  const base = {
    manifest: manifest(),
    repository: 'katamor1/bob_builtin_analyze',
    remote: 'origin',
    defaultBranch: 'main',
    currentMainSha: MAIN,
    auditedMainIsAncestor: true,
    protectedBranches: new Set(),
    openPrRefs: new Set(),
    remoteRefs: new Map([['agent/a', A], ['agent/b', B]]),
    executionBranch: 'integration/retire-superseded-branches-20260716'
  }
  assert.doesNotThrow(() => validateDeletionInputs(base))

  for (const patch of [
    { manifest: { ...manifest(), ready_for_deletion: false } },
    { manifest: { ...manifest(), blockedBranches: ['agent/a'] } },
    { openPrRefs: new Set(['agent/a']) },
    { remoteRefs: new Map([['agent/a', 'c'.repeat(40)], ['agent/b', B]]) },
    { auditedMainIsAncestor: false },
    { protectedBranches: new Set(['agent/a']) }
  ]) {
    assert.throws(() => validateDeletionInputs({ ...base, ...patch }))
  }
})

test('allows an unprotected default branch only because main is explicitly excluded and verified separately', () => {
  const inputs = {
    manifest: manifest(),
    repository: 'katamor1/bob_builtin_analyze',
    remote: 'origin',
    defaultBranch: 'main',
    currentMainSha: MAIN,
    auditedMainIsAncestor: true,
    protectedBranches: new Set(),
    openPrRefs: new Set(),
    remoteRefs: new Map([['agent/a', A], ['agent/b', B]]),
    executionBranch: 'integration/retire-superseded-branches-20260716'
  }
  assert.doesNotThrow(() => validateDeletionInputs(inputs))
  const unsafe = manifest()
  unsafe.entries[0] = { ...unsafe.entries[0], branch: 'main' }
  assert.throws(() => validateDeletionInputs({ ...inputs, manifest: unsafe }), /cannot be deleted/)
})

test('builds one atomic deletion argv with a force-with-lease for every ref', () => {
  const plan = buildAtomicDeletionPlan({
    manifest: manifest(),
    repository: 'katamor1/bob_builtin_analyze',
    remote: 'origin',
    currentMainSha: MAIN,
    remoteRefs: new Map([['agent/a', A], ['agent/b', B]])
  })
  assert.deepEqual(plan.branches.map((item) => item.branch), ['agent/a', 'agent/b'])
  assert.deepEqual(plan.alreadyAbsent, ['agent/absent'])
  assert.deepEqual(plan.command, [
    'git', 'push', '--atomic',
    `--force-with-lease=refs/heads/agent/a:${A}`,
    `--force-with-lease=refs/heads/agent/b:${B}`,
    'origin',
    ':refs/heads/agent/a',
    ':refs/heads/agent/b'
  ])
})

test('summarizes verified and failed deletion without hiding leftovers', () => {
  assert.equal(summarizeDeletionResult({ planned: ['a'], remaining: [] }).status, 'success')
  const failed = summarizeDeletionResult({ planned: ['a'], remaining: ['a'] })
  assert.equal(failed.status, 'verification_failed')
  assert.deepEqual(failed.remaining, ['a'])
})
