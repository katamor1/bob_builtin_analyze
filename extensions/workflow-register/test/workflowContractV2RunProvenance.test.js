const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { test } = require('node:test')
const { fixtureR1, privateModule, tempWorkspace } = require('./workflowContractV2RunPlanTestSupport')
const context = () => privateModule('core/contractV2/runPlanLeaseContext')
const Store = () => privateModule('workflowContractV2LeasedRunStateStore').ContractV2LeasedRunStateStore
const snapshot = (root, runId) => { const dir = path.join(root, '.bob/workflows/runs', runId); return fs.readdirSync(dir).sort().map(file => [file, fs.readFileSync(path.join(dir, file)).toString('hex')]) }

for (const timing of ['entry', 'locked']) for (const mode of ['generation', 'strip', 'public']) {
  test('R1_review_' + mode + '_mutation_after_' + timing + '_rejects_before_durable_write', async t => {
    const support = require('./workflowContractV2RunPlanTestSupport'), c = context(), root = tempWorkspace(t), f = await fixtureR1(root)
    const isPublic = mode === 'public', lease = isPublic ? undefined : await f.acquire()
    const Cls = isPublic ? require('../out/workflowContractV2RunStateStore').ContractV2GuardedRunStateStore : Store()
    const store = new Cls({ workspaceRoot: root })
    const exercise = async () => {
      let run
      if (isPublic) {
        const compiled = require('../out/core/workflowCompiler').compileWorkflowDocument({ sourceId: 'review', filePath: '.bob/workflows/legacy/WORKFLOW.md', text: '---\nname: legacy\ndescription: Legacy.\n---\nPrompt.' })
        assert.equal(compiled.ok, true); run = await store.createRun(compiled.workflow, {})
      } else run = await store.createRunFromPlanLease(f.coreWorkflow, lease, {})
      const runId = run.runId
      let ready, release
      if (timing === 'locked') {
        let signalEntered
        ready = new Promise(resolve => { signalEntered = resolve })
        const barrier = new Promise(resolve => { release = resolve }), original = store.withRunLock.bind(store)
        let held = false
        store.withRunLock = (id, operation, options) => original(id, async () => {
          if (!held) { held = true; signalEntered(); await barrier }
          return operation()
        }, options)
      }
      const pending = store.saveRun(run)
      if (timing === 'locked') await ready
      if (mode === 'generation') run.planProvenance = { ...run.planProvenance, generation: 'sha256:' + '0'.repeat(64) }
      else if (mode === 'strip') {
        delete run.planProvenance; run.workflowSchemaVersion = 'legacy'; run.workflowId = 'workflow-register.legacy'; run.workflowFile = '.bob/workflows/legacy/WORKFLOW.md'; run.workflowDefinitionHash = 'sha256:' + '0'.repeat(64)
      } else Object.assign(run, { workflowId: 'minimal', workflowSchemaVersion: 'workflow-register/v2', planProvenance: support.provenanceFromFixture(f), workflowDefinitionHash: f.result.handle.planDigest })
      release?.()
      await assert.rejects(pending, isPublic ? error => error.name === 'WorkflowContractV2BoundaryError' : /lease|provenance|ordinary|context/i)
      for (const name of ['run.json', 'events.ndjson', 'run-state.journal.json']) assert.equal(fs.existsSync(path.join(root, '.bob/workflows/runs', runId, name)), false, name + ' must not be written')
      assert.equal(f.counters.dispatch, 0); assert.equal(f.counters.generation, 0)
    }
    if (isPublic) await exercise(); else await c.runWithWorkflowContractV2PlanLease(lease, exercise)
  })
}

test('R1_exact_provenance_and_stale_write_checks', async t => {
  const c = context(), Cls = Store(); assert.equal(typeof Cls, 'function')
  const root = tempWorkspace(t), f = await fixtureR1(root), lease = await f.acquire(), store = new Cls({ workspaceRoot: root })
  const owner = require('../out/core/runStateStore').FileRunStateStore.prototype, original = owner.createRun; let shell, allocatedInputs
  owner.createRun = async function(workflow, inputs) { shell = await original.call(this, workflow, inputs); allocatedInputs = shell.inputs; return shell }; t.after(() => { owner.createRun = original })
  const inputs = { nested: { value: 'before' } }; let run
  await c.runWithWorkflowContractV2PlanLease(lease, async () => {
    run = await store.createRunFromPlanLease(f.coreWorkflow, lease, inputs)
    assert.strictEqual(run, shell); assert.strictEqual(run.inputs, allocatedInputs); assert.notStrictEqual(run.inputs, inputs)
    inputs.nested.value = 'after'; assert.equal(run.inputs.nested.value, 'before')
    assert.equal(run.workflowSchemaVersion, 'workflow-register/v2'); assert.equal(run.planProvenance.providerExactBindings[0].exactVersion, '1.2.3')
    await store.saveRun(run); f.entrypoint.invalidateSlot(f.slot); assert.equal(lease.released, false)
    const one = await store.loadRun(run.runId), two = await store.loadRun(run.runId); assert.notStrictEqual(one, two)
    one.state.updated = 'first'; await store.saveRun(one); two.state.updated = 'stale'
    await assert.rejects(store.saveRun(two), /stale revision|changed since/)
  })
  assert.equal(f.counters.dispatch, 0); assert.equal(f.counters.generation, 0)
  await assert.rejects(store.loadRun(run.runId), /lease|context/i)
  console.log('R1_PROVENANCE_FIXTURE_BASE64=' + require('../out/core/contractV2/canonicalJson').canonicalJsonBytes(run.planProvenance).toString('base64'))
})

test('R1_same_target_creations_keep_current_owner_stale_revision', async t => {
  const c = context(), root = tempWorkspace(t), f = await fixtureR1(root), lease = await f.acquire(), store = new (Store())({ workspaceRoot: root, now: () => '2026-10-12T00:00:00.000Z' })
  await c.runWithWorkflowContractV2PlanLease(lease, async () => {
    const crypto = require('node:crypto'), uuid = crypto.randomUUID; let a, b
    try { crypto.randomUUID = () => '00112233-4455-6677-8899-aabbccddeeff'; a = await store.createRunFromPlanLease(f.coreWorkflow, lease, {}); b = await store.createRunFromPlanLease(f.coreWorkflow, lease, {}) } finally { crypto.randomUUID = uuid }
    assert.equal(a.runId, b.runId); assert.notStrictEqual(a, b); await store.saveRun(a)
    await assert.rejects(store.saveRun(b), /stale revision|changed since/)
  })
})

test('R1_first_save_failure_releases_and_unleased_journal_never_recovers', async t => {
  const c = context(), root = tempWorkspace(t), f = await fixtureR1(root), lease = await f.acquire(); let run
  const store = new (Store())({ workspaceRoot: root, durabilityFault: stage => { if (stage === 'afterJournal') throw Error('first save') } })
  await assert.rejects(c.runWithWorkflowContractV2PlanLease(lease, async () => { run = await store.createRunFromPlanLease(f.coreWorkflow, lease, {}); await store.saveRun(run) }), /first save/)
  assert.equal(lease.released, true); const before = snapshot(root, run.runId)
  await assert.rejects(new (Store())({ workspaceRoot: root }).loadRun(run.runId), /lease|context/i)
  assert.deepEqual(snapshot(root, run.runId), before); assert.equal(f.counters.generation, 0); assert.equal(f.counters.dispatch, 0)
})

test('R1_post_save_failure_removes_adoption_and_public_guard_stays_closed', async t => {
  const c = context(), root = tempWorkspace(t), f = await fixtureR1(root), lease = await f.acquire(), Base = Store(); let run
  class Failing extends Base { async saveRun(value) { await super.saveRun(value); throw Error('post save') } }
  const store = new Failing({ workspaceRoot: root })
  await assert.rejects(c.runWithWorkflowContractV2PlanLease(lease, async () => { run = await store.createRunFromPlanLease(f.coreWorkflow, lease, {}); await store.saveRun(run) }), /post save/)
  assert.equal(lease.released, true); assert.equal(c.bindAvailableWorkflowContractV2RunPlanLease(root, run), undefined)
  const guarded = new (require('../out/workflowContractV2RunStateStore').ContractV2GuardedRunStateStore)({ workspaceRoot: root })
  await assert.rejects(guarded.loadRun(run.runId), error => error.name === 'WorkflowContractV2BoundaryError')
})

test('R1_unauthenticated_core_view_rejects_before_owner_allocation', async t => {
  const c = context(), root = tempWorkspace(t), f = await fixtureR1(root), lease = await f.acquire(); let allocations = 0
  const store = new (Store())({ workspaceRoot: root, now() { allocations++; return '2026-10-12T00:00:00.000Z' } })
  await assert.rejects(c.runWithWorkflowContractV2PlanLease(lease, () => store.createRunFromPlanLease({ ...f.coreWorkflow }, lease, {})), /authentic|view/i)
  assert.equal(allocations, 0); assert.equal(lease.released, true)
})

test('R1_future_journal_is_read_only_before_recovery_with_live_lease',async t=>{
 const c=context(),root=tempWorkspace(t),f=await fixtureR1(root),lease=await f.acquire(),store=new(Store())({workspaceRoot:root});let run;
 await c.runWithWorkflowContractV2PlanLease(lease,async()=>{run=await store.createRunFromPlanLease(f.coreWorkflow,lease,{});await store.saveRun(run);});
 const eventApi=require('../out/core/runtime/runEventLog'),journalApi=require('../out/core/runtime/runStateJournal');
 const dir=path.join(root,'.bob/workflows/runs',run.runId),previousBytes=fs.readFileSync(path.join(dir,'run.json')),previous=JSON.parse(fs.readFileSync(path.join(dir,'events.ndjson'),'utf8').trim());
 const future={...run,schemaVersion:'workflow-register/run-state/v2'},previousRunHash=eventApi.hashWorkflowRunBytes(previousBytes);
 const nextEvent=eventApi.buildWorkflowRunEvent({run:future,kind:'run.updated',occurredAt:'2026-10-12T00:00:01.000Z',previousEvent:previous,previousRunHash});
 const journal=journalApi.buildWorkflowRunJournal({transactionId:'future-fixture',runId:run.runId,createdAt:nextEvent.occurredAt,previousRunHash,previousEventHash:previous.hash,nextRun:future,nextEvent});
 fs.writeFileSync(path.join(dir,'run-state.journal.json'),journalApi.serializeWorkflowRunJournal(journal));const before=snapshot(root,run.runId);
 await c.runWithWorkflowContractV2PlanLease(lease,async()=>{
  await assert.rejects(store.loadRun(run.runId));assert.deepEqual(snapshot(root,run.runId),before,'no materialized/event/journal write before future-schema refusal');
  await assert.rejects(store.saveRun(run));assert.deepEqual(snapshot(root,run.runId),before);
 });
});

for(const state of ['created','created-copy','retained','loaded'])test('R1_I1_rejects_'+state+'_shell_downgrade_before_durable_write',async t=>{
 const c=context(),root=tempWorkspace(t),f=await fixtureR1(root),lease=await f.acquire(),store=new(Store())({workspaceRoot:root});
 await c.runWithWorkflowContractV2PlanLease(lease,async()=>{
  let run=await store.createRunFromPlanLease(f.coreWorkflow,lease,{});
  if(!state.startsWith('created'))await store.saveRun(run);if(state==='loaded')run=await store.loadRun(run.runId);if(state==='created-copy')run={...run};
  const runDir=path.join(root,'.bob/workflows/runs',run.runId),before=fs.existsSync(runDir)?snapshot(root,run.runId):undefined;
  delete run.planProvenance;run.workflowSchemaVersion='legacy';run.workflowId='workflow-register.legacy';run.workflowFile='.bob/workflows/legacy/WORKFLOW.md';run.workflowDefinitionHash='sha256:'+'0'.repeat(64);
  await assert.rejects(store.saveRun(run),/lease|provenance|Contract v2|downgrade/i);
  if(before)assert.deepEqual(snapshot(root,run.runId),before);else assert.equal(fs.existsSync(runDir),false);
 });
});

test('R1_I1_private_store_keeps_normal_v1_creation_and_saves',async t=>{
 const root=tempWorkspace(t),store=new(Store())({workspaceRoot:root});
 const compiled=require('../out/core/workflowCompiler').compileWorkflowDocument({sourceId:'test',filePath:'.bob/workflows/legacy/WORKFLOW.md',text:'---\nname: legacy\ndescription: Legacy.\n---\nPrompt.'});assert.equal(compiled.ok,true);
 const run=await store.createRun(compiled.workflow,{});await store.saveRun(run);run.state.next='normal';await store.saveRun(run);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'.bob/workflows/runs',run.runId,'run.json'))).state.next,'normal');
});
