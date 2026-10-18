'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { fixtureR2, invoke, requireR2, staging, validation, deferred } = require('./workflowContractV2ProviderInvocationTestSupport')

// Scenario: 'unawaited writes snapshot bytes, settle and seal without filesystem promotion'
test('R2_staging_failure_and_settlement_precedence', async t => {
  requireR2()

    let writer, write; const bytes = new Uint8Array([1, 2, 3])
    const f = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) { writer = effect.artifacts; write = writer.writeArtifact({ id: 'artifact0', bytes }); bytes.fill(9); return {} } }), before = f.snapshotRunFiles()
    await f.withScope(async () => {
      const attempt = f.createAttempt(); assert.equal((await invoke(f, attempt)).ok, true); await write
      const rows = staging().readWorkflowAttemptStagedArtifacts(attempt); assert.equal(rows.length, 1); assert.deepEqual([...rows[0].bytes], [1, 2, 3]); assert.equal(Object.isFrozen(rows), true)
      rows[0].bytes.fill(8); assert.deepEqual([...staging().readWorkflowAttemptStagedArtifacts(attempt)[0].bytes], [1, 2, 3])
      await assert.rejects(writer.writeArtifact({ id: 'artifact1', bytes: new Uint8Array([7]) }))
      assert.equal(staging().readWorkflowAttemptStagedArtifacts(attempt).length, 1)
    })
    assert.deepEqual(f.snapshotRunFiles(), before)
  })

// Scenario: 'swallowed write failures beat provider success or throw and stay terminal'
test('swallowed write failures beat provider success or throw and stay terminal', async t => {
  requireR2()

    for (const kind of ['unknown', 'duplicate', 'oversize', 'accessor']) for (const throwing of [false, true]) {
      const f = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) {
        const w = effect.artifacts, bytes = new Uint8Array([1])
        if (kind === 'duplicate') void w.writeArtifact({ id: 'artifact0', bytes })
        const record = kind === 'accessor' ? { get id() { throw Error('secret getter') }, bytes } : { id: kind === 'unknown' ? 'unknown' : 'artifact0', bytes: kind === 'oversize' ? new Uint8Array(5) : bytes }
        void w.writeArtifact(record).catch(() => {})
        if (throwing) throw { reason: 'typed' }; return {}
      } }), before = f.snapshotRunFiles()
      await f.withScope(async () => { const attempt = f.createAttempt(); validation(await invoke(f, attempt)); assert.throws(() => staging().readWorkflowAttemptStagedArtifacts(attempt), TypeError); await assert.rejects(invoke(f, attempt), TypeError) })
      assert.deepEqual(f.snapshotRunFiles(), before); assert.equal(f.counters.dispatch, 1)
    }
  })

// Scenario: 'a failed retry gets a fresh isolated writer and no previous bytes'
test('a failed retry gets a fresh isolated writer and no previous bytes', async t => {
  requireR2()

    const writers = []; let count = 0
    const f = await fixtureR2(t, { sideEffect: 'workspace-write', resumePolicy: { mode: 'restart-step', maxAttempts: 2, retainCommittedOutputs: false, allowArtifactReuse: false }, dispatch({ effect }) { writers.push(effect.artifacts); if (++count === 1) { void effect.artifacts.writeArtifact({ id: 'artifact0', bytes: new Uint8Array([1]) }); throw {} } void effect.artifacts.writeArtifact({ id: 'artifact1', bytes: new Uint8Array([2]) }); return {} } })
    await f.withScope(async () => { const attempt = f.createAttempt(); assert.equal((await invoke(f, attempt)).failure, 'provider-error'); assert.equal((await invoke(f, attempt)).ok, true); assert.notStrictEqual(writers[0], writers[1]); await assert.rejects(writers[0].writeArtifact({ id: 'artifact2', bytes: new Uint8Array([3]) })); assert.deepEqual(staging().readWorkflowAttemptStagedArtifacts(attempt).map(r => r.id), ['artifact1']) })
  })

// Scenario: 'abort takes precedence over staging and typed provider failure'
test('abort takes precedence over staging and typed provider failure', async t => {
  requireR2()

    const gate = deferred(), controller = new AbortController(); let writer
    const f = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) { writer = effect.artifacts; void writer.writeArtifact({ id: 'unknown', bytes: new Uint8Array() }).catch(() => {}); return gate.promise } })
    await f.withScope(async () => { const attempt = f.createAttempt(), pending = invoke(f, attempt, { signal: controller.signal }); controller.abort(); gate.reject({ typed: true }); await assert.rejects(pending, { name: 'AbortError' }); await assert.rejects(writer.writeArtifact({ id: 'artifact0', bytes: new Uint8Array() })); assert.throws(() => staging().readWorkflowAttemptStagedArtifacts(attempt), { name: 'AbortError' }) })
  })

// Scenario: 'failed writes also consume the finite session write budget'
test('failed writes also consume the finite session write budget', async t => {
  requireR2()

    let last
    const f = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) {
      for (let i = 0; i < 128; i++) void effect.artifacts.writeArtifact({ id: 'unknown', bytes: new Uint8Array() }).catch(() => {})
      last = effect.artifacts.writeArtifact({ id: 'artifact0', bytes: new Uint8Array() }); last.catch(() => {}); return {}
    } })
    await f.withScope(async () => { validation(await invoke(f, f.createAttempt())); await assert.rejects(last) })
  })

test('writer completion waits never consult provider-modified promise properties', async t => {
  requireR2()
  let kind, invalidWrite, reads = 0, exposed, index = 0
  const f = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) {
      exposed = effect.artifacts.writeArtifact({ id: invalidWrite ? 'unknown' : 'artifact0', bytes: new Uint8Array([1]) })
      if (kind === 'constructor' || kind === 'throwing-constructor') Object.defineProperty(exposed, 'constructor', { get() { reads++; if (kind === 'throwing-constructor') throw Error('writer-constructor-secret'); return Promise } })
      if (kind === 'species') Object.defineProperty(exposed, 'constructor', { value: Object.defineProperty({}, Symbol.species, { get() { reads++; throw Error('writer-species-secret') } }) })
      if (kind === 'then-catch') for (const name of ['then', 'catch']) Object.defineProperty(exposed, name, { get() { reads++; throw Error('writer-property-secret') } })
      if (kind === 'frozen') Object.freeze(exposed)
      return {}
    } }), before = f.snapshotRunFiles()
  for (const variant of ['constructor', 'throwing-constructor', 'species', 'then-catch', 'frozen']) for (const bad of [false, true]) {
    kind = variant; invalidWrite = bad; reads = 0
    await f.withScope(async () => { const attempt = f.createAttempt({ attemptId: 'writerPromise' + index++ }), result = await invoke(f, attempt)
      if (invalidWrite) { validation(result, 'WF2_ARTIFACT_SCHEMA_INVALID'); assert.throws(() => staging().readWorkflowAttemptStagedArtifacts(attempt), TypeError) }
      else { assert.equal(result.ok, true); assert.deepEqual([...staging().readWorkflowAttemptStagedArtifacts(attempt)[0].bytes], [1]) }
      assert.doesNotMatch(JSON.stringify(result), /writer-.*secret/)
    })
    assert.equal(reads, 0, kind); assert.equal(f.counters.dispatch, index); assert.deepEqual(f.snapshotRunFiles(), before)
  }
  assert.equal(index, 10)
})

for (const rejected of [false, true]) test('native ' + (rejected ? 'rejection' : 'fulfillment') + ' seals writers before the await continuation', async t => {
  let late
  const f = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) {
    const promise = rejected ? Promise.reject({ reason: 'typed' }) : Promise.resolve({})
    queueMicrotask(() => queueMicrotask(() => { late = effect.artifacts.writeArtifact({ id: 'artifact0', bytes: new Uint8Array([1]) }); late.catch(() => {}) }))
    return promise
  } }), before = f.snapshotRunFiles()
  await f.withScope(async () => { const attempt = f.createAttempt(), result = await invoke(f, attempt); await assert.rejects(late); validation(result, 'WF2_ARTIFACT_SCHEMA_INVALID'); assert.throws(() => staging().readWorkflowAttemptStagedArtifacts(attempt), TypeError) })
  assert.equal(f.counters.dispatch, 1); assert.deepEqual(f.snapshotRunFiles(), before)
})

test('observed settlement sealing preserves abort and owner-loss precedence', async t => {
  for (const mode of ['abort', 'owner-loss']) for (const rejected of [false, true]) {
    let late
    const controller = new AbortController(), f = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) {
      const promise = rejected ? Promise.reject({ reason: 'typed' }) : Promise.resolve({})
      queueMicrotask(() => queueMicrotask(() => { if (mode === 'abort') controller.abort(); else require('./workflowContractV2ProviderInvocationTestSupport').privateModule('core/contractV2/runPlanLeaseContext').releaseWorkflowContractV2RunPlanLease(f.workspaceRoot, f.run.runId); late = effect.artifacts.writeArtifact({ id: 'artifact0', bytes: new Uint8Array([1]) }); late.catch(() => {}) }))
      return promise
    } }), before = f.snapshotRunFiles()
    await f.withScope(async () => { const attempt = f.createAttempt(); await assert.rejects(invoke(f, attempt, { signal: controller.signal }), mode === 'abort' ? { name: 'AbortError' } : TypeError); await assert.rejects(late); assert.throws(() => staging().readWorkflowAttemptStagedArtifacts(attempt), mode === 'abort' ? { name: 'AbortError' } : TypeError) })
    assert.equal(f.counters.dispatch, 1); assert.deepEqual(f.snapshotRunFiles(), before)
  }
})
