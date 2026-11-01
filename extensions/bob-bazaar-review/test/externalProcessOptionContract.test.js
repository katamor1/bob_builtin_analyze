'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
// Break: a typed process caller retains the deprecated combined allowance or omits an explicit stdout cap.
test('all_process_callers_use_explicit_stdout_without_legacy_alias',()=>{
 let calls=0;
 for(const relative of ["src/bazaar/externalProcessRunner.ts","src/bazaar/bazaar.ts","src/ruleAuthoring/extraction/pdfExtractor.ts","src/ruleAuthoring/extraction/documentExtractor.ts"]){
  const source=fs.readFileSync(path.join(__dirname,'..',relative),'utf8'),tree=ts.createSourceFile(relative,source,ts.ScriptTarget.Latest,true);
  function visit(node){
   if(ts.isIdentifier(node))assert.notEqual(node.text,'maxBufferBytes',relative);
   if(ts.isCallExpression(node)&&((ts.isIdentifier(node.expression)&&['runExternalProcess','runner'].includes(node.expression.text))||(ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.kind===ts.SyntaxKind.ThisKeyword&&node.expression.name.text==='processRunner'))){const options=node.arguments[0];assert.ok(options&&ts.isObjectLiteralExpression(options),relative);assert.ok(options.properties.some(p=>p.name?.getText(tree)==='maxStdoutBytes'),relative);calls++;}
   ts.forEachChild(node,visit);
  }visit(tree);
 }
 assert.equal(calls,2);
});
