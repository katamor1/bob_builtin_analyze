import test from 'node:test'
import assert from 'node:assert/strict'
import { auditFromObservations, parseRemoteRefs, renderAuditMarkdown } from '../audit-branch-retirement.mjs'

const SHA = 'a'.repeat(40)
const MAIN = '1'.repeat(40)

function map() {
  return {
    schemaVersion: 'bob-builtin-analyze/branch-retirement-map/v1',
    repository: 'katamor1/bob_builtin_analyze',
    baselineMain: MAIN,
    entries: [{
      branch: 'agent/example',
      expectedDisposition: 'superseded',
      expectedSha: SHA,
      replacementPullRequests: [82],
      requiredMainPaths: ['src/example.ts'],
      forbiddenMainPaths: ['.github/workflows/temp.yml']
    }]
  }
}

test('parses exact remote head refs', () => {
  assert.deepEqual([...parseRemoteRefs(`${SHA}\trefs/heads/agent/example\n`)], [['agent/example', SHA]])
  assert.throws(() => parseRemoteRefs('not-a-ref'))
})

test('produces a ready manifest and readable markdown from verified observations', () => {
  const audit = auditFromObservations({
    map: map(),
    currentMainSha: MAIN,
    defaultBranch: 'main',
    remoteRefs: new Map([['agent/example', SHA]]),
    mergedPullRequests: new Set([82]),
    mainPaths: new Set(['src/example.ts']),
    openPrRefs: new Set(),
    protectedBranches: new Set(['main']),
    baselineMainIsAncestor: true,
    generatedAt: '2026-07-16T00:00:00.000Z'
  })
  assert.equal(audit.ready_for_deletion, true)
  assert.deepEqual(audit.deletableBranches, ['agent/example'])
  assert.match(renderAuditMarkdown(audit), /Ready for deletion: \*\*yes\*\*/)
})
