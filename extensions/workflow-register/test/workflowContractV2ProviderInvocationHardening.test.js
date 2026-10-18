'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { fixtureR2, invoke, requireR2, validation, privateModule } = require('./workflowContractV2ProviderInvocationTestSupport')

test('R2_bounded_hostile_values_and_write_sessions', async t => {
  requireR2()
  const snapshot = privateModule('core/contractV2/providerEnvelopeSnapshot').snapshotBoundedWorkflowProviderEnvelope
  assert.equal(typeof snapshot, 'function')
  await t.test('bounded preflight refuses hostile JSON without user code', () => {
    let traps = 0; const cycle = {}; cycle.self = cycle
    const hostile = [new Proxy({}, { ownKeys() { traps++; return [] } }), { get secret() { traps++; return 'secret' } }, new Array(1), new Date(), cycle, -0, NaN, Infinity, '\ud800', { [Symbol()]: 1 }, Object.defineProperty({}, 'hidden', { value: 1 })]
    for (const value of hostile) assert.equal(snapshot(value, 16777216), undefined)
    assert.equal(traps, 0)
  })
  await t.test('depth, node, array, property and canonical UTF-8 limits are exact', () => {
    let value = null; for (let i = 0; i < 64; i++) value = [value]
    assert.notEqual(snapshot(value, 16777216), undefined); assert.equal(snapshot([value], 16777216), undefined)
    assert.notEqual(snapshot(Array(65535).fill(null), 16777216), undefined); assert.equal(snapshot(Array(65536).fill(null), 16777216), undefined); assert.equal(snapshot(Array(65537).fill(null), 16777216), undefined)
    assert.notEqual(snapshot(Object.fromEntries(Array.from({ length: 1024 }, (_, i) => ['p' + i, null])), 16777216), undefined)
    assert.equal(snapshot(Object.fromEntries(Array.from({ length: 1025 }, (_, i) => ['p' + i, null])), 16777216), undefined)
    assert.equal(snapshot('\u0000', 8), '\u0000'); assert.equal(snapshot('\u0000a', 8), undefined)
    assert.equal(snapshot('é', 4), 'é'); assert.equal(snapshot('éa', 4), undefined)
    const exact = 'a'.repeat(16777214); assert.equal(snapshot(exact, 16777216), exact); assert.equal(snapshot(exact + 'a', 16777216), undefined)
  })
  await t.test('invalid inputs do not dispatch and diagnostics never contain values or paths', async t => {
    for (const value of [new Proxy({}, {}), { get secret() { throw Error('secret C:/private/token') } }, -0, '\ud800']) {
      const f = await fixtureR2(t)
      await f.withScope(async () => { const result = await invoke(f, f.createAttempt(), { value }); validation(result, 'WF2_PROVIDER_INPUT_INVALID'); assert.doesNotMatch(JSON.stringify(result), /secret|private|token|stack/); assert.equal(f.counters.dispatch, 0) })
    }
  })
  await t.test('non-native thenables are not assimilated and modified native then/catch are ignored', async t => {
    let reads = 0
    const f = await fixtureR2(t, { dispatch: () => ({ get then() { reads++; throw Error('must not read') } }) })
    await f.withScope(async () => { validation(await invoke(f, f.createAttempt()), 'WF2_PROVIDER_OUTPUT_INVALID') }); assert.equal(reads, 0)
    for (const rejected of [false, true]) {
      const value = { answer: 42 }, promise = rejected ? Promise.reject(value) : Promise.resolve(value)
      // Prevent the intentionally pre-rejected fixture promise from becoming an unhandled rejection.
      if (rejected) Promise.prototype.then.call(promise, undefined, () => {})
      Object.defineProperties(promise, { then: { get() { reads++; throw Error('modified then') } }, catch: { get() { reads++; throw Error('modified catch') } } })
      const g = await fixtureR2(t, { dispatch: () => promise })
      await g.withScope(async () => { const result = await invoke(g, g.createAttempt()); assert.equal(rejected ? result.failure === 'provider-error' : result.ok, true) })
    }
    assert.equal(reads, 0)
  })
  await t.test('byte writers reject shared, detached and proxy views without leaking staging', async t => {
    const detached = new Uint8Array([1]); structuredClone(detached.buffer, { transfer: [detached.buffer] })
    for (const bytes of [new Uint8Array(new SharedArrayBuffer(1)), detached, new Proxy(new Uint8Array([1]), {}), new DataView(new ArrayBuffer(1))]) {
      const f = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) { void effect.artifacts.writeArtifact({ id: 'artifact0', bytes }).catch(() => {}); return {} } })
      await f.withScope(async () => { validation(await invoke(f, f.createAttempt())) })
    }
  })
  await t.test('128 writes and 64 MiB total bounds are enforced from genuine declarations', async t => {
    const f = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) { for (let i = 0; i < 128; i++) void effect.artifacts.writeArtifact({ id: 'artifact' + i, bytes: new Uint8Array() }); return {} } })
    await f.withScope(async () => { assert.equal((await invoke(f, f.createAttempt())).ok, true) })
    for (const excess of [false, true]) {
      const half = new Uint8Array(33554432)
      const g = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) { void effect.artifacts.writeArtifact({ id: 'artifact1', bytes: half }); void effect.artifacts.writeArtifact({ id: 'artifact2', bytes: half }); if (excess) void effect.artifacts.writeArtifact({ id: 'artifact3', bytes: new Uint8Array([1]) }).catch(() => {}); return {} } })
      await g.withScope(async () => { const r = await invoke(g, g.createAttempt()); if (excess) validation(r); else assert.equal(r.ok, true) })
    }
  })
})
