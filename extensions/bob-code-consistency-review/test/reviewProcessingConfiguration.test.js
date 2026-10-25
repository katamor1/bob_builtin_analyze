const {test}=require('node:test'),assert=require('node:assert/strict');
test('command_override_precedes_config_and_direct_call_uses_default',()=>{
 const {reviewProcessingLimitsFromConfiguration:limits}=require('../out/reviewProcessingConfiguration');const keys=[];const config={get(key){keys.push(key);return{maxDocumentBytes:100,maxRowsPerSheet:25}[key];}};
 const effective=limits(config,{maxDocumentBytes:17,maxRowsPerSheet:undefined});assert.equal(effective.maxDocumentBytes,17);assert.equal(effective.maxRowsPerSheet,25);assert.equal(effective.maxWorkbookSheets,20);assert.equal(keys.length,6);
 const defaults=limits({get(){return undefined;}});assert.equal(defaults.maxDocumentBytes,5*1048576);assert.equal(defaults.maxBobInputBytes,2*1048576);
 assert.equal(limits({get(){return Number.MAX_SAFE_INTEGER;}}).maxDocumentBytes,50*1048576);assert.equal(limits(config,{maxDocumentBytes:0.1}).maxDocumentBytes,1);
});
