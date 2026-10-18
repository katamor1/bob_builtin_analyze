'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { fixtureR2, invoke, requireR2, validation, privateModule } = require('./workflowContractV2ProviderInvocationTestSupport')

// Scenario: 'bounded preflight refuses hostile JSON without user code'
test('R2_bounded_hostile_values_and_write_sessions', () => {
  requireR2()
  const snapshot = privateModule('core/contractV2/providerEnvelopeSnapshot').snapshotBoundedWorkflowProviderEnvelope
  assert.equal(typeof snapshot, 'function')

    let traps = 0; const cycle = {}; cycle.self = cycle
    const hostile = [new Proxy({}, { ownKeys() { traps++; return [] } }), { get secret() { traps++; return 'secret' } }, new Array(1), new Date(), cycle, -0, NaN, Infinity, '\ud800', { [Symbol()]: 1 }, Object.defineProperty({}, 'hidden', { value: 1 })]
    for (const value of hostile) assert.equal(snapshot(value, 16777216), undefined)
    assert.equal(traps, 0)
  })

// Scenario: 'depth, node, array, property and canonical UTF-8 limits are exact'
test('depth, node, array, property and canonical UTF-8 limits are exact', () => {
  requireR2()
  const snapshot = privateModule('core/contractV2/providerEnvelopeSnapshot').snapshotBoundedWorkflowProviderEnvelope
  assert.equal(typeof snapshot, 'function')

    let value = null; for (let i = 0; i < 64; i++) value = [value]
    assert.notEqual(snapshot(value, 16777216), undefined); assert.equal(snapshot([value], 16777216), undefined)
    assert.notEqual(snapshot(Array(65535).fill(null), 16777216), undefined); assert.equal(snapshot(Array(65536).fill(null), 16777216), undefined); assert.equal(snapshot(Array(65537).fill(null), 16777216), undefined)
    assert.notEqual(snapshot(Object.fromEntries(Array.from({ length: 1024 }, (_, i) => ['p' + i, null])), 16777216), undefined)
    assert.equal(snapshot(Object.fromEntries(Array.from({ length: 1025 }, (_, i) => ['p' + i, null])), 16777216), undefined)
    assert.equal(snapshot('\u0000', 8), '\u0000'); assert.equal(snapshot('\u0000a', 8), undefined)
    assert.equal(snapshot('é', 4), 'é'); assert.equal(snapshot('éa', 4), undefined)
    const exact = 'a'.repeat(16777214); assert.equal(snapshot(exact, 16777216), exact); assert.equal(snapshot(exact + 'a', 16777216), undefined)
  })

// Scenario: 'invalid inputs do not dispatch and diagnostics never contain values or paths'
test('invalid inputs do not dispatch and diagnostics never contain values or paths', async t => {
  requireR2()
  const snapshot = privateModule('core/contractV2/providerEnvelopeSnapshot').snapshotBoundedWorkflowProviderEnvelope
  assert.equal(typeof snapshot, 'function')

    for (const value of [new Proxy({}, {}), { get secret() { throw Error('secret C:/private/token') } }, -0, '\ud800']) {
      const f = await fixtureR2(t)
      await f.withScope(async () => { const result = await invoke(f, f.createAttempt(), { value }); validation(result, 'WF2_PROVIDER_INPUT_INVALID'); assert.doesNotMatch(JSON.stringify(result), /secret|private|token|stack/); assert.equal(f.counters.dispatch, 0) })
    }
  })

// Scenario: 'non-native thenables are not assimilated and modified native then/catch are ignored'
test('non-native thenables are not assimilated and modified native then/catch are ignored', async t => {
  requireR2()
  const snapshot = privateModule('core/contractV2/providerEnvelopeSnapshot').snapshotBoundedWorkflowProviderEnvelope
  assert.equal(typeof snapshot, 'function')

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

// Scenario: 'byte writers reject shared, detached and proxy views without leaking staging'
test('byte writers reject shared, detached and proxy views without leaking staging', async t => {
  requireR2()
  const snapshot = privateModule('core/contractV2/providerEnvelopeSnapshot').snapshotBoundedWorkflowProviderEnvelope
  assert.equal(typeof snapshot, 'function')

    const detached = new Uint8Array([1]); structuredClone(detached.buffer, { transfer: [detached.buffer] })
    for (const bytes of [new Uint8Array(new SharedArrayBuffer(1)), detached, new Proxy(new Uint8Array([1]), {}), new DataView(new ArrayBuffer(1))]) {
      const f = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) { void effect.artifacts.writeArtifact({ id: 'artifact0', bytes }).catch(() => {}); return {} } })
      await f.withScope(async () => { validation(await invoke(f, f.createAttempt())) })
    }
  })

// Scenario: '128 writes and 64 MiB total bounds are enforced from genuine declarations'
test('128 writes and 64 MiB total bounds are enforced from genuine declarations', async t => {
  requireR2()
  const snapshot = privateModule('core/contractV2/providerEnvelopeSnapshot').snapshotBoundedWorkflowProviderEnvelope
  assert.equal(typeof snapshot, 'function')

    const f = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) { for (let i = 0; i < 128; i++) void effect.artifacts.writeArtifact({ id: 'artifact' + i, bytes: new Uint8Array() }); return {} } })
    await f.withScope(async () => { assert.equal((await invoke(f, f.createAttempt())).ok, true) })
    for (const excess of [false, true]) {
      const half = new Uint8Array(33554432)
      const g = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) { void effect.artifacts.writeArtifact({ id: 'artifact1', bytes: half }); void effect.artifacts.writeArtifact({ id: 'artifact2', bytes: half }); if (excess) void effect.artifacts.writeArtifact({ id: 'artifact3', bytes: new Uint8Array([1]) }).catch(() => {}); return {} } })
      await g.withScope(async () => { const r = await invoke(g, g.createAttempt()); if (excess) validation(r); else assert.equal(r.ok, true) })
    }
  })

test('native promise constructor and species observation never executes source behavior', async t => {
  requireR2()
  const vm = require('node:vm'), expected = { answer: 42 }
  let returned
  const f = await fixtureR2(t, { dispatch: () => returned })
  const variants = [
    'constructor-getter', 'throwing-constructor', 'species-getter', 'nonconfig-writable',
    'cross-realm', 'subclass', 'subclass-species', 'frozen-native', 'frozen-safe-constructor',
    'unsafe-immutable-constructor', 'proxy-prototype', 'frozen-proxy-prototype'
  ]
  for (const [index, kind] of variants.entries()) {
    let reads = 0, constructions = 0
    class Subclass extends Promise { constructor(executor) { super(executor); constructions++ } }
    returned = kind.startsWith('subclass') ? new Subclass(resolve => resolve(expected))
      : kind === 'cross-realm' ? vm.runInNewContext('Promise.resolve(value)', { value: expected }) : Promise.resolve(expected)
    if (kind === 'constructor-getter' || kind === 'throwing-constructor' || kind === 'unsafe-immutable-constructor') Object.defineProperty(returned, 'constructor', { configurable: kind !== 'unsafe-immutable-constructor', enumerable: true, get() { reads++; if (kind === 'throwing-constructor') throw Error('provider-owned-constructor-secret'); return Promise } })
    if (kind === 'species-getter' || kind === 'nonconfig-writable') Object.defineProperty(returned, 'constructor', { configurable: kind !== 'nonconfig-writable', writable: true, value: Object.defineProperty({}, Symbol.species, { get() { reads++; throw Error('provider-owned-species-secret') } }) })
    if (kind === 'subclass-species') Object.defineProperty(Subclass, Symbol.species, { get() { reads++; throw Error('provider-owned-subclass-species') } })
    if (kind === 'frozen-safe-constructor') Object.defineProperty(returned, 'constructor', { value: Promise, configurable: false, writable: false })
    if (kind.includes('proxy-prototype')) Object.setPrototypeOf(returned, new Proxy(Object.getPrototypeOf(returned), { get() { reads++; throw Error('provider-owned-prototype-trap') }, getOwnPropertyDescriptor() { reads++; throw Error('provider-owned-prototype-descriptor') } }))
    if (kind.startsWith('frozen')) Object.freeze(returned)
    const before = Object.getOwnPropertyDescriptor(returned, 'constructor'), prototype = Object.getPrototypeOf(returned)
    await f.withScope(async () => {
      const result = await invoke(f, f.createAttempt({ attemptId: 'promise' + index }))
      if (kind === 'unsafe-immutable-constructor' || kind === 'frozen-proxy-prototype') validation(result, 'WF2_PROVIDER_OUTPUT_INVALID')
      else { assert.equal(result.ok, true, kind); assert.equal(result.output.value.answer, 42) }
      assert.doesNotMatch(JSON.stringify(result), /provider-owned|secret/)
    })
    assert.equal(reads, 0, kind)
    if (kind.startsWith('subclass')) assert.equal(constructions, 1, 'observing a subclass must not construct another source instance')
    const after = Object.getOwnPropertyDescriptor(returned, 'constructor')
    if (before === undefined) assert.equal(after, undefined)
    else for (const key of ['value', 'get', 'set', 'writable', 'enumerable', 'configurable']) assert.strictEqual(after[key], before[key], kind + ' descriptor ' + key)
    assert.strictEqual(Object.getPrototypeOf(returned), prototype)
  }
  assert.equal(f.counters.dispatch, variants.length)
})

test('already-rejected native promises are observed safely or explicitly refused under isolated strict host policy', t => {
  const { spawnSync } = require('node:child_process'), path = require('node:path')
  const observations = []
  for (const mode of ['shadowed', 'safe-immutable', 'unsafe-immutable']) {
    const program = `
      const assert=require('node:assert/strict');
      const h=require('./test/workflowContractV2ProviderInvocationTestSupport');
      (async()=>{let reads=0;const cleanup=[];
        const f=await h.fixtureR2({after(fn){cleanup.push(fn)}},{dispatch(){
          const p=Promise.reject({reason:'isolated-provider-rejection'});
          if('${mode}'==='safe-immutable')Object.defineProperty(p,'constructor',{value:Promise,writable:false,configurable:false});
          else Object.defineProperty(p,'constructor',{configurable:'${mode}'==='shadowed',get(){reads++;return Promise}});
          return p;
        }});
        try{await f.withScope(async()=>{const result=await h.invoke(f,f.createAttempt());console.log(JSON.stringify({mode:'${mode}',reads,result,dispatches:f.counters.dispatch}));});}
        finally{for(const fn of cleanup.reverse())await fn();}
      })().catch(error=>{console.error(error.stack);process.exitCode=2});
    `
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT
    const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '-e', program], { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 1048576 })
    assert.equal(child.error, undefined)
    const observed = JSON.parse(child.stdout.trim()); assert.equal(observed.reads, 0); assert.equal(observed.dispatches, 1)
    if (mode === 'unsafe-immutable') { assert.equal(observed.result.ok, false); assert.equal(observed.result.failure, 'validation'); assert.equal(observed.result.diagnostics[0].code, 'WF2_PROVIDER_OUTPUT_INVALID'); assert.equal(child.status, 1); assert.match(child.stderr, /ERR_UNHANDLED_REJECTION/) }
    else { assert.equal(child.status, 0, child.stderr); assert.equal(observed.result.failure, 'provider-error'); assert.equal(observed.result.error.reason, 'isolated-provider-rejection'); assert.doesNotMatch(child.stderr, /UNHANDLED|must-not-read/) }
    observations.push({ mode, status: child.status, signal: child.signal, stdout: child.stdout, stderr: child.stderr })
  }
  t.diagnostic('R2_PROMISE_ISOLATED_BASE64=' + Buffer.from(JSON.stringify(observations)).toString('base64'))
})
