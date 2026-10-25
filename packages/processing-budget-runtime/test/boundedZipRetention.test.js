'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib');const h=require('./helpers/boundedDocumentFixtures');
test('normalization_inflates_each_entry_once_and_loads_codec_only_after_validation',async()=>{
 const api=h.load('validatedOoxml'),f=await h.request(h.buildZip(h.entries('xlsx',[{name:'xl/worksheets/sheet1.xml',data:'sheet',method:8}])),'xlsx');let inflates=0,loads=0,retained;const inflate=zlib.inflateRawSync;
 const m=mock.method(zlib,'inflateRawSync',(...args)=>{inflates++;return inflate(...args);});f.request.loadXlsxCodec=async()=>{loads++;assert.equal(inflates,2);const codec=h.codec();return{strToU8:codec.strToU8,zipSync:map=>{retained=map;return codec.zipSync(map);}};};
 try{const output=await api.withValidatedOoxmlParserInput(f.request,async input=>input);assert.equal(inflates,2);assert.equal(loads,1);assert.equal(output.normalization,'xlsx_minimal_styles');assert.deepEqual(Object.keys(retained).sort(),['[Content_Types].xml','xl/styles.xml','xl/workbook.xml','xl/worksheets/sheet1.xml']);assert.equal(h.openReservations(f.input.ledger),0);}finally{m.mock.restore();}
});
