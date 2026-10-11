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

const p5Completion=()=>json('../../../docs/release-evidence/wf2-p5-completion-2026-10-05.json')
test('accepts_verified_p5_completion_and_admits_only_p6',()=>{
 const c=context();c.completionObservations.push(wave0bCompletion(),p4Completion(),p5Completion())
 const p=projectIntegrationStatus(c)
 assert.equal(p.acceptedMainSha,'90c678d3d33ae61a5523f2d9cf8057538028dd4b')
 assert.equal(deriveNextSlice({programIndex:c.programIndex,statusProjection:p}).sliceId,'WF2-P6-ENTRYPOINT')
 assert.equal(p.slices.find(x=>x.sliceId==='WF2-P5-PLANSTORE').state,'VERIFIED')
 for(const id of ['WF2-P6-ENTRYPOINT','WF2-P7-MANIFEST'])assert.equal(p.slices.find(x=>x.sliceId===id).state,'planned')
 assert.equal(p.boundaries.find(x=>x.id==='WORKFLOW-B-GATE-P').state,'planned')
 assert.ok(p.capabilities.every(x=>x.observedActivationStatus==='inactive'))
})
test('rejects_p5_record_evidence_tamper_and_future_p6_promotion',()=>{
 for(const mutate of [r=>r.acceptedMainSha='a'.repeat(40),r=>r.externalEvidence[0].bytes++,r=>r.ci.requiredMainWorkflows[0].jobs[0].checkoutProof.actualHeadSha='b'.repeat(40),r=>r.localOperations.remoteDeleteVerified=false,r=>r.mutationAuthority=true,r=>r.productRuntimeActivation='active']){
 const r=p5Completion();mutate(r);assert.throws(()=>validateCompletionObservation(r,{programIndex:buildProgramIndex(),evidenceDigests:digests(r)}))
 }
 const r=p5Completion(),e=digests(r);e[r.externalEvidence[0].id].bytes++;assert.throws(()=>validateCompletionObservation(r,{programIndex:buildProgramIndex(),evidenceDigests:e}))
 const c=context();c.completionObservations.push(wave0bCompletion(),p4Completion(),r)
 const p=projectIntegrationStatus(c);p.slices.find(x=>x.sliceId==='WF2-P6-ENTRYPOINT').state='VERIFIED'
 assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:p}))
})
test('keeps_p5_canonical_bytes_after_autocrlf_checkout',async t=>{
 const {mkdtempSync,rmSync}=await import('node:fs')
 const {tmpdir}=await import('node:os')
 const {join,resolve,sep,basename}=await import('node:path')
 const {execFileSync}=await import('node:child_process')
 const {runGenerator}=await import('../create-feature-integration-status.mjs')
 const root=fileURLToPath(new URL('../../../',import.meta.url))
 const temp=mkdtempSync(join(tmpdir(),'p5-canonical-checkout-'))
 t.after(()=>{
  assert.equal(resolve(temp).startsWith(resolve(tmpdir())+sep),true)
  assert.equal(basename(temp).startsWith('p5-canonical-checkout-'),true)
  rmSync(temp,{recursive:true,force:true})
 })
 const relative='docs/release-evidence/wf2-p5-completion-2026-10-05.json'
 execFileSync('git',['-c','core.autocrlf=true','checkout-index','--prefix='+temp.replaceAll('\\','/')+'/', '--',relative],{cwd:root,windowsHide:true})
 const checkedOut=readFileSync(join(temp,relative))
 const committed=execFileSync('git',['show',':'+relative],{cwd:root,windowsHide:true})
 assert.equal(checkedOut.equals(committed),true,'fresh core.autocrlf=true checkout must retain exact canonical P5 bytes')
 await runGenerator(['--check'],{
  readFile:async path=>path.endsWith('wf2-p5-completion-2026-10-05.json')?checkedOut:readFileSync(path),
  writeStdout:()=>assert.fail('check mode must not write output')
 })
})

const p6Completion=()=>json('../../../docs/release-evidence/wf2-p6-completion-2026-10-08.json')
const throughP6=()=>({ ...context(),completionObservations:[completion(),wave0bCompletion(),p4Completion(),p5Completion(),p6Completion()] })

test('accepts_verified_p6_completion_and_admits_only_p7',()=>{
 const record=p6Completion()
 validateCompletionObservation(record,{programIndex:buildProgramIndex(),evidenceDigests:digests(record)})
 const c=throughP6(),p=projectIntegrationStatus(c)
 assert.equal(p.acceptedMainSha,'c5f9fcff29a787cc4f02140800556257bf05c547')
 assert.equal(p.slices.find(x=>x.sliceId==='WF2-P6-ENTRYPOINT').state,'VERIFIED')
 assert.equal(p.slices.find(x=>x.sliceId==='WF2-P7-MANIFEST').state,'planned')
 assert.equal(p.nextSliceId,'WF2-P7-MANIFEST')
 assert.equal(deriveNextSlice({programIndex:c.programIndex,statusProjection:p}).sliceId,'WF2-P7-MANIFEST')
 assert.equal(p.boundaries.find(x=>x.id==='WORKFLOW-B-GATE-P').state,'planned')
 assert.ok(p.capabilities.every(x=>x.observedActivationStatus==='inactive'))
 assert.deepEqual(p.activeSliceIds,[])
 assert.equal(p.automaticCleanup,false);assert.equal(p.mutationAuthority,false)
 assert.equal(record.productRuntimeActivation,'inactive')
 assert.equal(record.observedMaxActivation,'shadow')
})

test('rejects_p6_evidence_tamper_and_future_p7_promotion',()=>{
 const programIndex=buildProgramIndex()
 validateCompletionObservation(p6Completion(),{programIndex,evidenceDigests:digests(p6Completion())})
 const mutations=[
  r=>r.acceptedMainSha='a'.repeat(40),r=>r.sourceHeadSha='b'.repeat(40),r=>r.acceptedTreeSha='c'.repeat(40),
  r=>r.ci.requiredMainWorkflows[0].jobs[0].checkoutProof.actualHeadSha='d'.repeat(40),
  r=>r.ci.requiredMainWorkflows[0].jobs[0].checkoutProof.dispatchNonce='e'.repeat(32),
  r=>r.installedUat.summary.failedCases=1,r=>r.installedUat.cases[0].status='not_run',
  r=>r.preservation.allPayloadHashesVerified=false,r=>r.preservation.allSupplementHashesVerified=false,
  r=>r.localOperations.nativeRecoverySha='f'.repeat(40),r=>r.localOperations.localRefDeleteVerified=false,
  r=>r.localOperations.remoteDeleteVerified=false,r=>r.topology.worktreeCount=2,
  r=>r.externalEvidence[0].bytes++,r=>r.externalEvidence[0].sha256='0'.repeat(64),
  r=>r.productRuntimeActivation='active',r=>r.observedMaxActivation='active',r=>r.mutationAuthority=true,
  ...['requestHash','approvalRecord','providerTranscript','claim','futureRecoveryHead'].map(k=>r=>r[k]='forged')
 ]
 for(const mutate of mutations){const record=p6Completion();mutate(record);assert.throws(()=>validateCompletionObservation(record,{programIndex,evidenceDigests:digests(record)}))}
 const record=p6Completion(),evidenceDigests=digests(record)
 evidenceDigests[record.externalEvidence[0].id].bytes++
 assert.throws(()=>validateCompletionObservation(record,{programIndex,evidenceDigests}))
 const c=throughP6(),original=projectIntegrationStatus(c)
 for(const mutate of [p=>p.slices.find(x=>x.sliceId==='WF2-P7-MANIFEST').state='VERIFIED',p=>p.completionReferences[4].boundaryId='WF2-P7-MANIFEST',p=>p.capabilities.find(x=>x.id==='WF2-P6-ENTRYPOINT').observedActivationStatus='active',p=>p.mutationAuthority=true]){
  const p=structuredClone(original);mutate(p);assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:p}))
 }
})

test('rejects_p6_nonprefix_duplicate_and_sparse_completions',()=>{
 const records=throughP6().completionObservations
 projectIntegrationStatus({...context(),completionObservations:records})
 const missing=Array(5);records.slice(0,3).forEach((r,i)=>{missing[i]=r});missing[4]=p6Completion()
 for(const collection of [[p6Completion()],records.slice(0,3).concat(p6Completion()),records.concat(p6Completion()),[...records.slice(0,3),p6Completion(),p5Completion()],missing]){
  assert.throws(()=>projectIntegrationStatus({...context(),completionObservations:collection}))
 }
})

test('generator_includes_p6_and_rejects_completion_byte_drift',async()=>{
 const {runGenerator}=await import('../create-feature-integration-status.mjs')
 let output,reads=0
 await runGenerator(['--print'],{readFile:async path=>{if(path.endsWith('wf2-p6-completion-2026-10-08.json'))reads++;return readFileSync(path)},writeStdout:bytes=>{output=JSON.parse(bytes.toString())}})
 assert.equal(reads,1,'generator must consume the new canonical completion')
 assert.equal(output.slices.find(x=>x.sliceId==='WF2-P6-ENTRYPOINT').state,'VERIFIED')
 assert.equal(output.completionReferences[4].boundaryId,'WF2-P6-ENTRYPOINT')
 await assert.rejects(()=>runGenerator(['--print'],{readFile:async path=>path.endsWith('wf2-p6-completion-2026-10-08.json')?Buffer.concat([readFileSync(path),Buffer.from('\n')]):readFileSync(path),writeStdout:()=>assert.fail('tampered completion must never produce output')}))
})

test('keeps_p6_canonical_bytes_after_autocrlf_checkout',async t=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join,resolve,sep,basename}=await import('node:path'),{execFileSync}=await import('node:child_process'),{runGenerator}=await import('../create-feature-integration-status.mjs')
 const root=fileURLToPath(new URL('../../../',import.meta.url)),temp=mkdtempSync(join(tmpdir(),'p6-canonical-checkout-'))
 t.after(()=>{assert.equal(resolve(temp).startsWith(resolve(tmpdir())+sep),true);assert.equal(basename(temp).startsWith('p6-canonical-checkout-'),true);rmSync(temp,{recursive:true,force:true})})
 const relative='docs/release-evidence/wf2-p6-completion-2026-10-08.json'
 execFileSync('git',['-c','core.autocrlf=true','checkout-index','--prefix='+temp.replaceAll('\\','/')+'/','--',relative],{cwd:root,windowsHide:true})
 const checkedOut=readFileSync(join(temp,relative)),indexed=execFileSync('git',['show',':'+relative],{cwd:root,windowsHide:true})
 assert.equal(checkedOut.equals(indexed),true,'fresh core.autocrlf=true checkout must retain exact canonical P6 bytes')
 await runGenerator(['--check'],{readFile:async path=>path.endsWith('wf2-p6-completion-2026-10-08.json')?checkedOut:readFileSync(path),writeStdout:()=>assert.fail('check mode must not write output')})
})

// Closed immutable observations test projection consistency. Independent live
// filesystem rehash is performed by the C4 evidence verifier before pinning.
const p7Completion=()=>json('../../../docs/release-evidence/wf2-p7-completion-2026-10-11.json')
const gatePCompletion=()=>json('../../../docs/release-evidence/wf2-gate-p-completion-2026-10-11.json')
const throughP7=()=>({...throughP6(),completionObservations:[...throughP6().completionObservations,p7Completion()]})
const throughGateP=()=>({...throughP7(),completionObservations:[...throughP7().completionObservations,gatePCompletion()]})

test('accepts_p7_without_promoting_gate_p_or_admitting_c',()=>{
 const record=p7Completion(),programIndex=buildProgramIndex()
 validateCompletionObservation(record,{programIndex,evidenceDigests:digests(record)})
 const c=throughP7(),p=projectIntegrationStatus(c)
 assert.equal(p.acceptedMainSha,'36c80d9b71b5c3825a9dfcb21ed666e94c54f303')
 assert.equal(record.acceptedTreeSha,'889e25722d0398021359d62d928045fda1d7853f')
 assert.equal(record.installedUat.summary.passedCases,6);assert.equal(record.installedUat.summary.failedCases,0)
 assert.equal(p.slices.find(r=>r.sliceId==='WF2-P7-MANIFEST').state,'VERIFIED')
 assert.equal(p.capabilities.find(r=>r.id==='WF2-P7-MANIFEST').executionState,'VERIFIED')
 assert.equal(p.boundaries.find(r=>r.id==='WORKFLOW-B-GATE-P').state,'planned')
 assert.equal(p.nextSliceId,'GATE-R-ARCHIVE-INVENTORY')
 assert.equal(deriveNextSlice({programIndex,statusProjection:p}),null)
 assert.deepEqual(p.activeSliceIds,[]);assert.equal(p.automaticCleanup,false);assert.equal(p.mutationAuthority,false)
 assert.ok(p.slices.every(r=>r.observedActivationStatus==='inactive'))
})

test('accepts_gate_p_boundary_observation_and_derives_only_existing_gate_r',()=>{
 const record=gatePCompletion(),programIndex=buildProgramIndex()
 validateCompletionObservation(record,{programIndex,evidenceDigests:digests(record)})
 assert.equal(record.classification,'repository_non_mutating_boundary_completion_observation')
 assert.equal(record.boundaryId,'WORKFLOW-B-GATE-P');assert.equal(record.afterSlice,'WF2-P7-MANIFEST')
 assert.equal(Object.hasOwn(record,'sliceId'),false)
 assert.equal(record.p7CompletionSha256,digest(p7Completion()))
 assert.deepEqual(record.completionGates,['P1_P7_EXACT_MAIN','GATE-WF2-P'])
 const c=throughGateP(),p=projectIntegrationStatus(c),next=deriveNextSlice({programIndex,statusProjection:p})
 assert.equal(p.boundaries.find(r=>r.id==='WORKFLOW-B-GATE-P').state,'VERIFIED')
 assert.deepEqual(next,programIndex.programAtomicSlices[5]);assert.equal(next.sliceId,'GATE-R-ARCHIVE-INVENTORY')
 assert.ok(!p.slices.some(r=>r.sliceId==='GATE-WF2-P'))
 assert.equal(p.boundaries.find(r=>r.id==='WORKFLOW-C-SAFE-PREFIX').state,'planned')
 for(const id of ['GATE-R-ARCHIVE-INVENTORY','WF2-R1-PROVENANCE','WF2-R2-INVOKE'])assert.equal(p.slices.find(r=>r.sliceId===id).state,'planned')
 assert.ok(p.capabilities.every(r=>r.observedActivationStatus==='inactive'))
 assert.deepEqual(p.activeSliceIds,[]);assert.equal(p.automaticCleanup,false);assert.equal(p.mutationAuthority,false)
 next.sliceId='caller mutation';assert.equal(deriveNextSlice({programIndex,statusProjection:p}).sliceId,'GATE-R-ARCHIVE-INVENTORY')
})

test('rejects_p7_gate_p_missing_reversed_duplicate_and_sparse_prefixes',()=>{
 const records=throughGateP().completionObservations,sparse=records.slice();delete sparse[5]
 const missingGate=records.slice();delete missingGate[6]
 for(const collection of [[gatePCompletion()],records.slice(0,5).concat(gatePCompletion()),[...records.slice(0,5),gatePCompletion(),p7Completion()],records.concat(gatePCompletion()),throughP7().completionObservations.concat(p7Completion()),sparse,missingGate]){
  assert.throws(()=>projectIntegrationStatus({...context(),completionObservations:collection}))
 }
})

test('rejects_p7_gate_p_record_identity_evidence_uat_preservation_and_authority_tamper',()=>{
 const programIndex=buildProgramIndex()
 const mutations=[
  r=>r.acceptedMainSha='a'.repeat(40),r=>r.acceptedTreeSha='b'.repeat(40),r=>r.sourceHeadSha='c'.repeat(40),
  r=>r.ci.requiredMainWorkflows[0].jobs[0].checkoutProof.actualHeadSha='d'.repeat(40),
  r=>r.ci.requiredMainWorkflows[0].jobs[0].checkoutProof.dispatchNonce='e'.repeat(32),
  r=>r.ci.crossHostManifest.inputSha256='f'.repeat(64),r=>r.ci.crossHostManifest.sha256='0'.repeat(64),
  r=>r.installedUat.summary.failedCases=1,r=>r.installedUat.cases[0].status='not_run',
  r=>r.installedUat.limits.bobExtensionRemainedInactive=false,
  r=>r.preservation.allPayloadHashesVerified=false,r=>r.preservation.cleanupPerformed=true,
  r=>r.topology.mainOnlyClaimed=true,r=>r.externalEvidence[0].bytes++,r=>r.externalEvidence[0].sha256='0'.repeat(64),
  r=>r.productRuntimeActivation='active',r=>r.observedMaxActivation='active',r=>r.activeSliceIds.push('WF2-P7-MANIFEST'),
  r=>r.automaticCleanup=true,r=>r.mutationAuthority=true
 ]
 for(const make of [p7Completion,gatePCompletion]){
  const original=make()
  for(const mutate of mutations){const record=structuredClone(original);mutate(record);assert.throws(()=>validateCompletionObservation(record,{programIndex,evidenceDigests:digests(record)}))}
  for(const kind of ['bytes','sha256']){const actual=digests(original);if(kind==='bytes')actual[original.externalEvidence[0].id].bytes++;else actual[original.externalEvidence[0].id].sha256='0'.repeat(64);assert.throws(()=>validateCompletionObservation(original,{programIndex,evidenceDigests:actual}))}
 }
 const gate=gatePCompletion();gate.p7CompletionSha256='1'.repeat(64);assert.throws(()=>validateCompletionObservation(gate,{programIndex,evidenceDigests:digests(gate)}))
})

test('rejects_gate_p_as_authority_or_premature_c_r1_r2_promotion',()=>{
 const c=throughGateP(),original=projectIntegrationStatus(c),programIndex=c.programIndex
 for(const mutate of [p=>p.boundaries.find(r=>r.id==='WORKFLOW-C-SAFE-PREFIX').state='VERIFIED',...['GATE-R-ARCHIVE-INVENTORY','WF2-R1-PROVENANCE','WF2-R2-INVOKE'].map(id=>p=>p.slices.find(r=>r.sliceId===id).state='VERIFIED'),p=>p.completionReferences[6].boundaryId='WORKFLOW-C-SAFE-PREFIX',p=>p.mutationAuthority=true,p=>p.activeSliceIds.push('GATE-R-ARCHIVE-INVENTORY'),p=>p.automaticCleanup=true]){
  const changed=structuredClone(original);mutate(changed);assert.throws(()=>deriveNextSlice({programIndex,statusProjection:changed}))
 }
})

test('generator_consumes_p7_gate_p_and_rejects_both_input_byte_drifts',async()=>{
 const {runGenerator}=await import('../create-feature-integration-status.mjs')
 const names=['wf2-p7-completion-2026-10-11.json','wf2-gate-p-completion-2026-10-11.json'],reads=new Map(names.map(n=>[n,0]));let output
 await runGenerator(['--print'],{readFile:async path=>{for(const n of names)if(path.endsWith(n))reads.set(n,reads.get(n)+1);return readFileSync(path)},writeStdout:bytes=>{output=JSON.parse(bytes)}})
 for(const count of reads.values())assert.equal(count,1)
 assert.equal(output.slices.find(r=>r.sliceId==='WF2-P7-MANIFEST').state,'VERIFIED')
 assert.equal(output.boundaries.find(r=>r.id==='WORKFLOW-B-GATE-P').state,'VERIFIED')
 for(const name of names)await assert.rejects(()=>runGenerator(['--print'],{readFile:async path=>path.endsWith(name)?Buffer.concat([readFileSync(path),Buffer.from('\r\n')]):readFileSync(path),writeStdout:()=>assert.fail('byte drift must never emit projection')}))
})

test('keeps_p7_gate_p_exact_lf_bytes_after_autocrlf_index_checkout',async t=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join,resolve,sep,basename}=await import('node:path'),{execFileSync}=await import('node:child_process'),{runGenerator}=await import('../create-feature-integration-status.mjs')
 const root=fileURLToPath(new URL('../../../',import.meta.url)),temp=mkdtempSync(join(tmpdir(),'p7-gate-canonical-'))
 t.after(()=>{assert.equal(resolve(temp).startsWith(resolve(tmpdir())+sep),true);assert.equal(basename(temp).startsWith('p7-gate-canonical-'),true);rmSync(temp,{recursive:true,force:true})})
 const checkout=new Map()
 for(const name of ['wf2-p7-completion-2026-10-11.json','wf2-gate-p-completion-2026-10-11.json']){
  const relative='docs/release-evidence/'+name
  execFileSync('git',['-c','core.autocrlf=true','checkout-index','--prefix='+temp.replaceAll('\\','/')+'/','--',relative],{cwd:root,windowsHide:true})
  const bytes=readFileSync(join(temp,relative)),indexed=execFileSync('git',['show',':'+relative],{cwd:root,windowsHide:true,maxBuffer:4*1024*1024})
  assert.ok(bytes.equals(indexed));assert.equal(bytes.at(-1),10);assert.equal(bytes.includes(13),false);checkout.set(name,bytes)
 }
 await runGenerator(['--check'],{readFile:async path=>{for(const [name,bytes]of checkout)if(path.endsWith(name))return bytes;return readFileSync(path)},writeStdout:()=>assert.fail('check mode must not emit')})
})

// Gate R is one composite migration slice; four tooling capabilities do not
// create four new catalog mutation rows or authorize runtime execution.
const gateRCompletion=()=>json('../../../docs/release-evidence/wf2-gate-r-completion-2026-10-12.json');
const throughGateR=()=>({...throughGateP(),completionObservations:[...throughGateP().completionObservations,gateRCompletion()]});
const gateROwnedIds=['GATE-R-ARCHIVE-INVENTORY','GATE-R-ACTIVE-MANIFEST','GATE-R-VALIDATOR','GATE-R-RUNNER'];
test('accepts_exact_gate_r_composite_record_with_all_four_scopes',()=>{
 const r=gateRCompletion();validateCompletionObservation(r,{programIndex:buildProgramIndex(),evidenceDigests:digests(r)});
 assert.equal(r.acceptedMainSha,'e11b217651b790308d823b689b000c7f7c048a8d');assert.equal(r.productRuntimeActivation,'inactive');
 assert.deepEqual(r.composite.ownedScope,gateROwnedIds);assert.equal(r.composite.scopes.length,4);
 assert.ok(r.composite.scopes.every(s=>s.state==='COMPLETE'));assert.equal(r.activeRuntime.bootstrap.runtimeSuiteState,'NOT_RUN_EMPTY');
});
test('one_verified_gate_r_slice_promotes_only_its_four_tooling_capabilities',()=>{
 const c=throughGateR(),p=projectIntegrationStatus(c);assert.equal(p.slices.length,20);assert.equal(p.completionReferences.length,8);
 assert.equal(p.slices.find(r=>r.sliceId==='GATE-R-ARCHIVE-INVENTORY').state,'VERIFIED');
 for(const id of gateROwnedIds)assert.equal(p.capabilities.find(r=>r.id===id).executionState,'VERIFIED');
 for(const id of ['WF2-R1-PROVENANCE','WF2-R2-INVOKE','WF2-R3-ARTIFACT-TX','WF2-R4-EXECUTOR','WF2-R5-BOB','WF2-R6-ARCHIVED'])assert.notEqual(p.capabilities.find(r=>r.id===id).executionState,'VERIFIED');
 assert.equal(p.boundaries.find(r=>r.id==='WORKFLOW-B-GATE-P').state,'VERIFIED');
 assert.equal(p.boundaries.find(r=>r.id==='WORKFLOW-C-SAFE-PREFIX').state,'planned');
 assert.equal(deriveNextSlice({programIndex:c.programIndex,statusProjection:p}).sliceId,'WF2-R1-PROVENANCE');
 assert.deepEqual(p.activeSliceIds,[]);assert.equal(p.automaticCleanup,false);assert.equal(p.mutationAuthority,false);
 assert.ok(p.capabilities.every(r=>r.observedActivationStatus==='inactive'));
});
test('gate_r_absent_prefix_keeps_all_four_facets_planned',()=>{
 const c=throughGateP(),p=projectIntegrationStatus(c);for(const id of gateROwnedIds)assert.equal(p.capabilities.find(r=>r.id===id).executionState,'planned');
 assert.equal(deriveNextSlice({programIndex:c.programIndex,statusProjection:p}).sliceId,'GATE-R-ARCHIVE-INVENTORY');
});
for(const [name,mutate]of [
 ['missing owned facet',r=>r.composite.ownedScope.pop()],
 ['duplicate owned facet',r=>r.composite.ownedScope.push(r.composite.ownedScope[0])],
 ['R1 owned facet expansion',r=>r.composite.ownedScope.push('WF2-R1-PROVENANCE')],
 ['missing completed facet',r=>r.composite.scopes.pop()],
 ['partial completed facet',r=>r.composite.scopes[3].state='PARTIAL'],
 ['conditional completed facet replacement',r=>r.composite.scopes[3].id='WF2-R3-ARTIFACT-TX'],
 ['unknown composite key',r=>r.composite.promoteAll=true]
])test('closed_gate_r_composite_rejects_'+name,()=>{const r=gateRCompletion();mutate(r);assert.throws(()=>validateCompletionObservation(r,{programIndex:buildProgramIndex(),evidenceDigests:digests(r)}),/composite/);});
test('rejects_gate_r_nonprefix_and_duplicate_completions',()=>{
 const r=gateRCompletion(),full=throughGateR();for(const list of [[r],[...throughP7().completionObservations,r],[...full.completionObservations,r]])assert.throws(()=>projectIntegrationStatus({...context(),completionObservations:list}));
});
test('rejects_gate_r_evidence_authority_and_empty_runtime_falsepass_tamper',()=>{
 const original=gateRCompletion();for(const mutate of [r=>r.externalEvidence[0].bytes++,r=>r.externalEvidence[0].sha256='0'.repeat(64),r=>r.mutationAuthority=true,r=>r.activeRuntime.capabilities.push('WF2-R1-PROVENANCE'),r=>r.activeRuntime.bootstrap.runtimeSuiteState='PASSED',r=>r.acceptedMainSha='a'.repeat(40)]){const r=structuredClone(original);mutate(r);assert.throws(()=>validateCompletionObservation(r,{programIndex:buildProgramIndex(),evidenceDigests:digests(r)}))}
 const actual=digests(original);actual[original.externalEvidence[0].id].bytes++;assert.throws(()=>validateCompletionObservation(original,{programIndex:buildProgramIndex(),evidenceDigests:actual}));
});
test('rejects_premature_runtime_and_unregistered_generic_scope_projection',()=>{
 const c=throughGateR(),original=projectIntegrationStatus(c);for(const id of ['WF2-R1-PROVENANCE','WF2-R2-INVOKE','WF2-R3-ARTIFACT-TX','WF2-R6-ARCHIVED']){const p=structuredClone(original);p.capabilities.find(r=>r.id===id).executionState='VERIFIED';assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:p}));}
 const p=structuredClone(original);p.completionReferences[7].boundaryId='GATE-R-RUNNER';assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:p}));
});
