import {createRequire} from 'node:module';
import {LIMITS,compareCodeUnits,digestBytes,snapshotClosedData,canonicalBytes,reject,WorkflowEvidenceError} from './primitives.mjs';
import {requireSubjectState,requireSubjectResult,bindSubjectResult} from './subjectState.mjs';
const require=createRequire(import.meta.url),{workflowPackageGenerationDirectoryName}=require('../../../extensions/workflow-register/out/core/contractV2/packageGenerationPath.js');
const cache=new WeakMap(),candidatePath=p=>/(?:^|\/)(?:WORKFLOW\.md|workflow\.yaml|current\.json)$/.test(p);

export function discoverTrackedWorkflows(subject,catalog){
 const state=requireSubjectState(subject);requireSubjectResult(subject,'catalog',catalog);if(cache.has(subject))return cache.get(subject);
 const git=state.git,metadata=new Map(git.metadata.map(row=>[row.path,row])),owners=catalog.owners.map(owner=>({owner,claims:git.readJson(owner.claims.source.path)})),candidates=new Set(),publications=new Map(),consumed=new Set();
 for(const row of git.metadata)if(candidatePath(row.path)&&owners.some(({owner})=>row.path.startsWith(owner.ownerDirectory+'/')))candidates.add(row.path);
 for(const {claims}of owners)for(const mirror of claims.mirrors)if(candidatePath(mirror.destination))candidates.add(mirror.destination);
 if(candidates.size>LIMITS.rows)reject('evidence.limit.exceeded');
 const collections=git.readJson(state.collectionsPath).collections;
 for(const collection of collections)for(const row of git.metadata){
  if(!row.path.startsWith(collection+'/')||!row.path.endsWith('/current.json'))continue;
  const remainder=row.path.slice(collection.length+1),segments=remainder.split('/');if(segments.length!==2)continue;
  candidates.add(row.path);if(candidates.size>LIMITS.rows)reject('evidence.limit.exceeded');
  const pointer=git.readJson(row.path),keys=pointer&&typeof pointer==='object'&&!Array.isArray(pointer)?Object.keys(pointer).sort().join(','):'';
  let workflowPath;
  if(keys==='generation,packageDigest,schemaVersion,workflowId'&&pointer.schemaVersion==='workflow-package-pointer/v1'&&pointer.workflowId===segments[0]&&/^sha256:[0-9a-f]{64}$/.test(pointer.generation)&&pointer.generation===pointer.packageDigest)workflowPath=collection+'/'+segments[0]+'/versions/'+workflowPackageGenerationDirectoryName(pointer.generation)+'/workflow.yaml';
  const valid=workflowPath&&metadata.has(workflowPath);publications.set(row.path,{valid,workflowPath});if(valid)consumed.add(workflowPath);
 }
 const rows=[],diagnostics=[];let classified=0,excluded=0;
 for(const candidate of [...candidates].sort(compareCodeUnits)){
  if(consumed.has(candidate))continue;
  const contexts=new Map();
  const add=(owner,relative,claims)=>{
   for(const scope of claims.scopes)if(relative.startsWith(scope.prefix))contexts.set(owner.owner.id+'\0'+scope.role,{owner:owner.owner.id,role:scope.role,reason:null});
   for(const exclusion of claims.exclusions)if(relative===exclusion.path)contexts.set(owner.owner.id+'\0'+exclusion.reason,{owner:owner.owner.id,role:null,reason:exclusion.reason});
  };
  for(const {owner,claims}of owners){if(candidate.startsWith(owner.ownerDirectory+'/'))add(owner,candidate.slice(owner.ownerDirectory.length+1),claims);for(const mirror of claims.mirrors)if(mirror.destination===candidate)add(owner,mirror.source,claims);}
  let code;
  if(contexts.size!==1)code=contexts.size?'evidence.discovery.ambiguous':'evidence.discovery.unclassified';
  const context=[...contexts.values()][0],publication=publications.get(candidate);
  if(publication&&!publication.valid)code='evidence.discovery.unclassified';
  if(context&&context.role!=='template'&&owners.some(({owner})=>owner.assets.some(asset=>asset.kind==='workflow_templates'&&owner.ownerDirectory+'/'+asset.path===candidate)))code='evidence.discovery.unclassified';
  if(code){if(diagnostics.length>=LIMITS.diagnosticRows)reject('evidence.limit.exceeded');diagnostics.push({code,path:candidate,message:'Tracked workflow has no single complete contribution classification.'});continue;}
  const bytes=git.readBlob(candidate),classification=context.reason?(context.reason==='negative_fixture'?'negative_fixture':'excluded'):candidate.endsWith('/WORKFLOW.md')?'inventory_only':publication?'published_v2':'unselected_v2';
  if(context.reason)excluded++;else classified++;
  rows.push({owner:context.owner,path:candidate,role:context.role,classification,sha256:digestBytes(bytes),bytes:bytes.length});
 }
 if(diagnostics.length)throw new WorkflowEvidenceError(diagnostics.some(row=>row.code==='evidence.discovery.ambiguous')?'evidence.discovery.ambiguous':'evidence.discovery.unclassified',diagnostics);
 const result=snapshotClosedData({schemaVersion:'workflow-tracked-discovery/v1',sourceTreeSha:git.treeSha,candidates:rows,coverage:{total:rows.length,classified,excluded,unclassified:0,ambiguous:0},diagnostics:[]});
 canonicalBytes(result);bindSubjectResult(subject,'discovery',result);cache.set(subject,result);return result;
}
