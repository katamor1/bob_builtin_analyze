const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('legacy_ooxml_product_owners_have_no_io_decode_or_preflight_exports',()=>{
 const root=path.resolve(__dirname,'../src/ruleAuthoring/extraction'),ts=require('typescript');
 for(const name of ['ooxmlArchive.ts','ooxmlPreflight.ts']){const source=fs.readFileSync(path.join(root,name),'utf8'),tree=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true);let violations=0;
  function visit(n){if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&/^(node:|fflate$)/.test(n.moduleSpecifier.text))violations++;if(ts.isIdentifier(n)&&['prepareOoxmlParserInput','preflightOoxmlArchive','inflateRawSync','decodeEntry'].includes(n.text))violations++;ts.forEachChild(n,visit);}visit(tree);assert.equal(violations,0,name);
 }
});
