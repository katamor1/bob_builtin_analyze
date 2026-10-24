'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const h=require('./helpers/boundedDocumentFixtures');
test('bounded_read_reserves_before_content_io_and_commits_exact_bytes',async()=>{
 const r=h.load(),f=h.fixture(),originalOpen=fsp.open,originalAlloc=Buffer.alloc;let reads=0,allocations=0;
 const allocation=mock.method(Buffer,'alloc',function(n,...args){if(n===f.bytes.length){allocations++;assert.equal(h.openReservations(f.input.ledger),1);}return originalAlloc(n,...args);});
 const opened=mock.method(fsp,'open',async(...args)=>h.wrapHandle(await originalOpen(...args),{read:async(handle,...readArgs)=>{reads++;assert.equal(h.openReservations(f.input.ledger),1);return handle.read(...readArgs);}}));
 try{const result=await r.readBoundedDocumentFile(f.input);assert.ok(reads>=2);assert.ok(allocations>=1);assert.equal(result.byteLength,7);assert.deepEqual(h.committedTriple(f.input.ledger),[7,7,7]);assert.equal(h.openReservations(f.input.ledger),0);}finally{opened.mock.restore();allocation.mock.restore();}
});
test('snapshot_is_copy_only_and_frozen',async()=>{
 const f=h.fixture(),s=await h.load().readBoundedDocumentFile(f.input);assert.ok(Object.isFrozen(s)&&Object.isFrozen(s.identity));
 const copy=s.copyBytes();copy.fill(0);assert.deepEqual(s.copyBytes(),Buffer.from('source!'));assert.equal(s.sha256,crypto.createHash('sha256').update('source!').digest('hex'));
});
test('request_getters_and_coercion_do_not_execute',async()=>{
 const r=h.load(),f=h.fixture();let calls=0;
 for(const value of [Object.defineProperty({...f.input},'filePath',{get(){calls++;throw Error('getter');},enumerable:true}),{...f.input,maximumFileBytes:{valueOf(){calls++;throw Error('coercion');}}},{...f.input,unknown:'secret'},{...f.input,expectedFingerprint:Object.defineProperty({},'sha256',{get(){calls++;throw Error('fingerprint');},enumerable:true})}]){
  await assert.rejects(()=>r.readBoundedDocumentFile(value),e=>e.code==='bounded_document_input_invalid'&&Buffer.byteLength(e.message)<=512);assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);
 }
 assert.equal(calls,0);assert.equal(h.openReservations(f.input.ledger),0);
});
test('one_byte_and_fifty_mib_profiles_preserve_all_13_category_inequalities',async()=>{
 const r=h.load(),f=h.fixture(Buffer.from('x'));
 const s=await r.fingerprintBoundedDocumentFile({filePath:f.filePath,rootPath:f.root,maximumFileBytes:1});assert.equal(s.byteSize,'1');
 const large=h.fixture(Buffer.alloc(50*1048576,97));const p=await r.fingerprintBoundedDocumentFile({filePath:large.filePath,rootPath:large.root,maximumFileBytes:50*1048576});assert.equal(p.byteSize,'52428800');
 await assert.rejects(()=>r.fingerprintBoundedDocumentFile({filePath:large.filePath,rootPath:large.root,maximumFileBytes:1}),e=>e.code==='bounded_document_source_invalid');
});
test('oversize_file_is_rejected_before_content_read_or_snapshot_allocation',async()=>{
 const r=h.load(),f=h.fixture(),open=fsp.open;let reads=0;const m=mock.method(fsp,'open',async(...args)=>h.wrapHandle(await open(...args),{read:async()=>{reads++;throw Error('unexpected read');}}));
 try{await assert.rejects(()=>r.readBoundedDocumentFile({...f.input,maximumFileBytes:1}),e=>e.code==='bounded_document_source_invalid');assert.equal(reads,0);assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);assert.equal(h.openReservations(f.input.ledger),0);}finally{m.mock.restore();}
});
test('typed_budget_rejection_is_preserved_without_read',async()=>{
 const r=h.load(),f=h.fixture(),open=fsp.open;f.input.ledger=h.observeLedger({limits:{single_document_bytes:1}});let reads=0;
 const m=mock.method(fsp,'open',async(...args)=>h.wrapHandle(await open(...args),{read:async()=>{reads++;throw Error('unexpected');}}));
 try{await assert.rejects(()=>r.readBoundedDocumentFile(f.input),e=>e.code==='processing_budget_exceeded');assert.equal(reads,0);assert.equal(h.openReservations(f.input.ledger),0);}finally{m.mock.restore();}
});
test('root_escape_and_symlink_are_rejected',async()=>{
 const r=h.load(),f=h.fixture(),outside=h.fixture();await assert.rejects(()=>r.readBoundedDocumentFile({...f.input,filePath:outside.filePath}),e=>e.code==='bounded_document_source_invalid');
 const alias=path.join(f.root,'alias');try{fs.symlinkSync(f.root,alias,process.platform==='win32'?'junction':'dir');}catch(e){if(e.code==='EPERM')return;throw e;}
 await assert.rejects(()=>r.readBoundedDocumentFile({...f.input,filePath:path.join(alias,'source.bin')}),e=>e.code==='bounded_document_source_invalid');assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);
});
test('ledger_capability_is_brand_checked_before_filesystem_io',async()=>{
 const r=h.load(),f=h.fixture(),{ProcessingBudgetLedger}=require('../out/processingBudgetLedger'),open=fsp.open;let opens=0;
 const m=mock.method(fsp,'open',async(...args)=>{opens++;return open(...args);});
 const forged=Object.create(ProcessingBudgetLedger.prototype),proxy=new Proxy({},{getPrototypeOf(){throw Error('untrusted diagnostic');}});
 try{for(const ledger of [forged,proxy])await assert.rejects(()=>r.readBoundedDocumentFile({...f.input,ledger}),e=>e.code==='bounded_document_input_invalid'&&Buffer.byteLength(e.message)<=512);assert.equal(opens,0);}finally{m.mock.restore();}
});
