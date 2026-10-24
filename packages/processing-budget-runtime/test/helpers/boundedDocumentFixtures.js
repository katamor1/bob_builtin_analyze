'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {freshArtifactRoot,packageRoot}=require('../helpers');
const {ProcessingBudgetLedger}=require('../../out/processingBudgetLedger');
const observed=new WeakMap();
class ObservedLedger extends ProcessingBudgetLedger {
  constructor(profile){super(profile);observed.set(this,{open:new Set(),events:[]});}
  reserveForTarget(...args){
    const state=observed.get(this);state.events.push(['reserve',...args]);
    const token=super.reserveForTarget(...args);state.open.add(token);
    return Object.freeze({...token,
      commit(actual){token.commit(actual);state.open.delete(token);state.events.push(['commit',actual]);},
      release(){token.release();state.open.delete(token);state.events.push(['release']);}
    });
  }
}
function observeLedger(profile){return new ObservedLedger(profile);}
function committedTriple(ledger){const r=ledger.snapshot();return ['single_document_bytes','total_document_bytes','total_operation_input_bytes'].map(id=>r.categories.find(x=>x.category===id).committed);}
function openReservations(ledger){return observed.get(ledger)?.open.size??0;}
function fixture(bytes=Buffer.from('source!')){const root=freshArtifactRoot('bounded');const filePath=path.join(root,'source.bin');fs.writeFileSync(filePath,bytes);return{root,filePath,bytes,input:{filePath,rootPath:root,maximumFileBytes:1024,target:'test-document',ledger:observeLedger()}};}
function load(module='boundedDocumentIo'){const file=path.join(packageRoot,'out',module+'.js');assert.ok(fs.existsSync(file),'bounded document runtime must be compiled: '+module);return require(file);}
function wrapHandle(handle,hooks={}){return new Proxy(handle,{get(target,key){if(hooks[key])return (...args)=>hooks[key](target,...args);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});}
const zlib=require('node:zlib');
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&255];return(crc^0xffffffff)>>>0;}
function buildZip(entries,options={}){
 const local=[],central=[];let offset=0;
 for(const entry of entries){const name=Buffer.from(entry.name),raw=Buffer.isBuffer(entry.data)?entry.data:Buffer.from(entry.data??''),method=entry.method??0;
  const data=entry.compressed??(method===8?zlib.deflateRawSync(raw):raw),crc=entry.crc??crc32(raw),size=entry.declaredSize??raw.length;
  const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(entry.flags??0,6);l.writeUInt16LE(method,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(data.length,18);l.writeUInt32LE(size,22);l.writeUInt16LE(name.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(entry.flags??0,8);c.writeUInt16LE(method,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(size,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
  local.push(l,name,data);central.push(c,name);offset+=l.length+name.length+data.length;
 }
 const body=Buffer.concat(local),dir=Buffer.concat(central),end=Buffer.alloc(22),comment=options.comment??Buffer.alloc(0);assert.ok(comment.length<=65535);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(body.length,16);end.writeUInt16LE(comment.length,20);return Buffer.concat([body,dir,end,comment]);
}
function entries(kind='docx',extra=[]){return[{name:'[Content_Types].xml',data:'types'},{name:kind==='docx'?'word/document.xml':'xl/workbook.xml',data:'document',method:8},...extra];}
function codec(){const f=require('fflate');return{strToU8:f.strToU8,zipSync:map=>f.zipSync(map,{mtime:new Date('2020-01-01T00:00:00Z')})};}
async function request(bytes=buildZip(entries()),kind='docx'){
 const f=fixture(bytes),r=load();f.input.maximumFileBytes=25*1048576;f.input.ledger=observeLedger({limits:{single_document_bytes:25*1048576}});
 const expectedFingerprint=await r.fingerprintBoundedDocumentFile({filePath:f.filePath,rootPath:f.root,maximumFileBytes:25*1048576});
 return{...f,request:{...f.input,expectedFingerprint,documentKind:kind,structuralLimits:{maxEntries:5000,maxExpandedBytes:250*1048576},loadXlsxCodec:async()=>codec()}};
}
module.exports={fixture,load,observeLedger,committedTriple,openReservations,wrapHandle,buildZip,entries,crc32,codec,request,events:ledger=>observed.get(ledger).events};
