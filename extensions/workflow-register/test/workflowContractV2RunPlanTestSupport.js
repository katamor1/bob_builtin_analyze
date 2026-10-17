const assert = require('node:assert/strict')
const path = require('node:path')
const { workflowYamlText, createBobProfile } = require('./workflowContractV2CompilerTestSupport')
const { rawPackageFromFiles, canonicalText, digestBytes } = require('./workflowContractV2LockTestSupport')
const { MemoryPackageFileSystem, installPublished } = require('./workflowContractV2PackageLoaderTestSupport')

async function fixtureR1(workspaceRoot = '/workspace') {
  const api = require('../out/core/contractV2')
  const { WorkflowProviderRegistry, bindWorkflowProvider } = require('../out/core/contractV2/providerRegistry')
  const registry = new WorkflowProviderRegistry(), counters = { acquire: 0, dispatch: 0, generation: 0 }
  const schemas = Object.fromEntries(['input', 'output', 'error'].map(name => [name, {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'schemas/' + name + '.json', type: 'object'
  }]))
  const evidence = name => { const bytes = Buffer.from(canonicalText(schemas[name])); return { id: schemas[name].$id, bytes: bytes.length, digest: digestBytes(bytes) } }
  const contract = { id: 'example.provider', version: '1.2.3', inputSchema: evidence('input'), output: { kind: 'value', schema: evidence('output') },
    errorSchema: evidence('error'), sideEffect: 'none', idempotency: 'idempotent', requiredCapabilities: ['example.read'], dispatch() { counters.dispatch++; throw Error('R1 must never dispatch') } }
  registry.register({ sourceId: 'r1-fixture', contract }); const catalog = registry.snapshot()
  const requirement = { id: contract.id, version: '^1.0.0', inputSchema: contract.inputSchema, output: contract.output,
    errorSchema: contract.errorSchema, sideEffect: 'none', idempotency: 'idempotent', requiredCapabilities: ['example.read'] }
  const bound = bindWorkflowProvider({ catalog, requirement, location: { path: 'workflow.yaml', pointer: '/providers/0' } }); assert.equal(bound.ok, true)
  const bob = { profile: 'bob/2.0.1', requiredCapabilities: ['task.sendMessage'], taskCapabilities: ['task.sendMessage'] }
  const document = { schemaVersion: 'workflow-register/v2', id: 'minimal', name: 'R1 fixture', description: 'Private exact evidence.', inputs: [],
    steps: [{ id: 'execute', title: 'Execute', type: 'command', required: true, provider: 'example.provider', input: { source: 'literal', value: {} },
      output: { kind: 'value', id: 'result', schema: 'schemas/output.json', maxBytes: 4096 }, artifacts: [] }], requiredArtifacts: [],
    resumePolicy: { mode: 'fail-closed', maxAttempts: 1, retainCommittedOutputs: false, allowArtifactReuse: false },
    providers: [{ ...requirement, inputSchema: 'schemas/input.json', output: { kind: 'value', schema: 'schemas/output.json' }, errorSchema: 'schemas/error.json' }], bob }
  const files = { 'workflow.yaml': Buffer.from(workflowYamlText(document)), 'workflow.lock.json': Buffer.from('{}') }
  for (const [name, value] of Object.entries(schemas)) files['schemas/' + name + '.json'] = Buffer.from(JSON.stringify(value) + '\n')
  const lockApi = require('../out/core/contractV2/workflowLock')
  const lock = lockApi.generateWorkflowPackageLock({ rawPackage: rawPackageFromFiles(files), providers: [bound.lockEvidence], bob })
  files['workflow.lock.json'] = lockApi.encodeWorkflowPackageLock(lock)
  const adapter = new MemoryPackageFileSystem(), published = installPublished(adapter, 'minimal', files)
  const root = require('../out/core/contractV2/packageRoot').createWorkflowPackageRoot(adapter, '/collection')
  const loader = require('../out/core/contractV2/packageLoader'), store = new api.WorkflowPlanStore()
  const environment = api.createAuditedWorkflowCompilerEnvironment({ purpose: 'runtime', providerCatalog: catalog, bobProfile: createBobProfile() })
  const slot = Object.freeze({ collectionId: 'r1-fixture', collectionRoot: '/collection', workflowId: 'minimal' })
  const entrypoint = require('../out/workflowContractV2Entrypoint').createWorkflowContractV2Entrypoint({ environment,
    loadCurrent: () => loader.loadCurrentWorkflowPackage({ fileSystem: adapter, collectionRoot: root, workflowId: 'minimal' }),
    loadGeneration: async input => { counters.generation++; return loader.loadWorkflowPackageGeneration({ fileSystem: adapter, collectionRoot: root, workflowId: 'minimal', generation: input.generation }) },
    getOrCompile: input => store.getOrCompile(input), acquire: input => { counters.acquire++; return store.acquire(input) },
    invalidate: (collectionId, workflowId) => store.invalidateSlot(collectionId, workflowId) })
  const result = await entrypoint.compileCurrent({ slot, consumer: 'workspace-registration' }); assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  const view = require('../out/workflowContractV2View').adaptCompiledWorkflowForProduct({ handle: result.handle, rawPackage: result.rawPackage, slot,
    root: { root: workspaceRoot, name: 'workspace', workspaceFolderName: 'workspace', marker: '.bob', depth: 0 },
    currentPointer: { fsPath: path.join(workspaceRoot, '.bob/workflows/minimal/current.json') } })
  return { api, environment, entrypoint, adapter, published, slot, store, counters, files, lock, result, ...view,
    async acquire() { const acquired = await entrypoint.acquireCurrent({ slot, consumer: 'run-creation' }); assert.equal(acquired.ok, true); return acquired.lease } }
}

function provenanceFromFixture(f) {
  return { schemaVersion: 'workflow-run-plan-provenance/v1', workflowId: 'minimal', generation: f.result.rawPackage.generation,
    planDigest: f.result.handle.planDigest, packageDigest: f.lock ? f.result.handle.plan.packageDigest : '', lockfileDigest: f.result.handle.plan.lockfileDigest,
    environmentDigest: f.result.handle.plan.environmentDigest, compilerContractVersion: 'workflow-register-compiler/v2',
    providerExactBindings: structuredClone(f.lock.providers), bobProfileBinding: structuredClone(f.lock.bob) }
}
function runForProvenance(provenance) {
  return { schemaVersion: 'workflow-register/run-state/v1', runId: 'r1', workflowId: 'minimal', workflowName: 'R1',
    workflowSchemaVersion: 'workflow-register/v2', workflowDefinitionHash: provenance.planDigest, planProvenance: provenance,
    inputs: {}, state: {}, steps: [], status: 'running', createdAt: '2026-10-12', updatedAt: '2026-10-12' }
}
function privateModule(relative) {
  try { return require('../out/' + relative) } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && error.message.startsWith("Cannot find module '../out/" + relative + "'")) return {}
    throw error
  }
}
function tempWorkspace(t) {
  const fs = require('node:fs'), os = require('node:os'), base = path.resolve(os.tmpdir())
  const root = fs.mkdtempSync(path.join(base, 'r1-private-'))
  t.after(() => { privateModule('core/contractV2/runPlanLeaseContext').releaseAllWorkflowContractV2RunPlanLeases?.(); assert.equal(path.dirname(path.resolve(root)), base); fs.rmSync(root, { recursive: true, force: true }) })
  return root
}
module.exports = { fixtureR1, provenanceFromFixture, runForProvenance, privateModule, tempWorkspace }
