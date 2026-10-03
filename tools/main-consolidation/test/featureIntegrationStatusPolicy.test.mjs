import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {validateCompletionObservation, projectIntegrationStatus, deriveNextSlice, validateWorkspaceDisposition} from '../featureIntegrationStatusPolicy.mjs'
import {buildProgramIndex} from '../featureIntegrationProgramPolicy.mjs'
import {digest} from '../featureSelectionSourcePolicy.mjs'
const json=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)))
const completion=()=>json('../../../docs/release-evidence/wave0a-completion-2026-10-01.json')
const wave0bCompletion=()=>json('../../../docs/release-evidence/wave0b-completion-2026-10-03.json')
const p4Completion=()=>json('../../../docs/release-evidence/wf2-p4-completion-2026-10-04.json')
const context=()=>({programIndex:buildProgramIndex(),ledger:json('../../../docs/release-evidence/feature-selection-ledger-2026-08-23.json'),completionObservations:[completion()]})
const digests=record=>Object.fromEntries(record.externalEvidence.map(row=>[row.id,{bytes:row.bytes,sha256:row.sha256}]))
test('replays_verified_wave0a_and_planned_slices',()=>{
 const c=context(); const p=projectIntegrationStatus(c)
 assert.equal(p.acceptedMainSha,'ec136225bf2737a2f2c8053dce69d3acb6f4be3d')
 assert.equal(p.boundaries[0].state,'VERIFIED');assert.equal(p.slices.length,20)
 assert.ok(p.slices.every(s=>s.state==='planned'&&s.observedActivationStatus==='inactive'))
 assert.ok(p.capabilities.filter(c=>c.disposition==='conditional').every(c=>c.observedActivationStatus==='inactive'))
 assert.deepEqual(deriveNextSlice({programIndex:c.programIndex,statusProjection:p}),c.programIndex.programAtomicSlices[0])
 assert.equal(p.mutationAuthority,false)
})

test('replays_verified_wave0b_and_admits_p4_only',()=>{
 const c=context();c.completionObservations.push(wave0bCompletion())
 const p=projectIntegrationStatus(c)
 assert.equal(p.acceptedMainSha,'b8876b2714d74bd8bbe686b66d17f2f76467f041')
 assert.deepEqual(p.boundaries.filter(row=>row.state==='VERIFIED').map(row=>row.id),['WAVE-0A-CONTROL-PLANE','WAVE-0B-SELECTION-LEDGER'])
 assert.deepEqual(p.slices.filter(row=>row.state==='VERIFIED').map(row=>row.sliceId),['WAVE-0B-SELECTION-LEDGER'])
 assert.equal(p.slices.length,20);assert.equal(p.slices.filter(row=>row.state==='planned').length,19)
 assert.ok(p.slices.every(row=>row.observedActivationStatus==='inactive'))
 assert.equal(p.capabilities.find(row=>row.id==='WAVE-0B-SELECTION-LEDGER').executionState,'VERIFIED')
 assert.ok(p.capabilities.filter(row=>row.id!=='WAVE-0B-SELECTION-LEDGER').every(row=>row.executionState!=='VERIFIED'&&row.observedActivationStatus==='inactive'))
 const next=deriveNextSlice({programIndex:c.programIndex,statusProjection:p})
 assert.equal(next.sliceId,'WF2-P4-COMPILER');assert.equal(next.ordinal,2)
 assert.equal(p.nextSliceId,'WF2-P4-COMPILER');assert.equal(p.automaticCleanup,false);assert.equal(p.mutationAuthority,false)
 assert.deepEqual(p.activeSliceIds,[])
 p.completionReferences[1].acceptedMainSha='a'.repeat(40)
 next.sliceId='caller-mutation'
 assert.equal(deriveNextSlice({programIndex:c.programIndex,statusProjection:projectIntegrationStatus(c)}).sliceId,'WF2-P4-COMPILER')
})

test('rejects_nonprefix_or_duplicate_completions',()=>{
 for(const records of [[wave0bCompletion()],[wave0bCompletion(),completion()],[completion(),completion()],[completion(),wave0bCompletion(),wave0bCompletion()]]) {
  assert.throws(()=>projectIntegrationStatus({...context(),completionObservations:records}))
 }
})

test('rejects_sparse_completion_collections',()=>{
 const holeBeforeWave0b=Array(2);holeBeforeWave0b[1]=wave0bCompletion()
 for(const records of [Array(1),holeBeforeWave0b]) {
  assert.throws(()=>projectIntegrationStatus({...context(),completionObservations:records}))
 }
})

test('rejects_wave0b_evidence_tamper_and_future_promotion',()=>{
 for(const mutate of [r=>r.acceptedMainSha='a'.repeat(40),r=>r.ci[0].workflows[0].jobs[0].checkout.actualHeadSha='b'.repeat(40),r=>r.externalEvidence[0].sha256='0'.repeat(64),r=>r.topology.worktreeCount=2,r=>r.requestHash='historical']) {
  const record=wave0bCompletion();mutate(record)
  assert.throws(()=>validateCompletionObservation(record,{programIndex:buildProgramIndex(),evidenceDigests:digests(record)}))
 }
 const record=wave0bCompletion();const evidenceDigests=digests(record)
 evidenceDigests[record.externalEvidence[0].id].bytes++
 assert.throws(()=>validateCompletionObservation(record,{programIndex:buildProgramIndex(),evidenceDigests}))
 const c=context();c.completionObservations.push(wave0bCompletion())
 const p=projectIntegrationStatus(c);p.slices[1].state='VERIFIED'
 assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:p}))
 const forgedReference=projectIntegrationStatus(c)
 forgedReference.completionReferences[1].boundaryId='WORKFLOW-B-GATE-P'
 assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:forgedReference}))
})
test('rejects_forged_terminal_or_stale_main',()=>{
 for(const mutate of [r=>r.acceptedMainSha='a'.repeat(40),r=>r.ci[0].workflows[0].jobs[0].checkout.actualHeadSha='b'.repeat(40),r=>r.externalEvidence[0].sha256='0'.repeat(64)]) {
  const record=completion();mutate(record);assert.throws(()=>validateCompletionObservation(record,{programIndex:buildProgramIndex(),evidenceDigests:digests(record)}))
 }
 const record=completion();const evidenceDigests=digests(record);evidenceDigests[record.externalEvidence[0].id].sha256='0'.repeat(64)
 assert.throws(()=>validateCompletionObservation(record,{programIndex:buildProgramIndex(),evidenceDigests}))
 const c=context();const p=projectIntegrationStatus(c)
 p.slices[0].state='VERIFIED';assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:p}))
 assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:projectIntegrationStatus(c),sliceDescriptor:c.programIndex.programAtomicSlices[1]}))
})
test('keeps_gate_p_observational',()=>{
 const c=context();const p=projectIntegrationStatus(c)
 assert.deepEqual(p.gateP,c.programIndex.downstreamProtocolPolicy.gateP)
 assert.ok(!p.slices.some(row=>row.sliceId==='GATE-WF2-P'))
 const gate={...c.programIndex.programAtomicSlices[4],sliceId:'GATE-WF2-P'}
 assert.throws(()=>validateWorkspaceDisposition({...workspaceFixture(),sliceDescriptor:gate}))
})
test('rejects_legacy_authorization_import',()=>{
 for(const key of ['requestHash','claim','capture','approvalRecord','providerTranscript']) {
  const c=context();c.completionObservations[0][key]='historical';assert.throws(()=>projectIntegrationStatus(c))
 }
 assert.throws(()=>projectIntegrationStatus({...context(),completionObservations:[{state:'VERIFIED',boundaryId:'WAVE-0A-CONTROL-PLANE'}]}))
})
test('without_verified_predecessor_admission_is_null',()=>{
 const c=context();c.completionObservations=[]
 assert.equal(deriveNextSlice({programIndex:c.programIndex,statusProjection:projectIntegrationStatus(c)}),null)
})
test('read_only_generators_reject_input_byte_drift_and_arbitrary_output_flags',async()=>{
 const cases=[
  ['../create-feature-selection-source-universe.mjs','../feature-selection-semantic-inventory.json'],
  ['../create-feature-selection-ledger.mjs','../../../docs/release-evidence/feature-selection-ledger-2026-08-23.json'],
  ['../create-feature-integration-status.mjs','../../../docs/release-evidence/wave0a-completion-2026-10-01.json'],
  ['../create-feature-integration-status.mjs','../../../docs/release-evidence/wave0b-completion-2026-10-03.json'],
  ['../create-feature-integration-status.mjs','../../../docs/release-evidence/wf2-p4-completion-2026-10-04.json']
 ]
 for(const [modulePath,inputPath] of cases) {
  const {runGenerator}=await import(modulePath);const driftPath=fileURLToPath(new URL(inputPath,import.meta.url))
  const readInput=async path=>path===driftPath?Buffer.concat([readFileSync(path),Buffer.from(' ')]):readFileSync(path)
  let emitted=false
  await assert.rejects(()=>runGenerator(['--print'],{readFile:readInput,writeStdout:()=>{emitted=true}}))
  assert.equal(emitted,false)
  let reads=0
  await assert.rejects(()=>runGenerator(['--print','--output','outside'],{readFile:()=>{reads++;return Buffer.from('{}')},writeStdout:()=>{emitted=true}}))
  assert.equal(reads,0)
  assert.equal(emitted,false)
 }
})
// Synthetic observations test contract consistency only; no cleanup or approval
// is executed and these fixtures cannot enter the pinned status projection.
function workspaceFixture() {
 const sliceDescriptor=buildProgramIndex().programAtomicSlices[0]
 const workspace={path:'C:/test-owned/worktree',branchRef:'refs/heads/codex/test-slice'}
 const terminalObservation={schemaVersion:'bob-builtin-analyze/slice-terminal-observation/v1',classification:'repository_non_mutating_slice_terminal_completion_observation',mutationAuthority:false,sliceId:sliceDescriptor.sliceId,state:'VERIFIED',sourceHeadSha:'a'.repeat(40),acceptedMainSha:'b'.repeat(40),workspace,evidenceSha256:'c'.repeat(64)}
 const preservationObservation={schemaVersion:'PROGRAM-SLICE-WORKSPACE-DISPOSITION-V1',sliceId:sliceDescriptor.sliceId,workspace,terminalObservationSha256:digest(terminalObservation),activeSliceIds:[],disposition:'retain_same_workspace'}
 return {sliceDescriptor,terminalObservation,preservationObservation,decision:'retain_same_workspace'}
}
test('requires_complete_workspace_disposition',()=>{
 const retained=workspaceFixture();validateWorkspaceDisposition(retained)
 retained.preservationObservation.activeSliceIds.push('WF2-P4-COMPILER');assert.throws(()=>validateWorkspaceDisposition(retained))
 const disposed=workspaceFixture();disposed.decision='dispose_to_main_only'
 Object.assign(disposed.preservationObservation,{disposition:'dispose_to_main_only',preservation:{externalRoot:'C:/test-owned/preserved',manifestSha256:'d'.repeat(64),verifiedManifestSha256:'d'.repeat(64),fileCount:1,allHashesVerified:true},operations:['preserve_external','remove_exact_worktree','delete_exact_local_ref','verify_main_only'],worktreeRemoved:{path:disposed.terminalObservation.workspace.path,expectedHeadSha:'a'.repeat(40),present:false},localRefDeleted:{ref:disposed.terminalObservation.workspace.branchRef,expectedHeadSha:'a'.repeat(40),present:false},mainOnlyTopology:{mainSha:'b'.repeat(40),localBranches:['main'],worktreeCount:1,remoteBranches:['main'],openPrCount:0,retainedExceptions:{userData:['preserved-user-file'],nativeAppMetadataRefs:['refs/codex/snapshots/test'],existingStash:['refs/stash']}}})
 validateWorkspaceDisposition(disposed)
 for(const workspacePath of ['C:/test-owned/worktree/./child','C:/test-owned/worktree//child','C:/test-owned/worktree/child.','C:/test-owned/worktree/child ']) {
  const alias=structuredClone(disposed)
  alias.terminalObservation.workspace.path=workspacePath
  alias.preservationObservation.terminalObservationSha256=digest(alias.terminalObservation)
  alias.preservationObservation.worktreeRemoved.path=workspacePath
  alias.preservationObservation.preservation.externalRoot='C:/test-owned/worktree/child/inside'
  assert.throws(()=>validateWorkspaceDisposition(alias))
 }
 for(const mutation of [p=>p.operations.splice(1,1),p=>p.operations.reverse(),p=>p.localRefDeleted.expectedHeadSha='e'.repeat(40),p=>p.preservation.verifiedManifestSha256='f'.repeat(64),p=>p.mainOnlyTopology.worktreeCount=2,p=>p.preservation.externalRoot='C:/test-owned/worktree/inside']) {
  const changed=structuredClone(disposed);mutation(changed.preservationObservation);assert.throws(()=>validateWorkspaceDisposition(changed))
 }
})


test('replays_verified_p4_and_admits_p5_without_completing_gate_p',()=>{
 const c=context();c.completionObservations.push(wave0bCompletion(),p4Completion())
 const p=projectIntegrationStatus(c)
 assert.equal(p.acceptedMainSha,'925c50f10e114ac5613135dab7b7439ab3dba0de')
 assert.deepEqual(p.slices.filter(x=>x.state==='VERIFIED').map(x=>x.sliceId),['WAVE-0B-SELECTION-LEDGER','WF2-P4-COMPILER'])
 assert.equal(p.capabilities.find(x=>x.id==='WF2-P4-COMPILER').executionState,'VERIFIED')
 assert.equal(p.boundaries.find(x=>x.id==='WORKFLOW-B-GATE-P').state,'planned')
 assert.equal(p.slices.filter(x=>x.state==='planned').length,18)
 assert.ok(p.slices.every(x=>x.observedActivationStatus==='inactive'))
 assert.ok(p.capabilities.filter(x=>x.id!=='WAVE-0B-SELECTION-LEDGER'&&x.id!=='WF2-P4-COMPILER').every(x=>x.executionState!=='VERIFIED'&&x.observedActivationStatus==='inactive'))
 assert.deepEqual(p.activeSliceIds,[]);assert.equal(p.mutationAuthority,false);assert.equal(p.automaticCleanup,false)
 assert.equal(p.nextSliceId,'WF2-P5-PLANSTORE')
 const next=deriveNextSlice({programIndex:c.programIndex,statusProjection:p})
 assert.deepEqual(next,c.programIndex.programAtomicSlices[2])
 next.sliceId='caller-mutation'
 p.completionReferences[2].acceptedMainSha='a'.repeat(40)
 assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:p}))
 assert.equal(deriveNextSlice({programIndex:c.programIndex,statusProjection:projectIntegrationStatus(c)}).sliceId,'WF2-P5-PLANSTORE')
})

test('rejects_p4_nonprefix_duplicate_and_sparse_completions',()=>{
 const missingA=Array(3);missingA[1]=wave0bCompletion();missingA[2]=p4Completion()
 const missingB=Array(3);missingB[0]=completion();missingB[2]=p4Completion()
 const missingP4=Array(3);missingP4[0]=completion();missingP4[1]=wave0bCompletion()
 for(const records of [[p4Completion()],[completion(),p4Completion()],[wave0bCompletion(),p4Completion()],[completion(),p4Completion(),wave0bCompletion()],[completion(),wave0bCompletion(),p4Completion(),p4Completion()],[completion(),wave0bCompletion(),wave0bCompletion()],missingA,missingB,missingP4]) {
  assert.throws(()=>projectIntegrationStatus({...context(),completionObservations:records}))
 }
})

test('rejects_p4_evidence_tamper_and_future_completion_authority',()=>{
 const mutations=[r=>r.acceptedMainSha='a'.repeat(40),r=>r.sourceHeadSha='b'.repeat(40),r=>r.repositoryEvidence[0].commitSha='a'.repeat(40),r=>r.repositoryEvidence[1].blobOid='b'.repeat(40),r=>r.acceptedTreeSha='c'.repeat(40),r=>r.ci[0].workflows[0].jobs[0].checkout.actualHeadSha='d'.repeat(40),r=>r.ci[1].workflows[0].jobs[0].checkout.dispatchNonce='e'.repeat(32),r=>r.externalEvidence[0].sha256='0'.repeat(64),r=>r.preservation.allTargetHashesVerified=false,r=>r.localOperations.nativeRecoverySha='f'.repeat(40),r=>r.topology.worktreeCount=2,r=>r.boundaryId='WORKFLOW-B-GATE-P',r=>r.sliceId='WF2-P5-PLANSTORE',r=>r.productRuntimeActivation='active',...['requestHash','approvalRecord','providerTranscript','claim','futureRecoveryHead'].map(key=>r=>r[key]='forged')]
 for(const mutate of mutations){const record=p4Completion();mutate(record);assert.throws(()=>validateCompletionObservation(record,{programIndex:buildProgramIndex(),evidenceDigests:digests(record)}))}
 const record=p4Completion(),evidenceDigests=digests(record);evidenceDigests[record.externalEvidence[0].id].bytes++
 assert.throws(()=>validateCompletionObservation(record,{programIndex:buildProgramIndex(),evidenceDigests}))
 const c=context();c.completionObservations.push(wave0bCompletion(),p4Completion())
 for(const mutate of [p=>p.slices[2].state='VERIFIED',p=>p.boundaries.find(x=>x.id==='WORKFLOW-B-GATE-P').state='VERIFIED',p=>p.completionReferences[2].boundaryId='WF2-P5-PLANSTORE',p=>p.capabilities.find(x=>x.id==='WF2-P4-COMPILER').observedActivationStatus='active']) {
  const p=projectIntegrationStatus(c);mutate(p);assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:p}))
 }
})

test('keeps_p4_canonical_bytes_after_autocrlf_checkout',async t=>{
 const {mkdtempSync,rmSync}=await import('node:fs')
 const {tmpdir}=await import('node:os')
 const {join,resolve,sep,basename}=await import('node:path')
 const {execFileSync}=await import('node:child_process')
 const {runGenerator}=await import('../create-feature-integration-status.mjs')
 const root=fileURLToPath(new URL('../../../',import.meta.url))
 const temp=mkdtempSync(join(tmpdir(),'p4-canonical-checkout-'))
 t.after(()=>{
  assert.equal(resolve(temp).startsWith(resolve(tmpdir())+sep),true)
  assert.equal(basename(temp).startsWith('p4-canonical-checkout-'),true)
  rmSync(temp,{recursive:true,force:true})
 })
 const relative='docs/release-evidence/wf2-p4-completion-2026-10-04.json'
 execFileSync('git',['-c','core.autocrlf=true','checkout-index','--prefix='+temp.replaceAll('\\','/')+'/', '--',relative],{cwd:root,windowsHide:true})
 const checkedOut=readFileSync(join(temp,relative))
 const committed=execFileSync('git',['show','HEAD:'+relative],{cwd:root,windowsHide:true})
 assert.equal(checkedOut.equals(committed),true,'fresh core.autocrlf=true checkout must retain exact canonical P4 bytes')
 await runGenerator(['--check'],{
  readFile:async path=>path.endsWith('wf2-p4-completion-2026-10-04.json')?checkedOut:readFileSync(path),
  writeStdout:()=>assert.fail('check mode must not write output')
 })
})
