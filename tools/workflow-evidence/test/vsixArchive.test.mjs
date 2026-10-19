import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeZip} from './testSupport.mjs';
const {validateVsixArchive}=await import('../lib/vsixArchive.mjs').catch(()=>({}));

test('valid_stored_deflate_and_descriptors_produce_detached_payloads',()=>{
 assert.equal(typeof validateVsixArchive,'function','bounded ZIP validator is missing');
 for(const options of [{method:0},{method:8},{method:8,descriptor:true},{method:8,descriptor:true,unsignedDescriptor:true}]){
  const bytes=makeZip({entries:[{name:'extension/a.txt',data:'payload',...options}]}),archive=validateVsixArchive(bytes);
  assert.equal(archive.readEntry('extension/a.txt').toString(),'payload');bytes.fill(0);const copy=archive.readEntry('extension/a.txt');copy.fill(0);assert.equal(archive.readEntry('extension/a.txt').toString(),'payload');
  assert.ok(Object.isFrozen(archive));assert.throws(()=>archive.readEntry('extension/missing'));
 }
});

const mutations=[
 ['local filename',x=>x.bytes[x.locals[0]+30]^=1],['local flags',x=>x.bytes.writeUInt16LE(1,x.locals[0]+6)],
 ['local method',x=>x.bytes.writeUInt16LE(99,x.locals[0]+8)],['local CRC',x=>x.bytes[x.locals[0]+14]^=1],
 ['local compressed size',x=>x.bytes.writeUInt32LE(2,x.locals[0]+18)],['local size',x=>x.bytes.writeUInt32LE(9,x.locals[0]+22)],
 ['central CRC',x=>x.bytes[x.centrals[0]+16]^=1],['encrypted',x=>x.bytes.writeUInt16LE(0x801,x.centrals[0]+8)],
 ['unsupported method',x=>x.bytes.writeUInt16LE(99,x.centrals[0]+10)],['ZIP64 size',x=>x.bytes.writeUInt32LE(0xffffffff,x.centrals[0]+24)],
 ['multidisk',x=>x.bytes.writeUInt16LE(1,x.eocdOffset+4)],['count mismatch',x=>x.bytes.writeUInt16LE(0,x.eocdOffset+8)],
 ['overlap',x=>x.bytes.writeUInt32LE(0,x.centrals[1]+42)],['nonrequired corrupt CRC',x=>x.bytes[x.centrals[1]+16]^=1],
 ['unexplained gap',x=>{const p=x.centrals[0];return Buffer.concat([x.bytes.subarray(0,p),Buffer.from([42]),x.bytes.subarray(p)]);}],
 ['unexpected tail',x=>Buffer.concat([x.bytes,Buffer.from('tail')])],['truncation',x=>x.bytes.subarray(0,x.bytes.length-1)]
];
for(const [name,mutate]of mutations)test(`rejects_zip_structure_and_path_aliases: ${name}`,()=>{
 assert.equal(typeof validateVsixArchive,'function','bounded ZIP validator is missing');
 assert.throws(()=>validateVsixArchive(makeZip({entries:[{name:'extension/a',data:'a'},{name:'extension/unused',data:'b'}],mutate:x=>{const result=mutate(x);return Buffer.isBuffer(result)?result:x.bytes;}})));
});

for(const names of [['extension/a','extension/a'],['extension/A','extension/a'],['extension/é','extension/e\u0301'],['../escape'],['C:/escape'],['extension\\a'],['/absolute'],['extension/./a'],['extension//a'],['extension/CON'],['extension/a.'],['extension/a:stream']])test(`rejects_zip_structure_and_path_aliases: ${names.join('|')}`,()=>{
 assert.equal(typeof validateVsixArchive,'function','bounded ZIP validator is missing');
 assert.throws(()=>validateVsixArchive(makeZip({entries:names.map(name=>({name,data:'x'}))})));
});

test('rejects_zip_structure_and_path_aliases: invalid UTF8, nonregular assets, malformed descriptor',()=>{
 assert.equal(typeof validateVsixArchive,'function','bounded ZIP validator is missing');
 for(const entry of [{name:Buffer.from([0xff]),data:'x'},{name:'extension/link',data:'target',mode:0xa1ff},{name:'extension/fifo',data:'',mode:0x11a4}])assert.throws(()=>validateVsixArchive(makeZip({entries:[entry]})));
 assert.throws(()=>validateVsixArchive(makeZip({entries:[{name:'extension/a',data:'a',descriptor:true}],mutate:x=>{x.bytes[x.centrals[0]-4]^=1;return x.bytes;}})));
});

test('zip_budgets_are_enforced_before_inflate',()=>{
 assert.equal(typeof validateVsixArchive,'function','bounded ZIP validator is missing');
 assert.throws(()=>validateVsixArchive(Buffer.alloc(64*1024*1024+1)),{code:'evidence.limit.exceeded'});
 assert.throws(()=>validateVsixArchive(makeZip({entries:Array.from({length:10001},(_,i)=>({name:`extension/a${i}`,data:''}))})),{code:'evidence.limit.exceeded'});
 assert.throws(()=>validateVsixArchive(makeZip({entries:[{name:'extension/a',data:'x',rawSize:8*1024*1024+1}]})),{code:'evidence.limit.exceeded'});
 assert.throws(()=>validateVsixArchive(makeZip({entries:Array.from({length:5},(_,i)=>({name:`extension/a${i}`,data:'x',rawSize:8*1024*1024}))})),{code:'evidence.limit.exceeded'});
 const data=Buffer.alloc(8*1024*1024,65),archive=validateVsixArchive(makeZip({entries:[{name:'extension/a',data,method:8}]}));
 assert.equal(archive.readEntry('extension/a').length,8*1024*1024);
});
