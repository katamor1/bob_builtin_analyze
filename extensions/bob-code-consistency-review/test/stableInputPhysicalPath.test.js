'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const read=()=>require('../out/core/stableReviewInput');
function fixture(){const root=fs.mkdtempSync(path.join(process.env.PROCESSING_BUDGET_ARTIFACT_ROOT||os.tmpdir(),'t17path-stable-')),sub=path.join(root,'sub');fs.mkdirSync(sub);const filePath=path.join(sub,'input.yaml');fs.writeFileSync(filePath,'hello');return{root,sub,filePath,rootPath:root,maximumBytes:100,textEncoding:'utf8'};}
function owner(){const defaults=require('../out/core/limits').DEFAULT_REVIEW_PROCESSING_LIMITS;return require('../out/core/processingBudgetPipeline').createPipelineProcessingOperation(defaults);}
function clean(op){assert.equal(op.snapshot().categories.every(row=>row.reserved===0&&row.committed===0),true);}
function wrap(handle,hook){return new Proxy(handle,{get(target,key){const value=Reflect.get(target,key,target);return key==='read'?async(...args)=>{const result=await target.read(...args);hook();return result;}:typeof value==='function'?value.bind(target):value;}});}

// Break: matching opened/named metadata alone accepts a controlled post-read physical alias observation.
test('stable_input_with_root_revalidates_before_and_after_read',async t=>{
 for(const mode of ['parent','root'])await t.test(mode,async()=>{
  const f=fixture(),op=owner(),open=fsp.open,native=fs.realpathSync.native,observed=mode==='root'?f.root:f.sub;let changed=false,adopted=0;
  const physical=mock.method(fs.realpathSync,'native',target=>changed&&target===observed?observed+'.observed-alias':native(target));
  const spy=mock.method(fsp,'open',async(...args)=>wrap(await open(...args),()=>{changed=true;}));
  try{await assert.rejects(()=>read().readStableReviewInputText({...f,operation:op}).then(value=>{adopted++;return value;}),e=>e.code==='bounded_document_source_invalid');assert.equal(adopted,0);clean(op);}finally{spy.mock.restore();physical.mock.restore();op.dispose();}
 });
});

// Break: root-aware reads admit a second file name or raw traversal before reserving input.
test('rooted_stable_input_rejects_hardlinks_raw_paths_and_escape_before_open',async()=>{
 for(const mode of ['hardlink','raw-file','raw-root','escape','linked-parent','linked-root']){
  const f=fixture(),outside=fixture(),input={...f},op=owner(),open=fsp.open;let opened=0;
  if(mode==='hardlink')fs.linkSync(f.filePath,path.join(f.sub,'second.yaml'));
  if(mode==='raw-file')input.filePath=f.sub+path.sep+'.'+path.sep+'input.yaml';
  if(mode==='raw-root')input.rootPath=f.root+path.sep+'.';
  if(mode==='escape')input.filePath=outside.filePath;
  if(mode==='linked-parent'){const alias=f.sub+'.alias';fs.symlinkSync(f.sub,alias,process.platform==='win32'?'junction':'dir');input.filePath=path.join(alias,'input.yaml');}
  if(mode==='linked-root'){const alias=f.root+'.alias';fs.symlinkSync(f.root,alias,process.platform==='win32'?'junction':'dir');input.rootPath=alias;input.filePath=path.join(alias,'sub','input.yaml');}
  const spy=mock.method(fsp,'open',async(...args)=>{opened++;return open(...args);});
  try{await assert.rejects(()=>read().readStableReviewInputText({...input,operation:op}),e=>e.code==='bounded_document_source_invalid',mode);assert.equal(opened,0);clean(op);}finally{spy.mock.restore();op.dispose();}
 }
});

// Break: adding an optional root silently removes existing standalone hardlink compatibility.
test('standalone_stable_reader_keeps_existing_contract',async()=>{
 const f=fixture();fs.linkSync(f.filePath,path.join(f.sub,'second.yaml'));const {rootPath,...standalone}=f,op=owner();
 try{assert.equal(await read().readStableDiffFixtureText(standalone),'hello');assert.equal(await read().readStableReviewInputText({...standalone,operation:op}),'hello');assert.equal(op.snapshot().categories.find(row=>row.category==='total_operation_input_bytes').committed,5);}finally{op.dispose();}
});
