import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {validateCompletionObservation, projectIntegrationStatus, deriveNextSlice, validateWorkspaceDisposition} from '../featureIntegrationStatusPolicy.mjs'
import {buildProgramIndex} from '../featureIntegrationProgramPolicy.mjs'
import {digest} from '../featureSelectionSourcePolicy.mjs'
const json=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)))
const completion=()=>json('../../../docs/release-evidence/wave0a-completion-2026-10-01.json')
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
  ['../create-feature-integration-status.mjs','../../../docs/release-evidence/wave0a-completion-2026-10-01.json']
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
