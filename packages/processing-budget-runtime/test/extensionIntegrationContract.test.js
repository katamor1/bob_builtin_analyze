'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');const h=require('./helpers');
test('packed_bounded_runtime_and_declarations_work_offline',()=>{
 const proof=h.packAndInstall(h.packageRoot,h.freshArtifactRoot('bounded-pack'));const receipt=JSON.parse(fs.readFileSync(proof.receipt.path));assert.equal(proof.manifest.length,40);assert.ok(receipt.runtimeResult.checks.includes('bounded_read'));assert.ok(receipt.runtimeResult.checks.includes('validated_ooxml'));assert.equal(receipt.consumerResults.length,3);
});
test('product_deep_imports_are_rejected',()=>{
 const proof=h.packAndInstall(h.packageRoot,h.freshArtifactRoot('exports-pack'));
 const child=cp.spawnSync(process.execPath,['-e',"const a=require('node:assert/strict');a.throws(()=>require('@bob/processing-budget-runtime/out/ooxmlParserInput'),e=>e.code==='ERR_PACKAGE_PATH_NOT_EXPORTED');a.equal(typeof require('@bob/processing-budget-runtime/validated-ooxml').withValidatedOoxmlParserInput,'function');a.equal(require('@bob/processing-budget-runtime').prepareOoxmlParserInput,undefined);"],{cwd:proof.consumerRoot,encoding:'utf8',env:{...process.env,NODE_PATH:'',NODE_OPTIONS:''}});assert.equal(child.status,0,child.stderr);
});
