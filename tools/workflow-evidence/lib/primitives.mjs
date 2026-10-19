import {types} from 'node:util';
import {createHash} from 'node:crypto';

export const LIMITS=Object.freeze({archiveBytes:64*1024*1024,archiveCount:64,totalArchiveBytes:256*1024*1024,zipEntries:10000,entryBytes:8*1024*1024,zipBytes:32*1024*1024,totalZipBytes:256*1024*1024,gitMetadataBytes:32*1024*1024,gitRows:200000,blobBytes:8*1024*1024,totalBlobBytes:256*1024*1024,rows:20000,outputBytes:8*1024*1024,diagnosticBytes:256,diagnosticRows:4096});
const typedByteLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'byteLength').get;
const typedSet=Uint8Array.prototype.set;
const forbiddenKeys=new Set(['__proto__','constructor','prototype']);
export const compareCodeUnits=(a,b)=>a<b?-1:a>b?1:0;

function validText(value){
 if(typeof value!=='string')throw new WorkflowEvidenceError('evidence.input.invalid');
 for(let i=0;i<value.length;i++){const n=value.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw new WorkflowEvidenceError('evidence.input.invalid');}else if(n>=0xdc00&&n<=0xdfff)throw new WorkflowEvidenceError('evidence.input.invalid');}
 return value;
}
export function boundedDiagnosticText(value){
 validText(value);let bytes=0,result='';
 for(const original of value){const c=/[\u0000-\u001f\u007f-\u009f]/u.test(original)?'?':original,n=Buffer.byteLength(c);if(bytes+n>LIMITS.diagnosticBytes)break;result+=c;bytes+=n;}
 return result;
}
export class WorkflowEvidenceError extends Error{
 constructor(code,diagnostics=[]){
  super('Workflow evidence validation failed.');this.name='WorkflowEvidenceError';
  this.code=typeof code==='string'&&/^evidence\.[a-z_.]+$/.test(code)?code:'evidence.input.invalid';
  const rows=[];
  if(!types.isProxy(diagnostics)&&Array.isArray(diagnostics))for(let i=0;i<Math.min(diagnostics.length,LIMITS.diagnosticRows);i++){
   const slot=Object.getOwnPropertyDescriptor(diagnostics,String(i));if(!slot||!('value'in slot)||types.isProxy(slot.value)||slot.value===null||typeof slot.value!=='object')break;
   const d=Object.getOwnPropertyDescriptors(slot.value),read=key=>d[key]&&'value'in d[key]&&typeof d[key].value==='string'?d[key].value:'';
   try{rows.push(Object.freeze({code:boundedDiagnosticText(read('code')),path:boundedDiagnosticText(read('path')),message:boundedDiagnosticText(read('message'))}));}catch{break;}
  }
  this.diagnostics=Object.freeze(rows);Object.freeze(this);
 }
}
export function reject(code='evidence.input.invalid'){throw new WorkflowEvidenceError(code);}
export function copyBytes(input,maxBytes=LIMITS.blobBytes){
 if(types.isProxy(input)||!types.isUint8Array(input))reject();
 const proto=Object.getPrototypeOf(input);if(proto!==Buffer.prototype&&proto!==Uint8Array.prototype)reject();
 let size;try{size=Reflect.apply(typedByteLength,input,[]);}catch{reject();}
 if(size>maxBytes)reject('evidence.limit.exceeded');
 const copy=Buffer.alloc(size);try{Reflect.apply(typedSet,copy,[input]);}catch{reject();}return copy;
}
export function decodeUtf8(input){
 const bytes=copyBytes(input);
 if(bytes.length>=3&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)reject();
 try{return validText(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{reject();}
}
export function snapshotClosedData(input){
 const seen=new WeakSet();let nodes=0,textBytes=0;
 const text=s=>{validText(s);textBytes+=Buffer.byteLength(s);if(textBytes>LIMITS.outputBytes)reject('evidence.limit.exceeded');return s;};
 const visit=(value,depth)=>{
  if(++nodes>500000||depth>32)reject('evidence.limit.exceeded');
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='string')return text(value);
  if(typeof value==='number'&&Number.isFinite(value)&&!Object.is(value,-0))return value;
  if(typeof value!=='object'||types.isProxy(value)||seen.has(value))reject();seen.add(value);
  const proto=Object.getPrototypeOf(value),keys=Reflect.ownKeys(value);
  if(Array.isArray(value)){
   if(proto!==Array.prototype)reject();const length=Object.getOwnPropertyDescriptor(value,'length')?.value;
   if(!Number.isSafeInteger(length)||length<0||length>LIMITS.rows||keys.length!==length+1)reject();
   const result=[];for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!('value'in d)||!d.enumerable)reject();result.push(visit(d.value,depth+1));}return Object.freeze(result);
  }
  if(proto!==Object.prototype&&proto!==null)reject();if(keys.length>LIMITS.rows)reject('evidence.limit.exceeded');
  const result=Object.create(null);for(const key of keys){if(typeof key!=='string'||forbiddenKeys.has(key))reject();text(key);const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value'in d)||!d.enumerable)reject();Object.defineProperty(result,key,{value:visit(d.value,depth+1),enumerable:true});}return Object.freeze(result);
 };
 return visit(input,0);
}
export function canonicalBytes(value,maxBytes=LIMITS.outputBytes){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>LIMITS.outputBytes)reject();
 const copied=snapshotClosedData(value),chunks=[];let bytes=1;
 const append=s=>{bytes+=Buffer.byteLength(s);if(bytes>maxBytes)reject('evidence.limit.exceeded');chunks.push(s);};
 const encode=value=>{
  if(value===null||typeof value!=='object'){append(JSON.stringify(value));return;}
  if(Array.isArray(value)){append('[');value.forEach((v,i)=>{if(i)append(',');encode(v);});append(']');return;}
  append('{');Object.keys(value).sort(compareCodeUnits).forEach((k,i)=>{if(i)append(',');append(JSON.stringify(k));append(':');encode(value[k]);});append('}');
 };
 encode(copied);chunks.push('\n');return Buffer.from(chunks.join(''));
}
export function digestBytes(bytes){return createHash('sha256').update(bytes).digest('hex');}
export const portableFold=value=>value.toUpperCase().toLowerCase().normalize('NFC');
export function portablePath(value,{directory=false}={}){
 validText(value);
 if(directory&&value.endsWith('/'))value=value.slice(0,-1);
 if(!value||Buffer.byteLength(value)>4096||value.normalize('NFC')!==value||/[\u0000-\u001f\u007f-\u009f<>:"|?*\\]/u.test(value)||value.startsWith('/'))reject('evidence.path.invalid');
 for(const part of value.split('/'))if(!part||part==='.'||part==='..'||/[. ]$/.test(part)||Buffer.byteLength(part)>255||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(part))reject('evidence.path.invalid');
 return value;
}
