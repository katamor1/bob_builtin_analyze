import { buildProgramIndex, canonicalJson, validateProgramIndex } from './featureIntegrationProgramPolicy.mjs'
import { digest, exactKeys, same } from './featureSelectionSourcePolicy.mjs'

const COMPLETION_SHA256 = '440528d404edf754f0480306526307088054dee7d1b72506370d8c22872cc99b'
const EVIDENCE_REGISTRY_SHA256 = '00cb4ee6fcc2504808e1ac9c8f7f835c4b22fc6c0e4b213d9be14ecd7064cd1e'
const LEDGER_SHA256 = 'e7603655a9f356d36938fc6d722061aa9a616fcfd8258bde05ad6c30ac9ae894'
const DECISIONS_SHA256 = 'f84cba62c8a7aa29ca5bac8eea95d1004e7274dc447df00465d985ca1dfc300f'
const COMPLETION_REFERENCE = Object.freeze({boundaryId:'WAVE-0A-CONTROL-PLANE',sha256:COMPLETION_SHA256,state:'VERIFIED',acceptedMainSha:'ec136225bf2737a2f2c8053dce69d3acb6f4be3d'})
const COMPLETION_REGISTRY = Object.freeze([
  Object.freeze({sha256:COMPLETION_SHA256,evidenceSha256:EVIDENCE_REGISTRY_SHA256,reference:COMPLETION_REFERENCE}),
  Object.freeze({sha256:'df2f2dbfeef64c65fafcf9834998c914949b5c19ba539dccd8dfcd8dac9a91ae',evidenceSha256:'54e570330a0a679c1a11f6216747ff235cf6d282989efd561952657819c06f85',reference:Object.freeze({boundaryId:'WAVE-0B-SELECTION-LEDGER',sha256:'df2f2dbfeef64c65fafcf9834998c914949b5c19ba539dccd8dfcd8dac9a91ae',state:'VERIFIED',acceptedMainSha:'b8876b2714d74bd8bbe686b66d17f2f76467f041'})}),
  Object.freeze({sha256:'4f8918d53d3d98c207d3f63e531d5812e89c4f2c5a1ea21cae23148c6c727b03',evidenceSha256:'b8296cd07bd1c4693d103001aacf16c41cd420bb97ff800a39f8568c707c8fe5',reference:Object.freeze({boundaryId:'WF2-P4-COMPILER',sha256:'4f8918d53d3d98c207d3f63e531d5812e89c4f2c5a1ea21cae23148c6c727b03',state:'VERIFIED',acceptedMainSha:'925c50f10e114ac5613135dab7b7439ab3dba0de'})})
])
const hashes = record => Object.fromEntries(record.externalEvidence.map(row=>[row.id,{bytes:row.bytes,sha256:row.sha256}]))
const gitSha = value => {if(typeof value!=='string'||!/^[a-f0-9]{40}$/.test(value))throw new TypeError('invalid Git identity')}
const hash256 = value => {if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new TypeError('invalid evidence digest')}

export function validateCompletionObservation(record,{programIndex,evidenceDigests}) {
  validateProgramIndex(programIndex)
  // This is a read-only recovery import, pinned after actual CI/log/archive/ref
  // readback. A new completion needs an additive reviewed registry entry.
  const recordDigest=digest(record)
  const registration=COMPLETION_REGISTRY.find(entry=>entry.sha256===recordDigest)
  if(!registration) throw new TypeError('unregistered completion observation')
  if(digest(evidenceDigests)!==registration.evidenceSha256) throw new TypeError('actual evidence digest registry mismatch')
  same(hashes(record),evidenceDigests,'completion evidence binding')
  if(record.mutationAuthority!==false||record.repository!==programIndex.repository||record.boundaryId!==registration.reference.boundaryId) throw new TypeError('completion subject mismatch')
}

function projectReferences(programIndex,decisions,completionReferences) {
  if(digest(decisions)!==DECISIONS_SHA256) throw new TypeError('static capability decision partition mismatch')
  if(!Array.isArray(completionReferences)||completionReferences.length>COMPLETION_REGISTRY.length) throw new TypeError('unregistered or duplicate completion')
  completionReferences.forEach((reference,index)=>same(reference,COMPLETION_REGISTRY[index].reference,'registered completion prefix'))
  const verifiedIds=new Set(completionReferences.map(reference=>reference.boundaryId))
  const wave0aVerified=verifiedIds.has('WAVE-0A-CONTROL-PLANE')
  return {schemaVersion:'bob-builtin-analyze/feature-integration-status/v1',programIndexSha256:digest(programIndex),selectionLedgerSha256:LEDGER_SHA256,completionReferences:structuredClone(completionReferences),acceptedMainSha:completionReferences.at(-1)?.acceptedMainSha??null,boundaries:programIndex.planBoundaries.map(boundary=>({id:boundary.id,state:verifiedIds.has(boundary.id)?'VERIFIED':'planned'})),slices:programIndex.programAtomicSlices.map(slice=>({sliceId:slice.sliceId,ordinal:slice.ordinal,boundaryId:slice.boundaryId,state:verifiedIds.has(slice.sliceId)?'VERIFIED':'planned',observedActivationStatus:'inactive',immediatePredecessor:structuredClone(slice.immediatePredecessor)})),capabilities:decisions.map(cap=>({...cap,executionState:verifiedIds.has(cap.id)?'VERIFIED':cap.disposition==='selected'||cap.disposition==='conditional'?'planned':'not_applicable',observedActivationStatus:'inactive'})),gateP:structuredClone(programIndex.downstreamProtocolPolicy.gateP),activeSliceIds:[],nextSliceId:wave0aVerified?programIndex.programAtomicSlices.find(slice=>!verifiedIds.has(slice.sliceId))?.sliceId??null:null,automaticCleanup:false,mutationAuthority:false,limits:'Historical observation only. Local implementation is not VERIFIED. Descriptor derivation is not human approval or execution permission.'}
}

export function projectIntegrationStatus(inputs) {
  exactKeys(inputs,['programIndex','ledger','completionObservations'],'projection inputs')
  const {programIndex,ledger,completionObservations}=inputs
  validateProgramIndex(programIndex)
  if(digest(ledger)!==LEDGER_SHA256) throw new TypeError('reviewed static ledger mismatch')
  if(!Array.isArray(completionObservations)||completionObservations.length>COMPLETION_REGISTRY.length) throw new TypeError('unregistered completion collection')
  const references=completionObservations.map(record=>{
    validateCompletionObservation(record,{programIndex,evidenceDigests:hashes(record)})
    return {...COMPLETION_REGISTRY.find(entry=>entry.sha256===digest(record)).reference}
  })
  return projectReferences(programIndex,ledger.capabilities.map(cap=>({id:cap.id,disposition:cap.disposition})),references)
}

export function deriveNextSlice(inputs) {
  exactKeys(inputs,['programIndex','statusProjection'],'slice admission inputs')
  const {programIndex,statusProjection}=inputs
  validateProgramIndex(programIndex)
  const decisions=statusProjection.capabilities.map(cap=>({id:cap.id,disposition:cap.disposition}))
  same(statusProjection,projectReferences(programIndex,decisions,statusProjection.completionReferences),'verified status projection')
  if(statusProjection.activeSliceIds.length) throw new TypeError('one active slice required')
  const next=programIndex.programAtomicSlices.find(slice=>statusProjection.slices.find(row=>row.sliceId===slice.sliceId).state!=='VERIFIED')
  if(!next) return null
  const predecessor=next.immediatePredecessor
  const state=predecessor.kind==='boundary_terminal'?statusProjection.boundaries.find(row=>row.id===predecessor.id)?.state:statusProjection.slices.find(row=>row.sliceId===predecessor.id)?.state
  return state==='VERIFIED'?structuredClone(next):null
}

function normalizedPath(value) {
  if(typeof value!=='string'||!/^([A-Za-z]:[\\/]|\/)/.test(value)||/[\x00-\x1f]/.test(value)||value.split(/[\\/]/).includes('..')) throw new TypeError('absolute observed path required')
  const parts=value.replaceAll('\\','/').split('/')
  if(parts.some(part=>part==='.')||parts.slice(1,-1).some(part=>!part)||(/^[A-Za-z]:/.test(value)&&parts.slice(1).some(part=>/[. ]$/.test(part)))) throw new TypeError('canonical observed path required')
  return parts.join('/').replace(/\/+$/,'').toUpperCase()
}
// Pure consistency validation. It never verifies a live filesystem, admits a
// completion to the registry, performs cleanup, or grants the C approval needed
// for the observed destructive steps. Terminal authenticity is a separate gate.
export function validateWorkspaceDisposition(inputs) {
  exactKeys(inputs,['sliceDescriptor','terminalObservation','preservationObservation','decision'],'workspace disposition inputs')
  const {sliceDescriptor,terminalObservation:terminal,preservationObservation:observation,decision}=inputs
  const program=buildProgramIndex()
  const descriptor=program.programAtomicSlices.find(row=>row.sliceId===sliceDescriptor?.sliceId)
  if(!descriptor) throw new TypeError('catalog mutation slice required')
  same(sliceDescriptor,descriptor,'static slice descriptor')
  exactKeys(terminal,['schemaVersion','classification','mutationAuthority','sliceId','state','sourceHeadSha','acceptedMainSha','workspace','evidenceSha256'],'terminal observation')
  if(terminal.schemaVersion!=='bob-builtin-analyze/slice-terminal-observation/v1'||terminal.classification!=='repository_non_mutating_slice_terminal_completion_observation'||terminal.mutationAuthority!==false||terminal.state!=='VERIFIED'||terminal.sliceId!==descriptor.sliceId) throw new TypeError('verified terminal subject required')
  gitSha(terminal.sourceHeadSha);gitSha(terminal.acceptedMainSha);hash256(terminal.evidenceSha256)
  exactKeys(terminal.workspace,['path','branchRef'],'terminal workspace');normalizedPath(terminal.workspace.path)
  if(!/^refs\/heads\/codex\/[^\s]+$/.test(terminal.workspace.branchRef)) throw new TypeError('isolated local branch required')
  const baseKeys=['schemaVersion','sliceId','workspace','terminalObservationSha256','activeSliceIds','disposition']
  if(decision==='retain_same_workspace') exactKeys(observation,baseKeys,'retained workspace observation')
  else if(decision==='dispose_to_main_only') exactKeys(observation,[...baseKeys,'preservation','operations','worktreeRemoved','localRefDeleted','mainOnlyTopology'],'disposed workspace observation')
  else throw new TypeError('closed workspace disposition required')
  if(observation.schemaVersion!==program.downstreamProtocolPolicy.schemaVersions.workspaceDisposition||observation.sliceId!==descriptor.sliceId||observation.disposition!==decision||observation.terminalObservationSha256!==digest(terminal)) throw new TypeError('terminal binding mismatch')
  same(observation.workspace,terminal.workspace,'continuous workspace identity');same(observation.activeSliceIds,[],'one continuous slice workspace')
  if(decision==='retain_same_workspace') return
  const preserved=observation.preservation
  exactKeys(preserved,['externalRoot','manifestSha256','verifiedManifestSha256','fileCount','allHashesVerified'],'preservation observation')
  hash256(preserved.manifestSha256)
  const workspacePath=normalizedPath(terminal.workspace.path);const preservationPath=normalizedPath(preserved.externalRoot)
  if(preservationPath===workspacePath||preservationPath.startsWith(`${workspacePath}/`)||preserved.verifiedManifestSha256!==preserved.manifestSha256||!Number.isSafeInteger(preserved.fileCount)||preserved.fileCount<1||preserved.allHashesVerified!==true) throw new TypeError('verified external preservation required')
  same(observation.operations,program.downstreamProtocolPolicy.workspaceDisposition.disposalOrder,'ordered disposal observations')
  same(observation.worktreeRemoved,{path:terminal.workspace.path,expectedHeadSha:terminal.sourceHeadSha,present:false},'exact worktree observation')
  same(observation.localRefDeleted,{ref:terminal.workspace.branchRef,expectedHeadSha:terminal.sourceHeadSha,present:false},'exact local ref lease observation')
  const topology=observation.mainOnlyTopology
  exactKeys(topology,['mainSha','localBranches','worktreeCount','remoteBranches','openPrCount','retainedExceptions'],'main-only topology')
  if(topology.mainSha!==terminal.acceptedMainSha||topology.worktreeCount!==1||topology.openPrCount!==0) throw new TypeError('main-only readback required')
  same(topology.localBranches,['main'],'local main only');same(topology.remoteBranches,['main'],'remote main only')
  exactKeys(topology.retainedExceptions,['userData','nativeAppMetadataRefs','existingStash'],'protected exceptions')
  for(const values of Object.values(topology.retainedExceptions)) if(!Array.isArray(values)||values.some(value=>typeof value!=='string')) throw new TypeError('explicit retained exception inventory required')
}

export function renderIntegrationStatus(inputs) {return canonicalJson(projectIntegrationStatus(inputs))}
