import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {LIMITS,decodeUtf8,portablePath,portableFold,compareCodeUnits,snapshotClosedData,reject,WorkflowEvidenceError} from './primitives.mjs';
const require=createRequire(import.meta.url);
const {parseStrictJson}=require('../../../extensions/workflow-register/out/core/contractV2/packageLoaderInput.js');

/** Bounded Git plumbing only: no shell, filters, worktree scans, or replacement objects. */
export function runGit(repositoryRoot,args,{input,maxBytes=LIMITS.gitMetadataBytes}={}){
 return new Promise((resolve,rejectPromise)=>{
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')));env.GIT_NO_REPLACE_OBJECTS='1';env.GIT_TERMINAL_PROMPT='0';env.GIT_OPTIONAL_LOCKS='0';
  const child=spawn('git',['--no-replace-objects',...args],{cwd:repositoryRoot,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const chunks=[];let size=0,stderr=0,failure;
  const stop=code=>{failure??=new WorkflowEvidenceError(code);child.kill();};
  const timeout=setTimeout(()=>stop('evidence.git.unavailable'),60000);timeout.unref();
  child.stdout.on('data',b=>{size+=b.length;if(size>maxBytes)stop('evidence.limit.exceeded');else chunks.push(b);});
  child.stderr.on('data',b=>{stderr+=b.length;if(stderr>1024*1024)stop('evidence.limit.exceeded');});
  child.on('error',()=>{failure??=new WorkflowEvidenceError('evidence.git.unavailable');});
  child.stdin.on('error',()=>{failure??=new WorkflowEvidenceError('evidence.git.unavailable');});
  child.on('close',code=>{clearTimeout(timeout);if(failure)return rejectPromise(failure);if(code!==0)return rejectPromise(new WorkflowEvidenceError('evidence.git.invalid'));resolve(Buffer.concat(chunks));});
  child.stdin.end(input);
 });
}

export function parseGitTreeMetadata(bytes){
 if(bytes.length>LIMITS.gitMetadataBytes)reject('evidence.limit.exceeded');
 const rows=[];let start=0;
 while(start<bytes.length){
  if(rows.length>=LIMITS.gitRows)reject('evidence.limit.exceeded');
  const end=bytes.indexOf(0,start);if(end<0)reject('evidence.git.invalid');const tab=bytes.indexOf(9,start);if(tab<0||tab>end)reject('evidence.git.invalid');
  const header=bytes.subarray(start,tab).toString('ascii'),match=/^(100644|100755|120000|160000) (blob|commit) ([0-9a-f]{40})$/.exec(header);
  if(!match)reject('evidence.git.invalid');const name=decodeUtf8(bytes.subarray(tab+1,end));if(!name)reject('evidence.git.invalid');
  rows.push(Object.freeze({path:name,mode:match[1],type:match[2],blobSha:match[3]}));start=end+1;
 }
 return Object.freeze(rows);
}

export async function captureGitTree({repositoryRoot,commitSha,controlPaths}){
 if(typeof commitSha!=='string'||!/^[0-9a-f]{40}$/.test(commitSha))reject('evidence.subject.invalid');
 const root=await fs.realpath(repositoryRoot);
 if((await runGit(root,['cat-file','-t',commitSha],{maxBytes:128})).toString().trim()!=='commit')reject('evidence.subject.invalid');
 const treeSha=(await runGit(root,['rev-parse','--verify',`${commitSha}^{tree}`],{maxBytes:128})).toString().trim();if(!/^[0-9a-f]{40}$/.test(treeSha))reject('evidence.git.invalid');
 const metadata=parseGitTreeMetadata(await runGit(root,['ls-tree','-rz','--full-tree',treeSha]));
 const byPath=new Map();for(const row of metadata){if(byPath.has(row.path))reject('evidence.git.invalid');byPath.set(row.path,row);}
 const contents=new Map(),json=new Map(),folded=new Map(),objectBytes=new Map();let capturedBytes=0;
 const select=relative=>{
  portablePath(relative);const row=byPath.get(relative);if(!row||row.type!=='blob'||!['100644','100755'].includes(row.mode))reject('evidence.path.invalid');
  const parts=relative.split('/');for(let i=1;i<=parts.length;i++){const prefix=parts.slice(0,i).join('/'),key=portableFold(prefix),prior=folded.get(key);if(prior&&prior!==prefix)reject('evidence.path.invalid');folded.set(key,prefix);}return row;
 };
 const readPaths=async paths=>{
  const requested=[...new Set(paths)].filter(p=>!contents.has(p));if(!requested.length)return;
  const rows=requested.map(select),oids=[...new Set(rows.map(r=>r.blobSha))];
  const headers=(await runGit(root,['cat-file','--batch-check'],{input:oids.join('\n')+'\n',maxBytes:oids.length*100+1})).toString('ascii').trim().split('\n');
  if(headers.length!==oids.length)reject('evidence.git.invalid');const sizes=new Map();
  for(let i=0;i<headers.length;i++){const m=/^([0-9a-f]{40}) blob ([0-9]+)$/.exec(headers[i]);if(!m||m[1]!==oids[i])reject('evidence.git.invalid');const size=Number(m[2]);if(!Number.isSafeInteger(size)||size>LIMITS.blobBytes)reject('evidence.limit.exceeded');sizes.set(m[1],size);}
  for(const row of rows){capturedBytes+=sizes.get(row.blobSha);if(capturedBytes>LIMITS.totalBlobBytes)reject('evidence.limit.exceeded');}
  const missing=oids.filter(oid=>!objectBytes.has(oid));
  if(missing.length){
   const response=await runGit(root,['cat-file','--batch'],{input:missing.join('\n')+'\n',maxBytes:missing.reduce((n,oid)=>n+sizes.get(oid)+100,0)});let offset=0;
   for(const oid of missing){const end=response.indexOf(10,offset);if(end<0)reject('evidence.git.invalid');const expected=`${oid} blob ${sizes.get(oid)}`;if(response.subarray(offset,end).toString('ascii')!==expected)reject('evidence.git.invalid');const start=end+1,finish=start+sizes.get(oid);if(finish>=response.length||response[finish]!==10)reject('evidence.git.invalid');const bytes=Buffer.from(response.subarray(start,finish));if(createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex')!==oid)reject('evidence.git.invalid');objectBytes.set(oid,bytes);offset=finish+1;}
   if(offset!==response.length)reject('evidence.git.invalid');
  }
  for(const row of rows)contents.set(row.path,objectBytes.get(row.blobSha));
 };
 const readJson=relative=>{
  if(!contents.has(relative))reject('evidence.subject.invalid');
  if(!json.has(relative)){let parsed;try{parsed=parseStrictJson(contents.get(relative),'Evidence control');}catch{reject('evidence.input.invalid');}json.set(relative,snapshotClosedData(parsed));}
  return json.get(relative);
 };
 if(!Array.isArray(controlPaths)||controlPaths.length!==2)reject('evidence.subject.invalid');
 const manifests=metadata.filter(r=>/^extensions\/[^/]+\/contracts\/workflow-contributions\.json$/.test(r.path)).map(r=>r.path);
 if(!manifests.length||manifests.length>LIMITS.rows)reject('evidence.subject.invalid');
 await readPaths([...manifests,...controlPaths]);const selected=new Set(),owners=[];
 for(const manifestPath of manifests){
  const ownerDirectory=manifestPath.slice(0,-'/contracts/workflow-contributions.json'.length),manifest=readJson(manifestPath),claimsPath=`${ownerDirectory}/contracts/workflow-discovery-claims.json`;
  owners.push(Object.freeze({ownerDirectory,manifestPath,claimsPath,packagePath:`${ownerDirectory}/package.json`}));selected.add(claimsPath);selected.add(`${ownerDirectory}/package.json`);
  for(const key of ['workflow_templates','schemas']){if(!Array.isArray(manifest[key]))reject();for(const declaration of manifest[key]){if(typeof declaration?.path!=='string')reject();selected.add(`${ownerDirectory}/${portablePath(declaration.path)}`);}}
 }
 await readPaths([...selected]);
 let candidates=0;
 for(const owner of owners){
  const claims=readJson(owner.claimsPath);if(!Array.isArray(claims.mirrors)||claims.mirrors.length>LIMITS.rows)reject();
  for(const mirror of claims.mirrors){if(typeof mirror?.source!=='string'||typeof mirror?.destination!=='string')reject();selected.add(`${owner.ownerDirectory}/${portablePath(mirror.source)}`);selected.add(portablePath(mirror.destination));}
  for(const row of metadata)if(row.path.startsWith(owner.ownerDirectory+'/')&&/(?:^|\/)(?:WORKFLOW\.md|workflow\.yaml|current\.json)$/.test(row.path)){if(++candidates>LIMITS.rows)reject('evidence.limit.exceeded');selected.add(row.path);}
 }
 const collectionControl=readJson(controlPaths[1]);if(collectionControl.schemaVersion!=='workflow-contract-v2-collections/v1'||!Array.isArray(collectionControl.collections)||collectionControl.collections.length>256)reject();
 for(const collection of collectionControl.collections){portablePath(collection);for(const row of metadata)if(row.path.startsWith(collection+'/'))selected.add(row.path);}
 await readPaths([...selected]);
 return Object.freeze({commitSha,treeSha,metadata,owners:Object.freeze(owners),capturedBytes,readBlob(relative){const bytes=contents.get(relative);if(!bytes)reject('evidence.subject.invalid');return Buffer.from(bytes);},readJson,selectedPaths:Object.freeze([...contents.keys()].sort(compareCodeUnits))});
}
