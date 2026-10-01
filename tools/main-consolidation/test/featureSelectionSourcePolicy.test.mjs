import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSourceUniverse, validateSourceUniverse, readRangeHistory, sourceItemId, digest } from '../featureSelectionSourcePolicy.mjs'
import { buildProgramIndex } from '../featureIntegrationProgramPolicy.mjs'
import { readFileSync } from 'node:fs'
const input = () => JSON.parse(readFileSync(new URL('../feature-selection-semantic-inventory.json', import.meta.url)))
const build = () => buildSourceUniverse(input())
const context = () => ({ programIndex: buildProgramIndex(), archiveIdentities: buildProgramIndex().immutableArchives })

test('binds_sorted_commit_path_and_test_manifests_individually', () => {
 const universe=JSON.parse(readFileSync(new URL('../feature-selection-source-universe.json',import.meta.url)))
 for(const tranche of universe.tranches) {
  assert.deepEqual(tranche.manifests.commitOids,tranche.history.commits.map(c=>c.sha).sort())
  assert.equal(tranche.manifestDigests.commitsSha256,digest(tranche.manifests.commitOids))
  assert.equal(tranche.manifestDigests.pathsSha256,digest(tranche.manifests.paths))
  assert.equal(tranche.manifestDigests.testsSha256,digest(tranche.manifests.tests))
 }
})

test('binds_semantic_family_to_its_owner_stage_snapshot', () => {
  const items=build().items
  const r1=items.find(item=>item.path.endsWith('/workflowRegisterService.ts')&&item.primaryOwner==='WF2-R1-PROVENANCE')
  assert.equal(r1.origins[0].commitSha,'66e005faf0046ca931c83abc41ce533488d2f581')
  const stages=['WF2-R4-EXECUTOR','WF2-R5-BOB','WF2-R6-ARCHIVED'].map(owner=>items.find(item=>item.path.endsWith('/compiledRunExecutor.ts')&&item.primaryOwner===owner).origins[0].commitSha)
  assert.equal(new Set(stages).size,3)
})
test('includes_real_vsix_engine_and_immutable_snapshot_adversarial_tests', () => {
  const items=build().items.filter(item=>item.primaryOwner==='REG-BRIDGE-DISCOVERY-EVIDENCE')
  assert.ok(items.some(item=>item.path.endsWith('/scripts/lib/vsix-contribution-payload-validator.js')))
  const tests=items.filter(item=>item.path.endsWith('/test/workflowContractGate.test.js')).flatMap(item=>item.symbols)
  for(const fragment of ['immutable Git tree snapshot','one bounded regular-file descriptor','BSD fdescfs','O_NOFOLLOW']) assert.ok(tests.some(name=>name.includes(fragment)),fragment)
})
test('does_not_promote_merge_only_pre_parser_cancellation_to_t17_deadline', () => {
  const items=build().items.filter(item=>item.path.endsWith('/documentXlsxExtractor.ts')&&item.origins.some(origin=>origin.trancheId==='processing-t17'))
  assert.ok(items.every(item=>item.primaryOwner==='PROC-T15-AGGREGATE'))
  assert.ok(items.some(item=>item.consumedBy.includes('PROC-T17-DEADLINE')))
})
test('separates_bazaar_shadow_report_observation_and_unsafe_path_presentation', () => {
 const items=JSON.parse(readFileSync(new URL('../feature-selection-source-universe.json',import.meta.url))).items
 for(const suffix of ['addedFilesContentEvidence.test.js','bazaarProcessingCommandIdentity.test.js','bazaarProcessingFailureCode.test.js']) {
  assert.ok(items.some(item=>item.path.endsWith(suffix)&&item.primaryOwner==='PROC-T18-REPORT'&&item.consumedBy.includes('PROC-T18-BZR-HANDOFF')))
 }
 assert.ok(items.some(item=>item.path.endsWith('/bazaarReviewCommands.ts')&&item.family==='archived-command-report-path-rendering'&&item.primaryOwner==='PROC-ARCHIVED-IMPLEMENTATION-REMAINDER'))
})

test('partitions_contribution_prerequisite_once', () => {
  const universe = build()
  const counts = Object.fromEntries(universe.tranches.map(row => [row.id, row.history.commits.length]))
  assert.equal(counts['contribution-prerequisite'], 25)
  assert.equal(counts['processing-t13'], 46)
  assert.equal(counts['processing-t14'], 54)
  const duplicate = structuredClone(universe)
  duplicate.tranches.find(row => row.id === 'processing-t13').history.commits.push(universe.tranches.find(row => row.id === 'contribution-prerequisite').history.commits[0])
  assert.throws(() => validateSourceUniverse(duplicate, context()))
})

test('requires_one_primary_owner_per_source_item', () => {
  const universe = build()
  validateSourceUniverse(universe, context())
  for (const mutation of [u => u.items.push(u.items[0]), u => delete u.items[0].primaryOwner, u => u.items[0].primaryOwner = ['WF2-P4-COMPILER', 'WF2-P5-PLANSTORE'], u => u.items.pop()]) {
    const changed = structuredClone(universe); mutation(changed)
    assert.throws(() => validateSourceUniverse(changed, context()))
  }
  assert.ok(universe.items.some(row => row.consumedBy.length > 0))
})

test('binds_exact_archive_history', () => {
  for (const mutation of [u => u.archiveIdentities[0].manifestSha256 = '0'.repeat(64), u => u.tranches[0].history.commits[0].sha = '0'.repeat(40), u => u.items[0].origins[0].blobSha = '0'.repeat(40), u => u.tranches[0].fromSha = 'bad', u => u.tranches[0].legacyHeads[0].originalBundleHead = '0'.repeat(40)]) {
    const changed = build(); mutation(changed)
    assert.throws(() => validateSourceUniverse(changed, context()))
  }
})

test('includes_deleted_and_merge_only_paths from all historical changes', async () => {
  const calls = []
  const sha = character => character.repeat(40)
  const git = async args => {
    calls.push(args)
    if (args[0] === 'rev-list') return `${sha('a')} ${sha('b')}\n${sha('c')} ${sha('a')} ${sha('d')}\n`
    if (args[0] === 'diff-tree') return args.includes(sha('a'))
      ? 'A\0src/vanished.ts\0A\0test/vanished.test.js\0'
      : 'D\0src/vanished.ts\0M\0src/merge-only.ts\0'
    throw new Error(`unexpected git call: ${args}`)
  }
  const history = await readRangeHistory({ fromSha: sha('b'), toSha: sha('c') }, { readGit: git })
  assert.deepEqual(history.changedPaths, ['src/merge-only.ts', 'src/vanished.ts', 'test/vanished.test.js'])
  assert.deepEqual(history.sourceTests, ['test/vanished.test.js'])
  assert.equal(history.commits.length, 2)
  assert.ok(calls.filter(args => args[0] === 'diff-tree').every(args => args.includes('--first-parent') && args.includes('--diff-merges=first-parent') && args.includes('-z')))
})

test('source item identity distinguishes semantic families within the same historical path', () => {
  const a = sourceItemId({ trancheId: 'contribution-prerequisite', path: 'src/registry.ts', family: 'owner-version-lifecycle' })
  const b = sourceItemId({ trancheId: 'contribution-prerequisite', path: 'src/registry.ts', family: 'legacy-adapter-remainder' })
  assert.notEqual(a, b)
  assert.equal(a, sourceItemId({ trancheId: 'contribution-prerequisite', path: 'src/registry.ts', family: 'owner-version-lifecycle' }))
})

test('rejects caller-provided dynamic facts and unsupported source structure', () => {
  assert.throws(() => buildSourceUniverse({ archiveIdentities: [], carrierRanges: [], historyManifests: [], semanticInventory: { mergeSha: 'a'.repeat(40) } }))
  assert.throws(() => validateSourceUniverse({ schemaVersion: 'wrong' }, { programIndex: buildProgramIndex(), archiveIdentities: [] }))
})
