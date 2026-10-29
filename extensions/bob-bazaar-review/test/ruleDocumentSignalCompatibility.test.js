'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const api=require('../out/ruleAuthoring/extraction/documentExtractor'),{DEFAULT_RULE_AUTHORING_LIMITS:defaults}=require('../out/ruleAuthoring/ruleAuthoringLimits');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'bob-t15-signal-'));t.after(async()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true});});const filePath=path.join(root,'source.pdf');await fs.writeFile(filePath,'legacy');return filePath;}

// Break caught: combining ignored signals or dropping nested PDF command/timeout/runner options.
test('single_and_batch_signal_precedence_preserves_nested_pdf_options',async t=>{
 const filePath=await fixture(t),active=new AbortController(),ignored=new AbortController();ignored.abort(new Error('ignored'));let calls=0;
 const pdf={signal:ignored.signal,command:'custom-pdftotext',timeoutMs:1234,runner:async options=>{calls++;assert.strictEqual(options.signal,active.signal);assert.equal(options.command,'custom-pdftotext');assert.equal(options.timeoutMs,1234);assert.equal(options.maxBufferBytes,33554432);return{stdout:Buffer.from('A document policy with enough words for useful text extraction.\n'),stderr:Buffer.alloc(0),exitCode:0};}};
 const one=await api.extractRuleDocument({filePath,signal:active.signal,pdf});assert.ok(one.chunks.length>0);
 const batch=await api.extractRuleDocuments([{filePath,signal:ignored.signal,pdf}],undefined,defaults,{signal:active.signal});assert.equal(batch.documents.length,1);assert.equal(calls,2);
 const fallback={...pdf,signal:active.signal};await api.extractRuleDocument({filePath,pdf:fallback});assert.equal(calls,3);
});

// Break caught: returning a blocked PDF result after the operation's effective signal cancels.
test('pdf_await_cancellation_discards_result_and_preserves_first_error_reason',async t=>{
 const filePath=await fixture(t),c=new AbortController(),reason=new Error('cancelled after PDF await');await assert.rejects(()=>api.extractRuleDocument({filePath,signal:c.signal,pdf:{runner:async()=>{c.abort(reason);return{stdout:Buffer.from('Text that must never be accepted after cancellation.'),stderr:Buffer.alloc(0),exitCode:0};}}}),e=>e===reason);
});
