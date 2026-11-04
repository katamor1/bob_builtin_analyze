'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const h=require('./helpers/boundedDocumentFixtures');
const clean=f=>{assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);assert.equal(h.openReservations(f.input.ledger),0);};

// Break: resolving first erases a forbidden raw component before the shared policy sees it.
test('raw_document_paths_are_checked_before_normalization',async()=>{
 for(const kind of ['file-dot','root-dot','file-empty','file-parent']){
  const f=h.fixture(),input={...f.input};
  if(kind==='root-dot')input.rootPath=f.root+path.sep+'.';
  else input.filePath=f.root+path.sep+(kind==='file-dot'?'.'+path.sep:kind==='file-empty'?path.sep:'child'+path.sep+'..'+path.sep)+'source.bin';
  await assert.rejects(()=>h.load().readBoundedDocumentFile(input),e=>e.code==='bounded_document_input_invalid',kind);clean(f);
 }
});

// Break: a second name for an ordinary document is accepted and charged as a safe source.
test('hardlink_or_ctime_change_cannot_commit_document',async t=>{
 await t.test('hardlink2',async()=>{const f=h.fixture();fs.linkSync(f.filePath,path.join(f.root,'second.bin'));await assert.rejects(()=>h.load().readBoundedDocumentFile(f.input),e=>e.code==='bounded_document_source_invalid');clean(f);});
 await t.test('ctime-only controlled stat observation',async()=>{
  const f=h.fixture(),open=fsp.open;let consumed=false;
  const spy=mock.method(fsp,'open',async(...args)=>h.wrapHandle(await open(...args),{stat:async(handle,...statArgs)=>{const stat=await handle.stat(...statArgs);return consumed?Object.assign(Object.create(Object.getPrototypeOf(stat)),stat,{ctimeNs:stat.ctimeNs+1n}):stat;}}));
  try{await assert.rejects(()=>h.load('boundedDocumentFile').withBoundedDocumentSnapshot(f.input,async()=>{consumed=true;return 'must discard';}),e=>e.code==='bounded_document_source_changed');clean(f);}finally{spy.mock.restore();}
 });
 await t.test('nlink changed after consume',async()=>{const f=h.fixture();await assert.rejects(()=>h.load('boundedDocumentFile').withBoundedDocumentSnapshot(f.input,async()=>{fs.linkSync(f.filePath,path.join(f.root,'second.bin'));return 'must discard';}),e=>e.code==='bounded_document_source_changed');clean(f);});
});

// Break: restoring the size and mtime lets a modified consume result escape.
test('same_size_change_and_parent_swap_discard_result',async t=>{
 await t.test('same-size bytes with restored mtime',async()=>{const f=h.fixture();let adopted=0;await assert.rejects(()=>h.load('boundedDocumentFile').withBoundedDocumentSnapshot(f.input,async()=>{const before=fs.statSync(f.filePath);fs.writeFileSync(f.filePath,'changed');fs.utimesSync(f.filePath,before.atime,before.mtime);return 'discard';}).then(value=>{adopted++;return value;}),e=>e.code==='bounded_document_source_changed');assert.equal(adopted,0);clean(f);});
 await t.test('controlled parent alias observation after consume',async()=>{const f=h.fixture(),sub=path.join(f.root,'sub');fs.mkdirSync(sub);fs.renameSync(f.filePath,path.join(sub,'source.bin'));const input={...f.input,filePath:path.join(sub,'source.bin')},native=fs.realpathSync.native;let consumed=false;const spy=mock.method(fs.realpathSync,'native',target=>consumed&&target===sub?sub+'.observed-alias':native(target));try{await assert.rejects(()=>h.load('boundedDocumentFile').withBoundedDocumentSnapshot(input,async()=>{consumed=true;return 'discard';}),e=>e.code==='bounded_document_source_invalid');clean(f);}finally{spy.mock.restore();}});
});

// Break: an admitted reread escapes a newly introduced hardlink or charges the original twice.
test('admitted_reread_rechecks_links_without_charging_original_twice',async()=>{
 const f=h.fixture(),r=h.load('index'),op=r.createDocumentOperation({selectedDocumentCount:1,profile:r.normalizeProcessingBudgetProfile()}),request={filePath:f.filePath,rootPath:f.root,maximumFileBytes:1024};
 const admission=await op.fingerprintSelection(0,request);assert.deepEqual(Object.keys(admission.fingerprint).sort(),['byteSize','device','inode','mtimeNs','sha256']);
 fs.linkSync(f.filePath,path.join(f.root,'second.bin'));await assert.rejects(()=>op.verifyAfterExternalRead(admission),e=>e.code==='bounded_document_source_invalid');
 assert.deepEqual(['single_document_bytes','total_document_bytes','total_operation_input_bytes'].map(id=>op.snapshot().categories.find(row=>row.category===id).committed),[7,7,7]);assert.equal(op.snapshot().categories.every(row=>row.reserved===0),true);
});
