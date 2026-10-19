import fs from 'node:fs/promises';
import path from 'node:path';
import {LIMITS,snapshotClosedData,digestBytes,reject,WorkflowEvidenceError} from './primitives.mjs';
import {validateVsixArchive} from './vsixArchive.mjs';
const lstat=fs.lstat.bind(fs),open=fs.open.bind(fs),realpath=fs.realpath.bind(fs);
const changed=()=>reject('evidence.capture.changed');
function same(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs&&a.nlink===b.nlink;}
async function ancestors(file){const result=[];let p=path.dirname(file);for(;;){const s=await lstat(p,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink())changed();result.push({path:p,dev:s.dev,ino:s.ino});const next=path.dirname(p);if(next===p)break;p=next;}return result;}

export async function captureEvidenceInputFile(inputPath,maxBytes=LIMITS.blobBytes){
 if(typeof inputPath!=='string'||!inputPath||!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes>LIMITS.archiveBytes)reject('evidence.subject.invalid');
 const locator=path.resolve(inputPath);let handle;
 try{
  const beforeAncestors=await ancestors(locator),before=await lstat(locator,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n)changed();
  const physical=await realpath(locator);if(path.resolve(physical)!==locator)changed();if(before.size>BigInt(maxBytes))reject('evidence.limit.exceeded');
  handle=await open(locator,'r');const opened=await handle.stat({bigint:true});if(!opened.isFile()||!same(before,opened))changed();
  const expected=Number(opened.size),buffer=Buffer.alloc(expected+1);let size=0;
  for(;;){const {bytesRead}=await handle.read(buffer,size,buffer.length-size,size);if(!bytesRead)break;size+=bytesRead;if(size===buffer.length)changed();}
  if(size!==expected)changed();const after=await handle.stat({bigint:true}),afterPath=await lstat(locator,{bigint:true}),afterAncestors=await ancestors(locator);
  if(!same(opened,after)||!same(opened,afterPath)||afterAncestors.length!==beforeAncestors.length||afterAncestors.some((row,i)=>row.path!==beforeAncestors[i].path||row.dev!==beforeAncestors[i].dev||row.ino!==beforeAncestors[i].ino)||(await realpath(locator))!==physical)changed();
  const bytes=buffer.subarray(0,size);return Object.freeze({sha256:digestBytes(bytes),bytes:size,identity:`${opened.dev}:${opened.ino}`,locator,readBytes(){return Buffer.from(bytes);}});
 }catch(error){if(error instanceof WorkflowEvidenceError)throw error;changed();}finally{if(handle)try{await handle.close();}catch{changed();}}
}

export async function captureVsixFile(input){
 const value=snapshotClosedData(input);if(value===null||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='expectedBytes,expectedSha256,path'||typeof value.path!=='string'||!value.path||typeof value.expectedSha256!=='string'||!/^([0-9a-f]{64})$/.test(value.expectedSha256)||!Number.isSafeInteger(value.expectedBytes)||value.expectedBytes<0)reject('evidence.subject.invalid');
 if(value.expectedBytes>LIMITS.archiveBytes)reject('evidence.limit.exceeded');const file=await captureEvidenceInputFile(value.path,LIMITS.archiveBytes);
 if(file.bytes!==value.expectedBytes||file.sha256!==value.expectedSha256)reject('evidence.subject.invalid');
 return Object.freeze({sha256:file.sha256,bytes:file.bytes,identity:file.identity,locator:file.locator,archive:validateVsixArchive(file.readBytes())});
}
