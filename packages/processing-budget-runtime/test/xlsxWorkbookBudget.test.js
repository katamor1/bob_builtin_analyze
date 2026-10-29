'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const h=require('./helpers/boundedDocumentFixtures');
const runtime=()=>h.load('workbookBudget');
const workbook=(sheets='<sheet name="S" sheetId="1" r:id="r1"/>')=>'<workbook xmlns:r="urn:rel"><sheets>'+sheets+'</sheets></workbook>';
const rels=(entries='<Relationship Id="r1" Type="urn:spreadsheet/worksheet" Target="worksheets/s1.xml"/>')=>'<Relationships>'+entries+'</Relationships>';
const worksheet=(rows='',dimension)=>'<worksheet>'+(dimension===undefined?'':'<dimension ref="'+dimension+'"/>')+'<sheetData>'+rows+'</sheetData></worksheet>';
function inspect(parts){const o=runtime().createXlsxInspectionObserver();for(const [name,xml]of parts)o.observeEntry(name,Buffer.isBuffer(xml)?xml:Buffer.from(xml));return o.finish();}
const parts=(sheet=worksheet('<row r="1"><c r="A1"/></row>'))=>[['xl/workbook.xml',workbook()],['xl/_rels/workbook.xml.rels',rels()],['xl/worksheets/s1.xml',sheet]];

// Break caught: assuming workbook/rels precede sheets, or ignoring unsafe required targets.
test('xlsx_inspection_is_entry_order_independent_and_checks_relationship_targets',()=>{
 const p=parts(),forward=inspect(p),reverse=inspect(p.slice().reverse());assert.deepEqual(forward,reverse);assert.deepEqual(forward.sheets,[{name:'S',partName:'xl/worksheets/s1.xml',rowSpan:1}]);assert.equal(Object.isFrozen(forward),true);assert.equal(Object.isFrozen(forward.sheets[0]),true);
 const relative=parts();relative[1][1]=rels('<Relationship Id="r1" Type="urn:x/worksheet" Target="../xl/worksheets/./s1.xml"/>');assert.equal(inspect(relative).sheets[0].rowSpan,1);
 for(const target of ['../../escape.xml','worksheets\\s1.xml','worksheets/s1.xml?x','worksheets/s1.xml#x','worksheets/&#1;s1.xml']){const q=parts();q[1][1]=rels('<Relationship Id="r1" Type="urn:x/worksheet" Target="'+target+'"/>');assert.throws(()=>inspect(q));}
 for(const relationship of ['<Relationship Id="r1" Type="urn:x/worksheet" Target="https://host/s.xml" TargetMode="External"/>','<Relationship Id="r1" Type="urn:x/image" Target="worksheets/s1.xml"/>','<Relationship Id="other" Type="urn:x/worksheet" Target="worksheets/s1.xml"/>']){const q=parts();q[1][1]=rels(relationship);assert.throws(()=>inspect(q));}
 const duplicate=parts();duplicate[0][1]=workbook('<sheet name="A" r:id="r1"/><sheet name="B" r:id="r2"/>');duplicate[1][1]=rels('<Relationship Id="r1" Type="urn:x/worksheet" Target="worksheets/s1.xml"/><Relationship Id="r2" Type="urn:x/worksheet" Target="worksheets/s1.xml"/>');assert.throws(()=>inspect(duplicate));
 for(const omitted of [0,1,2])assert.throws(()=>inspect(parts().filter((_,i)=>i!==omitted)));
 const unrelated=parts();unrelated.unshift(['xl/custom/unused.xml',Buffer.from([0xff,0xfe])]);assert.equal(inspect(unrelated).sheets[0].rowSpan,1);
});

// Break caught: counting nonempty rows or dimension instead of explicit/implicit/cell span.
test('sparse_explicit_implicit_cell_rows_ignore_dimension',()=>{
 const {commitXlsxWorkbookBudget}=runtime(),inspection=inspect(parts(worksheet('<row r="100"><c r="A100"/></row><row/><row/>','A1:A1')));
 assert.deepEqual(inspection.sheets.map(x=>x.rowSpan),[102]);
 const header0=commitXlsxWorkbookBudget({ledger:h.observeLedger(),workbookTarget:'b',inspection,headerRows:0}),header1=commitXlsxWorkbookBudget({ledger:h.observeLedger(),workbookTarget:'c',inspection,headerRows:1});assert.equal(header0.totalRows,102);assert.equal(header1.totalRows,101);
 assert.equal(inspect(parts(worksheet('<row r="1"><c r="A200"/></row>'))).sheets[0].rowSpan,200);assert.equal(inspect(parts(worksheet(''))).sheets[0].rowSpan,0);
 for(const rows of ['<row r="0"/>','<row r="-1"/>','<row r="1.5"/>','<row r="9007199254740992"/>','<row r="9007199254740991"/><row/>','<row><c r="A0"/></row>'])assert.throws(()=>inspect(parts(worksheet(rows))));
 const zero=commitXlsxWorkbookBudget({ledger:h.observeLedger(),workbookTarget:'empty',inspection:inspect(parts(worksheet(''))),headerRows:1});assert.equal(zero.totalRows,0);
});

// Break caught: accepting malformed required XML or resolving attacker entity declarations.
test('strict_xml_rejects_utf8_dtd_entities_duplicate_attributes_and_unsafe_scalars',()=>{
 for(const xml of [Buffer.from([0xff]),'<!DOCTYPE worksheet [<!ENTITY x "100">]><worksheet/>','<!ENTITY x "100"><worksheet/>','<!bogus x><worksheet/>','<worksheet><row r="1" r="2"/></worksheet>','<worksheet><row r="&unknown;"/></worksheet>','<worksheet><row r="&#0;"/></worksheet>','<worksheet><row r="&#xD800;"/></worksheet>','<worksheet><row r="&#x110000;"/></worksheet>','<worksheet><row r=1/></worksheet>','<worksheet><row r="1></row></worksheet>','<worksheet><row></worksheet>'])assert.throws(()=>inspect(parts(xml)));
 const valid=parts(worksheet('<?ok ignored?><!-- <row r="999"/> --><![CDATA[<row r="999"/>]]><row r="&#49;"><c r="A1"/></row>'));
 valid[0][1]=workbook('<sheet name="A&amp;B&quot;C" r:id="r1"/>');const result=inspect(valid);assert.equal(result.sheets[0].name,'A&B"C');assert.equal(result.sheets[0].rowSpan,1);
});

// Break caught: trusting a parser to materialize additional/duplicate sheets or excess rows.
test('parsed_workbook_cannot_exceed_inspected_names_or_span',()=>{
 const {assertParsedXlsxWorkbookWithinBudget}=runtime(),inspection=inspect(parts(worksheet('<row r="2"/>')));
 assert.doesNotThrow(()=>assertParsedXlsxWorkbookWithinBudget([{sheet:'S',data:[[],[]]}],inspection));assert.doesNotThrow(()=>assertParsedXlsxWorkbookWithinBudget([],inspection));
 for(const parsed of [[{sheet:'S',data:[[],[],[]]}],[{sheet:'Unknown',data:[]}],[{sheet:'S',data:[]},{sheet:'S',data:[]}]])assert.throws(()=>assertParsedXlsxWorkbookWithinBudget(parsed,inspection));
 assert.throws(()=>assertParsedXlsxWorkbookWithinBudget([],{sheets:[...inspection.sheets,...inspection.sheets]}));
 const all=parts(worksheet('<row r="501"/>'));all[0][1]=workbook('<sheet name="S" r:id="r1"/><sheet name="Hidden" r:id="r2"/>');all[1][1]=rels('<Relationship Id="r1" Type="urn:x/worksheet" Target="worksheets/s1.xml"/><Relationship Id="r2" Type="urn:x/worksheet" Target="worksheets/s2.xml"/>');all.push(['xl/worksheets/s2.xml',worksheet('<row r="501"/>')]);const ledger=h.observeLedger();assert.throws(()=>runtime().commitXlsxWorkbookBudget({ledger,workbookTarget:'all',inspection:inspect(all),headerRows:0}));assert.equal(ledger.snapshot().categories.every(x=>x.reserved===0),true);
});

// Break caught: caller inspection array accessors executing before data validation.
test('inspection_array_accessors_and_holes_are_rejected_without_getter_execution',()=>{
 let getters=0;const sheets=[];Object.defineProperty(sheets,'0',{enumerable:true,get(){getters++;return{name:'S',partName:'xl/worksheets/s.xml',rowSpan:1};}});
 const ledger=h.observeLedger();assert.throws(()=>runtime().commitXlsxWorkbookBudget({ledger,workbookTarget:'getter',inspection:{sheets},headerRows:0}));assert.equal(getters,0);assert.equal(ledger.snapshot().categories.every(x=>x.used===0),true);
 assert.throws(()=>runtime().commitXlsxWorkbookBudget({ledger,workbookTarget:'sparse',inspection:{sheets:new Array(1)},headerRows:0}));
});

// Break caught: the real parser allocates dimension rows and trims them before
// the post-check, hiding an allocation larger than the admitted reference span.
test('real_pinned_xlsx_parsers_reject_dimension_allocation_before_parser',async t=>{
 const path=require('node:path'),{createRequire}=require('node:module'),fs=require('node:fs'),root=path.resolve(__dirname,'../../..');
 const fixtures=require(path.join(root,'extensions/bob-bazaar-review/test/helpers/ruleDocumentFixtures.js')),codec=require('fflate'),base=codec.unzipSync(fixtures.createXlsxFixture());
 const sheetParts=Object.keys(base).filter(name=>/^xl\/worksheets\/[^/]+\.xml$/.test(name));assert.ok(sheetParts.length>0);for(const name of sheetParts)base[name]=codec.strToU8('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:A1001"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>one</t></is></c></row></sheetData></worksheet>');
 const bytes=Buffer.from(codec.zipSync(base));
 for(const [extension,version,headerRows]of [['bob-bazaar-review','9.3.1',0],['bob-code-consistency-review','9.2.0',1]])await t.test(extension,async()=>{
  const requireConsumer=createRequire(path.join(root,'extensions',extension,'package.json')),reader=requireConsumer('read-excel-file/node'),readExcel=reader.default??reader;
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'extensions',extension,'node_modules/read-excel-file/package.json'))).version,version);
  async function measuredRead(buffer){const OriginalArray=global.Array;let peak=0;global.Array=new Proxy(OriginalArray,{construct(target,args,newTarget){if(args.length===1&&typeof args[0]==='number')peak=Math.max(peak,args[0]);return Reflect.construct(target,args,newTarget);}});try{return{data:await readExcel(buffer),peak};}finally{global.Array=OriginalArray;}}
  const vulnerable=await measuredRead(bytes);assert.equal(vulnerable.data.length,sheetParts.length);assert.ok(vulnerable.data.every(sheet=>sheet.data.length===1));assert.equal(vulnerable.peak,1001,'baseline must observe actual pinned parser allocation');
  const f=h.fixture(bytes),api=h.load('index'),op=h.load('documentBudget').createDocumentOperation({selectedDocumentCount:1,profile:api.normalizeProcessingBudgetProfile({limits:{rows_per_sheet:10}})}),admission=await op.fingerprintSelection(0,{filePath:f.filePath,rootPath:f.root,maximumFileBytes:25*1048576});let parserCalls=0;
  await assert.rejects(()=>op.withValidatedOoxml(admission,{documentKind:'xlsx',xlsxBudget:{headerRows},structuralLimits:{maxEntries:5000,maxExpandedBytes:250*1048576},loadXlsxCodec:async()=>h.codec()},async({parserInput:buffer,workbookInspection:inspection})=>{parserCalls++;const parsed=await measuredRead(buffer);const result=parsed.data;runtime().assertParsedXlsxWorkbookWithinBudget(result,inspection);return result;}),error=>error.code==='bounded_document_archive_invalid');
  assert.equal(parserCalls,0);const snapshot=op.snapshot();assert.equal(snapshot.categories.every(row=>row.reserved===0),true);for(const category of ['sheets_per_workbook','rows_per_sheet'])assert.equal(snapshot.categories.find(row=>row.category===category).committed,0);assert.equal(snapshot.categories.find(row=>row.category==='total_document_bytes').committed,bytes.length);
 });
});

test('dimension_claims_cannot_expand_span_and_empty_sheets_keep_zero_rows',()=>{
 for(const ref of ['A1:A1001','A1001','A1000:A1001','A1:A9007199254740992'])assert.throws(()=>inspect(parts(worksheet('<row r="1"><c r="A1"/></row>',ref))),error=>error.code==='bounded_document_archive_invalid');
 for(const ref of ['A1','A1:A1','A1:A3']){const inspection=inspect(parts(worksheet('<row r="1"><c r="A1"/></row><row r="3"/>',ref)));assert.equal(inspection.sheets[0].rowSpan,3);for(const headerRows of [0,1])assert.equal(runtime().commitXlsxWorkbookBudget({ledger:h.observeLedger(),workbookTarget:'safe-'+headerRows,inspection,headerRows}).totalRows,3-headerRows);}
 assert.equal(inspect(parts(worksheet('','A1:A999999'))).sheets[0].rowSpan,0);
 const all=parts();all[0][1]=workbook('<sheet name="S" r:id="r1"/><sheet name="Hidden" r:id="r2"/>');all[1][1]=rels('<Relationship Id="r1" Type="urn:x/worksheet" Target="worksheets/s1.xml"/><Relationship Id="r2" Type="urn:x/worksheet" Target="worksheets/s2.xml"/>');all.push(['xl/worksheets/s2.xml',worksheet('<row r="1"><c r="A1"/></row>','A1:A1001')]);assert.throws(()=>inspect(all),error=>error.code==='bounded_document_archive_invalid');
});
