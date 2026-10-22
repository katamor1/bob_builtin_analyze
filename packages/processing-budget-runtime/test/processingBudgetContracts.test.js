'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const {packageRoot,loadRuntime}=require('./helpers');
const expected=[
 ['single_document_bytes','target',5242880,52428800,'total_document_bytes'],
 ['total_document_bytes','operation',33554432,268435456,'total_operation_input_bytes'],
 ['document_count','operation',128,1024,null],['sheets_per_workbook','target',20,100,'total_sheets'],
 ['total_sheets','operation',100,1000,null],['rows_per_sheet','target',500,5000,'total_rows'],
 ['total_rows','operation',25000,250000,null],['changed_files','operation',5000,20000,null],
 ['raw_diff_bytes','operation',1048576,10485760,'total_operation_input_bytes'],
 ['document_excerpt_bytes','operation',2097152,8388608,'total_operation_input_bytes'],
 ['bob_input_bytes','operation',2097152,8388608,'total_operation_input_bytes'],
 ['managed_artifact_bytes','operation',16777216,67108864,null],
 ['total_operation_input_bytes','operation',67108864,268435456,null]];
test('definition_is_the_exact_ordered_13_category_table',()=>{
 const definition=JSON.parse(fs.readFileSync(path.join(packageRoot,'contracts/processing-budget-definition.v1.json'),'utf8'));
 assert.deepEqual(definition.categories.map(c=>[c.id,c.scope,c.default,c.absolute_maximum,c.aggregate_into]),expected);
 const r=loadRuntime('generatedProcessingBudgetDefinition');
 assert.deepEqual(r.PROCESSING_BUDGET_DEFINITION.map(c=>[c.id,c.scope,c.defaultLimit,c.absoluteMaximum,c.aggregateInto]),expected);
 assert.strictEqual(r.PROCESSING_BUDGET_MANIFEST_MAXIMA,r.PROCESSING_BUDGET_ABSOLUTE_MAXIMA);
 assert.equal(r.MEBIBYTE_BYTES,1048576);
 assert.ok(Object.isFrozen(r.PROCESSING_BUDGET_DEFINITION)&&r.PROCESSING_BUDGET_DEFINITION.every(Object.isFrozen));
 const schema=JSON.parse(fs.readFileSync(path.join(packageRoot,'schema/processing-budget-profile.v1.schema.json'),'utf8'));
 assert.deepEqual(schema.properties.limits.required,expected.map(x=>x[0]));
 for(const [id,, ,max] of expected) assert.equal(schema.properties.limits.properties[id].maximum,max);
 assert.equal(schema.additionalProperties,false);assert.equal(schema.properties.limits.additionalProperties,false);
});
test('generated_contracts_reject_drift_and_invalid_definition',()=>{
 const root=fs.mkdtempSync(path.join(process.env.PROCESSING_BUDGET_ARTIFACT_ROOT||os.tmpdir(),'bob-processing-budget-ledger-contract-'));
 for(const dir of ['scripts','contracts','src','schema']) fs.mkdirSync(path.join(root,dir));
 const script='scripts/generate-processing-budget-contracts.js', definition='contracts/processing-budget-definition.v1.json';
 fs.copyFileSync(path.join(packageRoot,script),path.join(root,script));
 const raw=fs.readFileSync(path.join(packageRoot,definition));
 fs.writeFileSync(path.join(root,definition),raw);
 const run=(args=[])=>cp.spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8'});
 assert.equal(run().status,0);assert.equal(run(['--check']).status,0);
 fs.appendFileSync(path.join(root,'src/generatedProcessingBudgetDefinition.ts'),' ');
 assert.notEqual(run(['--check']).status,0);assert.equal(run().status,0);
 assert.notEqual(run(['--unknown']).status,0);
 const imported=cp.spawnSync(process.execPath,['-e',`require(${JSON.stringify(path.join(root,script))})`],{cwd:root,encoding:'utf8'});
 assert.equal(imported.status,0);assert.equal(imported.stdout,'');
 const invalid=[d=>{d.unknown=1},d=>{d.categories[0].default=-1},d=>{d.categories[0].absolute_maximum=Number.MAX_SAFE_INTEGER+1},d=>{d.categories[1].aggregate_into='single_document_bytes'},d=>{d.categories[1].aggregate_into='raw_diff_bytes';d.categories[8].aggregate_into='total_document_bytes';d.categories[1].default=1;d.categories[1].absolute_maximum=1},d=>{d.categories[0].unit='count'},d=>{d.categories[0].aggregate_into='absent'},d=>{d.categories[0].default=999999999},d=>{d.categories[0].extra=true},d=>{d.categories[1].id=d.categories[0].id}];
 for(const mutate of invalid){const d=JSON.parse(raw);mutate(d);fs.writeFileSync(path.join(root,definition),JSON.stringify(d));assert.notEqual(run().status,0);}
 fs.writeFileSync(path.join(root,definition),Buffer.from([0xff]));assert.notEqual(run().status,0);
});
test('runtime_graph_has_no_effectful_imports',()=>{
 assert.ok(fs.existsSync(path.join(packageRoot,'src/generatedProcessingBudgetDefinition.ts')),'generated runtime must exist');
 const ts=require('typescript');
 const allowed=new Set(['./generatedProcessingBudgetDefinition','./processingBudgetError','./processingBudgetProfile','./processingBudgetLedger']);
 for(const file of fs.readdirSync(path.join(packageRoot,'src')).filter(x=>x.endsWith('.ts'))){
  const tree=ts.createSourceFile(file,fs.readFileSync(path.join(packageRoot,'src',file),'utf8'),ts.ScriptTarget.Latest,true);
  function walk(n){
   if(ts.isImportDeclaration(n)||ts.isExportDeclaration(n)) {if(n.moduleSpecifier) assert.ok(allowed.has(n.moduleSpecifier.text),'effectful or unknown runtime dependency');}
   if(ts.isCallExpression(n)&&((ts.isIdentifier(n.expression)&&n.expression.text==='require')||n.expression.kind===ts.SyntaxKind.ImportKeyword)) assert.fail('dynamic runtime import');
   if(ts.isIdentifier(n)&&['process','Buffer','fetch','eval','Function','globalThis','setTimeout'].includes(n.text)) assert.fail('effectful runtime global');
   ts.forEachChild(n,walk);
  } walk(tree);
 }
});
