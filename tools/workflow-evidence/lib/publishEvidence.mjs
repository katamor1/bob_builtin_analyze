import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {types} from 'node:util';
import {LIMITS,copyBytes,digestBytes,portablePath,reject,WorkflowEvidenceError} from './primitives.mjs';
import {captureEvidenceInputFile} from './vsixCapture.mjs';
const NAMES=Object.freeze(['catalog.json','discovery.json','report.json','compiled-plan-manifest.json']),backends=new Map(),failures=new WeakMap();
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.birthtimeNs===b.birthtimeNs;
const exists=async p=>{try{return await fs.lstat(p,{bigint:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}};
async function directDirectory(p){const stat=await fs.lstat(p,{bigint:true});if(!stat.isDirectory()||stat.isSymbolicLink()||path.resolve(await fs.realpath(p))!==path.resolve(p))reject('evidence.publication.invalid');return stat;}
function fileBundle(value){
 if(value===null||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))reject('evidence.publication.invalid');
 const descriptors=Object.getOwnPropertyDescriptors(value);if(Reflect.ownKeys(descriptors).length!==4||Reflect.ownKeys(descriptors).some(k=>typeof k!=='string'||!NAMES.includes(k)))reject('evidence.publication.invalid');
 const result=Object.create(null);for(const name of NAMES){const d=descriptors[name];if(!d||!('value'in d)||!d.enumerable)reject('evidence.publication.invalid');result[name]=copyBytes(d.value,LIMITS.outputBytes);}return result;
}
function requestData(input){
 if(input===null||typeof input!=='object'||types.isProxy(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))reject('evidence.publication.invalid');const descriptors=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(descriptors);if(keys.some(k=>typeof k!=='string'||!['outputDirectory','files','check'].includes(k))||!descriptors.outputDirectory||!descriptors.files)reject('evidence.publication.invalid');
 for(const key of keys)if(!('value'in descriptors[key])||!descriptors[key].enumerable)reject('evidence.publication.invalid');return{outputDirectory:descriptors.outputDirectory.value,files:descriptors.files.value,check:descriptors.check?descriptors.check.value:false};
}
function run(command,args,{cwd,fd}={}){
 return new Promise((resolve,rejectPromise)=>{const child=spawn(command,args,{cwd,windowsHide:true,stdio:fd===undefined?['ignore','pipe','pipe']:['ignore','pipe','pipe',fd]}),chunks=[];let size=0,failed=false;const timer=setTimeout(()=>{failed=true;child.kill();},30000);timer.unref();const capture=b=>{size+=b.length;if(size>16384){failed=true;child.kill();}else chunks.push(b);};child.stdout.on('data',capture);child.stderr.on('data',capture);child.on('error',()=>{failed=true});child.on('close',code=>{clearTimeout(timer);if(failed)return rejectPromise(new WorkflowEvidenceError('evidence.publication.unsupported'));resolve({code,text:Buffer.concat(chunks).toString('utf8')});});});
}
async function buildBackend(parent,parentStat){
 if(!['win32','linux'].includes(process.platform))reject('evidence.publication.unsupported');
 const buildLocator=await fs.mkdtemp(path.join(parent,'.workflow-evidence-native-')),windows=process.platform==='win32',capturedSource=await captureEvidenceInputFile(fileURLToPath(new URL(windows?'../native/rename_noreplace.ps1':'../native/rename_noreplace.c',import.meta.url)),65536),source=capturedSource.readBytes();
 const sourcePath=path.join(buildLocator,windows?'rename_noreplace.ps1':'rename_noreplace.c');await fs.writeFile(sourcePath,source,{flag:'wx',mode:0o600});
 let binary,compiler;
 if(windows){const built=await run('pwsh',['-NoProfile','-NonInteractive','-File',sourcePath,'-Mode','build','-BuildDirectory',buildLocator]);if(built.code!==0)reject('evidence.publication.unsupported');binary=path.join(buildLocator,'rename_noreplace.dll');compiler='PowerShell Add-Type '+built.text.trim().slice(0,256);}
 else{const version=await run('cc',['--version']);if(version.code!==0)reject('evidence.publication.unsupported');compiler=version.text.split(/\r?\n/)[0].slice(0,256);binary=path.join(buildLocator,'rename_noreplace');const built=await run('cc',['-std=c11','-O2','-Wall','-Wextra','-Werror',sourcePath,'-o',binary]);if(built.code!==0)reject('evidence.publication.unsupported');}
 const binarySha256=(await captureEvidenceInputFile(binary)).sha256,receipt=Object.freeze({kind:windows?'MoveFileExW_flags_0':'renameat2_RENAME_NOREPLACE',sourceSha256:digestBytes(source),binarySha256,compiler,buildLocator});await fs.writeFile(path.join(buildLocator,'backend-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 return{receipt,parentStat,async promote(sourceDirectory,destinationDirectory){
  if((await captureEvidenceInputFile(binary)).sha256!==binarySha256||(await captureEvidenceInputFile(sourcePath,65536)).sha256!==receipt.sourceSha256)reject('evidence.publication.invalid');
  if(windows)return run('pwsh',['-NoProfile','-NonInteractive','-File',sourcePath,'-Mode','promote','-BuildDirectory',buildLocator,'-Source',sourceDirectory,'-Destination',destinationDirectory]);
  const handle=await fs.open(parent,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{if(!same(await handle.stat({bigint:true}),parentStat))reject('evidence.publication.changed');return await run(binary,[path.basename(sourceDirectory),path.basename(destinationDirectory)],{cwd:buildLocator,fd:handle.fd});}finally{await handle.close();}
 }};
}
async function backendFor(parent,parentStat){const key=`${parentStat.dev}:${parentStat.ino}:${parentStat.birthtimeNs}`;if(!backends.has(key))backends.set(key,buildBackend(parent,parentStat));return backends.get(key);}

/** Actual kernel primitive; it never pre-checks away an occupied destination. */
export async function promoteDirectoryNoReplace(sourceDirectory,destinationDirectory){
 const source=path.resolve(sourceDirectory),destination=path.resolve(destinationDirectory),parent=path.dirname(source);
 if(parent!==path.dirname(destination)||source===destination)reject('evidence.publication.invalid');portablePath(path.basename(source));portablePath(path.basename(destination));
 const parentStat=await directDirectory(parent),sourceStat=await directDirectory(source);if(sourceStat.dev!==parentStat.dev)reject('evidence.publication.invalid');
 const backend=await backendFor(parent,parentStat);if(!same(await directDirectory(parent),parentStat)||!same(await directDirectory(source),sourceStat))reject('evidence.publication.changed');
 let result;try{result=await backend.promote(source,destination);}catch(error){const observed=await exists(destination);if(observed&&same(observed,sourceStat))reject('evidence.publication.uncertain');throw error;}
 if(result.code!==0){const observed=await exists(destination);if(observed&&same(observed,sourceStat))reject('evidence.publication.uncertain');if(result.code===2||observed)reject('evidence.publication.conflict');reject(result.code===3?'evidence.publication.unsupported':'evidence.publication.failed');}
 if(!same(await directDirectory(parent),parentStat)||!same(await directDirectory(destination),sourceStat)||await exists(source))reject('evidence.publication.uncertain');
 return backend.receipt;
}
export function publicationFailureReceipt(error){return failures.get(error)??null;}

export async function publishEvidenceDirectory(input){
 const {outputDirectory,files,check}=requestData(input);
 const captured=fileBundle(files);if(typeof outputDirectory!=='string'||!outputDirectory||typeof check!=='boolean')reject('evidence.publication.invalid');
 const output=path.resolve(outputDirectory),parent=path.dirname(output);portablePath(path.basename(output));let staging=null,backend;
 const artifactDigests=Object.fromEntries(NAMES.map(name=>[name,digestBytes(captured[name])])),base={artifactDigests,reportDigest:artifactDigests['report.json'],outputLocator:output};
 try{
  const parentStat=await directDirectory(parent),current=await exists(output);
  if(check){
   if(!current||!current.isDirectory()||current.isSymbolicLink())reject('evidence.check.mismatch');
   if((await fs.readdir(output)).sort().join(',')!==[...NAMES].sort().join(','))reject('evidence.check.mismatch');
   for(const name of NAMES){const currentFile=await captureEvidenceInputFile(path.join(output,name),LIMITS.outputBytes);if(!currentFile.readBytes().equals(captured[name]))reject('evidence.check.mismatch');}
   if(!same(await directDirectory(parent),parentStat)||!same(await directDirectory(output),current))reject('evidence.check.mismatch');return Object.freeze({state:'checked',...base,stagingLocator:null,backend:null});
  }
  if(current)reject('evidence.publication.conflict');staging=await fs.mkdtemp(path.join(parent,'.workflow-evidence-staging-'));await fs.chmod(staging,0o700);const stageStat=await directDirectory(staging);
  for(const name of NAMES){const handle=await fs.open(path.join(staging,name),'wx',0o600);try{await handle.writeFile(captured[name]);await handle.sync();}finally{await handle.close();}}
  if(process.platform==='linux'){const h=await fs.open(staging,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await h.sync();}finally{await h.close();}}
  if(!same(await directDirectory(parent),parentStat)||!same(await directDirectory(staging),stageStat))reject('evidence.publication.changed');backend=await promoteDirectoryNoReplace(staging,output);
  return Object.freeze({state:'published',...base,stagingLocator:staging,backend});
 }catch(error){const safe=error instanceof WorkflowEvidenceError?error:new WorkflowEvidenceError('evidence.publication.failed');failures.set(safe,Object.freeze({state:safe.code==='evidence.publication.uncertain'?'uncertain':'failed',...base,stagingLocator:staging,backend:backend??null}));throw safe;}
}
