import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateRetirementMap,
  evaluateRetirementEntry,
  summarizeRetirementAudit
} from '../retirementPolicy.mjs'

const SHA = 'a'.repeat(40)

function validMap() {
  return {
    schemaVersion: 'bob-builtin-analyze/branch-retirement-map/v1',
    repository: 'katamor1/bob_builtin_analyze',
    baselineMain: SHA,
    entries: [{
      branch: 'agent/example',
      expectedDisposition: 'superseded',
      expectedSha: SHA,
      replacementPullRequests: [82],
      requiredMainPaths: ['src/example.ts'],
      forbiddenMainPaths: ['.github/workflows/example-temp.yml']
    }]
  }
}

test('validates the retirement map and rejects unsafe entries', () => {
  assert.doesNotThrow(() => validateRetirementMap(validMap()))

  for (const mutate of [
    (map) => map.entries.push(structuredClone(map.entries[0])),
    (map) => { map.entries[0].branch = 'main' },
    (map) => { map.entries[0].expectedDisposition = 'unknown' },
    (map) => { map.entries[0].replacementPullRequests = [] },
    (map) => { map.entries[0].requiredMainPaths = ['same']; map.entries[0].forbiddenMainPaths = ['same'] },
    (map) => { map.entries[0].expectedSha = 'bad' }
  ]) {
    const map = validMap()
    mutate(map)
    assert.throws(() => validateRetirementMap(map))
  }
})

test('evaluates merged, absent, blocked, and protected branches fail-closed', () => {
  const entry = validMap().entries[0]
  const base = {
    entry,
    remoteSha: SHA,
    mergedPullRequests: new Set([82]),
    mainPaths: new Set(['src/example.ts']),
    openPrRefs: new Set(),
    protectedBranches: new Set(['main'])
  }
  const ready = evaluateRetirementEntry(base)
  assert.equal(ready.disposition, 'superseded')
  assert.equal(ready.deletable, true)
  assert.deepEqual(ready.blockers, [])

  const absent = evaluateRetirementEntry({ ...base, remoteSha: undefined })
  assert.equal(absent.disposition, 'already-absent')
  assert.equal(absent.deletable, false)

  const moved = evaluateRetirementEntry({ ...base, remoteSha: 'b'.repeat(40) })
  assert.equal(moved.disposition, 'blocked-unique')
  assert.equal(moved.deletable, false)
  assert.match(moved.blockers.join(' '), /head moved/i)

  const open = evaluateRetirementEntry({ ...base, openPrRefs: new Set(['agent/example']) })
  assert.equal(open.deletable, false)
  assert.match(open.blockers.join(' '), /open pull request/i)
})

test('summary is deletion-ready only when every present entry is deletable', () => {
  const ok = summarizeRetirementAudit([
    { branch: 'a', disposition: 'superseded', deletable: true, blockers: [] },
    { branch: 'b', disposition: 'already-absent', deletable: false, blockers: [] }
  ])
  assert.equal(ok.ready_for_deletion, true)
  assert.deepEqual(ok.blockedBranches, [])

  const blocked = summarizeRetirementAudit([
    { branch: 'a', disposition: 'blocked-unique', deletable: false, blockers: ['unique delta'] }
  ])
  assert.equal(blocked.ready_for_deletion, false)
  assert.deepEqual(blocked.blockedBranches, ['a'])
})
