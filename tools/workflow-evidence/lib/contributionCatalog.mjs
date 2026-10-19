import path from 'node:path';
import {createRequire} from 'node:module';
import {canonicalBytes,digestBytes,snapshotClosedData,portablePath,compareCodeUnits,reject,WorkflowEvidenceError} from './primitives.mjs';
import {requireSubjectState,bindSubjectResult,requireSubjectResult} from './subjectState.mjs';
import {parseDiscoveryClaims} from './discoveryClaims.mjs';
const require=createRequire(import.meta.url),{parseStrictJson}=require('../../../extensions/workflow-register/out/core/contractV2/packageLoaderInput.js'),{validateContributionManifest,parseContributionRegistryRange}=require('../../../extensions/workflow-register/out/core/contributionManifest.js');
const cache=new WeakMap(),invalid=()=>reject('evidence.catalog.invalid');
const binding=(p,b)=>({path:p,sha256:digestBytes(b),bytes:b.length});
function packageIdentity(value){
 if(value===null||typeof value!=='object'||typeof value.publisher!=='string'||typeof value.name!=='string'||typeof value.version!=='string')invalid();
 if(Object.hasOwn(value,'contributes')&&(value.contributes===null||typeof value.contributes!=='object'||Array.isArray(value.contributes)))invalid();
 const commands=value.contributes&&Object.hasOwn(value.contributes,'commands')?value.contributes.commands:[];if(!Array.isArray(commands)||commands.length>20000)invalid();const seen=new Set();
 for(const row of commands){const id=row?.command;if(typeof id!=='string'||!id||Buffer.byteLength(id)>1024||/[\u0000-\u0020\u007f-\u009f]/u.test(id)||seen.has(id))invalid();seen.add(id);}
 return{owner:{id:value.publisher+'.'+value.name,version:value.version},commands:[...seen].sort(compareCodeUnits)};
}
function parse(bytes){try{return snapshotClosedData(parseStrictJson(bytes,'Contribution payload'));}catch{invalid();}}

export function buildWorkflowContributionCatalog(subject){
 const state=requireSubjectState(subject);if(cache.has(subject))return cache.get(subject);
 try{
  const sourceByOwner=new Map();
  for(const source of state.git.owners){const pkg=packageIdentity(state.git.readJson(source.packagePath));if(sourceByOwner.has(pkg.owner.id))invalid();sourceByOwner.set(pkg.owner.id,{...source,pkg});}
  const seenOwners=new Set(),seenIds=new Set(),seenVersions=new Set(),seenCommands=new Set(),seenMirrors=new Set(),owners=[];let minimum=null,maximum=null,totalDeclarations=0;
  for(const captured of state.vsix){
   const archive=captured.archive,packagePath='extension/package.json',packageBytes=archive.readEntry(packagePath),pkg=packageIdentity(parse(packageBytes)),source=sourceByOwner.get(pkg.owner.id);
   if(!source||seenOwners.has(pkg.owner.id)||source.pkg.owner.version!==pkg.owner.version||JSON.stringify(source.pkg.commands)!==JSON.stringify(pkg.commands))invalid();seenOwners.add(pkg.owner.id);
   for(const command of pkg.commands){if(seenCommands.has(command))invalid();seenCommands.add(command);}
   const manifestPath='extension/contracts/workflow-contributions.json',claimsPath='extension/contracts/workflow-discovery-claims.json',manifestBytes=archive.readEntry(manifestPath),claimsBytes=archive.readEntry(claimsPath);
   const sourceManifest=state.git.readBlob(source.manifestPath),sourceClaims=state.git.readBlob(source.claimsPath);if(!manifestBytes.equals(sourceManifest)||!claimsBytes.equals(sourceClaims))invalid();
   const manifest=validateContributionManifest(parse(manifestBytes),{...pkg.owner,extensionRoot:path.resolve(source.ownerDirectory)}),claims=parseDiscoveryClaims(claimsBytes,pkg.owner),range=parseContributionRegistryRange(manifest.registry_api);
   minimum=minimum===null||range.min>minimum?range.min:minimum;maximum=maximum===null||range.max<maximum?range.max:maximum;if(minimum>maximum)invalid();
   const paths=new Set(),declarations=[],assets=[];
   for(const kind of ['action_providers','preflight_checks','result_sinks','workflow_templates','schemas','agent_provider'])for(const row of kind==='agent_provider'?(manifest.agent_provider?[manifest.agent_provider]:[]):manifest[kind]){
    if(++totalDeclarations>20000)reject('evidence.limit.exceeded');const id=row.id??row.type;if(seenIds.has(id))invalid();seenIds.add(id);
    if('path'in row){const relative=portablePath(row.path);if(paths.has(relative))invalid();paths.add(relative);const bytes=archive.readEntry('extension/'+relative),gitBytes=state.git.readBlob(source.ownerDirectory+'/'+relative);if(!bytes.equals(gitBytes))invalid();assets.push({kind,id,path:relative,bytes:bytes.length,sha256:digestBytes(bytes)});declarations.push({kind,id,path:relative});}
    else{if(seenVersions.has(row.contract_version))invalid();seenVersions.add(row.contract_version);declarations.push({kind,id,contractVersion:row.contract_version});}
   }
   for(const scope of claims.scopes)if(!state.git.metadata.some(row=>row.path.startsWith(source.ownerDirectory+'/'+scope.prefix)))invalid();
   for(const excluded of claims.exclusions){const p=source.ownerDirectory+'/'+excluded.path;if(!state.git.metadata.some(row=>row.path===p&&row.type==='blob'&&['100644','100755'].includes(row.mode))||!/(?:^|\/)(?:WORKFLOW\.md|workflow\.yaml|current\.json)$/.test(p))invalid();}
   for(const mirror of claims.mirrors){if(!paths.has(mirror.source)||seenMirrors.has(mirror.destination)||[...sourceByOwner.values()].some(other=>other.ownerDirectory!==source.ownerDirectory&&mirror.destination.startsWith(other.ownerDirectory+'/')))invalid();seenMirrors.add(mirror.destination);const bytes=archive.readEntry('extension/'+mirror.source),sourceBytes=state.git.readBlob(source.ownerDirectory+'/'+mirror.source),destination=state.git.readBlob(mirror.destination);if(!bytes.equals(sourceBytes)||!bytes.equals(destination))invalid();}
   owners.push({owner:{id:pkg.owner.id,version:pkg.owner.version},ownerDirectory:source.ownerDirectory,archive:{sha256:captured.sha256,bytes:captured.bytes},package:{source:binding(source.packagePath,state.git.readBlob(source.packagePath)),vsix:binding(packagePath,packageBytes)},manifest:{source:binding(source.manifestPath,sourceManifest),vsix:binding(manifestPath,manifestBytes)},claims:{source:binding(source.claimsPath,sourceClaims),vsix:binding(claimsPath,claimsBytes)},registryApi:{min:manifest.registry_api.min,max:manifest.registry_api.max},commands:pkg.commands,declarations:declarations.sort((a,b)=>compareCodeUnits(a.kind+'\0'+a.id,b.kind+'\0'+b.id)),assets:assets.sort((a,b)=>compareCodeUnits(a.path,b.path))});
  }
  if(owners.length!==state.git.owners.length)invalid();
  const result=snapshotClosedData({schemaVersion:'workflow-discovery-catalog/v1',sourceTreeSha:state.git.treeSha,owners:owners.sort((a,b)=>compareCodeUnits(a.owner.id,b.owner.id))});
  canonicalBytes(result);bindSubjectResult(subject,'catalog',result);cache.set(subject,result);return result;
 }catch(error){if(error instanceof WorkflowEvidenceError)throw error;invalid();}
}

export function contributionCatalogDigests(subject,catalog){
 const state=requireSubjectState(subject);requireSubjectResult(subject,'catalog',catalog);
 const semantic={sourceTreeSha:catalog.sourceTreeSha,owners:catalog.owners.map(({archive,...owner})=>owner)};
 const subjectIdentity={sourceTreeSha:catalog.sourceTreeSha,vsix:catalog.owners.map(row=>({owner:row.owner.id,version:row.owner.version,sha256:row.archive.sha256,bytes:row.archive.bytes})),providerSourceDigest:digestBytes(state.git.readBlob(state.providerCatalogPath)),collectionsDigest:digestBytes(state.git.readBlob(state.collectionsPath))};
 return Object.freeze({catalogDigest:digestBytes(canonicalBytes(catalog)),semanticCatalogDigest:digestBytes(canonicalBytes(semantic)),subjectDigest:digestBytes(canonicalBytes(subjectIdentity))});
}
