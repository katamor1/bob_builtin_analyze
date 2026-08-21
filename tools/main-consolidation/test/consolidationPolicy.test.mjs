import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import * as consolidationPolicy from '../consolidationPolicy.mjs'

const { assessTopology, flattenLegacyHeads, validateConsolidationMap } = consolidationPolicy

const map = JSON.parse(await readFile(new URL('../consolidation-map.json', import.meta.url), 'utf8'))

function cloneMap() {
  return structuredClone(map)
}

function expectedPullRequests(sourceMap = map) {
  return sourceMap.carriers.flatMap((carrier) => carrier.branches
    .filter((entry) => Number.isInteger(entry.pullRequest))
    .map((entry) => ({
      number: entry.pullRequest,
      headRefName: entry.branch,
      headRefOid: entry.expectedSha,
      baseRefName: entry.baseBranch
    })))
}

function validTopology(sourceMap = map) {
  const mainSha = 'a'.repeat(40)
  const remoteRefs = new Map(flattenLegacyHeads(sourceMap).map((entry) => [entry.branch, entry.expectedSha]))
  remoteRefs.set('main', mainSha)
  const processRefs = new Map([[sourceMap.processBranches[0], 'b'.repeat(40)]])
  remoteRefs.set(sourceMap.processBranches[0], 'b'.repeat(40))
  return {
    map: sourceMap,
    mainSha,
    baselineIsAncestor: true,
    remoteRefs,
    openPullRequests: expectedPullRequests(sourceMap),
    processRefs
  }
}

function validArchiveInventory(sourceMap = map) {
  const topology = validTopology(sourceMap)
  return {
    readyForArchive: true,
    topology: {
      readyForArchive: true,
      mainSha: topology.mainSha,
      legacyHeadCount: 30,
      processHeadCount: 1,
      openPullRequestCount: 20
    },
    remoteHeads: [
      ...flattenLegacyHeads(sourceMap).map((entry) => ({
        branch: entry.branch,
        sha: entry.expectedSha,
        owner: entry.owner
      })),
      { branch: 'main', sha: topology.mainSha, owner: 'main' },
      { branch: sourceMap.processBranches[0], sha: 'b'.repeat(40), owner: 'process' }
    ],
    openPullRequests: expectedPullRequests(sourceMap)
  }
}

test('the frozen map owns all 30 legacy remote heads exactly once', () => {
  validateConsolidationMap(map)
  const heads = flattenLegacyHeads(map)
  assert.equal(heads.length, 30)
  assert.equal(new Set(heads.map((entry) => entry.branch)).size, 30)
  assert.deepEqual(
    [...new Set(map.carriers.flatMap((carrier) => carrier.pullRequests))].sort((a, b) => a - b),
    [143, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 157, 158, 159, 160, 161, 162, 163, 164]
  )
})

test('map validation rejects duplicate legacy branches', () => {
  const invalid = cloneMap()
  invalid.checkpoints[0].branch = invalid.carriers[0].branches[0].branch
  assert.throws(() => validateConsolidationMap(invalid), /duplicate legacy branch/)
})

test('map validation rejects invalid legacy SHA', () => {
  const invalid = cloneMap()
  invalid.mergedXlsx[0].expectedSha = 'not-a-sha'
  assert.throws(() => validateConsolidationMap(invalid), /invalid SHA/)
})

test('map validation rejects a carrier count other than six', () => {
  const invalid = cloneMap()
  invalid.carriers.pop()
  assert.throws(() => validateConsolidationMap(invalid), /exactly six carriers/)
})

test('map validation rejects duplicate pull request ownership', () => {
  const invalid = cloneMap()
  invalid.carriers[1].pullRequests[0] = invalid.carriers[0].pullRequests[0]
  invalid.carriers[1].branches[0].pullRequest = invalid.carriers[0].pullRequests[0]
  assert.throws(() => validateConsolidationMap(invalid), /duplicate pull request ownership/)
})

test('map validation rejects semantic changes to the approved consolidation contract', async (t) => {
  const mutations = {
    '19 pull requests': (invalid) => {
      const removed = invalid.carriers[0].pullRequests.pop()
      delete invalid.carriers[0].branches.find((entry) => entry.pullRequest === removed).pullRequest
    },
    'legacy SHA': (invalid) => { invalid.checkpoints[0].expectedSha = 'c'.repeat(40) },
    'pull request base': (invalid) => { invalid.carriers[0].branches[0].baseBranch = 'codex/changed-base' },
    'legacy owner': (invalid) => { invalid.checkpoints[0].owner = 'changed-owner' },
    'carrier range': (invalid) => { invalid.carriers[0].fromSha = 'd'.repeat(40) }
  }
  for (const [name, mutate] of Object.entries(mutations)) {
    await t.test(name, () => {
      const invalid = cloneMap()
      mutate(invalid)
      assert.throws(() => validateConsolidationMap(invalid), /approved consolidation map contract/u)
    })
  }
})

test('topology assessment accepts the frozen observed topology', () => {
  assert.deepEqual(assessTopology(validTopology()), {
    readyForArchive: true,
    mainSha: 'a'.repeat(40),
    legacyHeadCount: 30,
    processHeadCount: 1,
    openPullRequestCount: 20
  })
})

test('topology assessment rejects an unexpected remote branch', () => {
  const topology = validTopology()
  topology.remoteRefs.set('unknown/branch', '1'.repeat(40))
  assert.throws(() => assessTopology(topology), /unexpected remote branch/)
})

test('topology assessment rejects a missing or moved legacy branch', () => {
  const missing = validTopology()
  missing.remoteRefs.delete(map.carriers[0].branches[0].branch)
  assert.throws(() => assessTopology(missing), /remote branch moved or disappeared/)

  const moved = validTopology()
  moved.remoteRefs.set(map.carriers[0].branches[0].branch, 'c'.repeat(40))
  assert.throws(() => assessTopology(moved), /remote branch moved or disappeared/)
})

test('topology assessment rejects a main that does not contain the approved baseline', () => {
  const topology = validTopology()
  topology.baselineIsAncestor = false
  assert.throws(() => assessTopology(topology), /main does not contain the approved baseline/)
})

test('topology assessment rejects a pull request head, base, or SHA mismatch', () => {
  for (const [field, value] of [
    ['headRefName', 'unexpected/branch'],
    ['headRefOid', 'd'.repeat(40)],
    ['baseRefName', 'wrong-base']
  ]) {
    const topology = validTopology()
    topology.openPullRequests[0][field] = value
    assert.throws(() => assessTopology(topology), /pull request mapping mismatch/)
  }
})

test('topology assessment rejects a process ref outside the frozen allowlist', () => {
  const topology = validTopology()
  topology.processRefs.set('codex/unapproved-process', 'e'.repeat(40))
  topology.remoteRefs.set('codex/unapproved-process', 'e'.repeat(40))
  assert.throws(() => assessTopology(topology), /unexpected process branch/)
})

test('archive inventory freezes all 20 pull request identities from the approved map', async (t) => {
  assert.equal(typeof consolidationPolicy.validateArchiveInventory, 'function')
  assert.doesNotThrow(() => consolidationPolicy.validateArchiveInventory(validArchiveInventory(), map, { baselineIsAncestor: true }))

  const mutations = {
    '19 pull requests': (inventory) => { inventory.openPullRequests.pop() },
    'changed head branch': (inventory) => { inventory.openPullRequests[0].headRefName = 'codex/changed-head' },
    'changed head SHA': (inventory) => { inventory.openPullRequests[0].headRefOid = 'f'.repeat(40) },
    'changed base branch': (inventory) => { inventory.openPullRequests[0].baseRefName = 'codex/changed-base' }
  }
  for (const [name, mutate] of Object.entries(mutations)) {
    await t.test(name, () => {
      const inventory = validArchiveInventory()
      mutate(inventory)
      assert.throws(
        () => consolidationPolicy.validateArchiveInventory(inventory, map, { baselineIsAncestor: true }),
        /open pull request.*approved map/u
      )
    })
  }
})

test('archive inventory uses the observed baseline ancestry result', () => {
  assert.throws(
    () => consolidationPolicy.validateArchiveInventory(validArchiveInventory(), map, { baselineIsAncestor: false }),
    /main does not contain the approved baseline/u
  )
})
