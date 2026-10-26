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

// R1 is one historical single-ID source-main observation. Private test suites
// confer no public product activation or generic capability ownership.
const r1Completion=()=>json('../../../docs/release-evidence/wf2-r1-completion-2026-10-17.json')
const r1Expected={"acceptedMainSha":"bd3347814284daadebefaa0ab6ab2187690ff348","acceptedTreeSha":"09a2c59f46f4ca03769be1dddf17a6b96af86ae3","sourceHeadSha":"fa15b85e07deff3b71fcdbebab7991bb398076db","mergeParents":["5fc1cd30c39102b946f9300a0d77afd306eaaa03","fa15b85e07deff3b71fcdbebab7991bb398076db"],"pullRequestNumber":190,"observedAt":"2026-10-17T13:57:34.764Z","recordSha256":"e1583bebaea4bcc2909bfd0db320cc6c633d136176d767c0958802db22eaf5fd","evidenceSha256":"22d29779b8cfa73466206495014e89dbd4e4657453bfda96d1b6e8cb4c630583"}
const throughR1=()=>({...throughGateR(),completionObservations:[...throughGateR().completionObservations,r1Completion()]})
const r1HashTamper=value=>(value[0]==='0'?'1':'0')+value.slice(1)
test('accepts_exact_r1_single_id_source_main_observation',()=>{
 const r=r1Completion(),programIndex=buildProgramIndex()
 validateCompletionObservation(r,{programIndex,evidenceDigests:digests(r)})
 assert.equal(r.schemaVersion,'bob-builtin-analyze/feature-integration-completion-observation/v1')
 assert.equal(r.classification,'repository_non_mutating_completion_recovery_observation')
 assert.equal(r.repository,'katamor1/bob_builtin_analyze');assert.equal(r.boundaryId,'WF2-R1-PROVENANCE');assert.equal(r.sliceId,r.boundaryId)
 assert.equal(r.state,'VERIFIED');assert.equal(Object.hasOwn(r,'composite'),false)
 assert.equal(r.acceptedMainSha,r1Expected.acceptedMainSha);assert.equal(r.acceptedTreeSha,r1Expected.acceptedTreeSha)
 assert.equal(r.sourceHeadSha,r1Expected.sourceHeadSha);assert.deepEqual(r.mergeParents,r1Expected.mergeParents)
 assert.equal(r.pullRequestNumber,r1Expected.pullRequestNumber);assert.equal(r.observedAt,r1Expected.observedAt)
 assert.equal(digest(r),r1Expected.recordSha256);assert.equal(digest(digests(r)),r1Expected.evidenceSha256)
 assert.equal(r.ci.candidate.head,r.sourceHeadSha);assert.equal(r.ci.actualMain.head,r.acceptedMainSha)
 assert.equal(r.acceptanceBasis,'local_verification_with_explicit_user_ci_waiver')
 assert.equal(r.ci.mode,'explicit_user_ci_waiver');assert.equal(r.ci.allRequiredGatesSucceeded,false);assert.equal(r.ci.noRerunOrRedispatch,false)
 assert.equal(r.ci.authorization.userInstruction,'現状では解決できないので一旦CIは成功として次に進む')
 assert.equal(r.ci.authorization.sourceHead,r.sourceHeadSha);assert.equal(r.ci.authorization.sourceTree,r.acceptedTreeSha)
 assert.equal(r.ci.authorizationReceipt.sha256,'52d80f6223bc61ab16980b837943140c84cf5bed6239e2af0d375b9bd5a5cb2f')
 for(const key of ['candidateRawHeads','actualMainRawHeads','manualNonceProofsEachPhase'])assert.equal(Object.hasOwn(r.ci,key),false)
 assert.equal(r.ci.hostedRawHeadProofs,'not_collected');assert.equal(r.ci.hostedNonceProofs,'not_collected');assert.equal(r.ci.hostedCrossHostEquality,'not_verified')
 for(const ci of [r.ci.candidate,r.ci.actualMain]){assert.equal(ci.allRequiredGatesSucceeded,false);assert.equal(ci.manual.state,'not_run');assert.equal(ci.manual.workflowsDispatched,0);assert.ok(ci.automatic.every(run=>run.conclusion==='failure'));assert.ok(ci.automatic.flatMap(run=>run.jobs).every(job=>job.conclusion==='skipped'?job.name==='Extension source metrics'&&job.runner_id===null&&job.steps.length===0:job.conclusion==='failure'&&job.runner_id===0&&job.steps.length===0))}
 assert.equal(r.localValidation.fullRegression.concurrency,'DEFAULT');assert.equal(r.localValidation.fullRegression.files,203)
 assert.deepEqual(r.localValidation.fullRegression.counts,{tests:2131,pass:2130,fail:0,cancelled:0,skipped:1,todo:0})
 assert.equal(r.localValidation.gates.checks.length,16)
 const g=r.activeRuntime.gateRResult
 assert.equal(g.schemaVersion,'workflow-gate-r-result/v2');assert.equal(g.state,'ACTIVE_TEST_SUITES_PASSED');assert.equal(g.runtimeSuiteState,'PASSED')
 assert.deepEqual(g.activeCapabilityIds,['WF2-R1-PROVENANCE']);assert.equal(g.runtimeSuitesExecuted,8);assert.equal(g.archiveTestsExecuted,0)
 assert.equal(g.runtimeActivation,false);assert.equal(g.counterScope,'contract_v2_product_paths')
 assert.equal(r.activeRuntime.productWiring.counterScope,'contract_v2_product_paths')
 for(const key of ['providerDispatches','bobDispatches','v2ProductLeaseAcquisitions','v2ProductRunDirectoryCreations','v2ProductArtifactStages']){
  assert.equal(g[key],0);assert.equal(r.activeRuntime.productWiring[key],0)
 }
 assert.equal(r.activeRuntime.productWiringBytes.bytes,324);assert.equal(r.activeRuntime.productWiringBytes.sha256,'d6afaad73eebe27e1fa6664f8f2e6f51155882dff2fa4ccf769aa230f56f1fbf')
 const p=r.packages.workflowRegister
 assert.equal(p.frozen.bytes,1199583);assert.equal(p.frozen.sha256,'1267b5d9bbf012631890f0eb4a9762660dc9eedce991e2adcb12782b84885717')
 assert.equal(p.installed.sha256,'d1ee7ce15ba5fa6dc7def1ff7eaa0a0f0571f412cd32d9e9861b1924c7e32d79')
 assert.equal(p.payloadEntries,899);assert.equal(p.allPayloadsByteEqual,true);assert.deepEqual(p.changedPayloads,[]);assert.equal(p.rawZipEqualityClaimed,false)
 const u=r.installedUat,ids=Array.from({length:12},(_,i)=>'R1-UAT-'+String(i+1).padStart(2,'0'))
 assert.equal(u.state,'ALL_REQUIRED_INSTALLED_UAT_GATES_PASSED');assert.deepEqual(u.requiredCaseIds,ids);assert.deepEqual(u.requiredCases.map(row=>row.id),ids)
 assert.ok(u.requiredCases.every(row=>row.status==='pass'));assert.equal(u.actualNewHostRun,false);assert.equal(u.binding.actualNewHostRun,false)
 assert.deepEqual(u.binding.executedSubject,u.acceptance.subject);assert.equal(u.currentSourceMainAccepted,true)
 assert.ok(u.requiredCases.slice(2,6).every(row=>row.evidenceKind==='actual-installed-private-module-fixture'))
 assert.ok(u.requiredCases.slice(6).every(row=>row.evidenceKind==='actual-installed-save-boundary-race'))
 assert.equal(u.provenance.bytes,1771);assert.equal(u.provenance.sha256,'d56746dfd8741be09decadf86a8cfffefca33bbce750d8b4a4b308368988a9b2')
 assert.equal(u.p7ManifestReference.bytes,693);assert.equal(u.p7ManifestReference.sha256,'e2dd7b63d64b8392d0c1b4441fb31c4c35445ee1a7aaa4ed98b9bd335b194a90')
 assert.match(u.p7ManifestReference.referenceKind,/expected bytes proven equal to actual installed codec Buffer/)
 assert.deepEqual(r.review.originalWholeReviewAdmission.originalCounts,{Critical:0,Important:2,Minor:1})
 assert.deepEqual(r.review.originalWholeReviewAdmission.remainingCounts,{Critical:0,Important:0,Minor:1})
 assert.deepEqual(r.review.originalWholeReviewAdmission.closedFindings,['I1','I2'])
 assert.equal(r.review.sourceAdmission.scopedCritical,0);assert.equal(r.review.sourceAdmission.scopedImportant,0);assert.equal(r.review.sourceAdmission.scopedMinor,0)
 assert.equal(r.review.sourceAdmission.unchangedSecondWholeReview,false);assert.match(r.review.deferredMinor,/M1/)
 assert.equal(r.preservation.allHashesVerified,true);assert.equal(r.preservation.cleanupPerformed,false);assert.equal(r.preservation.copyMode,'exclusive')
 assert.equal(r.externalEvidence.length,r.preservation.files+1);assert.equal(new Set(r.externalEvidence.map(e=>e.id)).size,r.externalEvidence.length)
 assert.equal(r.externalEvidence.filter(e=>e.id==='r1:preservation-manifest').length,1)
 assert.equal(r.runtimeActivation,false);assert.equal(r.productRuntimeActivation,'inactive');assert.equal(r.observedMaxActivation,'inactive')
 assert.deepEqual(r.activeSliceIds,[]);assert.equal(r.automaticCleanup,false);assert.equal(r.mutationAuthority,false);assert.equal(r.finalProgramUat,'not_run')
})

test('one_verified_r1_slice_admits_only_existing_r2',()=>{
 const c=throughR1(),p=projectIntegrationStatus(c),prefix=projectIntegrationStatus(throughGateR())
 assert.equal(p.completionReferences.length,9);assert.deepEqual(p.completionReferences.slice(0,8),prefix.completionReferences)
 assert.deepEqual(p.completionReferences[8],{boundaryId:'WF2-R1-PROVENANCE',sha256:r1Expected.recordSha256,state:'VERIFIED',acceptedMainSha:r1Expected.acceptedMainSha})
 assert.equal(p.acceptedMainSha,r1Expected.acceptedMainSha);assert.equal(p.slices.length,20)
 const identities=rows=>rows.map(({sliceId,ordinal,boundaryId,immediatePredecessor})=>({sliceId,ordinal,boundaryId,immediatePredecessor}))
 assert.deepEqual(identities(p.slices),identities(prefix.slices))
 assert.deepEqual(p.slices.filter(s=>s.state!==prefix.slices.find(old=>old.sliceId===s.sliceId).state).map(s=>s.sliceId),['WF2-R1-PROVENANCE'])
 assert.equal(p.slices.find(s=>s.sliceId==='WF2-R1-PROVENANCE').state,'VERIFIED')
 assert.equal(p.slices.find(s=>s.sliceId==='WF2-R2-INVOKE').state,'planned');assert.equal(p.nextSliceId,'WF2-R2-INVOKE')
 const next=deriveNextSlice({programIndex:c.programIndex,statusProjection:p})
 assert.deepEqual(next,c.programIndex.programAtomicSlices[7]);assert.equal(next.ordinal,8);assert.equal(next.sliceId,'WF2-R2-INVOKE')
 assert.deepEqual(p.boundaries,prefix.boundaries);assert.equal(p.boundaries.find(b=>b.id==='WORKFLOW-C-SAFE-PREFIX').state,'planned')
 assert.equal(p.boundaries.find(b=>b.id==='WORKFLOW-B-GATE-P').state,'VERIFIED')
 for(const id of ['WF2-P7-MANIFEST','GATE-R-ARCHIVE-INVENTORY'])assert.equal(p.slices.find(s=>s.sliceId===id).state,'VERIFIED')
 const future=['WF2-R3-WINDOWS-ADAPTER','WF2-R3-ARTIFACT-TX','WF2-R4-EXECUTOR','WF2-R5-BOB']
 for(const id of future){const row=p.capabilities.find(cap=>cap.id===id);assert.equal(row.disposition,'conditional');assert.equal(row.executionState,'planned');assert.equal(row.observedActivationStatus,'inactive')}
 assert.equal(p.capabilities.find(cap=>cap.id==='WF2-R6-ARCHIVED').executionState,'not_applicable')
 assert.equal(p.slices.some(s=>s.sliceId==='WF2-R6-ARCHIVED'),false)
 assert.ok(p.slices.every(s=>s.observedActivationStatus==='inactive'));assert.ok(p.capabilities.every(s=>s.observedActivationStatus==='inactive'))
 assert.deepEqual(p.activeSliceIds,[]);assert.equal(p.automaticCleanup,false);assert.equal(p.mutationAuthority,false)
})

test('r1_absent_prefix_still_admits_r1',()=>{
 const c=throughGateR(),p=projectIntegrationStatus(c)
 assert.equal(p.completionReferences.length,8)
 for(const id of ['WF2-R1-PROVENANCE','WF2-R2-INVOKE'])assert.equal(p.slices.find(s=>s.sliceId===id).state,'planned')
 assert.equal(deriveNextSlice({programIndex:c.programIndex,statusProjection:p}).sliceId,'WF2-R1-PROVENANCE')
})

test('rejects_r1_nonprefix_reversed_duplicate_and_sparse_collections',()=>{
 const prefix=throughGateR().completionObservations,r=r1Completion(),full=[...prefix,r]
 const swapped=full.slice();[swapped[0],swapped[1]]=[swapped[1],swapped[0]]
 const sparse=full.slice();delete sparse[7]
 for(const records of [[r],[...prefix.slice(0,-1),r],swapped,[...full,r],[...prefix.slice(0,-1),r,prefix.at(-1)],sparse]){
  assert.throws(()=>projectIntegrationStatus({...context(),completionObservations:records}))
 }
})

test('rejects_r1_source_ci_and_external_evidence_tamper',()=>{
 const original=r1Completion(),mutations=[
  r=>r.acceptedMainSha=r1HashTamper(r.acceptedMainSha),r=>r.acceptedTreeSha=r1HashTamper(r.acceptedTreeSha),r=>r.sourceHeadSha=r1HashTamper(r.sourceHeadSha),
  r=>r.mergeParents[0]=r1HashTamper(r.mergeParents[0]),r=>r.pullRequestNumber++,r=>r.ci.allRequiredGatesSucceeded=true,
  r=>r.ci.mode='verified',r=>r.ci.authorization.userInstruction='',r=>r.ci.authorization.sourceHead='0'.repeat(40),
  r=>r.ci.authorizationReceipt.sha256='0'.repeat(64),r=>r.ci.candidate.allRequiredGatesSucceeded=true,
  r=>r.ci.actualMain.head=r.sourceHeadSha,r=>r.ci.candidate.automatic[0].conclusion='success',
  r=>r.ci.candidate.automatic[0].attempt++,r=>r.ci.candidate.manual.workflowsDispatched=4,r=>r.ci.hostedRawHeadProofs=20,
  r=>r.activeRuntime.gateRResult.runtimeSuitesExecuted=0,r=>r.externalEvidence[0].bytes++,
  r=>r.externalEvidence[0].sha256=r1HashTamper(r.externalEvidence[0].sha256),r=>r.externalEvidence[0].path+='.forged',
  r=>r.externalEvidence[0].id+=':forged',r=>r.externalEvidence.push(structuredClone(r.externalEvidence[0])),r=>r.externalEvidence.pop(),
  r=>r.preservation.manifest.sha256=r1HashTamper(r.preservation.manifest.sha256),r=>r.preservation.allHashesVerified=false
 ]
 for(const mutate of mutations){const r=structuredClone(original);mutate(r);assert.notEqual(digest(r),digest(original));assert.throws(()=>validateCompletionObservation(r,{programIndex:buildProgramIndex(),evidenceDigests:digests(r)}))}
 for(const key of ['bytes','sha256']){const actual=digests(original),id=original.externalEvidence[0].id;if(key==='bytes')actual[id].bytes++;else actual[id].sha256=r1HashTamper(actual[id].sha256);assert.throws(()=>validateCompletionObservation(original,{programIndex:buildProgramIndex(),evidenceDigests:actual}))}
})

test('rejects_r1_runtime_authority_counter_and_uat_tamper',()=>{
 const original=r1Completion(),mutations=[
  r=>r.runtimeActivation=true,r=>r.productRuntimeActivation='active',r=>r.observedMaxActivation='active',r=>r.activeSliceIds.push('WF2-R1-PROVENANCE'),
  r=>r.mutationAuthority=true,r=>r.automaticCleanup=true,r=>r.activeRuntime.runtimeActivation=true,r=>r.activeRuntime.gateRResult.archiveTestsExecuted=1,
  r=>r.installedUat.state='FAILED',r=>r.installedUat.requiredCases[0].status='skip',r=>r.installedUat.requiredCases.pop(),r=>r.installedUat.requiredCaseIds.pop(),
  r=>r.installedUat.provenance.bytes++,r=>r.installedUat.provenance.sha256=r1HashTamper(r.installedUat.provenance.sha256),
  r=>r.installedUat.requiredCases[1].observed.p7Manifest.sha256='0'.repeat(64),r=>r.installedUat.actualNewHostRun=true,
  r=>r.installedUat.p7ManifestReference.referenceKind='independent actual host output',r=>r.installedUat.requiredCases[2].evidenceKind='actual-provider-runtime',
  r=>r.packages.workflowRegister.allPayloadsByteEqual=false,r=>r.installedUat.binding.allPayloadsByteEqual=false,r=>r.finalProgramUat='passed'
 ]
 for(const key of ['providerDispatches','bobDispatches','v2ProductLeaseAcquisitions','v2ProductRunDirectoryCreations','v2ProductArtifactStages']) {
  mutations.push(r=>r.activeRuntime.gateRResult[key]=1,r=>r.activeRuntime.productWiring[key]=1)
 }
 for(const mutate of mutations){const r=structuredClone(original);mutate(r);assert.notEqual(digest(r),digest(original));assert.throws(()=>validateCompletionObservation(r,{programIndex:buildProgramIndex(),evidenceDigests:digests(r)}))}
})

test('rejects_r1_as_premature_r2_conditional_or_generic_scope_authority',()=>{
 const c=throughR1(),original=projectIntegrationStatus(c)
 for(const id of ['WF2-R2-INVOKE','WF2-R3-WINDOWS-ADAPTER','WF2-R3-ARTIFACT-TX','WF2-R4-EXECUTOR','WF2-R5-BOB','WF2-R6-ARCHIVED']){
  const p=structuredClone(original);p.capabilities.find(r=>r.id===id).executionState='VERIFIED';assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:p}))
 }
 const mutations=[
  p=>p.slices.find(r=>r.sliceId==='WF2-R2-INVOKE').state='VERIFIED',p=>p.nextSliceId='WF2-R3-ARTIFACT-TX',
  p=>p.boundaries.find(r=>r.id==='WORKFLOW-C-SAFE-PREFIX').state='VERIFIED',p=>p.activeSliceIds.push('WF2-R1-PROVENANCE'),
  p=>p.mutationAuthority=true,p=>p.automaticCleanup=true,p=>p.completionReferences[8].boundaryId='WF2-R2-INVOKE',
  p=>p.completionReferences[8].boundaryId='unregistered',p=>p.completionReferences[8]=structuredClone(p.completionReferences[7])
 ]
 for(const mutate of mutations){const p=structuredClone(original);mutate(p);assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:p}))}
})

test('generator_consumes_r1_once_and_rejects_r1_byte_drift',async()=>{
 const {runGenerator}=await import('../create-feature-integration-status.mjs'),target=fileURLToPath(new URL('../../../docs/release-evidence/wf2-r1-completion-2026-10-17.json',import.meta.url))
 let reads=0,output
 await runGenerator(['--print'],{readFile:async p=>{if(p===target)reads++;return readFileSync(p)},writeStdout:bytes=>{output=JSON.parse(bytes)}})
 assert.equal(reads,1,'generator must read accepted R1 completion once')
 assert.equal(output.completionReferences.length,14);assert.equal(output.slices.find(r=>r.sliceId==='WF2-R1-PROVENANCE').state,'VERIFIED');assert.equal(output.nextSliceId,'PROC-T15-AGGREGATE')
 for(const suffix of [Buffer.from('\n'),Buffer.from('\r\n'),Buffer.from(' ')]){
  await assert.rejects(()=>runGenerator(['--print'],{readFile:async p=>p===target?Buffer.concat([readFileSync(p),suffix]):readFileSync(p),writeStdout:()=>assert.fail('R1 byte drift must never emit projection')}))
 }
 await assert.rejects(()=>runGenerator(['--print'],{readFile:async p=>p===target?Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),readFileSync(p)]):readFileSync(p),writeStdout:()=>assert.fail('BOM must never emit projection')}))
 let arbitraryReads=0,emitted=false
 await assert.rejects(()=>runGenerator(['--print','--output','outside'],{readFile:async()=>{arbitraryReads++;return Buffer.from('{}')},writeStdout:()=>{emitted=true}}))
 assert.equal(arbitraryReads,0);assert.equal(emitted,false)
})

test('keeps_r1_exact_lf_bytes_after_autocrlf_index_checkout',async t=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join,resolve,sep,basename}=await import('node:path'),{execFileSync}=await import('node:child_process'),{runGenerator}=await import('../create-feature-integration-status.mjs')
 const root=fileURLToPath(new URL('../../../',import.meta.url)),temp=mkdtempSync(join(tmpdir(),'r1-completion-lf-')),relative='docs/release-evidence/wf2-r1-completion-2026-10-17.json'
 t.after(()=>{assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep));assert.ok(basename(temp).startsWith('r1-completion-lf-'));rmSync(temp,{recursive:true,force:true})})
 execFileSync('git',['-c','core.autocrlf=true','checkout-index','--prefix='+temp.replaceAll('\\','/')+'/','--',relative],{cwd:root,windowsHide:true})
 const checked=readFileSync(join(temp,relative)),indexed=execFileSync('git',['show',':'+relative],{cwd:root,windowsHide:true,maxBuffer:32*1024*1024})
 assert.ok(checked.equals(indexed));assert.equal(checked.at(-1),10);assert.equal(checked.includes(13),false);assert.equal(checked.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])),false)
 await runGenerator(['--check'],{readFile:async p=>p.endsWith('/'+relative.replaceAll('\\','/'))||p.endsWith('\\'+relative.replaceAll('/','\\'))?checked:readFileSync(p),writeStdout:()=>assert.fail('check mode must never emit')})
})

// R2 completion is an additive exact-byte import of the accepted source M1.
const r2Completion=()=>json('../../../docs/release-evidence/wf2-r2-completion-2026-10-18.json')
const throughR2=()=>{const c=throughR1();c.completionObservations.push(r2Completion());return c}
const r2Expected={"recordSha256":"6782c1e797fcf7d76090e39a1afd735f3449efe59a9d521c375d4c360e0de04c","evidenceSha256":"0a5920718eb49bf26fa09e5180320006ba1c97abbb808af07f940b4abf0ea129","sourceHead":"3c8e4be63a1d51a9479ffb394eb28617e291c304","sourceMain":"a58d5c74be087917093921c26d57c603a3d1c0d5","sourceTree":"661f4a80ddbb7232fe162f8b4e12e1b80378d372","mergeParents":["abdedeb23fe133c2b541c8cc2fa7d35f2e8b5688","3c8e4be63a1d51a9479ffb394eb28617e291c304"]}

test('accepts_only_fixed_r2_source_m1_and_honest_ci_waiver',()=>{
 const record=r2Completion();validateCompletionObservation(record,{programIndex:buildProgramIndex(),evidenceDigests:digests(record)})
 assert.equal(digest(record),r2Expected.recordSha256);assert.equal(digest(digests(record)),r2Expected.evidenceSha256)
 assert.equal(record.sourceHeadSha,r2Expected.sourceHead);assert.equal(record.acceptedMainSha,r2Expected.sourceMain);assert.equal(record.acceptedTreeSha,r2Expected.sourceTree);assert.deepEqual(record.mergeParents,r2Expected.mergeParents)
 assert.equal(record.ci.mode,'explicit_user_ci_waiver');assert.equal(record.ci.allRequiredGatesSucceeded,false);assert.equal(record.ci.authorization.userInstruction,'実CIは承認として続きを実施して\n良い')
 assert.equal(record.ci.candidate.head,record.sourceHeadSha);assert.equal(record.ci.actualMain.head,record.acceptedMainSha)
 for(const ci of [record.ci.candidate,record.ci.actualMain]){assert.equal(ci.allRequiredGatesSucceeded,false);assert.deepEqual(ci.manual,{state:'not_run',workflowsDispatched:0})}
 const gate=record.activeRuntime.gateRResult;assert.equal(gate.runtimeSuitesExecuted,15);assert.equal(gate.archiveTestsExecuted,0);assert.equal(gate.runtimeActivation,false)
 for(const key of ['providerDispatches','bobDispatches','v2ProductLeaseAcquisitions','v2ProductRunDirectoryCreations','v2ProductArtifactStages']){assert.equal(gate[key],0);assert.equal(record.activeRuntime.productWiring[key],0)}
 assert.equal(record.packages.workflowRegister.vsix.bytes,1199470);assert.equal(record.packages.workflowRegister.allowedCompactionPaths.length,33)
 assert.equal(record.installedUat.requiredCases.length,20);assert.ok(record.installedUat.requiredCases.every(row=>row.status==='pass'));assert.equal(record.installedUat.actualNewHostRun,true)
 assert.equal(record.externalEvidence.length,record.preservation.files+1);assert.equal(new Set(record.externalEvidence.map(row=>row.id)).size,record.externalEvidence.length)
 assert.equal(record.runtimeActivation,false);assert.equal(record.mutationAuthority,false);assert.equal(record.automaticCleanup,false);assert.equal(record.finalProgramUat,'not_run')
 assert.match(record.review.deferredMinor,/M1/);assert.match(record.limits.unsafeImmutablePromise,/exit1/);assert.equal(record.review.secondReview,false)
})

test('one_r2_completion_preserves_nine_prefix_and_admits_only_existing_bridge',()=>{
 const c=throughR2(),p=projectIntegrationStatus(c),old=projectIntegrationStatus(throughR1())
 assert.equal(p.completionReferences.length,10);assert.deepEqual(p.completionReferences.slice(0,9),old.completionReferences);assert.equal(p.acceptedMainSha,r2Expected.sourceMain)
 assert.deepEqual(p.slices.filter(row=>row.state==='VERIFIED').map(row=>row.sliceId),[...old.slices.filter(row=>row.state==='VERIFIED').map(row=>row.sliceId),'WF2-R2-INVOKE'])
 const ids=rows=>rows.map(({sliceId,ordinal,boundaryId,immediatePredecessor})=>({sliceId,ordinal,boundaryId,immediatePredecessor}));assert.deepEqual(ids(p.slices),ids(old.slices));assert.equal(p.slices.length,20)
 assert.equal(p.nextSliceId,'REG-BRIDGE-OWNER-VERSION-LIFECYCLE');assert.deepEqual(deriveNextSlice({programIndex:c.programIndex,statusProjection:p}),c.programIndex.programAtomicSlices[8]);assert.equal(p.slices[8].ordinal,9)
 assert.deepEqual(p.boundaries,old.boundaries);assert.deepEqual(p.activeSliceIds,[]);assert.equal(p.mutationAuthority,false);assert.equal(p.automaticCleanup,false)
 for(const id of ['WF2-R3-WINDOWS-ADAPTER','WF2-R3-ARTIFACT-TX','WF2-R4-EXECUTOR','WF2-R5-BOB']){const cap=p.capabilities.find(row=>row.id===id);assert.equal(cap.disposition,'conditional');assert.equal(cap.executionState,'planned');assert.equal(cap.observedActivationStatus,'inactive')}
 assert.equal(p.capabilities.find(row=>row.id==='WF2-R6-ARCHIVED').executionState,'not_applicable');assert.ok(p.slices.every(row=>row.observedActivationStatus==='inactive'))
})

test('rejects_r2_source_ci_host_payload_external_and_authority_tamper',()=>{
 const original=r2Completion(),mutations=[r=>r.acceptedMainSha='0'.repeat(40),r=>r.sourceHeadSha='0'.repeat(40),r=>r.acceptedTreeSha='0'.repeat(40),r=>r.mergeParents.reverse(),r=>r.pullRequestNumber++,r=>r.ci.allRequiredGatesSucceeded=true,r=>r.ci.mode='verified',r=>r.ci.authorization.userInstruction='',r=>r.ci.authorization.scope.sourceHead='0'.repeat(40),r=>r.ci.actualMain.head=r.sourceHeadSha,r=>r.ci.candidate.workflows[0].conclusion='success',r=>r.ci.candidate.manual.workflowsDispatched=4,r=>r.installedUat.requiredCases.pop(),r=>r.installedUat.requiredCases[0].status='skip',r=>r.packages.workflowRegister.vsix.bytes++,r=>r.activeRuntime.gateRResult.archiveTestsExecuted=1,r=>r.runtimeActivation=true,r=>r.mutationAuthority=true,r=>r.automaticCleanup=true,r=>r.finalProgramUat='passed',r=>r.externalEvidence[0].bytes++,r=>r.externalEvidence[0].sha256='0'.repeat(64),r=>r.externalEvidence[0].path+='.forged',r=>r.externalEvidence.push(structuredClone(r.externalEvidence[0])),r=>r.externalEvidence.pop(),r=>r.preservation.allHashesVerified=false]
 for(const mutate of mutations){const record=structuredClone(original);mutate(record);assert.throws(()=>validateCompletionObservation(record,{programIndex:buildProgramIndex(),evidenceDigests:digests(record)}))}
 for(const key of ['bytes','sha256']){const actual=digests(original),id=original.externalEvidence[0].id;if(key==='bytes')actual[id].bytes++;else actual[id].sha256='0'.repeat(64);assert.throws(()=>validateCompletionObservation(original,{programIndex:buildProgramIndex(),evidenceDigests:actual}))}
})

test('rejects_r2_nonprefix_reversed_duplicate_and_sparse_collections',()=>{
 const prefix=throughR1().completionObservations,record=r2Completion(),full=[...prefix,record],sparse=full.slice();delete sparse[8]
 for(const records of [[record],[...prefix.slice(0,-1),record],[record,...prefix],[...full,record],sparse])assert.throws(()=>projectIntegrationStatus({...context(),completionObservations:records}))
})

test('rejects_r2_as_conditional_or_runtime_activation_authority',()=>{
 const c=throughR2(),original=projectIntegrationStatus(c)
 for(const id of ['WF2-R3-WINDOWS-ADAPTER','WF2-R3-ARTIFACT-TX','WF2-R4-EXECUTOR','WF2-R5-BOB','WF2-R6-ARCHIVED']){const p=structuredClone(original);p.capabilities.find(row=>row.id===id).executionState='VERIFIED';assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:p}))}
 for(const mutate of [p=>p.activeSliceIds.push('WF2-R2-INVOKE'),p=>p.mutationAuthority=true,p=>p.automaticCleanup=true,p=>p.boundaries.find(row=>row.id==='WORKFLOW-C-SAFE-PREFIX').state='VERIFIED',p=>p.slices[8].state='VERIFIED']){const p=structuredClone(original);mutate(p);assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:p}))}
})

test('generator_reads_literal_r2_once_and_refuses_missing_or_noncanonical_bytes',async()=>{
 const {runGenerator}=await import('../create-feature-integration-status.mjs'),target=fileURLToPath(new URL('../../../docs/release-evidence/wf2-r2-completion-2026-10-18.json',import.meta.url));let reads=0,output
 await runGenerator(['--print'],{readFile:async p=>{if(p===target)reads++;return readFileSync(p)},writeStdout:bytes=>{output=JSON.parse(bytes)}});assert.equal(reads,1);assert.equal(output.completionReferences.length,14);assert.equal(output.nextSliceId,'PROC-T15-AGGREGATE')
 await assert.rejects(()=>runGenerator(['--print'],{readFile:async p=>{if(p===target)throw new Error('missing R2');return readFileSync(p)},writeStdout:()=>assert.fail('missing R2 must not emit')}))
 for(const changed of [Buffer.concat([readFileSync(target),Buffer.from('\n')]),Buffer.concat([Buffer.from([239,187,191]),readFileSync(target)]),Buffer.from(readFileSync(target,'utf8').replace(/\n/g,'\r\n'))])await assert.rejects(()=>runGenerator(['--print'],{readFile:async p=>p===target?changed:readFileSync(p),writeStdout:()=>assert.fail('R2 byte drift must not emit')}))
})

test('r2_completion_lf_bytes_survive_actual_autocrlf_index_checkout',async()=>{
 const {mkdtempSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync}=await import('node:child_process');const root=fileURLToPath(new URL('../../../',import.meta.url)),temp=mkdtempSync(join(tmpdir(),'r2-completion-lf-')),relative='docs/release-evidence/wf2-r2-completion-2026-10-18.json'
 execFileSync('git',['-c','core.autocrlf=true','checkout-index','--prefix='+temp.replaceAll('\\','/')+'/','--',relative],{cwd:root,windowsHide:true,maxBuffer:32*1024*1024});const checked=readFileSync(join(temp,relative)),indexed=execFileSync('git',['show',':'+relative],{cwd:root,windowsHide:true,maxBuffer:32*1024*1024});assert.ok(checked.equals(indexed));assert.equal(checked.at(-1),10);assert.equal(checked.includes(13),false);assert.equal(checked.subarray(0,3).equals(Buffer.from([239,187,191])),false)
 // Retain this owned temp evidence; final Program cleanup is a separate task.
})

function retainedR2Binding(record,binding){
 const same=(a,b)=>a.path===b.path&&a.bytes===b.bytes&&a.sha256===b.sha256
 const direct=record.externalEvidence.find(row=>same(row,binding));if(direct){assert.equal(digest(readFileSync(direct.path)),binding.sha256);return true}
 const manifest=JSON.parse(readFileSync(record.preservation.manifest.path)),entry=manifest.entries.find(row=>same(row.original,binding))
 if(!entry)return false
 assert.ok(record.externalEvidence.some(row=>same(row,entry.retained)));const bytes=readFileSync(entry.retained.path);assert.equal(bytes.length,binding.bytes);assert.equal(digest(bytes),binding.sha256);return true
}

test('r2_retained_subject_candidate_closure',()=>{const record=r2Completion();assert.equal(retainedR2Binding(record,record.installedUat.candidate),true,'installed candidate subject requires a recoverable retained copy')})
test('r2_retained_prior_shipping_closure',()=>{const record=r2Completion();assert.equal(retainedR2Binding(record,record.packages.workflowRegister.priorShipping),true,'prior shipping proof requires a recoverable retained copy')})
test('r2_every_absolute_binding_has_retained_closure',()=>{
 const record=r2Completion(),seen=new Set(),missing=[]
 function visit(value){if(!value||typeof value!=='object')return;if(typeof value.path==='string'&&/^(?:[A-Za-z]:[\\/]|\/)/.test(value.path)&&Number.isSafeInteger(value.bytes)&&/^[a-f0-9]{64}$/.test(value.sha256??'')){const key=JSON.stringify([value.path,value.bytes,value.sha256]);if(!seen.has(key)){seen.add(key);if(!retainedR2Binding(record,value))missing.push(value.path)}}for(const child of Object.values(value))visit(child)}
 visit(record);assert.ok(seen.size>1900);assert.deepEqual(missing,[],'every absolute byte binding must resolve; relative ZIP members resolve through their retained archive')
})

const ownerCompletion=()=>json('../../../docs/release-evidence/reg-bridge-owner-version-lifecycle-completion-2026-10-19.json')
const throughOwner=()=>{const c=throughR2();c.completionObservations.push(ownerCompletion());return c}
const ownerExpected={"recordSha256":"af004f545e7f88dbb4d53df7c81460bf153a40bd56627758aaf8c5f02e59f57c","evidenceSha256":"f859e6fd4e8fbedf43c7d2e33a1f08a9bfd889997d96a1c140478e772d3ee8ea","bytes":72700,"files":157,"source":"87ad6b85b10051f15f2942b286cb9cdfee852ec2","acceptedMainSha":"4f76cbf7a303e8c7b3a0b73055bfa247cc0f1895","tree":"5447e68a8754960d6ca85541db3a94ff64f0b965"}
test('owner lifecycle advances only ordinal nine',()=>{
 const c=throughOwner(),p=projectIntegrationStatus(c),old=projectIntegrationStatus(throughR2())
 assert.equal(p.completionReferences.length,11);assert.equal(p.nextSliceId,'REG-BRIDGE-DISCOVERY-EVIDENCE');assert.deepEqual(p.completionReferences.slice(0,10),old.completionReferences)
 assert.equal(p.acceptedMainSha,ownerExpected.acceptedMainSha);assert.equal(p.slices.length,20);assert.equal(p.slices.filter(row=>row.state==='VERIFIED').length,9)
 assert.equal(p.slices[8].state,'VERIFIED');assert.equal(p.slices[8].sliceId,'REG-BRIDGE-OWNER-VERSION-LIFECYCLE');assert.equal(p.slices[9].state,'planned')
 for(let i=0;i<20;i++)if(i!==8)assert.deepEqual(p.slices[i],old.slices[i])
 assert.deepEqual(p.boundaries,old.boundaries);assert.deepEqual(p.activeSliceIds,[]);assert.equal(p.automaticCleanup,false);assert.equal(p.mutationAuthority,false)
 assert.ok(p.slices.every(row=>row.observedActivationStatus==='inactive'));assert.equal(deriveNextSlice({programIndex:c.programIndex,statusProjection:p}).ordinal,10)
 for(const id of ['WF2-R3-WINDOWS-ADAPTER','WF2-R3-ARTIFACT-TX','WF2-R4-EXECUTOR','WF2-R5-BOB'])assert.equal(p.capabilities.find(row=>row.id===id).executionState,'planned')
})
test('owner lifecycle binds source M1 and current CI exception without claiming success',()=>{
 const r=ownerCompletion();validateCompletionObservation(r,{programIndex:buildProgramIndex(),evidenceDigests:digests(r)})
 assert.equal(digest(r),ownerExpected.recordSha256);assert.equal(digest(digests(r)),ownerExpected.evidenceSha256)
 assert.equal(r.sourceHeadSha,ownerExpected.source);assert.equal(r.acceptedMainSha,ownerExpected.acceptedMainSha);assert.equal(r.acceptedTreeSha,ownerExpected.tree)
 assert.deepEqual(r.mergeParents,['88de3a67aedf5c8d1b3ee2ea3226a973703ebaf0',ownerExpected.source]);assert.equal(r.pullRequestNumber,194)
 assert.equal(r.ci.mode,'explicit_current_slice_user_ci_waiver');assert.equal(r.ci.allRequiredGatesSucceeded,false);assert.equal(r.ci.authorization.userInstruction,'今回のCIを免除して残りを続行');assert.equal(r.ci.authorization.inheritedFromR2,false)
 for(const scope of [r.ci.candidate,r.ci.actualMain]){assert.equal(scope.workflows.length,4);assert.equal(scope.allRequiredGatesSucceeded,false);assert.equal(scope.manual.workflowsDispatched,0);for(const workflow of scope.workflows){assert.equal(workflow.conclusion,'failure');for(const job of workflow.jobs){assert.equal(job.checkoutVerified,false);assert.equal(job.steps,0)}}}
 assert.equal(r.ci.candidate.head,r.sourceHeadSha);assert.equal(r.ci.actualMain.head,r.acceptedMainSha)
 assert.equal(r.packages.workflowRegister.vsix.bytes,1193572);assert.equal(r.packages.workflowRegister.approvedCompactionPaths.length,79);assert.equal(r.packages.workflowRegister.independentAstTokenProofCount,79);assert.equal(r.packages.workflowRegister.unchangedWorkflowPayloadCount,906)
 assert.equal(r.installedUat.sourceHeadSha,r.sourceHeadSha);assert.equal(r.installedUat.sourceTreeSha,r.acceptedTreeSha);assert.equal(r.installedUat.requiredCases.length,5);assert.ok(r.installedUat.requiredCases.every(row=>row.status==='pass'));assert.equal(r.installedUat.nativeDeactivatePromiseAwaited,true)
 assert.equal(r.review.importantFixedByObservedTdd,2);assert.equal(r.review.secondReview,false);assert.equal(r.runtimeActivation,false);assert.equal(r.finalProgramUat,'not_run')
 for(const key of ['providerDispatches','bobDispatches','v2ProductLeaseAcquisitions','v2ProductRunDirectoryCreations','v2ProductArtifactStages'])assert.equal(r.activeRuntime.gateRResult[key],0)
})
test('owner lifecycle rejects source CI payload host nested-evidence and runtime tamper',()=>{
 const original=ownerCompletion(),mutations=[r=>r.acceptedMainSha=r.sourceHeadSha,r=>r.acceptedTreeSha='0'.repeat(40),r=>r.mergeParents.reverse(),r=>r.ci.mode='verified',r=>r.ci.allRequiredGatesSucceeded=true,r=>r.ci.authorization.userInstruction='',r=>r.ci.authorization.inheritedFromR2=true,r=>r.ci.actualMain.head=r.sourceHeadSha,r=>r.ci.candidate.workflows[0].conclusion='success',r=>r.packages.workflowRegister.vsix.sha256='0'.repeat(64),r=>r.installedUat.sourceHeadSha='0'.repeat(40),r=>r.installedUat.requiredCases.pop(),r=>r.installedUat.nativeHostExit=1,r=>r.source.sourceAdmissionDeltas=56,r=>r.preservation.allHashesVerified=false,r=>r.externalEvidence.pop(),r=>r.externalEvidence.push(r.externalEvidence[0]),r=>r.review.importantFixedByObservedTdd=1,r=>r.runtimeActivation=true,r=>r.mutationAuthority=true,r=>r.finalProgramUat='passed']
 for(const mutate of mutations){const r=structuredClone(original);mutate(r);assert.throws(()=>validateCompletionObservation(r,{programIndex:buildProgramIndex(),evidenceDigests:digests(r)}))}
 const actual=digests(original);actual[original.externalEvidence[0].id].bytes++;assert.throws(()=>validateCompletionObservation(original,{programIndex:buildProgramIndex(),evidenceDigests:actual}))
})
test('owner lifecycle rejects old-prefix changes nonprefix collections and later promotion',()=>{
 const c=throughOwner(),records=c.completionObservations
 const sparse=records.slice();delete sparse[9]
 for(const completionObservations of [[records.at(-1)],records.slice().reverse(),[...records,records.at(-1)],sparse])assert.throws(()=>projectIntegrationStatus({...c,completionObservations}))
 const p=projectIntegrationStatus(c);p.completionReferences[0].acceptedMainSha='0'.repeat(40);assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:p}))
 for(const mutate of [p=>p.slices[9].state='VERIFIED',p=>p.activeSliceIds.push('REG-BRIDGE-OWNER-VERSION-LIFECYCLE'),p=>p.mutationAuthority=true,p=>p.capabilities.find(row=>row.id==='WF2-R3-ARTIFACT-TX').executionState='VERIFIED']){const projection=projectIntegrationStatus(c);mutate(projection);assert.throws(()=>deriveNextSlice({programIndex:c.programIndex,statusProjection:projection}))}
})
test('owner generator reads one literal LF completion and rejects missing or noncanonical bytes',async()=>{
 const {runGenerator}=await import('../create-feature-integration-status.mjs'),target=fileURLToPath(new URL('../../../docs/release-evidence/reg-bridge-owner-version-lifecycle-completion-2026-10-19.json',import.meta.url));let reads=0,output
 await runGenerator(['--print'],{readFile:async file=>{if(file===target)reads++;return readFileSync(file)},writeStdout:bytes=>{output=JSON.parse(bytes)}})
 assert.equal(reads,1);assert.equal(output.completionReferences.length,14);assert.equal(output.nextSliceId,'PROC-T15-AGGREGATE')
 await assert.rejects(()=>runGenerator(['--print'],{readFile:async file=>{if(file===target)throw Error('missing owner completion');return readFileSync(file)},writeStdout:()=>assert.fail('missing owner must not emit')}))
 for(const bytes of [Buffer.concat([readFileSync(target),Buffer.from('\n')]),Buffer.concat([Buffer.from([239,187,191]),readFileSync(target)]),Buffer.from(readFileSync(target,'utf8').replace(/\n/g,'\r\n'))])await assert.rejects(()=>runGenerator(['--print'],{readFile:async file=>file===target?bytes:readFileSync(file),writeStdout:()=>assert.fail('owner byte drift must not emit')}))
})
test('owner completion LF survives actual index checkout',async()=>{
 const {mkdtempSync,readFileSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync}=await import('node:child_process'),root=fileURLToPath(new URL('../../../',import.meta.url)),temp=mkdtempSync(join(tmpdir(),'owner-completion-lf-')),rel='docs/release-evidence/reg-bridge-owner-version-lifecycle-completion-2026-10-19.json'
 execFileSync('git',['-c','core.autocrlf=true','checkout-index','--prefix='+temp.replaceAll('\\','/')+'/','--',rel],{cwd:root,windowsHide:true,maxBuffer:32*1024*1024});const checked=readFileSync(join(temp,rel)),indexed=execFileSync('git',['show',':'+rel],{cwd:root,windowsHide:true,maxBuffer:32*1024*1024});assert.ok(checked.equals(indexed));assert.equal(checked.at(-1),10);assert.equal(checked.includes(13),false)
})
function ownerRetainedBytes(record,binding,manifest){
 const same=(a,b)=>a.path===b.path&&a.bytes===b.bytes&&a.sha256===b.sha256
 const direct=record.externalEvidence.find(row=>same(row,binding)),entry=direct??manifest.entries.find(row=>same(row.original,binding))?.retained
 assert(entry,'missing retained binding '+binding.path);assert.ok(record.externalEvidence.some(row=>same(row,entry)),'unlisted retained binding');const bytes=readFileSync(entry.path);assert.equal(bytes.length,binding.bytes);assert.equal(digest(bytes),binding.sha256);return bytes
}
test('owner completion retains every recursive absolute byte binding including installed subject',async()=>{
 const {mkdtempSync,writeFileSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),temp=mkdtempSync(join(tmpdir(),'owner-retention-closure-')),source=ownerCompletion()
 const bind=(path,bytes)=>({path,bytes:bytes.length,sha256:digest(bytes)}),payload=Buffer.from('retained owner artifact\n'),payloadOriginal=bind(join(temp,'unavailable-original','artifact.bin'),payload),payloadRetained=bind(join(temp,'retained-artifact.bin'),payload)
 writeFileSync(payloadRetained.path,payload)
 const subjectBytes=Buffer.from(JSON.stringify({candidate:{head:source.sourceHeadSha,tree:source.acceptedTreeSha},artifact:payloadOriginal})+'\n'),subjectOriginal=bind(join(temp,'unavailable-original','subject.json'),subjectBytes),subjectRetained=bind(join(temp,'retained-subject.json'),subjectBytes)
 writeFileSync(subjectRetained.path,subjectBytes)
 const manifest={entries:[{original:payloadOriginal,retained:payloadRetained},{original:subjectOriginal,retained:subjectRetained}]},manifestBytes=Buffer.from(JSON.stringify(manifest)+'\n'),manifestBinding=bind(join(temp,'retention-manifest.json'),manifestBytes)
 writeFileSync(manifestBinding.path,manifestBytes)
 const record={sourceHeadSha:source.sourceHeadSha,acceptedTreeSha:source.acceptedTreeSha,installedUat:{candidate:subjectOriginal},preservation:{manifest:manifestBinding,files:manifest.entries.length},externalEvidence:[{id:'fixture-artifact',...payloadRetained},{id:'fixture-subject',...subjectRetained},{id:'fixture-manifest',...manifestBinding}]},seen=new Set();let count=0
 function visit(value){if(!value||typeof value!=='object')return;if(typeof value.path==='string'&&/^(?:[A-Za-z]:[\\/]|\/)/.test(value.path)&&Number.isSafeInteger(value.bytes)&&/^[a-f0-9]{64}$/.test(value.sha256??'')){const key=JSON.stringify([value.path,value.bytes,value.sha256]);if(!seen.has(key)){seen.add(key);const bytes=ownerRetainedBytes(record,value,manifest);count++;if((bytes[0]===123||bytes[0]===91)&&bytes.length<32*1024*1024){let nested;try{nested=JSON.parse(bytes.toString())}catch{}if(nested)visit(nested)}}}for(const child of Object.values(value))visit(child)}
 visit(record);assert.equal(count,5);assert.equal(manifest.entries.length,record.preservation.files);assert.equal(record.externalEvidence.length,record.preservation.files+1)
 const subject=JSON.parse(ownerRetainedBytes(record,record.installedUat.candidate,manifest));assert.equal(subject.candidate.head,source.sourceHeadSha);assert.equal(subject.candidate.tree,source.acceptedTreeSha)
 const missing=structuredClone(manifest);missing.entries=missing.entries.filter(row=>row.original.path!==record.installedUat.candidate.path);assert.throws(()=>ownerRetainedBytes(record,record.installedUat.candidate,missing),/missing retained binding/)
 const unlisted=structuredClone(record);unlisted.externalEvidence=unlisted.externalEvidence.filter(row=>row.path!==payloadRetained.path);assert.throws(()=>ownerRetainedBytes(unlisted,payloadOriginal,manifest),/unlisted retained binding/)
 writeFileSync(payloadRetained.path,Buffer.from('tampered retained artifact\n'));assert.throws(()=>ownerRetainedBytes(record,payloadOriginal,manifest),assert.AssertionError)
})

test('owner source admission LF survives actual index checkout',async()=>{
 const {mkdtempSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync}=await import('node:child_process'),{applyRegistryBridgeSourceAdmission,REGISTRY_BRIDGE_SOURCE_ADMISSION_SHA256}=await import('../registryBridgeAdmissionPolicy.mjs'),{gateRExpectedMainFiles}=await import('../gateRMainAdmissionPolicy.mjs')
 const root=fileURLToPath(new URL('../../../',import.meta.url)),temp=mkdtempSync(join(tmpdir(),'owner-source-admission-lf-')),rel='tools/main-consolidation/registry-bridge-source-admission.json'
 execFileSync('git',['-c','core.autocrlf=true','checkout-index','--prefix='+temp.replaceAll('\\','/')+'/','--',rel],{cwd:root,windowsHide:true,maxBuffer:32*1024*1024})
 const checked=readFileSync(join(temp,rel)),indexed=execFileSync('git',['show',':'+rel],{cwd:root,windowsHide:true,maxBuffer:32*1024*1024})
 assert.ok(checked.equals(indexed),'source admission canonical LF must survive Windows autocrlf checkout');assert.equal(checked.includes(13),false);assert.equal(digest(checked),REGISTRY_BRIDGE_SOURCE_ADMISSION_SHA256);assert.equal(applyRegistryBridgeSourceAdmission(checked,gateRExpectedMainFiles()).length,gateRExpectedMainFiles().length+28)
})


const discoveryCompletion=()=>json('../../../docs/release-evidence/reg-bridge-discovery-evidence-completion-2026-10-20.json')
const discoveryExpected=Object.freeze({"source":"6f2624523df4d59a941be39666ab651b4a153370","main":"8410356cfe623b9c1e54528c7e52344669b6d5de","tree":"6e6c1af52131a4b3eddd9491f5658e71adfb8903","recordSha256":"84af4a7937314e940277ef5965367818ab1cccdbe46b1f18d8edd41fd8b01e0e","evidenceSha256":"16adb142459f056553a7f8cd2f7cf5e9d1d11323a9a880fdc5055268f45bc24f"})
const discoveryPreviousReferences=[{"acceptedMainSha":"ec136225bf2737a2f2c8053dce69d3acb6f4be3d","boundaryId":"WAVE-0A-CONTROL-PLANE","sha256":"440528d404edf754f0480306526307088054dee7d1b72506370d8c22872cc99b","state":"VERIFIED"},{"acceptedMainSha":"b8876b2714d74bd8bbe686b66d17f2f76467f041","boundaryId":"WAVE-0B-SELECTION-LEDGER","sha256":"df2f2dbfeef64c65fafcf9834998c914949b5c19ba539dccd8dfcd8dac9a91ae","state":"VERIFIED"},{"acceptedMainSha":"925c50f10e114ac5613135dab7b7439ab3dba0de","boundaryId":"WF2-P4-COMPILER","sha256":"16c1144e7b27cf0edc91fe63f202fa9cb2cce40eafbd1ce9e07af6664fd81081","state":"VERIFIED"},{"acceptedMainSha":"90c678d3d33ae61a5523f2d9cf8057538028dd4b","boundaryId":"WF2-P5-PLANSTORE","sha256":"50edb7589256b8154477db5970c0f3960dc3513d6c887ec7564b4efb58638532","state":"VERIFIED"},{"acceptedMainSha":"c5f9fcff29a787cc4f02140800556257bf05c547","boundaryId":"WF2-P6-ENTRYPOINT","sha256":"0a8f01068b306f387e3e72d185024ab5ab0ce4f04f68b8afe3a4471956937399","state":"VERIFIED"},{"acceptedMainSha":"36c80d9b71b5c3825a9dfcb21ed666e94c54f303","boundaryId":"WF2-P7-MANIFEST","sha256":"fe7fc94423170da5ec8838c45cf9636953e16766a70a445064195445a566507e","state":"VERIFIED"},{"acceptedMainSha":"36c80d9b71b5c3825a9dfcb21ed666e94c54f303","boundaryId":"WORKFLOW-B-GATE-P","sha256":"cc316f2c59dcdd37db17c20561067249b235ad84043906d89b547e2c3f965a44","state":"VERIFIED"},{"acceptedMainSha":"e11b217651b790308d823b689b000c7f7c048a8d","boundaryId":"GATE-R-ARCHIVE-INVENTORY","sha256":"983a10ba98a58811b86550866bca5e6b7b0f6d32966a12c84195e77d3c584d22","state":"VERIFIED"},{"acceptedMainSha":"bd3347814284daadebefaa0ab6ab2187690ff348","boundaryId":"WF2-R1-PROVENANCE","sha256":"e1583bebaea4bcc2909bfd0db320cc6c633d136176d767c0958802db22eaf5fd","state":"VERIFIED"},{"acceptedMainSha":"a58d5c74be087917093921c26d57c603a3d1c0d5","boundaryId":"WF2-R2-INVOKE","sha256":"6782c1e797fcf7d76090e39a1afd735f3449efe59a9d521c375d4c360e0de04c","state":"VERIFIED"},{"acceptedMainSha":"4f76cbf7a303e8c7b3a0b73055bfa247cc0f1895","boundaryId":"REG-BRIDGE-OWNER-VERSION-LIFECYCLE","sha256":"af004f545e7f88dbb4d53df7c81460bf153a40bd56627758aaf8c5f02e59f57c","state":"VERIFIED"}]
const throughDiscovery=()=>{const c=throughOwner();c.completionObservations.push(discoveryCompletion());return c}
test('discovery_completion_binds_source_not_metadata_and_preserves_prefix',()=>{
 const c=throughDiscovery(),old=projectIntegrationStatus(throughOwner()),p=projectIntegrationStatus(c),r=c.completionObservations.at(-1)
 assert.deepEqual(p.completionReferences.slice(0,11),discoveryPreviousReferences);assert.equal(p.completionReferences.length,12);assert.equal(p.slices.length,20);assert.equal(p.slices.filter(x=>x.state==='VERIFIED').length,10)
 assert.equal(p.nextSliceId,'PROC-T13-LEDGER');assert.equal(p.acceptedMainSha,discoveryExpected.main);assert.equal(p.slices[9].sliceId,'REG-BRIDGE-DISCOVERY-EVIDENCE');assert.equal(p.slices[9].state,'VERIFIED')
 for(let i=0;i<20;i++)if(i!==9)assert.deepEqual(p.slices[i],old.slices[i]);assert.deepEqual(p.activeSliceIds,[]);assert.ok(p.slices.every(x=>x.observedActivationStatus==='inactive'));assert.equal(p.mutationAuthority,false)
 assert.equal(r.sourceHeadSha,discoveryExpected.source);assert.equal(r.acceptedTreeSha,discoveryExpected.tree);assert.deepEqual(r.mergeParents,['90f926e0045405625f1f40d20a41346a94d1981a',discoveryExpected.source]);assert.equal(r.pullRequestNumber,196)
 assert.equal(digest(ownerCompletion()),discoveryPreviousReferences.at(-1).sha256);assert.equal(ownerCompletion().acceptedMainSha,'4f76cbf7a303e8c7b3a0b73055bfa247cc0f1895')
 for(const id of ['WF2-R3-WINDOWS-ADAPTER','WF2-R3-ARTIFACT-TX','WF2-R4-EXECUTOR','WF2-R5-BOB'])assert.equal(p.capabilities.find(x=>x.id===id).executionState,'planned')
})
test('discovery_actual_ci_and_physical_bytes_are_bound_without_old_waivers',()=>{
 const r=discoveryCompletion();validateCompletionObservation(r,{programIndex:buildProgramIndex(),evidenceDigests:digests(r)});assert.equal(digest(r),discoveryExpected.recordSha256);assert.equal(digest(digests(r)),discoveryExpected.evidenceSha256)
 assert.equal(r.ci.waiver,null);assert.equal(r.ci.allRequiredGatesSucceeded,true);assert.equal(r.ci.candidate.workflows.flatMap(x=>x.jobs).filter(x=>x.conclusion==='success').length,16);assert.equal(r.ci.actualMain.successfulJobs,15);assert.equal(r.ci.actualMain.skippedJobs,1)
 assert.equal(r.installedUat.sourceHeadSha,discoveryExpected.main);assert.equal(r.installedUat.nativeHostExit,0);assert.equal(r.installedUat.requiredCases.length,5);assert.ok(r.installedUat.requiredCases.every(x=>x.status==='pass'));assert.equal(r.installedUat.nativeDeactivatePromiseAwaited,true)
 assert.equal(r.packages.workflowRegister.compaction.configuredTargets,113);assert.equal(r.packages.workflowRegister.compaction.independentAstProofCount,111);assert.equal(r.packages.workflowRegister.compaction.absentConfiguredTargets.length,2)
 assert.equal(r.externalEvidence.length,r.preservation.files+1);assert.equal(new Set(r.externalEvidence.map(x=>x.id)).size,r.externalEvidence.length);assert.equal(r.runtimeActivation,false);assert.equal(r.finalProgramUat,'not_run')
})
test('safe_prefix_terminal_requires_all_gates_and_remainder',()=>{
 const c=throughDiscovery(),p=projectIntegrationStatus(c);assert.equal(p.boundaries.find(x=>x.id==='WORKFLOW-C-SAFE-PREFIX').state,'VERIFIED');assert.equal(projectIntegrationStatus(throughOwner()).boundaries.find(x=>x.id==='WORKFLOW-C-SAFE-PREFIX').state,'planned')
 for(let i=0;i<11;i++){const records=c.completionObservations.slice();records.splice(i,1);assert.throws(()=>projectIntegrationStatus({...c,completionObservations:records}))}
 for(const mutate of [r=>r.source.selectedSourceItems=26,r=>r.source.remainderItems=674,r=>r.source.unassigned=1,r=>r.discovery.sourceCoverage.bytes=0,r=>r.discovery.remainderClosure.sha256='0'.repeat(64),r=>delete r.discovery.crossPlatform,r=>r.ci.actualMain.workflows.pop(),r=>r.ci.allRequiredGatesSucceeded=false,r=>r.ci.waiver={inheritedFromOwner:true},r=>r.runtimeActivation=true]){const record=discoveryCompletion();mutate(record);assert.throws(()=>validateCompletionObservation(record,{programIndex:buildProgramIndex(),evidenceDigests:digests(record)}))}
})
test('discovery_rejects_json_claims_metadata_subject_and_actual_evidence_tamper',()=>{
 const original=discoveryCompletion();validateCompletionObservation(original,{programIndex:buildProgramIndex(),evidenceDigests:digests(original)})
 for(const mutate of [r=>r.sourceHeadSha='b'.repeat(40),r=>r.acceptedMainSha='b'.repeat(40),r=>r.acceptedTreeSha='0'.repeat(40),r=>r.mergeParents.reverse(),r=>r.discovery.report.sha256='0'.repeat(64),r=>r.discovery.compiledManifest.bytes=0,r=>r.discovery.subject.path='metadata-D2.json',r=>r.ci.mode='explicit_current_slice_user_ci_waiver',r=>r.ci.candidate.workflows[0].jobs[0].checkout.actualHeadSha='0'.repeat(40),r=>r.ci.actualMain.workflows[0].jobs.find(x=>x.name==='Extension source metrics').conclusion='success',r=>r.packages.workflowRegister.vsix.sha256='0'.repeat(64),r=>r.packages.workflowRegister.compaction.independentAstProofCount=113,r=>r.installedUat.sourceHeadSha=r.sourceHeadSha,r=>r.installedUat.nativeHostExit=1,r=>r.activeRuntime.gateRResult.providerDispatches=1,r=>r.mutationAuthority=true,r=>r.automaticCleanup=true,r=>r.finalProgramUat='passed',r=>r.externalEvidence.pop(),r=>r.externalEvidence.push(r.externalEvidence[0])]){const r=structuredClone(original);mutate(r);assert.throws(()=>validateCompletionObservation(r,{programIndex:buildProgramIndex(),evidenceDigests:digests(r)}))}
 const actual=digests(original);actual[original.externalEvidence[0].id].bytes++;assert.throws(()=>validateCompletionObservation(original,{programIndex:buildProgramIndex(),evidenceDigests:actual}))
 const p=projectIntegrationStatus(throughDiscovery());for(const change of [x=>x.acceptedMainSha='b'.repeat(40),x=>x.slices[10].state='VERIFIED',x=>x.activeSliceIds.push('REG-BRIDGE-DISCOVERY-EVIDENCE')]){const copy=structuredClone(p);change(copy);assert.throws(()=>deriveNextSlice({programIndex:buildProgramIndex(),statusProjection:copy}))}
})
test('discovery_generator_reads_literal_canonical_source_completion',async()=>{
 const {runGenerator}=await import('../create-feature-integration-status.mjs'),target=fileURLToPath(new URL('../../../docs/release-evidence/reg-bridge-discovery-evidence-completion-2026-10-20.json',import.meta.url));let reads=0,output
 await runGenerator(['--print'],{readFile:async file=>{if(file===target)reads++;return readFileSync(file)},writeStdout:bytes=>{output=JSON.parse(bytes)}})
 assert.equal(reads,1);assert.equal(output.completionReferences.length,14);assert.equal(output.acceptedMainSha,t14Main);assert.equal(output.nextSliceId,'PROC-T15-AGGREGATE')
 await assert.rejects(()=>runGenerator(['--print'],{readFile:async file=>{if(file===target)throw Error('missing Discovery completion');return readFileSync(file)},writeStdout:()=>assert.fail('missing completion emitted')}))
 for(const bytes of [Buffer.concat([readFileSync(target),Buffer.from('\n')]),Buffer.concat([Buffer.from([239,187,191]),readFileSync(target)]),Buffer.from(readFileSync(target,'utf8').replace(/\n/g,'\r\n'))])await assert.rejects(()=>runGenerator(['--print'],{readFile:async file=>file===target?bytes:readFileSync(file),writeStdout:()=>assert.fail('noncanonical Discovery emitted')}))
})
test('discovery_literal_lf_survives_real_index_checkout',async()=>{
 const {mkdtempSync,realpathSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync}=await import('node:child_process'),root=fileURLToPath(new URL('../../../',import.meta.url)),temp=mkdtempSync(join(realpathSync(tmpdir()),'discovery-completion-lf-')),relative='docs/release-evidence/reg-bridge-discovery-evidence-completion-2026-10-20.json'
 execFileSync('git',['-c','core.autocrlf=true','checkout-index','--prefix='+temp.replaceAll('\\','/')+'/','--',relative],{cwd:root,windowsHide:true,maxBuffer:8*1024*1024});const checked=readFileSync(join(temp,relative)),indexed=execFileSync('git',['show',':'+relative],{cwd:root,windowsHide:true,maxBuffer:8*1024*1024});assert.ok(checked.equals(indexed));assert.equal(checked.at(-1),10);assert.equal(checked.includes(13),false)
})

// T13 records one accepted standalone source slice; it grants no runtime authority.
const t13Completion=()=>json('../../../docs/release-evidence/proc-t13-ledger-completion-2026-10-23.json')
const throughT13=()=>{const c=throughDiscovery();c.completionObservations.push(t13Completion());return c}
const t13Source='f71cd8e345b2dbbe02c1e40d5b4008b4da84ef38',t13Main='4ca80105eceb75f9192f8a94d5203a8883c05a26',t13Tree='6fb9efb6ae16814ca5d0354507a2e6984198e6c5'
const t13PreviousTwelve=[{"acceptedMainSha":"ec136225bf2737a2f2c8053dce69d3acb6f4be3d","boundaryId":"WAVE-0A-CONTROL-PLANE","sha256":"440528d404edf754f0480306526307088054dee7d1b72506370d8c22872cc99b","state":"VERIFIED"},{"acceptedMainSha":"b8876b2714d74bd8bbe686b66d17f2f76467f041","boundaryId":"WAVE-0B-SELECTION-LEDGER","sha256":"df2f2dbfeef64c65fafcf9834998c914949b5c19ba539dccd8dfcd8dac9a91ae","state":"VERIFIED"},{"acceptedMainSha":"925c50f10e114ac5613135dab7b7439ab3dba0de","boundaryId":"WF2-P4-COMPILER","sha256":"16c1144e7b27cf0edc91fe63f202fa9cb2cce40eafbd1ce9e07af6664fd81081","state":"VERIFIED"},{"acceptedMainSha":"90c678d3d33ae61a5523f2d9cf8057538028dd4b","boundaryId":"WF2-P5-PLANSTORE","sha256":"50edb7589256b8154477db5970c0f3960dc3513d6c887ec7564b4efb58638532","state":"VERIFIED"},{"acceptedMainSha":"c5f9fcff29a787cc4f02140800556257bf05c547","boundaryId":"WF2-P6-ENTRYPOINT","sha256":"0a8f01068b306f387e3e72d185024ab5ab0ce4f04f68b8afe3a4471956937399","state":"VERIFIED"},{"acceptedMainSha":"36c80d9b71b5c3825a9dfcb21ed666e94c54f303","boundaryId":"WF2-P7-MANIFEST","sha256":"fe7fc94423170da5ec8838c45cf9636953e16766a70a445064195445a566507e","state":"VERIFIED"},{"acceptedMainSha":"36c80d9b71b5c3825a9dfcb21ed666e94c54f303","boundaryId":"WORKFLOW-B-GATE-P","sha256":"cc316f2c59dcdd37db17c20561067249b235ad84043906d89b547e2c3f965a44","state":"VERIFIED"},{"acceptedMainSha":"e11b217651b790308d823b689b000c7f7c048a8d","boundaryId":"GATE-R-ARCHIVE-INVENTORY","sha256":"983a10ba98a58811b86550866bca5e6b7b0f6d32966a12c84195e77d3c584d22","state":"VERIFIED"},{"acceptedMainSha":"bd3347814284daadebefaa0ab6ab2187690ff348","boundaryId":"WF2-R1-PROVENANCE","sha256":"e1583bebaea4bcc2909bfd0db320cc6c633d136176d767c0958802db22eaf5fd","state":"VERIFIED"},{"acceptedMainSha":"a58d5c74be087917093921c26d57c603a3d1c0d5","boundaryId":"WF2-R2-INVOKE","sha256":"6782c1e797fcf7d76090e39a1afd735f3449efe59a9d521c375d4c360e0de04c","state":"VERIFIED"},{"acceptedMainSha":"4f76cbf7a303e8c7b3a0b73055bfa247cc0f1895","boundaryId":"REG-BRIDGE-OWNER-VERSION-LIFECYCLE","sha256":"af004f545e7f88dbb4d53df7c81460bf153a40bd56627758aaf8c5f02e59f57c","state":"VERIFIED"},{"acceptedMainSha":"8410356cfe623b9c1e54528c7e52344669b6d5de","boundaryId":"REG-BRIDGE-DISCOVERY-EVIDENCE","sha256":"84af4a7937314e940277ef5965367818ab1cccdbe46b1f18d8edd41fd8b01e0e","state":"VERIFIED"}]

test('t13_completion_preserves_twelve_reference_prefix',()=>{
 const c=throughT13(),p=projectIntegrationStatus(c),old=projectIntegrationStatus(throughDiscovery())
 assert.deepEqual(p.completionReferences.slice(0,12),t13PreviousTwelve);assert.equal(p.completionReferences.length,13);assert.equal(p.slices.length,20);assert.equal(p.slices.filter(x=>x.state==='VERIFIED').length,11)
 assert.equal(p.nextSliceId,'PROC-T14-BOUNDED-DOC');assert.equal(p.acceptedMainSha,t13Main);assert.equal(p.slices[10].sliceId,'PROC-T13-LEDGER');assert.equal(p.slices[10].state,'VERIFIED')
 for(let i=0;i<20;i++)if(i!==10)assert.deepEqual(p.slices[i],old.slices[i]);assert.deepEqual(p.boundaries,old.boundaries);assert.deepEqual(p.activeSliceIds,[])
})

test('t13_completion_binds_source_not_metadata',()=>{
 const r=t13Completion();validateCompletionObservation(r,{programIndex:buildProgramIndex(),evidenceDigests:digests(r)})
 assert.equal(r.sourceHeadSha,t13Source);assert.equal(r.acceptedMainSha,t13Main);assert.equal(r.acceptedTreeSha,t13Tree);assert.deepEqual(r.mergeParents,['aa25f00f98c41c5aebdb30c68cdc967a1d205ab5',t13Source]);assert.equal(r.pullRequestNumber,198)
 assert.equal(r.source.selectedSourceItems,23);assert.equal(r.source.remainderItems,675);assert.equal(r.source.unassigned,0);assert.equal(r.source.categories,13);assert.equal(r.source.targetMaxUtf8Bytes,256);assert.equal(r.source.packedPayloadFiles,19);assert.equal(r.source.installedTypeConsumers,3)
 assert.equal(r.ci.waiver,null);assert.equal(r.ci.candidate.successfulJobs,18);assert.equal(r.ci.actualMain.successfulJobs,17);assert.equal(r.ci.actualMain.skippedJobs,1);assert.equal(r.ci.candidate.workflows.length,5);assert.equal(r.ci.actualMain.workflows.length,5)
 for(const mutate of [x=>x.sourceHeadSha=t13Main,x=>x.acceptedMainSha='b'.repeat(40),x=>x.acceptedTreeSha='0'.repeat(40),x=>x.mergeParents.reverse(),x=>x.boundaryId='PROCESSING-FOUNDATION',x=>x.pullRequestNumber++]){const bad=structuredClone(r);mutate(bad);assert.throws(()=>validateCompletionObservation(bad,{programIndex:buildProgramIndex(),evidenceDigests:digests(bad)}),TypeError)}
})

test('t13_rejects_missing_or_forged_package_ci_and_parity',()=>{
 const original=t13Completion();validateCompletionObservation(original,{programIndex:buildProgramIndex(),evidenceDigests:digests(original)})
 const mutations=[r=>delete r.processingBudget.packaging,r=>delete r.processingBudget.crossPlatform,r=>r.processingBudget.currentProductParity.sha256='0'.repeat(64),r=>r.processingBudget.definition.bytes=0,r=>r.processingBudget.extra=r.processingBudget.ledger,r=>r.source.categories=12,r=>r.source.targetMaxUtf8Bytes=255,r=>r.source.packedPayloadFiles=18,r=>r.source.installedTypeConsumers=2,r=>r.source.selectedSourceItems=22,r=>r.source.unassigned=1,r=>r.source.productionDependencies=1,r=>r.source.packagingInputsUnchanged=false,r=>r.source.changedProductPaths=1,r=>r.ci.waiver={inheritedFromDiscovery:true},r=>r.ci.allRequiredGatesSucceeded=false,r=>r.ci.candidate.workflows.pop(),r=>r.ci.candidate.workflows[0].jobs[0].checkout.actualHeadSha='0'.repeat(40),r=>r.ci.candidate.workflows[4].jobs.pop(),r=>r.ci.actualMain.workflows[4].jobs[0].log.bytes++,r=>r.ci.actualMain.workflows[0].jobs.find(j=>j.name==='Extension source metrics').conclusion='success',r=>r.packages.workflowRegister.vsix.sha256='0'.repeat(64),r=>r.packages.bazaar.sourceHeadSha=r.sourceHeadSha,r=>r.externalEvidence.pop(),r=>r.externalEvidence.push(r.externalEvidence[0]),r=>r.preservation.allHashesVerified=false,r=>r.review.secondReview=true]
 for(const mutate of mutations){const r=structuredClone(original);mutate(r);assert.throws(()=>validateCompletionObservation(r,{programIndex:buildProgramIndex(),evidenceDigests:digests(r)}),TypeError)}
 const actual=digests(original);actual[original.externalEvidence[0].id].bytes++;assert.throws(()=>validateCompletionObservation(original,{programIndex:buildProgramIndex(),evidenceDigests:actual}),TypeError)
})

test('t13_does_not_complete_processing_foundation_or_activate_runtime',()=>{
 const p=projectIntegrationStatus(throughT13());assert.equal(p.boundaries.find(x=>x.id==='PROCESSING-FOUNDATION').state,'planned');assert.equal(p.boundaries.find(x=>x.id==='WORKFLOW-C-SAFE-PREFIX').state,'VERIFIED');assert.deepEqual(p.activeSliceIds,[]);assert.ok(p.slices.every(x=>x.observedActivationStatus==='inactive'))
 const r=t13Completion();assert.deepEqual(r.installedUat,{state:'not_required',executed:false,reason:'unchanged_extension_source_and_packaging_inputs',changedProductPaths:0,historicalCompletionSha256:'84af4a7937314e940277ef5965367818ab1cccdbe46b1f18d8edd41fd8b01e0e'});assert.equal(r.finalProgramUat,'not_run')
 for(const mutate of [x=>x.runtimeActivation=true,x=>x.mutationAuthority=true,x=>x.automaticCleanup=true,x=>x.finalProgramUat='passed',x=>x.installedUat.executed=true,x=>x.installedUat.changedProductPaths=1,x=>x.activeRuntime.gateRResult.providerDispatches=1,x=>x.activeRuntime.productWiring.bobDispatches=1]){const bad=structuredClone(r);mutate(bad);assert.throws(()=>validateCompletionObservation(bad,{programIndex:buildProgramIndex(),evidenceDigests:digests(bad)}),TypeError)}
 const promoted=structuredClone(p);promoted.boundaries.find(x=>x.id==='PROCESSING-FOUNDATION').state='VERIFIED';assert.throws(()=>deriveNextSlice({programIndex:buildProgramIndex(),statusProjection:promoted}),TypeError)
})

test('t13_generator_requires_one_canonical_completion',async()=>{
 const {runGenerator}=await import('../create-feature-integration-status.mjs'),target=fileURLToPath(new URL('../../../docs/release-evidence/proc-t13-ledger-completion-2026-10-23.json',import.meta.url));let reads=0,output
 await runGenerator(['--print'],{readFile:async p=>{if(p===target)reads++;return readFileSync(p)},writeStdout:bytes=>{output=JSON.parse(bytes)}});assert.equal(reads,1);assert.equal(output.completionReferences.length,14);assert.equal(output.nextSliceId,'PROC-T15-AGGREGATE');assert.equal(output.acceptedMainSha,t14Main)
 await assert.rejects(()=>runGenerator(['--print'],{readFile:async p=>{if(p===target)throw Error('missing T13');return readFileSync(p)},writeStdout:()=>assert.fail('missing T13 emitted')}))
 for(const bytes of [Buffer.concat([readFileSync(target),Buffer.from('\n')]),Buffer.concat([Buffer.from([239,187,191]),readFileSync(target)]),Buffer.from(readFileSync(target,'utf8').replace(/\n/g,'\r\n'))])await assert.rejects(()=>runGenerator(['--print'],{readFile:async p=>p===target?bytes:readFileSync(p),writeStdout:()=>assert.fail('noncanonical T13 emitted')}))
})

test('t13_completion_lf_survives_real_index_checkout',async()=>{
 const {mkdtempSync,realpathSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync}=await import('node:child_process'),root=fileURLToPath(new URL('../../../',import.meta.url)),temp=mkdtempSync(join(realpathSync(tmpdir()),'t13-completion-lf-')),relative='docs/release-evidence/proc-t13-ledger-completion-2026-10-23.json'
 execFileSync('git',['-c','core.autocrlf=true','checkout-index','--prefix='+temp.replaceAll('\\','/')+'/','--',relative],{cwd:root,windowsHide:true,maxBuffer:8*1024*1024});const checked=readFileSync(join(temp,relative)),indexed=execFileSync('git',['show',':'+relative],{cwd:root,windowsHide:true,maxBuffer:8*1024*1024});assert.ok(checked.equals(indexed));assert.equal(checked.at(-1),10);assert.equal(checked.includes(13),false)
})

// T14 imports one byte-fixed source observation; metadata is a separate subject.
const t14Completion=()=>json('../../../docs/release-evidence/proc-t14-bounded-doc-completion-2026-10-24.json')
const throughT14=()=>{const c=throughT13();c.completionObservations.push(t14Completion());return c}
const t14Source='b5019196f377ef372a1ea7550706f9af9149fc54',t14Main='46a923a3f09e83a60a45cca887f612d7187e38c3',t14Tree='fcc1746f6bbfaf1b9138610c45acf82a889c3533'

test('through_t14_preserves_old_13_prefix_and_projects_12_of_20',()=>{
 const old=projectIntegrationStatus(throughT13()),p=projectIntegrationStatus(throughT14())
 assert.deepEqual(p.completionReferences.slice(0,13),old.completionReferences)
 assert.deepEqual([p.completionReferences.length,p.slices.length,p.slices.filter(x=>x.state==='VERIFIED').length,p.nextSliceId],[14,20,12,'PROC-T15-AGGREGATE'])
 assert.equal(p.acceptedMainSha,t14Main);assert.equal(p.boundaries.find(x=>x.id==='PROCESSING-FOUNDATION').state,'planned');assert.ok(p.slices.every(x=>x.observedActivationStatus==='inactive'));assert.deepEqual(p.activeSliceIds,[])
 for(let i=0;i<20;i++)if(p.slices[i].sliceId!=='PROC-T14-BOUNDED-DOC')assert.deepEqual(p.slices[i],old.slices[i])
})

test('t14_completion_rejects_wrong_source_metadata_subject_and_waiver',async()=>{
 const {validateT14Completion}=await import('../featureIntegrationStatusPolicy.mjs');assert.equal(typeof validateT14Completion,'function')
 const original=t14Completion();validateT14Completion(original);validateCompletionObservation(original,{programIndex:buildProgramIndex(),evidenceDigests:digests(original)})
 assert.equal(original.sourceHeadSha,t14Source);assert.equal(original.acceptedMainSha,t14Main);assert.equal(original.acceptedTreeSha,t14Tree);assert.equal(original.pullRequestNumber,200)
 for(const mutate of [r=>r.sourceHeadSha=t14Main,r=>r.acceptedMainSha='a'.repeat(40),r=>r.acceptedTreeSha='0'.repeat(40),r=>r.mergeParents.reverse(),r=>r.ci.waiver={approved:true},r=>r.ci.mode='waived',r=>r.source.metadataIsNotSourceSubject=false,r=>r.source.selectedSourceItems=38,r=>r.source.remainderItems=674,r=>r.source.unassigned=1,r=>r.source.rawByteAccounting='source_plus_expanded',r=>r.source.expandedByteAccounting='charged',r=>r.source.categories=12,r=>r.source.packedPayloadFiles=39,r=>r.source.productionDependencies=1,r=>r.boundaryId='PROCESSING-FOUNDATION',r=>r.runtimeActivation=true,r=>r.mutationAuthority=true,r=>r.finalProgramUat='passed',r=>r.review.remaining.important=1]){
  const bad=structuredClone(original);mutate(bad);assert.throws(()=>validateT14Completion(bad),TypeError)
 }
})

test('t14_ci_and_installed_artifacts_must_share_actual_source_identity',async()=>{
 const {validateT14Completion}=await import('../featureIntegrationStatusPolicy.mjs');assert.equal(typeof validateT14Completion,'function');const original=t14Completion();validateT14Completion(original)
 const mutations=[r=>r.ci.candidate.head=t14Main,r=>r.ci.actualMain.head=t14Source,r=>r.ci.actualMain.workflows.pop(),r=>r.ci.actualMain.workflows[0].jobs[0].guard.actualHeadSha=t14Source,r=>r.ci.candidate.workflows[4].jobs[0].runner.id=0,r=>r.ci.actualMain.workflows[0].jobs.find(j=>j.name==='Extension source metrics').conclusion='success',r=>r.ci.candidate.workflows[4].jobs[1].jobId=r.ci.candidate.workflows[4].jobs[0].jobId,r=>r.installedUat.actualMain.sourceHeadSha=t14Source,r=>r.installedUat.actualMain.platforms.reverse(),r=>r.installedUat.actualMain.platforms[0].caseCount=8,r=>r.installedUat.actualMain.platforms[0].loadedModules=23,r=>r.installedUat.actualMain.platforms[1].parserEntries=7,r=>r.installedUat.actualMain.platforms[0].sourceFixedParserFiles=582,r=>r.packages.bazaar.vsix=r.installedUat.candidate.platforms[0].vsix[0].vsix,r=>r.packages.consistency.sourceHeadSha=t14Source,r=>r.packages.workflowRegister.headroomBytes++,r=>r.installedUat.visualOperator='passed',r=>r.installedUat.productActivation='passed']
 for(const mutate of mutations){const bad=structuredClone(original);mutate(bad);assert.throws(()=>validateT14Completion(bad),TypeError)}
})

test('t14_replay_requires_closed_physical_bindings_without_host_access',async()=>{
 const {validateT14Completion}=await import('../featureIntegrationStatusPolicy.mjs');assert.equal(typeof validateT14Completion,'function');const original=t14Completion()
 const filesystem=await import('node:fs'),{syncBuiltinESMExports}=await import('node:module'),patched=['readFileSync','statSync','lstatSync','openSync','readdirSync','realpathSync'],old=Object.fromEntries(patched.map(k=>[k,filesystem.default[k]]));let accesses=0
 try{for(const k of patched)filesystem.default[k]=()=>{accesses++;throw Error('historical host filesystem must not be read')};syncBuiltinESMExports();validateT14Completion(original);assert.equal(accesses,0)}finally{for(const k of patched)filesystem.default[k]=old[k];syncBuiltinESMExports()}
 for(const mutate of [r=>r.extra=true,r=>r.boundedDocument.extra=r.boundedDocument.contracts,r=>delete r.boundedDocument.callbackPostChecks,r=>r.boundedDocument.contracts.bytes=0,r=>r.boundedDocument.rawAccounting.sha256='0'.repeat(64),r=>r.externalEvidence.pop(),r=>r.externalEvidence.push(r.externalEvidence[0]),r=>r.externalEvidence[0].bytes++,r=>r.externalEvidence[0].path='../escape',r=>r.installedUat.actualMain.platforms[0].joinProof=r.installedUat.candidate.platforms[0].joinProof,r=>r.preservation.protectedContentsRead=true,r=>r.preservation.allHashesVerified=false,r=>r.activeRuntime.gateRResult.extra=true]){
  const bad=structuredClone(original);mutate(bad);assert.throws(()=>validateT14Completion(bad),TypeError)
 }
 const observed=digests(original);observed[original.externalEvidence[0].id].sha256='0'.repeat(64);assert.throws(()=>validateCompletionObservation(original,{programIndex:buildProgramIndex(),evidenceDigests:observed}),TypeError)
})

test('t14_completion_literal_lf_survives_autocrlf_checkout',async()=>{
 validateCompletionObservation(t14Completion(),{programIndex:buildProgramIndex(),evidenceDigests:digests(t14Completion())})
 const {mkdtempSync,realpathSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync}=await import('node:child_process'),root=fileURLToPath(new URL('../../../',import.meta.url)),temp=mkdtempSync(join(realpathSync(tmpdir()),'t14-completion-lf-')),relative='docs/release-evidence/proc-t14-bounded-doc-completion-2026-10-24.json'
 execFileSync('git',['-c','core.autocrlf=true','checkout-index','--prefix='+temp.replaceAll('\\','/')+'/','--',relative],{cwd:root,windowsHide:true,maxBuffer:8*1024*1024});const checked=readFileSync(join(temp,relative)),indexed=execFileSync('git',['show',':'+relative],{cwd:root,windowsHide:true,maxBuffer:8*1024*1024});assert.ok(checked.equals(indexed));assert.equal(checked.at(-1),10);assert.equal(checked.includes(13),false)
})
