import {inflateRawSync} from 'node:zlib';
import {LIMITS,copyBytes,decodeUtf8,digestBytes,portablePath,portableFold,compareCodeUnits,reject,WorkflowEvidenceError} from './primitives.mjs';

const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=(n>>>8)^crcTable[(n^b)&255];return(n^0xffffffff)>>>0;}
const invalid=()=>reject('evidence.zip.invalid');
function extra(bytes,start,length){
 const end=start+length;while(start<end){if(start+4>end)invalid();const tag=bytes.readUInt16LE(start),size=bytes.readUInt16LE(start+2);if(tag===1||tag===0x7075||tag===0x6375||start+4+size>end)invalid();start+=4+size;}
}
function parseArchive(bytes){
 if(bytes.length<22)invalid();
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
 if(end<0)invalid();
 const count=bytes.readUInt16LE(end+10),centralBytes=bytes.readUInt32LE(end+12),centralOffset=bytes.readUInt32LE(end+16);
 if(count>LIMITS.zipEntries)reject('evidence.limit.exceeded');
 if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||bytes.readUInt16LE(end+8)!==count||count===0xffff||centralBytes===0xffffffff||centralOffset===0xffffffff||centralOffset+centralBytes!==end)invalid();
 const rows=[],names=new Map();let cursor=centralOffset,total=0;
 for(let i=0;i<count;i++){
  if(cursor+46>end||bytes.readUInt32LE(cursor)!==0x02014b50)invalid();
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),crc=bytes.readUInt32LE(cursor+16),compressed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24),nameSize=bytes.readUInt16LE(cursor+28),extraSize=bytes.readUInt16LE(cursor+30),commentSize=bytes.readUInt16LE(cursor+32),mode=bytes.readUInt32LE(cursor+38)>>>16,attributes=bytes.readUInt32LE(cursor+38),offset=bytes.readUInt32LE(cursor+42);
  if(size>LIMITS.entryBytes)reject('evidence.limit.exceeded');total+=size;if(total>LIMITS.zipBytes)reject('evidence.limit.exceeded');
  if(bytes.readUInt16LE(cursor+6)>20||bytes.readUInt16LE(cursor+34)||compressed===0xffffffff||offset===0xffffffff||(method!==0&&method!==8)||(flags&~0x80e)||(method===0&&(flags&6))||cursor+46+nameSize+extraSize+commentSize>end)invalid();
  const nameBytes=bytes.subarray(cursor+46,cursor+46+nameSize),rawName=decodeUtf8(nameBytes),isDirectory=rawName.endsWith('/'),name=portablePath(rawName,{directory:isDirectory});
  if(!(flags&0x800)&&nameBytes.some(x=>x>127))invalid();
  const fileType=mode&0xf000;
  if(isDirectory){if((fileType&&fileType!==0x4000)||size!==0)invalid();}else if((fileType&&fileType!==0x8000)||(attributes&0x10))invalid();
  const parts=name.split('/');for(let n=1;n<=parts.length;n++){const part=parts.slice(0,n).join('/'),fold=portableFold(part),prior=names.get(fold);if(prior&&prior!==part)invalid();names.set(fold,part);}
  if(rows.some(r=>r.name===name))invalid();
  extra(bytes,cursor+46+nameSize,extraSize);
  rows.push({name,isDirectory,nameBytes,flags,method,crc,compressed,size,offset});cursor+=46+nameSize+extraSize+commentSize;
 }
 if(cursor!==end)invalid();
 const ordered=[...rows].sort((a,b)=>a.offset-b.offset),payloads=new Map();let previous=0;
 for(const row of ordered){
  const p=row.offset;if(p!==previous||p+30>centralOffset||bytes.readUInt32LE(p)!==0x04034b50)invalid();
  const nameSize=bytes.readUInt16LE(p+26),extraSize=bytes.readUInt16LE(p+28),start=p+30+nameSize+extraSize,finish=start+row.compressed;
  if(bytes.readUInt16LE(p+4)>20||bytes.readUInt16LE(p+6)!==row.flags||bytes.readUInt16LE(p+8)!==row.method||finish>centralOffset||!bytes.subarray(p+30,p+30+nameSize).equals(row.nameBytes))invalid();
  extra(bytes,p+30+nameSize,extraSize);
  const local=[bytes.readUInt32LE(p+14),bytes.readUInt32LE(p+18),bytes.readUInt32LE(p+22)],expected=[row.crc,row.compressed,row.size];
  if(row.flags&8){if(local.some((v,i)=>v!==0&&v!==expected[i]))invalid();}else if(local.some((v,i)=>v!==expected[i]))invalid();
  previous=finish;
  if(row.flags&8){
   if(finish+12>centralOffset)invalid();const signed=bytes.readUInt32LE(finish)===0x08074b50,base=finish+(signed?4:0);if(base+12>centralOffset||expected.some((v,i)=>bytes.readUInt32LE(base+i*4)!==v))invalid();previous=base+12;
  }
  let data;
  if(row.method===0){if(row.compressed!==row.size)invalid();data=bytes.subarray(start,finish);}
  else{
   let result;try{result=inflateRawSync(bytes.subarray(start,finish),{maxOutputLength:Math.max(1,row.size+1),info:true});}catch{invalid();}
   if(result.engine.bytesWritten!==row.compressed)invalid();data=result.buffer;
  }
  if(data.length!==row.size||crc32(data)!==row.crc)invalid();
  payloads.set(row.name,Buffer.from(data));
 }
 if(previous!==centralOffset)invalid();
 const files=new Set(rows.filter(r=>!r.isDirectory).map(r=>r.name));
 for(const row of rows){const p=row.name.split('/');for(let i=1;i<p.length;i++)if(files.has(p.slice(0,i).join('/')))invalid();}
 const entries=Object.freeze(rows.map(row=>Object.freeze({path:row.name,kind:row.isDirectory?'directory':'file',bytes:row.size,sha256:digestBytes(payloads.get(row.name))})).sort((a,b)=>compareCodeUnits(a.path,b.path)));
 return Object.freeze({sha256:digestBytes(bytes),bytes:bytes.length,uncompressedBytes:total,entries,readEntry(name){const p=portablePath(name),entry=entries.find(e=>e.path===p);if(!entry||entry.kind!=='file')invalid();return Buffer.from(payloads.get(p));}});
}
/** Validate every entry before exposing any bytes; no extraction or code execution. */
export function validateVsixArchive(input){
 const bytes=copyBytes(input,LIMITS.archiveBytes);
 try{return parseArchive(bytes);}catch(error){if(error instanceof WorkflowEvidenceError)throw error;invalid();}
}
