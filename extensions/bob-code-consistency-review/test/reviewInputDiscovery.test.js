const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const api=require('../out/core/reviewInputDiscovery'),shared=require('../out/sharedProcessingBudgetRuntime');const {createXlsxFixture}=require('../../bob-bazaar-review/test/helpers/ruleDocumentFixtures');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'bob-discovery-bounded-'));fs.mkdirSync(path.join(root,'docs'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('discovery_uses_bounded_markdown_and_verified_xlsx_buffers',async t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'docs/a.md'),'# REQ-DISCOVERY-001\n');fs.writeFileSync(path.join(root,'docs/b.xlsx'),createXlsxFixture());let markdown=0,xlsx=0,buffers=0;
 const read=shared.readBoundedDocumentFile,parse=shared.withValidatedOoxmlParserInput,m=mock.method(shared,'readBoundedDocumentFile',async request=>{markdown++;assert.equal(request.maximumFileBytes,5*1048576);return read(request);}),p=mock.method(shared,'withValidatedOoxmlParserInput',async(request,callback)=>{xlsx++;return parse(request,callback);});
 const original=Module._load;Module._load=function(request,parent,isMain){const loaded=original.call(this,request,parent,isMain);if(request==='read-excel-file/node'){const wrapper=(input,...args)=>{buffers++;assert.ok(Buffer.isBuffer(input));return loaded(input,...args);};Object.assign(wrapper,loaded);return wrapper;}return loaded;};
 try{const result=await api.discoverReviewInputCandidates(root);assert.equal(markdown,1);assert.equal(xlsx,1);assert.equal(buffers,1);assert.deepEqual(result.documents[0].sections,['REQ-DISCOVERY-001']);assert.deepEqual(result.documents[1].sheets,['Second','First']);assert.deepEqual(result.warnings,[]);}finally{Module._load=original;m.mock.restore();p.mock.restore();}
});
test('rejected_discovery_preserves_path_candidate_without_ids',async t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'docs/large.md'),'REQ-PRIVATE-001');fs.writeFileSync(path.join(root,'docs/bad.xlsx'),'not zip');const r=await api.discoverReviewInputCandidates(root,{limits:{maxDocumentBytes:1}});assert.equal(r.documents.length,2);assert.ok(r.warnings.length>=2);for(const d of r.documents){assert.ok(['docs/large.md','docs/bad.xlsx'].includes(d.path));assert.equal(d.sections,undefined);assert.equal(d.rows,undefined);assert.equal(d.sheets,undefined);}
});
test('changed_xlsx_discovery_discards_sheet_and_id_candidates',async t=>{
 const root=fixture(t),filePath=path.join(root,'docs/book.xlsx'),bytes=createXlsxFixture();fs.writeFileSync(filePath,bytes);const original=shared.withValidatedOoxmlParserInput,m=mock.method(shared,'withValidatedOoxmlParserInput',async(request,parse)=>original(request,async input=>{const result=await parse(input);const changed=Buffer.from(bytes);changed[40]^=1;fs.writeFileSync(filePath,changed);return result;}));
 try{const r=await api.discoverReviewInputCandidates(root);assert.equal(r.documents[0].path,'docs/book.xlsx');assert.equal(r.documents[0].sheets,undefined);assert.equal(r.documents[0].rows,undefined);assert.ok(r.warnings.some(w=>w.includes('bounded document source changed')));}finally{m.mock.restore();}
});
test('docx_candidates_do_not_load_parser_and_enumeration_limits_are_preserved',async t=>{
 const root=fixture(t);for(let n=0;n<4;n++)fs.writeFileSync(path.join(root,'docs',n+'.docx'),'candidate only');let loads=0;const original=Module._load;Module._load=function(request,...args){if(['mammoth','cheerio','read-excel-file/node','fflate'].includes(request))loads++;return original.call(this,request,...args);};
 try{const r=await api.discoverReviewInputCandidates(root,{maxFiles:2,maxIdsPerFile:1,limits:{maxDocumentBytes:1}});assert.deepEqual(r.documents.map(x=>x.path),['docs/0.docx','docs/1.docx']);assert.equal(loads,0);assert.deepEqual(r.warnings,[]);}finally{Module._load=original;}
});
