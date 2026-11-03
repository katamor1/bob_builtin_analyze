'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),r=require('../out'),{fakeClock}=require('./helpers/deadlineClock');
test('synchronous_expiry_before_timer_is_observed_by_every_public_checkpoint',()=>{
 for(const check of [s=>s.throwIfCancelled(),s=>s.remainingMilliseconds(),s=>r.cancellationKindFromSignal(s.signal),s=>r.cancellationOriginalReason(s.signal)]){
  const clock=fakeClock(),scope=r.createCancellationScope({deadline:{expires_at_monotonic_ms:150},now:clock.now,schedule:clock.schedule,cancelSchedule:clock.cancelSchedule});assert.equal(scope.signal.aborted,false);clock.set(150);
  try{check(scope);}catch(e){assert.equal(e.code,'processing_cancelled');assert.equal(e.kind,'deadline');}assert.equal(scope.signal.aborted,true);assert.equal(r.cancellationKindFromSignal(scope.signal),'deadline');scope.dispose();
 }
});
test('disposed_scope_refreshes_without_live_timer',()=>{
 const clock=fakeClock(),source=new AbortController(),scope=r.createCancellationScope({deadline:{expires_at_monotonic_ms:150},signal:source.signal,now:clock.now,schedule:clock.schedule,cancelSchedule:clock.cancelSchedule});
 scope.dispose();scope.dispose();assert.equal(clock.pending.size,0);assert.equal(clock.cancelled.length,1);assert.equal(scope.signal.aborted,false);clock.set(150);assert.throws(()=>scope.throwIfCancelled(),e=>e.kind==='deadline');
 const next=fakeClock(),original=new Error('after dispose'),operator=new AbortController(),borrowed=r.createCancellationScope({deadline:{expires_at_monotonic_ms:150},signal:operator.signal,now:next.now,schedule:next.schedule,cancelSchedule:next.cancelSchedule});borrowed.dispose();operator.abort(original);assert.equal(r.cancellationOriginalReason(borrowed.signal),original);assert.equal(r.cancellationKindFromSignal(borrowed.signal),'user');
});
