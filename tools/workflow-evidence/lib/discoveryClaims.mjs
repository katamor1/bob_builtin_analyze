import path from 'node:path';
import {createRequire} from 'node:module';
import {snapshotClosedData,portablePath,portableFold,compareCodeUnits,reject,WorkflowEvidenceError} from './primitives.mjs';
const require=createRequire(import.meta.url),{parseStrictJson}=require('../../../extensions/workflow-register/out/core/contractV2/packageLoaderInput.js'),{readInstalledContributionOwner}=require('../../../extensions/workflow-register/out/core/contributionManifest.js');
const invalid=()=>reject('evidence.claims.invalid');
function exact(value,keys){if(value===null||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))invalid();return value;}
function list(value){if(!Array.isArray(value)||value.length>20000)invalid();return value;}
function prefix(value){if(typeof value!=='string'||!value.endsWith('/'))invalid();return portablePath(value,{directory:true})+'/';}
function id(value){if(typeof value!=='string'||value.length>128||!/^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u.test(value))invalid();return value;}

export function parseDiscoveryClaims(bytes,expectedOwner){
 try{
  const owner=snapshotClosedData(expectedOwner);exact(owner,['id','version']);readInstalledContributionOwner({...owner,extensionRoot:path.resolve('.')});
  const data=snapshotClosedData(parseStrictJson(bytes,'Discovery claims'));exact(data,['schemaVersion','owner','scopes','exclusions','externalCommands','mirrors']);exact(data.owner,['id','version']);
  if(data.schemaVersion!=='workflow-discovery-claims/v1'||data.owner.id!==owner.id||data.owner.version!==owner.version)invalid();
  const scopes=list(data.scopes).map(raw=>{exact(raw,['prefix','role']);if(!['template','sample','fixture'].includes(raw.role))invalid();return{prefix:prefix(raw.prefix),role:raw.role};}).sort((a,b)=>compareCodeUnits(a.prefix,b.prefix));
  const foldedScopes=scopes.map(s=>portableFold(s.prefix)).sort(compareCodeUnits);
  for(let i=1;i<foldedScopes.length;i++)if(foldedScopes[i].startsWith(foldedScopes[i-1]))invalid();
  const exclusions=list(data.exclusions).map(raw=>{exact(raw,['path','reason']);if(!['negative_fixture','compatibility_fixture','non_published_example'].includes(raw.reason))invalid();const p=portablePath(raw.path);if(scopes.some(s=>p.startsWith(s.prefix)))invalid();return{path:p,reason:raw.reason};}).sort((a,b)=>compareCodeUnits(a.path,b.path));
  const externalCommands=list(data.externalCommands).map(raw=>{exact(raw,['id','scope']);const scope=prefix(raw.scope);if(!scopes.some(s=>s.prefix===scope))invalid();return{id:id(raw.id),scope};}).sort((a,b)=>compareCodeUnits(a.scope+'\0'+a.id,b.scope+'\0'+b.id));
  const mirrors=list(data.mirrors).map(raw=>{exact(raw,['source','destination']);return{source:portablePath(raw.source),destination:portablePath(raw.destination)};}).sort((a,b)=>compareCodeUnits(a.destination,b.destination));
  for(const [rows,key]of [[exclusions,x=>portableFold(x.path)],[externalCommands,x=>x.scope+'\0'+x.id],[mirrors,x=>portableFold(x.destination)]]){const seen=new Set();for(const row of rows){const value=key(row);if(seen.has(value))invalid();seen.add(value);}}
  return snapshotClosedData({schemaVersion:data.schemaVersion,owner:{id:owner.id,version:owner.version},scopes,exclusions,externalCommands,mirrors});
 }catch(error){if(error instanceof WorkflowEvidenceError)throw error;invalid();}
}
