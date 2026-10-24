const {test}=require('node:test'),assert=require('node:assert/strict');
test('document_source_setting_describes_whole_source_rejection',()=>{
 const setting=require('../package.json').contributes.configuration.properties['bobCodeConsistency.maxDocumentBytes'];assert.equal(setting.default,5*1048576);assert.equal(setting.minimum,1);assert.equal(setting.maximum,50*1048576);assert.match(setting.description,/原本全体/);assert.match(setting.description,/超過時.*抽出しない/);assert.doesNotMatch(setting.description,/Markdown は上限まで読み/);
});
