'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { fixtureR2, invoke, requireR2, staging, validation, deferred } = require('./workflowContractV2ProviderInvocationTestSupport')

test('R2_staging_failure_and_settlement_precedence', async t => {
  requireR2()
  await t.test('unawaited writes snapshot bytes, settle and seal without filesystem promotion', async t => {
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
  await t.test('swallowed write failures beat provider success or throw and stay terminal', async t => {
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
  await t.test('a failed retry gets a fresh isolated writer and no previous bytes', async t => {
    const writers = []; let count = 0
    const f = await fixtureR2(t, { sideEffect: 'workspace-write', resumePolicy: { mode: 'restart-step', maxAttempts: 2, retainCommittedOutputs: false, allowArtifactReuse: false }, dispatch({ effect }) { writers.push(effect.artifacts); if (++count === 1) { void effect.artifacts.writeArtifact({ id: 'artifact0', bytes: new Uint8Array([1]) }); throw {} } void effect.artifacts.writeArtifact({ id: 'artifact1', bytes: new Uint8Array([2]) }); return {} } })
    await f.withScope(async () => { const attempt = f.createAttempt(); assert.equal((await invoke(f, attempt)).failure, 'provider-error'); assert.equal((await invoke(f, attempt)).ok, true); assert.notStrictEqual(writers[0], writers[1]); await assert.rejects(writers[0].writeArtifact({ id: 'artifact2', bytes: new Uint8Array([3]) })); assert.deepEqual(staging().readWorkflowAttemptStagedArtifacts(attempt).map(r => r.id), ['artifact1']) })
  })
  await t.test('abort takes precedence over staging and typed provider failure', async t => {
    const gate = deferred(), controller = new AbortController(); let writer
    const f = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) { writer = effect.artifacts; void writer.writeArtifact({ id: 'unknown', bytes: new Uint8Array() }).catch(() => {}); return gate.promise } })
    await f.withScope(async () => { const attempt = f.createAttempt(), pending = invoke(f, attempt, { signal: controller.signal }); controller.abort(); gate.reject({ typed: true }); await assert.rejects(pending, { name: 'AbortError' }); await assert.rejects(writer.writeArtifact({ id: 'artifact0', bytes: new Uint8Array() })); assert.throws(() => staging().readWorkflowAttemptStagedArtifacts(attempt), { name: 'AbortError' }) })
  })
  await t.test('failed writes also consume the finite session write budget', async t => {
    let last
    const f = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) {
      for (let i = 0; i < 128; i++) void effect.artifacts.writeArtifact({ id: 'unknown', bytes: new Uint8Array() }).catch(() => {})
      last = effect.artifacts.writeArtifact({ id: 'artifact0', bytes: new Uint8Array() }); last.catch(() => {}); return {}
    } })
    await f.withScope(async () => { validation(await invoke(f, f.createAttempt())); await assert.rejects(last) })
  })
})
