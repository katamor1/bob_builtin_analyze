const assert = require('node:assert/strict'), { test } = require('node:test')
const fs = require('node:fs'), path = require('node:path')
const { api, installed, manifest, errorCode } = require('./contributionTestSupport')
const validate = (m, p = installed()) => api('contributionManifest').validateContributionManifest(m, p)

test('manifest preparation detaches and freezes accepted metadata without changing its source', () => {
  const source = manifest(), before = JSON.stringify(source), result = validate(source)
  assert.notEqual(result, source); assert.equal(JSON.stringify(source), before)
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.action_providers[0]), true)
  source.owner.version = '9.0.0'; source.schemas[0].path = 'changed.json'
  assert.equal(result.owner.version, '1.2.3'); assert.equal(result.schemas[0].path, 'schemas/value.json')
})
test('an owner with no optional agent and empty contribution namespaces is accepted', () => {
  const m = manifest(); delete m.agent_provider
  for (const key of ['action_providers', 'preflight_checks', 'result_sinks', 'workflow_templates', 'schemas']) m[key] = []
  assert.equal(validate(m).owner.id, 'local.fixture')
})
for (const [name, mutate, code] of [
  ['unknown field', m => { m.unknown = 'SECRET' }, 'contribution.manifest.invalid'],
  ['missing field', m => { delete m.schemas }, 'contribution.manifest.invalid'],
  ['wrong schema version', m => { m.schema_version = 'workflow-contributions/v2' }, 'contribution.manifest.invalid'],
  ['owner mismatch', m => { m.owner.id = 'local.other' }, 'contribution.provenance.invalid'],
  ['owner version mismatch', m => { m.owner.version = '1.2.4' }, 'contribution.provenance.invalid'],
  ['version prefix', m => { m.owner.version = 'v1.2.3' }, 'contribution.manifest.invalid'],
  ['version range', m => { m.owner.version = '^1.2.3' }, 'contribution.manifest.invalid'],
  ['cross namespace identifier', m => { m.preflight_checks[0].id = 'fixture.action' }, 'contribution.manifest.invalid'],
  ['duplicate identifier', m => { m.schemas.push({ id: 'fixture.schema', path: 'other.json' }) }, 'contribution.manifest.invalid'],
  ['duplicate contract version', m => { m.preflight_checks[0].contract_version = 'fixture.action/v1' }, 'contribution.manifest.invalid'],
  ['zero contract version', m => { m.result_sinks[0].contract_version = 'fixture.sink/v0' }, 'contribution.manifest.invalid'],
  ['leading zero contract version', m => { m.result_sinks[0].contract_version = 'fixture.sink/v01' }, 'contribution.manifest.invalid'],
  ['invalid identifier', m => { m.action_providers[0].id = 'invalid/id' }, 'contribution.manifest.invalid'],
  ['path escape', m => { m.schemas[0].path = '../SECRET.json' }, 'contribution.manifest.invalid'],
  ['absolute path', m => { m.schemas[0].path = '/schemas/value.json' }, 'contribution.manifest.invalid'],
  ['backslash path', m => { m.schemas[0].path = 'schemas\\value.json' }, 'contribution.manifest.invalid'],
  ['non-NFC path', m => { m.schemas[0].path = 'schemas/e\u0301.json' }, 'contribution.manifest.invalid'],
  ['control path', m => { m.schemas[0].path = 'schemas/SECRET\0.json' }, 'contribution.manifest.invalid'],
  ['sparse array', m => { m.schemas.length = 2 }, 'contribution.manifest.invalid'],
  ['extra array property', m => { m.schemas.extra = true }, 'contribution.manifest.invalid']
]) test('manifest rejects ' + name, () => { const m = manifest(), p = installed(); mutate(m); assert.throws(() => validate(m, p), errorCode(code)) })

test('schema file paths do not collide with contribution identifiers', () => {
  const m = manifest(); m.schemas[0].path = 'fixture.action'
  assert.equal(validate(m).schemas[0].path, 'fixture.action')
})
test('exact SemVer prerelease and build owner metadata is preserved', () => {
  const m = manifest(); m.owner.version = '1.2.3-rc.1+build.9'
  assert.equal(validate(m, installed({ version: m.owner.version })).owner.version, '1.2.3-rc.1+build.9')
})
test('descriptor-only manifest preparation never invokes hostile input', () => {
  const counters = { getter: 0, proxy: 0, handler: 0 }
  const getter = manifest(); Object.defineProperty(getter.owner, 'version', { enumerable: true, get() { counters.getter++; throw Error('SECRET') } })
  const proxy = new Proxy(manifest(), { ownKeys() { counters.proxy++; throw Error('SECRET') }, getPrototypeOf() { counters.proxy++; throw Error('SECRET') } })
  for (const value of [getter, proxy]) assert.throws(() => validate(value), errorCode('contribution.manifest.invalid'))
  const p = installed(); Object.defineProperty(p, 'id', { enumerable: true, get() { counters.getter++; throw Error('SECRET') } })
  assert.throws(() => validate(manifest(), p), errorCode('contribution.provenance.invalid'))
  assert.deepEqual(counters, { getter: 0, proxy: 0, handler: 0 })
})
test('cyclic and excessive structural input is bounded', () => {
  const cyclic = manifest(); cyclic.extra = cyclic
  const deep = manifest(); let next = deep; for (let i = 0; i < 34; i++) next = next.extra = {}
  const many = manifest(); many.schemas = Array.from({ length: 20001 }, (_, i) => ({ id: 's.a' + i, path: 'value.json' }))
  const nodes = manifest(); nodes.schemas = Array.from({ length: 18000 }, (_, i) => ({ id: 's.a' + i, path: 'value.json' }))
  for (const value of [cyclic, deep, many, nodes]) assert.throws(() => validate(value), errorCode('contribution.manifest.invalid'))
})
test('UTF8 field and cumulative string budgets are enforced before publication', () => {
  const edge = manifest(); edge.schemas[0].path = 'x'.repeat(4096); assert.equal(validate(edge).schemas[0].path.length, 4096)
  const over = manifest(); over.schemas[0].path = 'x'.repeat(4097)
  const total = manifest(); total.schemas = Array.from({ length: 1200 }, (_, i) => ({ id: 's.a' + i, path: 'x'.repeat(4000) }))
  assert.throws(() => validate(over), errorCode('contribution.manifest.invalid')); assert.throws(() => validate(total), errorCode('contribution.manifest.invalid'))
})
test('registry range parsing rejects hostile, malformed and inverted closed ranges', () => {
  const { parseContributionRegistryRange } = api('contributionManifest')
  const range = { min: 'provider-registry/v1', max: 'provider-registry/v99999999999999999999999999999999999999' }
  assert.deepEqual(parseContributionRegistryRange(range), { min: 1n, max: 99999999999999999999999999999999999999n })
  for (const value of [{ min: 'provider-registry/v0', max: 'provider-registry/v1' }, { min: 'provider-registry/v01', max: 'provider-registry/v1' }, { min: 'provider-registry/v2', max: 'provider-registry/v1' }, { min: 'provider-registry/v1' }, { ...range, extra: true }, { min: 'provider-registry/v' + '1'.repeat(46), max: range.max }]) assert.throws(() => parseContributionRegistryRange(value), errorCode('provider.registry.range_malformed'))
})
test('installed contribution manifests match actual package owners and literal action inventories', async t => {
  api('contributionManifest')
  const expected = [
    ['workflow-register', ['workflowRegister.runMechanicalChecks', 'vscode.executeCommand']],
    ['bob-bazaar-review', ['bobBazaar.openReviewGui','bobBazaar.collectReviewContext','bobBazaar.loadReviewRules','bobBazaar.captureReviewResult','bobBazaar.openRuleAuthoringGui','bobBazaar.loadRuleSourceIndex','bobBazaar.captureRuleEvidenceSelection','bobBazaar.loadSelectedRuleEvidence','bobBazaar.captureRuleProposal','bobBazaar.openRuleProposalTriageGui','bobBazaar.verifyRuleAuthoringApply']],
    ['bob-code-consistency-review', ['bobCodeConsistency.initializeWorkspace','bobCodeConsistency.createReviewInput','bobCodeConsistency.prepareAiReviewInputDraft','bobCodeConsistency.applyAiReviewInputDraft','bobCodeConsistency.prepareAiTraceabilityDraft','bobCodeConsistency.captureAiTraceabilityDraft','bobCodeConsistency.applyAiTraceabilityDraft','bobCodeConsistency.openTraceabilityPrep','bobCodeConsistency.validateTraceabilityCatalog','bobCodeConsistency.createReviewInputFromTraceability','bobCodeConsistency.repairReviewInput','bobCodeConsistency.explainReviewInputDiagnostics','bobCodeConsistency.preprocess','bobCodeConsistency.captureBobOutput','bobCodeConsistency.validateOutput','bobCodeConsistency.triage']]
  ]
  const Ajv = require('ajv/dist/2020').default
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../schema/workflow-contributions.v1.schema.json')))
  const check = new Ajv({ strict: true }).compile(schema)
  for (const [name, ids] of expected) await t.test(name, () => {
    const extensionRoot = path.join(__dirname, '../../', name)
    const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json')))
    const owner = { id: pkg.publisher + '.' + pkg.name, version: pkg.version }
    const provenance = installed({ ...owner, extensionRoot })
    const file = path.join(__dirname, '../../', name, 'contracts/workflow-contributions.json')
    assert.ok(fs.existsSync(file), 'installed manifest missing: ' + name)
    const m = JSON.parse(fs.readFileSync(file)); assert.equal(check(m), true, JSON.stringify(check.errors))
    assert.deepEqual({ ...validate(m, provenance).owner }, owner)
    assert.deepEqual(m.action_providers.map(x => x.id), ids)
    assert.throws(() => validate({ ...m, owner: { ...m.owner, version: '0.0.0-drift' } }, provenance), errorCode('contribution.provenance.invalid'))
    assert.equal(check({ ...m, unexpected: true }), false)
    for (const badVersion of ['v1.2.3', '^1.2.3', '01.2.3', '1.2.3-01']) assert.equal(check({ ...m, owner: { ...m.owner, version: badVersion } }), false, 'schema accepted noncanonical owner version')
    assert.equal(check({ ...m, owner: { ...m.owner, version: '1.2.3-rc.1+build.9' } }), true)
  })
})
