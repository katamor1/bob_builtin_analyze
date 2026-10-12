const assert=require('node:assert/strict')
const {test}=require('node:test')
const {fixture}=require('./workflowContractV2EntrypointTestSupport')
async function bound(f){const result=await f.entrypoint.compileCurrent({slot:f.slot,consumer:'workspace-registration'});assert.equal(result.ok,true);const view=require('../out/workflowContractV2View').adaptCompiledWorkflowForProduct({handle:result.handle,rawPackage:result.rawPackage,slot:f.slot,root:{root:'/workspace',name:'workspace',workspaceFolderName:'workspace',marker:'.bob',depth:0},currentPointer:{fsPath:'/workspace/.bob/workflows/minimal/current.json'}});return {...view,result};}
const subject=()=>require('../out/workflowContractV2ExecutionGuard')
test('current-plan verification accepts the private handle and skips legacy without compiling',async()=>{
 const f=fixture(),b=await bound(f);assert.strictEqual(await subject().verifyWorkflowContractV2CurrentPlan({workflow:b.coreWorkflow,compileCurrent:i=>f.entrypoint.compileCurrent(i)}),b.result.handle);
 assert.equal(await subject().verifyWorkflowContractV2CurrentPlan({workflow:{id:'v1'},compileCurrent:()=>{throw Error('no compile');}}),undefined);
});
test('same public digests with a new private handle and invalid current pointer reject stale views',async()=>{
 const f=fixture(),b=await bound(f);f.entrypoint.invalidateSlot(f.slot);const replacement=await f.entrypoint.compileCurrent({slot:f.slot,consumer:'validation'});assert.equal(replacement.handle.planDigest,b.result.handle.planDigest);assert.notStrictEqual(replacement.handle,b.result.handle);
 await assert.rejects(subject().verifyWorkflowContractV2CurrentPlan({workflow:b.coreWorkflow,compileCurrent:i=>f.entrypoint.compileCurrent(i)}),e=>e.name==='WorkflowContractV2BoundaryError');
 f.adapter.mutate(['minimal','current.json'],Buffer.from('{}'));
 await assert.rejects(subject().verifyWorkflowContractV2CurrentPlan({workflow:b.coreWorkflow,compileCurrent:i=>f.entrypoint.compileCurrent(i)}),e=>e.name==='WorkflowContractV2BoundaryError'&&e.diagnostics[0].code==='WF2_PACKAGE_LAYOUT_INVALID');
});
test('forged, stripped and accessor metadata fail closed without reading getters or compiling',async()=>{
 const f=fixture(),b=await bound(f);let reads=0;const accessor={id:'forged'};Object.defineProperty(accessor,'contractV2',{get(){reads++;throw Error('getter');}});
 for(const workflow of [{...b.coreWorkflow},accessor])await assert.rejects(subject().verifyWorkflowContractV2CurrentPlan({workflow,compileCurrent:()=>{throw Error('compile');}}),e=>e.name==='WorkflowContractV2BoundaryError');assert.equal(reads,0);
 require('../out/workflowContractV2View').freezeWorkflowContractV2View(b.workflow);assert.equal(Reflect.deleteProperty(b.coreWorkflow,'contractV2'),false);
});
test('isolated runtime fixture leases the exact handle and releases drifted or unpublished results',async()=>{
 const f=fixture(),b=await bound(f);const acquired=await subject().acquireWorkflowContractV2RunLease({workflow:b.coreWorkflow,acquireCurrent:i=>f.entrypoint.acquireCurrent(i)});assert.strictEqual(acquired.handle,b.result.handle);acquired.release();
 const other=fixture(),replacement=await other.entrypoint.acquireCurrent({slot:other.slot,consumer:'run-creation'});assert.equal(replacement.ok,true);assert.equal(replacement.lease.handle.planDigest,b.result.handle.planDigest);
 await assert.rejects(subject().acquireWorkflowContractV2RunLease({workflow:b.coreWorkflow,acquireCurrent:async()=>replacement}),e=>e.name==='WorkflowContractV2BoundaryError');assert.equal(replacement.lease.released,true);
 const same=await f.entrypoint.acquireCurrent({slot:f.slot,consumer:'run-creation'});await assert.rejects(subject().acquireWorkflowContractV2RunLease({workflow:b.coreWorkflow,acquireCurrent:async()=>({...same,rawPackage:{...same.rawPackage,publication:'authoring'}})}));assert.equal(same.lease.released,true);
});


test('R1_authentic_lease_rejects_before_read',async t=>{
 const f=fixture(),b=await bound(f),result=await f.entrypoint.acquireCurrent({slot:f.slot,consumer:'run-creation'});
 assert.equal(result.ok,true);const handle=result.lease.handle;t.after(()=>result.lease.release());
 let reads=0,releases=0;
 const fake={get handle(){reads++;return handle;},release(){releases++;}};
 const plain={handle,release(){releases++;}};
 const proxy=new Proxy(plain,{get(){reads++;throw Error('trap');},getOwnPropertyDescriptor(){reads++;throw Error('trap');}});
 for(const lease of [fake,plain,proxy])await assert.rejects(subject().acquireWorkflowContractV2RunLease({workflow:b.coreWorkflow,acquireCurrent:async()=>({...result,lease})}),error=>error.name==='WorkflowContractV2BoundaryError');
 assert.equal(reads,0);assert.equal(releases,0);assert.equal(result.lease.released,false);
});

test('R1_P5_owner_rejects_released_and_nonruntime_leases',async t=>{
 const {createWorkflowPlanLease,requireActiveWorkflowPlanLease}=require('../out/core/contractV2/planLease');
 for(const purpose of ['evidence','authoring-validation']){
  const f=fixture(purpose),b=await bound(f);let releases=0;
  const lease=createWorkflowPlanLease({handle:b.result.handle,onRelease(){releases++;}});t.after(()=>lease.release());
  assert.throws(()=>requireActiveWorkflowPlanLease(lease),TypeError);assert.equal(releases,0);
 }
 const f=fixture(),result=await f.entrypoint.acquireCurrent({slot:f.slot,consumer:'run-creation'});const lease=result.lease;
 assert.strictEqual(requireActiveWorkflowPlanLease(lease),lease);lease.release();assert.throws(()=>requireActiveWorkflowPlanLease(lease),TypeError);
});
