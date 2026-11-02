'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),r=require('../out'),h=require('./helpers'),{fakeClock}=require('./helpers/deadlineClock');
const config=(clock,signal)=>({deadline:{expires_at_monotonic_ms:150},signal,now:clock.now,schedule:clock.schedule,cancelSchedule:clock.cancelSchedule});
test('reason_replay_never_authenticates_deadline',()=>{
 const clock=fakeClock(),scope=r.createCancellationScope(config(clock));clock.set(150);assert.equal(r.cancellationKindFromSignal(scope.signal),'deadline');
 const replay=new AbortController();replay.abort(scope.signal.reason);assert.equal(r.cancellationKindFromSignal(replay.signal),'user');
 const child=r.createCancellationScope(config(clock,replay.signal));assert.equal(r.cancellationKindFromSignal(child.signal),'user');
 const genuineChild=r.createCancellationScope(config(clock,scope.signal));assert.equal(r.cancellationKindFromSignal(genuineChild.signal),'deadline');assert.equal(genuineChild.signal.reason,scope.signal.reason);
 for(const s of [scope,child,genuineChild])s.dispose();
});
test('authenticated_metadata_ignores_public_mutation_and_other_runtime',()=>{
 const clock=fakeClock(),scope=r.createCancellationScope(config(clock));clock.set(150);r.cancellationKindFromSignal(scope.signal);scope.signal.reason.kind='user';scope.signal.reason.original_reason='forged';assert.equal(r.cancellationKindFromSignal(scope.signal),'deadline');assert.equal(r.cancellationOriginalReason(scope.signal),undefined);
 const forged=new AbortController();forged.abort(new r.ProcessingCancellationError('deadline'));assert.equal(r.cancellationKindFromSignal(forged.signal),'user');
 const root=h.freshArtifactRoot('foreign-deadline');fs.copyFileSync(path.resolve(__dirname,'../out/deadlineCancellation.js'),path.join(root,'deadlineCancellation.js'));const other=require(path.join(root,'deadlineCancellation.js')),foreign=other.createCancellationScope(config(clock));assert.equal(r.cancellationKindFromSignal(foreign.signal),'user');
 scope.dispose();foreign.dispose();
});
test('opaque_falsey_reasons_and_native_getters_are_preserved',()=>{
 for(const original of [false,0,'',null]){const clock=fakeClock(),source=new AbortController();source.abort(original);Object.defineProperty(source.signal,'aborted',{get(){throw Error('own getter executed');}});Object.defineProperty(source.signal,'reason',{get(){throw Error('own reason executed');}});const scope=r.createCancellationScope(config(clock,source.signal));assert.equal(r.cancellationOriginalReason(scope.signal),original);scope.dispose();}
 let getterCalls=0;const reason=Object.defineProperty({},'kind',{get(){getterCalls++;throw Error('untrusted');}}),source=new AbortController();source.abort(reason);assert.equal(r.cancellationKindFromSignal(source.signal),'user');assert.equal(r.cancellationOriginalReason(source.signal),reason);assert.equal(getterCalls,0);
});
