import {createRequire} from 'node:module';
import {digestBytes,reject,WorkflowEvidenceError} from './primitives.mjs';
import {requireSubjectState,requireSubjectResult,bindSubjectResult} from './subjectState.mjs';
import {createSnapshotPackageFileSystem} from './snapshotPackageFileSystem.mjs';
const require=createRequire(import.meta.url);
const {createWorkflowContractV2EvidenceEnvironmentFromBytes,readWorkflowContractV2CollectionsFromBytes}=require('../../../extensions/workflow-register/scripts/lib/workflow-contract-v2-environment.js');
const {normalizeCollections,normalizeSlotNames}=require('../../../extensions/workflow-register/scripts/compile-workflow-contract-v2-packages.js');
const {createWorkflowPackageRoot}=require('../../../extensions/workflow-register/out/core/contractV2/packageRoot.js'),{loadCurrentWorkflowPackage}=require('../../../extensions/workflow-register/out/core/contractV2/packageLoader.js');
const {compileWorkflowPackage}=require('../../../extensions/workflow-register/out/core/contractV2/compiler.js'),{requireCompiledWorkflowPlanState}=require('../../../extensions/workflow-register/out/core/contractV2/compiledPlan.js'),{requireWorkflowCompilerEnvironmentState}=require('../../../extensions/workflow-register/out/core/contractV2/compilerEnvironment.js');
const {createCompiledWorkflowPlanManifestPackage,createCompiledWorkflowPlanManifest,encodeCompiledWorkflowPlanManifest}=require('../../../extensions/workflow-register/out/core/contractV2/compiledPlanManifest.js'),{canonicalJsonDigest}=require('../../../extensions/workflow-register/out/core/contractV2/canonicalJson.js');
const pending=new WeakMap(),compiledStates=new WeakMap();

function ownedEnvironmentDigest(environment){
 const state=requireWorkflowCompilerEnvironmentState(environment);if(state.purpose!=='evidence'||state.leaseable)reject('evidence.compile.invalid');
 return canonicalJsonDigest({schemaVersion:'workflow-compiler-environment-evidence/v1',purpose:state.purpose,providerCatalog:state.providerCatalog.evidence,bobProfile:state.bobProfile});
}

export function assertCompiledWorkflowEvidence(subject,compiled){
 const source=requireSubjectState(subject);requireSubjectResult(subject,'compiled',compiled);const state=compiledStates.get(compiled);if(!state||state.subject!==subject)reject('evidence.compile.invalid');
 const environment=requireWorkflowCompilerEnvironmentState(state.environment);if(environment.purpose!=='evidence'||environment.leaseable)reject('evidence.compile.invalid');
 for(const handle of state.handles){const native=requireCompiledWorkflowPlanState(handle);if(native.purpose!=='evidence'||native.leaseable||native.publication!=='published'||native.environmentIdentity!==environment.identity)reject('evidence.compile.invalid');}
 if(state.handles.length!==compiled.packages.length||digestBytes(encodeCompiledWorkflowPlanManifest(compiled.manifest))!==compiled.manifestDigest||ownedEnvironmentDigest(state.environment)!==compiled.environmentDigest||digestBytes(source.git.readBlob(source.providerCatalogPath))!==compiled.providerSourceDigest)reject('evidence.compile.invalid');
}

async function compileCaptured(subject,discovery){
 try{
  const state=requireSubjectState(subject),providerBytes=state.git.readBlob(state.providerCatalogPath),environment=createWorkflowContractV2EvidenceEnvironmentFromBytes({providerCatalogBytes:providerBytes}),collections=normalizeCollections(readWorkflowContractV2CollectionsFromBytes({collectionsBytes:state.git.readBlob(state.collectionsPath)})),fileSystem=createSnapshotPackageFileSystem(subject),packages=[],handles=[];
  for(const collection of collections){
   if((await fileSystem.lstat(collection,[])).kind!=='directory')reject('evidence.compile.invalid');const collectionRoot=createWorkflowPackageRoot(fileSystem,collection);
   const candidates=discovery.candidates.filter(row=>row.classification==='published_v2'&&row.path.startsWith(collection+'/')&&row.path.slice(collection.length+1).split('/').length===2),slots=normalizeSlotNames(candidates.map(row=>row.path.slice(collection.length+1).split('/')[0]));
   for(const slot of slots){
    if(packages.length>=4096)reject('evidence.limit.exceeded');const rawPackage=await loadCurrentWorkflowPackage({fileSystem,collectionRoot,workflowId:slot}),compiled=compileWorkflowPackage({rawPackage,environment});
    if(!compiled.ok)throw new WorkflowEvidenceError('evidence.compile.failed',compiled.diagnostics.map(row=>({code:row.code,path:collection+'/'+slot,message:'Captured package did not pass the existing P4 compiler.'})));
    handles.push(compiled.handle);packages.push(createCompiledWorkflowPlanManifestPackage({collection,slot,generation:rawPackage.generation,handle:compiled.handle}));
   }
  }
  const manifest=createCompiledWorkflowPlanManifest({packages}),manifestBytes=encodeCompiledWorkflowPlanManifest(manifest),result=Object.freeze({manifest,packages:manifest.packages,providerSourceDigest:digestBytes(providerBytes),environmentDigest:ownedEnvironmentDigest(environment),manifestDigest:digestBytes(manifestBytes)});
  compiledStates.set(result,Object.freeze({subject,environment,handles:Object.freeze(handles)}));bindSubjectResult(subject,'compiled',result);assertCompiledWorkflowEvidence(subject,result);return result;
 }catch(error){if(error instanceof WorkflowEvidenceError)throw error;throw new WorkflowEvidenceError('evidence.compile.failed');}
}

export async function compileWorkflowEvidence(subject,discovery){
 requireSubjectState(subject);requireSubjectResult(subject,'discovery',discovery);if(discovery.coverage.unclassified||discovery.coverage.ambiguous)reject('evidence.compile.invalid');
 if(!pending.has(subject))pending.set(subject,compileCaptured(subject,discovery));return pending.get(subject);
}
