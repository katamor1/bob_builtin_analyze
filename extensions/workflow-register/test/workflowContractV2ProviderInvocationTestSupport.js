'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { workflowYamlText, createBobProfile } = require('./workflowContractV2CompilerTestSupport')
const { rawPackageFromFiles, canonicalText, digestBytes } = require('./workflowContractV2LockTestSupport')
const { MemoryPackageFileSystem, installPublished } = require('./workflowContractV2PackageLoaderTestSupport')
const { privateModule, tempWorkspace } = require('./workflowContractV2RunPlanTestSupport')
const staging = () => privateModule('core/contractV2/providerAttemptStaging')
const invocation = () => privateModule('core/contractV2/providerInvocation')

async function fixtureR2(t, options = {}) {
  const workspaceRoot = tempWorkspace(t), api = require('../out/core/contractV2')
  const { WorkflowProviderRegistry, bindWorkflowProvider } = require('../out/core/contractV2/providerRegistry')
  const registry = new WorkflowProviderRegistry(), counters = { acquire: 0, dispatch: 0, generation: 0 }
  const sideEffect = options.sideEffect ?? 'none', idempotency = options.idempotency ?? 'idempotent'
  const outputKind = options.outputKind ?? 'value'
  const schemas = Object.fromEntries(['input', 'output', 'error'].map(name => [name, {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `schemas/${name}.json`,
    ...(options[`${name}Schema`] ?? { type: 'object' })
  }]))
  const evidence = name => { const bytes = Buffer.from(canonicalText(schemas[name])); return { id: schemas[name].$id, bytes: bytes.length, digest: digestBytes(bytes) } }
  const requiredCapabilities = sideEffect === 'none' ? [] : [`workflow.effect.${sideEffect}`]
  const contract = { id: 'example.provider', version: '1.2.3', inputSchema: evidence('input'),
    output: outputKind === 'unit' ? { kind: 'unit' } : { kind: 'value', schema: evidence('output') },
    errorSchema: evidence('error'), sideEffect, idempotency, requiredCapabilities,
    dispatch(input) { counters.dispatch++; counters.receiver = this; return Reflect.apply(options.dispatch ?? (() => outputKind === 'unit' ? undefined : { answer: 42 }), undefined, [input]) } }
  const registration = registry.register({ sourceId: 'r2-fixture', contract }), catalog = registry.snapshot()
  const requirement = { ...contract, version: '^1.0.0' }; delete requirement.dispatch
  const bound = bindWorkflowProvider({ catalog, requirement, location: { path: 'workflow.yaml', pointer: '/providers/0' } })
  assert.equal(bound.ok, true)
  const bob = { profile: 'bob/2.0.1', requiredCapabilities: ['task.sendMessage'], taskCapabilities: ['task.sendMessage'] }
  const artifacts = sideEffect === 'workspace-write' ? Array.from({ length: 128 }, (_, i) => ({ id: `artifact${i}`, producedBy: 'execute',
    path: `artifacts/item${i}.json`, mediaType: 'application/json', schema: 'schemas/output.json', maxBytes: i === 0 ? 4 : 67108864, owner: 'provider', required: false })) : []
  const document = { schemaVersion: 'workflow-register/v2', id: 'minimal', name: 'R2 fixture', description: 'Private invocation fixture.', inputs: [],
    steps: [{ id: 'execute', title: 'Execute', type: 'command', required: true, provider: contract.id,
      input: { source: 'literal', value: {} }, output: outputKind === 'unit' ? { kind: 'unit' } : { kind: 'value', id: 'result', schema: 'schemas/output.json', maxBytes: options.maxBytes ?? 4096 }, artifacts: artifacts.map(a => a.id) }],
    requiredArtifacts: artifacts, resumePolicy: options.resumePolicy ?? { mode: 'fail-closed', maxAttempts: 1, retainCommittedOutputs: false, allowArtifactReuse: false },
    providers: [{ ...requirement, inputSchema: 'schemas/input.json', output: outputKind === 'unit' ? { kind: 'unit' } : { kind: 'value', schema: 'schemas/output.json' }, errorSchema: 'schemas/error.json' }], bob }
  const files = { 'workflow.yaml': Buffer.from(workflowYamlText(document)), 'workflow.lock.json': Buffer.from('{}') }
  for (const [name, value] of Object.entries(schemas)) {
    if (name === 'output' && outputKind === 'unit' && artifacts.length === 0) continue
    files[`schemas/${name}.json`] = Buffer.from(JSON.stringify(value) + '\n')
  }
  const lockApi = require('../out/core/contractV2/workflowLock')
  const lock = lockApi.generateWorkflowPackageLock({ rawPackage: rawPackageFromFiles(files), providers: [bound.lockEvidence], bob })
  files['workflow.lock.json'] = lockApi.encodeWorkflowPackageLock(lock)
  const adapter = new MemoryPackageFileSystem(); installPublished(adapter, 'minimal', files)
  const collectionRoot = require('../out/core/contractV2/packageRoot').createWorkflowPackageRoot(adapter, '/collection')
  const loader = require('../out/core/contractV2/packageLoader'), planStore = new api.WorkflowPlanStore()
  const environment = api.createAuditedWorkflowCompilerEnvironment({ purpose: 'runtime', providerCatalog: catalog, bobProfile: createBobProfile() })
  const slot = Object.freeze({ collectionId: 'r2-fixture', collectionRoot: '/collection', workflowId: 'minimal' })
  const entrypoint = require('../out/workflowContractV2Entrypoint').createWorkflowContractV2Entrypoint({ environment,
    loadCurrent: () => loader.loadCurrentWorkflowPackage({ fileSystem: adapter, collectionRoot, workflowId: 'minimal' }),
    loadGeneration: async input => { counters.generation++; return loader.loadWorkflowPackageGeneration({ fileSystem: adapter, collectionRoot, workflowId: 'minimal', generation: input.generation }) },
    getOrCompile: input => planStore.getOrCompile(input), acquire: input => { counters.acquire++; return planStore.acquire(input) },
    invalidate: (collectionId, workflowId) => planStore.invalidateSlot(collectionId, workflowId) })
  const compiled = await entrypoint.compileCurrent({ slot, consumer: 'workspace-registration' })
  assert.equal(compiled.ok, true, JSON.stringify(compiled.diagnostics))
  const view = require('../out/workflowContractV2View').adaptCompiledWorkflowForProduct({ handle: compiled.handle, rawPackage: compiled.rawPackage, slot,
    root: { root: workspaceRoot, name: 'workspace', workspaceFolderName: 'workspace', marker: '.bob', depth: 0 },
    currentPointer: { fsPath: path.join(workspaceRoot, '.bob/workflows/minimal/current.json') } })
  const acquired = await entrypoint.acquireCurrent({ slot, consumer: 'run-creation' }); assert.equal(acquired.ok, true)
  const lease = acquired.lease, context = privateModule('core/contractV2/runPlanLeaseContext')
  const store = new (privateModule('workflowContractV2LeasedRunStateStore').ContractV2LeasedRunStateStore)({ workspaceRoot })
  let run
  await context.runWithWorkflowContractV2PlanLease(lease, async () => { run = await store.createRunFromPlanLease(view.coreWorkflow, lease, {}); await store.saveRun(run) })
  assert.equal(lease.released, false)
  const signal = new AbortController().signal, stepId = 'execute', attemptId = 'attempt1'
  return { workspaceRoot, run, lease, stepId, attemptId, signal, counters, registry, registration, catalog, environment, planStore,
    withScope: fn => context.runWithWorkflowContractV2PlanLease(lease, fn),
    createAttempt: (overrides = {}) => staging().createWorkflowAttemptStaging({ workspaceRoot, run, stepId, attemptId, ...overrides }),
    snapshotRunFiles() {
      const rows = []
      const visit = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
        const file = path.join(dir, entry.name)
        if (entry.isDirectory()) visit(file)
        else { assert.equal(entry.isFile(), true); const bytes = fs.readFileSync(file); rows.push({ path: path.relative(workspaceRoot, file).split(path.sep).join('/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }) }
      } }
      visit(workspaceRoot); return rows
    } }
}

function invoke(f, attempt, overrides = {}) {
  return invocation().invokeCompiledWorkflowProvider({ lease: f.lease, stepId: f.stepId, value: {}, signal: f.signal, attempt, ...overrides })
}
function requireR2() {
  assert.equal(typeof staging().createWorkflowAttemptStaging, 'function', 'R2 attempt implementation missing')
  assert.equal(typeof invocation().invokeCompiledWorkflowProvider, 'function', 'R2 invocation implementation missing')
}
function validation(result, code) {
  assert.equal(result.ok, false); assert.equal(result.failure, 'validation'); assert.equal(result.diagnostics.length, 1)
  if (code) assert.equal(result.diagnostics[0].code, code)
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.diagnostics), true)
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
module.exports = { fixtureR2, staging, invocation, privateModule, invoke, requireR2, validation, deferred }
