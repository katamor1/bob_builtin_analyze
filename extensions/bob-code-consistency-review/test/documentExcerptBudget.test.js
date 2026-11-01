'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {extractDocuments}=require('../out/analyzers/documentExtractor'),{createPipelineProcessingOperation}=require('../out/core/processingBudgetPipeline'),defaults=require('../out/core/limits').DEFAULT_REVIEW_PROCESSING_LIMITS;
const usage=(op,id)=>op.snapshot().categories.find(row=>row.category===id);
function fixture(text='# REQ-001\ntext'){const root=fs.mkdtempSync(path.join(process.env.PROCESSING_BUDGET_ARTIFACT_ROOT||os.tmpdir(),'t16-excerpt-'));fs.writeFileSync(path.join(root,'source.md'),text);return{root,text};}
const input=(count=1)=>({artifacts:{requirements:Array.from({length:count},()=>({path:'source.md'}))}});
function context(count,overrides){const processingOperation=createPipelineProcessingOperation(defaults,overrides);return{processingOperation,operation:processingOperation.documents(count),processingBudgetLimits:overrides};}

// Break: structural copies or foreign document owners bypass the shared aggregate before I/O.
test('cross_owner_pair_is_rejected_before_io',async()=>{
 const f=fixture(),a=context(1),b=context(1),open=fsp.open;let opens=0,getters=0;
 const spy=mock.method(fsp,'open',async(...args)=>{opens++;return open(...args);});
 const forged=Object.defineProperty({},'signal',{get(){getters++;throw Error('must not read forged properties');}});
 try{
  for(const operation of [b.operation,{...a.operation},forged])await assert.rejects(()=>extractDocuments(input(),{workspaceRoot:f.root,...a,operation}),e=>e.code==='bounded_document_input_invalid');
  await assert.rejects(()=>extractDocuments(input(),{workspaceRoot:f.root,operation:a.operation}),e=>e.code==='bounded_document_input_invalid');
  assert.deepEqual([opens,getters],[0,0]);assert.equal(usage(a.processingOperation,'total_document_bytes').committed,0);
 }finally{spy.mock.restore();}
});

// Break: clipping counts only text and misses headers, separators or multibyte suffix bytes.
test('excerpt_counts_headers_separators_and_utf8_suffix',async()=>{
 const f=fixture('# REQ-001\n'+'日本語の長い説明 '.repeat(400)),owned=context(1,{document_excerpt_bytes:512});
 const result=await extractDocuments(input(),{workspaceRoot:f.root,...owned});const bytes=Buffer.byteLength(result.excerptsMarkdown,'utf8');
 assert.ok(bytes>0&&bytes<=512);assert.equal(usage(owned.processingOperation,'document_excerpt_bytes').committed,bytes);assert.ok(bytes>Buffer.byteLength(result.evidence[0].text,'utf8'));assert.ok(result.warnings.some(w=>w.includes('truncated')||w.includes('exhausted')));assert.equal(owned.processingOperation.snapshot().categories.every(row=>row.reserved===0),true);
});

// Break: raw diff, repeated source selections and excerpts quietly consume separate ledgers.
test('raw_diff_documents_and_excerpts_share_parent',async()=>{
 const f=fixture(),owned=context(2);owned.processingOperation.reserve('raw_diff_bytes',7).commit();
 const result=await extractDocuments(input(2),{workspaceRoot:f.root,...owned}),raw=2*Buffer.byteLength(f.text,'utf8'),excerpt=Buffer.byteLength(result.excerptsMarkdown,'utf8');
 assert.equal(result.documents.length,2);assert.equal(usage(owned.processingOperation,'document_count').committed,2);assert.equal(usage(owned.processingOperation,'total_document_bytes').committed,raw);assert.equal(usage(owned.processingOperation,'document_excerpt_bytes').committed,excerpt);assert.equal(usage(owned.processingOperation,'total_operation_input_bytes').committed,7+raw+excerpt);
});

// Break: low excerpt cap is ignored or parent exhaustion is downgraded to ordinary parser warning.
test('excerpt_zero_and_parent_failure_are_not_ordinary_warning',async()=>{
 const f=fixture(),zero=context(1,{document_excerpt_bytes:0});const result=await extractDocuments(input(),{workspaceRoot:f.root,...zero});assert.equal(result.excerptsMarkdown,'');assert.equal(usage(zero.processingOperation,'document_excerpt_bytes').committed,0);
 const owned=context(1,{total_operation_input_bytes:1000,document_excerpt_bytes:400}),raw=Buffer.byteLength(f.text,'utf8');owned.processingOperation.reserve('raw_diff_bytes',1000-raw-1).commit();
 await assert.rejects(()=>extractDocuments(input(),{workspaceRoot:f.root,...owned}),e=>e.code==='processing_budget_exceeded'&&e.details.constrainedCategory==='total_operation_input_bytes');assert.equal(usage(owned.processingOperation,'total_document_bytes').committed,raw);assert.equal(usage(owned.processingOperation,'document_excerpt_bytes').committed,0);assert.equal(usage(owned.processingOperation,'total_operation_input_bytes').committed,999);assert.equal(owned.processingOperation.snapshot().categories.every(row=>row.reserved===0),true);
});

// Break: normalization executes input getters before a known operation cancellation is honored.
test('pre_cancel_precedes_public_limit_getters_for_both_signal_routes',async()=>{
 const f=fixture();
 for(const route of ['caller','owner']){
  const c=new AbortController(),reason=new Error('cancel before limits'),processingOperation=createPipelineProcessingOperation(defaults,undefined,c.signal),operation=processingOperation.documents(1);let getters=0;
  c.abort(reason);const limits=Object.defineProperty({},'maxDocumentBytes',{get(){getters++;throw Error('must not read cancelled limits');}});
  const options=route==='owner'?{processingOperation,operation}:{signal:c.signal};
  await assert.rejects(()=>extractDocuments(input(),{workspaceRoot:f.root,...options,limits}),e=>e===reason);assert.equal(getters,0);
 }
});
