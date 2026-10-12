const assert = require('node:assert/strict')
const { test } = require('node:test')
const { fixtureR1, provenanceFromFixture, runForProvenance } = require('./workflowContractV2RunPlanTestSupport')
const { assertDeepFrozen } = require('./workflowContractV2CompilerTestSupport')
const subject = () => {
  try { return require('../out/core/contractV2/runPlanProvenance') } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && error.message.startsWith("Cannot find module '../out/core/contractV2/runPlanProvenance'")) return {}
    throw error
  }
}
const decode = value => subject().decodeWorkflowContractV2RunPlanProvenance(value)

test('R1_plan_projection_contains_no_bodies', async () => {
  const f = await fixtureR1(), input = provenanceFromFixture(f), run = runForProvenance(input)
  const projection = require('../out/core/runProvenance').projectWorkflowRunProvenance(run)
  assert.ok(projection.planProvenance, 'V2 exact evidence must be projected')
  assert.deepEqual(Object.keys(projection.planProvenance).sort(), ['bobProfileBinding', 'compilerContractVersion', 'environmentDigest', 'generation', 'lockfileDigest', 'packageDigest', 'planDigest', 'providerExactBindings', 'schemaVersion', 'workflowId'])
  const dto = decode(input); assertDeepFrozen(dto); assert.notStrictEqual(dto.providerExactBindings, input.providerExactBindings)
  assert.equal(dto.providerExactBindings[0].exactVersion, '1.2.3'); assert.deepEqual(dto.providerExactBindings[0].requiredCapabilities, ['example.read'])
  assert.deepEqual(dto.bobProfileBinding.taskCapabilities, ['task.sendMessage'])
  assert.equal(JSON.stringify(dto).includes('dispatch'), false); assert.equal(JSON.stringify(dto).includes('$schema'), false)
  input.providerExactBindings[0].exactVersion = '1.9.0'; assert.equal(dto.providerExactBindings[0].exactVersion, '1.2.3')
  const lines = require('../out/core/runProvenance').workflowRunProvenanceControlLines(projection, 1)
  assert.ok(lines.some(line => line.includes(dto.planDigest))); assert.ok(lines.some(line => line.includes('1.2.3')))
  assert.ok(lines.every(line => !/[\u0000-\u001f\u007f]/.test(line) && !line.includes('/workspace')))
  const legacy = { ...run, workflowSchemaVersion: 'legacy' }; delete legacy.planProvenance
  assert.equal(require('../out/core/runProvenance').projectWorkflowRunProvenance(legacy).planProvenance, undefined)
  assert.equal(f.counters.dispatch, 0)
})

test('R1_closed_evidence_rejects_malformed_aliased_and_executable_data', async () => {
  const f = await fixtureR1(), valid = provenanceFromFixture(f)
  assert.equal(typeof subject().decodeWorkflowContractV2RunPlanProvenance, 'function', 'R1 evidence decoder is required')
  for (const key of Object.keys(valid)) { const missing = structuredClone(valid); delete missing[key]; assert.throws(() => decode(missing), TypeError) }
  for (const key of ['generation', 'planDigest', 'packageDigest', 'lockfileDigest', 'environmentDigest']) assert.throws(() => decode({ ...valid, [key]: 'sha256:' + 'A'.repeat(64) }), TypeError)
  for (const changed of [{ ...valid, extra: true }, { ...valid, schemaVersion: 'workflow-run-plan-provenance/v2' }, { ...valid, workflowId: '../escape' }, { ...valid, compilerContractVersion: 'workflow-register-compiler/v1' }]) assert.throws(() => decode(changed), TypeError)
  for (const change of [p => { p.exactVersion = '1.0' }, p => { p.contractDigest = 'bad' }, p => { p.output.schema.bytes = 0 }, p => { p.sideEffect = 'external' }, p => { p.idempotency = 'unknown' }, p => { p.requiredCapabilities.push('aaa') }]) {
    const bad = structuredClone(valid); change(bad.providerExactBindings[0]); assert.throws(() => decode(bad), TypeError)
  }
  for (const change of [b => { b.extensionVersion = '2.0.2' }, b => { b.profileDigest = 'sha256:' + '0'.repeat(64) }, b => { b.capabilities.reverse() }, b => { b.taskCapabilities = [] }]) {
    const bad = structuredClone(valid); change(bad.bobProfileBinding); assert.throws(() => decode(bad), TypeError)
  }
  let reads = 0; const accessor = { ...valid }; Object.defineProperty(accessor, 'generation', { enumerable: true, get() { reads++; throw Error('read') } })
  assert.throws(() => decode(accessor), TypeError); assert.equal(reads, 0)
  const proxy = new Proxy(valid, { ownKeys() { reads++; throw Error('trap') }, get() { reads++; throw Error('trap') } }); assert.throws(() => decode(proxy), TypeError); assert.equal(reads, 0)
  const alias = structuredClone(valid); alias.providerExactBindings[0].errorSchema = alias.providerExactBindings[0].inputSchema; assert.throws(() => decode(alias), TypeError)
  const sparse = structuredClone(valid); sparse.providerExactBindings = Array(1); assert.throws(() => decode(sparse), TypeError)
  const many = structuredClone(valid); many.providerExactBindings = Array.from({ length: 257 }, (_, i) => ({ ...structuredClone(valid.providerExactBindings[0]), id: 'p' + String(i).padStart(3, '0') })); assert.throws(() => decode(many), TypeError)
  const proto = { ...valid }; Object.defineProperty(proto, '__proto__', { enumerable: true, value: {} }); assert.throws(() => decode(proto), TypeError)
  const symbol = { ...valid, [Symbol('hidden')]: true }; assert.throws(() => decode(symbol), TypeError)
})

test('R1_codec_validates_evidence_association_on_decode_and_write', async () => {
  const f = await fixtureR1(), provenance = provenanceFromFixture(f), run = runForProvenance(provenance)
  const codec = require('../out/core/runtime/runStateCodec')
  for (const fn of [codec.decodeWorkflowRunState, codec.prepareWorkflowRunStateForWrite]) {
    assert.equal(fn(run).run?.planProvenance?.planDigest ?? fn(run).planProvenance.planDigest, provenance.planDigest)
    for (const bad of [{ ...run, workflowId: 'different' }, { ...run, workflowDefinitionHash: 'sha256:' + '0'.repeat(64) }, { ...run, planProvenance: undefined }, { ...run, workflowSchemaVersion: 'legacy' }, { ...run, workflowSchemaVersion: 'workflow-register/v1' }]) assert.throws(() => fn(bad), /provenance/i)
  }
  const future = { ...run, schemaVersion: 'workflow-register/run-state/v2' }
  assert.equal(codec.decodeWorkflowRunState(future).readOnly, true); assert.throws(() => codec.prepareWorkflowRunStateForWrite(future), /read-only/)
  assert.equal(codec.CURRENT_WORKFLOW_RUN_STATE_SCHEMA_VERSION, 'workflow-register/run-state/v1')
})

test('R1_codec_never_reads_provenance_accessor', async () => {
  const f = await fixtureR1(), provenance = provenanceFromFixture(f)
  const codec = require('../out/core/runtime/runStateCodec')
  for (const fn of [codec.decodeWorkflowRunState, codec.prepareWorkflowRunStateForWrite]) {
    let reads = 0; const run = runForProvenance(provenance)
    Object.defineProperty(run, 'planProvenance', { enumerable: true, get() { reads++; return provenance } })
    assert.throws(() => fn(run), TypeError); assert.equal(reads, 0)
  }
})
