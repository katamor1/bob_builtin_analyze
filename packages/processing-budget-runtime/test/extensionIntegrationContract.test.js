'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');const h=require('./helpers');
test('packed_bounded_runtime_and_declarations_work_offline',()=>{
 const proof=h.packAndInstall(h.packageRoot,h.freshArtifactRoot('bounded-pack'));const receipt=JSON.parse(fs.readFileSync(proof.receipt.path));assert.equal(proof.manifest.length,46);assert.ok(receipt.runtimeResult.checks.includes('bounded_read'));assert.ok(receipt.runtimeResult.checks.includes('validated_ooxml'));assert.equal(receipt.consumerResults.length,3);
});
test('product_deep_imports_are_rejected',()=>{
 const proof=h.packAndInstall(h.packageRoot,h.freshArtifactRoot('exports-pack'));
 const child=cp.spawnSync(process.execPath,['-e',"const a=require('node:assert/strict');a.throws(()=>require('@bob/processing-budget-runtime/out/ooxmlParserInput'),e=>e.code==='ERR_PACKAGE_PATH_NOT_EXPORTED');a.equal(typeof require('@bob/processing-budget-runtime/validated-ooxml').withValidatedOoxmlParserInput,'function');a.equal(require('@bob/processing-budget-runtime').prepareOoxmlParserInput,undefined);"],{cwd:proof.consumerRoot,encoding:'utf8',env:{...process.env,NODE_PATH:'',NODE_OPTIONS:''}});assert.equal(child.status,0,child.stderr);
});

test('closed_current_document_graph_passes_ast_boundary_policy',()=>{require('../scripts/check-document-boundary').checkDocumentBoundaries(path.resolve(h.packageRoot,'../..'));});


function boundaryFixture(){const root=h.freshArtifactRoot('aggregate-boundary');for(const name of ['bob-bazaar-review','bob-code-consistency-review']){const dir=path.join(root,'extensions',name);fs.mkdirSync(dir,{recursive:true});fs.cpSync(path.resolve(h.packageRoot,'../../extensions',name,'src'),path.join(dir,'src'),{recursive:true});}return root;}
test('coordinators_use_budgeted_operations_and_xlsx_inspection_before_parser',()=>{
 const root=boundaryFixture(),policy=require('../scripts/check-document-boundary');assert.doesNotThrow(()=>policy.checkDocumentBoundaries(root));
});
for(const useCrlf of [false,true])test('ast_policy_rejects_unawaited_member_callback_and_arbitrary_inspection'+(useCrlf?'_crlf':''),()=>{
 const root=boundaryFixture(),policy=require('../scripts/check-document-boundary'),ts=require('typescript');assert.doesNotThrow(()=>policy.checkDocumentBoundaries(root));
 const c='bob-code-consistency-review/src/',b='bob-bazaar-review/src/';
 const mutations=[
  [c+'analyzers/documentExtractor.ts',s=>s.replace('return operation.withValidatedOoxml','operation.withValidatedOoxml')],
  [b+'ruleAuthoring/extraction/ooxmlArchive.ts',s=>s.replace('return context.operation.withValidatedOoxml','context.operation.withValidatedOoxml')],
  [c+'analyzers/documentExtractor.ts',s=>s.replace('return operation.withValidatedOoxml','const invoke = operation.withValidatedOoxml; return invoke')],
  [b+'ruleAuthoring/extraction/ooxmlArchive.ts',s=>s.replace('context.operation.withValidatedOoxml','context.operation["withValidatedOoxml"]')],
  [c+'analyzers/documentExtractor.ts',s=>s.replace('workbookInspection: prepared.workbookInspection','workbookInspection: { sheets: [] }')],
  [b+'ruleAuthoring/extraction/documentExtractor.ts',s=>s.replace('workbookInspection: prepared.workbookInspection','workbookInspection: forged')],
  [c+'analyzers/documentExtractor.ts',s=>s.replace('async ({ parserInput, ...prepared })','async ({ parserInput, ...prepared })').replace('extractDocxChunks(parserInput, evidenceType','extractDocxChunks(Buffer.from("forged"), evidenceType')],
  [c+'analyzers/documentExtractor.ts',s=>s+'\nextractDocxChunks(Buffer.from("outside"), "requirement", []);\n'],
  [c+'analyzers/documentExtractor.ts',s=>'import * as deep from "../../../../packages/processing-budget-runtime/out/documentBudget"\n'+s],
  [b+'ruleAuthoring/extraction/documentExtractor.ts',s=>'import * as facade from "../../sharedProcessingBudgetRuntime"\n'+s],
  [c+'analyzers/documentXlsxExtractor.ts',s=>s.replace('  assertDocumentNotCancelled(options?.signal)\n  if (options?.workbookInspection)', '  if (options?.workbookInspection)')],
  [b+'ruleAuthoring/extraction/xlsxExtractor.ts',s=>s.replace('assertParsedXlsxWorkbookWithinBudget(workbook, context.workbookInspection)','assertParsedXlsxWorkbookWithinBudget(workbook, { sheets: [] })')],
  [c+'analyzers/documentXlsxExtractor.ts',s=>s.replace('  if (options?.workbookInspection) assertParsedXlsxWorkbookWithinBudget(workbook, options.workbookInspection)\n','')],
  [b+'ruleAuthoring/extraction/ooxmlArchive.ts',s=>s.replace('parse as BudgetedParser<T>','unverifiedParser as BudgetedParser<T>')],
  [c+'analyzers/documentExtractor.ts',s=>s.replace('headerRows: 1 as const','headerRows: 0 as const')],
  [b+'ruleAuthoring/extraction/ooxmlArchive.ts',s=>s.replace('headerRows: 0','headerRows: 1')]
 ];
 if(useCrlf)for(const relative of new Set(mutations.map(([relative])=>relative))){const file=path.join(root,'extensions',relative);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('\r\n','\n').replaceAll('\n','\r\n'));}
 for(const [relative,mutate]of mutations){const file=path.join(root,'extensions',relative),original=fs.readFileSync(file,'utf8'),input=original.replaceAll('\r\n','\n'),changed=mutate(input);assert.notEqual(changed,input,relative);assert.equal(ts.createSourceFile(file,changed,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0,relative);fs.writeFileSync(file,changed);try{assert.throws(()=>policy.checkDocumentBoundaries(root),/document boundary:/,relative);}finally{fs.writeFileSync(file,original);}}
});
test('legacy_discovery_keeps_normal_t14_owner_without_aggregate_scope_creep',()=>{
 const root=boundaryFixture(),policy=require('../scripts/check-document-boundary'),file=path.join(root,'extensions/bob-code-consistency-review/src/core/reviewInputDiscovery.ts'),source=fs.readFileSync(file,'utf8');assert.match(source,/withValidatedOoxmlParserInput/);assert.doesNotMatch(source,/createDocumentOperation|withValidatedOoxml\(/);assert.doesNotThrow(()=>policy.checkDocumentBoundaries(root));fs.appendFileSync(file,'\nconst alias = withValidatedOoxmlParserInput;\n');assert.throws(()=>policy.checkDocumentBoundaries(root),/document boundary:/);
});
