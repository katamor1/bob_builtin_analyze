import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
const subject=await import('../lib/primitives.mjs').catch(()=>({}));
const {canonicalBytes,digestBytes,boundedDiagnosticText,snapshotClosedData,decodeUtf8,WorkflowEvidenceError}=subject;

test('primitives_are_closed_bounded_and_locale_independent',()=>{
 assert.equal(typeof snapshotClosedData,'function','closed evidence snapshot is missing');
 let getters=0;assert.throws(()=>snapshotClosedData(Object.defineProperty({},'x',{enumerable:true,get(){getters++;return 0;}})));assert.equal(getters,0);
 const revoked=Proxy.revocable({},{});revoked.revoke();
 const cycle={};cycle.x=cycle;const shared={x:1};
 for(const bad of [new Proxy({},{}),revoked.proxy,[,],new Date(),{a:shared,b:shared},cycle,JSON.parse('{"__proto__":1}'),{constructor:1},{x:Infinity},{x:'\ud800'}])assert.throws(()=>snapshotClosedData(bad));
 const frozen=snapshotClosedData({z:[{b:1}],a:'ok'});assert.ok(Object.isFrozen(frozen));assert.ok(Object.isFrozen(frozen.z[0]));
 assert.deepEqual(canonicalBytes({b:2,a:1}),Buffer.from('{"a":1,"b":2}\n'));
 assert.deepEqual(canonicalBytes({'é':1,'Z':2,'あ':3}),Buffer.from('{"Z":2,"é":1,"あ":3}\n'));
 assert.equal(digestBytes(Buffer.from('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.throws(()=>canonicalBytes({x:'"'.repeat(4*1024*1024)}));
 const tooDeep={};let cursor=tooDeep;for(let i=0;i<34;i++){cursor.next={};cursor=cursor.next;}assert.throws(()=>snapshotClosedData(tooDeep));
 assert.throws(()=>snapshotClosedData(Array.from({length:20001},()=>0)));
});

test('strict_utf8_preserves_bytes_and_bounds_diagnostics',()=>{
 assert.equal(typeof decodeUtf8,'function','fatal evidence UTF8 decoder is missing');
 assert.equal(decodeUtf8(Buffer.from('界')),'界');
 for(const bytes of [[0xff],[0xc0,0x80],[0xed,0xa0,0x80],[0xef,0xbb,0xbf,0x7b,0x7d]])assert.throws(()=>decodeUtf8(Buffer.from(bytes)));
 const text=boundedDiagnosticText('界'.repeat(300));assert.ok(Buffer.byteLength(text,'utf8')<=256);assert.ok(!text.includes('\ufffd'));
 assert.ok(!/[\u0000-\u001f\u007f-\u009f]/u.test(boundedDiagnosticText('\x00unsafe\r\n\x7f')));
 assert.throws(()=>boundedDiagnosticText('\ud800'));
 const error=new WorkflowEvidenceError('evidence.input.invalid',Array.from({length:4097},()=>({code:'invalid',path:'safe',message:'x'.repeat(400)})));
 assert.ok(error.diagnostics.length<=4096);assert.ok(Object.isFrozen(error.diagnostics));assert.ok(error.diagnostics.every(x=>Buffer.byteLength(x.message)<=256));
});

test('canonical_documents_match_existing_p4_encoder_plus_lf',()=>{
 assert.equal(typeof canonicalBytes,'function','canonical evidence encoder is missing');
 const require=createRequire(import.meta.url),p4=require('../../../extensions/workflow-register/out/core/contractV2/canonicalJson.js');
 const value={z:[true,null,{'é':3,a:'x'}],a:0};
 assert.deepEqual(canonicalBytes(value),Buffer.concat([p4.canonicalJsonBytes(value),Buffer.from('\n')]));
});

test('canonical_documents_reject_negative_zero_like_p4',()=>{
 const require=createRequire(import.meta.url),p4=require('../../../extensions/workflow-register/out/core/contractV2/canonicalJson.js');
 assert.throws(()=>p4.canonicalJsonBytes({a:-0}));
 assert.throws(()=>canonicalBytes({a:-0}));
});
